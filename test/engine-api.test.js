import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { once } from "node:events";
import { createHttpServer, dashboardAccessState } from "../src/interfaces/http/server.js";
import { EngineStore } from "../src/team-engine/infrastructure/engine-store.js";
import { EngineRoutingStore } from "../src/team-engine/infrastructure/routing-store.js";
import { onboardDefaultTeamRouting } from "../src/team-engine/infrastructure/default-team-onboarding.js";
import { toLegacyTask } from "../src/team-engine/domain/schema.js";
import { AgentConfigStore } from "../src/agent-framework/infrastructure/agent-config-store.js";
import { onboardDefaultAgentProfiles } from "../src/agent-framework/infrastructure/default-agent-onboarding.js";
import { AgentRuntime } from "../src/agent-framework/application/agent-runtime.js";
import { ToolRegistry } from "../src/agent-framework/domain/tools/tool-registry.js";
import { MemoryStore } from "../src/agent-framework/infrastructure/memory-store.js";
import { ProviderConfigStore } from "../src/agent-framework/infrastructure/provider/provider-config-store.js";
import { OnboardingStateStore } from "../src/platform/onboarding-state-store.js";
import { CodingAgentLauncherStore } from "../src/agent-framework/infrastructure/coding-agent-launcher-store.js";

const droppedConfigFields = ["miss" + "ion", "ali" + "as"];

function hasDroppedConfigField(value) {
  return droppedConfigFields.some((field) => field in value);
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

async function readJson(response) {
  return response.json();
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

function readWebSocketFrame(socket) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const onData = (chunk) => {
      chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (buffer.length < 2) return;
      let offset = 2;
      let length = buffer[1] & 0x7f;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      if (buffer.length < offset + length) return;
      socket.off("data", onData);
      socket.off("error", reject);
      resolve(buffer.subarray(offset, offset + length).toString("utf8"));
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
}

function createServer(overrides = {}) {
  const logger = { info() {}, warn() {}, error() {} };
  return createHttpServer({
    config: { adminToken: undefined, runner: { type: "mock" } },
    channelConfigStore: { async listPublic() { return []; } },
    channels: new Map([["feishu", { async handleWebhook() { return { status: 200, body: { ok: true } }; } }]]),
    logger,
    channelGateway: { async deliverToCeo() { throw new Error("channelGateway override required"); } },
    feishuLongConnection: { async start() {} },
    toolExecutor: { async invoke() { return { ok: true }; } },
    ...overrides
  });
}

test("HTTP server namespaces console pages and APIs under /ai-team", async (t) => {
  const server = createServer({
    engine: {
      async health() {
        return { ok: true, status: "ready" };
      },
      async readModel() {
        return { projects: [], intents: [], tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
      }
    }
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  assert.deepEqual(await readJson(await fetch(`${baseUrl}/ai-team/api/health`)), { ok: true, service: "ai-team-agent" });
  assert.deepEqual(await readJson(await fetch(`${baseUrl}/ai-team/api/engine/health`)), { ok: true, status: "ready" });

  const dashboard = await fetch(`${baseUrl}/ai-team/console/dashboard?token=AI-team`, { redirect: "manual" });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /__DASHBOARD_DATA__/);

  const architecture = await fetch(`${baseUrl}/ai-team/console/architecture?token=AI-team`, { redirect: "manual" });
  assert.equal(architecture.status, 200);
  assert.match(await architecture.text(), /Route: \/ai-team\/console\/architecture/);

  assert.equal((await fetch(`${baseUrl}/health`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/engine/health`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/dashboard?token=AI-team`, { redirect: "manual" })).status, 404);
});

test("dashboard access state requires configured token and accepts header query or cookie", () => {
  const config = { adminToken: "secret" };
  const remote = { headers: {}, socket: { remoteAddress: "203.0.113.10" } };

  assert.deepEqual(
    dashboardAccessState(remote, config, new URL("http://example.test/ai-team/console/dashboard?tab=Settings")),
    { requiresToken: true, authorized: false, tokenSource: undefined }
  );
  assert.equal(
    dashboardAccessState({ ...remote, headers: { "x-ai-team-admin-token": "secret" } }, config, new URL("http://example.test/ai-team/console/dashboard")).authorized,
    true
  );
  assert.equal(
    dashboardAccessState(remote, config, new URL("http://example.test/ai-team/console/dashboard?token=secret")).authorized,
    true
  );
  assert.equal(
    dashboardAccessState({ ...remote, headers: { cookie: "ai_team_admin_token=secret" } }, config, new URL("http://example.test/ai-team/console/dashboard")).authorized,
    true
  );
});

test("dashboard access state falls back to the default admin token", () => {
  const config = { adminToken: undefined };
  const local = { headers: {}, socket: { remoteAddress: "127.0.0.1" } };
  const remote = { headers: {}, socket: { remoteAddress: "203.0.113.10" } };

  assert.deepEqual(
    dashboardAccessState(local, config, new URL("http://localhost/ai-team/console/dashboard")),
    { requiresToken: true, authorized: false, tokenSource: undefined }
  );
  assert.equal(
    dashboardAccessState({ ...local, headers: { "x-ai-team-admin-token": "AI-team" } }, config, new URL("http://localhost/ai-team/console/dashboard")).authorized,
    true
  );
  assert.equal(
    dashboardAccessState(remote, config, new URL("http://example.test/ai-team/console/dashboard?token=AI-team")).authorized,
    true
  );
  assert.equal(
    dashboardAccessState({ ...remote, headers: { cookie: "ai_team_admin_token=AI-team" } }, config, new URL("http://example.test/ai-team/console/dashboard")).authorized,
    true
  );
});

test("one one smoke endpoint records setup readiness for dashboard refresh", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-one-one-smoke-api-"));
  const agent = {
    role: "engineer",
    name: "Ada",
    title: "Coding Engineer",
    prompt: "Build carefully.",
    tools: [],
    skills: [],
    mcps: [],
    modelProvider: { providerId: "codex", model: "gpt-5.5" }
  };
  const memory = {
    async readLongTermFacts() { return []; },
    async readLongTermPlaybooks() { return []; },
    async readRecentSummary() { return ""; },
    async readContextNeeds() { return []; },
    async recordEvent(event) { return { id: "event_one_one_smoke", ...event, createdAt: "2026-06-14T00:00:00.000Z" }; }
  };
  const agentRuntime = {
    agentConfigStore: {
      async list() { return [agent]; }
    },
    async profileForRole(role) {
      assert.equal(role, "engineer");
      return agent;
    },
    storesForProfile() {
      return { memory };
    },
    async resolveProviderSelection() {
      return { providerId: "codex", runner: "mock", model: "gpt-5.5", provider: { id: "codex", runner: "mock" } };
    },
    async prepareTurn() {
      return { role: "engineer", profile: agent, tools: [] };
    },
    async run() {
      return {
        finalText: "Ada is ready with codex gpt-5.5 and tools loaded.",
        sessionId: "one-one:engineer",
        trace: { traceId: "trace_one_one_smoke", provider: "codex", model: "gpt-5.5" }
      };
    }
  };
  const server = createServer({
    config: {
      dataDir,
      adminToken: undefined,
      runner: { type: "mock" },
      provider: { id: "mock" }
    },
    engine: {
      async readModel() {
        return { projects: [], intents: [], tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
      }
    },
    agentRuntime,
    agentConfigStore: {
      async list() { return [agent]; }
    },
    routingStore: {
      async list() { return []; },
      async get() { return []; }
    },
    toolRegistry: {
      list() { return []; }
    },
    providerConfigStore: {
      async list() {
        return {
          defaultProviderId: "codex",
          providers: [{ id: "codex", name: "Codex", enabled: true, defaultModel: "gpt-5.5" }]
        };
      }
    }
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const smoke = await fetch(`${baseUrl}/ai-team/api/agents/engineer/one-one-smoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "smoke" })
  });

  assert.equal(smoke.status, 200);
  const smokeBody = await readJson(smoke);
  assert.equal(smokeBody.smoke.ok, true);
  assert.equal(smokeBody.smoke.role, "engineer");

  const dashboard = await readJson(await fetch(`${baseUrl}/ai-team/api/dashboard`, {
    headers: { "x-ai-team-admin-token": "AI-team" }
  }));
  const item = dashboard.readiness.items.find((entry) => entry.id === "one_on_one_smoke");
  assert.equal(item.status, "ready");
  assert.match(item.reason, /direct turn completed/);
});

test("dashboard HTML redirects to login until token is supplied", async (t) => {
  const server = createServer({ config: { adminToken: "secret", runner: { type: "mock" } } });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const missing = await fetch(`${baseUrl}/ai-team/console/dashboard?tab=Settings`, { redirect: "manual" });
  assert.equal(missing.status, 302);
  assert.match(missing.headers.get("location"), /\/ai-team\/console\/dashboard\/login\?next=%2Fai-team%2Fconsole%2Fdashboard%3Ftab%3DSettings/);

  const login = await fetch(`${baseUrl}/ai-team/console/dashboard/login?next=%2Fai-team%2Fconsole%2Fdashboard%3Ftab%3DSettings`);
  const loginHtml = await login.text();
  assert.equal(login.status, 200);
  assert.match(loginHtml, /AI Team Dashboard Login/);
  assert.doesNotMatch(loginHtml, /__DASHBOARD_DATA__/);

  const authorized = await fetch(`${baseUrl}/ai-team/console/dashboard?tab=Settings&token=secret`, { redirect: "manual" });
  const authorizedHtml = await authorized.text();
  assert.equal(authorized.status, 200);
  assert.match(authorized.headers.get("set-cookie"), /ai_team_admin_token=/);
  assert.match(authorizedHtml, /__DASHBOARD_DATA__/);

  const cookie = authorized.headers.get("set-cookie").split(";")[0];
  const data = await fetch(`${baseUrl}/ai-team/api/dashboard`, { headers: { cookie } });
  assert.equal(data.status, 200);

  const deniedData = await fetch(`${baseUrl}/ai-team/api/dashboard`);
  assert.equal(deniedData.status, 403);
});

test("dashboard HTML accepts AI-team when no admin token is configured", async (t) => {
  const server = createServer({ config: { adminToken: undefined, runner: { type: "mock" } } });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const missing = await fetch(`${baseUrl}/ai-team/console/dashboard`, { redirect: "manual" });
  assert.equal(missing.status, 302);
  assert.match(missing.headers.get("location"), /\/ai-team\/console\/dashboard\/login\?next=%2Fai-team%2Fconsole%2Fdashboard/);

  const invalid = await fetch(`${baseUrl}/ai-team/console/dashboard/login`, {
    method: "POST",
    body: new URLSearchParams({ token: "wrong", next: "/ai-team/console/dashboard" }),
    redirect: "manual"
  });
  assert.equal(invalid.status, 403);
  assert.match(await invalid.text(), /Invalid admin token/);

  const authorized = await fetch(`${baseUrl}/ai-team/console/dashboard/login`, {
    method: "POST",
    body: new URLSearchParams({ token: "AI-team", next: "/ai-team/console/dashboard?tab=Settings" }),
    redirect: "manual"
  });
  assert.equal(authorized.status, 303);
  assert.equal(authorized.headers.get("location"), "/ai-team/console/dashboard?tab=Settings");
  assert.match(authorized.headers.get("set-cookie"), /ai_team_admin_token=AI-team/);

  const cookie = authorized.headers.get("set-cookie").split(";")[0];
  const data = await fetch(`${baseUrl}/ai-team/api/dashboard`, { headers: { cookie } });
  assert.equal(data.status, 200);
});

test("POST /ai-team/api/tools/invoke requires explicit role attribution", async (t) => {
  let invoked = false;
  const server = createServer({
    config: { adminToken: "secret", runner: { type: "mock" } },
    toolExecutor: {
      async invoke() {
        invoked = true;
        return { ok: true };
      }
    }
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/tools/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ai-team-admin-token": "secret" },
    body: JSON.stringify({ toolId: "engine.projects", input: { action: "list" } })
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await readJson(response), { error: "role is required" });
  assert.equal(invoked, false);
});

test("engine API exposes health, read model, collections, and intent detail", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-api-"));
  const store = new EngineStore({ dataDir });
  await store.init();
  const intent = await store.createIntent({ goal: "Ship engine routes", source: { channel: "cli" } });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Implement routes",
    description: "Add engine read routes",
    producerRole: "product_manager",
    consumerRole: "engineer"
  });
  const run = await store.createRun({
    entityType: "task",
    entityId: task.id,
    agentRole: "engineer",
    sessionKey: "engineer:cli:cli",
    runner: "mock",
    provider: "mock"
  });
  const artifact = await store.writeArtifact({
    intentId: intent.id,
    entityType: "task",
    entityId: task.id,
    role: "engineer",
    kind: "implementation_report",
    data: { summary: "done" }
  });
  const feedback = await store.createFeedback({ text: "Please add engine dashboard data", intentId: intent.id });
  const engine = {
    store,
    async health() {
      return { ok: true, status: "ready" };
    }
  };
  const server = createServer({ engine });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  assert.deepEqual(await readJson(await fetch(`${baseUrl}/ai-team/api/engine/health`)), { ok: true, status: "ready" });

  const model = await readJson(await fetch(`${baseUrl}/ai-team/api/engine`));
  assert.equal(model.intents[0].id, intent.id);
  assert.equal(model.tasks[0].id, task.id);
  assert.equal(model.runs[0].id, run.id);
  assert.equal(model.artifacts[0].id, artifact.id);
  assert.equal(model.feedback[0].id, feedback.id);

  assert.deepEqual((await readJson(await fetch(`${baseUrl}/ai-team/api/engine/intents`))).intents.map((row) => row.id), [intent.id]);
  assert.deepEqual((await readJson(await fetch(`${baseUrl}/ai-team/api/engine/tasks`))).tasks.map((row) => row.id), [task.id]);
  assert.deepEqual((await readJson(await fetch(`${baseUrl}/ai-team/api/engine/runs`))).runs.map((row) => row.id), [run.id]);
  assert.deepEqual((await readJson(await fetch(`${baseUrl}/ai-team/api/engine/feedback`))).feedback.map((row) => row.id), [feedback.id]);

  const detail = await readJson(await fetch(`${baseUrl}/ai-team/api/engine/intents/${intent.id}`));
  assert.equal(detail.intent.id, intent.id);
  assert.deepEqual(detail.tasks.map((row) => row.id), [task.id]);
  assert.deepEqual(detail.runs.map((row) => row.id), [run.id]);
  assert.deepEqual(detail.artifacts.map((row) => row.id), [artifact.id]);
});

test("GET /ai-team/api/engine/runs/:id/detail exposes AgentRuntime turn trace for harnessing", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-run-detail-"));
  const agentsDir = path.join(dataDir, "agent-workspace", "agents");
  const store = new EngineStore({ dataDir });
  await store.init();
  const agentConfigStore = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  const intent = await store.createIntent({ goal: "Inspect failed run detail", source: { channel: "cli" } });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Fail with trace",
    description: "Create a trace-backed failed run",
    producerRole: "product_manager",
    consumerRole: "engineer"
  });
  const run = await store.createRun({
    entityType: "task",
    entityId: task.id,
    agentRole: "engineer",
    sessionKey: "sess_run_detail",
    runner: "codex_app_server",
    provider: "codex",
    model: "gpt-5.5"
  });
  await store.updateRun(run.id, { agentTraceId: "trace_run_detail" });
  const paths = agentConfigStore.pathsFor("engineer", { name: "Ada" });
  await fs.writeFile(path.join(paths.tracesDir, "trace_run_detail.json"), JSON.stringify({
    traceId: "trace_run_detail",
    agentName: "Ada",
    role: "engineer",
    sessionId: "sess_run_detail",
    contextBlocks: [{ id: "assignment.current", contentPreview: "Task id: task_detail" }],
    modelCalls: [{
      round: 0,
      submittedMessages: [
        { role: "system", content: "## runtime.system\ncacheable prefix" },
        { role: "system", content: "## tool.protocol\n## Tool Protocol\nAvailable tools:\n- Bash" },
        { role: "user", content: "full submitted assignment" }
      ],
      submittedTools: [{ type: "function", function: { name: "Bash" } }],
      message: { role: "assistant", content: "model reply" },
      raw: { output: "raw model reply" }
    }, {
      round: 1,
      message: { role: "assistant", content: "" },
      raw: [
        JSON.stringify({
          method: "item/started",
          params: {
            item: {
              type: "userMessage",
              content: [{ type: "text", text: "SYSTEM:\n## runtime.system\ncacheable prefix\n\nUSER:\nactual assignment context" }]
            }
          }
        }),
        JSON.stringify({
          method: "thread/tokenUsage/updated",
          params: {
            tokenUsage: {
              last: { inputTokens: 100, cachedInputTokens: 40 },
              total: { inputTokens: 100, cachedInputTokens: 40 },
              modelContextWindow: 258400
            }
          }
        }),
        JSON.stringify({ method: "item/agentMessage/delta", params: { delta: "assistant " } }),
        JSON.stringify({ method: "item/agentMessage/delta", params: { delta: "real output" } })
      ].join("\n")
    }],
    toolCalls: [{ id: "call_1", toolId: "Bash", input: { command: "cat missing.txt" }, status: "failed" }],
    errors: [{ message: "Bash command failed" }],
    finalText: ""
  }, null, 2), "utf8");
  await fs.writeFile(path.join(paths.sessionsDir, "sess_run_detail.json"), JSON.stringify({
    id: "sess_run_detail",
    agentName: "Ada",
    role: "engineer",
    recentTurns: [{ inputText: "full submitted assignment", finalText: "", traceId: "trace_run_detail" }],
    traceIds: ["trace_run_detail"]
  }, null, 2), "utf8");

  const server = createServer({ engine: { store }, agentConfigStore });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/engine/runs/${run.id}/detail`);
  const detail = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(detail.run.id, run.id);
  assert.equal(detail.trace.traceId, "trace_run_detail");
  assert.equal(detail.trace.modelCalls[0].submittedMessages[2].content, "full submitted assignment");
  assert.equal(detail.llmTurns.length, 2);
  assert.equal(detail.llmTurns[0].round, 0);
  assert.equal(detail.llmTurns[0].context.messages[0].source, "prompt bundle");
  assert.deepEqual(detail.llmTurns[0].context.tools, []);
  assert.equal(detail.llmTurns[0].context.messages.length, 2);
  assert.equal(detail.llmTurns[0].request.messages[2].content, "full submitted assignment");
  assert.equal(detail.llmTurns[0].response.message.content, "model reply");
  assert.equal(detail.llmTurns[0].response.raw.output, "raw model reply");
  assert.equal(detail.llmTurns[0].response.actual.content, "model reply");
  assert.equal(detail.llmTurns[1].context.messages[0].role, "user");
  assert.match(detail.llmTurns[1].context.messages[0].content, /actual assignment context/);
  assert.equal(detail.llmTurns[1].context.prefixCache.cachedInputTokens, 40);
  assert.equal(detail.llmTurns[1].context.prefixCache.inputTokens, 100);
  assert.equal(detail.llmTurns[1].response.actual, "assistant real output");
  assert.equal(detail.llmTurns[1].errors[0].message, "Bash command failed");
  assert.equal(detail.session.id, "sess_run_detail");
  assert.equal(detail.files.trace.endsWith("trace_run_detail.json"), true);
});

test("POST /ai-team/api/tasks creates an engine intent and compatibility task shape through ChannelGateway", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-post-"));
  const store = new EngineStore({ dataDir });
  await store.init();
  let delivered;
  const engine = {
    store,
    async health() {
      return { ok: true };
    }
  };
  const channelGateway = {
    async deliverToCeo(input) {
      delivered = input;
      const intent = await store.createIntent({
        goal: input.text,
        source: { channel: input.channel, threadId: input.threadId, userId: input.userId },
        replyTarget: input.replyTarget,
        context: { workspace: input.workspace }
      });
      return { intent, task: toLegacyTask(intent), created: true, ignored: false };
    }
  };
  const server = createServer({ engine, channelGateway });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "Add an engine API",
      channel: "feishu",
      threadId: "thread_1",
      userName: "Tester",
      eventId: "event_1",
      dedupeKey: "feishu:event_1",
      createdAt: "2026-05-20T00:00:00.000Z",
      workspace: dataDir,
      replyTarget: { type: "feishu", messageId: "om_123", chatId: "oc_123" }
    })
  });
  const body = await readJson(response);

  assert.equal(response.status, 201);
  assert.equal(delivered.transport, "http_api");
  assert.equal(delivered.userName, "Tester");
  assert.equal(delivered.eventId, "event_1");
  assert.equal(delivered.dedupeKey, "feishu:event_1");
  assert.equal(delivered.createdAt, "2026-05-20T00:00:00.000Z");
  assert.deepEqual(delivered.replyTarget, { type: "feishu", messageId: "om_123", chatId: "oc_123" });
  assert.equal(body.intent.goal, "Add an engine API");
  assert.deepEqual(body.intent.replyTarget, { type: "feishu", messageId: "om_123", chatId: "oc_123" });
  assert.equal(body.task.id, body.intent.id);
  assert.equal(body.created, true);
  assert.equal(body.route, "ceo_cto");
  assert.deepEqual((await readJson(await fetch(`${baseUrl}/ai-team/api/tasks`))).tasks.map((row) => row.id), [body.intent.id]);
});

test("POST /ai-team/api/dashboard/intents creates dashboard work through ChannelGateway", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-intake-"));
  const store = new EngineStore({ dataDir });
  await store.init();
  let delivered;
  const channelGateway = {
    async deliverToCeo(input) {
      delivered = input;
      const intent = await store.createIntent({
        goal: input.text,
        source: { channel: input.channel, threadId: input.threadId, userId: input.userId },
        context: { workspace: input.workspace, metadata: input.metadata }
      });
      return { intent, task: toLegacyTask(intent), created: true, ignored: false };
    }
  };
  const server = createServer({
    config: { adminToken: "secret", runner: { type: "mock" }, workspace: dataDir },
    engine: { store },
    channelGateway
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/dashboard/intents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "Create a customer onboarding playbook",
      workspace: "/tmp/should-not-be-used",
      metadata: { priority: "high", surface: "overview" }
    })
  });
  const body = await readJson(response);

  assert.equal(response.status, 201);
  assert.equal(delivered.channel, "dashboard");
  assert.equal(delivered.source, "dashboard");
  assert.equal(delivered.transport, "http_api");
  assert.equal(delivered.threadId, "dashboard");
  assert.equal(delivered.userId, "dashboard");
  assert.equal(delivered.text, "Create a customer onboarding playbook");
  assert.equal(delivered.workspace, undefined);
  assert.deepEqual(delivered.metadata, { priority: "high", surface: "overview", origin: "dashboard" });
  assert.equal(body.intent.goal, "Create a customer onboarding playbook");
  assert.equal(body.created, true);
  assert.equal(body.route, "ceo_cto");

  const missing = await fetch(`${baseUrl}/ai-team/api/dashboard/intents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "" })
  });
  assert.equal(missing.status, 400);
  assert.deepEqual(await readJson(missing), { error: "text is required" });
});

test("dashboard default CEO channel exposes chat history and reset clears dynamic chat context", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-ceo-channel-"));
  const store = new EngineStore({ dataDir });
  await store.init();
  await store.reserveChannelDelivery({
    dedupeKey: "dashboard:event_1",
    channel: "dashboard",
    source: "dashboard",
    transport: "http_api",
    threadId: "dashboard",
    userId: "dashboard",
    eventId: "event_1",
    text: "你是谁？"
  });
  await store.updateChannelDelivery("dashboard:event_1", {
    status: "completed",
    finalText: "我是 Franklin。",
    intentCreated: false,
    sessionId: "ceo_cto:dashboard:dashboard"
  });
  let delivered;
  const channelGateway = {
    async deliverToCeo(input) {
      delivered = input;
      await store.reserveChannelDelivery({
        dedupeKey: input.dedupeKey,
        channel: input.channel,
        source: input.source,
        transport: input.transport,
        threadId: input.threadId,
        userId: input.userId,
        eventId: input.eventId,
        text: input.text,
        displayText: input.displayText
      });
      await store.updateChannelDelivery(input.dedupeKey, {
        status: "completed",
        finalText: "收到，我先和你对齐。",
        intentCreated: false,
        sessionId: "ceo_cto:dashboard:dashboard"
      });
      return { created: false, ignored: false, directAgentTurn: true, finalText: "收到，我先和你对齐。" };
    }
  };
  const server = createServer({
    config: { adminToken: "secret", runner: { type: "mock" }, workspace: dataDir },
    engine: { store },
    channelGateway
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const history = await readJson(await fetch(`${baseUrl}/ai-team/api/dashboard/default-channel`, {
    headers: { "x-ai-team-admin-token": "secret" }
  }));
  assert.equal(history.sessionId, "ceo_cto:dashboard:dashboard");
  assert.deepEqual(history.messages.map((message) => [message.role, message.text]), [
    ["user", "你是谁？"],
    ["agent", "我是 Franklin。"]
  ]);

  const posted = await fetch(`${baseUrl}/ai-team/api/dashboard/default-channel/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "我们先聊一下下个大方向" })
  });
  const postedBody = await readJson(posted);
  assert.equal(posted.status, 200);
  assert.equal(delivered.channel, "dashboard");
  assert.equal(delivered.threadId, "dashboard");
  assert.equal(delivered.userId, "dashboard");
  assert.equal(delivered.forceIntent, false);
  assert.equal(delivered.text, "我们先聊一下下个大方向");
  assert.equal(postedBody.messages.at(-1).text, "收到，我先和你对齐。");

  const audioPosted = await fetch(`${baseUrl}/ai-team/api/dashboard/default-channel/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "这段录音是在讲客户成功中台",
      audio: { name: "strategy.m4a", mimeType: "audio/mp4", size: 42, dataUrl: "data:audio/mp4;base64,AAAA" }
    })
  });
  const audioBody = await readJson(audioPosted);
  assert.equal(audioPosted.status, 200);
  assert.match(delivered.text, /音频文件：strategy\.m4a/);
  assert.match(delivered.text, /name 写成短标题、description 写成较完整的背景和范围/);
  assert.equal(delivered.metadata.audio.name, "strategy.m4a");
  assert.equal(delivered.metadata.audio.hasData, true);
  assert.ok(audioBody.messages.some((message) => message.text.includes("[Audio] strategy.m4a")));

  const reset = await fetch(`${baseUrl}/ai-team/api/dashboard/default-channel/reset`, { method: "POST" });
  const resetBody = await readJson(reset);
  assert.equal(reset.status, 200);
  assert.equal(resetBody.reset.resetDynamicChatContext, true);
  assert.equal(resetBody.reset.preservedStaticContext, true);
  assert.deepEqual(resetBody.messages, []);
  assert.equal((await store.listChannelDeliveries()).length, 0);
});

test("dashboard default CEO channel does not create runtime stores when CEO is unconfigured", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-ceo-unconfigured-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const store = new EngineStore({ dataDir });
  const toolRegistry = new ToolRegistry();
  const memory = new MemoryStore({ dataDir });
  const agentConfigStore = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await store.init();
  await memory.init();
  await agentConfigStore.init();
  const runtime = new AgentRuntime({
    memory,
    toolRegistry,
    agentConfigStore,
    config: { dataDir, rootDir: dataDir, agentsDir }
  });
  const server = createServer({
    config: { adminToken: "secret", runner: { type: "mock" }, workspace: dataDir },
    engine: { store },
    agentRuntime: runtime
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);
  const headers = { "x-ai-team-admin-token": "secret" };

  const state = await readJson(await fetch(`${baseUrl}/ai-team/api/dashboard/default-channel`, { headers }));
  assert.equal(state.sessionId, "ceo_cto:dashboard:dashboard");

  const reset = await fetch(`${baseUrl}/ai-team/api/dashboard/default-channel/reset`, { method: "POST", headers });
  const resetBody = await readJson(reset);
  assert.equal(reset.status, 200);
  assert.equal(resetBody.reset.sessionReset.skipped, true);
  assert.equal(resetBody.reset.memoryReset.skipped, true);
  await assert.rejects(() => fs.access(path.join(agentsDir, "ceo_cto")), { code: "ENOENT" });
  await assert.rejects(() => fs.access(path.join(agentsDir, "Franklin")), { code: "ENOENT" });
});

test("dashboard default CEO channel uses latest Feishu personal CEO session", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-feishu-session-"));
  const store = new EngineStore({ dataDir });
  await store.init();
  const feishuSession = {
    id: "ceo_cto-feishu-p2p-ou_owner",
    agentName: "Franklin",
    role: "ceo_cto",
    updatedAt: "2026-05-24T09:52:03.171Z",
    rollingSummary: "用户问过 CEO 的身份，需要沿用默认渠道上下文。",
    traceIds: ["trace_feishu_1"],
    recentTurns: [{
      traceId: "trace_feishu_1",
      inputText: [
        "## 当前渠道消息",
        "channel: feishu",
        "threadId: p2p:ou_owner",
        "userId: ou_owner",
        "",
        "forceIntent: false",
        "text: 你叫什么名字？",
        "",
        "请做出 CEO 判断：要么调用 engine.create_intent 创建工作，要么像负责人一样自然回复用户。"
      ].join("\n"),
      finalText: "我是 Franklin。",
      completedAt: "2026-05-24T09:52:03.171Z"
    }]
  };
  const resetSessionCalls = [];
  const clearSessionEventsCalls = [];
  const clearDynamicContextCalls = [];
  const agentRuntime = {
    async profileForRole() {
      return { role: "ceo_cto", name: "Franklin" };
    },
    storesForProfile() {
      return {
        sessions: {
          async list() {
            return [feishuSession];
          },
          async clearDynamicContext(sessionId) {
            clearDynamicContextCalls.push(sessionId);
            const hadRollingSummary = Boolean(feishuSession.rollingSummary);
            const clearedTurns = feishuSession.recentTurns.length;
            const clearedTraceIds = feishuSession.traceIds.length;
            delete feishuSession.rollingSummary;
            feishuSession.recentTurns = [];
            feishuSession.traceIds = [];
            return {
              sessionId,
              clearedRollingSummary: hadRollingSummary,
              clearedTurns,
              clearedTraceIds
            };
          },
          async resetSession(sessionId) {
            resetSessionCalls.push(sessionId);
            return { sessionId };
          }
        },
        memory: {
          async clearSessionEvents(sessionId) {
            clearSessionEventsCalls.push(sessionId);
            return { sessionId };
          }
        }
      };
    }
  };
  let delivered;
  const channelGateway = {
    async deliverToCeo(input) {
      delivered = input;
      return { created: false, ignored: false, directAgentTurn: true, finalText: "收到。" };
    }
  };
  const server = createServer({
    config: { adminToken: "secret", runner: { type: "mock" }, workspace: dataDir },
    engine: { store },
    agentRuntime,
    channelGateway
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const history = await readJson(await fetch(`${baseUrl}/ai-team/api/dashboard/default-channel`, {
    headers: { "x-ai-team-admin-token": "secret" }
  }));
  assert.equal(history.channel, "feishu");
  assert.equal(history.threadId, "p2p:ou_owner");
  assert.equal(history.userId, "ou_owner");
  assert.equal(history.sessionId, "ceo_cto:feishu:p2p:ou_owner");
  assert.deepEqual(history.messages.map((message) => [message.role, message.text]), [
    ["user", "你叫什么名字？"],
    ["agent", "我是 Franklin。"]
  ]);

  const posted = await fetch(`${baseUrl}/ai-team/api/dashboard/default-channel/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "继续沿用这个上下文" })
  });
  assert.equal(posted.status, 200);
  assert.equal(delivered.channel, "feishu");
  assert.equal(delivered.threadId, "p2p:ou_owner");
  assert.equal(delivered.userId, "ou_owner");
  assert.equal(delivered.source, "dashboard_ceo_chat");

  const reset = await fetch(`${baseUrl}/ai-team/api/dashboard/default-channel/reset`, { method: "POST" });
  const resetBody = await readJson(reset);
  assert.equal(reset.status, 200);
  assert.deepEqual(clearDynamicContextCalls, ["ceo_cto:feishu:p2p:ou_owner"]);
  assert.deepEqual(resetSessionCalls, []);
  assert.deepEqual(clearSessionEventsCalls, ["ceo_cto:feishu:p2p:ou_owner"]);
  assert.equal(resetBody.reset.resetDynamicChatContext, true);
  assert.equal(resetBody.reset.preservedStaticContext, true);
  assert.equal(resetBody.reset.sessionReset.clearedRollingSummary, true);
  assert.equal(resetBody.channel, "feishu");
  assert.equal(resetBody.threadId, "p2p:ou_owner");
  assert.equal(resetBody.userId, "ou_owner");
  assert.deepEqual(resetBody.messages, []);
});

test("POST /ai-team/api/engine/retry-blocked retries blocked work through TeamEngine", async (t) => {
  const calls = [];
  const server = createServer({
    engine: {
      async retryBlockedWork(input) {
        calls.push(input);
        return {
          retried: true,
          entityType: input.entityType,
          entityId: input.entityId,
          retryStatus: "testing"
        };
      }
    }
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/engine/retry-blocked`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entityType: "task",
      entityId: "task_blocked",
      reason: "Dashboard retry"
    })
  });
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    retried: true,
    entityType: "task",
    entityId: "task_blocked",
    retryStatus: "testing"
  });
  assert.deepEqual(calls, [{
    entityType: "task",
    entityId: "task_blocked",
    reason: "Dashboard retry",
    agentRole: "ceo_cto"
  }]);
});

test("POST /ai-team/api/engine/feedback/:id/resolve marks feedback handled through Engine transition", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-feedback-resolve-"));
  const store = new EngineStore({ dataDir });
  await store.init();
  const feedback = await store.createFeedback({
    text: "Primary color is already removed.",
    source: { channel: "dashboard" }
  });
  const server = createServer({ engine: { store } });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/engine/feedback/${feedback.id}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "Owner confirmed handled" })
  });
  const body = await readJson(response);
  const stored = await store.getFeedback(feedback.id);

  assert.equal(response.status, 200);
  assert.equal(body.feedback.id, feedback.id);
  assert.equal(body.feedback.status, "done");
  assert.equal(stored.status, "done");
  assert.equal(stored.operations.length, 1);
  assert.deepEqual(stored.operations[0], {
    at: stored.operations[0].at,
    agentRole: "ceo_cto",
    action: "status_transition",
    fromStatus: "new",
    toStatus: "done",
    reason: "Owner confirmed handled"
  });
});

test("DELETE /ai-team/api/engine/projects/:id removes project workspace and related Engine records", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-project-delete-api-"));
  const store = new EngineStore({ dataDir, projectWorkspaceRoot: path.join(dataDir, "project-workspaces") });
  await store.init();
  const project = await store.ensureProject({ name: "Disposable Project" });
  const intent = await store.createIntent({
    projectId: project.id,
    projectName: project.name,
    workspace: project.workspace,
    goal: "delete through API",
    source: { channel: "dashboard" },
    context: {}
  });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Temporary work",
    description: "Remove with project.",
    producerRole: "product_manager",
    consumerRole: "engineer"
  });
  await store.createRun({
    entityType: "task",
    entityId: task.id,
    agentRole: "engineer",
    sessionKey: "engineer:dashboard:project-delete",
    runner: "mock",
    provider: "mock"
  });
  const server = createServer({ engine: { store, deleteProject: (id) => store.deleteProject(id) } });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/engine/projects/${encodeURIComponent(project.id)}`, {
    method: "DELETE",
    headers: { "x-ai-team-admin-token": "AI-team" }
  });
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.deleted.projectId, project.id);
  assert.equal(body.deleted.intentIds.includes(intent.id), true);
  assert.equal(body.deleted.taskIds.includes(task.id), true);
  assert.equal((await store.readModel()).projects.length, 0);
  await assert.rejects(fs.access(project.workspace), /ENOENT/);
});

test("GET /ai-team/api/tasks and /feedback expose Engine data through compatibility shapes", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-compat-shapes-"));
  const store = new EngineStore({ dataDir });
  await store.init();
  const intent = await store.createIntent({ goal: "Engine-backed task", source: { channel: "cli" } });
  const feedback = await store.createFeedback({ text: "Engine-backed feedback", intentId: intent.id });
  const server = createServer({ engine: { store } });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const tasksBody = await readJson(await fetch(`${baseUrl}/ai-team/api/tasks`));
  assert.equal(tasksBody.tasks.length, 1);
  assert.equal(tasksBody.tasks[0].id, intent.id);
  assert.equal(tasksBody.tasks[0].metadata.engineIntentId, intent.id);

  const feedbackBody = await readJson(await fetch(`${baseUrl}/ai-team/api/feedback`));
  assert.deepEqual(feedbackBody.feedback.map((row) => row.id), [feedback.id]);
  assert.deepEqual(feedbackBody.backlog.map((row) => row.id), [feedback.id]);
});

test("engine API returns empty unavailable payload without engine", async (t) => {
  const server = createServer();
  t.after(() => server.close());
  const baseUrl = await listen(server);

  assert.deepEqual(await readJson(await fetch(`${baseUrl}/ai-team/api/engine/health`)), { ok: false, available: false });
  assert.deepEqual(await readJson(await fetch(`${baseUrl}/ai-team/api/engine`)), {
    projects: [],
    intents: [],
    tasks: [],
    runs: [],
    artifacts: [],
    sessions: [],
    feedback: []
  });
  assert.deepEqual(await readJson(await fetch(`${baseUrl}/ai-team/api/tasks`)), {
    tasks: [],
    intents: []
  });
  assert.deepEqual(await readJson(await fetch(`${baseUrl}/ai-team/api/feedback`)), {
    feedback: [],
    backlog: []
  });
  assert.deepEqual(await readJson(await fetch(`${baseUrl}/ai-team/api/engine/feedback`)), {
    feedback: []
  });
});

test("engine health is unavailable when no health method is exposed", async (t) => {
  const server = createServer({ engine: {} });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  assert.deepEqual(await readJson(await fetch(`${baseUrl}/ai-team/api/engine/health`)), { ok: false, available: false });
});

test("dashboard WebSocket streams dashboard update snapshots", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-ws-"));
  const store = new EngineStore({ dataDir });
  await store.init();
  await store.createIntent({ goal: "Stream dashboard updates", source: { channel: "cli" } });
  const server = createServer({
    engine: {
      store,
      async health() {
        return { ok: true };
      }
    }
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);
  const url = new URL(baseUrl);
  const socket = net.connect(Number(url.port), url.hostname);
  t.after(() => socket.destroy());
  await once(socket, "connect");
  const key = crypto.randomBytes(16).toString("base64");
  socket.write([
    "GET /ai-team/api/dashboard/ws?token=AI-team HTTP/1.1",
    `Host: ${url.host}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    "",
    ""
  ].join("\r\n"));

  const upgraded = await new Promise((resolve, reject) => {
    socket.once("data", (chunk) => resolve(chunk.toString("utf8")));
    socket.once("error", reject);
  });
  assert.match(upgraded, /101 Switching Protocols/);
  const payload = JSON.parse(await readWebSocketFrame(socket));
  assert.equal(payload.type, "dashboard:update");
  assert.equal(payload.data.counts.intents, 1);
});

test("agent config API syncs MCP server tools into the employee config", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-mcp-sync-api-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({
    dataDir,
    agentsDir,
    toolRegistry,
    mcpToolDiscoverer: async () => [
      {
        name: "generate_ui",
        description: "Generate UI from a prompt.",
        inputSchema: {
          type: "object",
          required: ["prompt"],
          properties: { prompt: { type: "string" } }
        }
      }
    ]
  });
  const routingStore = new EngineRoutingStore({ dataDir, agentsDir });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await routingStore.init();
  await agentConfigStore.update("product_manager", {
    mcps: [{ mcpServers: { stitch: { url: "https://stitch.example/mcp" } } }],
    tools: ["memory.search"]
  });
  const server = createServer({ agentConfigStore, routingStore, toolRegistry });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/agents/config/product_manager/mcps/stitch/tools/sync`, {
    method: "POST",
    headers: { "x-ai-team-admin-token": "AI-team" }
  });
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(body.agent.mcps[0].tools.map((tool) => tool.id), ["stitch.generate_ui"]);
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(agentsDir, "Darwin", "mcp", "stitch", "mcp.json"), "utf8")).mcpServers.stitch.tools.map((tool) => tool.name),
    ["generate_ui"]
  );
});

test("agent config API does not create missing roles on read", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-api-missing-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const agentConfigStore = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  const routingStore = new EngineRoutingStore({ dataDir, agentsDir });
  await agentConfigStore.init();
  await routingStore.init();
  const server = createServer({ agentConfigStore, routingStore });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/agents/config/reviewer`);
  const body = await readJson(response);

  assert.equal(response.status, 404);
  assert.match(body.error, /agent role not found: reviewer/);
  assert.deepEqual(await agentConfigStore.list(), []);
  await assert.rejects(() => fs.access(path.join(agentsDir, "reviewer", "agent.json")), { code: "ENOENT" });
});

test("agent config API does not create missing roles on update", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-api-missing-update-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const agentConfigStore = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  const routingStore = new EngineRoutingStore({ dataDir, agentsDir });
  await agentConfigStore.init();
  await routingStore.init();
  const server = createServer({ agentConfigStore, routingStore });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/agents/config/reviewer`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ai-team-admin-token": "AI-team" },
    body: JSON.stringify({ prompt: "Reviewer prompt" })
  });
  const body = await readJson(response);

  assert.equal(response.status, 404);
  assert.match(body.error, /agent role not found: reviewer/);
  assert.deepEqual(await agentConfigStore.list(), []);
  await assert.rejects(() => fs.access(path.join(agentsDir, "reviewer", "agent.json")), { code: "ENOENT" });
});

test("agent config API lists and updates role capabilities", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-api-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  let skillInstallCall;
  const agentConfigStore = new AgentConfigStore({
    dataDir,
    agentsDir,
    toolRegistry,
    commandRunner: async (input) => {
      skillInstallCall = input;
      const skillDir = path.join(input.cwd, ".agents", "skills", "code-review");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: code-review\ndescription: Review code changes.\n---\n");
      return { status: 0, stdout: "", stderr: "" };
    }
  });
  const providerConfigStore = new ProviderConfigStore({ dataDir, config: { runner: { type: "mock" }, provider: { id: "mock" } } });
  const routingStore = new EngineRoutingStore({ dataDir, agentsDir });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await routingStore.init();
  await onboardRoutingOnce(routingStore, dataDir);
  await providerConfigStore.init();
  const server = createServer({ agentConfigStore, routingStore, toolRegistry, providerConfigStore });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const initial = await readJson(await fetch(`${baseUrl}/ai-team/api/agents/config`));
  assert.ok(initial.agents.some((agent) => agent.role === "engineer"));
  assert.equal(initial.agents.some(hasDroppedConfigField), false);
  assert.equal(initial.tools.some((tool) => tool.id === "memory.search"), false);
  assert.deepEqual(
    initial.agents.find((agent) => agent.role === "engineer").wakeRules,
    [{
      entityType: "task",
      status: "waiting",
      afterRunStatus: "testing"
    }]
  );
  assert.ok(initial.tools.some((tool) => tool.id === "Bash"));

  const response = await fetch(`${baseUrl}/ai-team/api/agents/config/engineer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "API configured engineer prompt",
      skills: ["patching"],
      mcps: [{
        configJson: JSON.stringify({
          mcpServers: {
            github: {
              url: "https://example.com/mcp",
              tools: [{ name: "search_issues", description: "Search GitHub issues." }]
            }
          }
        })
      }],
      tools: ["memory.search", "Bash", "github.search_issues"],
      modelProvider: { providerId: "mock", model: "mock" }
    })
  });
  const body = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.agent.prompt, "API configured engineer prompt");
  assert.equal(hasDroppedConfigField(body.agent), false);
  assert.deepEqual(body.agent.skills.map((skill) => skill.id), ["patching"]);
  assert.deepEqual(body.agent.mcps.map((mcp) => mcp.id), ["github"]);
  assert.deepEqual(body.agent.mcps[0].tools.map((tool) => tool.id), ["github.search_issues"]);
  assert.match(body.agent.mcps[0].configJson, /"mcpServers"/);
  assert.deepEqual(body.agent.tools, ["skill", "Bash", "github.search_issues"]);
  assert.deepEqual((await agentConfigStore.get("engineer")).tools, ["skill", "memory.search", "Bash", "github.search_issues"]);
  assert.deepEqual(body.agent.modelProvider, { providerId: "mock", model: "mock" });
  assert.equal(toolRegistry.allowed("engineer", "workspace.write"), false);
  assert.equal(toolRegistry.allowed("engineer", "Bash"), true);
  assert.equal(toolRegistry.allowed("engineer", "github.search_issues"), false);

  const providers = await readJson(await fetch(`${baseUrl}/ai-team/api/model-providers`));
  assert.equal(providers.defaultProviderId, "codex");
  assert.equal(providers.providers.some((provider) => provider.id === "mock" || provider.type === "mock"), false);

  const dashboard = await readJson(await fetch(`${baseUrl}/ai-team/api/dashboard`, {
    headers: { "x-ai-team-admin-token": "AI-team" }
  }));
  assert.equal(dashboard.modelProviders.providers.some((provider) => provider.id === "mock" || provider.type === "mock"), false);

  const mockProviderResponse = await fetch(`${baseUrl}/ai-team/api/model-providers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: {
        id: "user-mock",
        name: "User Mock",
        type: "mock",
        authMode: "none",
        models: ["mock"],
        defaultModel: "mock"
      }
    })
  });
  const mockProviderBody = await readJson(mockProviderResponse);
  assert.equal(mockProviderResponse.status, 400);
  assert.match(mockProviderBody.error, /mock model provider is internal/);

  const mockCheckResponse = await fetch(`${baseUrl}/ai-team/api/model-providers/mock/check`, {
    method: "POST",
    headers: { "content-type": "application/json" }
  });
  const mockCheckBody = await readJson(mockCheckResponse);
  assert.equal(mockCheckResponse.status, 404);
  assert.match(mockCheckBody.error, /provider not found: mock/);

  const providerResponse = await fetch(`${baseUrl}/ai-team/api/model-providers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: {
        id: "codex-research",
        name: "Codex Research",
        type: "codex",
        authMode: "subscription",
        codexBin: "codex",
        models: ["gpt-5.5"],
        defaultModel: "gpt-5.5"
      }
    })
  });
  const providerBody = await readJson(providerResponse);
  assert.equal(providerResponse.status, 200);
  assert.ok(providerBody.providers.some((provider) => provider.id === "codex-research"));

  const createResponse = await fetch(`${baseUrl}/ai-team/api/agents/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      role: "requirements",
      name: "Curie",
      title: "Requirements Analyst",
      [droppedConfigFields[1]]: "Legacy configured intake",
      [droppedConfigFields[0]]: "Own configured intent intake.",
      prompt: "Produce task graphs from inbound intents.",
      tools: ["memory.search", "engine.transition", "Bash"],
      modelProvider: { providerId: "codex-research", model: "gpt-5.5" },
      wakeRules: [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }]
    })
  });
  const createBody = await readJson(createResponse);
  assert.equal(createResponse.status, 201);
  assert.equal(createBody.agent.role, "requirements");
  assert.equal(createBody.agent.name, "Curie");
  assert.equal(hasDroppedConfigField(createBody.agent), false);
  assert.deepEqual(createBody.agent.tools, ["skill", "engine.transition", "Bash"]);
  assert.deepEqual(createBody.agent.modelProvider, { providerId: "codex-research", model: "gpt-5.5" });
  assert.deepEqual(createBody.agent.wakeRules, [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }]);
  assert.deepEqual((await routingStore.get("requirements")).wakeRules, [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }]);
  assert.equal(toolRegistry.allowed("requirements", "engine.transition"), true);

  const skillResponse = await fetch(`${baseUrl}/ai-team/api/agents/config/engineer/skills`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command: "npx skills install code-review" })
  });
  const skillBody = await readJson(skillResponse);
  assert.equal(skillResponse.status, 200);
  assert.deepEqual(skillInstallCall.args, ["skills", "install", "code-review"]);
  assert.equal(skillInstallCall.cwd, path.join(agentsDir, "Ada"));
  assert.ok(skillBody.agent.skills.some((skill) => skill.id === "code-review"));

  const reloaded = await readJson(await fetch(`${baseUrl}/ai-team/api/agents/config/engineer`));
  assert.equal(reloaded.agent.prompt, "API configured engineer prompt");
  assert.equal(hasDroppedConfigField(reloaded.agent), false);
  assert.deepEqual(reloaded.agent.mcps.map((mcp) => mcp.id), ["github"]);
  assert.deepEqual(reloaded.agent.tools, ["skill", "Bash", "github.search_issues"]);

  const routingResponse = await fetch(`${baseUrl}/ai-team/api/agents/config/engineer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      wakeRules: [{ entityType: "task", status: "waiting", consumerRole: "engineer", afterRunStatus: "done" }]
    })
  });
  const routingBody = await readJson(routingResponse);
  assert.equal(routingResponse.status, 200);
  assert.deepEqual(routingBody.agent.wakeRules, [{ entityType: "task", status: "waiting", consumerRole: "engineer", afterRunStatus: "done" }]);
  assert.deepEqual((await routingStore.get("engineer")).wakeRules, [{ entityType: "task", status: "waiting", consumerRole: "engineer", afterRunStatus: "done" }]);
});

test("coding agent launcher API sanitizes env and preserves hidden fields on save", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-launcher-api-"));
  const codingAgentLauncherStore = new CodingAgentLauncherStore({
    dataDir,
    agentWorkspaceDir: path.join(dataDir, "agent-workspace")
  });
  await codingAgentLauncherStore.init();
  await codingAgentLauncherStore.write([{
    id: "default",
    name: "Coding Agent",
    description: "Default delegated implementation worker.",
    command: "delegate",
    args: ["run", "--workspace", "{{workspace}}", "--prompt", "{{prompt}}"],
    timeoutMs: 60000,
    env: {
      DELEGATE_TOKEN: "secret-token",
      CODEX_SANDBOX: null
    }
  }]);
  const server = createServer({
    codingAgentLauncherStore,
    engine: {
      async readModel() {
        return { projects: [], intents: [], tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
      }
    }
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const publicLaunchers = await readJson(await fetch(`${baseUrl}/ai-team/api/coding-agent-launchers`));
  assert.equal(JSON.stringify(publicLaunchers).includes("secret-token"), false);
  assert.deepEqual(publicLaunchers[0], {
    commandTemplate: "delegate run --workspace {{workspace}} --prompt {{prompt}}",
    timeoutMs: 60000
  });

  const response = await fetch(`${baseUrl}/ai-team/api/coding-agent-launchers`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ai-team-admin-token": "AI-team"
    },
    body: JSON.stringify({
      launcher: {
        commandTemplate: "delegate-v2 exec {{prompt}}",
        timeoutMs: 120000
      }
    })
  });
  assert.equal(response.status, 200);
  const savedPublic = await readJson(response);
  assert.equal(JSON.stringify(savedPublic).includes("secret-token"), false);
  assert.deepEqual(savedPublic[0], {
    commandTemplate: "delegate-v2 exec {{prompt}}",
    timeoutMs: 120000
  });

  const savedPrivate = await codingAgentLauncherStore.list();
  assert.deepEqual(savedPrivate[0], {
    id: "default",
    name: "Coding Agent",
    description: "Default delegated implementation worker.",
    command: "delegate",
    args: [],
    commandTemplate: "delegate-v2 exec {{prompt}}",
    timeoutMs: 120000,
    env: {
      DELEGATE_TOKEN: "secret-token",
      CODEX_SANDBOX: null
    }
  });
});

test("agent one one API runs the selected Agent with configured runtime context", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-one-one-api-"));
  const toolRegistry = new ToolRegistry();
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await agentConfigStore.update("qa", {
    prompt: "API Turing one one prompt",
    skills: ["risk-review"],
    mcps: [{ configJson: JSON.stringify({ mcpServers: { sentry: { url: "https://example.com/mcp" } } }) }],
    tools: ["memory.search", "Bash"],
    modelProvider: { providerId: "mock", model: "mock" }
  });
  let providerInput;
  const provider = {
    id: "mock",
    capabilities: { supportsTools: false },
    async resolveTurnConfig(selection) {
      return {
        providerId: selection.providerId || "mock",
        runner: "provider",
        model: selection.model || "mock",
        provider: { id: selection.providerId || "mock", type: "provider", runner: "provider" }
      };
    },
    async runAgentTurn(input) {
      providerInput = input;
      return { finalMessage: "API one one reply", structuredOutput: { ok: true } };
    }
  };
  const server = createServer({
    config: { adminToken: undefined, runner: { type: "provider" }, provider: { id: "mock" }, workspace: dataDir, toolPolicy: {} },
    agentConfigStore,
    toolRegistry,
    memory,
    agentRuntime: new AgentRuntime({ memory, toolRegistry, agentConfigStore }),
    provider
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/agents/qa/one-one`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "检查这个需求",
      history: [{ role: "user", text: "先前上下文" }]
    })
  });
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.reply.message, "API one one reply");
  assert.equal(body.reply.directAgentTurn, true);
  assert.equal(body.reply.engineIntentCreated, false);
  assert.ok(body.reply.capabilities.toolCount > 0);
  assert.deepEqual(body.reply.turn.skills, ["risk-review"]);
  assert.deepEqual(body.reply.turn.mcps, ["sentry"]);
  assert.deepEqual(body.reply.turn.tools, ["skill", "Bash"]);
  assert.match(providerInput.prompt, /API Turing one one prompt/);
  assert.match(providerInput.prompt, /## skills\.metadata/);
  assert.match(providerInput.prompt, /- risk-review: Registered for this agent through: agent configuration/);
  assert.doesNotMatch(providerInput.prompt, /sentry/);
  assert.doesNotMatch(providerInput.prompt, /Bash/);
  assert.match(providerInput.prompt, /先前上下文/);
});

test("agent one one API accepts structured coaching mode and linked context", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-one-one-api-coaching-"));
  const toolRegistry = new ToolRegistry();
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", {
    prompt: "Ask for missing context as structured needs.",
    tools: ["memory.search"],
    modelProvider: { providerId: "mock", model: "mock" }
  });
  let providerInput;
  const provider = {
    id: "mock",
    capabilities: { supportsTools: false },
    async resolveTurnConfig(selection) {
      return {
        providerId: selection.providerId || "mock",
        runner: "provider",
        model: selection.model || "mock",
        provider: { id: selection.providerId || "mock", type: "provider", runner: "provider" }
      };
    },
    async runAgentTurn(input) {
      providerInput = input;
      return {
        finalMessage: "I need the success metric.",
        structuredOutput: {
          contextNeeds: [
            {
              category: "metric",
              priority: "medium",
              question: "What success metric should I optimize?",
              whyItMatters: "It sets the product tradeoff.",
              suggestedMemoryKind: "fact"
            }
          ]
        }
      };
    }
  };
  const server = createServer({
    config: { adminToken: undefined, runner: { type: "provider" }, provider: { id: "mock" }, workspace: dataDir, toolPolicy: {} },
    agentConfigStore,
    toolRegistry,
    memory,
    agentRuntime: new AgentRuntime({ memory, toolRegistry, agentConfigStore }),
    provider
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const response = await fetch(`${baseUrl}/ai-team/api/agents/engineer/one-one`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "context_audit",
      message: "Audit your missing context.",
      linkedContext: { intentId: "intent_api", taskId: "task_api" }
    })
  });
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.reply.mode, "context_audit");
  assert.deepEqual(body.reply.linkedContext, { intentId: "intent_api", taskId: "task_api" });
  assert.equal(body.reply.contextNeeds[0].question, "What success metric should I optimize?");
  assert.equal(body.reply.contextNeeds[0].priority, "medium");
  assert.equal(body.reply.contextNeeds[0].suggestedMemoryKind, "fact");
  assert.equal(body.reply.structuredOutput, undefined);
  assert.equal(Object.hasOwn(body.reply.coachingRecord, "path"), false);
  assert.equal(providerInput.purpose, "agent_one_one");
  assert.match(providerInput.prompt, /contextNeeds/);
  assert.match(providerInput.prompt, /intent_api/);
});

test("agent memory API writes sanitized Agent-scoped memory for one one coaching", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-memory-api-"));
  const toolRegistry = new ToolRegistry();
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await agentConfigStore.update("qa", {
    name: "Turing",
    prompt: "Review work with learned acceptance criteria.",
    tools: ["memory.search"],
    modelProvider: { providerId: "mock", model: "mock" }
  });
  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });
  const server = createServer({
    config: { adminToken: undefined, runner: { type: "provider" }, provider: { id: "mock" }, workspace: dataDir, toolPolicy: {} },
    agentConfigStore,
    toolRegistry,
    memory,
    agentRuntime: runtime,
    provider: { id: "mock", async runAgentTurn() { return { finalMessage: "ok" }; } }
  });
  t.after(() => server.close());
  const baseUrl = await listen(server);
  const profile = await agentConfigStore.get("qa");
  const stores = runtime.storesForProfile(profile, profile.name);
  const [need] = await stores.memory.recordContextNeeds({
    needs: [{
      category: "acceptance",
      priority: "high",
      question: "Which acceptance checklist should Turing apply? /Users/example/private-plan TOKEN=context-secret",
      whyItMatters: "The reviewer needs durable acceptance criteria from /Users/example/private-brief.",
      suggestedMemoryKind: "preference"
    }],
    source: { mode: "context_audit" }
  });

  const response = await fetch(`${baseUrl}/ai-team/api/agents/qa/memory`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "preference",
      key: "preference.acceptance_criteria",
      value: "Preference: Always review acceptance criteria before approving work. TOKEN=memory-secret /Users/example/memory-note",
      contextNeedId: need.id
    })
  });
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.result.role, "qa");
  assert.equal(body.result.active, true);
  assert.equal(body.result.memory.kind, "long_term");
  assert.equal(Object.hasOwn(body.result.memory.candidate, "path"), false);
  assert.equal(Object.hasOwn(body.result.memory, "path"), false);
  assert.equal(body.result.contextNeed.status, "resolved");
  assert.equal(body.result.contextNeed.resolution.type, "memory");
  assert.doesNotMatch(JSON.stringify(body.result), /context-secret|memory-secret|private-plan|private-brief|memory-note|\/Users\/example/);

  const facts = await stores.memory.readLongTermFacts({ query: "acceptance criteria", limit: 5 });
  assert.ok(facts.some((fact) => fact.text.includes("Always review acceptance criteria")));
  assert.deepEqual(await stores.memory.readContextNeeds(), []);
  const allNeeds = await stores.memory.readContextNeeds({ status: "all" });
  assert.equal(allNeeds[0].id, need.id);
  assert.equal(allNeeds[0].status, "resolved");
  assert.equal(allNeeds[0].operations.at(-1).toStatus, "resolved");

  const [dismissableNeed] = await stores.memory.recordContextNeeds({
    needs: [{ category: "risk", priority: "low", question: "Is this obsolete?", whyItMatters: "Avoids stale work." }],
    source: { mode: "context_audit" }
  });
  const dismissResponse = await fetch(`${baseUrl}/ai-team/api/agents/qa/context-needs/${dismissableNeed.id}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status: "dismissed",
      resolutionType: "dismissed",
      resolution: "No longer relevant after the review policy was saved. TOKEN=dismiss-secret /Users/example/dismiss-note"
    })
  });
  const dismissBody = await readJson(dismissResponse);
  assert.equal(dismissResponse.status, 200);
  assert.equal(dismissBody.contextNeed.status, "dismissed");
  assert.equal(dismissBody.contextNeed.resolution.type, "dismissed");
  assert.doesNotMatch(JSON.stringify(dismissBody), /dismiss-secret|dismiss-note|\/Users\/example/);

  const invalidCloseResponse = await fetch(`${baseUrl}/ai-team/api/agents/qa/memory`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "fact",
      key: "should.not.persist",
      value: "Should not be created when the context need is missing.",
      contextNeedId: "need_missing"
    })
  });
  const invalidCloseBody = await readJson(invalidCloseResponse);
  assert.equal(invalidCloseResponse.status, 404);
  assert.match(invalidCloseBody.error, /context need not found/);
  const factsAfterInvalidClose = await stores.memory.readLongTermFacts({ query: "", limit: 10_000 });
  assert.equal(factsAfterInvalidClose.some((fact) => fact.key === "should.not.persist" || fact.text.includes("Should not be created")), false);

  const missingValueResponse = await fetch(`${baseUrl}/ai-team/api/agents/qa/memory`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "fact" })
  });
  const missingValueBody = await readJson(missingValueResponse);
  assert.equal(missingValueResponse.status, 400);
  assert.match(missingValueBody.error, /memory value is required/);
});
