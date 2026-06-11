import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { redactSecretValue, safeHostContextKeys } from "../domain/security/redaction.js";
import { findMcpToolDefinition } from "../domain/tools/mcp-tools.js";
import { AsyncBashJobManager } from "./async-bash-jobs.js";

const MAX_TOOL_TEXT_CHARS = 4000;

function runProcess({ bin, args, cwd, timeoutMs = 120_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      reject(new Error(`${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
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

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && !(Array.isArray(entry) && entry.length === 0)));
}

function truncateToolText(value, limit = MAX_TOOL_TEXT_CHARS) {
  const text = String(value || "");
  if (text.length <= limit) return { text, truncated: false, length: text.length };
  const head = text.slice(0, Math.floor(limit * 0.7));
  const tail = text.slice(-Math.floor(limit * 0.3));
  return {
    text: `${head}\n...[truncated ${text.length - limit} chars]...\n${tail}`,
    truncated: true,
    length: text.length
  };
}

function validateToolInputSchema(toolId, input, schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  if (schema.type && schema.type !== "object") throw new Error(`tool ${toolId} parameters must use object schema`);
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error(`tool ${toolId} input must be an object`);
  for (const key of schema.required || []) {
    if (!Object.hasOwn(input, key) || input[key] === undefined || input[key] === null || input[key] === "") {
      throw new Error(`tool ${toolId} requires ${key}`);
    }
  }
}

function resolveBashCwd(config = {}, input = {}, context = {}) {
  const workspace = context.hostContext?.workspace || config.workspace || process.cwd();
  const cwd = input.cwd || workspace;
  return path.isAbsolute(String(cwd)) ? path.resolve(String(cwd)) : path.resolve(workspace, String(cwd));
}

function profileAllowsTool(profile = {}, toolId) {
  if (!Array.isArray(profile.tools)) return false;
  return profile.tools.map(String).includes(String(toolId));
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (!text) return "''";
  return `'${text.replace(/'/g, "'\\''")}'`;
}

async function selectCodingAgentLauncher(input = {}, store) {
  if (!store?.list) throw new Error("Coding Agent launcher store unavailable");
  const launchers = await store.list();
  if (!launchers.length) throw new Error("no Coding Agent launcher configured");
  const requestedId = String(input.agentId || "").trim();
  if (!requestedId) return launchers[0];
  const launcher = launchers.find((candidate) => candidate.id === requestedId || candidate.name === requestedId);
  if (!launcher) throw new Error(`Coding Agent launcher not found: ${requestedId}`);
  return launcher;
}

function renderCodingAgentCommand(launcher, vars = {}) {
  if (launcher.commandTemplate) {
    return String(launcher.commandTemplate).replace(/\{\{\s*(workspace|prompt)\s*\}\}/g, (_, key) => shellQuote(vars[key] ?? ""));
  }
  const renderCodingAgentArg = (value) => String(value ?? "").replace(/\{\{\s*(workspace|prompt)\s*\}\}/g, (_, key) => vars[key] ?? "");
  const command = shellQuote(renderCodingAgentArg(launcher.command, vars));
  const args = (launcher.args || []).map((arg) => shellQuote(renderCodingAgentArg(arg)));
  return [command, ...args].join(" ");
}

function resolveCodingAgentWorkspace(config = {}, input = {}, context = {}) {
  const workspace = context.hostContext?.workspace || config.workspace || process.cwd();
  const selected = input.workspace || workspace;
  return path.isAbsolute(String(selected)) ? path.resolve(String(selected)) : path.resolve(workspace, String(selected));
}

function resolveCodingAgentTimeout(input = {}, launcher = {}) {
  const requested = Number(input.timeoutMs);
  const configured = Number(launcher.timeoutMs);
  const configuredTimeout = Number.isFinite(configured) && configured > 0 ? configured : undefined;
  const requestedTimeout = Number.isFinite(requested) && requested > 0 ? requested : undefined;
  if (configuredTimeout && requestedTimeout) return Math.max(configuredTimeout, requestedTimeout);
  return requestedTimeout || configuredTimeout;
}

export class ToolExecutor {
  constructor({ config, memory, toolRegistry, toolAuditLog, mcpToolRunner, logger, asyncBashJobManager, codingAgentLauncherStore }) {
    this.config = config;
    this.memory = memory;
    this.toolRegistry = toolRegistry;
    this.toolAuditLog = toolAuditLog;
    this.mcpToolRunner = mcpToolRunner;
    this.logger = logger;
    this.asyncBashJobManager = asyncBashJobManager || new AsyncBashJobManager({ config, logger });
    this.codingAgentLauncherStore = codingAgentLauncherStore;
    this.registerDefaultHandlers();
  }

  registerDefaultHandlers() {
    this.registerHandlers({
      "memory.search": (input, context) =>
        context.agentMemory?.search
          ? context.agentMemory.search(input.query || "", input.limit || 8)
          : this.memory.search(input.query || "", input.limit || 8),
      "memory.write": (input, context) => this.writeMemory(input, context),
      "skill": (input, context) => this.readSkill(input, context),
      "Bash": (input, context) => this.runBash(input, context),
      "async_bash.start": (input, context) => this.asyncBashJobManager.start(input, context),
      "async_bash.status": (input, context) => this.asyncBashJobManager.status(input, context),
      "async_bash.wait": (input, context) => this.asyncBashJobManager.wait(input, context),
      "async_bash.cancel": (input, context) => this.asyncBashJobManager.cancel(input, context),
      "coding_agent.start": (input, context) => this.startCodingAgent(input, context),
      "coding_agent.status": (input, context) => this.asyncBashJobManager.status(input, context),
      "coding_agent.wait": (input, context) => this.asyncBashJobManager.wait(input, context),
      "coding_agent.cancel": (input, context) => this.asyncBashJobManager.cancel(input, context)
    });
  }

  registerHandlers(handlers) {
    if (!this.toolRegistry?.registerHandler) return;
    for (const [toolId, handler] of Object.entries(handlers)) {
      this.toolRegistry.registerHandler(toolId, handler);
    }
  }

  async invoke({ role, agentName, toolId, input = {}, taskId, source = "api", sessionId, traceId, hostContext, agentMemory, agentProfile }) {
    if (!String(role || "").trim()) {
      const error = new Error("ToolExecutor.invoke requires role");
      error.status = 400;
      throw error;
    }
    role = String(role).trim();
    const startedAt = new Date().toISOString();
    let status = "completed";
    let output;
    try {
      const agentRuntimeMemoryTool = source === "agent_runtime" && toolId?.startsWith("memory.") && agentMemory;
      const agentRuntimeSkillTool = source === "agent_runtime" && toolId === "skill";
      const agentRuntimeMcpTool = source === "agent_runtime" && profileAllowsTool(agentProfile, toolId)
        ? findMcpToolDefinition(agentProfile, toolId)
        : undefined;
      if (!agentRuntimeMemoryTool && !agentRuntimeSkillTool && !agentRuntimeMcpTool && !this.toolRegistry.allowed(role, toolId)) {
        const error = new Error(`tool ${toolId} is not allowed for role ${role}`);
        error.status = 403;
        throw error;
      }
      validateToolInputSchema(toolId, input, (this.toolRegistry.get?.(toolId) || agentRuntimeMcpTool)?.parameters);
      output = await this.execute(toolId, input, { role, agentName, taskId, sessionId, traceId, hostContext, agentMemory, agentProfile });
      return {
        toolId,
        role,
        status,
        startedAt,
        endedAt: new Date().toISOString(),
        output
      };
    } catch (error) {
      status = "failed";
      output = error.output ? { ...error.output, error: error.message } : { error: error.message };
      error.toolResult = {
        toolId,
        role,
        status,
        startedAt,
        endedAt: new Date().toISOString(),
        output
      };
      throw error;
    } finally {
      if (this.toolAuditLog) {
        await this.toolAuditLog.record({
          ...compactObject({
            type: "tool_invocation",
            source,
            taskId,
            role,
            agentName,
            sessionId,
            traceId,
            hostContextKeys: safeHostContextKeys(hostContext),
            toolId,
            status,
            input: this.redactInput(toolId, input),
            output: this.redactOutput(toolId, output)
          })
        });
      }
    }
  }

  redactInput(_toolId, input) {
    const redacted = redactSecretValue(input || {});
    if (typeof redacted.prompt === "string" && redacted.prompt.length > 1_000) {
      redacted.prompt = `${redacted.prompt.slice(0, 1_000)}\n[truncated ${redacted.prompt.length - 1_000} chars]`;
    }
    return redacted;
  }

  redactOutput(_toolId, output) {
    return redactSecretValue(output);
  }

  async execute(toolId, input, context) {
    const handler = this.toolRegistry?.handlerFor?.(toolId);
    if (!handler) {
      const mcpTool = findMcpToolDefinition(context.agentProfile, toolId);
      if (mcpTool) return this.runExternalTool(mcpTool, input, context);
      throw new Error(`unknown tool: ${toolId}`);
    }
    return handler(input, { ...context, toolId });
  }

  async writeMemory(input, context = {}) {
    if (context.agentMemory?.writeMemory) {
      return context.agentMemory.writeMemory(input, {
        agentName: context.agentName,
        role: context.role,
        sessionId: context.sessionId,
        traceId: context.traceId,
        hostContext: context.hostContext
      });
    }
    if (input.layer === "episodic") {
      return this.memory.recordEvent({
        type: input.type || "tool_memory_write",
        text: input.value,
        ...(input.metadata || {})
      });
    }
    const key = input.key;
    if (!key) throw new Error("memory.write requires key");
    if (input.layer === "procedural") {
      return this.memory.upsertProcedure(key, input.value, input.metadata || {});
    }
    return this.memory.upsertFact(key, input.value, input.metadata || {});
  }

  async readSkill(input, context = {}) {
    const name = String(input.name || input.skill || input.id || "").trim();
    if (!name) throw new Error("skill requires name");
    const skills = context.agentProfile?.skills || context.agentSkills || [];
    const skill = (Array.isArray(skills) ? skills : []).find((candidate) =>
      [candidate.id, candidate.name].filter(Boolean).map(String).includes(name)
    );
    if (!skill) throw new Error(`skill is not installed: ${name}`);
    let content = "";
    if (skill.path) {
      try {
        content = await fs.readFile(skill.path, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (!content) content = typeof skill.content === "string" ? skill.content : "";
    return {
      kind: "skill",
      id: skill.id || name,
      name: skill.id || skill.name || name,
      description: skill.description || "",
      path: skill.path,
      content
    };
  }

  async runExternalTool(tool, input, context = {}) {
    if (!this.mcpToolRunner?.call) throw new Error(`external tool runner unavailable for ${tool.id}`);
    return this.mcpToolRunner.call({
      tool,
      arguments: input,
      role: context.role,
      agentName: context.agentName,
      taskId: context.taskId,
      sessionId: context.sessionId,
      traceId: context.traceId,
      hostContext: context.hostContext
    });
  }

  async runBash(input, context = {}) {
    const command = String(input.command || "").trim();
    if (!command) throw new Error("Bash requires command");
    const timeoutValue = Number(input.timeoutMs);
    const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 120_000;
    const cwd = resolveBashCwd(this.config, input, context);
    const result = await runProcess({
      bin: "bash",
      args: ["-lc", command],
      cwd,
      timeoutMs
    });
    const stdout = truncateToolText(result.stdout);
    const stderr = truncateToolText(result.stderr);
    const output = {
      command,
      cwd,
      exitCode: result.exitCode,
      stdout: stdout.text,
      stdoutTruncated: stdout.truncated || undefined,
      stdoutLength: stdout.truncated ? stdout.length : undefined,
      stderr: stderr.text,
      stderrTruncated: stderr.truncated || undefined,
      stderrLength: stderr.truncated ? stderr.length : undefined
    };
    if (result.exitCode !== 0) {
      const detail = [stderr.text, stdout.text].filter(Boolean).join("\n").trim();
      const error = new Error(`Bash exited with code ${result.exitCode}${detail ? `: ${detail}` : ""}`);
      error.output = output;
      throw error;
    }
    return output;
  }

  async startCodingAgent(input = {}, context = {}) {
    const prompt = String(input.prompt || "").trim();
    if (!prompt) throw new Error("coding_agent.start requires prompt");
    const launcher = await selectCodingAgentLauncher(input, this.codingAgentLauncherStore);
    const workspace = resolveCodingAgentWorkspace(this.config, input, context);
    const command = renderCodingAgentCommand(launcher, { prompt, workspace });
    const timeoutMs = resolveCodingAgentTimeout(input, launcher);
    const job = await this.asyncBashJobManager.start({
      command,
      cwd: workspace,
      timeoutMs,
      env: launcher.env
    }, context);
    return {
      kind: "coding_agent_job",
      codingAgent: compactObject({
        id: launcher.id || "default"
      }),
      job
    };
  }

}
