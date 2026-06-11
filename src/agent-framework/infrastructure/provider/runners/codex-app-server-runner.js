import { spawn } from "node:child_process";
import { promptWithTextToolProtocol } from "../../../domain/tools/text-tool-protocol.js";

const DEFAULT_DISABLED_CODEX_APP_FEATURES = [
  "shell_tool",
  "unified_exec",
  "shell_snapshot",
  "hooks",
  "plugins",
  "apps",
  "tool_search",
  "tool_suggest",
  "in_app_browser",
  "browser_use",
  "browser_use_external",
  "computer_use",
  "image_generation",
  "skill_mcp_dependency_install",
  "multi_agent",
  "goals"
];

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ""));
}

function normalizeSandboxMode(value) {
  const sandbox = String(value || "workspace-write").trim();
  if (sandbox === "danger-full-access") return "danger-full-access";
  if (sandbox === "read-only" || sandbox === "readonly") return "read-only";
  return "workspace-write";
}

function sandboxPolicyFor(mode, workspace) {
  if (mode === "danger-full-access") return { type: "dangerFullAccess" };
  if (mode === "read-only") return { type: "readOnly", networkAccess: false };
  return {
    type: "workspaceWrite",
    writableRoots: [workspace],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false
  };
}

function messageTextFromContent(content = []) {
  return content
    .filter((item) => item?.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("");
}

function messageTextFromTurn(turn = {}) {
  return (turn.items || [])
    .filter((item) => item?.type === "agentMessage" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function messageTextFromRawItem(item = {}) {
  if (item.type !== "message" || item.role !== "assistant") return "";
  return messageTextFromContent(item.content || []).trim();
}

function requestTimeoutMessage(method, timeoutMs) {
  return `codex app-server ${method} timed out after ${timeoutMs}ms`;
}

function stripMarkdownFence(value) {
  const text = String(value || "").trim();
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text;
}

function parseTextToolCalls(finalMessage = "") {
  const text = String(finalMessage || "");
  const match = text.match(/<tool_calls>([\s\S]*?)<\/tool_calls>/i) || text.match(/<ai_team_tool_calls>([\s\S]*?)<\/ai_team_tool_calls>/i);
  if (!match) return { finalMessage: text.trim(), toolCalls: [] };
  let parsed;
  try {
    parsed = JSON.parse(stripMarkdownFence(match[1]));
  } catch (error) {
    throw new Error(`invalid tool call JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed)) throw new Error("tool calls must be a JSON array");
  const toolCalls = parsed.map((call, index) => {
    const name = String(call?.name || "").trim();
    if (!name) throw new Error("tool call requires name");
    const args = call.arguments && typeof call.arguments === "object" && !Array.isArray(call.arguments)
      ? call.arguments
      : {};
    return {
      id: String(call.id || `call_${index + 1}`),
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(args)
      }
    };
  });
  return {
    finalMessage: text.replace(match[0], "").trim(),
    toolCalls
  };
}

class CodexAppServerClient {
  constructor({ child, timeoutMs, logger, onProviderEvent }) {
    this.child = child;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.onProviderEvent = onProviderEvent;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = "";
    this.stderr = "";
    this.deltaText = "";
    this.rawMessages = [];
    this.turnCompletion = undefined;
    this.closed = false;

    this.child.stdout?.setEncoding?.("utf8");
    this.child.stderr?.setEncoding?.("utf8");
    this.child.stdout?.on("data", (chunk) => this.handleStdout(chunk));
    this.child.stderr?.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.child.on?.("error", (error) => this.rejectAll(error));
    this.child.on?.("close", (exitCode) => {
      this.closed = true;
      const error = new Error(`codex app-server exited before turn completed with code ${exitCode}`);
      this.rejectAll(error);
    });
  }

  handleStdout(chunk) {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.handleMessage(JSON.parse(line));
      } catch (error) {
        this.logger?.warn?.({ error: error.message, line: line.slice(0, 500) }, "failed to parse codex app-server message");
      }
    }
  }

  handleMessage(message) {
    this.rawMessages.push(message);
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.id && message.method) {
      this.respondToServerRequest(message);
      return;
    }
    if (message.method === "item/agentMessage/delta") {
      const delta = message.params?.delta || "";
      this.deltaText += delta;
      this.onProviderEvent?.({ type: "delta", delta, text: this.deltaText, raw: message });
      return;
    }
    if (message.method === "rawResponseItem/completed") {
      const text = messageTextFromRawItem(message.params?.item);
      if (text) this.deltaText = text;
      this.onProviderEvent?.({ type: "message", text: this.deltaText, raw: message });
      return;
    }
    if (message.method === "turn/completed") {
      const turn = message.params?.turn || {};
      if (turn.status === "failed") {
        this.finishTurn(undefined, new Error(turn.error?.message || "codex app-server turn failed"));
        return;
      }
      const finalMessage = messageTextFromTurn(turn) || this.deltaText;
      this.finishTurn({ finalMessage, turn });
    }
  }

  respondToServerRequest(message) {
    const method = message.method;
    if (method === "item/commandExecution/requestApproval") {
      this.send({ id: message.id, result: { decision: "decline" } });
      return;
    }
    if (method === "item/fileChange/requestApproval") {
      this.send({ id: message.id, result: { decision: "decline" } });
      return;
    }
    if (method === "execCommandApproval" || method === "applyPatchApproval") {
      this.send({ id: message.id, result: { decision: "denied" } });
      return;
    }
    if (method === "item/tool/call") {
      this.send({
        id: message.id,
        result: {
          success: false,
          contentItems: [{ type: "inputText", text: "AI Team did not expose this Codex app-server tool for this provider turn." }]
        }
      });
      return;
    }
    this.send({
      id: message.id,
      error: {
        code: -32000,
        message: `AI Team does not handle Codex app-server request: ${method}`
      }
    });
  }

  send(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params) {
    const id = this.nextId++;
    const message = compactObject({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(requestTimeoutMessage(method, this.timeoutMs)));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send(message);
    });
  }

  async initialize() {
    return this.request("initialize", {
      clientInfo: { name: "ai-team", version: "0.1.0" },
      capabilities: null
    });
  }

  async startTurn(params) {
    if (this.turnCompletion) throw new Error("codex app-server runner only supports one active turn per process");
    const completion = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.turnCompletion = undefined;
        reject(new Error(requestTimeoutMessage("turn/completed", this.timeoutMs)));
      }, this.timeoutMs);
      this.turnCompletion = { resolve, reject, timer };
    });
    const guardedCompletion = completion.catch((error) => {
      throw error;
    });
    try {
      await this.request("turn/start", params);
    } catch (error) {
      this.finishTurn(undefined, error);
      throw error;
    }
    return guardedCompletion;
  }

  finishTurn(result, error) {
    if (!this.turnCompletion) return;
    const completion = this.turnCompletion;
    this.turnCompletion = undefined;
    clearTimeout(completion.timer);
    if (error) completion.reject(error);
    else completion.resolve(result);
  }

  rejectAll(error) {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.finishTurn(undefined, error);
  }

  async close() {
    if (this.closed) return;
    this.child.stdin.end?.();
    this.child.kill?.("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  stdoutText() {
    return this.rawMessages.map((message) => JSON.stringify(message)).join("\n");
  }

  stderrText() {
    return this.stderr;
  }
}

export class CodexAppServerRunner {
  constructor({ config = {}, logger = console, processFactory = spawn }) {
    this.config = config;
    this.logger = logger;
    this.processFactory = processFactory;
  }

  async run({ role, prompt, workspace, sandbox, model, providerConfig = {}, tools = [], onProviderEvent }) {
    if (!prompt) throw new Error("codex app-server runner requires prompt");
    const started = Date.now();
    const codexBin = providerConfig.codexBin || this.config.runner?.codexBin || "codex";
    const selectedModel = model || providerConfig.defaultModel || providerConfig.models?.[0] || this.config.provider?.model || this.config.runner?.codexModel;
    if (!selectedModel) throw new Error("model is required for Codex app-server provider");
    const timeoutMs = Number(providerConfig.timeoutMs || this.config.runner?.codexTimeoutMs || 900_000);
    const approvalPolicy = providerConfig.approvalMode || this.config.runner?.codexApproval || "never";
    const sandboxMode = normalizeSandboxMode(sandbox || providerConfig.sandbox || this.config.runner?.codexSandbox || "workspace-write");
    const cwd = workspace || this.config.workspace || process.cwd();

    this.logger?.info?.({ role, workspace: cwd, bin: codexBin, model: selectedModel, provider: providerConfig.id }, "starting codex app-server agent turn");

    const disabledFeatures = providerConfig.enableCodexInternalTools === true ? [] : DEFAULT_DISABLED_CODEX_APP_FEATURES;
    const appServerArgs = [
      "app-server",
      ...disabledFeatures.flatMap((feature) => ["--disable", feature]),
      "--listen",
      "stdio://"
    ];
    const child = this.processFactory(codexBin, appServerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    const client = new CodexAppServerClient({ child, timeoutMs, logger: this.logger, onProviderEvent });

    try {
      await client.initialize();
      const threadResult = await client.request("thread/start", compactObject({
        cwd,
        model: selectedModel,
        modelProvider: providerConfig.modelProvider,
        approvalPolicy,
        sandbox: sandboxMode,
        baseInstructions: providerConfig.baseInstructions || "You are the model backend for AI Team. Follow the assignment payload exactly and answer with the final agent output.",
        developerInstructions: providerConfig.developerInstructions || "The host application owns skills, tools, memory, and entity lifecycle outside this provider call. Do not claim to have called a tool unless the prompt contains an observed tool result.",
        ephemeral: true,
        serviceName: "AI Team",
        config: providerConfig.appServerConfig
      }));
      const threadId = threadResult?.thread?.id;
      if (!threadId) throw new Error("codex app-server did not return a thread id");
      const completion = await client.startTurn(compactObject({
        threadId,
        input: [{ type: "text", text: promptWithTextToolProtocol(String(prompt), tools), text_elements: [] }],
        model: selectedModel,
        approvalPolicy,
        sandboxPolicy: sandboxPolicyFor(sandboxMode, cwd)
      }));
      const parsed = parseTextToolCalls(completion.finalMessage);
      return {
        finalMessage: parsed.finalMessage,
        toolCalls: parsed.toolCalls,
        structuredOutput: undefined,
        stdout: client.stdoutText(),
        stderr: client.stderrText(),
        durationMs: Date.now() - started
      };
    } finally {
      await client.close();
    }
  }
}
