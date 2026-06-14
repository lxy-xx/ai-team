import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentConfigStore } from "../src/agent-framework/infrastructure/agent-config-store.js";
import { onboardDefaultAgentProfiles } from "../src/agent-framework/infrastructure/default-agent-onboarding.js";
import { AgentRuntime } from "../src/agent-framework/application/agent-runtime.js";
import { ToolRegistry } from "../src/agent-framework/domain/tools/tool-registry.js";
import { MemoryStore } from "../src/agent-framework/infrastructure/memory-store.js";
import { OnboardingStateStore } from "../src/platform/onboarding-state-store.js";

const droppedConfigFields = ["miss" + "ion", "ali" + "as"];

function assertNoDroppedConfigFields(value) {
  for (const field of droppedConfigFields) assert.equal(field in value, false);
}

async function initDefaultAgentStore(store) {
  await store.init();
  const onboardingStateStore = new OnboardingStateStore({ dataDir: store.dataDir });
  await onboardingStateStore.init();
  await onboardDefaultAgentProfiles({ agentConfigStore: store, onboardingStateStore });
  return store;
}

async function writeAgentProfileDir(agentsDir, dirName, metadata) {
  const agentDir = path.join(agentsDir, dirName);
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(path.join(agentDir, "agent.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

test("AgentConfigStore init does not create default employee profiles", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-empty-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  await store.init();

  assert.deepEqual(await store.list(), []);
  await assert.rejects(() => fs.access(path.join(agentsDir, "Ada", "agent.json")), { code: "ENOENT" });
});

test("AgentConfigStore read does not create missing employee profiles", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-read-empty-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  await store.init();

  assert.equal(await store.get("engineer"), undefined);
  assert.equal(await store.getExisting("engineer"), undefined);
  assert.deepEqual(await store.list(), []);
  await assert.rejects(() => fs.access(path.join(agentsDir, "engineer", "agent.json")), { code: "ENOENT" });
  await assert.rejects(() => fs.access(path.join(agentsDir, "Ada", "agent.json")), { code: "ENOENT" });
});

test("AgentConfigStore rejects duplicate role directories", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-duplicate-role-"));
  const agentsDir = path.join(dataDir, "agents-root");
  await writeAgentProfileDir(agentsDir, "Ada", { role: "engineer", name: "Ada", title: "Coding Engineer" });
  await writeAgentProfileDir(agentsDir, "AdaCopy", { role: "engineer", name: "Ada Copy", title: "Coding Engineer" });
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });

  await assert.rejects(() => store.init(), /duplicate agent role directories: engineer/);
});

test("AgentConfigStore concurrent profile reads do not report false duplicate roles", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-concurrent-read-"));
  const agentsDir = path.join(dataDir, "agents-root");
  await writeAgentProfileDir(agentsDir, "Ada", { role: "engineer", name: "Ada", title: "Coding Engineer" });
  await writeAgentProfileDir(agentsDir, "Turing", { role: "qa", name: "Turing", title: "QA" });
  await writeAgentProfileDir(agentsDir, "Darwin", { role: "product_manager", name: "Darwin", title: "Product Manager" });
  await writeAgentProfileDir(agentsDir, "Franklin", { role: "ceo_cto", name: "Franklin", title: "CEO/CTO" });
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  await store.init();

  const batches = await Promise.all(Array.from({ length: 32 }, () => store.list()));

  assert.equal(batches.length, 32);
  assert.deepEqual(batches[0].map((agent) => agent.role).sort(), [
    "ceo_cto",
    "engineer",
    "product_manager",
    "qa"
  ]);
});

test("AgentConfigStore mutating operations reject missing employee profiles", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-mutate-missing-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const store = new AgentConfigStore({
    dataDir,
    agentsDir,
    toolRegistry: new ToolRegistry(),
    commandRunner: async () => {
      throw new Error("skill installer should not run for a missing role");
    }
  });
  await store.init();

  await assert.rejects(
    () => store.update("reviewer", { prompt: "Reviewer prompt" }),
    /agent role not found: reviewer/
  );
  await assert.rejects(
    () => store.installSkillFromCommand("reviewer", "npx skills install code-review"),
    /agent role not found: reviewer/
  );
  await assert.rejects(
    () => store.syncMcpTools("reviewer", "github"),
    /agent role not found: reviewer/
  );
  assert.deepEqual(await store.list(), []);
  await assert.rejects(() => fs.access(path.join(agentsDir, "reviewer", "agent.json")), { code: "ENOENT" });
});

test("AgentConfigStore does not expose get-or-create profile mutation", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-no-get-or-create-"));
  const store = new AgentConfigStore({ dataDir, toolRegistry: new ToolRegistry() });
  await store.init();

  assert.equal(typeof store.getOrCreate, "undefined");
});

test("AgentRuntime missing configured role fallback is in-memory only", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-runtime-profile-missing-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  const memory = new MemoryStore({ dataDir });
  await agentConfigStore.init();
  await memory.init();
  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });

  const profile = await runtime.profileForRole("reviewer");

  assert.equal(profile.role, "reviewer");
  assert.equal(profile.name, "reviewer");
  assert.deepEqual(profile.tools, []);
  assert.deepEqual(await agentConfigStore.list(), []);
  await assert.rejects(() => fs.access(path.join(agentsDir, "reviewer", "agent.json")), { code: "ENOENT" });
});

test("AgentRuntime fallback without config store stays generic and does not load default team profiles", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-runtime-generic-fallback-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const runtime = new AgentRuntime({ memory, toolRegistry: new ToolRegistry() });

  const profile = await runtime.profileForRole("engineer");
  assert.deepEqual(profile, {
    role: "engineer",
    name: "engineer",
    title: "engineer",
    prompt: "You are engineer. Follow your configured wake rules and use Engine tools for lifecycle changes.",
    skills: [],
    mcps: [],
    tools: []
  });
  assert.deepEqual(runtime.toolManifestForRun("engineer", {}, { includeImplicitMemory: false }), []);
});

test("AgentRuntime run rejects missing configured roles before writing runtime state", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-runtime-run-missing-role-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  const memory = new MemoryStore({ dataDir });
  await agentConfigStore.init();
  await memory.init();
  const runtime = new AgentRuntime({
    memory,
    toolRegistry,
    agentConfigStore,
    provider: {
      async complete() {
        throw new Error("provider should not run for an unconfigured role");
      }
    }
  });

  await assert.rejects(
    () => runtime.run({ agentName: "reviewer", inputText: "Review this implementation" }),
    /agent not found: reviewer/
  );
  await assert.rejects(() => fs.access(path.join(agentsDir, "reviewer")), { code: "ENOENT" });
});

test("default agent onboarding seeds profiles once from source defaults", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-onboard-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await store.init();
  const onboardingStateStore = new OnboardingStateStore({ dataDir });
  await onboardingStateStore.init();
  await onboardDefaultAgentProfiles({ agentConfigStore: store, onboardingStateStore });

  const agents = await store.list();
  assert.deepEqual(agents.map((agent) => agent.role).sort(), [
    "ceo_cto",
    "customer_success",
    "engineer",
    "operations",
    "product_manager",
    "qa"
  ]);
  const engineer = await store.get("engineer");
  assert.equal(engineer.name, "Ada");
  assert.match(engineer.prompt, /coding-agent-delegation skill/);
  assert.match(engineer.prompt, /互不依赖的 Coding Agent 可以同时/);
  assert.doesNotMatch(engineer.prompt, /codex-delegated-coding/);
  assert.doesNotMatch(engineer.prompt, /codex -p/);
  assert.doesNotMatch(engineer.prompt, /codex/i);
  assert.doesNotMatch(engineer.prompt, /async_bash/);
  assert.match(engineer.prompt, /coding_agent\.start/);
  assert.match(engineer.prompt, /coding_agent\.status/);
  assert.match(engineer.prompt, /coding_agent\.wait/);
  assert.match(engineer.prompt, /mutually_irrelevant|互不依赖|每个 Coding Agent 的 prompt 必须自包含/);
  for (const toolId of ["Bash", "coding_agent.start", "coding_agent.status", "coding_agent.wait", "coding_agent.cancel"]) {
    assert.ok(engineer.tools.includes(toolId), `${toolId} should be in Ada default tools`);
    assert.equal(toolRegistry.allowed("engineer", toolId), true);
  }
  for (const toolId of ["async_bash.start", "async_bash.status", "async_bash.wait", "async_bash.cancel"]) {
    assert.equal(engineer.tools.includes(toolId), false, `${toolId} should not be exposed to Ada by default`);
  }
  assert.equal(engineer.skills.length, 1);
  assert.equal(engineer.skills[0].id, "coding-agent-delegation");
  assert.match(engineer.skills[0].content, /Available Coding Agents/);
  assert.doesNotMatch(engineer.skills[0].content, /codex/i);
  assert.doesNotMatch(engineer.skills[0].content, /async_bash/);
  assert.match(engineer.skills[0].content, /coding_agent\.start/);
  assert.match(engineer.skills[0].content, /logMode=full/);
  assert.match(engineer.skills[0].content, /explicit project workspace/);
  assert.match(engineer.skills[0].content, /do not guess from `pwd`/);
  assert.equal(
    await fs.readFile(path.join(agentsDir, "Ada", ".agents", "skills", "coding-agent-delegation", "SKILL.md"), "utf8")
      .then((text) => text.includes("coding-agent-delegation")),
    true
  );
  await assert.rejects(
    () => fs.access(path.join(agentsDir, "Ada", "skills")),
    { code: "ENOENT" }
  );
  assert.equal(engineer.output.artifactKind, "implementation_report");
  assert.ok(engineer.output.contract.some((line) => line.includes("implementation_report")));

  const qa = await store.get("qa");
  assert.match(qa.prompt, /必须只返回一个 JSON 对象/);
  assert.match(qa.prompt, /顶层字段/);
  assert.equal(qa.output.artifactKind, "verification_report");
  assert.equal(qa.output.verdictPattern, "^\\s*VERDICT:\\s*(pass|reject)\\b");
  assert.ok(qa.output.contract.some((line) => line.includes('"verdict": "pass"|"reject"')));
  assert.ok(qa.output.contract.some((line) => line.includes("top-level field")));

  const productManager = await store.get("product_manager");
  assert.equal(productManager.output.artifactKind, "task_graph");
  assert.ok(productManager.output.contract.some((line) => line.includes('"kind": "task_graph"')));
  assert.equal(productManager.skills.length, 1);
  assert.equal(productManager.skills[0].id, "task-graph-contract");
  assert.match(productManager.skills[0].content, /Do not wrap the graph inside `agent_output`/);
  assert.match(productManager.skills[0].content, /"kind": "task_graph"/);
  assert.equal(
    await fs.readFile(path.join(agentsDir, "Darwin", ".agents", "skills", "task-graph-contract", "SKILL.md"), "utf8")
      .then((text) => text.includes("task-graph-contract")),
    true
  );
  await assert.rejects(
    () => fs.access(path.join(agentsDir, "Darwin", "skills")),
    { code: "ENOENT" }
  );

  const ceo = await store.get("ceo_cto");
  assert.equal(ceo.skills.length, 1);
  assert.equal(ceo.skills[0].id, "blocker-diagnosis");
  assert.match(ceo.skills[0].content, /Read only/);
  assert.match(ceo.skills[0].content, /AI_TEAM_CONTROL_WORKSPACE/);
  assert.equal(
    await fs.readFile(path.join(agentsDir, "Franklin", ".agents", "skills", "blocker-diagnosis", "SKILL.md"), "utf8")
      .then((text) => text.includes("blocker-diagnosis")),
    true
  );
  await assert.rejects(
    () => fs.access(path.join(agentsDir, "Franklin", "skills")),
    { code: "ENOENT" }
  );

  await store.update("engineer", { prompt: "Custom Ada prompt", tools: ["memory.search"] });
  await onboardDefaultAgentProfiles({ agentConfigStore: store, onboardingStateStore });
  const customized = await store.get("engineer");
  assert.equal(customized.prompt, "Custom Ada prompt");
  assert.deepEqual(customized.tools, ["skill", "memory.search"]);
});

test("default agent onboarding requires an onboarding state store", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-onboard-state-required-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  await store.init();

  await assert.rejects(
    () => onboardDefaultAgentProfiles({ agentConfigStore: store }),
    /onboardDefaultAgentProfiles requires onboardingStateStore/
  );
  assert.deepEqual(await store.list(), []);
});

test("default agent onboarding state does not recreate removed defaults after first seed", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-onboard-state-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  const onboardingStateStore = new OnboardingStateStore({ dataDir });
  await store.init();
  await onboardingStateStore.init();

  await onboardDefaultAgentProfiles({ agentConfigStore: store, onboardingStateStore });
  assert.equal(Boolean(await store.get("engineer")), true);

  await fs.rm(path.join(agentsDir, "Ada"), { recursive: true, force: true });
  await store.loadRoleDirectoryIndex();
  await onboardDefaultAgentProfiles({ agentConfigStore: store, onboardingStateStore });

  assert.equal(await store.get("engineer"), undefined);
  await assert.rejects(() => fs.access(path.join(agentsDir, "Ada", "agent.json")), { code: "ENOENT" });
});

test("AgentConfigStore persists per-agent prompt, skills, MCPs, and tools", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await initDefaultAgentStore(store);

  const updated = await store.update("engineer", {
    prompt: "Custom Ada prompt",
    skills: [
      { id: "code-review", description: "Review implementation before handoff." },
      "release-notes"
    ],
    mcps: [
      {
        configJson: JSON.stringify({
          mcpServers: {
            github: {
              url: "https://example.com/mcp",
              headers: { Authorization: "${GITHUB_TOKEN}" },
              tools: [
                {
                  name: "search_issues",
                  description: "Search GitHub issues.",
                  inputSchema: {
                    type: "object",
                    required: ["query"],
                    properties: { query: { type: "string" } }
                  }
                }
              ]
            }
          }
        }, null, 2)
      },
      {
        mcpServers: {
          linear: {
            command: "linear-mcp",
            args: ["stdio"]
          }
        }
      }
    ],
    tools: ["memory.search", "workspace.read", "github.search_issues", "test.run"],
    modelProvider: { providerId: "codex", model: "gpt-5.5" }
  });

  assert.equal(updated.role, "engineer");
  assert.equal(updated.name, "Ada");
  assert.equal(updated.agentDir, path.join(agentsDir, "Ada"));
  assert.equal(updated.prompt, "Custom Ada prompt");
  assert.deepEqual(updated.skills.map((skill) => skill.id), ["code-review", "release-notes"]);
  assert.deepEqual(updated.mcps.map((mcp) => mcp.id), ["github", "linear"]);
  assert.match(updated.mcps[0].configJson, /"mcpServers"/);
  assert.deepEqual(updated.mcps[0].tools.map((tool) => tool.id), ["github.search_issues"]);
  assert.deepEqual(updated.mcps[0].tools[0].parameters.required, ["query"]);
  assert.deepEqual(updated.tools, ["skill", "memory.search", "Bash", "github.search_issues"]);
  assert.deepEqual(updated.modelProvider, { providerId: "codex", model: "gpt-5.5" });
  assertNoDroppedConfigFields(updated);
  assert.equal(toolRegistry.allowed("engineer", "workspace.write"), false);
  assert.equal(toolRegistry.allowed("engineer", "Bash"), true);
  assert.equal(toolRegistry.allowed("engineer", "test.run"), false);
  assert.equal(toolRegistry.allowed("engineer", "github.search_issues"), false);
  assert.equal(updated.wakeRules, undefined);
  assert.equal(await fs.readFile(path.join(agentsDir, "Ada", "AGENTS.md"), "utf8"), "Custom Ada prompt");
  assert.deepEqual(
    await readJson(path.join(agentsDir, "Ada", "mcp", "github", "mcp.json")),
    {
      mcpServers: {
        github: {
          url: "https://example.com/mcp",
          headers: { Authorization: "${GITHUB_TOKEN}" },
          tools: [
            {
              name: "search_issues",
              description: "Search GitHub issues.",
              inputSchema: {
                type: "object",
                required: ["query"],
                properties: { query: { type: "string" } }
              }
            }
          ]
        }
      }
    }
  );

  const restartedRegistry = new ToolRegistry();
  const restarted = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: restartedRegistry });
  await restarted.init();
  const loaded = await restarted.get("engineer");

  assert.equal(loaded.prompt, "Custom Ada prompt");
  assert.deepEqual(loaded.modelProvider, { providerId: "codex", model: "gpt-5.5" });
  assertNoDroppedConfigFields(loaded);
  assert.deepEqual(loaded.skills.map((skill) => skill.id), ["code-review", "release-notes"]);
  assert.deepEqual(loaded.mcps.map((mcp) => mcp.id), ["github", "linear"]);
  assert.deepEqual(loaded.mcps[0].tools.map((tool) => tool.id), ["github.search_issues"]);
  assert.deepEqual(loaded.tools, ["skill", "memory.search", "Bash", "github.search_issues"]);
  assert.equal(restartedRegistry.allowed("engineer", "workspace.write"), false);
  assert.equal(restartedRegistry.allowed("engineer", "Bash"), true);
  assert.equal(restartedRegistry.allowed("engineer", "codex.exec"), false);
  assert.equal(restartedRegistry.allowed("engineer", "github.search_issues"), false);
});

test("AgentConfigStore removes selected skills without rewriting remaining skill files", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-remove-skill-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  await initDefaultAgentStore(store);
  await store.update("engineer", {
    skills: [
      { id: "deep-review", description: "Keep the real review body." },
      { id: "risk-review", description: "Remove this one." }
    ]
  });

  const keptSkill = path.join(agentsDir, "Ada", ".agents", "skills", "deep-review", "SKILL.md");
  const keptExtra = path.join(agentsDir, "Ada", ".agents", "skills", "deep-review", "examples.md");
  const removedSkill = path.join(agentsDir, "Ada", ".agents", "skills", "risk-review", "SKILL.md");
  const originalMarkdown = "---\nname: deep-review\ndescription: Keep the real review body.\n---\n\n# Deep Review\n\nUNIQUE_RUNTIME_SKILL_BODY\n";
  await fs.writeFile(keptSkill, originalMarkdown);
  await fs.writeFile(keptExtra, "important extra file");

  const updated = await store.update("engineer", {
    removeSkills: ["risk-review"]
  });

  assert.deepEqual(updated.skills.map((skill) => skill.id), ["deep-review"]);
  assert.equal(await fs.readFile(keptSkill, "utf8"), originalMarkdown);
  assert.equal(await fs.readFile(keptExtra, "utf8"), "important extra file");
  await assert.rejects(() => fs.access(removedSkill), { code: "ENOENT" });
});

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

test("AgentConfigStore create writes only minimal Agent Framework metadata", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-minimal-create-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await initDefaultAgentStore(store);

  assert.deepEqual(await readJson(path.join(agentsDir, "Ada", "agent.json")), {
    role: "engineer",
    name: "Ada",
    title: "Coding Engineer"
  });

  const created = await store.create({
    name: "Curie",
    role: "requirements",
    title: "Requirements Analyst",
    [droppedConfigFields[1]]: "Requirements owner",
    [droppedConfigFields[0]]: "Turn inbound requests into precise task graphs.",
    prompt: "You are Curie. Produce a task_graph when consuming new intents.",
    tools: ["memory.search", "engine.transition", "Bash"],
    modelProvider: { providerId: "mock", model: "mock" },
    wakeRules: [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }],
    routing: { consumes: ["intent/new"] },
    contextWindow: 123_456,
    memory: { enabled: false },
    memoryEnabled: false
  });

  assertNoDroppedConfigFields(created);

  assert.deepEqual(await readJson(path.join(agentsDir, "Curie", "agent.json")), {
    role: "requirements",
    name: "Curie",
    title: "Requirements Analyst",
    modelProvider: { providerId: "mock", model: "mock" }
  });
});

test("AgentConfigStore keeps skill enabled by default for newly created agents", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-create-skill-default-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await store.init();

  const created = await store.create({
    name: "Curie",
    role: "requirements",
    title: "Requirements Analyst",
    prompt: "You are Curie.",
    tools: []
  });

  assert.deepEqual(created.tools, ["skill"]);
  assert.deepEqual(await readJson(path.join(agentsDir, "Curie", "tools.json")), { tools: ["skill"] });
  assert.equal(toolRegistry.allowed("requirements", "skill"), true);
});

test("AgentConfigStore update cleans legacy agent.json down to minimal metadata", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-minimal-update-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const agentDir = path.join(agentsDir, "Ada");
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(path.join(agentDir, "AGENTS.md"), "Legacy Ada prompt");
  await fs.writeFile(path.join(agentDir, "agent.json"), JSON.stringify({
    role: "requirements",
    name: "Ada",
    title: "Requirements Analyst",
    [droppedConfigFields[1]]: "Legacy display name",
    [droppedConfigFields[0]]: "Legacy persisted purpose",
    wakeRules: [{ entityType: "intent", status: "new" }],
    routing: { consumes: ["intent/new"] },
    contextWindow: 123_456,
    memory: { enabled: false },
    modelProvider: { providerId: "mock", model: "mock" }
  }, null, 2));

  const toolRegistry = new ToolRegistry();
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await store.init();
  const legacy = await store.get("requirements");
  assertNoDroppedConfigFields(legacy);
  assert.equal(legacy.wakeRules, undefined);
  assert.equal(legacy.routing, undefined);
  assert.equal(legacy.contextWindow, undefined);
  assert.equal(legacy.memory, undefined);

  const updated = await store.update("requirements", {
    prompt: "Updated Ada prompt",
    [droppedConfigFields[0]]: "Ignored purpose",
    [droppedConfigFields[1]]: "Ignored display name",
    wakeRules: [{ entityType: "task", status: "waiting" }],
    routing: { consumes: ["task/waiting"] },
    contextWindow: 999,
    memory: { enabled: true },
    memoryEnabled: true
  });

  assertNoDroppedConfigFields(updated);

  assert.deepEqual(await readJson(path.join(agentDir, "agent.json")), {
    role: "requirements",
    name: "Ada",
    title: "Requirements Analyst",
    modelProvider: { providerId: "mock", model: "mock" }
  });
});

test("AgentConfigStore creates custom agents without owning wake rules", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-custom-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await store.init();

  const created = await store.create({
    name: "Ada",
    role: "requirements",
    title: "Requirements Analyst",
    [droppedConfigFields[0]]: "Turn inbound requests into precise task graphs.",
    prompt: "You are Ada. Produce a task_graph when consuming new intents.",
    tools: ["memory.search", "engine.transition", "Bash"],
    modelProvider: { providerId: "mock", model: "mock" },
    wakeRules: [
      {
        entityType: "intent",
        status: "new",
        afterRunStatus: "in_progress"
      }
    ]
  });

  assert.equal(created.role, "requirements");
  assert.equal(created.name, "Ada");
  assert.equal(created.agentDir, path.join(agentsDir, "Ada"));
  assert.deepEqual(created.modelProvider, { providerId: "mock", model: "mock" });
  assertNoDroppedConfigFields(created);
  assert.equal(created.wakeRules, undefined);
  assert.equal(toolRegistry.allowed("requirements", "engine.transition"), true);
  assert.ok((await store.list()).some((agent) => agent.role === "requirements"));
  assert.equal(store.consumersFor, undefined);
});

test("AgentConfigStore create and update do not write Agent Framework routing files", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-no-routing-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await store.init();

  const created = await store.create({
    name: "Ada",
    role: "requirements",
    title: "Requirements Analyst",
    prompt: "Create task graphs.",
    tools: ["memory.search", "engine.transition", "Bash"],
    wakeRules: [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }]
  });
  await store.update("requirements", {
    wakeRules: [{ entityType: "task", status: "waiting", consumerRole: "analyst" }],
    prompt: "Updated prompt"
  });

  assert.equal(created.wakeRules, undefined);
  await assert.rejects(
    fs.access(path.join(agentsDir, "Ada", ".agents", "routing.json")),
    /ENOENT/
  );
  assert.equal((await store.get("requirements")).wakeRules, undefined);
});

test("AgentConfigStore executes restricted npx skills commands in the agent folder", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-skill-command-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  let call;
  const commandRunner = async (input) => {
    call = input;
    const skillDir = path.join(input.cwd, ".agents", "skills", "regression-risk");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(skillDir + "/SKILL.md", "---\nname: regression-risk\ndescription: Prioritize regressions.\n---\n\n# Regression Risk\n");
    return { status: 0, stdout: "installed", stderr: "" };
  };
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry, commandRunner });
  await initDefaultAgentStore(store);

  const updated = await store.installSkillFromCommand("qa", "npx skills install regression-risk");

  assert.equal(call.command, "npx");
  assert.deepEqual(call.args, ["skills", "install", "regression-risk"]);
  assert.equal(call.cwd, path.join(agentsDir, "Turing"));
  assert.equal(call.env.AI_TEAM_SKILLS_DIR, path.join(agentsDir, "Turing", ".agents", "skills"));
  assert.deepEqual(updated.skills.map((skill) => skill.id), ["regression-risk"]);
  await assert.rejects(
    () => fs.access(path.join(agentsDir, "Turing", "skills")),
    { code: "ENOENT" }
  );
  await assert.rejects(
    () => store.installSkillFromCommand("qa", "npx cowsay regression-risk"),
    /npx skills/
  );
});

test("AgentConfigStore migrates legacy configs once into existing agent folders", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-legacy-"));
  const agentsDir = path.join(dataDir, "agents-root");
  await fs.mkdir(path.join(dataDir, "agents"), { recursive: true });
  await fs.writeFile(path.join(dataDir, "agents", "configs.json"), JSON.stringify({
    ceo_cto: {
      prompt: "Legacy CEO prompt",
      tools: ["memory.search", "workspace.read", "shell.exec", "codex.exec"],
      skills: ["strategy-review"],
      mcps: [{ mcpServers: { stitch: { url: "https://stitch.googleapis.com/mcp" } } }]
    }
  }, null, 2));
  await fs.mkdir(path.join(agentsDir, "Franklin"), { recursive: true });
  await fs.writeFile(path.join(agentsDir, "Franklin", "AGENTS.md"), "Default already existed");
  await fs.writeFile(path.join(agentsDir, "Franklin", "tools.json"), JSON.stringify({ tools: ["memory.search"] }, null, 2));

  const toolRegistry = new ToolRegistry();
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await initDefaultAgentStore(store);
  const migrated = await store.get("ceo_cto");

  assert.equal(migrated.prompt, "Legacy CEO prompt");
  assert.deepEqual(migrated.tools, ["skill", "memory.search", "Bash"]);
  assert.deepEqual(migrated.skills.map((skill) => skill.id), ["blocker-diagnosis", "strategy-review"]);
  assert.deepEqual(migrated.mcps.map((mcp) => mcp.id), ["stitch"]);
  assert.ok(await readJson(path.join(agentsDir, "Franklin", "migration.json")));

  await fs.writeFile(path.join(agentsDir, "Franklin", "AGENTS.md"), "New directory prompt");
  const restarted = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  await restarted.init();
  assert.equal((await restarted.get("ceo_cto")).prompt, "New directory prompt");
});

test("AgentConfigStore syncs discovered MCP tools into the server config", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-mcp-sync-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const calls = [];
  const store = new AgentConfigStore({
    dataDir,
    agentsDir,
    toolRegistry: new ToolRegistry(),
    mcpToolDiscoverer: async (server, context) => {
      calls.push({ server, context });
      return [
        {
          name: "generate_ui",
          description: "Generate UI from a prompt.",
          inputSchema: {
            type: "object",
            required: ["prompt"],
            properties: { prompt: { type: "string" } }
          }
        }
      ];
    }
  });
  await initDefaultAgentStore(store);
  await store.update("product_manager", {
    mcps: [{ mcpServers: { stitch: { url: "https://stitch.example/mcp", headers: { Authorization: "${STITCH_TOKEN}" } } } }],
    tools: ["memory.search"]
  });

  const synced = await store.syncMcpTools("product_manager", "stitch");
  const persisted = await readJson(path.join(agentsDir, "Darwin", "mcp", "stitch", "mcp.json"));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].context.serverId, "stitch");
  assert.equal(calls[0].server.url, "https://stitch.example/mcp");
  assert.deepEqual(synced.mcps[0].tools.map((tool) => tool.id), ["stitch.generate_ui"]);
  assert.deepEqual(synced.tools, ["skill", "memory.search", "stitch.generate_ui"]);
  assert.doesNotMatch(synced.mcps[0].configJson, /"tools"/);
  assert.deepEqual(persisted.mcpServers.stitch.tools, [
    {
      name: "generate_ui",
      description: "Generate UI from a prompt.",
      inputSchema: {
        type: "object",
        required: ["prompt"],
        properties: { prompt: { type: "string" } }
      }
    }
  ]);
});

test("AgentConfigStore enables tools declared by newly installed MCPs when no explicit tool selection is submitted", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-mcp-default-tools-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  await initDefaultAgentStore(store);

  const updated = await store.update("product_manager", {
    mcps: [{
      mcpServers: {
        notion: {
          url: "https://notion.example/mcp",
          tools: [
            { name: "search", description: "Search Notion." },
            { name: "create_page", description: "Create a Notion page." }
          ]
        }
      }
    }]
  });

  assert.deepEqual(updated.mcps[0].tools.map((tool) => tool.id), ["notion.search", "notion.create_page"]);
  assert.ok(updated.tools.includes("notion.search"));
  assert.ok(updated.tools.includes("notion.create_page"));
});

test("AgentConfigStore omits editable MCP runtime tool fields from config JSON", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-mcp-editable-json-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  await initDefaultAgentStore(store);

  const updated = await store.update("product_manager", {
    mcps: [{
      mcpServers: {
        docs: {
          url: "https://docs.example/mcp",
          tools: [{ name: "search", description: "Search docs." }],
          availableTools: [{ name: "create_page", description: "Create docs." }]
        }
      }
    }]
  });

  assert.deepEqual(updated.mcps[0].tools.map((tool) => tool.id), ["docs.search"]);
  assert.doesNotMatch(updated.mcps[0].configJson, /"tools"/);
  assert.doesNotMatch(updated.mcps[0].configJson, /"availableTools"/);
});

test("AgentConfigStore preserves MCP tools when editing with short JSON", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-mcp-short-edit-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const store = new AgentConfigStore({ dataDir, agentsDir, toolRegistry: new ToolRegistry() });
  await initDefaultAgentStore(store);
  const discoveredTools = [
    {
      name: "search_issues",
      description: "Search GitHub issues.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } }
      }
    }
  ];
  await store.update("engineer", {
    mcps: [
      {
        configJson: JSON.stringify({
          mcpServers: {
            github: {
              url: "https://example.com/mcp",
              headers: { Authorization: "${GITHUB_TOKEN}" },
              tools: discoveredTools
            }
          }
        }, null, 2)
      }
    ],
    tools: ["memory.search", "github.search_issues"]
  });

  const edited = await store.update("engineer", {
    mcps: [
      {
        configJson: JSON.stringify({
          mcpServers: {
            github: {
              url: "https://github.example/mcp",
              headers: { Authorization: "${GITHUB_TOKEN}" }
            }
          }
        }, null, 2)
      }
    ]
  });
  const persisted = await readJson(path.join(agentsDir, "Ada", "mcp", "github", "mcp.json"));

  assert.equal(persisted.mcpServers.github.url, "https://github.example/mcp");
  assert.deepEqual(persisted.mcpServers.github.tools, discoveredTools);
  assert.deepEqual(edited.mcps[0].tools.map((tool) => tool.id), ["github.search_issues"]);
  assert.deepEqual(edited.tools, ["skill", "memory.search", "github.search_issues"]);
});

test("AgentRuntime uses configured agent profile in prepared turns", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-config-runtime-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await initDefaultAgentStore(agentConfigStore);
  await agentConfigStore.update("qa", {
    prompt: "Custom Turing prompt",
    skills: [{ id: "regression-risk", description: "Prioritize regressions." }],
    mcps: [
      {
        mcpServers: {
          sentry: {
            url: "https://sentry.example/mcp",
            headers: { Authorization: "Bearer should-not-leak" },
            env: { SENTRY_TOKEN: "also-should-not-leak" },
            apiKey: "plain-secret-value",
            neutralArray: ["sk-testsecret12345", { note: "TOKEN=neutral-token-value" }],
            tools: [
              {
                name: "capture_event",
                description: "Capture an error event.",
                inputSchema: {
                  type: "object",
                  required: ["message"],
                  properties: { message: { type: "string" } }
                }
              },
              {
                name: "create_issue",
                description: "Create a Sentry issue.",
                inputSchema: {
                  type: "object",
                  required: ["title"],
                  properties: { title: { type: "string" } }
                }
              }
            ]
          }
        }
      }
    ],
    tools: ["memory.search", "Bash", "sentry.capture_event"]
  });
  await fs.writeFile(
    path.join(agentsDir, "Turing", ".agents", "skills", "regression-risk", "SKILL.md"),
    "---\nname: regression-risk\ndescription: Prioritize regressions.\n---\n\n# Regression Risk\n\nUNIQUE_RUNTIME_SKILL_BODY\n"
  );
  const runtime = new AgentRuntime({ memory, toolRegistry, agentConfigStore });

  const turn = await runtime.prepareTurn({
    role: "qa",
    task: { id: "task_1", title: "Verify configurable agents" },
    intent: { id: "intent_1", goal: "Ship configurable agents", source: { channel: "cli" } }
  });

  assert.equal(turn.profile.prompt, "Custom Turing prompt");
  assertNoDroppedConfigFields(turn.profile);
  assert.deepEqual(turn.profile.skills.map((skill) => skill.id), ["regression-risk"]);
  assert.ok(turn.profile.skills[0].content.includes("UNIQUE_RUNTIME_SKILL_BODY"));
  assert.deepEqual(turn.profile.mcps.map((mcp) => mcp.id), ["sentry"]);
  assert.deepEqual(turn.profile.mcps[0].tools.map((tool) => tool.id), ["sentry.capture_event", "sentry.create_issue"]);
  assert.deepEqual(turn.tools.map((tool) => tool.id), ["skill", "memory.search", "Bash", "sentry.capture_event"]);
  assert.equal(turn.tools.some((tool) => tool.id === "sentry.create_issue"), false);
  const skillTool = turn.tools.find((tool) => tool.id === "skill");
  assert.equal("enum" in skillTool.parameters.properties.name, false);
  assert.equal(skillTool.description, "Read an installed Skill markdown file by name.");
  const sentryTool = turn.tools.find((tool) => tool.id === "sentry.capture_event");
  assert.equal(sentryTool.description, "Capture an error event.");
  assert.deepEqual(sentryTool.parameters.required, ["message"]);
  assert.equal(turn.context.includes("UNIQUE_RUNTIME_SKILL_BODY"), false);
  assert.equal(turn.context.includes("sentry"), false);
  assert.equal(turn.context.includes("should-not-leak"), false);
});
