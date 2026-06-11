import { redactSecretText } from "../../domain/security/redaction.js";
import { readJsonFile, writeJsonFile } from "../../../platform/json-file.js";

const SENSITIVE_HEALTH_KEY_PATTERN = /secret|token|password|credential|authorization|access[-_]?key|private[-_]?key|api[-_]?key$|^key$/i;

function safeProviderHealthId(value) {
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

function safeProviderHealthIdOrUndefined(value) {
  try {
    return safeProviderHealthId(value);
  } catch {
    return undefined;
  }
}

export function sanitizeProviderHealth(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return redactSecretText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeProviderHealth(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_HEALTH_KEY_PATTERN.test(key))
    .map(([key, entry]) => [key, sanitizeProviderHealth(entry, depth + 1)]));
}

export function providerHealthSnapshot(result = {}) {
  const sanitized = sanitizeProviderHealth(result);
  return {
    ...(sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized : { result: sanitized }),
    checkedAt: new Date().toISOString()
  };
}

export function normalizeProviderHealthRecord(value = {}) {
  const sanitized = sanitizeProviderHealth(value);
  const record = sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized
    : { result: sanitized };
  return {
    ...record,
    checkedAt: record.checkedAt || new Date().toISOString()
  };
}

export function normalizeProviderHealthStore(input = {}) {
  const providers = {};
  const rawProviders = input && typeof input.providers === "object" && input.providers
    ? input.providers
    : {};
  for (const [id, health] of Object.entries(rawProviders)) {
    const providerId = safeProviderHealthIdOrUndefined(id);
    if (!providerId) continue;
    providers[providerId] = normalizeProviderHealthRecord(health);
  }
  return { providers };
}

export function splitProviderHealth(config = {}) {
  if (!config || typeof config !== "object") {
    return { config, healthByProvider: {}, changed: false };
  }
  const healthByProvider = {};
  let changed = false;
  const providers = (config.providers || []).map((provider) => {
    if (!provider || typeof provider !== "object" || provider.health === undefined) return provider;
    const providerId = safeProviderHealthIdOrUndefined(provider.id);
    if (providerId) healthByProvider[providerId] = normalizeProviderHealthRecord(provider.health);
    const { health, ...withoutHealth } = provider;
    changed = true;
    return withoutHealth;
  });
  return {
    config: changed ? { ...config, providers } : config,
    healthByProvider,
    changed
  };
}

export async function readProviderHealthFile(file) {
  return normalizeProviderHealthStore(await readJsonFile(file, { providers: {} }));
}

export async function writeProviderHealthFile(file, healthStore = {}) {
  await writeJsonFile(file, normalizeProviderHealthStore(healthStore));
}

export async function mergeProviderHealthFile(file, healthByProvider = {}, { preferExisting = true } = {}) {
  const incoming = normalizeProviderHealthStore({ providers: healthByProvider }).providers;
  if (!Object.keys(incoming).length) return false;
  const existing = await readProviderHealthFile(file);
  const providers = preferExisting
    ? { ...incoming, ...existing.providers }
    : { ...existing.providers, ...incoming };
  const next = { providers };
  if (JSON.stringify(next) === JSON.stringify(existing)) return false;
  await writeProviderHealthFile(file, next);
  return true;
}
