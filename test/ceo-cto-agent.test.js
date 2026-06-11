import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentRuntime } from "../src/agent-framework/application/agent-runtime.js";
import { getRole } from "../src/agent-framework/domain/roles.js";
import { ToolRegistry } from "../src/agent-framework/domain/tools/tool-registry.js";
import { AgentConfigStore } from "../src/agent-framework/infrastructure/agent-config-store.js";
import { onboardDefaultAgentProfiles } from "../src/agent-framework/infrastructure/default-agent-onboarding.js";
import { MemoryStore } from "../src/agent-framework/infrastructure/memory-store.js";
import { OnboardingStateStore } from "../src/platform/onboarding-state-store.js";

test("default role prompts keep external identity user-facing", () => {
  const ceoPrompt = getRole("ceo_cto").prompt;
  const pmPrompt = getRole("product_manager").prompt;
  const csPrompt = getRole("customer_success").prompt;

  assert.match(ceoPrompt, /Franklin/);
  assert.match(ceoPrompt, /不要自称「AI Team」或「AI Team Agent」/);
  assert.match(pmPrompt, /身份或名字问题/);
  assert.match(pmPrompt, /禁止出现「AI Team Agent」/);
  assert.match(csPrompt, /不要暴露内部工作流标签/);
});

test("default role prompts are substantial Chinese operating prompts", () => {
  for (const role of ["ceo_cto", "product_manager", "engineer", "qa", "customer_success", "operations"]) {
    const prompt = getRole(role).prompt;
    assert.match(prompt, /你是/);
    assert.match(prompt, /工作原则|核心职责|输出要求|边界/);
    assert.ok(prompt.length > 450, `${role} prompt should be substantial`);
    assert.doesNotMatch(prompt, /^\s*You are/m);
  }
});

test("default operations prompt focuses on current local deployment", () => {
  const prompt = getRole("operations").prompt;

  assert.match(prompt, /本机当前工作区/);
  assert.match(prompt, /启动项目|启动服务/);
  assert.match(prompt, /访问地址/);
  assert.match(prompt, /停止\/重启/);
  assert.match(prompt, /不要默认.*远程.*生产环境/s);
});

test("AgentRuntime prepares CEO turns without local role-specific planning", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-runtime-test-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  await memory.upsertFact("company.stack", { runtime: "node", channel: "feishu websocket" });
  await memory.upsertProcedure("release.qa", "For feishu websocket agent changes, run npm test and inspect dashboard smoke checks.");

  const runtime = new AgentRuntime({ memory });
  const turn = await runtime.prepareTurn({
    text: "实现 feishu websocket agent 并测试",
    channel: "feishu",
    threadId: "oc_test"
  });

  assert.equal(turn.agentId, "ceo_cto");
  assert.equal(turn.plan, undefined);
  assert.ok(turn.memoryContext.semantic.some((item) => item.id === "company.stack"));
  assert.ok(turn.memoryContext.procedural.some((item) => item.id === "release.qa"));
  assert.equal((await runtime.profileForRole("engineer")).name, "engineer");
  assert.equal((await runtime.profileForRole("engineer")).tools.length, 0);
  assert.equal(runtime.toolManifestForRun("engineer").some((tool) => tool.id === "Bash"), false);
  assert.equal(runtime.formatSpecialistContext("engineer", turn.memoryContext).includes("Bash"), false);
});

test("AgentRuntime prepares worker turns with role memory and tool manifest", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-runtime-worker-test-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  await memory.upsertFact("engine.context", { note: "Prefer TeamEngine state over file polling." });

  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  await agentConfigStore.init();
  const onboardingStateStore = new OnboardingStateStore({ dataDir });
  await onboardingStateStore.init();
  await onboardDefaultAgentProfiles({ agentConfigStore, onboardingStateStore });

  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });
  const turn = await runtime.prepareTurn({
    role: "engineer",
    intent: {
      id: "intent_1",
      goal: "修复 TeamEngine memory 注入",
      source: { channel: "cli", threadId: "cli", userId: "local" }
    },
    task: {
      id: "task_1",
      title: "Fix worker runtime",
      description: "Make worker prompt use reusable AgentRuntime context."
    },
    session: {
      key: "engineer:cli:cli",
      rollingSummary: "Previous run fixed dashboard routing."
    }
  });

  assert.equal(turn.agentId, "engineer");
  assert.equal(turn.sessionId, "engineer:cli:cli");
  assert.equal(turn.plan, undefined);
  assert.ok(turn.memoryContext.semantic.some((item) => item.id === "engine.context"));
  assert.ok(turn.context.includes("Previous run fixed dashboard routing."));
  assert.equal(turn.context.includes("Bash"), false);
  assert.ok(turn.tools.some((tool) => tool.id === "Bash"));
});
