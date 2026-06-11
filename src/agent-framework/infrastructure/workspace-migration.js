import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, readJsonFile, writeJsonFile } from "../../platform/json-file.js";
import { defaultAgentName } from "../domain/agent-roster.js";
import { resolveAgentWorkspacePaths, resolveProviderWorkspacePaths } from "./workspace-paths.js";
import { mergeProviderHealthFile, splitProviderHealth } from "./provider/provider-health-store.js";

const AGENT_METADATA_KEYS = ["role", "name", "title", "modelProvider"];
const RETIRED_TOOL_REPLACEMENTS = {
  "workspace.read": "Bash",
  "workspace.write": "Bash",
  "shell.exec": "Bash",
  "test.run": "Bash",
  "logs.read": "Bash"
};
const DROPPED_TOOL_IDS = new Set(["codex.exec", "feishu.cli"]);

function createReport() {
  return { copied: [], updated: [], skipped: [], removed: [] };
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

async function listDirectories(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function copyFileIfMissing(source, target, report) {
  if (!source) {
    if (await exists(target)) report.skipped.push(target);
    return false;
  }
  if (!(await exists(source))) {
    if (await exists(target)) report.skipped.push(target);
    return false;
  }
  await ensureDir(path.dirname(target));
  if (await exists(target)) {
    report.skipped.push(target);
    return false;
  }
  await fs.copyFile(source, target);
  report.copied.push(target);
  return true;
}

async function writeJsonIfMissing(file, value, report) {
  if (await exists(file)) {
    report.skipped.push(file);
    return false;
  }
  await writeJsonFile(file, value);
  report.copied.push(file);
  return true;
}

function normalizeMigratedTools(tools = []) {
  const normalized = [];
  for (const rawToolId of tools.map(String).filter(Boolean)) {
    if (DROPPED_TOOL_IDS.has(rawToolId)) continue;
    normalized.push(RETIRED_TOOL_REPLACEMENTS[rawToolId] || rawToolId);
  }
  return [...new Set(normalized)];
}

async function copyToolsJsonIfMissing(source, target, report) {
  if (!source || !(await exists(source))) {
    if (await exists(target)) report.skipped.push(target);
    return false;
  }
  if (await exists(target)) {
    report.skipped.push(target);
    return false;
  }
  const data = await readJsonFile(source, { tools: [] });
  await writeJsonFile(target, { tools: normalizeMigratedTools(data.tools || []) });
  report.copied.push(target);
  return true;
}

async function writeTextIfMissing(file, value, report) {
  if (await exists(file)) {
    report.skipped.push(file);
    return false;
  }
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, value, "utf8");
  report.copied.push(file);
  return true;
}

async function removeIfExists(target, report) {
  if (!(await exists(target))) return;
  await fs.rm(target, { recursive: true, force: true });
  report.removed.push(target);
}

function safeSegment(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "agent";
}

function roleForAgentName(agentName, agentJson = {}) {
  if (agentJson.role) return safeSegment(agentJson.role);
  return safeSegment(agentName);
}

function normalizeModelProvider(input = {}) {
  if (!input || typeof input !== "object") return undefined;
  const providerId = String(input.providerId || input.id || "").trim();
  const model = String(input.model || "").trim();
  if (!providerId && !model) return undefined;
  return Object.fromEntries(Object.entries({
    providerId: providerId || undefined,
    model: model || undefined
  }).filter(([, value]) => value !== undefined));
}

function minimalAgentMetadata(input = {}) {
  const metadata = {};
  for (const key of AGENT_METADATA_KEYS) {
    if (key === "modelProvider") {
      const modelProvider = normalizeModelProvider(input.modelProvider);
      if (modelProvider) metadata.modelProvider = modelProvider;
      continue;
    }
    if (input[key] !== undefined) metadata[key] = String(input[key]);
  }
  return metadata;
}

function normalizeSkill(skill) {
  if (typeof skill === "string") {
    const id = skill.trim();
    return id ? { id, description: "" } : undefined;
  }
  if (!skill || typeof skill !== "object") return undefined;
  const id = String(skill.id || skill.name || "").trim();
  if (!id) return undefined;
  return {
    id,
    description: String(skill.description || ""),
    installCommand: skill.installCommand ? String(skill.installCommand) : undefined
  };
}

function skillMarkdown(skill) {
  const description = skill.description || `Registered for this agent through: ${skill.installCommand || "legacy configuration"}`;
  const commandBlock = skill.installCommand ? `\n## Install Command\n\n\`\`\`bash\n${skill.installCommand}\n\`\`\`\n` : "";
  return `---\nname: ${skill.id}\ndescription: ${description}\n---\n\n# ${skill.id}\n\n${description}\n${commandBlock}`;
}

function normalizeMcpConfig(mcp) {
  if (!mcp || typeof mcp !== "object") return [];
  if (mcp.mcpServers && typeof mcp.mcpServers === "object") {
    return Object.entries(mcp.mcpServers).map(([id, server]) => ({
      id,
      config: { mcpServers: { [id]: server && typeof server === "object" ? server : {} } }
    }));
  }
  return [];
}

async function copyDirectoryFilesIfMissing(sourceDir, targetDir, report) {
  if (!sourceDir) return;
  const names = await listDirectories(sourceDir);
  for (const name of names) {
    const sourceChild = path.join(sourceDir, name);
    const targetChild = path.join(targetDir, name);
    let entries;
    try {
      entries = await fs.readdir(sourceChild, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      await copyFileIfMissing(path.join(sourceChild, entry.name), path.join(targetChild, entry.name), report);
    }
  }
}

async function ensureAgentStateDirs(paths) {
  await Promise.all([
    ensureDir(paths.skillsDir),
    ensureDir(paths.mcpDir),
    ensureDir(paths.sessionsDir),
    ensureDir(paths.episodicEventsDir),
    ensureDir(paths.longTermDir),
    ensureDir(paths.tracesDir)
  ]);
}

async function writeLegacyConfigCapabilities(paths, legacyConfig = {}, report) {
  for (const rawSkill of legacyConfig.skills || []) {
    const skill = normalizeSkill(rawSkill);
    if (!skill) continue;
    const skillDir = path.join(paths.skillsDir, safeSegment(skill.id));
    await writeTextIfMissing(path.join(skillDir, "SKILL.md"), skillMarkdown(skill), report);
  }
  for (const rawMcp of legacyConfig.mcps || legacyConfig.mcpServers || []) {
    for (const mcp of normalizeMcpConfig(rawMcp)) {
      await writeJsonIfMissing(path.join(paths.mcpDir, safeSegment(mcp.id), "mcp.json"), mcp.config, report);
    }
  }
}

async function migrateSingleAgent({ agentName, legacyAgentDir, legacyConfig = {}, agentWorkspaceDir, report }) {
  const legacyAgentJson = legacyAgentDir ? await readJsonFile(path.join(legacyAgentDir, "agent.json"), {}) : {};
  const role = roleForAgentName(agentName, legacyAgentJson);
  const name = legacyAgentJson.name || defaultAgentName(role, agentName);
  const paths = resolveAgentWorkspacePaths({ agentWorkspaceDir, agentName: name });
  await ensureAgentStateDirs(paths);

  if (legacyConfig.prompt !== undefined) {
    await ensureDir(path.dirname(paths.agentsMd));
    if (await exists(paths.agentsMd)) {
      report.skipped.push(paths.agentsMd);
    } else {
      await fs.writeFile(paths.agentsMd, String(legacyConfig.prompt), "utf8");
      report.copied.push(paths.agentsMd);
    }
  } else {
    await copyFileIfMissing(legacyAgentDir ? path.join(legacyAgentDir, "AGENTS.md") : undefined, paths.agentsMd, report);
    await writeTextIfMissing(paths.agentsMd, legacyAgentJson.prompt || `You are ${name}.`, report);
  }

  const metadata = minimalAgentMetadata({
    ...legacyAgentJson,
    role,
    name,
    title: legacyAgentJson.title || legacyConfig.title || role,
    modelProvider: legacyConfig.modelProvider || legacyAgentJson.modelProvider
  });
  if (await exists(paths.agentJson)) {
    report.skipped.push(paths.agentJson);
  } else {
    await writeJsonFile(paths.agentJson, metadata);
    report.copied.push(paths.agentJson);
  }

  if (legacyConfig.tools !== undefined) {
    if (await exists(paths.toolsJson)) {
      report.skipped.push(paths.toolsJson);
    } else {
      await writeJsonFile(paths.toolsJson, { tools: normalizeMigratedTools(legacyConfig.tools) });
      report.copied.push(paths.toolsJson);
    }
  } else {
    await copyToolsJsonIfMissing(legacyAgentDir ? path.join(legacyAgentDir, "tools.json") : undefined, paths.toolsJson, report);
  }
  await writeJsonIfMissing(paths.toolsJson, { tools: ["memory.search", "engine.transition", "Bash"] }, report);

  await copyDirectoryFilesIfMissing(legacyAgentDir ? path.join(legacyAgentDir, ".agents", "skills") : undefined, paths.skillsDir, report);
  await copyDirectoryFilesIfMissing(legacyAgentDir ? path.join(legacyAgentDir, ".agents", "mcp") : undefined, paths.mcpDir, report);
  await copyFileIfMissing(legacyAgentDir ? path.join(legacyAgentDir, ".agents", "routing.json") : undefined, paths.routingJson, report);
  await writeLegacyConfigCapabilities(paths, legacyConfig, report);
  return { role, name, paths };
}

export async function migrateProviderWorkspace({ dataDir, agentWorkspaceDir, removeLegacy = false } = {}) {
  const report = createReport();
  const paths = resolveProviderWorkspacePaths({ agentWorkspaceDir });
  await ensureDir(paths.providersDir);
  const legacyProviderDir = path.join(dataDir, "providers");
  const copiedProviders = await copyFileIfMissing(path.join(legacyProviderDir, "providers.json"), paths.providersFile, report);
  const copiedSecrets = await copyFileIfMissing(path.join(legacyProviderDir, "provider-secrets.json"), paths.providerSecretsFile, report);
  const providerConfig = await readJsonFile(paths.providersFile, undefined);
  const split = splitProviderHealth(providerConfig);
  let updatedProviders = false;
  if (split.changed) {
    await writeJsonFile(paths.providersFile, split.config);
    updatedProviders = !copiedProviders;
    if (updatedProviders) report.updated.push(paths.providersFile);
    const hadHealthFile = await exists(paths.providerHealthFile);
    const wroteHealth = await mergeProviderHealthFile(paths.providerHealthFile, split.healthByProvider, { preferExisting: true });
    if (wroteHealth && hadHealthFile) report.updated.push(paths.providerHealthFile);
    else if (wroteHealth) report.copied.push(paths.providerHealthFile);
    else report.skipped.push(paths.providerHealthFile);
  }
  if (!copiedProviders && !updatedProviders && await exists(paths.providersFile)) report.skipped.push(paths.providersFile);
  if (!copiedSecrets && await exists(paths.providerSecretsFile)) report.skipped.push(paths.providerSecretsFile);
  if (!split.changed && await exists(paths.providerHealthFile)) report.skipped.push(paths.providerHealthFile);
  if (removeLegacy) await removeIfExists(legacyProviderDir, report);
  report.updated = [...new Set(report.updated.filter((item) => !report.copied.includes(item)))];
  report.skipped = [...new Set(report.skipped.filter((item) => !report.copied.includes(item) && !report.updated.includes(item)))];
  return report;
}

export async function migrateAgentWorkspace({ legacyAgentsDir, dataDir, agentWorkspaceDir, removeLegacy = false } = {}) {
  const report = createReport();
  const workspacePaths = resolveAgentWorkspacePaths({ agentWorkspaceDir });
  await ensureDir(workspacePaths.agentsDir);
  const legacyConfigsFile = path.join(dataDir, "agents", "configs.json");
  const legacyConfigs = await readJsonFile(legacyConfigsFile, {});
  const migratedRoles = new Set();

  for (const agentName of await listDirectories(legacyAgentsDir)) {
    const legacyAgentDir = path.join(legacyAgentsDir, agentName);
    const legacyAgentJson = await readJsonFile(path.join(legacyAgentDir, "agent.json"), {});
    const role = roleForAgentName(agentName, legacyAgentJson);
    await migrateSingleAgent({
      agentName,
      legacyAgentDir,
      legacyConfig: legacyConfigs[role] || {},
      agentWorkspaceDir,
      report
    });
    migratedRoles.add(role);
  }

  for (const [role, legacyConfig] of Object.entries(legacyConfigs)) {
    if (migratedRoles.has(role)) continue;
    await migrateSingleAgent({
      agentName: defaultAgentName(role),
      legacyAgentDir: undefined,
      legacyConfig,
      agentWorkspaceDir,
      report
    });
    migratedRoles.add(role);
  }

  for (const agentName of await listDirectories(workspacePaths.agentsDir)) {
    const paths = resolveAgentWorkspacePaths({ agentWorkspaceDir, agentName });
    if (await exists(paths.agentJson)) report.skipped.push(paths.agentJson);
  }

  if (removeLegacy) {
    await removeIfExists(legacyAgentsDir, report);
    await removeIfExists(legacyConfigsFile, report);
    const dataAgentsDir = path.dirname(legacyConfigsFile);
    try {
      await fs.rmdir(dataAgentsDir);
      report.removed.push(dataAgentsDir);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
    }
  }

  report.skipped = [...new Set(report.skipped.filter((item) => !report.copied.includes(item)))];
  return report;
}
