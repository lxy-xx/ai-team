import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrateAgentWorkspace, migrateProviderWorkspace } from "../src/agent-framework/infrastructure/workspace-migration.js";
import { resolveAgentWorkspacePaths, resolveProviderWorkspacePaths } from "../src/agent-framework/infrastructure/workspace-paths.js";
import { ProviderConfigStore } from "../src/agent-framework/infrastructure/provider/provider-config-store.js";
import { AgentConfigStore } from "../src/agent-framework/infrastructure/agent-config-store.js";
import { EngineStore } from "../src/team-engine/infrastructure/engine-store.js";
import { migrateEngineRuntimeData } from "../src/team-engine/infrastructure/engine-data-migration.js";

async function tempFixture(prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    root,
    dataDir: path.join(root, "data"),
    legacyAgentsDir: path.join(root, "agents"),
    agentWorkspaceDir: path.join(root, "agent-workspace")
  };
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

test("provider workspace migration moves config and local secrets without exposing secrets", async () => {
  const { dataDir, agentWorkspaceDir } = await tempFixture("ai-team-provider-migration-");
  const legacyProviderDir = path.join(dataDir, "providers");
  await writeJson(path.join(legacyProviderDir, "providers.json"), {
    defaultProviderId: "deepseek",
    providers: [
      {
        id: "codex",
        name: "Codex Subscription",
        type: "codex_app_server",
        runner: "codex_app_server",
        authMode: "subscription",
        codexBin: "codex",
        models: ["gpt-5.5", "gpt-5.4"],
        defaultModel: "gpt-5.4",
        health: { checkedAt: "2026-05-23T00:00:00.000Z", ok: true }
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        type: "openai_compatible",
        runner: "openai_compatible",
        provider: "deepseek",
        authMode: "api_key",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        baseUrl: "https://api.deepseek.com",
        models: ["deepseek-chat", "deepseek-reasoner"],
        defaultModel: "deepseek-chat",
        health: { checkedAt: "2026-05-23T00:00:01.000Z", ok: false }
      }
    ]
  });
  await writeJson(path.join(legacyProviderDir, "provider-secrets.json"), {
    apiKeys: {
      deepseek: { value: "fixture-local-secret-value", updatedAt: "2026-05-23T00:00:02.000Z" }
    }
  });

  const report = await migrateProviderWorkspace({ dataDir, agentWorkspaceDir, removeLegacy: true });
  const paths = resolveProviderWorkspacePaths({ agentWorkspaceDir });

  assert.ok(report.copied.includes(paths.providersFile));
  assert.ok(report.copied.includes(paths.providerSecretsFile));
  assert.ok(report.copied.includes(paths.providerHealthFile));
  assert.ok(report.removed.includes(legacyProviderDir));
  assert.equal(await exists(legacyProviderDir), false);

  const migrated = await readJson(paths.providersFile);
  const migratedHealth = await readJson(paths.providerHealthFile);
  assert.equal(migrated.defaultProviderId, "deepseek");
  assert.deepEqual(
    migrated.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      authMode: provider.authMode,
      baseUrl: provider.baseUrl,
      defaultModel: provider.defaultModel,
      models: provider.models,
      health: provider.health
    })),
    [
      {
        id: "codex",
        name: "Codex Subscription",
        authMode: "subscription",
        baseUrl: undefined,
        defaultModel: "gpt-5.4",
        models: ["gpt-5.5", "gpt-5.4"],
        health: undefined
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        authMode: "api_key",
        baseUrl: "https://api.deepseek.com",
        defaultModel: "deepseek-chat",
        models: ["deepseek-chat", "deepseek-reasoner"],
        health: undefined
      }
    ]
  );
  assert.deepEqual(migratedHealth.providers.codex, { checkedAt: "2026-05-23T00:00:00.000Z", ok: true });
  assert.deepEqual(migratedHealth.providers.deepseek, { checkedAt: "2026-05-23T00:00:01.000Z", ok: false });
  assert.equal((await readJson(paths.providerSecretsFile)).apiKeys.deepseek.value, "fixture-local-secret-value");

  const calls = [];
  const store = new ProviderConfigStore({
    dataDir,
    agentWorkspaceDir,
    config: { runner: { type: "codex", codexBin: "codex" }, provider: { id: "codex" } },
    commandRunner: async (input) => {
      calls.push(input);
      return { exitCode: 0, stdout: input.args.join(" ") === "login status" ? "Logged in using ChatGPT" : "codex 1.0.0", stderr: "" };
    }
  });
  await store.init();
  const listed = await store.list();
  const deepseek = listed.providers.find((provider) => provider.id === "deepseek");
  assert.equal(deepseek.apiKeyEnv, "DEEPSEEK_API_KEY");
  assert.equal(deepseek.baseUrl, "https://api.deepseek.com");
  assert.equal(deepseek.defaultModel, "deepseek-chat");
  assert.equal(deepseek.apiKeyConfigured, true);
  assert.equal(JSON.stringify(listed).includes("fixture-local-secret-value"), false);
  assert.equal(JSON.stringify(await store.get("deepseek")).includes("fixture-local-secret-value"), false);

  const resolved = await store.resolve({ providerId: "deepseek" });
  assert.equal(resolved.provider.apiKey, "fixture-local-secret-value");
  assert.equal(Object.keys(resolved.provider).includes("apiKey"), false);

  await store.check("codex");
  assert.deepEqual(calls.map((call) => call.args), [["--version"], ["login", "status"]]);

  const second = await migrateProviderWorkspace({ dataDir, agentWorkspaceDir, removeLegacy: true });
  assert.deepEqual(second.copied, []);
  assert.ok(second.skipped.includes(paths.providersFile));
  assert.ok(second.skipped.includes(paths.providerHealthFile));
});

test("provider workspace migration preserves newer local health and reports config rewrites", async () => {
  const { dataDir, agentWorkspaceDir } = await tempFixture("ai-team-provider-health-merge-");
  const paths = resolveProviderWorkspacePaths({ agentWorkspaceDir });
  await writeJson(paths.providersFile, {
    defaultProviderId: "codex",
    providers: [{
      id: "codex",
      name: "Codex Subscription",
      type: "codex_app_server",
      runner: "codex_app_server",
      authMode: "subscription",
      codexBin: "codex",
      models: ["gpt-5.5"],
      defaultModel: "gpt-5.5",
      health: { checkedAt: "2026-05-22T00:00:00.000Z", ok: false, message: "legacy stale" }
    }]
  });
  await writeJson(paths.providerHealthFile, {
    providers: {
      codex: { checkedAt: "2026-05-23T00:00:00.000Z", ok: true, message: "local fresh" }
    }
  });

  const report = await migrateProviderWorkspace({ dataDir, agentWorkspaceDir, removeLegacy: false });
  const migrated = await readJson(paths.providersFile);
  const health = await readJson(paths.providerHealthFile);

  assert.ok(report.updated.includes(paths.providersFile));
  assert.equal(report.skipped.includes(paths.providersFile), false);
  assert.ok(report.skipped.includes(paths.providerHealthFile));
  assert.equal(migrated.providers.find((provider) => provider.id === "codex").health, undefined);
  assert.deepEqual(health.providers.codex, { checkedAt: "2026-05-23T00:00:00.000Z", ok: true, message: "local fresh" });
});

test("agent workspace migration moves agents, capabilities, memory directories, and minimal metadata", async () => {
  const { dataDir, legacyAgentsDir, agentWorkspaceDir } = await tempFixture("ai-team-agent-migration-");
  const legacyProductDir = path.join(legacyAgentsDir, "LegacyProduct");
  await fs.mkdir(path.join(legacyProductDir, ".agents", "skills", "example"), { recursive: true });
  await fs.mkdir(path.join(legacyProductDir, ".agents", "mcp", "local"), { recursive: true });
  await fs.writeFile(path.join(legacyProductDir, "AGENTS.md"), "Legacy product prompt", "utf8");
  await writeJson(path.join(legacyProductDir, "agent.json"), {
    role: "product_manager",
    name: "LegacyProduct",
    title: "Product Manager",
    mission: "legacy mission must not persist",
    modelProvider: { providerId: "codex", model: "gpt-5.5" }
  });
  await writeJson(path.join(legacyProductDir, "tools.json"), { tools: ["memory.search", "engine.transition", "codex.exec"] });
  await fs.writeFile(path.join(legacyProductDir, ".agents", "skills", "example", "SKILL.md"), "# Example Skill\n", "utf8");
  await writeJson(path.join(legacyProductDir, ".agents", "mcp", "local", "mcp.json"), {
    mcpServers: { local: { command: "local-mcp" } }
  });
  await writeJson(path.join(legacyProductDir, ".agents", "routing.json"), {
    wakeRules: [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }]
  });
  await writeJson(path.join(dataDir, "agents", "configs.json"), {
    product_manager: {
      prompt: "Legacy data prompt wins",
      tools: ["memory.search", "workspace.read", "codex.exec"],
      skills: [{ id: "data-skill", description: "From legacy data config." }],
      mcps: [{ mcpServers: { data: { url: "https://example.invalid/mcp" } } }],
      modelProvider: { providerId: "deepseek", model: "deepseek-chat" },
      mission: "legacy data mission must not persist"
    }
  });

  const report = await migrateAgentWorkspace({ legacyAgentsDir, dataDir, agentWorkspaceDir, removeLegacy: true });
  const paths = resolveAgentWorkspacePaths({ agentWorkspaceDir, agentName: "LegacyProduct" });

  assert.ok(report.copied.includes(paths.agentsMd));
  assert.ok(report.removed.includes(legacyAgentsDir));
  assert.equal(await fs.readFile(paths.agentsMd, "utf8"), "Legacy data prompt wins");
  assert.deepEqual(await readJson(paths.agentJson), {
    role: "product_manager",
    name: "LegacyProduct",
    title: "Product Manager",
    modelProvider: { providerId: "deepseek", model: "deepseek-chat" }
  });
  assert.deepEqual(await readJson(paths.toolsJson), { tools: ["memory.search", "Bash"] });
  assert.equal(await fs.readFile(path.join(paths.skillsDir, "example", "SKILL.md"), "utf8"), "# Example Skill\n");
  assert.equal(await fs.readFile(path.join(paths.skillsDir, "data-skill", "SKILL.md"), "utf8").then((text) => text.includes("From legacy data config.")), true);
  assert.deepEqual(await readJson(path.join(paths.mcpDir, "local", "mcp.json")), {
    mcpServers: { local: { command: "local-mcp" } }
  });
  assert.equal(await exists(path.join(paths.dotAgentsDir, "routing.json")), true);
  assert.equal(await exists(paths.sessionsDir), true);
  assert.equal(await exists(paths.episodicEventsDir), true);
  assert.equal(await exists(paths.longTermDir), true);
  assert.equal(await exists(paths.tracesDir), true);
  assert.equal(await exists(path.join(dataDir, "agents", "configs.json")), false);

  const store = new AgentConfigStore({ dataDir, agentWorkspaceDir });
  await store.init();
  const productManager = await store.get("product_manager");
  assert.equal(productManager.agentDir, paths.agentDir);
  assert.equal(productManager.prompt, "Legacy data prompt wins");
  assert.equal(productManager.wakeRules, undefined);
  assert.equal(productManager.mission, undefined);
  assert.deepEqual(productManager.skills.map((skill) => skill.id).sort(), ["data-skill", "example"]);
  assert.deepEqual(productManager.mcps.map((mcp) => mcp.id).sort(), ["data", "local"]);

  const second = await migrateAgentWorkspace({ legacyAgentsDir, dataDir, agentWorkspaceDir, removeLegacy: true });
  assert.deepEqual(second.copied, []);
  assert.ok(second.skipped.includes(paths.agentJson));
});

test("agent workspace migration does not alias legacy default folder names", async () => {
  const { dataDir, legacyAgentsDir, agentWorkspaceDir } = await tempFixture("ai-team-agent-migration-no-alias-");
  const formerProductDir = path.join(legacyAgentsDir, "FormerProduct");
  await fs.mkdir(formerProductDir, { recursive: true });
  await fs.writeFile(path.join(formerProductDir, "AGENTS.md"), "Former product prompt", "utf8");

  await migrateAgentWorkspace({ legacyAgentsDir, dataDir, agentWorkspaceDir, removeLegacy: false });
  const paths = resolveAgentWorkspacePaths({ agentWorkspaceDir, agentName: "FormerProduct" });

  assert.equal(await fs.readFile(paths.agentsMd, "utf8"), "Former product prompt");
  assert.deepEqual(await readJson(paths.agentJson), {
    role: "FormerProduct",
    name: "FormerProduct",
    title: "FormerProduct"
  });
  await assert.rejects(
    () => fs.access(path.join(agentWorkspaceDir, "agents", "Darwin", "agent.json")),
    { code: "ENOENT" }
  );
});

test("agent workspace migration does not overwrite existing workspace prompt from legacy configs", async () => {
  const { dataDir, legacyAgentsDir, agentWorkspaceDir } = await tempFixture("ai-team-agent-migration-preserve-");
  const paths = resolveAgentWorkspacePaths({ agentWorkspaceDir, agentName: "ExistingCeo" });
  await fs.mkdir(paths.agentDir, { recursive: true });
  await fs.writeFile(paths.agentsMd, "Current workspace prompt", "utf8");
  await writeJson(paths.agentJson, { role: "ceo_cto", name: "ExistingCeo", title: "CEO/CTO" });
  await writeJson(paths.toolsJson, { tools: ["memory.search", "engine.create_intent", "channel.reply"] });
  await writeJson(path.join(dataDir, "agents", "configs.json"), {
    ceo_cto: {
      prompt: "Stale legacy prompt",
      tools: ["memory.search"]
    }
  });

  await migrateAgentWorkspace({ legacyAgentsDir, dataDir, agentWorkspaceDir, removeLegacy: false });

  assert.equal(await fs.readFile(paths.agentsMd, "utf8"), "Current workspace prompt");
  assert.deepEqual(await readJson(paths.toolsJson), { tools: ["memory.search", "engine.create_intent", "channel.reply"] });
});

test("engine runtime data migration consolidates legacy runtime data under data engine", async () => {
  const { dataDir } = await tempFixture("ai-team-engine-migration-");
  await writeJson(path.join(dataDir, "tasks", "tasks.json"), {
    tasks: [
      {
        id: "task_legacy",
        status: "testing",
        intentId: "intent_existing",
        title: "Legacy task",
        history: [{ at: "2026-05-22T00:00:00.000Z", status: "waiting" }],
        operations: [{ at: "2026-05-22T00:00:01.000Z", fromStatus: "waiting", toStatus: "testing", runId: "run_legacy" }],
        runIds: ["run_legacy"],
        artifactIds: ["artifact_legacy"],
        replyTarget: { channel: "cli", threadId: "thread_1" }
      }
    ]
  });
  await writeJson(path.join(dataDir, "customer-feedback", "backlog.json"), [
    {
      id: "feedback_legacy",
      status: "new",
      text: "Preserve feedback",
      linkedTaskId: "task_legacy",
      operations: [{ at: "2026-05-22T00:00:02.000Z", fromStatus: "new", toStatus: "new" }]
    }
  ]);
  await writeJson(path.join(dataDir, "engine", "intents", "intent_existing.json"), {
    id: "intent_existing",
    status: "in_progress",
    replyTarget: { channel: "feishu", messageId: "msg_1" },
    taskIds: ["task_legacy"],
    artifactIds: ["artifact_legacy"],
    operations: [{ at: "2026-05-22T00:00:03.000Z", toStatus: "in_progress" }]
  });
  await writeJson(path.join(dataDir, "engine", "runs", "run_legacy.json"), {
    id: "run_legacy",
    status: "completed",
    provider: "codex",
    model: "gpt-5.5",
    agentConfigSnapshot: { modelProvider: { providerId: "codex", model: "gpt-5.5" } }
  });
  await writeJson(path.join(dataDir, "engine", "artifacts", "intent_existing", "artifact_legacy.json"), {
    id: "artifact_legacy",
    intentId: "intent_existing",
    entityId: "task_legacy",
    data: { summary: "legacy artifact" }
  });
  await writeJson(path.join(dataDir, "engine", "sessions", "engineer%3Acli.json"), {
    key: "engineer:cli",
    activeRunId: "run_legacy",
    queuedEntityIds: ["task_legacy"]
  });

  const report = await migrateEngineRuntimeData({ dataDir, removeLegacy: true });

  assert.ok(report.copied.includes(path.join(dataDir, "engine", "tasks", "task_legacy.json")));
  assert.ok(report.copied.includes(path.join(dataDir, "engine", "feedback", "backlog.json")));
  assert.ok(report.removed.includes(path.join(dataDir, "tasks")));
  assert.ok(report.removed.includes(path.join(dataDir, "customer-feedback")));
  for (const dir of ["intents", "tasks", "feedback", "runs", "artifacts", "sessions", "operations"]) {
    assert.equal(await exists(path.join(dataDir, "engine", dir)), true);
  }

  const task = await readJson(path.join(dataDir, "engine", "tasks", "task_legacy.json"));
  assert.equal(task.id, "task_legacy");
  assert.equal(task.status, "testing");
  assert.deepEqual(task.history, [{ at: "2026-05-22T00:00:00.000Z", status: "waiting" }]);
  assert.deepEqual(task.operations[0], { at: "2026-05-22T00:00:01.000Z", fromStatus: "waiting", toStatus: "testing", runId: "run_legacy" });
  assert.deepEqual(task.runIds, ["run_legacy"]);
  assert.deepEqual(task.artifactIds, ["artifact_legacy"]);
  assert.deepEqual(task.replyTarget, { channel: "cli", threadId: "thread_1" });

  const feedback = await readJson(path.join(dataDir, "engine", "feedback", "backlog.json"));
  assert.equal(feedback[0].id, "feedback_legacy");
  assert.equal(feedback[0].linkedTaskId, "task_legacy");
  assert.equal((await readJson(path.join(dataDir, "engine", "runs", "run_legacy.json"))).agentConfigSnapshot.modelProvider.providerId, "codex");

  const store = new EngineStore({ dataDir });
  await store.init();
  const model = await store.readModel();
  assert.equal(model.tasks.some((item) => item.id === "task_legacy"), true);
  assert.equal(model.feedback.some((item) => item.id === "feedback_legacy"), true);
  assert.equal(model.intents[0].replyTarget.messageId, "msg_1");

  const second = await migrateEngineRuntimeData({ dataDir, removeLegacy: true });
  assert.deepEqual(second.copied, []);
  assert.ok(second.skipped.includes(path.join(dataDir, "engine", "tasks", "task_legacy.json")));
});
