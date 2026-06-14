import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { mcpToolsFromServer } from "../domain/tools/mcp-tools.js";
import { discoverMcpTools, normalizeDiscoveredMcpTools } from "./mcp-tool-discovery.js";
import { ensureDir, readJsonFile, writeJsonFile } from "../../platform/json-file.js";
import { migrateAgentWorkspace } from "./workspace-migration.js";
import { resolveAgentWorkspacePaths } from "./workspace-paths.js";

function uniqueTools(tools) {
  return [...new Set((tools || []).map(String).filter(Boolean))];
}

const DEFAULT_RUNTIME_TOOLS = ["skill"];

const RETIRED_TOOL_REPLACEMENTS = {
  "workspace.read": "Bash",
  "workspace.write": "Bash",
  "shell.exec": "Bash",
  "test.run": "Bash",
  "logs.read": "Bash"
};
const DROPPED_TOOL_IDS = new Set(["codex.exec", "feishu.cli"]);

function normalizeConfiguredTools(tools) {
  const normalized = [];
  for (const toolId of uniqueTools([...DEFAULT_RUNTIME_TOOLS, ...(tools || [])])) {
    if (DROPPED_TOOL_IDS.has(toolId)) continue;
    normalized.push(RETIRED_TOOL_REPLACEMENTS[toolId] || toolId);
  }
  return uniqueTools(normalized);
}

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

function agentNameForRole(role, name) {
  return safeSegment(name || role || "agent");
}

function agentNameCandidatesForMetadata(role, metadata = {}) {
  return [
    metadata.name,
    role
  ].map((name) => {
    try {
      return agentNameForRole(role, name);
    } catch {
      return undefined;
    }
  }).filter(Boolean);
}

function roleFromInput(input = {}) {
  return safeSegment(input.role || input.name || "agent").replace(/^-|-$/g, "");
}

function agentRoleNotFoundError(role) {
  const error = new Error(`agent role not found: ${role}`);
  error.status = 404;
  return error;
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

function normalizeOutputConfig(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const contract = Array.isArray(input.contract)
    ? input.contract.map((line) => String(line || "").trim()).filter(Boolean)
    : undefined;
  return compactObject({
    artifactKind: input.artifactKind ? String(input.artifactKind).trim() : undefined,
    contract: contract?.length ? contract : undefined,
    verdictPattern: input.verdictPattern ? String(input.verdictPattern) : undefined,
    verdictPatternFlags: input.verdictPatternFlags ? String(input.verdictPatternFlags) : undefined,
    transcriptPrefix: input.transcriptPrefix !== undefined ? String(input.transcriptPrefix) : undefined
  });
}

function compactObject(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

const AGENT_METADATA_KEYS = ["role", "name", "title"];

function minimalAgentMetadata(input = {}) {
  const metadata = Object.fromEntries(AGENT_METADATA_KEYS.map((key) => [key, input[key]]));
  metadata.modelProvider = normalizeModelProvider(input.modelProvider);
  return compactObject(metadata);
}

function normalizeSkill(skill) {
  if (typeof skill === "string") {
    const id = skill.trim();
    if (!id) return undefined;
    return { id, description: "" };
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

function normalizeSkills(skills) {
  if (!Array.isArray(skills)) return [];
  return skills.map(normalizeSkill).filter(Boolean);
}

function normalizeSkillIds(skillIds) {
  if (!Array.isArray(skillIds)) return [];
  return [...new Set(skillIds.map((skillId) => String(skillId || "").trim()).filter(Boolean))];
}

function parseJsonWithStatus(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error(`${label} must be valid JSON`);
    error.status = 400;
    throw error;
  }
}

function normalizeMcpConfig(mcp) {
  let config;
  if (typeof mcp === "string") {
    const id = mcp.trim();
    if (!id) return [];
    config = { mcpServers: { [id]: {} } };
  } else if (mcp?.configJson) {
    config = parseJsonWithStatus(String(mcp.configJson), "MCP config");
  } else if (mcp?.mcpServers && typeof mcp.mcpServers === "object") {
    config = { mcpServers: mcp.mcpServers };
  } else if (mcp && typeof mcp === "object") {
    const id = String(mcp.id || mcp.name || mcp.serverId || "").trim();
    if (!id) return [];
    const server = {};
    if (mcp.url) server.url = String(mcp.url);
    if (mcp.command) server.command = String(mcp.command);
    if (Array.isArray(mcp.args)) server.args = mcp.args.map(String);
    if (Array.isArray(mcp.tools)) server.tools = mcp.tools;
    config = { mcpServers: { [id]: server } };
  } else {
    return [];
  }

  if (!config || typeof config !== "object" || !config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
    const error = new Error("MCP config must contain an mcpServers object");
    error.status = 400;
    throw error;
  }

  return Object.entries(config.mcpServers).map(([id, server]) => {
    const serverId = String(id).trim();
    if (!serverId) {
      const error = new Error("MCP server names cannot be empty");
      error.status = 400;
      throw error;
    }
    return {
      id: serverId,
      config: { mcpServers: { [serverId]: server && typeof server === "object" ? server : {} } }
    };
  });
}

function normalizeMcpConfigs(mcps) {
  if (!Array.isArray(mcps)) return [];
  const byId = new Map();
  for (const mcp of mcps) {
    for (const normalized of normalizeMcpConfig(mcp)) {
      byId.set(normalized.id, normalized);
    }
  }
  return [...byId.values()];
}

function cloneJsonValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stripMcpRuntimeToolFields(config) {
  const clone = cloneJsonValue(config);
  for (const server of Object.values(clone?.mcpServers || {})) {
    if (server && typeof server === "object" && !Array.isArray(server)) {
      delete server.tools;
      delete server.availableTools;
    }
  }
  return clone;
}

function preserveCurrentMcpTools(nextMcps = [], currentMcps = []) {
  const toolsByServerId = new Map();
  for (const mcp of currentMcps || []) {
    const servers = mcp?.mcpServers || {};
    for (const [id, server] of Object.entries(servers)) {
      if (Array.isArray(server?.tools)) toolsByServerId.set(id, server.tools);
    }
  }
  return nextMcps.map((mcp) => {
    const server = mcp?.config?.mcpServers?.[mcp.id];
    if (
      server &&
      typeof server === "object" &&
      !Array.isArray(server) &&
      !Object.prototype.hasOwnProperty.call(server, "tools") &&
      toolsByServerId.has(mcp.id)
    ) {
      return {
        ...mcp,
        config: {
          mcpServers: {
            [mcp.id]: {
              ...server,
              tools: cloneJsonValue(toolsByServerId.get(mcp.id))
            }
          }
        }
      };
    }
    return mcp;
  });
}

function mcpProfileEntriesFromConfigs(mcps = []) {
  const entries = [];
  for (const mcp of mcps) {
    const servers = mcp?.config?.mcpServers || {};
    for (const [id, server] of Object.entries(servers)) {
      entries.push({
        id,
        tools: mcpToolsFromServer(id, server)
      });
    }
  }
  return entries;
}

function mcpToolIdsFromProfile(profile = {}) {
  const ids = new Set();
  for (const mcp of profile.mcps || []) {
    for (const tool of mcp.tools || []) {
      if (tool?.id) ids.add(tool.id);
    }
  }
  return ids;
}

function mcpToolIdsFromConfigs(mcps = []) {
  return [...mcpToolIdsFromProfile({ mcps: mcpProfileEntriesFromConfigs(mcps) })];
}

function defaultEnabledToolsForNewMcps(nextMcps = [], currentMcps = []) {
  const currentIds = new Set((currentMcps || []).map((mcp) => mcp?.id).filter(Boolean));
  return mcpToolIdsFromConfigs((nextMcps || []).filter((mcp) => !currentIds.has(mcp?.id)));
}

function frontmatterValue(raw, key) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return "";
  const line = match[1].split("\n").find((item) => item.trim().startsWith(`${key}:`));
  return line ? line.replace(`${key}:`, "").trim().replace(/^["']|["']$/g, "") : "";
}

function markdownBody(raw) {
  const match = raw.match(/^---\n[\s\S]*?\n---/);
  return (match ? raw.slice(match[0].length) : raw).trim();
}

async function readTextFile(file, fallback = "") {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeTextFile(file, text) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, text, "utf8");
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

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function skillMarkdown(skill) {
  const description = skill.description || `Registered for this agent through: ${skill.installCommand || "agent configuration"}`;
  const commandBlock = skill.installCommand ? `\n## Install Command\n\n\`\`\`bash\n${skill.installCommand}\n\`\`\`\n` : "";
  return `---\nname: ${skill.id}\ndescription: ${description}\n---\n\n# ${skill.id}\n\n${description}\n${commandBlock}`;
}

function commandTokens(command) {
  const tokens = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = regex.exec(command))) tokens.push(match[1] || match[2] || match[3]);
  return tokens;
}

function commandValidationError() {
  const error = new Error("skill install command must be a restricted npx skills command");
  error.status = 400;
  return error;
}

function safeCommandToken(token) {
  return Boolean(token) && !/[;&|`<>\n\r]/.test(token);
}

function safeSourcePackage(token) {
  return safeCommandToken(token) && !token.startsWith("-") && /skill/i.test(token);
}

function validateOptionValue(value) {
  if (!safeCommandToken(value) || value.startsWith("-")) throw commandValidationError();
}

function npxSkillsArgs(command) {
  const tokens = commandTokens(command);
  if (tokens[0] !== "npx" || tokens.length < 3) throw commandValidationError();
  const args = [];
  let index = 1;
  let sourcePackageSeen = false;
  while (index < tokens.length && tokens[index] !== "skills") {
    const token = tokens[index];
    if (!safeCommandToken(token)) throw commandValidationError();
    if (token === "-y" || token === "--yes") {
      args.push(token);
      index += 1;
      continue;
    }
    if (token === "--registry" || token === "--package" || token === "-p") {
      const value = tokens[index + 1];
      validateOptionValue(value);
      args.push(token, value);
      index += 2;
      continue;
    }
    if (token.startsWith("--registry=") || token.startsWith("--package=")) {
      validateOptionValue(token.slice(token.indexOf("=") + 1));
      args.push(token);
      index += 1;
      continue;
    }
    if (!sourcePackageSeen && safeSourcePackage(token)) {
      args.push(token);
      sourcePackageSeen = true;
      index += 1;
      continue;
    }
    throw commandValidationError();
  }
  if (tokens[index] !== "skills") throw commandValidationError();
  const tail = tokens.slice(index);
  if (tail.length < 2 || tail.some((token) => !safeCommandToken(token))) throw commandValidationError();
  return args.concat(tail);
}

function runCommand({ command, args, cwd, env = {}, timeoutMs = 120_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      const error = new Error("npx skills command timed out");
      error.status = 500;
      reject(error);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      error.status = 500;
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      if (status === 0) {
        resolve({ status, stdout, stderr });
        return;
      }
      const error = new Error(stderr.trim() || stdout.trim() || `npx skills command exited with code ${status}`);
      error.status = 500;
      reject(error);
    });
  });
}

export class AgentConfigStore {
  constructor({ dataDir, agentsDir, agentWorkspaceDir, rootDir, toolRegistry, commandRunner = runCommand, mcpToolDiscoverer = discoverMcpTools }) {
    this.dataDir = dataDir;
    this.legacyDir = path.join(dataDir, "agents");
    this.legacyFile = path.join(this.legacyDir, "configs.json");
    this.legacyAgentsDir = path.join(rootDir || (dataDir && path.basename(path.resolve(dataDir)) === "data" ? path.dirname(path.resolve(dataDir)) : dataDir) || process.cwd(), "agents");
    this.explicitAgentsDir = Boolean(agentsDir);
    this.agentWorkspaceDir = agentWorkspaceDir || defaultAgentWorkspaceDir({ dataDir, rootDir });
    this.agentsDir = agentsDir || resolveAgentWorkspacePaths({ agentWorkspaceDir: this.agentWorkspaceDir }).agentsDir;
    this.toolRegistry = toolRegistry;
    this.commandRunner = commandRunner;
    this.mcpToolDiscoverer = mcpToolDiscoverer;
    this.roleDirCache = new Map();
  }

  pathsFor(role, options = {}) {
    const agentDir = path.join(this.agentsDir, this.roleDirCache.get(role) || agentNameForRole(role, options.name));
    const dotAgentsDir = path.join(agentDir, ".agents");
    const memoryDir = path.join(agentDir, "memory");
    return {
      agentDir,
      agentsMd: path.join(agentDir, "AGENTS.md"),
      agentJson: path.join(agentDir, "agent.json"),
      toolsJson: path.join(agentDir, "tools.json"),
      outputJson: path.join(agentDir, "output.json"),
      dotAgentsDir,
      legacyMcpDir: path.join(dotAgentsDir, "mcp"),
      skillsDir: path.join(dotAgentsDir, "skills"),
      mcpDir: path.join(agentDir, "mcp"),
      memoryDir,
      sessionsDir: path.join(memoryDir, "sessions"),
      episodicEventsDir: path.join(memoryDir, "episodic", "events"),
      longTermDir: path.join(memoryDir, "long-term"),
      tracesDir: path.join(agentDir, "traces")
    };
  }

  async init() {
    if (!this.explicitAgentsDir) {
      await migrateAgentWorkspace({
        legacyAgentsDir: this.legacyAgentsDir,
        dataDir: this.dataDir,
        agentWorkspaceDir: this.agentWorkspaceDir,
        removeLegacy: false
      });
    }
    await ensureDir(this.agentsDir);
    await this.loadRoleDirectoryIndex();
    await this.applyToolOverrides();
  }

  async readLegacyConfigs() {
    return readJsonFile(this.legacyFile, {});
  }

  async loadRoleDirectoryIndex() {
    const nextRoleDirCache = new Map();
    const dirs = await listDirectories(this.agentsDir);
    for (const dirName of dirs) {
      const agentJson = await readJsonFile(path.join(this.agentsDir, dirName, "agent.json"), undefined);
      if (!agentJson?.role) continue;
      if (nextRoleDirCache.has(agentJson.role)) {
        const error = new Error(`duplicate agent role directories: ${agentJson.role}`);
        error.status = 409;
        throw error;
      }
      nextRoleDirCache.set(agentJson.role, dirName);
    }
    this.roleDirCache = nextRoleDirCache;
  }

  async hasRole(role) {
    await this.loadRoleDirectoryIndex();
    return this.roleDirCache.has(role);
  }

  defaultsFor(role, metadata = {}) {
    const paths = this.pathsFor(role, metadata);
    return {
      role,
      name: metadata.name || agentNameForRole(role),
      title: metadata.title || role,
      prompt: metadata.prompt || `You are ${metadata.name || role}. Follow your configured wake rules and use Engine tools for lifecycle changes.`,
      agentDir: paths.agentDir,
      skills: [],
      mcps: [],
      tools: normalizeConfiguredTools(metadata.tools || []),
      modelProvider: normalizeModelProvider(metadata.modelProvider),
      output: normalizeOutputConfig(metadata.output)
    };
  }

  async bindExistingRoleDirectoryFromMetadata(role, metadata = {}) {
    if (this.roleDirCache.has(role)) return;
    for (const dirName of agentNameCandidatesForMetadata(role, metadata)) {
      if (await exists(path.join(this.agentsDir, dirName))) {
        this.roleDirCache.set(role, dirName);
        return;
      }
    }
  }

  async ensureRoleDirectory(role, legacyConfig = {}, metadata = {}) {
    await this.bindExistingRoleDirectoryFromMetadata(role, metadata);
    const defaults = this.defaultsFor(role, metadata);
    const paths = this.pathsFor(role, metadata);
    this.roleDirCache.set(role, path.basename(paths.agentDir));
    await ensureDir(paths.skillsDir);
    await ensureDir(paths.mcpDir);
    await ensureDir(paths.sessionsDir);
    await ensureDir(paths.episodicEventsDir);
    await ensureDir(paths.longTermDir);
    await ensureDir(paths.tracesDir);
    await this.migrateLegacyCapabilities(paths);
    if (!(await exists(paths.agentsMd))) await writeTextFile(paths.agentsMd, legacyConfig?.prompt || defaults.prompt);
    if (!(await exists(paths.agentJson))) {
      await writeJsonFile(paths.agentJson, minimalAgentMetadata({
        role,
        name: defaults.name,
        title: defaults.title,
        modelProvider: normalizeModelProvider(legacyConfig?.modelProvider || defaults.modelProvider)
      }));
    }
    if (!(await exists(paths.toolsJson))) {
      await writeJsonFile(paths.toolsJson, { tools: normalizeConfiguredTools(legacyConfig?.tools || defaults.tools) });
    }
    const defaultOutput = normalizeOutputConfig(legacyConfig?.output || defaults.output);
    if (Object.keys(defaultOutput).length && !(await exists(paths.outputJson))) {
      await writeJsonFile(paths.outputJson, defaultOutput);
    }
    const migrationFile = path.join(paths.agentDir, "migration.json");
    const hasLegacyConfig = legacyConfig && Object.keys(legacyConfig).length > 0;
    if (hasLegacyConfig && !(await exists(migrationFile))) {
      if (legacyConfig.prompt !== undefined) await writeTextFile(paths.agentsMd, String(legacyConfig.prompt));
      if (legacyConfig.tools !== undefined) await writeJsonFile(paths.toolsJson, { tools: normalizeConfiguredTools(legacyConfig.tools) });
      if (legacyConfig.output !== undefined) await writeJsonFile(paths.outputJson, normalizeOutputConfig(legacyConfig.output));
      if (legacyConfig.skills !== undefined) await this.writeSkills(role, normalizeSkills(legacyConfig.skills));
      if (legacyConfig.mcps !== undefined) await this.writeMcpConfigs(role, normalizeMcpConfigs(legacyConfig.mcps));
      await writeJsonFile(migrationFile, {
        source: path.relative(paths.agentDir, this.legacyFile),
        migratedAt: new Date().toISOString()
      });
    }
  }

  async list() {
    await this.loadRoleDirectoryIndex();
    const roles = [...this.roleDirCache.keys()];
    const agents = await Promise.all(roles.map((role) => this.readRoleDirectory(role)));
    return agents.filter(Boolean);
  }

  async getExisting(role) {
    return this.get(role);
  }

  async get(role) {
    await this.loadRoleDirectoryIndex();
    if (!this.roleDirCache.has(role)) return undefined;
    return this.readRoleDirectory(role);
  }

  async readRoleDirectory(role) {
    const paths = this.pathsFor(role);
    const agentMeta = await readJsonFile(paths.agentJson, {});
    const defaults = this.defaultsFor(role, agentMeta);
    const toolsConfig = await readJsonFile(paths.toolsJson, { tools: defaults.tools });
    const outputConfig = await readJsonFile(paths.outputJson, defaults.output);
    return {
      ...defaults,
      role,
      name: agentMeta.name || defaults.name,
      title: agentMeta.title || defaults.title,
      agentDir: paths.agentDir,
      modelProvider: normalizeModelProvider(agentMeta.modelProvider),
      prompt: await readTextFile(paths.agentsMd, defaults.prompt),
      skills: await this.readSkills(role),
      mcps: await this.readMcpConfigs(role),
      tools: normalizeConfiguredTools(toolsConfig.tools || defaults.tools),
      output: normalizeOutputConfig(outputConfig || defaults.output)
    };
  }

  async create(input = {}) {
    const role = roleFromInput(input);
    const name = String(input.name || role).trim();
    if (this.roleDirCache.has(role)) {
      const error = new Error(`agent role already exists: ${role}`);
      error.status = 409;
      throw error;
    }
    const paths = this.pathsFor(role, { name });
    if (await exists(paths.agentJson)) {
      const error = new Error(`agent folder already exists: ${path.basename(paths.agentDir)}`);
      error.status = 409;
      throw error;
    }
    this.roleDirCache.set(role, path.basename(paths.agentDir));
    await ensureDir(paths.skillsDir);
    await ensureDir(paths.mcpDir);
    await ensureDir(paths.sessionsDir);
    await ensureDir(paths.episodicEventsDir);
    await ensureDir(paths.longTermDir);
    await ensureDir(paths.tracesDir);
    const defaults = this.defaultsFor(role, input);
    await writeTextFile(paths.agentsMd, String(input.prompt || defaults.prompt));
    await writeJsonFile(paths.agentJson, minimalAgentMetadata({
      role,
      name,
      title: input.title || defaults.title,
      modelProvider: normalizeModelProvider(input.modelProvider)
    }));
    const mcpInput = input.mcps !== undefined || input.mcpServers !== undefined
      ? normalizeMcpConfigs(input.mcps || input.mcpServers)
      : [];
    const tools = normalizeConfiguredTools(input.tools !== undefined
      ? input.tools
      : [...defaults.tools, ...mcpToolIdsFromConfigs(mcpInput)]);
    this.validateTools(role, tools, { mcps: mcpProfileEntriesFromConfigs(mcpInput) });
    await writeJsonFile(paths.toolsJson, { tools });
    if (input.output !== undefined) await writeJsonFile(paths.outputJson, normalizeOutputConfig(input.output));
    if (input.skills !== undefined) await this.writeSkills(role, normalizeSkills(input.skills));
    if (input.mcps !== undefined || input.mcpServers !== undefined) await this.writeMcpConfigs(role, mcpInput);
    return this.get(role);
  }

  async update(role, patch = {}) {
    const current = await this.get(role);
    if (!current) throw agentRoleNotFoundError(role);
    const paths = this.pathsFor(role);
    const mcpPatch = patch.mcps === undefined ? patch.mcpServers : patch.mcps;
    const normalizedMcpPatch = mcpPatch !== undefined
      ? preserveCurrentMcpTools(normalizeMcpConfigs(mcpPatch), current.mcps)
      : undefined;
    const validationProfile = {
      ...current,
      mcps: normalizedMcpPatch ? mcpProfileEntriesFromConfigs(normalizedMcpPatch) : current.mcps
    };
    if (patch.prompt !== undefined) await writeTextFile(paths.agentsMd, String(patch.prompt));
    await writeJsonFile(paths.agentJson, minimalAgentMetadata({
      role,
      name: patch.name || current.name,
      title: patch.title || current.title,
      modelProvider: patch.modelProvider === undefined ? current.modelProvider : normalizeModelProvider(patch.modelProvider)
    }));
    if (patch.skills !== undefined) await this.writeSkills(role, normalizeSkills(patch.skills));
    if (patch.removeSkills !== undefined) await this.removeSkills(role, normalizeSkillIds(patch.removeSkills));
    if (normalizedMcpPatch !== undefined) await this.writeMcpConfigs(role, normalizedMcpPatch);
    if (patch.output !== undefined) await writeJsonFile(paths.outputJson, normalizeOutputConfig(patch.output));
    const defaultMcpTools = normalizedMcpPatch
      ? defaultEnabledToolsForNewMcps(normalizedMcpPatch, current.mcps)
      : [];
    if (patch.tools !== undefined) {
      const tools = normalizeConfiguredTools(patch.tools);
      this.validateTools(role, tools, validationProfile);
      await writeJsonFile(paths.toolsJson, { tools });
    } else if (defaultMcpTools.length) {
      const tools = normalizeConfiguredTools([...current.tools, ...defaultMcpTools]);
      this.validateTools(role, tools, validationProfile);
      await writeJsonFile(paths.toolsJson, { tools });
    } else {
      this.validateTools(role, current.tools, validationProfile);
    }
    return this.get(role);
  }

  async installSkillFromCommand(role, command) {
    const installCommand = String(command || "").trim();
    const args = npxSkillsArgs(installCommand);
    const current = await this.get(role);
    if (!current) throw agentRoleNotFoundError(role);
    const paths = this.pathsFor(role);
    await this.commandRunner({
      command: "npx",
      args,
      cwd: paths.agentDir,
      env: {
        AI_TEAM_AGENT_DIR: paths.agentDir,
        AI_TEAM_SKILLS_DIR: paths.skillsDir
      }
    });
    await this.migrateLegacyCapabilities(paths);
    return this.get(role);
  }

  async readSkills(role) {
    const { skillsDir } = this.pathsFor(role);
    const ids = await listDirectories(skillsDir);
    const skills = [];
    for (const dirName of ids) {
      const dir = path.join(skillsDir, dirName);
      const markdown = await readTextFile(path.join(dir, "SKILL.md"), "");
      const id = frontmatterValue(markdown, "name") || dirName;
      const description = frontmatterValue(markdown, "description") || "";
      skills.push({
        id,
        description,
        content: markdownBody(markdown),
        path: path.join(dir, "SKILL.md")
      });
    }
    return skills;
  }

  async writeSkill(role, skill) {
    const { skillsDir } = this.pathsFor(role);
    const normalized = normalizeSkill(skill);
    if (!normalized) return;
    const skillDir = path.join(skillsDir, safeSegment(normalized.id));
    await ensureDir(skillDir);
    await writeTextFile(path.join(skillDir, "SKILL.md"), skillMarkdown(normalized));
  }

  async writeSkills(role, skills) {
    const { skillsDir } = this.pathsFor(role);
    await fs.rm(skillsDir, { recursive: true, force: true });
    await ensureDir(skillsDir);
    for (const skill of skills) await this.writeSkill(role, skill);
  }

  async removeSkills(role, skillIds = []) {
    const { skillsDir } = this.pathsFor(role);
    for (const skillId of skillIds) {
      const segment = safeSegment(skillId);
      if (!segment) continue;
      await fs.rm(path.join(skillsDir, segment), { recursive: true, force: true });
    }
  }

  async readMcpConfigs(role) {
    const { mcpDir } = this.pathsFor(role);
    const dirs = await listDirectories(mcpDir);
    const mcps = [];
    for (const dirName of dirs) {
      const configPath = path.join(mcpDir, dirName, "mcp.json");
      const config = await readJsonFile(configPath, undefined);
      if (!config?.mcpServers) continue;
      for (const [id, server] of Object.entries(config.mcpServers)) {
        const singleConfig = { mcpServers: { [id]: server } };
        mcps.push({
          id,
          path: configPath,
          tools: mcpToolsFromServer(id, server),
          mcpServers: singleConfig.mcpServers,
          configJson: JSON.stringify(stripMcpRuntimeToolFields(singleConfig), null, 2)
        });
      }
    }
    return mcps;
  }

  async writeMcpConfigs(role, mcps) {
    const { mcpDir } = this.pathsFor(role);
    await fs.rm(mcpDir, { recursive: true, force: true });
    await ensureDir(mcpDir);
    for (const mcp of mcps) {
      const dir = path.join(mcpDir, safeSegment(mcp.id));
      await writeJsonFile(path.join(dir, "mcp.json"), mcp.config);
    }
  }

  async syncMcpTools(role, mcpId) {
    const serverId = String(mcpId || "").trim();
    if (!serverId) {
      const error = new Error("MCP server id is required");
      error.status = 400;
      throw error;
    }
    const current = await this.get(role);
    if (!current) throw agentRoleNotFoundError(role);
    const mcp = (current.mcps || []).find((item) => item.id === serverId);
    if (!mcp) {
      const error = new Error(`MCP server not found for ${role}: ${serverId}`);
      error.status = 404;
      throw error;
    }
    const config = await readJsonFile(mcp.path, undefined);
    const server = config?.mcpServers?.[serverId];
    if (!server) {
      const error = new Error(`MCP server config not found: ${serverId}`);
      error.status = 404;
      throw error;
    }
    const tools = normalizeDiscoveredMcpTools(await this.mcpToolDiscoverer(server, { role, serverId }));
    const previousToolIds = new Set((mcp.tools || []).map((tool) => tool?.id).filter(Boolean));
    const discoveredToolIds = mcpToolsFromServer(serverId, { tools }).map((tool) => tool.id);
    const newlyDiscoveredToolIds = discoveredToolIds.filter((toolId) => !previousToolIds.has(toolId));
    config.mcpServers[serverId] = {
      ...server,
      tools
    };
    await writeJsonFile(mcp.path, config);
    if (newlyDiscoveredToolIds.length) {
      const paths = this.pathsFor(role);
      const toolsConfig = await readJsonFile(paths.toolsJson, { tools: current.tools });
      const mergedTools = normalizeConfiguredTools([...(toolsConfig.tools || current.tools), ...newlyDiscoveredToolIds]);
      this.validateTools(role, mergedTools, await this.get(role));
      await writeJsonFile(paths.toolsJson, { tools: mergedTools });
    }
    return this.get(role);
  }

  async migrateLegacyCapabilities(paths) {
    await copyLegacyDirectory(paths.legacyMcpDir, paths.mcpDir);
  }

  validateTools(role, tools, profile = {}) {
    if (!this.toolRegistry) return;
    const mcpToolIds = mcpToolIdsFromProfile(profile);
    const registryTools = [];
    const unknown = [];
    for (const toolId of normalizeConfiguredTools(tools)) {
      if (this.toolRegistry.get?.(toolId)) {
        registryTools.push(toolId);
      } else if (!mcpToolIds.has(toolId)) {
        unknown.push(toolId);
      }
    }
    if (unknown.length) throw new Error(`unknown tool ids for ${role}: ${unknown.join(", ")}`);
    this.toolRegistry.setRoleTools(role, registryTools);
  }

  async applyToolOverrides() {
    if (!this.toolRegistry) return;
    const roles = [...this.roleDirCache.keys()];
    for (const role of roles) {
      const merged = await this.get(role);
      if (!merged) continue;
      this.validateTools(role, merged.tools, merged);
      const paths = this.pathsFor(role);
      const persisted = await readJsonFile(paths.toolsJson, { tools: [] });
      const normalized = normalizeConfiguredTools(persisted.tools || []);
      if (JSON.stringify(normalized) !== JSON.stringify(persisted.tools || [])) {
        await writeJsonFile(paths.toolsJson, { tools: normalized });
      }
    }
  }
}

async function copyLegacyDirectory(sourceDir, targetDir) {
  for (const dirName of await listDirectories(sourceDir)) {
    const sourceChild = path.join(sourceDir, dirName);
    const targetChild = path.join(targetDir, dirName);
    await ensureDir(targetChild);
    for (const fileName of await listFiles(sourceChild)) {
      const targetFile = path.join(targetChild, fileName);
      if (await exists(targetFile)) continue;
      await fs.copyFile(path.join(sourceChild, fileName), targetFile);
    }
  }
}

function defaultAgentWorkspaceDir({ dataDir, rootDir } = {}) {
  const baseDir = rootDir || (dataDir && path.basename(path.resolve(dataDir)) === "data" ? path.dirname(path.resolve(dataDir)) : dataDir) || process.cwd();
  return path.resolve(baseDir, "agent-workspace");
}
