import { spawn } from "node:child_process";
import path from "node:path";
import { ensureDir, readJsonFile, writeJsonFile } from "../../../platform/json-file.js";
import { migrateProviderWorkspace } from "../workspace-migration.js";
import { resolveProviderWorkspacePaths } from "../workspace-paths.js";
import {
  mergeProviderHealthFile,
  providerHealthSnapshot,
  readProviderHealthFile,
  sanitizeProviderHealth,
  splitProviderHealth,
  writeProviderHealthFile
} from "./provider-health-store.js";

const DEFAULT_CODEX_MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex", "gpt-5.3-codex-spark", "gpt-5.2"];
const DEFAULT_DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"];

function safeId(value) {
  const id = String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!id || id === "." || id === "..") {
    const error = new Error(`invalid provider id: ${value}`);
    error.status = 400;
    throw error;
  }
  return id;
}

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function looksLikeRawApiKey(value) {
  const text = String(value || "").trim();
  return /^sk-[A-Za-z0-9_-]{8,}$/.test(text);
}

function normalizeType(value) {
  const type = String(value || "codex_app_server").trim();
  if (type === "mock") return "mock";
  if (type === "codex" || type === "codex_app_server" || type === "codex-app-server") return "codex_app_server";
  if (type === "codex_cli") {
    const error = new Error("Codex CLI is not available as a model provider. Use the Codex app-server provider instead.");
    error.status = 400;
    throw error;
  }
  if (type === "openai_compatible" || type === "openai-compatible" || type === "api_key" || type === "deepseek") return "openai_compatible";
  const error = new Error(`unsupported provider type: ${type}`);
  error.status = 400;
  throw error;
}

function normalizeAuthMode(value, type) {
  const raw = String(value || (type === "mock" ? "none" : type === "openai_compatible" ? "api_key" : "subscription")).trim();
  const authMode = raw === "apiKey" || raw === "api-key" ? "api_key" : raw;
  if (type === "mock") return "none";
  if (authMode === "subscription" || authMode === "api_key" || authMode === "none") return authMode;
  const error = new Error(`unsupported provider auth mode: ${raw}`);
  error.status = 400;
  throw error;
}

function isInternalMockProvider(provider = {}) {
  return isMockProviderConfig(provider) && provider.internal === true;
}

function isDefaultSelectable(provider = {}, { allowInternalMock = false } = {}) {
  if (provider.enabled === false) return false;
  if (allowInternalMock && isInternalMockProvider(provider)) return true;
  return provider.internal !== true && provider.type !== "mock" && provider.id !== "mock";
}

function isMockProviderConfig(provider = {}) {
  return String(provider.id || "").trim() === "mock" ||
    String(provider.type || provider.runner || "").trim() === "mock";
}

function rejectMockProviderConfig(provider = {}) {
  if (!isMockProviderConfig(provider)) return;
  const error = new Error("mock model provider is internal and cannot be configured as a product provider");
  error.status = 400;
  throw error;
}

function chooseDefaultProviderId(providers = [], requestedId, fallbackId = "codex", options = {}) {
  const requested = providers.find((provider) => provider.id === requestedId);
  if (requested && isDefaultSelectable(requested, options)) return requested.id;
  const fallback = providers.find((provider) => provider.id === fallbackId);
  if (fallback && isDefaultSelectable(fallback, options)) return fallback.id;
  return providers.find((provider) => isDefaultSelectable(provider, options))?.id || providers[0]?.id;
}

function publicProviderConfig(config = {}) {
  const providers = (config.providers || []).filter((provider) => isDefaultSelectable(provider));
  const defaultProviderId = providers.some((provider) => provider.id === config.defaultProviderId)
    ? config.defaultProviderId
    : chooseDefaultProviderId(providers, config.defaultProviderId, "codex");
  return { ...config, defaultProviderId, providers };
}

function normalizeProvider(input = {}, fallback = {}) {
  const rawAuthMode = input.authMode || fallback.authMode;
  const normalizedRawAuthMode = rawAuthMode === "apiKey" || rawAuthMode === "api-key" ? "api_key" : rawAuthMode;
  const requestedType = input.type || input.runner || fallback.type || fallback.runner || "codex_app_server";
  const normalizedRequestedType = normalizeType(requestedType);
  const type = normalizeType(normalizedRawAuthMode === "api_key" && normalizedRequestedType === "codex_app_server" ? "openai_compatible" : normalizedRequestedType);
  const id = safeId(input.id || fallback.id || type);
  const authMode = normalizeAuthMode(input.authMode || fallback.authMode, type);
  const provider = String(input.provider || input.flavor || fallback.provider || fallback.flavor || (id === "deepseek" ? "deepseek" : "")).trim();
  const isDeepSeek = provider === "deepseek" || id === "deepseek";
  const configuredModels = unique(input.models || fallback.models);
  const defaultModel = String(input.defaultModel || input.model || fallback.defaultModel || fallback.model || configuredModels[0] || "").trim();
  const modelDefaults = type === "codex_app_server"
    ? DEFAULT_CODEX_MODELS
    : type === "openai_compatible" && isDeepSeek
      ? DEFAULT_DEEPSEEK_MODELS
      : type === "mock"
        ? ["mock"]
        : [];
  const models = unique([defaultModel, ...configuredModels, ...modelDefaults]);
  return Object.fromEntries(Object.entries({
    id,
    name: String(input.name || fallback.name || (isDeepSeek ? "DeepSeek" : type === "mock" ? "Internal Mock Provider" : type === "openai_compatible" ? "API Key Provider" : "Codex Subscription")).trim(),
    type,
    runner: type,
    provider: type === "openai_compatible" && provider ? provider : undefined,
    authMode,
    codexBin: type === "codex_app_server" && authMode === "subscription" ? String(input.codexBin || fallback.codexBin || "codex").trim() : undefined,
    apiKeyEnv: authMode === "api_key" ? String(input.apiKeyEnv || fallback.apiKeyEnv || (isDeepSeek ? "DEEPSEEK_API_KEY" : "OPENAI_API_KEY")).trim() : undefined,
    baseUrl: authMode === "api_key" ? String(input.baseUrl || fallback.baseUrl || (isDeepSeek ? "https://api.deepseek.com" : "")).trim() : undefined,
    models,
    defaultModel: defaultModel || models[0],
    sandbox: type === "codex_app_server" && authMode === "subscription" ? String(input.sandbox || fallback.sandbox || "workspace-write").trim() : undefined,
    approvalMode: type === "codex_app_server" && authMode === "subscription" ? String(input.approvalMode || fallback.approvalMode || "never").trim() : undefined,
    timeoutMs: type === "codex_app_server" && authMode === "subscription" ? Number(input.timeoutMs || fallback.timeoutMs || 900_000) : undefined,
    enabled: input.enabled === false ? false : fallback.enabled === false ? false : true,
    internal: input.internal === true || fallback.internal === true || type === "mock" ? true : undefined,
    notes: input.notes ? String(input.notes) : fallback.notes
  }).filter(([, value]) => value !== undefined && value !== ""));
}

function runProcess({ bin, args, timeoutMs = 5000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

export class ProviderConfigStore {
  constructor({ agentWorkspaceDir, dataDir, config = {}, commandRunner = runProcess, allowMockProvider = false, includeMockProvider = allowMockProvider }) {
    this.dataDir = dataDir;
    this.config = config;
    this.agentWorkspaceDir = agentWorkspaceDir || config.agentWorkspaceDir || defaultAgentWorkspaceDir({ dataDir, config });
    const paths = resolveProviderWorkspacePaths({ agentWorkspaceDir: this.agentWorkspaceDir });
    this.file = paths.providersFile;
    this.secretFile = paths.providerSecretsFile;
    this.healthFile = paths.providerHealthFile;
    this.commandRunner = commandRunner;
    this.allowMockProvider = allowMockProvider;
    this.includeMockProvider = includeMockProvider;
  }

  defaults() {
    const configuredModel = this.config.provider?.model || this.config.runner?.codexModel || "gpt-5.5";
    const providers = [
      normalizeProvider({
        id: "codex",
        name: "Codex Subscription",
        type: "codex_app_server",
        authMode: "subscription",
        codexBin: this.config.runner?.codexBin || "codex",
        models: unique([configuredModel, ...DEFAULT_CODEX_MODELS]),
        defaultModel: configuredModel,
        sandbox: this.config.runner?.codexSandbox || this.config.toolPolicy?.sandbox || "workspace-write",
        approvalMode: this.config.runner?.codexApproval || this.config.toolPolicy?.approvalMode || "never",
        timeoutMs: this.config.runner?.codexTimeoutMs || 900_000,
        enabled: true
      }),
      normalizeProvider({
        id: "deepseek",
        name: "DeepSeek",
        type: "openai_compatible",
        provider: "deepseek",
        authMode: "api_key",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        baseUrl: "https://api.deepseek.com",
        models: DEFAULT_DEEPSEEK_MODELS,
        defaultModel: "deepseek-chat",
        enabled: true
      })
    ];
    if (this.includeMockProvider) {
      providers.push(normalizeProvider({
        id: "mock",
        name: "Internal Mock Provider",
        type: "mock",
        authMode: "none",
        models: ["mock"],
        defaultModel: "mock",
        enabled: true,
        internal: true
      }));
    }
    const requestedDefault = this.config.provider?.id || this.config.runner?.type || "codex";
    const defaultProviderId = chooseDefaultProviderId(providers, requestedDefault, "codex", {
      allowInternalMock: this.includeMockProvider && requestedDefault === "mock"
    });
    return { defaultProviderId, providers };
  }

  async init() {
    await migrateProviderWorkspace({ dataDir: this.dataDir, agentWorkspaceDir: this.agentWorkspaceDir, removeLegacy: false });
    await ensureDir(path.dirname(this.file));
    const config = await this.readConfig({ writeBack: false });
    await writeJsonFile(this.file, config);
  }

  async readSecrets() {
    const secrets = await readJsonFile(this.secretFile, { apiKeys: {} });
    return {
      apiKeys: secrets && typeof secrets.apiKeys === "object" && secrets.apiKeys ? secrets.apiKeys : {}
    };
  }

  async writeSecrets(secrets) {
    await writeJsonFile(this.secretFile, {
      apiKeys: secrets.apiKeys || {}
    });
  }

  async setApiKeySecret(providerId, apiKey) {
    const value = String(apiKey || "").trim();
    if (!value) return;
    const secrets = await this.readSecrets();
    secrets.apiKeys[safeId(providerId)] = {
      value,
      updatedAt: new Date().toISOString()
    };
    await this.writeSecrets(secrets);
  }

  async apiKeyFor(provider = {}) {
    const secrets = await this.readSecrets();
    const stored = secrets.apiKeys?.[provider.id]?.value;
    if (stored) return stored;
    if (provider.apiKeyEnv && process.env[provider.apiKeyEnv]) return process.env[provider.apiKeyEnv];
    return undefined;
  }

  async withSecretStatus(config) {
    const providers = [];
    for (const provider of config.providers || []) {
      const apiKeyConfigured = provider.authMode === "api_key" ? Boolean(await this.apiKeyFor(provider)) : undefined;
      providers.push(Object.fromEntries(Object.entries({
        ...provider,
        apiKeyConfigured
      }).filter(([, value]) => value !== undefined)));
    }
    return { ...config, providers };
  }

  async readHealth() {
    return readProviderHealthFile(this.healthFile);
  }

  async writeHealth(healthStore = {}) {
    await writeProviderHealthFile(this.healthFile, healthStore);
  }

  async withHealthStatus(config) {
    const health = await this.readHealth();
    const providers = (config.providers || []).map((provider) => {
      const providerHealth = health.providers[provider.id];
      return providerHealth ? { ...provider, health: providerHealth } : provider;
    });
    const visibleHealth = Object.fromEntries(providers
      .map((provider) => [provider.id, health.providers[provider.id]])
      .filter(([, providerHealth]) => providerHealth !== undefined));
    return { ...config, providers, health: visibleHealth };
  }

  async decorateConfig(config) {
    return this.withHealthStatus(await this.withSecretStatus(config));
  }

  async withResolvedApiKey(provider = {}) {
    const apiKey = provider.authMode === "api_key" ? await this.apiKeyFor(provider) : undefined;
    const resolved = { ...provider };
    if (apiKey) {
      Object.defineProperty(resolved, "apiKey", {
        value: apiKey,
        enumerable: false
      });
      resolved.apiKeyConfigured = true;
    }
    return resolved;
  }

  async migratePastedApiKeys(config) {
    const secrets = await this.readSecrets();
    let secretsChanged = false;
    let configChanged = false;
    const providers = (config.providers || []).map((provider) => {
      if (provider.authMode !== "api_key" || !looksLikeRawApiKey(provider.apiKeyEnv)) return provider;
      const pastedKey = provider.apiKeyEnv;
      const sanitizedInput = { ...provider };
      delete sanitizedInput.apiKeyEnv;
      const sanitized = normalizeProvider(sanitizedInput);
      secrets.apiKeys[sanitized.id] = {
        value: pastedKey,
        updatedAt: new Date().toISOString()
      };
      secretsChanged = true;
      configChanged = true;
      return sanitized;
    });
    if (secretsChanged) await this.writeSecrets(secrets);
    return configChanged ? { ...config, providers } : config;
  }

  mergeDefaults(existing) {
    const defaults = this.defaults();
    if (!existing || typeof existing !== "object") return defaults;
    const providers = new Map(defaults.providers.map((provider) => [provider.id, provider]));
    for (const provider of existing.providers || []) {
      if (isMockProviderConfig(provider) && (!this.includeMockProvider || provider.internal !== true)) continue;
      const normalized = normalizeProvider(provider, providers.get(provider?.id));
      providers.set(normalized.id, normalized);
    }
    const defaultProviderId = chooseDefaultProviderId([...providers.values()], existing.defaultProviderId, defaults.defaultProviderId, {
      allowInternalMock: this.includeMockProvider && (existing.defaultProviderId === "mock" || defaults.defaultProviderId === "mock")
    });
    return { defaultProviderId, providers: [...providers.values()] };
  }

  async readConfig({ writeBack = true } = {}) {
    const config = await readJsonFile(this.file, undefined);
    const split = splitProviderHealth(config);
    if (split.changed) await mergeProviderHealthFile(this.healthFile, split.healthByProvider, { preferExisting: true });
    const merged = this.mergeDefaults(split.config);
    const sanitized = await this.migratePastedApiKeys(merged);
    if (writeBack && (!config || split.changed || sanitized !== merged)) await writeJsonFile(this.file, sanitized);
    return sanitized;
  }

  async read({ includeInternal = false } = {}) {
    const config = await this.readConfig();
    return this.decorateConfig(includeInternal ? config : publicProviderConfig(config));
  }

  async list(options) {
    return this.read(options);
  }

  async get(id) {
    const config = await this.read();
    return config.providers.find((provider) => provider.id === id);
  }

  async updateProvider(input = {}) {
    if (!this.allowMockProvider) rejectMockProviderConfig(input);
    const config = await this.readConfig();
    const existing = config.providers.find((provider) => provider.id === input.id);
    const rawApiKey = String(input.apiKey || input.api_key || "").trim();
    const inputWithoutSecret = { ...input };
    delete inputWithoutSecret.apiKey;
    delete inputWithoutSecret.api_key;
    if (looksLikeRawApiKey(inputWithoutSecret.apiKeyEnv)) delete inputWithoutSecret.apiKeyEnv;
    const provider = normalizeProvider(inputWithoutSecret, existing);
    const pastedKey = rawApiKey || (looksLikeRawApiKey(input.apiKeyEnv) ? input.apiKeyEnv : "");
    if (pastedKey) await this.setApiKeySecret(provider.id, pastedKey);
    const providers = config.providers.filter((candidate) => candidate.id !== provider.id).concat(provider);
    const defaultProviderId = input.makeDefault && isDefaultSelectable(provider)
      ? provider.id
      : chooseDefaultProviderId(providers, config.defaultProviderId, provider.id);
    const next = { defaultProviderId, providers };
    await writeJsonFile(this.file, next);
    return this.decorateConfig(next);
  }

  async setDefault(id) {
    const providerId = safeId(id);
    const config = await this.readConfig();
    if (!config.providers.some((provider) => provider.id === providerId)) {
      const error = new Error(`provider not found: ${providerId}`);
      error.status = 404;
      throw error;
    }
    const provider = config.providers.find((candidate) => candidate.id === providerId);
    if (!isDefaultSelectable(provider)) {
      const error = new Error(`provider cannot be default: ${providerId}`);
      error.status = 400;
      throw error;
    }
    const next = { ...config, defaultProviderId: providerId };
    await writeJsonFile(this.file, next);
    return this.decorateConfig(next);
  }

  async recordHealth(id, result = {}) {
    const providerId = safeId(id);
    const config = await this.readConfig();
    const health = providerHealthSnapshot(result);
    const found = (config.providers || []).some((provider) => provider.id === providerId);
    if (found) {
      const current = await this.readHealth();
      await this.writeHealth({
        providers: {
          ...current.providers,
          [providerId]: health
        }
      });
    }
    return health;
  }

  async resolve(selection = {}) {
    const config = await this.readConfig();
    const requestedProviderId = selection.providerId || selection.id || config.defaultProviderId;
    const provider = config.providers.find((candidate) => candidate.id === requestedProviderId) ||
      config.providers.find((candidate) => candidate.id === config.defaultProviderId) ||
      config.providers[0];
    if (!provider) throw new Error("no model providers configured");
    const resolvedProvider = await this.withResolvedApiKey(provider);
    return {
      provider: resolvedProvider,
      providerId: provider.id,
      runner: provider.runner || provider.type,
      model: String(selection.model || provider.defaultModel || provider.models?.[0] || "").trim() || undefined
    };
  }

  async check(id) {
    const provider = await this.get(safeId(id));
    if (!provider) {
      const error = new Error(`provider not found: ${id}`);
      error.status = 404;
      throw error;
    }
    const finish = async (result) => {
      const sanitized = sanitizeProviderHealth(result);
      const response = sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized : { result: sanitized };
      try {
        await this.recordHealth(provider.id, response);
      } catch {
        return { ...response, healthRecorded: false };
      }
      return response;
    };
    if (provider.type === "mock") {
      return finish({ ok: true, providerId: provider.id, type: provider.type, message: "Mock provider is available." });
    }
    if (provider.authMode === "api_key") {
      const apiKey = await this.apiKeyFor(provider);
      if (!provider.apiKeyEnv && !apiKey) {
        return finish({
          ok: false,
          providerId: provider.id,
          type: provider.type,
          authMode: provider.authMode,
          message: "API key env var is required for API key auth."
        });
      }
      if (!apiKey) {
        return finish({
          ok: false,
          providerId: provider.id,
          type: provider.type,
          authMode: provider.authMode,
          apiKeyEnv: provider.apiKeyEnv,
          message: `${provider.apiKeyEnv} is not set in this process environment.`
        });
      }
      return finish({
        ok: true,
        providerId: provider.id,
        type: provider.type,
        authMode: provider.authMode,
        apiKeyEnv: provider.apiKeyEnv,
        baseUrl: provider.baseUrl,
        message: provider.apiKeyEnv && process.env[provider.apiKeyEnv]
          ? "API key environment variable is configured."
          : "API key is configured in local provider secrets."
      });
    }
    const codexBin = provider.codexBin || "codex";
    const version = await this.commandRunner({ bin: codexBin, args: ["--version"], timeoutMs: 5000 });
    if (version.exitCode !== 0) {
      return finish({
        ok: false,
        providerId: provider.id,
        type: provider.type,
        authMode: provider.authMode,
        loginCommand: `${codexBin} login`,
        message: version.stderr.trim() || version.stdout.trim() || `Codex CLI exited with code ${version.exitCode}`
      });
    }
    const loginStatus = await this.commandRunner({ bin: codexBin, args: ["login", "status"], timeoutMs: 5000 });
    if (loginStatus.exitCode !== 0) {
      return finish({
        ok: false,
        providerId: provider.id,
        type: provider.type,
        authMode: provider.authMode,
        loginCommand: `${codexBin} login`,
        message: loginStatus.stderr.trim() || loginStatus.stdout.trim() || "Codex CLI is installed but not logged in."
      });
    }
    return finish({
      ok: true,
      providerId: provider.id,
      type: provider.type,
      authMode: provider.authMode,
      loginCommand: `${codexBin} login`,
      message: loginStatus.stdout.trim() || loginStatus.stderr.trim() || "Codex login is available. This provider uses Codex app-server during agent runs.",
      version: version.stdout.trim() || version.stderr.trim()
    });
  }
}

function defaultAgentWorkspaceDir({ dataDir, config = {} } = {}) {
  const rootDir = config.rootDir || (dataDir && path.basename(path.resolve(dataDir)) === "data" ? path.dirname(path.resolve(dataDir)) : dataDir) || process.cwd();
  return path.resolve(rootDir, "agent-workspace");
}
