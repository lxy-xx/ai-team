import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Scheduler } from "../src/interfaces/scheduler/scheduler.js";
import { createSystem } from "../src/system.js";
import { shouldRecoverInterruptedRuns } from "../src/interfaces/cli/index-cli.js";
import { EngineStore } from "../src/team-engine/infrastructure/engine-store.js";

test("Scheduler ticks TeamEngine", async () => {
  let ticked = 0;
  const scheduler = new Scheduler({
    engine: {
      async tick() {
        ticked += 1;
        return { processed: 2 };
      }
    },
    logger: { info() {}, error() {} },
    pollIntervalMs: 1000
  });

  const result = await scheduler.processOnce();

  assert.deepEqual(result, { processed: true, engine: true, count: 2, reason: undefined });
  assert.equal(ticked, 1);
});

test("Scheduler wraps an empty TeamEngine tick with count and reason", async () => {
  const scheduler = new Scheduler({
    engine: {
      async tick() {
        return { processed: 0, reason: "empty" };
      }
    },
    logger: { info() {}, error() {} },
    pollIntervalMs: 1000
  });

  const result = await scheduler.processOnce();

  assert.deepEqual(result, { processed: false, engine: true, count: 0, reason: "empty" });
});

test("Scheduler allows overlapping TeamEngine ticks to let Engine claim independent work", async () => {
  let releaseFirst;
  let tickCalls = 0;
  const scheduler = new Scheduler({
    engine: {
      async tick() {
        tickCalls += 1;
        if (tickCalls === 1) {
          await new Promise((resolve) => {
            releaseFirst = resolve;
          });
          return { processed: 1 };
        }
        return { processed: 1 };
      }
    },
    logger: { info() {}, error() {} },
    pollIntervalMs: 1000
  });

  const first = scheduler.processOnce();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = await scheduler.processOnce();
  releaseFirst();
  await first;

  assert.deepEqual(second, { processed: true, engine: true, count: 1, reason: undefined });
  assert.equal(tickCalls, 2);
});

test("Scheduler feedback scan delegates creation to TeamEngine when available", async () => {
  const created = [];
  const scheduler = new Scheduler({
    engine: {
      async readModel() {
        return { feedback: [] };
      },
      async createFeedback(input) {
        created.push(input);
        return { id: `feedback_${created.length}`, ...input };
      }
    },
    memory: {
      async recentEvents() {
        return [
          {
            type: "task_received",
            channel: "feishu",
            threadId: "thread_1",
            userId: "user_1",
            taskId: "task_1",
            text: "希望导出按钮更明显"
          },
          {
            type: "engine_intent_created",
            channel: "feishu",
            threadId: "thread_2",
            userId: "user_2",
            intentId: "intent_2",
            text: "能不能增加批量导入"
          },
          {
            type: "task_received",
            channel: "cli",
            threadId: "cli",
            text: "feedback from local smoke test"
          }
        ];
      }
    },
    logger: { info() {}, error() {} },
    pollIntervalMs: 1000
  });

  const additions = await scheduler.scanFeedback();

  assert.equal(additions.length, 2);
  assert.equal(created.length, 2);
  assert.equal(created[0].text, "希望导出按钮更明显");
  assert.equal(created[0].source.channel, "feishu");
  assert.equal(created[0].source.threadId, "thread_1");
  assert.equal(created[0].linkedTaskId, "task_1");
  assert.equal(created[0].priority, "untriaged");
  assert.equal(created[1].text, "能不能增加批量导入");
  assert.equal(created[1].source.threadId, "thread_2");
  assert.equal(created[1].linkedIntentId, "intent_2");
  assert.equal(created[1].linkedTaskId, undefined);
});

test("Scheduler reports unavailable when TeamEngine is missing", async () => {
  const scheduler = new Scheduler({
    logger: { info() {}, error() {} },
    pollIntervalMs: 1000
  });

  const result = await scheduler.processOnce();

  assert.deepEqual(result, { processed: false, engine: false, reason: "engine_unavailable" });
});

test("createSystem wires Scheduler and ChannelGateway to the TeamEngine", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-system-engine-"));
  const agentWorkspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-system-agent-workspace-"));
  const previousDataDir = process.env.AI_TEAM_DATA_DIR;
  const previousAgentWorkspaceDir = process.env.AI_TEAM_AGENT_WORKSPACE_DIR;
  const previousProjectWorkspaceRoot = process.env.AI_TEAM_PROJECT_WORKSPACE_ROOT;
  const previousRunner = process.env.AI_TEAM_RUNNER;
  const previousProvider = process.env.AI_TEAM_PROVIDER;
  process.env.AI_TEAM_DATA_DIR = dataDir;
  process.env.AI_TEAM_AGENT_WORKSPACE_DIR = agentWorkspaceDir;
  process.env.AI_TEAM_PROJECT_WORKSPACE_ROOT = path.join(dataDir, "project-workspaces");
  process.env.AI_TEAM_RUNNER = "mock";
  process.env.AI_TEAM_PROVIDER = "mock";
  try {
    const system = await createSystem();

    assert.ok(system.engine);
    assert.equal(system.scheduler.engine, system.engine);
    assert.equal(system.channelGateway.engine, system.engine);
  } finally {
    restoreEnv("AI_TEAM_DATA_DIR", previousDataDir);
    restoreEnv("AI_TEAM_AGENT_WORKSPACE_DIR", previousAgentWorkspaceDir);
    restoreEnv("AI_TEAM_PROJECT_WORKSPACE_ROOT", previousProjectWorkspaceRoot);
    restoreEnv("AI_TEAM_RUNNER", previousRunner);
    restoreEnv("AI_TEAM_PROVIDER", previousProvider);
  }
});

test("read-only engine CLI commands skip interrupted run recovery", async () => {
  assert.equal(shouldRecoverInterruptedRuns("engine", ["health"]), false);
  assert.equal(shouldRecoverInterruptedRuns("engine", ["intents"]), false);
  assert.equal(shouldRecoverInterruptedRuns("engine", ["tasks"]), false);
  assert.equal(shouldRecoverInterruptedRuns("engine", ["runs"]), false);
  assert.equal(shouldRecoverInterruptedRuns("engine", ["tick"]), true);

  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-readonly-engine-"));
  const agentWorkspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-readonly-agent-workspace-"));
  const store = new EngineStore({ dataDir, projectWorkspaceRoot: path.join(dataDir, "project-workspaces") });
  await store.init();
  const intent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "read only should not recover",
    acceptanceCriteria: []
  });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Running task",
    description: "This should stay running for readonly CLI.",
    dependencies: [],
    acceptanceCriteria: []
  });
  await store.transitionEntity({
    entityType: "task",
    entityId: task.id,
    status: "working",
    agentRole: "engineer",
    reason: "test setup"
  });
  const run = await store.createRun({
    entityType: "task",
    entityId: task.id,
    agentRole: "engineer",
    sessionKey: "sess_readonly_1",
    runner: "openai_compatible",
    provider: "provider",
    model: "model-a"
  });

  const previousDataDir = process.env.AI_TEAM_DATA_DIR;
  const previousAgentWorkspaceDir = process.env.AI_TEAM_AGENT_WORKSPACE_DIR;
  const previousProjectWorkspaceRoot = process.env.AI_TEAM_PROJECT_WORKSPACE_ROOT;
  const previousRunner = process.env.AI_TEAM_RUNNER;
  const previousProvider = process.env.AI_TEAM_PROVIDER;
  process.env.AI_TEAM_DATA_DIR = dataDir;
  process.env.AI_TEAM_AGENT_WORKSPACE_DIR = agentWorkspaceDir;
  process.env.AI_TEAM_PROJECT_WORKSPACE_ROOT = path.join(dataDir, "project-workspaces");
  process.env.AI_TEAM_RUNNER = "mock";
  process.env.AI_TEAM_PROVIDER = "mock";
  try {
    const system = await createSystem({ recoverInterruptedRuns: false });
    assert.equal((await system.engineStore.getRun(run.id)).status, "running");
    assert.equal((await system.engineStore.getTask(task.id)).status, "working");
  } finally {
    restoreEnv("AI_TEAM_DATA_DIR", previousDataDir);
    restoreEnv("AI_TEAM_AGENT_WORKSPACE_DIR", previousAgentWorkspaceDir);
    restoreEnv("AI_TEAM_PROJECT_WORKSPACE_ROOT", previousProjectWorkspaceRoot);
    restoreEnv("AI_TEAM_RUNNER", previousRunner);
    restoreEnv("AI_TEAM_PROVIDER", previousProvider);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
