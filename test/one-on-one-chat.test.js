import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentConfigStore } from "../src/agent-framework/infrastructure/agent-config-store.js";
import { onboardDefaultAgentProfiles } from "../src/agent-framework/infrastructure/default-agent-onboarding.js";
import { AgentRuntime } from "../src/agent-framework/application/agent-runtime.js";
import { runAgentOneOnOne, teachAgentOneOnOneMemory } from "../src/agent-framework/application/one-on-one-chat.js";
import { ToolRegistry } from "../src/agent-framework/domain/tools/tool-registry.js";
import { MemoryStore } from "../src/agent-framework/infrastructure/memory-store.js";
import { OnboardingStateStore } from "../src/platform/onboarding-state-store.js";

async function onboardDefaults(agentConfigStore, dataDir) {
  const onboardingStateStore = new OnboardingStateStore({ dataDir });
  await onboardingStateStore.init();
  return onboardDefaultAgentProfiles({ agentConfigStore, onboardingStateStore });
}

test("runAgentOneOnOne loads prompt, skills, MCPs, tools, and model provider for the selected Agent", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-one-one-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  await memory.upsertFact("agent.chat", "Use configured agent context.");
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardDefaults(agentConfigStore, dataDir);
  await agentConfigStore.update("qa", {
    prompt: "Custom Turing one one prompt",
    skills: [{ id: "regression-risk", description: "Prioritize regressions." }],
    mcps: [{ mcpServers: { sentry: { url: "https://sentry.example/mcp" } } }],
    tools: ["memory.search", "Bash"],
    modelProvider: { providerId: "mock", model: "mock" }
  });
  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });
  let providerInput;
  const provider = {
    id: "mock",
    capabilities: { supportsTools: false },
    async resolveTurnConfig(selection) {
      return {
        providerId: selection.providerId,
        runner: "provider",
        model: selection.model,
        provider: { id: selection.providerId, type: "provider", runner: "provider" }
      };
    },
    async runAgentTurn(input) {
      providerInput = input;
      return { finalMessage: "one one response", structuredOutput: { ok: true } };
    }
  };

  const reply = await runAgentOneOnOne({
    role: "qa",
    message: "帮我检查风险",
    history: [{ role: "user", text: "上一句" }],
    agentRuntime: runtime,
    provider,
    config: { workspace: dataDir, runner: { type: "provider" }, provider: { id: "mock" } },
    logger: { debug() {} }
  });

  assert.equal(reply.message, "one one response");
  assert.equal(reply.provider, "mock");
  assert.equal(reply.model, "mock");
  assert.equal(reply.directAgentTurn, true);
  assert.equal(reply.engineIntentCreated, false);
  assert.deepEqual(reply.providerSelection, {
    providerId: "mock",
    runner: "provider",
    model: "mock"
  });
  assert.equal(Object.hasOwn(reply.providerSelection, "provider"), false);
  assert.deepEqual(reply.capabilities, {
    skillCount: 1,
    mcpCount: 1,
    toolCount: 2,
    skills: ["regression-risk"],
    mcps: ["sentry"],
    tools: ["skill", "Bash"]
  });
  assert.deepEqual(reply.turn.skills, ["regression-risk"]);
  assert.deepEqual(reply.turn.mcps, ["sentry"]);
  assert.deepEqual(reply.turn.tools, ["skill", "Bash"]);
  assert.match(providerInput.prompt, /Custom Turing one one prompt/);
  assert.match(providerInput.prompt, /## skills\.metadata/);
  assert.match(providerInput.prompt, /- regression-risk: Prioritize regressions\./);
  assert.doesNotMatch(providerInput.prompt, /sentry/);
  assert.doesNotMatch(providerInput.prompt, /Role Capability Policy/);
  assert.doesNotMatch(providerInput.prompt, /Bash/);
  assert.match(providerInput.prompt, /上一句/);
  assert.deepEqual(providerInput.providerSelection, {
    providerId: "mock",
    runner: "provider",
    model: "mock",
    provider: { id: "mock", type: "provider", runner: "provider" }
  });
});

test("runAgentOneOnOne executes through AgentRuntime.run and records a real session trace", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-one-one-runtime-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardDefaults(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", {
    prompt: "Runtime-only one one prompt",
    tools: ["Bash"],
    modelProvider: { providerId: "runtime-provider", model: "runtime-model" }
  });
  let completeInput;
  const provider = {
    async resolveTurnConfig(selection = {}) {
      return {
        providerId: selection.providerId,
        runner: "openai_compatible",
        model: selection.model,
        provider: { id: selection.providerId, runner: "openai_compatible" }
      };
    },
    async complete(input) {
      completeInput = input;
      return {
        message: {
          role: "assistant",
          content: JSON.stringify({
            message: "runtime one one response",
            contextNeeds: [{
              category: "acceptance",
              priority: "high",
              question: "Which acceptance case matters most?"
            }]
          })
        },
        toolCalls: []
      };
    },
    async runAgentTurn() {
      throw new Error("one one must not bypass AgentRuntime.run");
    }
  };
  const runtime = new AgentRuntime({
    memory,
    toolRegistry,
    agentConfigStore,
    provider,
    config: { rootDir: dataDir, dataDir, agentsDir: path.join(dataDir, "agents"), workspace: dataDir }
  });

  const reply = await runAgentOneOnOne({
    role: "engineer",
    mode: "context_audit",
    message: "检查这次实现还缺什么上下文",
    history: [{ role: "user", text: "上一轮要保留" }],
    linkedContext: { taskId: "task_runtime" },
    agentRuntime: runtime,
    provider,
    config: { workspace: dataDir },
    logger: { debug() {} }
  });

  assert.equal(reply.message, "runtime one one response");
  assert.equal(reply.provider, "runtime-provider");
  assert.equal(reply.model, "runtime-model");
  assert.equal(reply.contextNeeds[0].question, "Which acceptance case matters most?");
  assert.equal(completeInput.purpose, "agent_one_one");
  assert.ok(completeInput.messages.some((message) => String(message.content || "").includes("## assignment.current")));
  assert.ok(completeInput.messages.some((message) => String(message.content || "").includes("上一轮要保留")));
  assert.ok(reply.sessionId);
  assert.ok(reply.traceId?.startsWith("trace_"));
});

test("runAgentOneOnOne rejects unconfigured roles before runtime state is created", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-one-one-missing-role-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await agentConfigStore.init();
  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });

  await assert.rejects(
    () => runAgentOneOnOne({
      role: "reviewer",
      message: "Can you review this?",
      agentRuntime: runtime,
      provider: {
        async runAgentTurn() {
          throw new Error("provider should not run for an unconfigured role");
        }
      },
      config: { workspace: dataDir },
      logger: { debug() {} }
    }),
    /agent not found: reviewer/
  );

  await assert.rejects(() => fs.access(path.join(agentsDir, "reviewer")), { code: "ENOENT" });
});

test("runAgentOneOnOne keeps tool policy out of the prompt for the Agent-selected provider", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-one-one-provider-tools-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardDefaults(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", {
    tools: ["Bash"],
    modelProvider: { providerId: "openai-tools", model: "gpt-4.1" }
  });
  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });
  let providerInput;
  const provider = {
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
      return { finalMessage: "one one response", structuredOutput: { ok: true } };
    }
  };

  await runAgentOneOnOne({
    role: "engineer",
    message: "检查工具策略",
    agentRuntime: runtime,
    provider,
    config: { workspace: dataDir, runner: { type: "codex_app_server" }, provider: { id: "codex-default" } },
    logger: { debug() {} }
  });

  assert.doesNotMatch(providerInput.prompt, /## Enabled Tools/);
  assert.equal(providerInput.prompt.includes("## Role Capability Policy"), false);
  assert.equal(providerInput.prompt.includes("backend does not support structured tool calls"), false);
  assert.equal(providerInput.providerSelection.runner, "openai_compatible");
  assert.equal(providerInput.providerSelection.providerId, "openai-tools");
});

test("runAgentOneOnOne returns structured coaching needs and persists the coaching turn", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-one-one-coaching-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardDefaults(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", {
    prompt: "Ask for missing implementation context before coding.",
    tools: ["memory.search"],
    modelProvider: { providerId: "mock", model: "mock" }
  });
  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });
  let providerInput;
  const provider = {
    id: "mock",
    capabilities: { supportsTools: false },
    async resolveTurnConfig(selection) {
      return {
        providerId: selection.providerId,
        runner: "provider",
        model: selection.model,
        provider: { id: selection.providerId, type: "provider", runner: "provider" }
      };
    },
    async runAgentTurn(input) {
      providerInput = input;
      return {
        finalMessage: "I need the acceptance examples and rollout constraints.",
        structuredOutput: {
          contextNeeds: [
            {
              category: "acceptance",
              priority: "high",
              question: "Which examples define done?",
              whyItMatters: "Without examples I may optimize the wrong behavior.",
              suggestedMemoryKind: "fact",
              relatedTaskId: "task_demo",
              privatePath: "/Users/example/.ssh/id_rsa"
            }
          ],
          memorySuggestions: [
            {
              kind: "procedure",
              key: "playbook.context_first",
              text: "Before implementation, ask for acceptance examples and rollout constraints.",
              reason: "This prevents premature coding."
            }
          ]
        }
      };
    }
  };

  const reply = await runAgentOneOnOne({
    role: "engineer",
    mode: "context_audit",
    message: "Before you implement this dashboard change, tell me what you need.",
    linkedContext: { intentId: "intent_demo", taskId: "task_demo" },
    agentRuntime: runtime,
    provider,
    config: { workspace: dataDir, runner: { type: "provider" }, provider: { id: "mock" } },
    logger: { debug() {} }
  });

  assert.equal(reply.mode, "context_audit");
  assert.deepEqual(reply.linkedContext, { intentId: "intent_demo", taskId: "task_demo" });
  assert.equal(reply.contextNeeds[0].question, "Which examples define done?");
  assert.equal(reply.contextNeeds[0].priority, "high");
  assert.equal(reply.contextNeeds[0].suggestedMemoryKind, "fact");
  assert.equal(reply.contextNeeds[0].privatePath, undefined);
  assert.equal(reply.structuredOutput, undefined);
  assert.doesNotMatch(JSON.stringify(reply), /privatePath|id_rsa/);
  assert.equal(reply.memorySuggestions[0].kind, "procedure");
  assert.equal(reply.memorySuggestions[0].text, "Before implementation, ask for acceptance examples and rollout constraints.");
  assert.equal(Object.hasOwn(reply.coachingRecord, "path"), false);
  assert.match(providerInput.prompt, /structured coaching turn/i);
  assert.match(providerInput.prompt, /contextNeeds/);
  assert.match(providerInput.prompt, /intent_demo/);
  assert.equal(providerInput.purpose, "agent_one_one");

  const profile = await runtime.profileForRole("engineer");
  const stores = runtime.storesForProfile(profile, profile.name);
  const recentSummary = await stores.memory.readRecentSummary();
  assert.match(recentSummary, /One One Coaching/);
  assert.match(recentSummary, /Which examples define done/);
  const contextNeeds = await stores.memory.readContextNeeds();
  assert.equal(contextNeeds.length, 1);
  assert.equal(contextNeeds[0].status, "open");
  assert.equal(contextNeeds[0].priority, "high");
  assert.equal(contextNeeds[0].category, "acceptance");
  assert.equal(contextNeeds[0].question, "Which examples define done?");
  assert.equal(contextNeeds[0].source.mode, "context_audit");
  assert.deepEqual(contextNeeds[0].source.linkedContext, { intentId: "intent_demo", taskId: "task_demo" });
  assert.doesNotMatch(JSON.stringify(contextNeeds), /privatePath|id_rsa/);
});

test("runAgentOneOnOne uses sanitized structured JSON text as public message", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-one-one-json-text-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardDefaults(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", { modelProvider: { providerId: "mock", model: "mock" } });
  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });
  const provider = {
    id: "mock",
    capabilities: { supportsTools: false },
    async resolveTurnConfig(selection) {
      return {
        providerId: selection.providerId,
        runner: "provider",
        model: selection.model,
        provider: { id: selection.providerId, type: "provider", runner: "provider" }
      };
    },
    async runAgentTurn() {
      return {
        finalMessage: JSON.stringify({
          message: "I need the launch owner.",
          contextNeeds: [
            {
              category: "ownership",
              priority: "high",
              question: "Who owns launch approval?",
              privatePath: "/Users/example/private.txt"
            }
          ]
        })
      };
    }
  };

  const reply = await runAgentOneOnOne({
    role: "engineer",
    mode: "context_audit",
    message: "Audit context",
    agentRuntime: runtime,
    provider,
    config: { workspace: dataDir, runner: { type: "provider" }, provider: { id: "mock" } },
    logger: { debug() {} }
  });

  assert.equal(reply.message, "I need the launch owner.");
  assert.equal(reply.contextNeeds[0].question, "Who owns launch approval?");
  assert.equal(reply.contextNeeds[0].privatePath, undefined);
  assert.equal(reply.structuredOutput, undefined);
  assert.doesNotMatch(JSON.stringify(reply), /privatePath|private\.txt/);
});

test("one one can teach Agent-scoped memory that future direct turns receive", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-one-one-memory-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardDefaults(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", {
    prompt: "Use durable employee memory when it is relevant.",
    tools: ["memory.search"],
    modelProvider: { providerId: "mock", model: "mock" }
  });
  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });

  const taught = await teachAgentOneOnOneMemory({
    role: "engineer",
    value: "Preference: Always name tradeoffs before implementation.",
    key: "preference.tradeoffs",
    kind: "preference",
    agentRuntime: runtime
  });

  assert.equal(taught.active, true);
  assert.equal(taught.memory.kind, "long_term");
  assert.equal(Object.hasOwn(taught.memory.candidate, "path"), false);
  assert.equal(Object.hasOwn(taught.memory, "path"), false);

  let providerInput;
  const provider = {
    id: "mock",
    capabilities: { supportsTools: false },
    async resolveTurnConfig(selection) {
      return {
        providerId: selection.providerId,
        runner: "provider",
        model: selection.model,
        provider: { id: selection.providerId, type: "provider", runner: "provider" }
      };
    },
    async runAgentTurn(input) {
      providerInput = input;
      return { finalMessage: "I can see the taught memory." };
    }
  };

  const reply = await runAgentOneOnOne({
    role: "engineer",
    message: "How should you approach implementation?",
    agentRuntime: runtime,
    provider,
    config: { workspace: dataDir, runner: { type: "provider" }, provider: { id: "mock" } },
    logger: { debug() {} }
  });

  assert.match(providerInput.prompt, /memory\.long_term\.selected/);
  assert.match(providerInput.prompt, /Always name tradeoffs before implementation/);
  assert.equal(reply.agentMemory.factCount, 1);
  assert.equal(reply.agentMemory.hasRecentSummary, false);
});

test("one one memory save can close an open context need", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-one-one-need-close-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  await onboardDefaults(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", { modelProvider: { providerId: "mock", model: "mock" } });
  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });
  const profile = await runtime.profileForRole("engineer");
  const stores = runtime.storesForProfile(profile, profile.name);
  const [need] = await stores.memory.recordContextNeeds({
    needs: [{ category: "acceptance", priority: "high", question: "Which examples define done?", suggestedMemoryKind: "fact" }],
    source: { mode: "context_audit" }
  });

  const result = await teachAgentOneOnOneMemory({
    role: "engineer",
    kind: "fact",
    key: "acceptance.examples",
    value: "Acceptance examples: demo task is done when QA can reproduce the flow.",
    contextNeedId: need.id,
    agentRuntime: runtime
  });

  assert.equal(result.contextNeed.status, "resolved");
  assert.equal(result.contextNeed.resolution.type, "memory");
  assert.match(result.contextNeed.resolution.memoryId, /fact_|acceptance/);
  assert.deepEqual(await stores.memory.readContextNeeds(), []);
});
