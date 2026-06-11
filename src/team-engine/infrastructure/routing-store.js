import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, readJsonFile, writeJsonFile } from "../../platform/json-file.js";

function safeSegment(value) {
  const segment = String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!segment || segment === "." || segment === "..") throw new Error(`invalid path segment: ${value}`);
  return segment;
}

function normalizeWakeRule(rule) {
  if (!rule || typeof rule !== "object") return undefined;
  const entityType = String(rule.entityType || "").trim();
  const status = String(rule.status || "").trim();
  if (!entityType || !status) return undefined;
  return Object.fromEntries(Object.entries({
    entityType,
    status,
    consumerRole: rule.consumerRole ? String(rule.consumerRole) : undefined,
    condition: rule.condition ? String(rule.condition) : undefined,
    afterRunStatus: rule.afterRunStatus ? String(rule.afterRunStatus) : undefined,
    enabled: rule.enabled === false ? false : undefined,
    description: rule.description ? String(rule.description) : undefined
  }).filter(([, value]) => value !== undefined));
}

function normalizeWakeRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.map(normalizeWakeRule).filter(Boolean);
}

function wakeRuleMatches(rule, { entityType, status, entity = {}, condition }) {
  if (rule.enabled === false) return false;
  if (rule.entityType !== entityType) return false;
  if (rule.status !== status) return false;
  if (rule.consumerRole && rule.consumerRole !== entity.consumerRole) return false;
  if (rule.condition && rule.condition !== condition) return false;
  return true;
}

async function listDirectories(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
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

export class EngineRoutingStore {
  constructor({ dataDir, agentsDir, agentWorkspaceDir, rootDir } = {}) {
    this.dataDir = dataDir;
    const workspaceDir = agentWorkspaceDir || defaultAgentWorkspaceDir({ dataDir, rootDir });
    this.agentsDir = agentsDir || path.join(workspaceDir, "agents");
    this.routingDir = path.join(dataDir, "engine", "routing");
  }

  fileFor(role) {
    return path.join(this.routingDir, `${safeSegment(role)}.json`);
  }

  async init() {
    await ensureDir(this.routingDir);
    await this.migrateLegacyAgentRouting();
  }

  async migrateLegacyAgentRouting() {
    const dirs = await listDirectories(this.agentsDir);
    for (const dirName of dirs) {
      const agentDir = path.join(this.agentsDir, dirName);
      const agentJson = await readJsonFile(path.join(agentDir, "agent.json"), undefined);
      const role = agentJson?.role;
      if (!role) continue;
      const target = this.fileFor(role);
      if (await exists(target)) continue;
      const legacyRouting = await readJsonFile(path.join(agentDir, ".agents", "routing.json"), undefined);
      if (legacyRouting?.wakeRules === undefined) continue;
      await writeJsonFile(target, {
        role,
        wakeRules: normalizeWakeRules(legacyRouting.wakeRules)
      });
    }
  }

  async get(role) {
    const safeRole = safeSegment(role);
    const config = await readJsonFile(this.fileFor(safeRole), undefined);
    return {
      role: safeRole,
      wakeRules: normalizeWakeRules(config?.wakeRules || [])
    };
  }

  async has(role) {
    return exists(this.fileFor(safeSegment(role)));
  }

  async list() {
    const roles = new Set();
    for (const fileName of await this.listRoutingFiles()) {
      roles.add(path.basename(fileName, ".json"));
    }
    const configs = await Promise.all([...roles].map((role) => this.configForList(role)));
    return configs
      .sort((left, right) => compareRoutingConfig(left, right))
      .map(({ priority, ...config }) => config);
  }

  async configForList(role) {
    const config = await this.get(role);
    const raw = await readJsonFile(this.fileFor(role), {});
    return {
      ...config,
      priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : undefined
    };
  }

  async listRoutingFiles() {
    try {
      const entries = await fs.readdir(this.routingDir, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async update(role, wakeRules = [], metadata = {}) {
    const safeRole = safeSegment(role);
    const existing = await readJsonFile(this.fileFor(safeRole), {});
    const priority = metadata.priority !== undefined ? metadata.priority : existing.priority;
    await writeJsonFile(this.fileFor(safeRole), {
      ...existing,
      role: safeRole,
      wakeRules: normalizeWakeRules(wakeRules),
      priority: Number.isFinite(Number(priority)) ? Number(priority) : undefined
    });
    return this.get(safeRole);
  }

  async consumersFor({ entityType, status, entity = {}, condition }) {
    const configs = await this.list();
    return configs.flatMap((config) =>
      (config.wakeRules || [])
        .filter((rule) => wakeRuleMatches(rule, { entityType, status, entity, condition }))
        .map((rule) => ({ role: config.role, rule }))
    );
  }

  async taskConsumerRoles() {
    const configs = await this.list();
    return [
      ...new Set(
        configs.flatMap((config) =>
          (config.wakeRules || [])
            .filter((rule) => rule.enabled !== false && rule.entityType === "task" && rule.status === "waiting")
            .map((rule) => rule.consumerRole || config.role)
        )
      )
    ];
  }
}

function compareRoutingConfig(left, right) {
  const leftPriority = left.priority === undefined ? Number.POSITIVE_INFINITY : left.priority;
  const rightPriority = right.priority === undefined ? Number.POSITIVE_INFINITY : right.priority;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return left.role.localeCompare(right.role);
}

function defaultAgentWorkspaceDir({ dataDir, rootDir } = {}) {
  const baseDir = rootDir || (dataDir && path.basename(path.resolve(dataDir)) === "data" ? path.dirname(path.resolve(dataDir)) : dataDir) || process.cwd();
  return path.resolve(baseDir, "agent-workspace");
}
