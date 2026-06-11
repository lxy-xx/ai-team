import path from "node:path";

export function optionalEnv(name, env = process.env) {
  const value = env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function readIntEnv(name, fallback, env = process.env) {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readFloatEnv(name, fallback, env = process.env) {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveFromEnv({ rootDir = process.cwd(), envName, fallback, env = process.env }) {
  return path.resolve(rootDir, env[envName] || fallback);
}
