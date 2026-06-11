import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EngineBus } from "../src/team-engine/infrastructure/engine-bus.js";
import { TeamEngine } from "../src/team-engine/application/team-engine.js";
import { EngineRoutingStore } from "../src/team-engine/infrastructure/routing-store.js";
import { onboardDefaultTeamRouting } from "../src/team-engine/infrastructure/default-team-onboarding.js";
import { EngineStore } from "../src/team-engine/infrastructure/engine-store.js";
import { WorkerEngine } from "../src/team-engine/adapters/agent-framework/worker-engine.js";
import { AgentRuntime } from "../src/agent-framework/application/agent-runtime.js";
import { AgentConfigStore } from "../src/agent-framework/infrastructure/agent-config-store.js";
import { onboardDefaultAgentProfiles } from "../src/agent-framework/infrastructure/default-agent-onboarding.js";
import { ToolRegistry } from "../src/agent-framework/domain/tools/tool-registry.js";
import { MemoryStore } from "../src/agent-framework/infrastructure/memory-store.js";
import { mockRoleOutput } from "../src/team-engine/adapters/agent-framework/mock-outputs.js";
import { MockSubagentRunner } from "../src/agent-framework/infrastructure/provider/runners/mock-runner.js";
import { OnboardingStateStore } from "../src/platform/onboarding-state-store.js";

const droppedConfigFields = ["miss" + "ion", "ali" + "as"];

function assertNoDroppedConfigFields(value) {
  for (const field of droppedConfigFields) assert.equal(field in value, false);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 500, intervalMs = 5 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await delay(intervalMs);
  }
  return false;
}

function agentRuntimeStub(output, { tools = [] } = {}) {
  return {
    async profileForRole() {
      return undefined;
    },
    toolManifestForRun() {
      return tools;
    },
    async run(input) {
      return typeof output === "function" ? output(input) : output;
    }
  };
}

function engineerOutputProfile() {
  return {
    role: "engineer",
    name: "engineer",
    title: "engineer",
    prompt: "",
    tools: [],
    skills: [],
    mcps: [],
    output: {
      artifactKind: "implementation_report",
      transcriptPrefix: "Implementation completed.\n"
    }
  };
}

function agentRuntimeProfileStub(profile, { tools = [] } = {}) {
  return {
    formatSpecialistContext() {
      return "memory";
    },
    async profileForRole() {
      return profile;
    },
    toolManifestForRun() {
      return tools;
    },
    toolManifest() {
      return tools;
    }
  };
}

async function onboardingStateStoreFor(dataDir) {
  const onboardingStateStore = new OnboardingStateStore({ dataDir });
  await onboardingStateStore.init();
  return onboardingStateStore;
}

async function onboardProfilesOnce(agentConfigStore, dataDir) {
  return onboardDefaultAgentProfiles({
    agentConfigStore,
    onboardingStateStore: await onboardingStateStoreFor(dataDir)
  });
}

async function onboardRoutingOnce(routingStore, dataDir) {
  return onboardDefaultTeamRouting({
    routingStore,
    onboardingStateStore: await onboardingStateStoreFor(dataDir)
  });
}

async function setupEngineTask(prefix = "ai-team-worker-engine-") {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const store = new EngineStore({ dataDir });
  const bus = new EngineBus({ dataDir });
  await store.init();
  await bus.init();

  const intent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "build worker engine",
    acceptanceCriteria: []
  });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Build worker engine",
    description: "Create worker execution.",
    consumerRole: "engineer",
    dependencies: [],
    acceptanceCriteria: []
  });

  return { dataDir, store, bus, intent, task };
}

async function createMockEngine() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-team-engine-"));
  const projectWorkspaceRoot = path.join(dataDir, "project-workspaces");
  const store = new EngineStore({ dataDir, projectWorkspaceRoot });
  const bus = new EngineBus({ dataDir });
  const routingStore = new EngineRoutingStore({ dataDir });
  await store.init();
  await bus.init();
  await routingStore.init();
  await onboardRoutingOnce(routingStore, dataDir);
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: { formatSpecialistContext() { return "memory"; }, toolManifest() { return []; } },
    provider: { id: "mock" },
    config: {
      workspace: dataDir,
      projectWorkspaceRoot,
      runner: { type: "mock" },
      provider: { id: "mock" }
    },
    logger: { info() {}, error() {} }
  });
  const engine = new TeamEngine({
    store,
    bus,
    worker,
    config: { workspace: dataDir, projectWorkspaceRoot, runner: { type: "mock" }, provider: { id: "mock" } },
    memory: { recordEvent() {}, rememberTaskResult() {} },
    outboundReplyService: { async send() { return { status: "sent" }; } },
    logger: { info() {}, error() {}, warn() {} },
    routingStore
  });
  return { engine, store, dataDir };
}

test("EngineBus writes inbox and outbox envelopes by role", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-bus-"));
  const bus = new EngineBus({ dataDir });
  await bus.init();

  const inbox = await bus.writeInbox({
    role: "product_manager",
    entityType: "intent",
    entityId: "intent_1",
    runId: "run_1",
    payload: { goal: "build" }
  });
  const outbox = await bus.writeOutbox({
    role: "product_manager",
    entityType: "intent",
    entityId: "intent_1",
    runId: "run_1",
    payload: { ok: true }
  });

  assert.equal((await fs.stat(inbox)).isFile(), true);
  assert.equal((await fs.stat(outbox)).isFile(), true);
  const inboxEnvelope = JSON.parse(await fs.readFile(inbox, "utf8"));
  const outboxEnvelope = JSON.parse(await fs.readFile(outbox, "utf8"));
  assert.equal(typeof inboxEnvelope.createdAt, "string");
  assert.equal(typeof outboxEnvelope.createdAt, "string");
  assert.deepEqual(inboxEnvelope, {
    role: "product_manager",
    entityType: "intent",
    entityId: "intent_1",
    runId: "run_1",
    createdAt: inboxEnvelope.createdAt,
    payload: { goal: "build" }
  });
  assert.deepEqual(outboxEnvelope, {
    role: "product_manager",
    entityType: "intent",
    entityId: "intent_1",
    runId: "run_1",
    createdAt: outboxEnvelope.createdAt,
    payload: { ok: true }
  });
});

test("TeamEngine constructor does not retain AgentConfigStore", async () => {
  const { engine } = await createMockEngine();

  assert.equal(Object.hasOwn(engine, "agentConfigStore"), false);
});

test("EngineBus rejects unknown roles without writing outside role dirs", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-bus-"));
  const bus = new EngineBus({ dataDir });
  await bus.init();

  await assert.rejects(
    () =>
      bus.writeInbox({
        role: "..",
        entityType: "intent",
        entityId: "intent_1",
        runId: "run_1",
        payload: { goal: "escape" }
      }),
    /invalid engine bus role: \.\./
  );
  await assert.rejects(
    () =>
      bus.writeOutbox({
        role: ".",
        entityType: "intent",
        entityId: "intent_1",
        runId: "run_1",
        payload: { goal: "escape" }
      }),
    /invalid engine bus role: \./
  );

  await assert.rejects(fs.stat(path.join(dataDir, "engine", "agents", "inbox", "intent_1.run_1.json")), {
    code: "ENOENT"
  });
  await assert.rejects(fs.stat(path.join(dataDir, "engine", "agents", "outbox", "intent_1.run_1.json")), {
    code: "ENOENT"
  });
});

test("EngineBus sanitizes entity and run ids into the expected role box directories", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-bus-"));
  const bus = new EngineBus({ dataDir });
  await bus.init();

  const inbox = await bus.writeInbox({
    role: "product_manager",
    entityType: "intent",
    entityId: "../x",
    runId: "../y",
    payload: { goal: "sanitize inbox" }
  });
  const outbox = await bus.writeOutbox({
    role: "product_manager",
    entityType: "intent",
    entityId: "../x",
    runId: "../y",
    payload: { goal: "sanitize outbox" }
  });

  assert.ok(inbox.includes("/engine/agents/product_manager/inbox/"));
  assert.ok(outbox.includes("/engine/agents/product_manager/outbox/"));
  assert.equal((await fs.stat(inbox)).isFile(), true);
  assert.equal((await fs.stat(outbox)).isFile(), true);
});

test("TeamEngine creates, updates, links, and completes feedback with best-effort memory", async () => {
  const { engine, store } = await createMockEngine();
  const events = [];
  const warnings = [];
  engine.memory = {
    async recordEvent(event) {
      events.push(event);
      if (event.type === "engine_feedback_updated" && event.status === "done") {
        throw new Error("memory unavailable");
      }
    }
  };
  engine.logger = { warn(entry) { warnings.push(entry); }, error(entry) { warnings.push(entry); } };

  const feedback = await engine.createFeedback({
    source: { channel: "feishu", threadId: "oc_1", userId: "ou_1" },
    text: "希望这个功能改一下",
    priority: "medium",
    intentId: "intent_feedback_link",
    taskId: "task_feedback_link"
  });

  const triaged = await engine.updateFeedback(feedback.id, { status: "triaged" });
  const linked = await engine.updateFeedback(feedback.id, {
    status: "linked_to_task",
    linkedIntentId: "intent_1",
    linkedTaskId: "task_1"
  });
  const done = await engine.updateFeedback(feedback.id, { status: "done" });
  const model = await store.readModel();

  assert.equal(feedback.source.threadId, "oc_1");
  assert.equal(feedback.text, "希望这个功能改一下");
  assert.equal(feedback.priority, "medium");
  assert.equal(feedback.linkedIntentId, "intent_feedback_link");
  assert.equal(feedback.linkedTaskId, "task_feedback_link");
  assert.equal(triaged.status, "triaged");
  assert.equal(linked.linkedIntentId, "intent_1");
  assert.equal(linked.linkedTaskId, "task_1");
  assert.equal(done.status, "done");
  assert.equal(model.feedback.length, 1);
  assert.equal(model.feedback[0].linkedTaskId, "task_1");
  assert.deepEqual(events.map((event) => event.type), [
    "engine_feedback_created",
    "engine_feedback_updated",
    "engine_feedback_updated",
    "engine_feedback_updated"
  ]);
  assert.ok(warnings.some((entry) => entry.phase === "feedback_memory" && entry.feedbackId === feedback.id));
});

test("TeamEngine feedback update requires an id", async () => {
  const { engine } = await createMockEngine();

  await assert.rejects(() => engine.updateFeedback(undefined, { status: "triaged" }), /feedback id is required/);
});

test("TeamEngine persists intent when memory event recording fails", async () => {
  const { engine, store } = await createMockEngine();
  const warnings = [];
  engine.memory = {
    async recordEvent() {
      throw new Error("memory unavailable");
    }
  };
  engine.logger = { warn(entry) { warnings.push(entry); }, error(entry) { warnings.push(entry); } };

  const { intent, created } = await engine.createIntentFromMessage({
    channel: "feishu",
    transport: "websocket",
    threadId: "thread_1",
    userId: "user_1",
    text: "希望导出按钮更明显"
  });

  assert.equal(created, true);
  assert.equal((await store.getIntent(intent.id)).goal, "希望导出按钮更明显");
  assert.ok(warnings.some((entry) => entry.phase === "intent_memory" && entry.intentId === intent.id));
});

test("TeamEngine associates new intents with a project and default project workspace", async () => {
  const { engine, store, dataDir } = await createMockEngine();
  engine.config.projectWorkspaceRoot = path.join(dataDir, "project-workspaces");

  const { intent, created } = await engine.createIntentFromMessage({
    channel: "feishu",
    transport: "websocket",
    threadId: "oc_1",
    userId: "ou_1",
    text: "让 Dashboard 的看板支持项目归属",
    projectName: "AI Team Dashboard"
  });

  assert.equal(created, true);
  assert.equal(intent.projectName, "AI Team Dashboard");
  assert.equal(intent.context.projectName, "AI Team Dashboard");
  assert.equal(intent.workspace, path.join(dataDir, "project-workspaces", "ai-team-dashboard"));
  assert.equal(intent.context.workspace, intent.workspace);
  await fs.access(intent.workspace);

  const projects = await store.listProjects();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, intent.projectId);
  assert.equal(projects[0].workspace, intent.workspace);
});

test("TeamEngine asks CEO to diagnose blocked intents before replying through the channel path", async () => {
  const { engine, store } = await createMockEngine();
  const sent = [];
  engine.outboundReplyService = {
    async send(task, message, options) {
      sent.push({ task, message, options });
      return { status: "sent", message };
    }
  };
  const intent = await store.createIntent({
    goal: "修复飞书回复失败",
    source: { channel: "feishu", threadId: "oc_1", userId: "ou_1" },
    replyTarget: { chatId: "oc_1", messageId: "om_1" }
  });

  await engine.blockIntent(intent.id, {
    phase: "verification",
    reason: "Verification worker failed",
    message: "model API exited with 400"
  }, "qa");

  const updated = await store.getIntent(intent.id);
  assert.equal(updated.status, "blocked");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].task.channel, "feishu");
  assert.deepEqual(sent[0].task.replyTarget, { chatId: "oc_1", messageId: "om_1" });
  assert.equal(sent[0].options.source, "ceo_blocker_diagnosis");
  assert.match(sent[0].message, /阻塞诊断流程/);
  assert.match(sent[0].message, /修复飞书回复失败/);
  assert.match(sent[0].message, /model API exited with 400/);
  assert.equal(updated.context.blockerNotification.source, "ceo_blocker_diagnosis");
  assert.equal(updated.context.blockerNotification.diagnosisTraceId, `mock_blocker_${intent.id}`);

  await engine.blockIntent(intent.id, { reason: "Still blocked", message: "same issue" }, "qa");
  assert.equal(sent.length, 1);
});

test("TeamEngine retries skipped CEO blocker reports after reply target repair", async () => {
  const { engine, store } = await createMockEngine();
  const sent = [];
  engine.outboundReplyService = {
    async send(task, message, options) {
      sent.push({ task, message, options });
      if (sent.length === 1) return { status: "skipped", reason: "missing reply target" };
      return { status: "sent", message };
    }
  };
  const intent = await store.createIntent({
    goal: "修复阻塞通知",
    source: { channel: "feishu", threadId: "oc_1", userId: "ou_1" },
    replyTarget: { channel: "feishu", threadId: "oc_1", userId: "ou_1" }
  });

  await engine.blockIntent(intent.id, { reason: "task blocked" }, "engine");

  const skippedIntent = await store.getIntent(intent.id);
  assert.equal(sent.length, 1);
  assert.equal(skippedIntent.context.blockerNotification.status, "skipped");
  assert.equal(skippedIntent.context.blockerNotification.source, "ceo_blocker_diagnosis");
  assert.equal(skippedIntent.context.blockerNotification.reason, "missing reply target");

  await store.updateIntent(intent.id, {
    replyTarget: { chatId: "oc_1", messageId: "om_1" }
  });
  await engine.notifyCeoOfBlockedIntent(await store.getIntent(intent.id), { reason: "task blocked" }, "engine");

  const repairedIntent = await store.getIntent(intent.id);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].task.replyTarget, { chatId: "oc_1", messageId: "om_1" });
  assert.equal(sent[1].options.source, "ceo_blocker_diagnosis");
  assert.equal(repairedIntent.context.blockerNotification.status, "sent");
});

test("TeamEngine retries blocked verification tasks and reopens the parent intent", async () => {
  const { engine, store } = await createMockEngine();
  const intent = await store.createIntent({
    goal: "修复被阻塞的验证任务",
    source: { channel: "feishu", threadId: "oc_1", userId: "ou_1" },
    context: { ownerNote: "keep this" }
  });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Run QA again",
    description: "The previous QA model call failed.",
    producerRole: "product_manager",
    consumerRole: "engineer"
  });
  await store.transitionEntity({
    entityType: "intent",
    entityId: intent.id,
    status: "in_progress",
    agentRole: "product_manager",
    reason: "task graph ready"
  });
  await store.transitionEntity({
    entityType: "task",
    entityId: task.id,
    status: "testing",
    agentRole: "engineer",
    reason: "implementation ready for verification"
  });
  await engine.blockTask(task.id, {
    phase: "verification",
    reason: "Verification worker failed",
    message: "model API exited with 400"
  }, "qa");
  await engine.blockIntent(intent.id, {
    phase: "task_blocked",
    reason: "task blocked",
    blockedTaskIds: [task.id]
  }, "engine");
  await store.updateIntent(intent.id, {
    context: {
      ownerNote: "keep this",
      blockerNotification: { source: "ceo_blocker_report", sentAt: "2026-05-24T10:00:00.000Z" }
    }
  });

  const result = await engine.retryBlockedWork({
    entityType: "task",
    entityId: task.id,
    agentRole: "ceo_cto",
    reason: "CEO requested retry"
  });

  const retriedTask = await store.getTask(task.id);
  const reopenedIntent = await store.getIntent(intent.id);
  assert.equal(result.retried, true);
  assert.equal(result.entityType, "task");
  assert.equal(result.retryStatus, "testing");
  assert.equal(retriedTask.status, "testing");
  assert.equal(retriedTask.blocked, undefined);
  assert.equal(retriedTask.blockedAt, undefined);
  assert.equal(retriedTask.operations.at(-1).agentRole, "ceo_cto");
  assert.equal(retriedTask.operations.at(-1).fromStatus, "blocked");
  assert.equal(retriedTask.operations.at(-1).toStatus, "testing");
  assert.equal(reopenedIntent.status, "in_progress");
  assert.equal(reopenedIntent.blocked, undefined);
  assert.equal(reopenedIntent.blockedAt, undefined);
  assert.deepEqual(reopenedIntent.context, { ownerNote: "keep this" });
});

test("TeamEngine reopens task-blocked intents when child tasks are no longer blocked", async () => {
  const { engine, store } = await createMockEngine();
  const intent = await store.createIntent({
    goal: "完成曾经阻塞的工作",
    source: { channel: "cli", threadId: "cli", userId: "local" }
  });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Finish implementation",
    description: "The task was blocked and later repaired.",
    producerRole: "product_manager"
  });
  await store.transitionEntity({
    entityType: "intent",
    entityId: intent.id,
    status: "in_progress",
    agentRole: "product_manager",
    reason: "task graph ready"
  });
  await engine.blockTask(task.id, {
    phase: "implementation",
    reason: "implementation blocked"
  }, "engineer");
  await engine.blockIntent(intent.id, {
    phase: "task_blocked",
    reason: "task blocked",
    blockedTaskIds: [task.id]
  }, "engine");
  await store.transitionEntity({
    entityType: "task",
    entityId: task.id,
    status: "done",
    agentRole: "engineer",
    reason: "manual repair completed",
    patch: { blocked: undefined, blockedAt: undefined }
  });
  engine.worker.runIntent = async () => ({
    run: { id: "run_finalize_reopened" },
    artifact: {
      id: "artifact_finalize_reopened",
      data: { kind: "final_report", message: "All repaired tasks are done." }
    }
  });

  const processed = await engine.finalizeCompletedIntents();
  const completed = await store.getIntent(intent.id);

  assert.equal(processed, 1);
  assert.equal(completed.status, "done");
  assert.equal(completed.blocked, undefined);
  assert.equal(completed.blockedAt, undefined);
  assert.equal(completed.finalSummary, "All repaired tasks are done.");
});

test("TeamEngine retries blocked planner intents back to new", async () => {
  const { engine, store } = await createMockEngine();
  const intent = await store.createIntent({
    goal: "重新规划失败的意图",
    source: { channel: "feishu", threadId: "oc_1", userId: "ou_1" }
  });
  await engine.blockIntent(intent.id, {
    phase: "intent_consumer",
    reason: "Intent consumer failed",
    message: "planner model failed"
  }, "product_manager");

  const result = await engine.retryBlockedWork({
    entityType: "intent",
    entityId: intent.id,
    agentRole: "ceo_cto",
    reason: "CEO requested planning retry"
  });

  const retriedIntent = await store.getIntent(intent.id);
  assert.equal(result.retried, true);
  assert.equal(result.entityType, "intent");
  assert.equal(result.retryStatus, "new");
  assert.equal(retriedIntent.status, "new");
  assert.equal(retriedIntent.blocked, undefined);
  assert.equal(retriedIntent.blockedAt, undefined);
  assert.equal(retriedIntent.operations.at(-1).agentRole, "ceo_cto");
  assert.equal(retriedIntent.operations.at(-1).fromStatus, "blocked");
  assert.equal(retriedIntent.operations.at(-1).toStatus, "new");
});

test("TeamEngine asks the CEO worker to decide whether channel messages create intents", async () => {
  const { engine } = await createMockEngine();
  let workerInput;
  engine.worker = {
    async runChannelMessage(input) {
      workerInput = input;
      return {
        finalText: "收到，我会把它作为工作推进。",
        trace: {
          toolCalls: [
            {
              toolId: "engine.create_intent",
              status: "completed",
              output: {
                intent: { id: "intent_from_ceo", goal: input.message.text },
                task: { id: "intent_from_ceo", text: input.message.text },
                created: true,
                ignored: false
              }
            }
          ]
        }
      };
    }
  };

  const result = await engine.deliverChannelMessageToCeo({
    channel: "feishu",
    source: "feishu_ws",
    transport: "feishu_websocket",
    threadId: "oc_1",
    userId: "ou_1",
    userName: "founder",
    eventId: "om_1",
    text: "把 Dashboard 支持中英文切换",
    replyTarget: { chatId: "oc_1", messageId: "om_1" }
  });

  assert.equal(workerInput.role, "ceo_cto");
  assert.equal(workerInput.message.text, "把 Dashboard 支持中英文切换");
  assert.equal(workerInput.message.channel, "feishu");
  assert.equal(workerInput.message.replyTarget.messageId, "om_1");
  assert.equal(result.intent.id, "intent_from_ceo");
  assert.equal(result.task.id, "intent_from_ceo");
  assert.equal(result.created, true);
  assert.equal(result.directAgentTurn, true);
});

test("TeamEngine replies conversationally when CEO does not create an intent", async () => {
  const { engine } = await createMockEngine();
  const replies = [];
  engine.worker = {
    async runChannelMessage() {
      return {
        finalText: "我是 Franklin，AI Team 的 CEO/CTO 入口。",
        trace: { toolCalls: [] }
      };
    }
  };
  engine.outboundReplyService = {
    async send(task, message, options) {
      replies.push({ task, message, options });
      return { status: "sent", message };
    }
  };

  const result = await engine.deliverChannelMessageToCeo({
    channel: "feishu",
    source: "feishu_ws",
    transport: "feishu_websocket",
    threadId: "oc_1",
    userId: "ou_1",
    text: "你叫什么名字？",
    replyTarget: { chatId: "oc_1", messageId: "om_1" }
  });

  assert.equal(result.intent, undefined);
  assert.equal(result.created, false);
  assert.equal(result.directAgentTurn, true);
  assert.equal(result.finalText, "我是 Franklin，AI Team 的 CEO/CTO 入口。");
  assert.equal(replies.length, 1);
  assert.equal(replies[0].task.channel, "feishu");
  assert.equal(replies[0].task.threadId, "oc_1");
  assert.deepEqual(replies[0].task.replyTarget, { chatId: "oc_1", messageId: "om_1" });
  assert.equal(replies[0].message, "我是 Franklin，AI Team 的 CEO/CTO 入口。");
  assert.equal(replies[0].options.source, "ceo_direct_reply");
});

test("TeamEngine does not send duplicate direct replies for repeated channel events", async () => {
  const { engine } = await createMockEngine();
  let workerCalls = 0;
  const replies = [];
  engine.worker = {
    async runChannelMessage() {
      workerCalls += 1;
      return {
        finalText: "我是 Franklin，AI Team 的 CEO/CTO 入口。",
        trace: { toolCalls: [] }
      };
    }
  };
  engine.outboundReplyService = {
    async send(task, message, options) {
      replies.push({ task, message, options });
      return { status: "sent", message, messageId: `reply_${replies.length}` };
    }
  };
  const input = {
    channel: "feishu",
    source: "feishu_ws",
    transport: "feishu_websocket",
    threadId: "oc_1",
    userId: "ou_1",
    eventId: "om_duplicate",
    text: "你叫什么名字？",
    replyTarget: { chatId: "oc_1", messageId: "om_duplicate" }
  };

  const first = await engine.deliverChannelMessageToCeo(input);
  const second = await engine.deliverChannelMessageToCeo(input);

  assert.equal(workerCalls, 1);
  assert.equal(replies.length, 1);
  assert.equal(first.reply.messageId, "reply_1");
  assert.equal(second.duplicate, true);
  assert.equal(second.reason, "duplicate_channel_message");
  assert.equal(second.finalText, "我是 Franklin，AI Team 的 CEO/CTO 入口。");
});

test("WorkerEngine channel CEO assignment uses configured profile display name", async () => {
  const runtimeCalls = [];
  const worker = new WorkerEngine({
    agentRuntime: {
      async profileForRole(role) {
        return { role, name: "Franklin", modelProvider: { providerId: "provider", model: "model-a" } };
      },
      async run(input) {
        runtimeCalls.push(input);
        return { finalText: "ok", sessionId: input.sessionId, trace: { traceId: "trace_ceo_channel" } };
      }
    },
    provider: {
      async resolveTurnConfig(selection = {}) {
        return {
          providerId: selection.providerId || "provider",
          runner: "openai_compatible",
          model: selection.model || "model-a",
          provider: { id: selection.providerId || "provider", type: "openai_compatible", runner: "openai_compatible" }
        };
      }
    },
    config: { runner: { type: "openai_compatible" }, provider: { id: "provider" } },
    logger: { info() {}, warn() {}, error() {} }
  });

  await worker.runChannelMessage({
    message: {
      channel: "feishu",
      threadId: "oc_1",
      userId: "ou_1",
      text: "你好"
    }
  });

  assert.equal(runtimeCalls.length, 1);
  assert.equal(runtimeCalls[0].agentName, "Franklin");
  assert.match(runtimeCalls[0].inputText, /Franklin（AI Team CEO\/CTO 入口）/);
});

test("WorkerEngine blocked diagnosis runs CEO runtime with blocker skill guidance", async () => {
  const runtimeCalls = [];
  const worker = new WorkerEngine({
    agentRuntime: {
      async profileForRole(role) {
        return { role, name: "Franklin", modelProvider: { providerId: "provider", model: "model-a" } };
      },
      async run(input) {
        runtimeCalls.push(input);
        return {
          finalText: "诊断完成：QA 输出缺少顶层 verdict。",
          sessionId: input.sessionId,
          trace: { traceId: "trace_blocker_diagnosis", toolCalls: [{ toolId: "skill", status: "completed" }] }
        };
      }
    },
    provider: {
      async resolveTurnConfig(selection = {}) {
        return {
          providerId: selection.providerId || "provider",
          runner: "openai_compatible",
          model: selection.model || "model-a",
          provider: { id: selection.providerId || "provider", type: "openai_compatible", runner: "openai_compatible" }
        };
      }
    },
    config: { runner: { type: "openai_compatible" }, provider: { id: "provider" }, workspace: "/control/repo" },
    logger: { info() {}, warn() {}, error() {} }
  });

  const result = await worker.runBlockedIntentDiagnosis({
    intent: {
      id: "intent_blocked",
      status: "blocked",
      goal: "修复任务阻塞",
      source: { channel: "feishu", threadId: "oc_1", userId: "ou_1" },
      replyTarget: { chatId: "oc_1", messageId: "om_1" }
    },
    blocked: { reason: "task blocked" },
    agentRole: "engine"
  });

  assert.equal(result.finalText, "诊断完成：QA 输出缺少顶层 verdict。");
  assert.equal(runtimeCalls.length, 1);
  assert.equal(runtimeCalls[0].agentName, "Franklin");
  assert.equal(runtimeCalls[0].purpose, "ceo_blocker_diagnosis");
  assert.match(runtimeCalls[0].inputText, /blocker-diagnosis/);
  assert.match(runtimeCalls[0].inputText, /不要调用 channel.reply/);
  assert.equal(runtimeCalls[0].hostContext.replyTarget, undefined);
  assert.equal(runtimeCalls[0].hostContext.workspace, "/control/repo");
});

test("WorkerEngine channel CEO identity falls back to a generic role label", async () => {
  const runtimeCalls = [];
  const runtimeProfile = { role: "ceo_cto", name: "ceo_cto", modelProvider: { providerId: "provider", model: "model-a" } };
  const provider = {
    async resolveTurnConfig(selection = {}) {
      return {
        providerId: selection.providerId || "provider",
        runner: "openai_compatible",
        model: selection.model || "model-a",
        provider: { id: selection.providerId || "provider", type: "openai_compatible", runner: "openai_compatible" }
      };
    }
  };
  const nonMockWorker = new WorkerEngine({
    agentRuntime: {
      async profileForRole() {
        return runtimeProfile;
      },
      async run(input) {
        runtimeCalls.push(input);
        return { finalText: "ok", sessionId: input.sessionId, trace: { traceId: "trace_ceo_generic" } };
      }
    },
    provider,
    config: { runner: { type: "openai_compatible" }, provider: { id: "provider" } },
    logger: { info() {}, warn() {}, error() {} }
  });
  const mockWorker = new WorkerEngine({
    agentRuntime: agentRuntimeProfileStub(runtimeProfile),
    provider: { id: "mock" },
    config: { runner: { type: "mock" }, provider: { id: "mock" } },
    logger: { info() {}, warn() {}, error() {} }
  });

  await nonMockWorker.runChannelMessage({
    message: {
      channel: "feishu",
      threadId: "oc_1",
      userId: "ou_1",
      text: "你好"
    }
  });
  const mockResult = await mockWorker.runChannelMessage({
    message: {
      channel: "feishu",
      threadId: "oc_1",
      userId: "ou_1",
      text: "你叫什么名字？"
    }
  });

  assert.match(runtimeCalls[0].inputText, /AI Team CEO\/CTO 入口/);
  assert.equal(mockResult.finalText, "我是 AI Team 的 CEO/CTO 入口。");
  assert.equal(mockResult.trace.agentName, "ceo_cto");
});

test("WorkerEngine records a run, inbox, outbox, and artifact for a task", async () => {
  const { dataDir, store, bus, intent, task } = await setupEngineTask();

  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: agentRuntimeProfileStub(engineerOutputProfile()),
    provider: { id: "mock", async runAgentTurn(input) { return mockRoleOutput(input); } },
    config: { runner: { type: "mock" }, provider: { id: "mock" } },
    logger: { info() {}, error() {} }
  });

  const result = await worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] });

  assert.equal(result.run.status, "completed");
  assert.equal(result.artifact.kind, "implementation_report");
  assert.ok(result.run.transcriptSummary.includes("Implementation completed"));
  assert.ok(result.run.artifactIds.includes(result.artifact.id));

  const storedTask = await store.getTask(task.id);
  assert.ok(storedTask.artifactIds.includes(result.artifact.id));
  assert.ok(storedTask.runIds.includes(result.run.id));

  const inbox = JSON.parse(
    await fs.readFile(path.join(dataDir, "engine", "agents", "engineer", "inbox", `${task.id}.${result.run.id}.json`), "utf8")
  );
  const outbox = JSON.parse(
    await fs.readFile(path.join(dataDir, "engine", "agents", "engineer", "outbox", `${task.id}.${result.run.id}.json`), "utf8")
  );
  assert.equal(inbox.payload.task.id, task.id);
  assert.equal(outbox.payload.artifactId, result.artifact.id);
});

test("WorkerEngine treats tool manifest and audit failures as best-effort", async () => {
  const first = await setupEngineTask("ai-team-worker-engine-audit-manifest-");
  const firstErrors = [];
  let firstProviderCalls = 0;
  const manifestWorker = new WorkerEngine({
    store: first.store,
    bus: first.bus,
    agentRuntime: {
      toolManifestForRun() { throw new Error("manifest unavailable"); },
      async run() {
        firstProviderCalls += 1;
        return {
          finalText: JSON.stringify({ kind: "manifest_best_effort", message: "Provider continued" }),
          sessionId: "sess_manifest",
          trace: { traceId: "trace_manifest" }
        };
      }
    },
    provider: {
      id: "provider",
      async runAgentTurn() {
        throw new Error("provider should be reached only through AgentRuntime.run");
      }
    },
    config: { runner: { type: "provider" }, provider: { id: "provider" } },
    logger: { warn(entry) { firstErrors.push(entry); }, error(entry) { firstErrors.push(entry); } },
    toolAuditLog: { async record() { throw new Error("should not be reached"); } }
  });

  const firstResult = await manifestWorker.runTask({
    role: "engineer",
    intent: first.intent,
    task: first.task,
    previousArtifacts: []
  });

  assert.equal(firstResult.run.status, "completed");
  assert.equal(firstProviderCalls, 1);
  assert.ok(firstErrors.some((entry) => entry.error === "manifest unavailable"));

  const second = await setupEngineTask("ai-team-worker-engine-audit-record-");
  const secondErrors = [];
  let secondProviderCalls = 0;
  const auditWorker = new WorkerEngine({
    store: second.store,
    bus: second.bus,
    agentRuntime: {
      toolManifestForRun() { return []; },
      async run() {
        secondProviderCalls += 1;
        return {
          finalText: JSON.stringify({ kind: "audit_best_effort", message: "Provider continued" }),
          sessionId: "sess_audit",
          trace: { traceId: "trace_audit" }
        };
      }
    },
    provider: {
      id: "provider",
      async runAgentTurn() {
        throw new Error("provider should be reached only through AgentRuntime.run");
      }
    },
    config: { runner: { type: "provider" }, provider: { id: "provider" } },
    logger: { warn(entry) { secondErrors.push(entry); }, error(entry) { secondErrors.push(entry); } },
    toolAuditLog: { async record() { throw new Error("audit unavailable"); } }
  });

  const secondResult = await auditWorker.runTask({
    role: "engineer",
    intent: second.intent,
    task: second.task,
    previousArtifacts: []
  });

  assert.equal(secondResult.run.status, "completed");
  assert.equal(secondProviderCalls, 1);
  assert.ok(secondErrors.some((entry) => entry.error === "audit unavailable"));
});

test("WorkerEngine invokes AgentRuntime with rich Engine assignment context", async () => {
  const { store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-provider-");
  const previousArtifacts = [{ id: "artifact_previous", kind: "note", data: { ok: true } }];
  let runtimeInput;
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: {
      toolManifestForRun() { return []; },
      async run(input) {
        runtimeInput = input;
        return {
          finalText: JSON.stringify({ kind: "custom_report", ok: true }),
          sessionId: "sess_provider_context",
          trace: { traceId: "trace_provider_context" }
        };
      }
    },
    provider: {
      id: "provider",
      async runAgentTurn(input) {
        throw new Error("provider should be reached only through AgentRuntime.run");
      }
    },
    config: { workspace: "/tmp/ai-team-workspace", runner: { type: "provider" }, provider: { id: "provider" } },
    logger: { info() {}, error() {} }
  });

  const result = await worker.runTask({ role: "engineer", intent, task, previousArtifacts });

  assert.equal(result.run.status, "completed");
  assert.equal(result.artifact.kind, "custom_report");
  assert.match(runtimeInput.inputText, new RegExp(intent.id));
  assert.match(runtimeInput.inputText, new RegExp(task.id));
  assert.match(runtimeInput.inputText, /artifact_previous/);
  assert.equal(runtimeInput.hostContext.workspace, task.workspace || intent.workspace || intent.context?.workspace);
});

test("WorkerEngine non-mock path calls AgentRuntime.run with a text assignment", async () => {
  const { store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-runtime-run-");
  const runtimeCalls = [];
  const providerCalls = [];
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: {
      async profileForRole(role) {
        return { role, name: "Ada", prompt: "Ada prompt", modelProvider: { providerId: "provider", model: "model-a" } };
      },
      toolManifest() {
        return [];
      },
      async run(input) {
        runtimeCalls.push(input);
        return {
          finalText: JSON.stringify({
            kind: "ada_implementation_report",
            taskId: task.id,
            summary: "runtime completed",
            changedFiles: [],
            verification: []
          }),
          sessionId: input.sessionId,
          trace: { traceId: "trace_ada_1" }
        };
      }
    },
    provider: {
      id: "provider",
      async resolveTurnConfig(selection = {}) {
        return {
          providerId: selection.providerId || "provider",
          runner: "openai_compatible",
          model: selection.model || "model-a",
          provider: { id: selection.providerId || "provider", type: "openai_compatible", runner: "openai_compatible" }
        };
      },
      async runAgentTurn(input) {
        providerCalls.push(input);
        throw new Error("WorkerEngine must not call provider.runAgentTurn for the main turn");
      }
    },
    config: { workspace: "/tmp/ai-team-workspace", runner: { type: "openai_compatible" }, provider: { id: "provider" } },
    logger: { info() {}, warn() {}, error() {} }
  });

  const result = await worker.runTask({ role: "engineer", intent, task, previousArtifacts: [{ id: "artifact_previous" }] });
  const storedTask = await store.getTask(task.id);
  const storedRun = await store.getRun(result.run.id);

  assert.equal(providerCalls.length, 0);
  assert.equal(runtimeCalls.length, 1);
  assert.equal(runtimeCalls[0].agentName, "Ada");
  assert.ok(runtimeCalls[0].sessionId.startsWith("sess_"));
  assert.ok(runtimeCalls[0].traceId.startsWith("trace_"));
  assert.equal(typeof runtimeCalls[0].inputText, "string");
  assert.match(runtimeCalls[0].inputText, /Current assignment/);
  assert.match(runtimeCalls[0].inputText, new RegExp(task.id));
  assert.match(runtimeCalls[0].inputText, /artifact_previous/);
  assert.deepEqual(runtimeCalls[0].hostContext, {
    engineRunId: result.run.id,
    engineEntityType: "task",
    engineEntityId: task.id,
    intentId: intent.id,
    taskId: task.id
  });
  assert.equal(storedTask.agentSessions.engineer, runtimeCalls[0].sessionId);
  assert.equal(storedRun.sessionKey, runtimeCalls[0].sessionId);
  assert.equal(storedRun.agentTraceId, "trace_ada_1");
});

test("WorkerEngine ignores display-name-only session bindings", async () => {
  const { store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-role-session-binding-");
  await store.updateTask(task.id, {
    agentSessions: {
      DisplayOnly: "sess_display_name_only"
    }
  });
  const updatedTask = await store.getTask(task.id);
  const runtimeCalls = [];
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: {
      async profileForRole(role) {
        return { role, name: "Ada", prompt: "Ada prompt", modelProvider: { providerId: "provider", model: "model-a" } };
      },
      toolManifest() {
        return [];
      },
      async run(input) {
        runtimeCalls.push(input);
        return {
          finalText: JSON.stringify({
            kind: "implementation_report",
            taskId: task.id,
            summary: "runtime completed",
            changedFiles: [],
            verification: []
          }),
          sessionId: input.sessionId || "sess_new_ada",
          trace: { traceId: "trace_ada_1" }
        };
      }
    },
    provider: {
      id: "provider",
      async resolveTurnConfig(selection = {}) {
        return {
          providerId: selection.providerId || "provider",
          runner: "openai_compatible",
          model: selection.model || "model-a",
          provider: { id: selection.providerId || "provider", type: "openai_compatible", runner: "openai_compatible" }
        };
      }
    },
    config: { workspace: "/tmp/ai-team-workspace", runner: { type: "openai_compatible" }, provider: { id: "provider" } },
    logger: { info() {}, warn() {}, error() {} }
  });

  const result = await worker.runTask({ role: "engineer", intent, task: updatedTask, previousArtifacts: [] });
  const storedTask = await store.getTask(task.id);
  const storedRun = await store.getRun(result.run.id);

  assert.equal(runtimeCalls[0].agentName, "Ada");
  assert.ok(runtimeCalls[0].sessionId.startsWith("sess_"));
  assert.equal(storedTask.agentSessions.engineer, runtimeCalls[0].sessionId);
  assert.equal(storedTask.agentSessions.DisplayOnly, "sess_display_name_only");
  assert.equal(storedRun.sessionKey, runtimeCalls[0].sessionId);
});

test("WorkerEngine stores AgentRuntime failure metadata and reuses the failed session binding", async () => {
  const { dataDir, store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-runtime-failure-");
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const agentConfigStore = new AgentConfigStore({ dataDir });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", {
    modelProvider: { providerId: "provider", model: "model-a" }
  });
  let createdRunId;
  const originalCreateRun = store.createRun.bind(store);
  store.createRun = async (input) => {
    const created = await originalCreateRun(input);
    createdRunId = created.id;
    return created;
  };
  const providerCalls = [];
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: new AgentRuntime({ memory, agentConfigStore, config: { dataDir, rootDir: dataDir } }),
    provider: {
      id: "provider",
      async resolveTurnConfig(selection = {}) {
        return {
          providerId: selection.providerId || "provider",
          runner: "openai_compatible",
          model: selection.model || "model-a",
          provider: { id: selection.providerId || "provider", type: "openai_compatible", runner: "openai_compatible" }
        };
      },
      async runAgentTurn(input) {
        providerCalls.push(input);
        if (providerCalls.length === 1) throw new Error("model failed after runtime metadata allocation");
        return {
          finalMessage: JSON.stringify({
            kind: "implementation_report",
            taskId: task.id,
            summary: "runtime completed after retry",
            changedFiles: [],
            verification: []
          })
        };
      }
    },
    config: { runner: { type: "openai_compatible" }, provider: { id: "provider" } },
    logger: { info() {}, warn() {}, error() {} }
  });

  await assert.rejects(
    worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] }),
    /model failed after runtime metadata allocation/
  );
  const failedRun = await store.getRun(createdRunId);
  const taskAfterFailure = await store.getTask(task.id);

  assert.equal(failedRun.status, "failed");
  assert.notEqual(failedRun.sessionKey, "engineer:cli:cli");
  assert.ok(failedRun.sessionKey.startsWith("sess_"));
  assert.ok(failedRun.agentTraceId.startsWith("trace_"));
  assert.equal(taskAfterFailure.agentSessions.engineer, failedRun.sessionKey);

  const result = await worker.runTask({ role: "engineer", intent, task: taskAfterFailure, previousArtifacts: [] });

  assert.equal(providerCalls.length, 2);
  assert.equal(result.run.status, "completed");
  assert.equal(result.run.sessionKey, failedRun.sessionKey);
  assert.equal((await store.getTask(task.id)).agentSessions.engineer, failedRun.sessionKey);
});

test("WorkerEngine prebinds task session before AgentRuntime provider turn can be interrupted", async () => {
  const { store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-prebind-session-");
  let runtimeSessionId;
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: {
      async profileForRole(role) {
        return { role, name: "Ada", prompt: "Ada prompt", modelProvider: { providerId: "provider", model: "model-a" } };
      },
      toolManifestForRun() {
        return [];
      },
      async run(input) {
        runtimeSessionId = input.sessionId;
        const currentTask = await store.getTask(task.id);
        assert.ok(runtimeSessionId?.startsWith("sess_"));
        assert.equal(currentTask.agentSessions.engineer, runtimeSessionId);
        return {
          finalText: JSON.stringify({
            kind: "ada_implementation_report",
            taskId: task.id,
            summary: "runtime completed",
            changedFiles: [],
            verification: []
          }),
          sessionId: runtimeSessionId,
          trace: { traceId: "trace_prebound" }
        };
      }
    },
    provider: {
      id: "provider",
      async resolveTurnConfig() {
        return {
          providerId: "provider",
          runner: "openai_compatible",
          model: "model-a",
          provider: { id: "provider", type: "openai_compatible", runner: "openai_compatible" }
        };
      }
    },
    config: { runner: { type: "openai_compatible" }, provider: { id: "provider" } },
    logger: { info() {}, warn() {}, error() {} }
  });

  const result = await worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] });

  assert.equal(result.run.sessionKey, runtimeSessionId);
  assert.equal((await store.getTask(task.id)).agentSessions.engineer, runtimeSessionId);
});

test("WorkerEngine reuses the same task session for the same Agent after QA rejection", async () => {
  const { store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-session-reuse-");
  const runtimeCalls = [];
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: {
      async profileForRole(role) {
        return { role, name: "Ada", prompt: "Ada prompt", modelProvider: { providerId: "provider", model: "model-a" } };
      },
      toolManifest() {
        return [];
      },
      async run(input) {
        runtimeCalls.push(input);
        return {
          finalText: JSON.stringify({
            kind: "ada_implementation_report",
            taskId: task.id,
            summary: "runtime completed",
            changedFiles: [],
            verification: []
          }),
          sessionId: input.sessionId || "sess_ada_reused",
          trace: { traceId: `trace_ada_${runtimeCalls.length}` }
        };
      }
    },
    provider: {
      id: "provider",
      async resolveTurnConfig() {
        return {
          providerId: "provider",
          runner: "openai_compatible",
          model: "model-a",
          provider: { id: "provider", type: "openai_compatible", runner: "openai_compatible" }
        };
      }
    },
    config: { runner: { type: "openai_compatible" }, provider: { id: "provider" } },
    logger: { info() {}, warn() {}, error() {} }
  });

  await worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] });
  const rejectedTask = await store.updateTask(task.id, {
    status: "waiting",
    reworkRounds: 1,
    latestRejectionArtifactId: "artifact_reject"
  });
  await worker.runTask({ role: "engineer", intent, task: rejectedTask, previousArtifacts: [{ id: "artifact_reject" }] });

  assert.equal(runtimeCalls.length, 2);
  assert.ok(runtimeCalls[0].sessionId.startsWith("sess_"));
  assert.equal(runtimeCalls[1].sessionId, runtimeCalls[0].sessionId);
  assert.equal((await store.getTask(task.id)).agentSessions.engineer, runtimeCalls[0].sessionId);
});

test("TeamEngine init recovers interrupted running task runs and preserves session binding", async () => {
  const { store, bus, task } = await setupEngineTask("ai-team-interrupted-run-recovery-");
  await store.transitionEntity({
    entityType: "task",
    entityId: task.id,
    status: "working",
    agentRole: "engineer",
    reason: "wake rule started task"
  });
  const run = await store.createRun({
    entityType: "task",
    entityId: task.id,
    agentRole: "engineer",
    sessionKey: "sess_interrupted_1",
    runner: "openai_compatible",
    provider: "provider",
    model: "model-a"
  });
  const engine = new TeamEngine({
    store,
    bus,
    worker: {},
    logger: { info() {}, warn() {}, error() {} }
  });

  await engine.init();

  const recoveredRun = await store.getRun(run.id);
  const recoveredTask = await store.getTask(task.id);
  assert.equal(recoveredRun.status, "failed");
  assert.equal(recoveredRun.error.message, "interrupted run recovered on startup");
  assert.equal(recoveredTask.status, "blocked");
  assert.equal(recoveredTask.blocked.phase, "interrupted_run");
  assert.equal(recoveredTask.blocked.runId, run.id);
  assert.equal(recoveredTask.agentSessions.engineer, "sess_interrupted_1");
});

test("TeamEngine init fails stale running runs without reopening completed tasks", async () => {
  const { store, bus, task } = await setupEngineTask("ai-team-stale-run-recovery-");
  await store.updateTask(task.id, { status: "done", completedAt: "2026-06-10T00:00:00.000Z" });
  const run = await store.createRun({
    entityType: "task",
    entityId: task.id,
    agentRole: "engineer",
    sessionKey: "sess_stale_done",
    runner: "openai_compatible",
    provider: "provider",
    model: "model-a"
  });
  const engine = new TeamEngine({
    store,
    bus,
    worker: {},
    logger: { info() {}, warn() {}, error() {} }
  });

  await engine.init();

  const recoveredRun = await store.getRun(run.id);
  const recoveredTask = await store.getTask(task.id);
  assert.equal(recoveredRun.status, "failed");
  assert.equal(recoveredRun.error.message, "interrupted run recovered on startup");
  assert.equal(recoveredTask.status, "done");
  assert.equal(recoveredTask.blocked, undefined);
});

test("WorkerEngine stores distinct session bindings per Agent on the same task", async () => {
  const { store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-session-agents-");
  const runtimeCalls = [];
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: {
      async profileForRole(role) {
        if (role === "qa") return { role, name: "Turing", prompt: "Turing prompt", modelProvider: { providerId: "provider", model: "model-a" } };
        return { role, name: "Ada", prompt: "Ada prompt", modelProvider: { providerId: "provider", model: "model-a" } };
      },
      toolManifest() {
        return [];
      },
      async run(input) {
        runtimeCalls.push(input);
        const isTuring = input.agentName === "Turing";
        return {
          finalText: JSON.stringify(
            isTuring
              ? { kind: "turing_verification_report", taskId: task.id, verdict: "pass", findings: [], checks: [] }
              : { kind: "ada_implementation_report", taskId: task.id, summary: "done", changedFiles: [], verification: [] }
          ),
          sessionId: isTuring ? "sess_turing_1" : "sess_ada_1",
          trace: { traceId: isTuring ? "trace_turing_1" : "trace_ada_1" }
        };
      }
    },
    provider: {
      id: "provider",
      async resolveTurnConfig() {
        return {
          providerId: "provider",
          runner: "openai_compatible",
          model: "model-a",
          provider: { id: "provider", type: "openai_compatible", runner: "openai_compatible" }
        };
      }
    },
    config: { runner: { type: "openai_compatible" }, provider: { id: "provider" } },
    logger: { info() {}, warn() {}, error() {} }
  });

  await worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] });
  const testingTask = await store.getTask(task.id);
  await worker.runTask({ role: "qa", intent, task: testingTask, previousArtifacts: [] });
  const storedTask = await store.getTask(task.id);

  assert.equal(runtimeCalls[0].agentName, "Ada");
  assert.equal(runtimeCalls[1].agentName, "Turing");
  assert.deepEqual(storedTask.agentSessions, {
    engineer: "sess_ada_1",
    qa: "sess_turing_1"
  });
});

test("WorkerEngine records the agent config snapshot used by a run", async () => {
  const { dataDir, store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-agent-config-");
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", {
    prompt: "Custom implementation prompt",
    skills: ["patching", { id: "verification", description: "Run focused tests." }],
    mcps: [{
      mcpServers: {
        github: {
          url: "https://example.com/mcp",
          tools: [{
            name: "search_issues",
            description: "Search GitHub issues.",
            inputSchema: {
              type: "object",
              required: ["query"],
              properties: { query: { type: "string" } }
            }
          }]
        }
      }
    }],
    tools: ["memory.search", "Bash", "github.search_issues"],
    modelProvider: { providerId: "codex-research", model: "gpt-5.5" }
  });
  let providerInput;
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: new AgentRuntime({ memory, toolRegistry, agentConfigStore }),
    provider: {
      id: "provider",
      capabilities: { supportsTools: false },
      async resolveTurnConfig(selection = {}) {
        return {
          providerId: selection.providerId || "provider",
          runner: "provider",
          model: selection.model || "default-model",
          provider: { id: selection.providerId || "provider", type: "provider", runner: "provider" }
        };
      },
      async runAgentTurn(input) {
        providerInput = input;
        return { finalMessage: "Provider done", structuredOutput: { kind: "custom_report" } };
      }
    },
    config: { workspace: dataDir, runner: { type: "provider" }, provider: { id: "provider" } },
    logger: { info() {}, warn() {}, error() {} }
  });

  const result = await worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] });
  const storedRun = await store.getRun(result.run.id);

  assert.equal(storedRun.agentConfigSnapshot.prompt, "Custom implementation prompt");
  assertNoDroppedConfigFields(storedRun.agentConfigSnapshot);
  assert.deepEqual(storedRun.agentConfigSnapshot.modelProvider, { providerId: "codex-research", model: "gpt-5.5" });
  assert.deepEqual(storedRun.agentConfigSnapshot.skills.map((skill) => skill.id), ["patching", "verification"]);
  assert.deepEqual(storedRun.agentConfigSnapshot.mcps.map((mcp) => mcp.id), ["github"]);
  assert.deepEqual(storedRun.agentConfigSnapshot.tools.map((tool) => tool.id), [
    "skill",
    "memory.search",
    "Bash",
    "memory.write",
    "github.search_issues"
  ]);
  assert.ok(providerInput.tools.some((tool) => tool.function.name === "github_search_issues"));
  assert.equal(storedRun.provider, "codex-research");
  assert.equal(storedRun.model, "gpt-5.5");
  assert.equal(providerInput.providerSelection.providerId, "codex-research");
  assert.equal(providerInput.providerSelection.model, "gpt-5.5");
});

test("WorkerEngine keeps tool policy out of AgentRuntime prompt while preserving submitted tools", async () => {
  const { dataDir, store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-agent-provider-tools-");
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", {
    tools: ["Bash"],
    modelProvider: { providerId: "openai-tools", model: "gpt-4.1" }
  });
  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });
  const createRunInputs = [];
  const originalCreateRun = store.createRun.bind(store);
  store.createRun = async (input) => {
    createRunInputs.push(input);
    return originalCreateRun(input);
  };
  let providerInput;
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: runtime,
    provider: {
      id: "codex-default",
      capabilities: { supportsTools: false },
      async resolveTurnConfig(selection = {}) {
        if (selection.providerId === "openai-tools") {
          return {
            providerId: "openai-tools",
            runner: "openai_compatible",
            model: selection.model,
            provider: { id: "openai-tools", type: "openai_compatible", runner: "openai_compatible" }
          };
        }
        return {
          providerId: "codex-default",
          runner: "codex_app_server",
          model: "gpt-5.5",
          provider: { id: "codex-default", type: "codex_app_server", runner: "codex_app_server" }
        };
      },
      async runAgentTurn(input) {
        providerInput = input;
        return {
          finalMessage: JSON.stringify({ kind: "implementation_report", taskId: task.id, summary: "done", changedFiles: [], verification: [] })
        };
      }
    },
    config: { workspace: dataDir, runner: { type: "codex_app_server" }, provider: { id: "codex-default" } },
    logger: { info() {}, warn() {}, error() {} }
  });

  const result = await worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] });
  const storedRun = await store.getRun(result.run.id);

  assert.deepEqual(createRunInputs.map(({ runner, provider, model }) => ({ runner, provider, model })), [
    { runner: "openai_compatible", provider: "openai-tools", model: "gpt-4.1" }
  ]);
  assert.equal(storedRun.runner, "openai_compatible");
  assert.equal(storedRun.provider, "openai-tools");
  assert.equal(storedRun.model, "gpt-4.1");
  assert.doesNotMatch(providerInput.prompt, /## Enabled Tools/);
  assert.equal(providerInput.prompt.includes("## Role Capability Policy"), false);
  assert.equal(providerInput.prompt.includes("backend does not support structured tool calls"), false);
  assert.deepEqual(providerInput.tools.map((tool) => tool.function.name), ["skill", "Bash", "memory_search", "memory_write"]);
  assert.equal(providerInput.providerSelection.runner, "openai_compatible");
});

test("WorkerEngine requires AgentRuntime.run for non-mock provider turns", async () => {
  const { store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-codex-tool-");
  const invocations = [];
  let providerInput;
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: { async prepareTurn() { return { agentId: "engineer", context: "runtime", tools: [] }; }, toolManifest() { return []; } },
    provider: {
      id: "codex",
      capabilities: { supportsTools: false },
      async runAgentTurn(input) {
        providerInput = input;
        return {
          finalMessage: "Codex app-server provider done",
          structuredOutput: { kind: "codex_app_server_report", ok: true },
          stdout: "",
          stderr: "",
          durationMs: 2
        };
      }
    },
    config: { workspace: "/tmp/ai-team-workspace", runner: { type: "codex_app_server" }, provider: { id: "codex" } },
    toolExecutor: {
      async invoke(input) {
        invocations.push(input);
        return {
          output: {
            finalMessage: "Codex tool done",
            structuredOutput: { kind: "codex_tool_report", ok: true },
            stdout: "",
            stderr: "",
            durationMs: 2
          }
        };
      }
    },
    logger: { info() {}, warn() {}, error() {} }
  });

  await assert.rejects(
    () => worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] }),
    /WorkerEngine non-mock execution requires AgentRuntime\.run/
  );
  assert.equal(invocations.length, 0);
  assert.equal(providerInput, undefined);
});

test("WorkerEngine passes Engine assignment text to AgentRuntime and stores only Agent session bindings", async () => {
  const { dataDir, store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-runtime-context-");
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const previousArtifacts = Array.from({ length: 8 }, (_, index) => ({
    id: `artifact_${index}`,
    kind: "large_report",
    role: index % 2 === 0 ? "engineer" : "qa",
    data: {
      summary: `artifact ${index}`,
      blob: "x".repeat(5000)
    }
  }));
  const providerInputs = [];
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: new AgentRuntime({ memory }),
    provider: {
      id: "provider",
      capabilities: { supportsTools: false },
      async runAgentTurn(input) {
        providerInputs.push(input);
        return {
          finalMessage: JSON.stringify({
            kind: "implementation_report",
            taskId: task.id,
            summary: "Provider done",
            changedFiles: [],
            verification: []
          })
        };
      }
    },
    config: {
      workspace: dataDir,
      runner: { type: "provider" },
      provider: { id: "provider" },
      context: {
        maxPromptChars: 18_000,
        compressionThresholdRatio: 0.8
      }
    },
    logger: { info() {}, warn() {}, error() {} }
  });

  const result = await worker.runTask({ role: "engineer", intent, task, previousArtifacts });
  const storedTask = await store.getTask(task.id);
  const storedRun = await store.getRun(result.run.id);
  const engineSession = await store.getSession(result.run.sessionKey);

  assert.equal(result.run.status, "completed");
  assert.equal(engineSession, undefined);
  assert.equal(storedTask.agentSessions.engineer, result.run.sessionKey);
  assert.equal(storedRun.sessionKey, result.run.sessionKey);
  assert.ok(storedRun.agentTraceId.startsWith("trace_"));
  assert.equal(providerInputs.length, 1);
  assert.equal(providerInputs[0].purpose, "agent_runtime_run");
  assert.ok(providerInputs[0].prompt.includes("## Previous Engine Artifacts"));
  assert.ok(providerInputs[0].prompt.includes("artifact 7"));
  assert.equal(providerInputs[0].prompt.includes("## Enabled Tools"), false);
  assert.equal(providerInputs[0].prompt.includes("[truncated"), false);
});

test("WorkerEngine summarizes oversized assignment context sent to AgentRuntime", async () => {
  const { dataDir, store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-static-context-");
  const staticMarker = `STATIC_CONTEXT_MUST_SURVIVE_${"S".repeat(5000)}_END`;
  await store.updateIntent(intent.id, { goal: staticMarker });
  const updatedIntent = await store.getIntent(intent.id);
  const runtimeBlob = `RUNTIME_BLOB_SHOULD_BE_COMPRESSED_${"R".repeat(6000)}`;
  const providerInputs = [];
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: new AgentRuntime({ memory: new MemoryStore({ dataDir }) }),
    provider: {
      id: "provider",
      capabilities: { supportsTools: false },
      async runAgentTurn(input) {
        providerInputs.push(input);
        return {
          finalMessage: JSON.stringify({
            kind: "implementation_report",
            taskId: task.id,
            summary: "Provider done",
            changedFiles: [],
            verification: []
          })
        };
      }
    },
    config: {
      workspace: dataDir,
      runner: { type: "provider" },
      provider: { id: "provider" },
      context: {
        maxPromptChars: 8_000,
        compressionThresholdRatio: 0.8
      }
    },
    logger: { info() {}, warn() {}, error() {} }
  });
  await worker.agentRuntime.memoryManager.memory.init();

  await worker.runTask({
    role: "engineer",
    intent: updatedIntent,
    task,
    previousArtifacts: [{ id: "artifact_runtime", kind: "large", data: { runtimeBlob } }]
  });

  const finalPrompt = providerInputs[0].prompt;
  assert.ok(finalPrompt.includes("STATIC_CONTEXT_MUST_SURVIVE_"));
  assert.ok(finalPrompt.includes("[truncated"));
  assert.ok(finalPrompt.includes("payload omitted"));
  assert.equal(finalPrompt.includes(staticMarker), false);
  assert.equal(finalPrompt.includes(runtimeBlob), false);
});

test("WorkerEngine normalizes non-mock provider structured and stdout output", async () => {
  const structuredSetup = await setupEngineTask("ai-team-worker-engine-structured-provider-");
  const structuredWorker = new WorkerEngine({
    store: structuredSetup.store,
    bus: structuredSetup.bus,
    agentRuntime: agentRuntimeStub({
      finalText: "Structured done",
      structured: { kind: "structured_report" },
      sessionId: "sess_structured",
      trace: { traceId: "trace_structured" }
    }),
    provider: {
      id: "provider",
      async runAgentTurn() {
        throw new Error("provider should be reached only through AgentRuntime.run");
      }
    },
    config: { runner: { type: "provider" }, provider: { id: "provider" } },
    logger: { info() {}, error() {} }
  });

  const structuredResult = await structuredWorker.runTask({
    role: "engineer",
    intent: structuredSetup.intent,
    task: structuredSetup.task,
    previousArtifacts: []
  });

  assert.equal(structuredResult.artifact.kind, "structured_report");
  assert.ok(structuredResult.run.transcriptSummary.includes("Structured done"));

  const stdoutSetup = await setupEngineTask("ai-team-worker-engine-stdout-provider-");
  const stdoutWorker = new WorkerEngine({
    store: stdoutSetup.store,
    bus: stdoutSetup.bus,
    agentRuntime: agentRuntimeStub({
      stdout: "stdout only",
      structuredOutput: { kind: "stdout_report" },
      sessionId: "sess_stdout",
      trace: { traceId: "trace_stdout" }
    }),
    provider: {
      id: "provider",
      async runAgentTurn() {
        throw new Error("provider should be reached only through AgentRuntime.run");
      }
    },
    config: { runner: { type: "provider" }, provider: { id: "provider" } },
    logger: { info() {}, error() {} }
  });

  const stdoutResult = await stdoutWorker.runTask({
    role: "engineer",
    intent: stdoutSetup.intent,
    task: stdoutSetup.task,
    previousArtifacts: []
  });

  assert.equal(stdoutResult.artifact.kind, "stdout_report");
  assert.ok(stdoutResult.run.transcriptSummary.includes("stdout only"));
});

test("WorkerEngine derives a final message for structured-only provider output", async () => {
  const { dataDir, store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-structured-only-");
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: agentRuntimeStub({
      structuredOutput: { kind: "structured_only" },
      sessionId: "sess_structured_only",
      trace: { traceId: "trace_structured_only" }
    }),
    provider: {
      id: "provider",
      async runAgentTurn() {
        throw new Error("provider should be reached only through AgentRuntime.run");
      }
    },
    config: { runner: { type: "provider" }, provider: { id: "provider" } },
    logger: { info() {}, error() {} }
  });

  const result = await worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] });
  const outbox = JSON.parse(
    await fs.readFile(path.join(dataDir, "engine", "agents", "engineer", "outbox", `${task.id}.${result.run.id}.json`), "utf8")
  );

  assert.equal(result.artifact.kind, "structured_only");
  assert.ok(result.run.transcriptSummary.includes("Structured output: structured_only"));
  assert.equal(outbox.payload.finalMessage, "Structured output: structured_only");
});

test("WorkerEngine fails runs for empty provider output", async () => {
  for (const emptyOutput of [
    {},
    { stdout: "" },
    { finalMessage: "   ", structuredOutput: {} },
    { structuredOutput: "invalid" },
    { structuredOutput: [] },
    undefined
  ]) {
    const { store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-empty-provider-");
    const worker = new WorkerEngine({
      store,
      bus,
      agentRuntime: agentRuntimeStub(emptyOutput),
      provider: {
        id: "provider",
        async runAgentTurn() {
          throw new Error("provider should be reached only through AgentRuntime.run");
        }
      },
      config: { runner: { type: "provider" }, provider: { id: "provider" } },
      logger: { info() {}, error() {} }
    });

    await assert.rejects(
      () => worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] }),
      /provider returned empty output/
    );

    const runs = await store.listRuns();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, "failed");
  }
});

test("WorkerEngine coerces invalid structured payloads when provider returns text", async () => {
  for (const providerOutput of [
    { finalMessage: "String structured", structuredOutput: "invalid" },
    { stdout: "Array structured", structuredOutput: [] },
    { finalMessage: "Empty structured", structuredOutput: {} }
  ]) {
    const { store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-invalid-structured-");
    const worker = new WorkerEngine({
      store,
      bus,
      agentRuntime: {
        ...agentRuntimeStub({
          finalText: providerOutput.finalMessage,
          structuredOutput: providerOutput.structuredOutput,
          stdout: providerOutput.stdout
        }),
        async profileForRole() {
          return engineerOutputProfile();
        }
      },
      provider: {
        id: "provider",
        async runAgentTurn() {
          throw new Error("provider should be reached only through AgentRuntime.run");
        }
      },
      config: { runner: { type: "provider" }, provider: { id: "provider" } },
      logger: { info() {}, error() {} }
    });

    const result = await worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] });

    assert.equal(result.run.status, "completed");
    assert.equal(result.artifact.kind, "implementation_report");
    assert.deepEqual(result.artifact.data, {
      kind: "implementation_report",
      message: result.run.transcriptSummary.replace("Implementation completed.\n", "")
    });
  }
});

test("WorkerEngine does not mark a run completed before task link update succeeds", async () => {
  const { dataDir, store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-link-fail-");
  store.appendTaskRunAndArtifact = async () => {
    throw new Error("task link failed");
  };
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: agentRuntimeStub({
      finalText: "Provider done",
      structuredOutput: { kind: "custom_report" },
      sessionId: "sess_link_fail",
      trace: { traceId: "trace_link_fail" }
    }),
    provider: {
      id: "provider",
      async runAgentTurn() {
        throw new Error("provider should be reached only through AgentRuntime.run");
      }
    },
    config: { runner: { type: "provider" }, provider: { id: "provider" } },
    logger: { info() {}, error() {} }
  });

  await assert.rejects(
    () => worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] }),
    /task link failed/
  );

  const runs = await store.listRuns();
  const artifacts = await store.listArtifacts();
  const storedIntent = await store.getIntent(intent.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "failed");
  assert.equal(runs[0].completedAt, undefined);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].status, "failed");
  assert.equal(storedIntent.artifactIds.includes(artifacts[0].id), false);
  await assert.rejects(
    fs.stat(path.join(dataDir, "engine", "agents", "engineer", "outbox", `${task.id}.${runs[0].id}.json`)),
    { code: "ENOENT" }
  );
});

test("WorkerEngine marks completed runs failed when success outbox write fails", async () => {
  const { store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-outbox-fail-");
  bus.writeOutbox = async () => {
    throw new Error("outbox failed");
  };
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: agentRuntimeStub({
      finalText: "Provider done",
      structuredOutput: { kind: "custom_report" },
      sessionId: "sess_outbox_fail",
      trace: { traceId: "trace_outbox_fail" }
    }),
    provider: {
      id: "provider",
      async runAgentTurn() {
        throw new Error("provider should be reached only through AgentRuntime.run");
      }
    },
    config: { runner: { type: "provider" }, provider: { id: "provider" } },
    logger: { info() {}, error() {} }
  });

  await assert.rejects(
    () => worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] }),
    /outbox failed/
  );

  const runs = await store.listRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "failed");
  assert.equal(runs[0].completedAt, undefined);
  assert.deepEqual(runs[0].artifactIds, []);
});

test("WorkerEngine marks the run failed when provider execution throws", async () => {
  const { store, bus, intent, task } = await setupEngineTask("ai-team-worker-engine-provider-fail-");
  const worker = new WorkerEngine({
    store,
    bus,
    agentRuntime: agentRuntimeStub(() => {
      throw new Error("provider unavailable");
    }),
    provider: {
      id: "provider",
      async runAgentTurn() {
        throw new Error("provider should be reached only through AgentRuntime.run");
      }
    },
    config: { runner: { type: "provider" }, provider: { id: "provider" } },
    logger: { info() {}, error() {} }
  });

  await assert.rejects(
    () => worker.runTask({ role: "engineer", intent, task, previousArtifacts: [] }),
    /provider unavailable/
  );

  const runs = await store.listRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "failed");
  assert.equal(runs[0].error.message, "provider unavailable");
});

test("mock product manager output includes product spec and task graph", () => {
  const output = mockRoleOutput({
    role: "product_manager",
    intent: {
      id: "intent_1",
      goal: "帮我做一个客户反馈驱动的小功能，并测试",
      acceptanceCriteria: ["功能完成", "测试通过"]
    }
  });

  assert.equal(output.structured.kind, "task_graph");
  assert.ok(output.structured.productSpec.userStories.length >= 1);
  assert.ok(output.structured.tasks.some((task) => task.title.includes("实现")));
  assert.ok(output.structured.tasks.some((task) => task.title.includes("回复")));
  assert.equal(output.structured.tasks.some((task) => Object.hasOwn(task, "consumerRole")), false);
});

test("mock product manager handles identity questions as conversation, not delivery work", () => {
  const output = mockRoleOutput({
    role: "product_manager",
    intent: {
      id: "intent_identity",
      goal: "你叫什么名字？"
    }
  });

  assert.equal(output.structured.kind, "task_graph");
  assert.equal(output.structured.tasks.length, 1);
  assert.equal(Object.hasOwn(output.structured.tasks[0], "consumerRole"), false);
  assert.match(output.structured.tasks[0].acceptanceCriteria.join("\n"), /Franklin/);
  assert.doesNotMatch(output.structured.tasks[0].acceptanceCriteria.join("\n"), /我是 AI Team Agent/);
});

test("mock Customer Success answers identity as Franklin", () => {
  const output = mockRoleOutput({
    role: "customer_success",
    intent: { id: "intent_identity", goal: "你叫什么名字？" },
    task: { id: "task_identity", title: "回复用户询问名称" }
  });

  assert.equal(output.structured.kind, "customer_reply");
  assert.equal(output.structured.message, "我是 Franklin，AI Team 的 CEO/CTO 入口。");
  assert.doesNotMatch(output.structured.message, /AI Team Agent/);
});

test("mock QA output starts finalMessage with matching pass verdict by default", () => {
  const output = mockRoleOutput({ role: "qa", task: { id: "task_1" } });

  assert.equal(output.structured.verdict, "pass");
  assert.match(output.finalMessage, /^VERDICT: pass/);
});

test("mock QA output rejects while rework rounds are below forced reject rounds", () => {
  const output = mockRoleOutput({
    role: "qa",
    task: {
      id: "task_1",
      reworkRounds: 1,
      context: { forceQaRejectRounds: 2 }
    }
  });

  assert.equal(output.structured.verdict, "reject");
  assert.match(output.finalMessage, /^VERDICT: reject/);
});

test("mock QA ignores forced rejection when no explicit round is present", () => {
  const output = mockRoleOutput({
    role: "qa",
    task: {
      id: "task_1",
      context: { forceQaRejectRounds: 1 }
    }
  });

  assert.equal(output.structured.verdict, "pass");
  assert.match(output.finalMessage, /^VERDICT: pass/);
});

test("mock QA honors forced rejection with explicit rework rounds", () => {
  const reject = mockRoleOutput({
    role: "qa",
    task: {
      id: "task_1",
      reworkRounds: 0,
      context: { forceQaRejectRounds: 1 }
    }
  });
  const pass = mockRoleOutput({
    role: "qa",
    task: {
      id: "task_1",
      reworkRounds: 1,
      context: { forceQaRejectRounds: 1 }
    }
  });

  assert.equal(reject.structured.verdict, "reject");
  assert.equal(pass.structured.verdict, "pass");
});

test("mockRoleOutput is safe with missing input and null previous artifacts", () => {
  const fallback = mockRoleOutput();
  const engineer = mockRoleOutput({ role: "engineer", previousArtifacts: null });

  assert.equal(fallback.structured.kind, "mock_role_output");
  assert.equal(engineer.structured.kind, "implementation_report");
});

test("mock engineer output addresses latest rejection artifact", () => {
  const output = mockRoleOutput({
    role: "engineer",
    task: { id: "task_1", title: "修复失败用例" },
    previousArtifacts: [
      { id: "artifact_pass", kind: "turing_verification_report", data: { verdict: "pass" } },
      { id: "artifact_reject", kind: "turing_verification_report", data: { verdict: "reject" } }
    ]
  });

  assert.equal(output.structured.addressedRejectionArtifactId, "artifact_reject");
});

test("mock CEO output prefers latest customer success reply", () => {
  const output = mockRoleOutput({
    role: "ceo_cto",
    intent: { id: "intent_1", goal: "交付功能" },
    previousArtifacts: [
      { id: "artifact_old", kind: "customer_reply", data: { message: "旧回复" } },
      { id: "artifact_new", kind: "customer_reply", data: { message: "新回复" } }
    ]
  });

  assert.equal(output.finalMessage, "新回复");
  assert.equal(output.structured.sourceArtifactId, "artifact_new");
});

test("TeamEngine creates intent and product manager produces the initial task graph", async () => {
  const { engine, store } = await createMockEngine();
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "帮我做一个客户反馈驱动的小功能，并测试",
    metadata: { acceptanceCriteria: ["测试通过"] }
  });

  const tick = await engine.tick();
  const tasks = await store.listTasks();
  const artifacts = await store.listArtifacts();

  assert.equal(tick.processed > 0, true);
  assert.equal((await store.getIntent(intent.id)).status, "in_progress");
  assert.ok(artifacts.some((artifact) => artifact.kind === "task_graph"));
  assert.ok(tasks.some((task) => task.producerRole === "product_manager"));
});

test("TeamEngine wakes the configured intent consumer instead of hardcoding product manager", async () => {
  const { engine, store, dataDir } = await createMockEngine();
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, agentsDir: path.join(dataDir, "agents-root"), toolRegistry });
  const routingStore = new EngineRoutingStore({ dataDir, agentsDir: path.join(dataDir, "agents-root") });
  await agentConfigStore.init();
  await routingStore.init();
  await routingStore.update("product_manager", []);
  await agentConfigStore.create({
    name: "Ada",
    role: "requirements",
    title: "Requirements Analyst",
    prompt: "Produce a task_graph.",
    tools: ["memory.search", "engine.transition", "Bash"]
  });
  await routingStore.update("requirements", [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }]);
  engine.routingStore = routingStore;
  const invokedRoles = [];
  engine.worker.runIntent = async ({ role }) => {
    invokedRoles.push(role);
    return {
      run: { id: "run_ada" },
      artifact: {
        id: "artifact_ada",
        data: {
          kind: "task_graph",
          tasks: [
            {
              id: "implementation",
              title: "Implement configured routing",
              description: "Keep the intent open after configured routing.",
              dependencies: [],
              acceptanceCriteria: []
            }
          ]
        }
      }
    };
  };
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "用配置里的 Ada 拆解"
  });

  await engine.tick();

  const routed = await store.getIntent(intent.id);
  const tasks = await store.listTasks();
  assert.deepEqual(invokedRoles, ["requirements"]);
  assert.equal(tasks[0].producerRole, "requirements");
  assert.equal(tasks[0].consumerRole, undefined);
  assert.equal(routed.operations[0].agentRole, "requirements");
  assert.equal(routed.operations[0].toStatus, "routing");
  assert.equal(routed.status, "in_progress");
});

test("TeamEngine uses EngineRoutingStore for consumers and task role discovery", async () => {
  const { engine, dataDir } = await createMockEngine();
  const routingStore = new EngineRoutingStore({ dataDir });
  await routingStore.init();
  await routingStore.update("product_manager", []);
  await routingStore.update("requirements", [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }]);
  await routingStore.update("reviewer", [{ entityType: "task", status: "waiting", consumerRole: "reviewer" }]);

  engine.routingStore = routingStore;

  assert.deepEqual(
    (await engine.consumersFor({ entityType: "intent", status: "new", entity: {} })).map((match) => match.role),
    ["requirements"]
  );
  assert.deepEqual(await routingStore.taskConsumerRoles(), ["operations", "engineer", "reviewer"]);
});

test("TeamEngine does not hardcode consumers when routing store is unavailable", async () => {
  const { engine } = await createMockEngine();
  engine.routingStore = undefined;

  assert.deepEqual(
    await engine.consumersFor({ entityType: "intent", status: "new", entity: {} }),
    []
  );
  assert.deepEqual(
    await engine.consumersFor({ entityType: "task", status: "testing", entity: {} }),
    []
  );
});

test("TeamEngine preserves task status changed during a worker run", async () => {
  const { store, bus, task } = await setupEngineTask("ai-team-worker-status-preserve-");
  const engine = new TeamEngine({
    store,
    bus,
    worker: {
      async runTask({ task: working }) {
        await store.transitionEntity({
          entityType: "task",
          entityId: working.id,
          status: "blocked",
          agentRole: "engineer",
          reason: "model requested block"
        });
        return {
          run: { id: "run_model_block" },
          artifact: { id: "artifact_model_block" }
        };
      }
    }
  });

  const result = await engine.runImplementationOrCustomerTask(task, {
    role: "engineer",
    rule: { afterRunStatus: "testing" }
  });

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.runIds, ["run_model_block"]);
  assert.deepEqual(result.artifactIds, ["artifact_model_block"]);
  assert.deepEqual(
    result.operations.map((operation) => operation.toStatus),
    ["working", "blocked"]
  );
});

test("TeamEngine routes role-agnostic product manager tasks through the waiting task fallback", async () => {
  const { engine, store, dataDir } = await createMockEngine();
  const routingStore = new EngineRoutingStore({ dataDir });
  await routingStore.init();
  await routingStore.update("ceo_cto", [{ entityType: "intent", status: "in_progress", condition: "all_tasks_done", afterRunStatus: "done" }]);
  await routingStore.update("product_manager", [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }]);
  await routingStore.update("engineer", [{ entityType: "task", status: "waiting", afterRunStatus: "testing" }]);
  await routingStore.update("qa", [{ entityType: "task", status: "testing", afterRunStatus: "done" }]);
  await routingStore.update("customer_success", []);
  await routingStore.update("operations", []);
  engine.routingStore = routingStore;

  const invokedRoles = [];
  engine.worker.runIntent = async () => ({
    run: { id: "run_jobs_role_agnostic" },
    artifact: {
      id: "artifact_jobs_role_agnostic",
      data: {
        kind: "task_graph",
        tasks: [
          {
            id: "impl",
            title: "实现设置页体验",
            description: "完成设置页的交互、错误态和验证。",
            dependencies: [],
            acceptanceCriteria: ["设置页可用"]
          },
          {
            id: "reply",
            title: "回复用户交付结果",
            description: "在实现完成后，用中文说明用户能看到的变化。",
            dependencies: ["impl"],
            acceptanceCriteria: ["回复清楚"]
          }
        ]
      }
    }
  });
  engine.worker.runTask = async ({ role, task }) => {
    invokedRoles.push(role);
    return {
      run: { id: `run_${role}_${task.id}` },
      artifact: {
        id: `artifact_${role}_${task.id}`,
        data: role === "qa"
          ? { kind: "turing_verification_report", taskId: task.id, verdict: "pass", findings: [], checks: [] }
          : { kind: "agent_output", taskId: task.id, message: `${role} handled ${task.title}` }
      }
    };
  };

  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "实现设置页并回复"
  });

  for (let i = 0; i < 7; i += 1) await engine.tick();

  const tasks = await store.listTasks();
  const implementation = tasks.find((task) => task.title === "实现设置页体验");
  const reply = tasks.find((task) => task.title === "回复用户交付结果");
  assert.equal((await store.getIntent(intent.id)).status, "done");
  assert.equal(tasks.every((task) => task.consumerRole === undefined), true);
  assert.equal(implementation.claimedByRole, "engineer");
  assert.equal(reply.claimedByRole, "engineer");
  assert.deepEqual(reply.dependencies, [implementation.id]);
  assert.deepEqual(invokedRoles, ["engineer", "qa", "engineer", "qa"]);
});

test("TeamEngine runs ready tasks for different roles concurrently", async () => {
  const { engine, store, dataDir } = await createMockEngine();
  const routingStore = new EngineRoutingStore({ dataDir });
  await routingStore.init();
  await routingStore.update("engineer", [{ entityType: "task", status: "waiting", afterRunStatus: "testing" }]);
  await routingStore.update("qa", [{ entityType: "task", status: "testing", afterRunStatus: "done" }]);
  engine.routingStore = routingStore;

  const intent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "parallel work",
    acceptanceCriteria: []
  });
  await store.updateIntent(intent.id, { status: "in_progress" });
  const implementation = await store.createTask({
    intentId: intent.id,
    title: "Implement first slice",
    description: "Engineer work that should not block QA.",
    producerRole: "product_manager",
    dependencies: [],
    acceptanceCriteria: []
  });
  const verification = await store.createTask({
    intentId: intent.id,
    title: "Verify completed slice",
    description: "QA work ready at the same time.",
    producerRole: "product_manager",
    dependencies: [],
    acceptanceCriteria: []
  });
  await store.updateTask(verification.id, { status: "testing" });

  const startedRoles = [];
  let releaseEngineer;
  engine.worker.runTask = async ({ role, task }) => {
    startedRoles.push(role);
    if (role === "engineer") {
      await new Promise((resolve) => {
        releaseEngineer = resolve;
      });
    }
    return {
      run: { id: `run_${role}_${task.id}` },
      artifact: {
        id: `artifact_${role}_${task.id}`,
        data: role === "qa"
          ? { kind: "verification_report", taskId: task.id, verdict: "pass", findings: [], checks: [] }
          : { kind: "implementation_report", taskId: task.id, summary: "done", changedFiles: [], verification: [] }
      }
    };
  };

  const routePromise = engine.routeReadyTasks();
  assert.equal(await waitFor(() => startedRoles.includes("engineer")), true);
  await delay(20);
  const qaStartedBeforeEngineerFinished = startedRoles.includes("qa");
  releaseEngineer();
  const processed = await routePromise;

  assert.equal(qaStartedBeforeEngineerFinished, true);
  assert.equal(processed, 2);
  assert.equal((await store.getTask(implementation.id)).status, "testing");
  assert.equal((await store.getTask(verification.id)).status, "done");
});

test("TeamEngine overlapping ticks can route independent work while a planner run is active", async () => {
  const { engine, store, dataDir } = await createMockEngine();
  const routingStore = new EngineRoutingStore({ dataDir });
  await routingStore.init();
  await routingStore.update("product_manager", [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }]);
  await routingStore.update("engineer", [{ entityType: "task", status: "waiting", afterRunStatus: "testing" }]);
  await routingStore.update("qa", []);
  engine.routingStore = routingStore;

  const planningIntent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "plan a new project",
    acceptanceCriteria: []
  });
  const implementationIntent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "existing implementation",
    acceptanceCriteria: []
  });
  await store.updateIntent(implementationIntent.id, { status: "in_progress" });
  const implementationTask = await store.createTask({
    intentId: implementationIntent.id,
    title: "Implement independent slice",
    description: "This ready task should not wait for the planner turn.",
    producerRole: "product_manager",
    dependencies: [],
    acceptanceCriteria: []
  });

  let releasePlanner;
  let plannerStarted = false;
  let engineerStarted = false;
  engine.worker.runIntent = async () => {
    plannerStarted = true;
    await new Promise((resolve) => {
      releasePlanner = resolve;
    });
    return {
      run: { id: "run_planner" },
      artifact: {
        id: "artifact_planner",
        data: {
          kind: "task_graph",
          tasks: [
            {
              id: "planned",
              title: "Planned task",
              description: "Planner output.",
              dependencies: [],
              acceptanceCriteria: []
            }
          ]
        }
      }
    };
  };
  engine.worker.runTask = async () => {
    engineerStarted = true;
    return {
      run: { id: "run_engineer" },
      artifact: {
        id: "artifact_engineer",
        data: { kind: "implementation_report", taskId: implementationTask.id, summary: "done", changedFiles: [], verification: [] }
      }
    };
  };

  const firstTick = engine.tick();
  assert.equal(await waitFor(() => plannerStarted), true);
  const secondTick = engine.tick();
  assert.equal(await waitFor(() => engineerStarted, { timeoutMs: 100 }), true);
  releasePlanner();
  await Promise.all([firstTick, secondTick]);

  assert.equal((await store.getIntent(planningIntent.id)).status, "in_progress");
  assert.equal((await store.getTask(implementationTask.id)).status, "testing");
});

test("TeamEngine conditional task claim prevents duplicate implementation runs", async () => {
  const { engine, store } = await createMockEngine();
  const intent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "dedupe implementation",
    acceptanceCriteria: []
  });
  await store.updateIntent(intent.id, { status: "in_progress" });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Implement once",
    description: "Concurrent claims should not run this twice.",
    producerRole: "product_manager",
    dependencies: [],
    acceptanceCriteria: []
  });

  let calls = 0;
  engine.worker.runTask = async () => {
    calls += 1;
    await delay(20);
    return {
      run: { id: `run_engineer_${calls}` },
      artifact: {
        id: `artifact_engineer_${calls}`,
        data: { kind: "implementation_report", taskId: task.id, summary: "done", changedFiles: [], verification: [] }
      }
    };
  };

  const results = await Promise.all([
    engine.runImplementationOrCustomerTask(task, { role: "engineer", rule: { afterRunStatus: "testing" } }),
    engine.runImplementationOrCustomerTask(task, { role: "engineer", rule: { afterRunStatus: "testing" } })
  ]);

  assert.equal(calls, 1);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await store.getTask(task.id)).status, "testing");
});

test("TeamEngine conditional task claim prevents duplicate verification runs", async () => {
  const { engine, store } = await createMockEngine();
  const intent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "dedupe verification",
    acceptanceCriteria: []
  });
  await store.updateIntent(intent.id, { status: "in_progress" });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Verify once",
    description: "Concurrent QA claims should not run this twice.",
    producerRole: "product_manager",
    dependencies: [],
    acceptanceCriteria: []
  });
  await store.updateTask(task.id, { status: "testing", claimedByRole: "engineer" });
  const testingTask = await store.getTask(task.id);

  let calls = 0;
  engine.worker.runTask = async () => {
    calls += 1;
    await delay(20);
    return {
      run: { id: `run_qa_${calls}` },
      artifact: {
        id: `artifact_qa_${calls}`,
        data: { kind: "verification_report", taskId: task.id, verdict: "pass", findings: [], checks: [] }
      }
    };
  };

  const results = await Promise.all([
    engine.runVerification(testingTask, { role: "qa", rule: { afterRunStatus: "done" } }),
    engine.runVerification(testingTask, { role: "qa", rule: { afterRunStatus: "done" } })
  ]);
  const verified = await store.getTask(task.id);

  assert.equal(calls, 1);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(verified.status, "done");
  assert.equal(verified.claimedByRole, "engineer");
  assert.equal(verified.verificationHistory.length, 1);
});

test("TeamEngine blocks invalid product manager task graphs without creating partial tasks", async () => {
  const { engine, store } = await createMockEngine();
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "帮我做一个客户反馈驱动的小功能，并测试"
  });
  engine.worker.runIntent = async () => ({
    run: { id: "run_invalid" },
    artifact: {
      id: "artifact_invalid",
      data: {
        kind: "task_graph",
        tasks: []
      }
    }
  });

  await engine.tick();

  const blocked = await store.getIntent(intent.id);
  const tasks = await store.listTasks();
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.blocked.reason, /at least one task/i);
  assert.equal(tasks.length, 0);
});

test("TeamEngine blocks product manager graphs with standalone QA tasks", async () => {
  const { engine, store } = await createMockEngine();
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "不要创建独立 QA 任务"
  });
  engine.worker.runIntent = async () => ({
    run: { id: "run_standalone_qa" },
    artifact: {
      id: "artifact_standalone_qa",
      data: {
        kind: "task_graph",
        tasks: [
          {
            id: "qa",
            title: "独立验证",
            description: "错误地把 QA 当成产品任务。",
            consumerRole: "qa",
            dependencies: [],
            acceptanceCriteria: []
          }
        ]
      }
    }
  });

  await engine.tick();

  const blocked = await store.getIntent(intent.id);
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.blocked.reason, /must not include consumerRole/);
  assert.equal((await store.listTasks()).length, 0);
});

test("TeamEngine blocks product manager failures instead of leaving intent routing", async () => {
  const { engine, store } = await createMockEngine();
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "product manager 会失败"
  });
  engine.worker.runIntent = async () => {
    throw new Error("planner unavailable");
  };

  await engine.tick();

  const blocked = await store.getIntent(intent.id);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blocked.phase, "intent_consumer");
  assert.equal(blocked.blocked.message, "planner unavailable");
});

test("TeamEngine does not run tasks with missing dependencies", async () => {
  const { engine, store } = await createMockEngine();
  const intent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "wait for missing dependency",
    acceptanceCriteria: []
  });
  await store.updateIntent(intent.id, { status: "in_progress" });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Do blocked work",
    description: "This task references a missing dependency.",
    producerRole: "product_manager",
    consumerRole: "customer_success",
    dependencies: ["missing_role_or_task"],
    acceptanceCriteria: []
  });
  let runs = 0;
  engine.worker.runTask = async () => {
    runs += 1;
    throw new Error("missing dependency should not run");
  };

  await engine.tick();

  const waiting = await store.getTask(task.id);
  assert.equal(runs, 0);
  assert.equal(waiting.status, "waiting");
});

test("TeamEngine blocks implementation failures instead of leaving task working", async () => {
  const { engine, store } = await createMockEngine();
  const intent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "implementation failure",
    acceptanceCriteria: []
  });
  await store.updateIntent(intent.id, { status: "in_progress" });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Failing implementation",
    description: "Implementation throws.",
    producerRole: "product_manager",
    consumerRole: "engineer",
    dependencies: [],
    acceptanceCriteria: []
  });
  engine.worker.runTask = async () => {
    throw new Error("implementation unavailable");
  };

  await engine.tick();

  const blockedTask = await store.getTask(task.id);
  assert.equal(blockedTask.status, "blocked");
  assert.equal(blockedTask.blocked.phase, "implementation");
  assert.equal(blockedTask.blocked.message, "implementation unavailable");
  await engine.tick();
  const blockedIntent = await store.getIntent(intent.id);
  assert.equal(blockedIntent.status, "blocked");
});

test("TeamEngine normalizes product manager local id dependencies to generated task ids", async () => {
  const { engine, store } = await createMockEngine();
  const originalRunIntent = engine.worker.runIntent.bind(engine.worker);
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "实现后再回复客户"
  });
  engine.worker.runIntent = async (input) => {
    if (input.role !== "product_manager") return originalRunIntent(input);
    return {
      run: { id: "run_jobs_local_ids" },
      artifact: {
        id: "artifact_jobs_local_ids",
        data: {
          kind: "task_graph",
          tasks: [
            {
              id: "impl",
              title: "实现功能",
              description: "完成工程实现。",
              dependencies: [],
              acceptanceCriteria: ["实现完成"]
            },
            {
              id: "reply",
              title: "回复客户",
              description: "实现完成后回复客户。",
              dependencies: ["impl"],
              acceptanceCriteria: ["回复清楚"]
            }
          ]
        }
      }
    };
  };

  for (let i = 0; i < 4; i += 1) await engine.tick();

  const tasks = await store.listTasks();
  const implementation = tasks.find((task) => task.title === "实现功能");
  const reply = tasks.find((task) => task.title === "回复客户");
  assert.equal(reply.dependencies.includes("impl"), false);
  assert.deepEqual(reply.dependencies, [implementation.id]);
  assert.equal(reply.status, "done");
});

test("TeamEngine rejects self-dependent and cyclic product manager graphs without creating tasks", async () => {
  for (const [label, graphTasks, expectedReason] of [
    [
      "self",
      [
        {
          id: "impl",
          title: "实现功能",
          description: "错误地依赖自己。",
          dependencies: ["impl"],
          acceptanceCriteria: []
        }
      ],
      /self dependency/i
    ],
    [
      "cycle",
      [
        {
          id: "impl",
          title: "实现功能",
          description: "依赖回复形成环。",
          dependencies: ["reply"],
          acceptanceCriteria: []
        },
        {
          id: "reply",
          title: "回复客户",
          description: "依赖实现形成环。",
          dependencies: ["impl"],
          acceptanceCriteria: []
        }
      ],
      /cycle/i
    ]
  ]) {
    const { engine, store } = await createMockEngine();
    const { intent } = await engine.createIntentFromMessage({
      channel: "cli",
      transport: "cli",
      threadId: "cli",
      userId: "local",
      text: `graph ${label}`
    });
    engine.worker.runIntent = async () => ({
      run: { id: `run_${label}` },
      artifact: {
        id: `artifact_${label}`,
        data: {
          kind: "task_graph",
          tasks: graphTasks
        }
      }
    });

    await engine.tick();

    const blocked = await store.getIntent(intent.id);
    assert.equal(blocked.status, "blocked");
    assert.match(blocked.blocked.reason, expectedReason);
    assert.equal((await store.listTasks()).length, 0);
  }
});

test("TeamEngine QA rejection reuses the same engineer task until it passes", async () => {
  const { engine, store } = await createMockEngine();
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "实现一个需要先返工再通过的小功能"
  });

  await engine.tick();
  const initialTasks = await store.listTasks();
  const initialTaskIds = initialTasks.map((task) => task.id).sort();
  const linusTask = initialTasks.find((task) => task.title === "实现客户反馈驱动的小功能");
  await store.updateTask(linusTask.id, {
    context: { forceQaRejectRounds: 1 },
    reworkRounds: 0
  });

  await engine.tick();
  const rejected = await store.getTask(linusTask.id);
  assert.equal(rejected.status, "waiting");
  assert.equal(rejected.reworkRounds, 1);
  assert.equal(rejected.verificationHistory.length, 1);
  assert.equal(rejected.verificationHistory[0].verdict, "reject");
  assert.equal(rejected.latestRejectionArtifactId, rejected.verificationHistory[0].artifactId);
  assert.equal((await store.listTasks()).filter((task) => task.claimedByRole === "engineer").length, 1);
  assert.deepEqual((await store.listTasks()).map((task) => task.id).sort(), initialTaskIds);
  assert.equal((await store.listTasks()).some((task) => task.consumerRole === "qa"), false);

  await engine.tick();
  const retesting = await store.getTask(linusTask.id);
  assert.equal(retesting.status, "testing");
  assert.equal(retesting.reworkRounds, 1);

  await engine.tick();
  const passed = await store.getTask(linusTask.id);
  assert.equal(passed.status, "done");
  assert.equal(passed.reworkRounds, 1);
  assert.equal(passed.verificationHistory.length, 2);
  assert.equal(passed.verificationHistory[1].verdict, "pass");
  assert.equal((await store.listTasks()).filter((task) => task.claimedByRole === "engineer").length, 1);
  assert.deepEqual((await store.listTasks()).map((task) => task.id).sort(), initialTaskIds);
  assert.equal((await store.getIntent(intent.id)).status, "in_progress");
});

test("TeamEngine rework implementation only sees rejection artifacts for the same engineer task", async () => {
  const { engine, store } = await createMockEngine();
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "实现两个都需要返工的小功能"
  });
  engine.worker.runIntent = async () => ({
    run: { id: "run_jobs_two_engineers" },
    artifact: {
      id: "artifact_jobs_two_engineers",
      data: {
        kind: "task_graph",
        tasks: [
          {
            id: "engineer_a",
            title: "实现功能 A",
            description: "实现第一个功能。",
            dependencies: [],
            acceptanceCriteria: ["A 通过验收"]
          },
          {
            id: "engineer_b",
            title: "实现功能 B",
            description: "实现第二个功能。",
            dependencies: [],
            acceptanceCriteria: ["B 通过验收"]
          }
        ]
      }
    }
  });

  await engine.tick();
  const allTasks = await store.listTasks();
  const firstImplementedTask = allTasks.find((task) => task.claimedByRole === "engineer");
  const secondWaitingTask = allTasks.find((task) => task.status === "waiting" && task.claimedByRole !== "engineer");
  assert.ok(firstImplementedTask);
  assert.ok(secondWaitingTask);
  await engine.runImplementationOrCustomerTask(secondWaitingTask, {
    role: "engineer",
    rule: { afterRunStatus: "testing" }
  });
  const linusTasks = (await store.listTasks()).filter((task) => task.claimedByRole === "engineer");
  assert.equal(linusTasks.length, 2);
  await Promise.all(
    linusTasks.map((task) =>
      store.updateTask(task.id, {
        context: { forceQaRejectRounds: 1 },
        reworkRounds: 0
      })
    )
  );

  const tasksForRejection = await Promise.all(linusTasks.map((task) => store.getTask(task.id)));
  await Promise.all(tasksForRejection.map((task) => engine.runVerification(task, {
    role: "qa",
    rule: { afterRunStatus: "done" }
  })));
  const rejectedTasks = await Promise.all(linusTasks.map((task) => store.getTask(task.id)));
  assert.deepEqual(
    rejectedTasks.map((task) => task.status),
    ["waiting", "waiting"]
  );
  assert.notEqual(rejectedTasks[0].latestRejectionArtifactId, rejectedTasks[1].latestRejectionArtifactId);

  await engine.runImplementationOrCustomerTask(rejectedTasks[0], {
    role: rejectedTasks[0].claimedByRole,
    rule: { afterRunStatus: "testing" }
  });
  const firstAfterRework = await store.getTask(rejectedTasks[0].id);
  const firstLatestArtifact = await store.getArtifact(
    intent.id,
    firstAfterRework.artifactIds[firstAfterRework.artifactIds.length - 1]
  );

  assert.equal(firstLatestArtifact.data.addressedRejectionArtifactId, rejectedTasks[0].latestRejectionArtifactId);
});

test("TeamEngine completes a mock intent with role-agnostic tasks through the engineer fallback", async () => {
  const { engine, store } = await createMockEngine();
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "帮我做一个客户反馈驱动的小功能，并测试"
  });

  for (let i = 0; i < 8; i += 1) await engine.tick();

  const completed = await store.getIntent(intent.id);
  const tasks = await store.listTasks();
  const artifacts = await store.listArtifacts();
  const implementation = tasks.find((task) => task.claimedByRole === "engineer");
  assert.equal(completed.status, "done");
  assert.ok(implementation);
  assert.ok(tasks.every((task) => task.claimedByRole === "engineer"));
  assert.equal(tasks.some((task) => task.consumerRole), false);
  assert.equal(tasks.some((task) => task.consumerRole === "qa"), false);
  assert.ok(tasks.every((task) => task.status === "done"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "task_graph"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "implementation_report"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "verification_report"));
  assert.ok(artifacts.some((artifact) => artifact.kind === "final_aggregation"));
});

test("TeamEngine keeps finalization done when memory side effect fails", async () => {
  const { engine, store } = await createMockEngine();
  const warnings = [];
  let memoryAttempts = 0;
  let outboundAttempts = 0;
  engine.memory = {
    async rememberTaskResult() {
      memoryAttempts += 1;
      throw new Error("memory unavailable");
    }
  };
  engine.outboundReplyService = {
    async send() {
      outboundAttempts += 1;
      return { status: "sent" };
    }
  };
  engine.logger = { warn(entry) { warnings.push(entry); }, error(entry) { warnings.push(entry); } };
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "最终记忆失败也不能破坏完成状态"
  });

  await assert.doesNotReject(async () => {
    for (let i = 0; i < 8; i += 1) await engine.tick();
  });

  const completed = await store.getIntent(intent.id);
  assert.equal(completed.status, "done");
  assert.equal(memoryAttempts, 1);
  assert.equal(outboundAttempts, 1);
  assert.ok(warnings.some((entry) => entry.intentId === intent.id && entry.phase === "memory"));
});

test("TeamEngine stores final summaries in semantic memory on completion", async () => {
  const { engine, store, dataDir } = await createMockEngine();
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  engine.memory = memory;
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "完成后要沉淀 summary fact"
  });

  for (let i = 0; i < 8; i += 1) await engine.tick();

  const completed = await store.getIntent(intent.id);
  const facts = await memory.getFacts();
  const events = await memory.recentEvents(20);
  assert.equal(completed.status, "done");
  assert.equal(facts[`task:${intent.id}:summary`].value, completed.finalSummary);
  assert.ok(events.some((event) => event.type === "task_result" && event.summary === completed.finalSummary));
});

test("TeamEngine health exposes degraded memory side effects", async () => {
  const { engine } = await createMockEngine();
  engine.memory = {
    async recordEvent() {
      throw new Error("memory unavailable");
    }
  };

  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "记忆降级要出现在健康状态"
  });
  const health = await engine.health();

  assert.equal(health.ok, false);
  assert.equal(health.memory.ok, false);
  assert.equal(health.memory.lastFailure.intentId, intent.id);
  assert.equal(health.memory.lastFailure.phase, "intent_memory");
});

test("TeamEngine keeps finalization done when outbound side effect fails", async () => {
  const { engine, store } = await createMockEngine();
  const warnings = [];
  let memoryAttempts = 0;
  let outboundAttempts = 0;
  engine.memory = {
    async rememberTaskResult() {
      memoryAttempts += 1;
    }
  };
  engine.outboundReplyService = {
    async send() {
      outboundAttempts += 1;
      throw new Error("send failed https://hooks.example/feishu?token=secret-token message=customer text");
    }
  };
  engine.logger = { warn(entry) { warnings.push(entry); }, error(entry) { warnings.push(entry); } };
  const { intent } = await engine.createIntentFromMessage({
    channel: "cli",
    transport: "cli",
    threadId: "cli",
    userId: "local",
    text: "最终回复失败也不能破坏完成状态"
  });

  await assert.doesNotReject(async () => {
    for (let i = 0; i < 8; i += 1) await engine.tick();
  });

  const completed = await store.getIntent(intent.id);
  assert.equal(completed.status, "done");
  assert.equal(memoryAttempts, 1);
  assert.equal(outboundAttempts, 1);
  assert.ok(warnings.some((entry) => entry.intentId === intent.id && entry.phase === "outbound"));
  const health = await engine.health();
  assert.equal(health.ok, false);
  assert.equal(health.outbound.ok, false);
  assert.equal(health.outbound.lastFailure.phase, "outbound");
  assert.equal(health.outbound.lastFailure.intentId, intent.id);
  assert.equal(health.outbound.lastFailure.error, "outbound_failed");
  assert.doesNotMatch(JSON.stringify(health.outbound.lastFailure), /secret-token|customer text|hooks\.example/);
});

test("MockSubagentRunner returns generic provider output without Team Engine artifact shapes", async () => {
  const runner = new MockSubagentRunner();
  const result = await runner.run({
    role: "engineer",
    task: { id: "task_1", title: "修复失败用例" },
    intent: { id: "intent_1", goal: "交付功能" },
    previousArtifacts: [
      { id: "artifact_reject", kind: "turing_verification_report", data: { verdict: "reject" } }
    ]
  });

  assert.equal(result.finalMessage, "Mock provider response for engineer on task_1.");
  assert.deepEqual(result.structuredOutput, {});
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.equal(result.durationMs, 0);
});
