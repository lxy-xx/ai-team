import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, readJsonFile, writeJsonFile } from "../../platform/json-file.js";

function normalizeCodingAgentDefinition(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const id = String(input.id || input.name || "default").trim();
  const commandTemplate = String(input.commandTemplate || "").trim();
  const command = String(input.command || "").trim();
  if (!id || (!commandTemplate && !command)) return undefined;
  const args = Array.isArray(input.args)
    ? input.args.map((arg) => String(arg))
    : [];
  const timeoutMs = Number.parseInt(input.timeoutMs, 10);
  const env = input.env && typeof input.env === "object" && !Array.isArray(input.env)
    ? Object.fromEntries(Object.entries(input.env).map(([key, value]) => [
      String(key),
      value === null ? null : String(value)
    ]))
    : undefined;
  return {
    id,
    name: String(input.name || id).trim(),
    description: (input.description || "").trim(),
    command,
    args,
    commandTemplate: commandTemplate || [command, ...args].filter(Boolean).join(" "),
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
    ...(env ? { env } : {})
  };
}

function normalizeLauncherConfig(input = {}) {
  const list = Array.isArray(input)
    ? input
    : Array.isArray(input?.agents)
      ? input.agents
      : [];
  const agents = [];
  const seen = new Set();
  for (const candidate of list) {
    const normalized = normalizeCodingAgentDefinition(candidate);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    agents.push(normalized);
  }
  return { agents: agents.slice(0, 1) };
}

function publicLauncher(launcher = {}) {
  return {
    commandTemplate: launcher.commandTemplate || [launcher.command, ...(launcher.args || [])].filter(Boolean).join(" "),
    ...(Number.isFinite(Number(launcher.timeoutMs)) && Number(launcher.timeoutMs) > 0 ? { timeoutMs: Number(launcher.timeoutMs) } : {})
  };
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input || {}, key);
}

function mergeLauncher(existing = {}, candidate = {}) {
  const normalized = normalizeCodingAgentDefinition({
    ...candidate,
    id: existing.id || candidate.id || "default",
    name: hasOwn(candidate, "name") ? candidate.name : existing.name,
    description: hasOwn(candidate, "description") ? candidate.description : existing.description,
    command: candidate.command || existing.command
  });
  if (!normalized) return undefined;
  return {
    ...existing,
    ...normalized,
    description: hasOwn(candidate, "description") ? normalized.description : (existing.description || normalized.description),
    env: hasOwn(candidate, "env") ? normalized.env : existing.env
  };
}

export const DEFAULT_CODING_AGENT_LAUNCHERS = {
  agents: [{
    id: "default",
    name: "Coding Agent",
    description: "Default implementation Coding Agent for code, configuration, and verification work.",
    command: "codex",
    args: [
      "exec",
      "--cd",
      "{{workspace}}",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      "-m",
      "gpt-5.5",
      "{{prompt}}"
    ],
    commandTemplate: "codex exec --cd {{workspace}} --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 {{prompt}}",
    timeoutMs: 900_000,
    env: {
      CODEX_SANDBOX: null,
      CODEX_SANDBOX_NETWORK_DISABLED: null
    }
  }]
};

export class CodingAgentLauncherStore {
  constructor({ dataDir, agentWorkspaceDir, agentsDir }) {
    this.dir = path.join(agentWorkspaceDir, "framework", "coding-agents");
    this.file = path.join(this.dir, "launchers.json");
    this.legacyAgentsDir = agentsDir || path.join(agentWorkspaceDir, "agents");
  }

  async init() {
    await ensureDir(this.dir);
  }

  async read() {
    return readJsonFile(this.file, undefined);
  }

  async list() {
    const config = await this.read();
    if (!config) return [];
    const normalized = normalizeLauncherConfig(config);
    return normalized.agents;
  }

  async listPublic() {
    return (await this.list()).map(publicLauncher);
  }

  async defaultLauncher() {
    const launchers = await this.list();
    if (!launchers.length) throw new Error("no Coding Agent launcher configured");
    return launchers[0];
  }

  async get(id) {
    const launchers = await this.list();
    return launchers.find((launcher) => launcher.id === id || launcher.name === id);
  }

  async write(launchers = []) {
    await writeJsonFile(this.file, normalizeLauncherConfig(launchers));
  }

  async legacyLaunchers() {
    let entries = [];
    try {
      entries = await fs.readdir(this.legacyAgentsDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const launchers = [];
    const seen = new Set();
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const config = await readJsonFile(path.join(this.legacyAgentsDir, entry.name, "coding-agents.json"), undefined);
      for (const launcher of normalizeLauncherConfig(config).agents) {
        if (seen.has(launcher.id)) continue;
        seen.add(launcher.id);
        launchers.push(launcher);
      }
    }
    return launchers;
  }

  async update(launchers = []) {
    const current = await this.list();
    const byId = new Map(current.map((launcher) => [launcher.id, launcher]));
    const candidate = Array.isArray(launchers) ? launchers[0] : launchers;
    if (candidate) {
      const existing = byId.get("default") || current[0] || { id: "default", name: "Coding Agent" };
      const merged = mergeLauncher(existing, { ...candidate, id: existing.id || "default" });
      if (merged) byId.set(merged.id, merged);
    }
    const first = byId.get("default") || [...byId.values()][0];
    await writeJsonFile(this.file, { agents: first ? [first] : [] });
  }
}

export async function onboardDefaultCodingAgentLaunchers({ store, onboardingStateStore }) {
  if (!store || !onboardingStateStore) return;
  const alreadyOnboarded = await onboardingStateStore.has("codingAgentLaunchers");
  if (alreadyOnboarded && await store.read()) return;
  const existing = await store.list();
  if (existing.length) return;
  const legacy = await store.legacyLaunchers?.();
  await store.write(legacy?.length ? legacy : DEFAULT_CODING_AGENT_LAUNCHERS.agents);
  if (!alreadyOnboarded) await onboardingStateStore.mark("codingAgentLaunchers");
}
