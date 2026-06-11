import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ToolExecutor } from "../src/agent-framework/application/tool-executor.js";
import { ToolRegistry } from "../src/agent-framework/domain/tools/tool-registry.js";
import { DEFAULT_AGENT_PROFILE_TOOLS } from "../src/agent-framework/infrastructure/default-agent-onboarding.js";
import { CodingAgentLauncherStore, onboardDefaultCodingAgentLaunchers } from "../src/agent-framework/infrastructure/coding-agent-launcher-store.js";
import { EngineToolHandlers } from "../src/team-engine/adapters/agent-framework/engine-tool-handlers.js";
import { MemoryStore } from "../src/agent-framework/infrastructure/memory-store.js";
import { EngineStore } from "../src/team-engine/infrastructure/engine-store.js";
import { ChannelConfigStore } from "../src/interfaces/channels/channel-config-store.js";
import { ToolAuditLog } from "../src/agent-framework/infrastructure/tools/tool-audit-log.js";

function testConfig(dataDir) {
  return {
    rootDir: dataDir,
    dataDir,
    workspace: dataDir,
    projectWorkspaceRoot: path.join(dataDir, "project-workspaces"),
    pollIntervalMs: 5000,
    feedbackScanIntervalMs: 14_400_000,
    asyncBash: {
      maxRunningPerRole: 8,
      maxRunningGlobal: 32
    },
    toolPolicy: {
      approvalMode: "never",
      maxAutoRisk: "medium",
      sandbox: "workspace-write",
      deniedTools: [],
      approvalRequiredTools: []
    },
    feishu: {}
  };
}

function defaultProfileToolRegistry(options = {}) {
  return new ToolRegistry({
    ...options,
    roleAllowlist: options.roleAllowlist || DEFAULT_AGENT_PROFILE_TOOLS
  });
}

async function createExecutor({
  outboundReplyService,
  mcpToolRunner,
  toolRegistry = defaultProfileToolRegistry(),
  asyncBashJobManager,
  registerEngineHandlers = true,
  engine,
  configPatch = {},
  codingAgentLaunchers
} = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-tools-test-"));
  const baseConfig = testConfig(dataDir);
  const config = {
    ...baseConfig,
    ...configPatch,
    asyncBash: { ...baseConfig.asyncBash, ...configPatch.asyncBash },
    toolPolicy: { ...baseConfig.toolPolicy, ...configPatch.toolPolicy },
    feishu: { ...baseConfig.feishu, ...configPatch.feishu }
  };
  const memory = new MemoryStore({ dataDir });
  const engineStore = new EngineStore({ dataDir });
  const channelConfigStore = new ChannelConfigStore({ dataDir, config });
  const toolAuditLog = new ToolAuditLog({ dataDir });
  await memory.init();
  await engineStore.init();
  await channelConfigStore.init();
  await toolAuditLog.init();
  const codingAgentLauncherStore = new CodingAgentLauncherStore({ dataDir, agentWorkspaceDir: path.join(dataDir, "agent-workspace") });
  await codingAgentLauncherStore.init();
  if (Array.isArray(codingAgentLaunchers)) {
    await codingAgentLauncherStore.write(codingAgentLaunchers);
  }
  if (registerEngineHandlers) {
    new EngineToolHandlers({
      config,
      engine,
      engineStore,
      channelConfigStore,
      toolRegistry,
      outboundReplyService
    }).register();
  }
  return {
    dataDir,
    memory,
    engineStore,
    executor: new ToolExecutor({
      config,
      memory,
      toolRegistry,
      toolAuditLog,
      mcpToolRunner,
      asyncBashJobManager,
      codingAgentLauncherStore,
      logger: { info() {}, error() {}, debug() {} }
    })
  };
}

test("ToolExecutor invokes custom registry handlers without hardcoded branches", async () => {
  const calls = [];
  const toolRegistry = new ToolRegistry({
    tools: [
      {
        id: "custom.echo",
        category: "custom",
        description: "Echo custom input through a registry handler.",
        risk: "low",
        parameters: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" }
          }
        }
      }
    ],
    roleAllowlist: { engineer: ["custom.echo"] }
  });
  toolRegistry.registerHandler("custom.echo", async (input, context) => {
    calls.push({ input, context });
    return {
      echoed: input.message,
      role: context.role,
      agentName: context.agentName,
      traceId: context.traceId
    };
  });
  const { dataDir, executor } = await createExecutor({ toolRegistry });

  const result = await executor.invoke({
    role: "engineer",
    agentName: "Ada",
    toolId: "custom.echo",
    input: { message: "registry works" },
    traceId: "trace_custom"
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.output, {
    echoed: "registry works",
    role: "engineer",
    agentName: "Ada",
    traceId: "trace_custom"
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].input, { message: "registry works" });
  assert.equal(calls[0].context.toolId, "custom.echo");
  const audit = await fs.readFile(path.join(dataDir, "tools", "audit-log", "framework", "tool-audit.jsonl"), "utf8");
  assert.ok(audit.includes("\"toolId\":\"custom.echo\""));
});

test("ToolExecutor requires explicit role attribution", async () => {
  const { executor } = await createExecutor();

  await assert.rejects(
    () => executor.invoke({
      toolId: "engine.projects",
      input: { action: "list" }
    }),
    /ToolExecutor.invoke requires role/
  );
});

test("ToolRegistry exposes synchronous and async Bash execution tools", () => {
  const registry = new ToolRegistry();
  const retiredToolIds = ["workspace.read", "workspace.write", "shell.exec", "test.run", "logs.read", "feishu.cli", "codex.exec"];

  assert.ok(registry.get("Bash"));
  assert.equal(registry.get("Bash").category, "execution");
  assert.deepEqual(registry.get("Bash").parameters.required, ["command"]);
  for (const toolId of ["async_bash.start", "async_bash.status", "async_bash.wait", "async_bash.cancel"]) {
    assert.equal(registry.get(toolId).category, "execution");
  }
  for (const toolId of ["coding_agent.start", "coding_agent.status", "coding_agent.wait", "coding_agent.cancel"]) {
    assert.equal(registry.get(toolId).category, "execution");
    assert.doesNotMatch(registry.get(toolId).description, /codex/i);
  }
  for (const toolId of retiredToolIds) {
    assert.equal(registry.get(toolId), undefined, `${toolId} should not be registered`);
  }
});

test("ToolExecutor starts configured Coding Agent jobs through profile launchers", async () => {
  const starts = [];
  const asyncBashJobManager = {
    async start(input, context) {
      starts.push({ input, context });
      return {
        jobId: "async_test_abcdef12",
        state: "running",
        cwd: input.cwd,
        command: input.command,
        timeoutMs: input.timeoutMs
      };
    }
  };
  const toolRegistry = defaultProfileToolRegistry({
    roleAllowlist: {
      engineer: ["coding_agent.start", "coding_agent.status", "coding_agent.wait", "coding_agent.cancel"]
    }
  });
  const { executor } = await createExecutor({ toolRegistry, asyncBashJobManager, codingAgentLaunchers: [{
    id: "default",
    name: "Coding Agent",
    description: "Generic implementation worker.",
    commandTemplate: "delegate-cli run --workspace {{workspace}} --prompt {{prompt}}",
    timeoutMs: 1234,
    env: {
      CODEX_SANDBOX: null,
      CUSTOM_FLAG: "enabled"
    }
  }] });
  const projectWorkspace = path.join(os.tmpdir(), "ai-team-project-with spaces");

  const result = await executor.invoke({
    role: "engineer",
    agentName: "Ada",
    toolId: "coding_agent.start",
    input: {
      prompt: "Implement the game shell and do not touch API files.",
      workspace: projectWorkspace
    },
    source: "agent_runtime",
    sessionId: "sess_coding_agent",
    traceId: "trace_coding_agent",
    hostContext: { workspace: "/wrong/workspace" },
    agentProfile: {
      role: "engineer"
    }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.output.kind, "coding_agent_job");
  assert.equal(result.output.codingAgent.id, "default");
  assert.equal(result.output.job.jobId, "async_test_abcdef12");
  assert.equal(starts.length, 1);
  assert.equal(starts[0].input.cwd, projectWorkspace);
  assert.equal(starts[0].input.timeoutMs, 1234);
  assert.equal(starts[0].input.env.CODEX_SANDBOX, null);
  assert.equal(starts[0].input.env.CUSTOM_FLAG, "enabled");
  assert.equal(
    starts[0].input.command,
    `delegate-cli run --workspace '${projectWorkspace}' --prompt 'Implement the game shell and do not touch API files.'`
  );
  assert.equal(starts[0].context.role, "engineer");
  assert.equal(starts[0].context.sessionId, "sess_coding_agent");

  await executor.invoke({
    role: "engineer",
    agentName: "Ada",
    toolId: "coding_agent.start",
    input: {
      prompt: "Run a longer implementation without shortening the launcher timeout.",
      workspace: projectWorkspace,
      timeoutMs: 120
    },
    source: "agent_runtime",
    sessionId: "sess_coding_agent",
    traceId: "trace_coding_agent",
    hostContext: { workspace: "/wrong/workspace" },
    agentProfile: {
      role: "engineer"
    }
  });

  assert.equal(starts.length, 2);
  assert.equal(starts[1].input.timeoutMs, 1234);
});

test("CodingAgentLauncherStore migrates legacy per-agent launchers before default onboarding", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-coding-launcher-migration-"));
  const agentWorkspaceDir = path.join(dataDir, "agent-workspace");
  await fs.mkdir(path.join(agentWorkspaceDir, "agents", "Ada"), { recursive: true });
  await fs.writeFile(path.join(agentWorkspaceDir, "agents", "Ada", "coding-agents.json"), JSON.stringify({
    agents: [{
      id: "legacy",
      name: "Legacy Coding Agent",
      description: "Existing Ada launcher.",
      command: "legacy-cli",
      args: ["run", "{{workspace}}", "{{prompt}}"],
      timeoutMs: 45000,
      env: { LEGACY_TOKEN: "secret" }
    }]
  }, null, 2));
  const store = new CodingAgentLauncherStore({ dataDir, agentWorkspaceDir });
  await store.init();
  const marked = [];

  await onboardDefaultCodingAgentLaunchers({
    store,
    onboardingStateStore: {
      async has() { return false; },
      async mark(key) { marked.push(key); }
    }
  });

  assert.deepEqual(await store.list(), [{
    id: "legacy",
    name: "Legacy Coding Agent",
    description: "Existing Ada launcher.",
    command: "legacy-cli",
    args: ["run", "{{workspace}}", "{{prompt}}"],
    commandTemplate: "legacy-cli run {{workspace}} {{prompt}}",
    timeoutMs: 45000,
    env: { LEGACY_TOKEN: "secret" }
  }]);
  assert.deepEqual(marked, ["codingAgentLaunchers"]);
});

test("CodingAgentLauncherStore backfills default Codex launcher when onboarding marker exists but file is missing", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-coding-launcher-backfill-"));
  const agentWorkspaceDir = path.join(dataDir, "agent-workspace");
  const store = new CodingAgentLauncherStore({ dataDir, agentWorkspaceDir });
  await store.init();
  const marked = [];

  await onboardDefaultCodingAgentLaunchers({
    store,
    onboardingStateStore: {
      async has() { return true; },
      async mark(key) { marked.push(key); }
    }
  });

  const [launcher] = await store.list();
  assert.match(launcher.commandTemplate, /^codex exec /);
  assert.equal(launcher.id, "default");
  assert.deepEqual(marked, []);
});

test("CodingAgentLauncherStore respects an intentionally empty launcher file after onboarding", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-coding-launcher-empty-"));
  const agentWorkspaceDir = path.join(dataDir, "agent-workspace");
  const store = new CodingAgentLauncherStore({ dataDir, agentWorkspaceDir });
  await store.init();
  await store.write([]);

  await onboardDefaultCodingAgentLaunchers({
    store,
    onboardingStateStore: {
      async has() { return true; },
      async mark() { throw new Error("already onboarded stores should not be marked again"); }
    }
  });

  assert.deepEqual(await store.list(), []);
});

test("ToolExecutor rejects Coding Agent launch when the profile has no launcher config", async () => {
  const toolRegistry = defaultProfileToolRegistry({
    roleAllowlist: {
      engineer: ["coding_agent.start"]
    }
  });
  const { executor } = await createExecutor({ toolRegistry, codingAgentLaunchers: [] });

  await assert.rejects(
    executor.invoke({
      role: "engineer",
      agentName: "Ada",
      toolId: "coding_agent.start",
      input: { prompt: "Implement feature" },
      source: "agent_runtime",
      agentProfile: {}
    }),
    /no Coding Agent launcher configured/
  );
});

test("ToolExecutor reports missing Coding Agent launcher store as a configuration error", async () => {
  const toolRegistry = defaultProfileToolRegistry({
    roleAllowlist: {
      engineer: ["coding_agent.start"]
    }
  });
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-tools-test-"));
  const executor = new ToolExecutor({
    config: testConfig(dataDir),
    memory: {},
    toolRegistry,
    asyncBashJobManager: {
      async start() {
        throw new Error("should not start without launcher store");
      }
    },
    logger: { info() {}, error() {}, debug() {} }
  });

  await assert.rejects(
    executor.invoke({
      role: "engineer",
      agentName: "Ada",
      toolId: "coding_agent.start",
      input: { prompt: "Implement feature" },
      source: "agent_runtime",
      agentProfile: {}
    }),
    /Coding Agent launcher store unavailable/
  );
});

test("ToolExecutor Coding Agent status, wait, and cancel delegate to async job manager", async () => {
  const calls = [];
  const asyncBashJobManager = {
    async status(input, context) {
      calls.push(["status", input, context]);
      return { jobs: [{ jobId: input.jobId, state: "running" }], count: 1 };
    },
    async wait(input, context) {
      calls.push(["wait", input, context]);
      return { jobs: [{ jobId: input.jobId, state: "completed" }], count: 1 };
    },
    async cancel(input, context) {
      calls.push(["cancel", input, context]);
      return { jobs: [{ jobId: input.jobId, state: "cancelled" }], count: 1 };
    }
  };
  const toolRegistry = defaultProfileToolRegistry({
    roleAllowlist: {
      engineer: ["coding_agent.status", "coding_agent.wait", "coding_agent.cancel"]
    }
  });
  const { executor } = await createExecutor({ toolRegistry, asyncBashJobManager });

  await executor.invoke({ role: "engineer", toolId: "coding_agent.status", input: { jobId: "async_test_abcdef12" } });
  await executor.invoke({ role: "engineer", toolId: "coding_agent.wait", input: { jobId: "async_test_abcdef12" } });
  await executor.invoke({ role: "engineer", toolId: "coding_agent.cancel", input: { jobId: "async_test_abcdef12" } });

  assert.deepEqual(calls.map((call) => call[0]), ["status", "wait", "cancel"]);
  assert.equal(calls[0][2].toolId, "coding_agent.status");
  assert.equal(calls[1][2].toolId, "coding_agent.wait");
  assert.equal(calls[2][2].toolId, "coding_agent.cancel");
});

test("ToolExecutor Bash runs unrestricted shell commands from the host workspace and records audit", async () => {
  const { dataDir, executor } = await createExecutor();
  const projectWorkspace = path.join(dataDir, "project-workspace");
  await fs.mkdir(projectWorkspace, { recursive: true });
  await fs.writeFile(path.join(projectWorkspace, "inside.txt"), "inside workspace\n", "utf8");

  const result = await executor.invoke({
    role: "engineer",
    agentName: "Ada",
    toolId: "Bash",
    input: { command: "cat inside.txt && printf OUTSIDE > ../outside.txt" },
    source: "agent_runtime",
    sessionId: "sess_bash",
    traceId: "trace_bash",
    hostContext: { workspace: projectWorkspace }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.output.exitCode, 0);
  assert.match(result.output.stdout, /inside workspace/);
  assert.equal(await fs.readFile(path.join(dataDir, "outside.txt"), "utf8"), "OUTSIDE");
  const audit = JSON.parse((await fs.readFile(path.join(dataDir, "tools", "audit-log", "framework", "tool-audit.jsonl"), "utf8")).trim().split("\n").at(-1));
  assert.equal(audit.toolId, "Bash");
  assert.equal(audit.role, "engineer");
  assert.equal(audit.sessionId, "sess_bash");
  assert.equal(audit.traceId, "trace_bash");
  assert.equal(audit.input.command, "cat inside.txt && printf OUTSIDE > ../outside.txt");
  assert.equal(audit.output.exitCode, 0);
});

test("ToolExecutor async Bash starts jobs, reports tails, reads full logs, and waits for completion", async () => {
  const toolRegistry = defaultProfileToolRegistry({
    roleAllowlist: {
      engineer: ["async_bash.start", "async_bash.status", "async_bash.wait", "async_bash.cancel"]
    }
  });
  const { dataDir, executor } = await createExecutor({ toolRegistry });

  const started = await executor.invoke({
    role: "engineer",
    agentName: "Ada",
    toolId: "async_bash.start",
    input: {
      command: "for i in 1 2 3 4 5; do echo line-$i; sleep 0.02; done",
      cwd: dataDir
    },
    source: "agent_runtime",
    sessionId: "sess_async",
    traceId: "trace_async"
  });

  assert.equal(started.status, "completed");
  assert.match(started.output.jobId, /^async_/);
  assert.equal(started.output.state, "running");

  const running = await executor.invoke({
    role: "engineer",
    toolId: "async_bash.status",
    input: { state: "running", tailLines: 2 }
  });
  assert.ok(running.output.jobs.some((job) => job.jobId === started.output.jobId));

  const completed = await executor.invoke({
    role: "engineer",
    toolId: "async_bash.wait",
    input: { jobIds: [started.output.jobId], tailLines: 2, timeoutMs: 2000 }
  });
  const job = completed.output.jobs[0];
  assert.equal(job.state, "completed");
  assert.equal(job.exitCode, 0);
  assert.match(job.stdoutTail, /line-5/);
  assert.doesNotMatch(job.stdoutTail, /line-1/);
  assert.equal(job.truncated, true);
  assert.match(job.fullLogHint, /logMode=full/);

  const full = await executor.invoke({
    role: "engineer",
    toolId: "async_bash.status",
    input: { jobId: started.output.jobId, logMode: "full", stream: "stdout" }
  });
  assert.match(full.output.jobs[0].stdout, /line-1/);
  assert.match(full.output.jobs[0].stdout, /line-5/);

  const cursor = await executor.invoke({
    role: "engineer",
    toolId: "async_bash.status",
    input: { jobId: started.output.jobId, cursor: { stdoutLine: 3, stderrLine: 0 } }
  });
  assert.match(cursor.output.jobs[0].stdoutTail, /line-4/);
  assert.match(cursor.output.jobs[0].stdoutTail, /line-5/);
  assert.doesNotMatch(cursor.output.jobs[0].stdoutTail, /line-1/);

  const quick = await executor.invoke({
    role: "engineer",
    toolId: "async_bash.start",
    input: { command: "printf quick" }
  });
  const quickDone = await executor.invoke({
    role: "engineer",
    toolId: "async_bash.wait",
    input: { jobId: quick.output.jobId, timeoutMs: 2000, logMode: "full", stream: "stdout" }
  });
  assert.equal(quickDone.output.jobs[0].state, "completed");
  assert.equal(quickDone.output.jobs[0].stdout, "quick");

  const audit = await fs.readFile(path.join(dataDir, "tools", "audit-log", "framework", "tool-audit.jsonl"), "utf8");
  assert.ok(audit.includes("\"toolId\":\"async_bash.start\""));
  assert.ok(audit.includes("\"toolId\":\"async_bash.wait\""));
});

test("ToolExecutor async Bash can cancel running jobs", async () => {
  const toolRegistry = defaultProfileToolRegistry({
    roleAllowlist: {
      engineer: ["async_bash.start", "async_bash.status", "async_bash.wait", "async_bash.cancel"]
    }
  });
  const { executor } = await createExecutor({ toolRegistry });
  const started = await executor.invoke({
    role: "engineer",
    toolId: "async_bash.start",
    input: { command: "sleep 5" }
  });

  const cancelled = await executor.invoke({
    role: "engineer",
    toolId: "async_bash.cancel",
    input: { jobId: started.output.jobId }
  });

  assert.equal(cancelled.output.jobs[0].state, "cancelled");
});

test("ToolExecutor async Bash cancel requires an explicit target", async () => {
  const toolRegistry = defaultProfileToolRegistry({
    roleAllowlist: {
      engineer: ["async_bash.cancel"]
    }
  });
  const { executor } = await createExecutor({ toolRegistry });

  await assert.rejects(
    executor.invoke({
      role: "engineer",
      toolId: "async_bash.cancel",
      input: {}
    }),
    /async_bash\.cancel requires jobId, jobIds, or state=running/
  );
});

test("ToolExecutor async Bash enforces per-role running job limit", async () => {
  const toolRegistry = defaultProfileToolRegistry({
    roleAllowlist: {
      engineer: ["async_bash.start", "async_bash.cancel"]
    }
  });
  const { executor } = await createExecutor({ toolRegistry });

  const running = [];
  try {
    for (let index = 0; index < 8; index += 1) {
      const started = await executor.invoke({
        role: "engineer",
        toolId: "async_bash.start",
        input: { command: "sleep 5" }
      });
      running.push(started.output.jobId);
    }

    await assert.rejects(
      executor.invoke({
        role: "engineer",
        toolId: "async_bash.start",
        input: { command: "echo too many" }
      }),
      /async Bash running job limit reached/
    );
  } finally {
    await Promise.all(running.map((jobId) =>
      executor.invoke({
        role: "engineer",
        toolId: "async_bash.cancel",
        input: { jobId }
      }).catch(() => undefined)
    ));
  }
});

test("ToolExecutor async Bash enforces global running job limit", async () => {
  const toolRegistry = defaultProfileToolRegistry({
    roleAllowlist: {
      engineer: ["async_bash.start", "async_bash.cancel"]
    }
  });
  const { executor } = await createExecutor({
    toolRegistry,
    configPatch: { asyncBash: { maxRunningPerRole: 8, maxRunningGlobal: 1 } }
  });

  let jobId;
  try {
    const started = await executor.invoke({
      role: "engineer",
      toolId: "async_bash.start",
      input: { command: "sleep 5" }
    });
    jobId = started.output.jobId;

    await assert.rejects(
      executor.invoke({
        role: "engineer",
        toolId: "async_bash.start",
        input: { command: "echo too many globally" }
      }),
      /global async Bash running job limit reached/
    );
  } finally {
    if (jobId) {
      await executor.invoke({
        role: "engineer",
        toolId: "async_bash.cancel",
        input: { jobId }
      }).catch(() => undefined);
    }
  }
});

test("ToolExecutor skill tool returns installed Skill markdown by name", async () => {
  const { executor } = await createExecutor();

  const result = await executor.invoke({
    role: "engineer",
    agentName: "Ada",
    toolId: "skill",
    input: { name: "patching" },
    source: "agent_runtime",
    agentProfile: {
      skills: [{
        id: "patching",
        description: "Patch code safely.",
        path: "/tmp/Ada/skills/patching/SKILL.md",
        content: "# Patching\n\nUse small, reviewed patches."
      }]
    }
  });

  assert.equal(result.output.id, "patching");
  assert.equal(result.output.name, "patching");
  assert.equal(result.output.kind, "skill");
  assert.match(result.output.content, /Use small, reviewed patches/);
});

test("ToolExecutor allows AgentRuntime skill reads even when old role tools omit skill", async () => {
  const { executor } = await createExecutor({
    toolRegistry: defaultProfileToolRegistry({
      roleAllowlist: { engineer: ["memory.search", "Bash"] }
    })
  });

  const result = await executor.invoke({
    role: "engineer",
    agentName: "Ada",
    toolId: "skill",
    input: { name: "patching" },
    source: "agent_runtime",
    agentProfile: {
      tools: ["memory.search", "Bash"],
      skills: [{ id: "patching", content: "# Patching\n\nRead me." }]
    }
  });

  assert.equal(result.output.id, "patching");
  assert.match(result.output.content, /Read me/);
});

test("ToolExecutor skill tool rejects skills that are not installed for the Agent", async () => {
  const { executor } = await createExecutor();

  await assert.rejects(
    executor.invoke({
      role: "engineer",
      agentName: "Ada",
      toolId: "skill",
      input: { name: "unconfigured" },
      source: "agent_runtime",
      agentProfile: { skills: [{ id: "patching", content: "# Patching" }] }
    }),
    /skill is not installed: unconfigured/
  );
});

test("ToolExecutor invokes configured MCP-origin tools as normal tools through the tool runner", async () => {
  let runnerInput;
  const { executor } = await createExecutor({
    mcpToolRunner: {
      async call(input) {
        runnerInput = input;
        return { captured: true, id: input.tool.id, arguments: input.arguments };
      }
    }
  });

  const result = await executor.invoke({
    role: "engineer",
    agentName: "Ada",
    toolId: "github.search_issues",
    input: { query: "is:open label:bug" },
    source: "agent_runtime",
    agentProfile: {
      tools: ["github.search_issues"],
      mcps: [{
        id: "github",
        tools: [{
          id: "github.search_issues",
          name: "search_issues",
          description: "Search GitHub issues.",
          parameters: {
            type: "object",
            required: ["query"],
            properties: { query: { type: "string" } }
          }
        }]
      }]
    }
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.output, {
    captured: true,
    id: "github.search_issues",
    arguments: { query: "is:open label:bug" }
  });
  assert.equal(runnerInput.tool.id, "github.search_issues");
  assert.equal(runnerInput.role, "engineer");
});

test("ToolExecutor can search and write memory with audit", async () => {
  const { dataDir, executor } = await createExecutor();
  await executor.invoke({
    role: "engineer",
    toolId: "memory.write",
    input: { key: "agent.tooling", value: "tool executor is enabled" }
  });
  const result = await executor.invoke({
    role: "engineer",
    toolId: "memory.search",
    input: { query: "executor", limit: 3 }
  });

  assert.equal(result.status, "completed");
  assert.ok(result.output.some((item) => item.id === "agent.tooling"));
  const audit = await fs.readFile(path.join(dataDir, "tools", "audit-log", "framework", "tool-audit.jsonl"), "utf8");
  assert.ok(audit.includes("tool_invocation"));
});

test("ToolExecutor can write episodic memory events", async () => {
  const { executor, memory } = await createExecutor();
  await executor.invoke({
    role: "engineer",
    toolId: "memory.write",
    input: {
      layer: "episodic",
      key: "ignored-for-events",
      value: "Ada completed a rework cycle",
      metadata: { intentId: "intent_1", taskId: "task_1" }
    }
  });

  const events = await memory.recentEvents(5);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "tool_memory_write");
  assert.equal(events[0].text, "Ada completed a rework cycle");
  assert.equal(events[0].intentId, "intent_1");
  assert.equal(events[0].taskId, "task_1");
});

test("ToolExecutor can transition engine entities with agent attribution", async () => {
  const { dataDir, executor, engineStore } = await createExecutor();
  const intent = await engineStore.createIntent({
    goal: "transition through tool",
    source: { channel: "cli", threadId: "cli", userId: "local" }
  });

  const result = await executor.invoke({
    role: "product_manager",
    toolId: "engine.transition",
    taskId: intent.id,
    input: {
      entityType: "intent",
      entityId: intent.id,
      status: "routing",
      reason: "agent accepted wake rule",
      runId: "run_1"
    },
    source: "agent_tool"
  });

  assert.equal(result.status, "completed");
  assert.equal(result.output.status, "routing");
  assert.equal(result.output.operations[0].agentRole, "product_manager");
  assert.equal(result.output.operations[0].runId, "run_1");
  const audit = await fs.readFile(path.join(dataDir, "tools", "audit-log", "framework", "tool-audit.jsonl"), "utf8");
  assert.ok(audit.includes("\"toolId\":\"engine.transition\""));
  assert.ok(audit.includes("\"source\":\"agent_tool\""));
});

test("ToolExecutor lets CEO create TeamEngine intents through audited engine.create_intent", async () => {
  const engineCalls = [];
  const fakeEngine = {
    async createIntentFromMessage(input) {
      engineCalls.push(input);
      return {
        intent: { id: "intent_created", goal: input.text },
        task: { id: "intent_created", text: input.text },
        created: true,
        ignored: false
      };
    }
  };
  const { dataDir, executor } = await createExecutor({ engine: fakeEngine });

  const result = await executor.invoke({
    role: "ceo_cto",
    toolId: "engine.create_intent",
    source: "agent_runtime",
    hostContext: {
      channel: "feishu",
      source: "feishu_ws",
      transport: "feishu_websocket",
      threadId: "oc_1",
      userId: "ou_1",
      userName: "founder",
      eventId: "om_1",
      replyTarget: { chatId: "oc_1", messageId: "om_1" },
      workspace: "/workspace"
    },
    input: {
      text: "把 Dashboard 支持中英文切换",
      name: "Dashboard i18n",
      description: "让仪表盘支持中英文切换，并保留现有 TeamEngine 边界。",
      projectName: "AI Team Dashboard",
      channel: "model_guess",
      threadId: "model_thread",
      userId: "model_user",
      replyTarget: { channel: "feishu", threadId: "model_thread", userId: "model_user" },
      metadata: { priority: "high" }
    }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.output.intent.id, "intent_created");
  assert.equal(engineCalls.length, 1);
  assert.equal(engineCalls[0].text, "把 Dashboard 支持中英文切换");
  assert.equal(engineCalls[0].channel, "feishu");
  assert.equal(engineCalls[0].threadId, "oc_1");
  assert.equal(engineCalls[0].userId, "ou_1");
  assert.deepEqual(engineCalls[0].replyTarget, { chatId: "oc_1", messageId: "om_1" });
  assert.equal(engineCalls[0].workspace, "/workspace");
  assert.equal(engineCalls[0].projectName, "AI Team Dashboard");
  assert.equal(engineCalls[0].name, "Dashboard i18n");
  assert.equal(engineCalls[0].description, "让仪表盘支持中英文切换，并保留现有 TeamEngine 边界。");
  assert.equal(engineCalls[0].metadata.priority, "high");
  const audit = await fs.readFile(path.join(dataDir, "tools", "audit-log", "framework", "tool-audit.jsonl"), "utf8");
  assert.ok(audit.includes("\"toolId\":\"engine.create_intent\""));
  assert.ok(audit.includes("\"source\":\"agent_runtime\""));
});

test("ToolExecutor lets CEO create and inspect Engine projects", async () => {
  const { dataDir, executor } = await createExecutor();

  const created = await executor.invoke({
    role: "ceo_cto",
    toolId: "engine.projects",
    source: "agent_runtime",
    input: {
      action: "create",
      name: "客户成功中台"
    }
  });

  assert.equal(created.status, "completed");
  assert.equal(created.output.project.slug, "客户成功中台");
  assert.equal(created.output.project.workspace, path.join(dataDir, "project-workspaces", "客户成功中台"));
  await fs.access(created.output.project.workspace);

  const listed = await executor.invoke({
    role: "ceo_cto",
    toolId: "engine.projects",
    source: "agent_runtime",
    input: { action: "list" }
  });
  assert.equal(listed.output.projects.length, 1);
  assert.equal(listed.output.projects[0].id, created.output.project.id);

  const inspected = await executor.invoke({
    role: "ceo_cto",
    toolId: "engine.projects",
    source: "agent_runtime",
    input: {
      action: "get",
      projectId: created.output.project.id
    }
  });
  assert.equal(inspected.output.project.name, "客户成功中台");
});

test("ToolExecutor lets CEO retry blocked TeamEngine work through audited engine.retry_blocked", async () => {
  const engineCalls = [];
  const fakeEngine = {
    async retryBlockedWork(input) {
      engineCalls.push(input);
      return {
        retried: true,
        entityType: input.entityType,
        entityId: input.entityId,
        retryStatus: "testing"
      };
    }
  };
  const { dataDir, executor } = await createExecutor({ engine: fakeEngine });

  const result = await executor.invoke({
    role: "ceo_cto",
    toolId: "engine.retry_blocked",
    source: "agent_runtime",
    input: {
      entityType: "task",
      entityId: "task_blocked",
      reason: "用户要求继续推进"
    }
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.output, {
    retried: true,
    entityType: "task",
    entityId: "task_blocked",
    retryStatus: "testing"
  });
  assert.equal(engineCalls.length, 1);
  assert.deepEqual(engineCalls[0], {
    entityType: "task",
    entityId: "task_blocked",
    reason: "用户要求继续推进",
    agentRole: "ceo_cto"
  });
  const audit = await fs.readFile(path.join(dataDir, "tools", "audit-log", "framework", "tool-audit.jsonl"), "utf8");
  assert.ok(audit.includes("\"toolId\":\"engine.retry_blocked\""));
  assert.ok(audit.includes("\"source\":\"agent_runtime\""));
});

test("ToolExecutor Bash reads workspace directories through normal shell commands", async () => {
  const { dataDir, executor } = await createExecutor();
  const projectWorkspace = path.join(dataDir, "directory-read-workspace");
  await fs.mkdir(path.join(projectWorkspace, "src"), { recursive: true });
  await fs.writeFile(path.join(projectWorkspace, "README.md"), "hello\n", "utf8");
  await fs.writeFile(path.join(projectWorkspace, "src", "index.js"), "console.log('hi');\n", "utf8");

  const result = await executor.invoke({
    role: "engineer",
    toolId: "Bash",
    hostContext: { workspace: projectWorkspace },
    input: { command: "ls -1" }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.output.cwd, projectWorkspace);
  assert.match(result.output.stdout, /README\.md/);
  assert.match(result.output.stdout, /src/);
});

test("ToolExecutor Bash writes files through normal shell commands", async () => {
  const { dataDir, executor } = await createExecutor();
  const result = await executor.invoke({
    role: "engineer",
    toolId: "Bash",
    input: { command: "mkdir -p notes && printf 'Bash write works\\n' > notes/output.txt" }
  });

  const file = path.join(dataDir, "notes", "output.txt");
  assert.equal(result.status, "completed");
  assert.equal(result.output.exitCode, 0);
  assert.equal(await fs.readFile(file, "utf8"), "Bash write works\n");
});

test("ToolExecutor Bash resolves cwd from Engine host context", async () => {
  const { dataDir, executor } = await createExecutor();
  const projectWorkspace = path.join(dataDir, "project-workspace");
  await fs.mkdir(projectWorkspace, { recursive: true });
  await fs.writeFile(path.join(projectWorkspace, "project.txt"), "project scoped file\n", "utf8");

  const result = await executor.invoke({
    role: "engineer",
    toolId: "Bash",
    hostContext: { workspace: projectWorkspace },
    input: { command: "cat project.txt && printf 'written inside project\\n' > notes-output.txt" }
  });

  assert.equal(result.output.cwd, projectWorkspace);
  assert.match(result.output.stdout, /project scoped file/);
  assert.equal(await fs.readFile(path.join(projectWorkspace, "notes-output.txt"), "utf8"), "written inside project\n");
});

test("ToolExecutor audit redacts secret-looking memory values from input and output", async () => {
  const { dataDir, executor } = await createExecutor();
  await executor.invoke({
    role: "engineer",
    toolId: "memory.write",
    input: {
      key: "agent.redaction",
      value: "token=super-secret-value sk-testsecret12345"
    }
  });

  const auditRaw = await fs.readFile(path.join(dataDir, "tools", "audit-log", "framework", "tool-audit.jsonl"), "utf8");
  assert.equal(auditRaw.includes("super-secret-value"), false);
  assert.equal(auditRaw.includes("sk-testsecret12345"), false);
  assert.ok(auditRaw.includes("[redacted]"));
});

test("ToolExecutor audit includes trace and session metadata without hostContext values", async () => {
  const { dataDir, executor } = await createExecutor();
  await fs.writeFile(path.join(dataDir, "audit-context.txt"), "context file\n", "utf8");
  await executor.invoke({
    role: "engineer",
    agentName: "Ada",
    toolId: "Bash",
    input: { command: "cat audit-context.txt" },
    source: "agent_runtime",
    sessionId: "sess_audit",
    traceId: "trace_audit",
    hostContext: {
      engineRunId: "run_public_key",
      token: "host-context-token-secret"
    }
  });

  const audit = JSON.parse((await fs.readFile(path.join(dataDir, "tools", "audit-log", "framework", "tool-audit.jsonl"), "utf8")).trim().split("\n").at(-1));
  assert.equal(audit.agentName, "Ada");
  assert.equal(audit.sessionId, "sess_audit");
  assert.equal(audit.traceId, "trace_audit");
  assert.deepEqual(audit.hostContextKeys, ["engineRunId"]);
  assert.equal(JSON.stringify(audit).includes("run_public_key"), false);
  assert.equal(JSON.stringify(audit).includes("host-context-token-secret"), false);
});

test("ToolExecutor rejects MCP tools that are not explicitly enabled on the Agent profile", async () => {
  let mcpCalled = false;
  const { executor } = await createExecutor({
    mcpToolRunner: {
      async call() {
        mcpCalled = true;
        return { ok: true };
      }
    }
  });
  const agentProfile = {
    role: "engineer",
    tools: ["Bash"],
    mcps: [{
      id: "github",
      tools: [{
        name: "search_issues",
        description: "Search issues.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } }
        }
      }]
    }]
  };

  await assert.rejects(
    executor.invoke({
      role: "engineer",
      agentName: "Ada",
      source: "agent_runtime",
      toolId: "github.search_issues",
      input: { query: "runtime" },
      agentProfile
    }),
    /not allowed/
  );
  assert.equal(mcpCalled, false);
});

test("ToolExecutor validates required top-level tool parameters from registry definitions", async () => {
  const { executor } = await createExecutor();

  await assert.rejects(
    executor.invoke({
      role: "engineer",
      toolId: "Bash",
      input: {}
    }),
    /requires command/
  );
});

test("ToolExecutor Bash runs ordinary shell commands", async () => {
  const { executor } = await createExecutor();
  const result = await executor.invoke({
    role: "engineer",
    toolId: "Bash",
    input: { command: "node --version" }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.output.exitCode, 0);
  assert.match(result.output.stdout.trim(), /^v\d+\./);
});

test("ToolRegistry describes Bash as a shell command", () => {
  const bashTool = new ToolRegistry().get("Bash");

  assert.deepEqual(bashTool.parameters.required, ["command"]);
  assert.equal(bashTool.parameters.properties.command.type, "string");
  assert.match(bashTool.description, /Bash/i);
  assert.equal(bashTool.parameters.properties.cwd.type, "string");
});

test("ToolExecutor Bash runs shell command strings directly", async () => {
  const { executor } = await createExecutor();
  const result = await executor.invoke({
    role: "engineer",
    toolId: "Bash",
    input: { command: "node --version" }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.output.exitCode, 0);
  assert.match(result.output.stdout.trim(), /^v\d+\./);
});

test("ToolExecutor Bash runs shell chains", async () => {
  const { executor } = await createExecutor();
  const result = await executor.invoke({
    role: "engineer",
    toolId: "Bash",
    input: { command: "node --version && echo \"VERSION_OK\" || echo \"VERSION_FAIL\"" }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.output.exitCode, 0);
  assert.match(result.output.stdout, /^v\d+\./);
  assert.match(result.output.stdout, /VERSION_OK/);
  assert.doesNotMatch(result.output.stdout, /VERSION_FAIL/);
});

test("ToolExecutor Bash runs workspace node test files", async () => {
  const { dataDir, executor } = await createExecutor();
  await fs.writeFile(
    path.join(dataDir, "sample.test.js"),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('sample', () => assert.equal(1, 1));\n",
    "utf8"
  );

  const result = await executor.invoke({
    role: "qa",
    toolId: "Bash",
    input: { command: "node --test sample.test.js", cwd: dataDir }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.output.exitCode, 0);
});

test("ToolExecutor Bash has no workspace symlink boundary", async () => {
  const { dataDir, executor } = await createExecutor();
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-tools-outside-"));
  const outsideRead = path.join(outsideDir, "outside-read.txt");
  const outsideWrite = path.join(outsideDir, "outside-write.txt");
  await fs.writeFile(outsideRead, "outside read\n", "utf8");
  await fs.writeFile(outsideWrite, "outside write original\n", "utf8");
  await fs.symlink(outsideRead, path.join(dataDir, "read-link.txt"));
  await fs.symlink(outsideWrite, path.join(dataDir, "write-link.txt"));

  const result = await executor.invoke({
    role: "engineer",
    toolId: "Bash",
    input: { command: "cat read-link.txt && printf 'escaped write\\n' > write-link.txt" }
  });

  assert.equal(result.status, "completed");
  assert.match(result.output.stdout, /outside read/);
  assert.equal(await fs.readFile(outsideWrite, "utf8"), "escaped write\n");
});

test("ToolExecutor Bash does not reject previously disallowed commands", async () => {
  const { executor } = await createExecutor();
  const result = await executor.invoke({
    role: "qa",
    toolId: "Bash",
    input: { command: "find . -maxdepth 1 -type f -name '*.missing' | wc -l" }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.output.exitCode, 0);
});

test("ToolExecutor rejects tools outside role allowlist", async () => {
  const { executor } = await createExecutor();
  await assert.rejects(
    executor.invoke({
      role: "customer_success",
      toolId: "Bash",
      input: { command: "echo should not run" }
    }),
    /not allowed/
  );
});

test("ToolExecutor channel.reply sends through outbound reply service", async () => {
  const sent = [];
  const outboundReplyService = {
    async send(task, message, options) {
      sent.push({ task, message, options });
      return { status: "sent", taskId: task.id, message, source: options.source };
    }
  };
  const { executor, engineStore } = await createExecutor({ outboundReplyService });
  const intent = await engineStore.createIntent({
    goal: "hello",
    source: { channel: "feishu", source: "test", threadId: "oc_1", userId: "user_1" },
    replyTarget: { chatId: "oc_1", messageId: "om_1" }
  });

  const result = await executor.invoke({
    role: "ceo_cto",
    toolId: "channel.reply",
    taskId: intent.id,
    input: { text: "收到" }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.output.status, "sent");
  assert.equal(sent[0].task.id, intent.id);
  assert.equal(sent[0].message, "收到");
  assert.equal(sent[0].options.source, "tool:ceo_cto");
});

test("ToolExecutor channel.reply can use direct channel host context before an intent exists", async () => {
  const sent = [];
  const outboundReplyService = {
    async send(task, message, options) {
      sent.push({ task, message, options });
      return { status: "sent", taskId: task.id, message, source: options.source };
    }
  };
  const { executor } = await createExecutor({ outboundReplyService });

  const result = await executor.invoke({
    role: "ceo_cto",
    toolId: "channel.reply",
    input: { text: "我是 Franklin，AI Team 的 CEO/CTO 入口。" },
    source: "agent_runtime",
    hostContext: {
      channel: "feishu",
      threadId: "oc_1",
      userId: "ou_1",
      eventId: "om_1",
      replyTarget: { chatId: "oc_1", messageId: "om_1" }
    }
  });

  assert.equal(result.status, "completed");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].task.id, "om_1");
  assert.equal(sent[0].task.channel, "feishu");
  assert.equal(sent[0].task.threadId, "oc_1");
  assert.deepEqual(sent[0].task.replyTarget, { chatId: "oc_1", messageId: "om_1" });
  assert.equal(sent[0].message, "我是 Franklin，AI Team 的 CEO/CTO 入口。");
  assert.equal(sent[0].options.source, "tool:ceo_cto");
});
