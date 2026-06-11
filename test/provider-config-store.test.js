import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProviderConfigStore } from "../src/agent-framework/infrastructure/provider/provider-config-store.js";
import { readJsonFile } from "../src/platform/json-file.js";
import { resolveProviderWorkspacePaths } from "../src/agent-framework/infrastructure/workspace-paths.js";

test("ProviderConfigStore persists model providers and resolves agent selections", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-provider-config-"));
  const store = new ProviderConfigStore({
    dataDir,
    config: {
      runner: {
        type: "codex",
        codexBin: "codex",
        codexModel: "gpt-5.4",
        codexSandbox: "workspace-write",
        codexApproval: "never",
        codexTimeoutMs: 123000
      },
      provider: { id: "codex", model: "gpt-5.4" },
      toolPolicy: {}
    }
  });
  await store.init();

  const initial = await store.list();
  assert.equal(initial.defaultProviderId, "codex");
  assert.ok(initial.providers.some((provider) => provider.id === "codex" && provider.type === "codex_app_server" && provider.authMode === "subscription"));
  assert.ok(initial.providers.some((provider) =>
    provider.id === "deepseek" &&
    provider.type === "openai_compatible" &&
    provider.provider === "deepseek" &&
    provider.apiKeyEnv === "DEEPSEEK_API_KEY" &&
    provider.models.includes("deepseek-chat")
  ));
  assert.equal(initial.providers.some((provider) => provider.id === "mock" || provider.type === "mock"), false);

  const updated = await store.updateProvider({
    id: "codex-research",
    name: "Codex Research",
    type: "codex_app_server",
    authMode: "subscription",
    codexBin: "codex",
    models: ["gpt-5.5", "gpt-5.4"],
    defaultModel: "gpt-5.5",
    sandbox: "read-only",
    timeoutMs: 456000,
    makeDefault: true
  });

  assert.equal(updated.defaultProviderId, "codex-research");
  const resolved = await store.resolve({ providerId: "codex-research", model: "gpt-5.4" });
  assert.equal(resolved.providerId, "codex-research");
  assert.equal(resolved.runner, "codex_app_server");
  assert.equal(resolved.model, "gpt-5.4");
  assert.equal(resolved.provider.sandbox, "read-only");

  const restarted = new ProviderConfigStore({ dataDir, config: { runner: { type: "mock" }, provider: { id: "mock" } } });
  await restarted.init();
  assert.equal((await restarted.list()).defaultProviderId, "codex-research");
});

test("ProviderConfigStore checks Codex subscription login without API keys", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-provider-check-"));
  const calls = [];
  const store = new ProviderConfigStore({
    dataDir,
    config: { runner: { type: "codex", codexBin: "codex" }, provider: { id: "codex" } },
    commandRunner: async (input) => {
      calls.push(input);
      if (input.args.join(" ") === "login status") return { exitCode: 0, stdout: "Logged in using ChatGPT", stderr: "" };
      return { exitCode: 0, stdout: "codex 1.0.0", stderr: "" };
    }
  });
  await store.init();

  const check = await store.check("codex");
  const paths = resolveProviderWorkspacePaths({ agentWorkspaceDir: path.join(dataDir, "agent-workspace") });

  assert.equal(calls[0].bin, "codex");
  assert.deepEqual(calls[0].args, ["--version"]);
  assert.deepEqual(calls[1].args, ["login", "status"]);
  assert.equal(check.ok, true);
  assert.equal(check.authMode, "subscription");
  assert.match(check.message, /Logged in using ChatGPT/);
  assert.equal(check.loginCommand, "codex login");

  const listed = await store.list();
  const checkedProvider = listed.providers.find((provider) => provider.id === "codex");
  assert.equal(checkedProvider.health.ok, true);
  assert.equal(checkedProvider.health.authMode, "subscription");
  assert.match(checkedProvider.health.message, /Logged in using ChatGPT/);
  assert.match(checkedProvider.health.checkedAt, /^\d{4}-\d{2}-\d{2}T/);

  const persistedProviders = await readJsonFile(paths.providersFile, {});
  assert.equal(persistedProviders.providers.find((provider) => provider.id === "codex").health, undefined);
  const persistedHealth = await readJsonFile(paths.providerHealthFile, {});
  assert.equal(persistedHealth.providers.codex.ok, true);
  assert.match(persistedHealth.providers.codex.checkedAt, /^\d{4}-\d{2}-\d{2}T/);

  const restarted = new ProviderConfigStore({ dataDir, config: { runner: { type: "codex" }, provider: { id: "codex" } } });
  await restarted.init();
  const restartedProvider = (await restarted.list()).providers.find((provider) => provider.id === "codex");
  assert.equal(restartedProvider.health.ok, true);
});

test("ProviderConfigStore redacts command output before returning and persisting health", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-provider-health-redaction-"));
  const store = new ProviderConfigStore({
    dataDir,
    config: { runner: { type: "codex", codexBin: "codex" }, provider: { id: "codex" } },
    commandRunner: async (input) => {
      if (input.args.join(" ") === "login status") {
        return { exitCode: 0, stdout: "Logged in Bearer abcdef123456 Authorization: Basic basic-health-secret Authorization: token ghp_healthsecret X-Api-Key: x-api-health-secret SECRET=login-secret apiKey=camel-secret accessKey=access-secret AWS_ACCESS_KEY_ID=aws-secret", stderr: "" };
      }
      return { exitCode: 0, stdout: "codex-cli 1.0.0 TOKEN=version-secret sk-testsecret12345", stderr: "" };
    }
  });
  await store.init();

  const check = await store.check("codex");
  const listed = await store.list();
  const paths = resolveProviderWorkspacePaths({ agentWorkspaceDir: path.join(dataDir, "agent-workspace") });
  const persistedProviders = await readJsonFile(paths.providersFile, {});
  const persistedHealth = await readJsonFile(paths.providerHealthFile, {});
  const serialized = JSON.stringify({ check, listed, persistedProviders, persistedHealth });

  assert.equal(persistedProviders.providers.find((provider) => provider.id === "codex").health, undefined);
  assert.equal(persistedHealth.providers.codex.ok, true);
  assert.equal(serialized.includes("login-secret"), false);
  assert.equal(serialized.includes("version-secret"), false);
  assert.equal(serialized.includes("camel-secret"), false);
  assert.equal(serialized.includes("access-secret"), false);
  assert.equal(serialized.includes("aws-secret"), false);
  assert.equal(serialized.includes("sk-testsecret12345"), false);
  assert.equal(serialized.includes("Bearer abcdef123456"), false);
  assert.equal(serialized.includes("basic-health-secret"), false);
  assert.equal(serialized.includes("ghp_healthsecret"), false);
  assert.equal(serialized.includes("x-api-health-secret"), false);
  assert.match(serialized, /\[redacted\]/);
});

test("ProviderConfigStore redacts legacy persisted health when reading providers", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-provider-legacy-health-redaction-"));
  const paths = resolveProviderWorkspacePaths({ agentWorkspaceDir: path.join(dataDir, "agent-workspace") });
  const providerFile = paths.providersFile;
  await fs.mkdir(path.dirname(providerFile), { recursive: true });
  await fs.writeFile(providerFile, JSON.stringify({
    defaultProviderId: "codex",
    providers: [{
      id: "codex",
      name: "Codex",
      type: "codex_app_server",
      authMode: "subscription",
      models: ["gpt-5.5"],
      defaultModel: "gpt-5.5",
      health: {
        ok: false,
        message: "TOKEN=legacy-secret apiKey=legacy-api-secret Authorization: Basic legacy-basic-secret Api-Key: legacy-api-key-secret",
        nested: { accessKey: "nested-access-secret" }
      }
    }]
  }), "utf8");
  const store = new ProviderConfigStore({
    dataDir,
    config: { runner: { type: "codex" }, provider: { id: "codex" } }
  });

  await store.init();
  const listed = await store.list();
  const persisted = await readJsonFile(providerFile, {});
  const persistedHealth = await readJsonFile(paths.providerHealthFile, {});
  const serialized = JSON.stringify({ listed, persisted, persistedHealth });

  assert.equal(persisted.providers.find((provider) => provider.id === "codex").health, undefined);
  assert.equal(listed.providers.find((provider) => provider.id === "codex").health.ok, false);
  assert.equal(persistedHealth.providers.codex.ok, false);
  assert.equal(serialized.includes("legacy-secret"), false);
  assert.equal(serialized.includes("legacy-api-secret"), false);
  assert.equal(serialized.includes("legacy-basic-secret"), false);
  assert.equal(serialized.includes("legacy-api-key-secret"), false);
  assert.equal(serialized.includes("nested-access-secret"), false);
  assert.match(serialized, /\[redacted\]/);
});

test("ProviderConfigStore check returns provider result when health persistence fails", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-provider-health-best-effort-"));
  const store = new ProviderConfigStore({
    dataDir,
    config: { runner: { type: "codex", codexBin: "codex" }, provider: { id: "codex" } },
    commandRunner: async (input) => {
      if (input.args.join(" ") === "login status") return { exitCode: 0, stdout: "Logged in using ChatGPT", stderr: "" };
      return { exitCode: 0, stdout: "codex-cli 1.0.0", stderr: "" };
    }
  });
  await store.init();
  store.recordHealth = async () => {
    throw new Error("write failed TOKEN=health-secret");
  };

  const check = await store.check("codex");

  assert.equal(check.ok, true);
  assert.equal(check.healthRecorded, false);
  assert.equal(JSON.stringify(check).includes("health-secret"), false);
});

test("ProviderConfigStore keeps local health out of provider config writes", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-provider-health-config-boundary-"));
  const paths = resolveProviderWorkspacePaths({ agentWorkspaceDir: path.join(dataDir, "agent-workspace") });
  const store = new ProviderConfigStore({
    dataDir,
    config: { runner: { type: "codex", codexBin: "codex" }, provider: { id: "codex" } },
    commandRunner: async (input) => {
      if (input.args.join(" ") === "login status") return { exitCode: 0, stdout: "Logged in using ChatGPT", stderr: "" };
      return { exitCode: 0, stdout: "codex-cli 1.0.0", stderr: "" };
    }
  });
  await store.init();
  await store.check("codex");

  const assertProviderConfigHasNoHealth = async () => {
    const persisted = await readJsonFile(paths.providersFile, {});
    assert.equal(JSON.stringify(persisted).includes("\"health\""), false);
    assert.equal(JSON.stringify(persisted).includes("Logged in using ChatGPT"), false);
  };
  await assertProviderConfigHasNoHealth();

  const updated = await store.updateProvider({
    id: "codex-research",
    name: "Codex Research",
    type: "codex_app_server",
    authMode: "subscription",
    codexBin: "codex",
    models: ["gpt-5.5"],
    defaultModel: "gpt-5.5"
  });
  assert.equal(updated.providers.find((provider) => provider.id === "codex").health.ok, true);
  await assertProviderConfigHasNoHealth();

  await store.setDefault("codex-research");
  await assertProviderConfigHasNoHealth();

  const resolved = await store.resolve({ providerId: "codex" });
  assert.equal(resolved.providerId, "codex");
  await assertProviderConfigHasNoHealth();

  const listed = await store.list();
  assert.equal(listed.providers.find((provider) => provider.id === "codex").health.ok, true);
});

test("ProviderConfigStore does not keep internal mock as the default provider", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-provider-default-mock-"));
  const providerFile = path.join(dataDir, "providers", "providers.json");
  const workspaceProviderFile = resolveProviderWorkspacePaths({ agentWorkspaceDir: path.join(dataDir, "agent-workspace") }).providersFile;
  await fs.mkdir(path.dirname(providerFile), { recursive: true });
  await fs.writeFile(providerFile, JSON.stringify({
    defaultProviderId: "mock",
    providers: [{
      id: "mock",
      name: "Mock Provider",
      type: "mock",
      authMode: "none",
      models: ["mock"],
      defaultModel: "mock",
      internal: true
    }]
  }), "utf8");

  const store = new ProviderConfigStore({
    dataDir,
    config: { runner: { type: "mock" }, provider: { id: "mock" } }
  });
  await store.init();

  const listed = await store.list();
  assert.equal(listed.defaultProviderId, "codex");
  assert.equal(listed.providers.some((provider) => provider.id === "mock" || provider.type === "mock"), false);
  const persisted = await readJsonFile(workspaceProviderFile, {});
  assert.equal(persisted.providers.some((provider) => provider.id === "mock" || provider.type === "mock"), false);
  const resolved = await store.resolve({});
  assert.equal(resolved.providerId, "codex");
});

test("ProviderConfigStore resolves internal mock default without exposing it in public provider lists", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-provider-internal-mock-"));
  const store = new ProviderConfigStore({
    dataDir,
    config: { runner: { type: "mock" }, provider: { id: "mock" } },
    includeMockProvider: true
  });
  await store.init();

  const internal = await store.read({ includeInternal: true });
  assert.equal(internal.defaultProviderId, "mock");
  assert.ok(internal.providers.some((provider) => provider.id === "mock" && provider.type === "mock" && provider.internal === true));
  await store.recordHealth("mock", { ok: true, message: "internal mock is available" });
  const internalWithHealth = await store.read({ includeInternal: true });
  assert.equal(internalWithHealth.health.mock.ok, true);

  const listed = await store.list();
  assert.equal(listed.defaultProviderId, "codex");
  assert.equal(listed.providers.some((provider) => provider.id === "mock" || provider.type === "mock"), false);
  assert.equal(listed.health.mock, undefined);

  const resolved = await store.resolve({});
  assert.equal(resolved.providerId, "mock");
  assert.equal(resolved.runner, "mock");
  assert.equal(resolved.model, "mock");

  await assert.rejects(
    () => store.updateProvider({
      id: "mock",
      name: "User Mock",
      type: "mock",
      authMode: "none",
      models: ["mock"],
      defaultModel: "mock"
    }),
    /mock model provider is internal/
  );
  await assert.rejects(() => store.check("mock"), /provider not found: mock/);
});

test("ProviderConfigStore rejects user-configured mock providers", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-provider-reject-mock-"));
  const store = new ProviderConfigStore({
    dataDir,
    config: { runner: { type: "codex" }, provider: { id: "codex" } }
  });
  await store.init();

  await assert.rejects(
    () => store.updateProvider({
      id: "user-mock",
      name: "User Mock",
      type: "mock",
      authMode: "none",
      models: ["mock"],
      defaultModel: "mock"
    }),
    /mock model provider is internal/
  );
  await assert.rejects(
    () => store.updateProvider({
      id: "mock",
      name: "Reserved Mock",
      type: "codex_app_server",
      authMode: "subscription",
      models: ["gpt-5.5"],
      defaultModel: "gpt-5.5"
    }),
    /mock model provider is internal/
  );
  await assert.rejects(() => store.check("mock"), /provider not found: mock/);
});

test("ProviderConfigStore keeps API key providers to minimal non-secret fields", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-provider-api-key-"));
  const store = new ProviderConfigStore({
    dataDir,
    config: { runner: { type: "codex" }, provider: { id: "codex" } }
  });
  await store.init();

  const updated = await store.updateProvider({
    id: "openai-api",
    name: "OpenAI API",
    type: "codex",
    authMode: "api_key",
    apiKeyEnv: "AI_TEAM_TEST_OPENAI_KEY",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-5.5"],
    defaultModel: "gpt-5.5"
  });

  const provider = updated.providers.find((item) => item.id === "openai-api");
  assert.equal(provider.type, "openai_compatible");
  assert.equal(provider.authMode, "api_key");
  assert.equal(provider.apiKeyEnv, "AI_TEAM_TEST_OPENAI_KEY");
  assert.equal(provider.baseUrl, "https://api.openai.com/v1");
  assert.equal(provider.codexBin, undefined);
  assert.equal(provider.sandbox, undefined);

  const missing = await store.check("openai-api");
  assert.equal(missing.ok, false);
  assert.match(missing.message, /AI_TEAM_TEST_OPENAI_KEY/);

  const previous = process.env.AI_TEAM_TEST_OPENAI_KEY;
  process.env.AI_TEAM_TEST_OPENAI_KEY = "secret";
  try {
    const check = await store.check("openai-api");
    assert.equal(check.ok, true);
    assert.equal(check.apiKeyEnv, "AI_TEAM_TEST_OPENAI_KEY");
    assert.equal("apiKey" in check, false);
  } finally {
    if (previous === undefined) delete process.env.AI_TEAM_TEST_OPENAI_KEY;
    else process.env.AI_TEAM_TEST_OPENAI_KEY = previous;
  }

  const directSecret = await store.updateProvider({
    id: "direct-secret",
    name: "Direct Secret",
    type: "codex",
    authMode: "api_key",
    apiKey: "sk-direct-secret",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-5.5"],
    defaultModel: "gpt-5.5"
  });
  const directProvider = directSecret.providers.find((item) => item.id === "direct-secret");
  assert.equal(directProvider.apiKeyConfigured, true);
  assert.equal("apiKey" in directProvider, false);
  assert.equal(
    JSON.stringify(await readJsonFile(resolveProviderWorkspacePaths({ agentWorkspaceDir: path.join(dataDir, "agent-workspace") }).providersFile, {})).includes("sk-direct-secret"),
    false
  );

  const resolved = await store.resolve({ providerId: "direct-secret" });
  assert.equal(resolved.provider.apiKey, "sk-direct-secret");
  assert.equal(Object.keys(resolved.provider).includes("apiKey"), false);
  const directCheck = await store.check("direct-secret");
  assert.equal(directCheck.ok, true);
  assert.equal("apiKey" in directCheck, false);
});

test("ProviderConfigStore migrates pasted API keys out of apiKeyEnv", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-provider-secret-migrate-"));
  const providerFile = path.join(dataDir, "providers", "providers.json");
  const workspaceProviderFile = resolveProviderWorkspacePaths({ agentWorkspaceDir: path.join(dataDir, "agent-workspace") }).providersFile;
  await fs.mkdir(path.dirname(providerFile), { recursive: true });
  await fs.writeFile(providerFile, JSON.stringify({
    defaultProviderId: "deepseek",
    providers: [{
      id: "deepseek",
      name: "DeepSeek",
      type: "openai_compatible",
      provider: "deepseek",
      authMode: "api_key",
      apiKeyEnv: "sk-pasted-real-key",
      baseUrl: "https://api.deepseek.com",
      models: ["deepseek-chat"],
      defaultModel: "deepseek-chat"
    }]
  }), "utf8");

  const store = new ProviderConfigStore({
    dataDir,
    config: { runner: { type: "codex" }, provider: { id: "codex" } }
  });
  await store.init();

  const listed = await store.list();
  const provider = listed.providers.find((item) => item.id === "deepseek");
  assert.equal(provider.apiKeyEnv, "DEEPSEEK_API_KEY");
  assert.equal(provider.apiKeyConfigured, true);
  assert.equal(JSON.stringify(await readJsonFile(workspaceProviderFile, {})).includes("sk-pasted-real-key"), false);

  const resolved = await store.resolve({ providerId: "deepseek" });
  assert.equal(resolved.provider.apiKey, "sk-pasted-real-key");
});
