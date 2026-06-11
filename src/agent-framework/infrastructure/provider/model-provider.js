import { createRunner } from "./runners/index.js";

export class ModelProvider {
  constructor({ id, runner, capabilities = {}, config = {}, logger, providerConfigStore }) {
    this.id = id;
    this.runner = runner;
    this.capabilities = capabilities;
    this.config = config;
    this.logger = logger;
    this.providerConfigStore = providerConfigStore;
    this.runnerCache = new Map();
  }

  describe() {
    return {
      id: this.id,
      capabilities: this.capabilities
    };
  }

  async resolveTurnConfig(selection = {}) {
    if (this.providerConfigStore?.resolve) return this.providerConfigStore.resolve(selection);
    const provider = {
      id: this.id,
      type: this.config.runner?.type,
      runner: this.config.runner?.type,
      defaultModel: this.capabilities.model,
      models: this.capabilities.model ? [this.capabilities.model] : [],
      codexBin: this.config.runner?.codexBin,
      sandbox: this.config.runner?.codexSandbox,
      approvalMode: this.config.runner?.codexApproval,
      timeoutMs: this.config.runner?.codexTimeoutMs
    };
    return {
      provider,
      providerId: provider.id,
      runner: provider.runner,
      model: selection.model || provider.defaultModel
    };
  }

  runnerFor(provider = {}) {
    const type = provider.runner || provider.type || this.config.runner?.type;
    if (!this.providerConfigStore && this.runner && type === this.config.runner?.type) return this.runner;
    const key = `${type}:${provider.id || "default"}`;
    if (!this.runnerCache.has(key)) {
      const runnerConfig = {
        ...this.config,
        runner: {
          ...this.config.runner,
          type,
          codexBin: provider.codexBin || this.config.runner?.codexBin,
          codexSandbox: provider.sandbox || this.config.runner?.codexSandbox,
          codexApproval: provider.approvalMode || this.config.runner?.codexApproval,
          codexTimeoutMs: provider.timeoutMs || this.config.runner?.codexTimeoutMs
        }
      };
      this.runnerCache.set(key, createRunner({ config: runnerConfig, logger: this.logger }));
    }
    return this.runnerCache.get(key);
  }

  async runAgentTurn(input) {
    const resolved = await this.resolveTurnConfig(input.providerSelection || input.turn?.profile?.modelProvider || {});
    const runner = this.runnerFor(resolved.provider);
    const result = await runner.run({
      ...input,
      providerConfig: resolved.provider,
      model: resolved.model
    });
    return {
      ...result,
      provider: resolved.providerId,
      model: resolved.model
    };
  }

  async complete(input = {}) {
    const resolved = input.providerConfig && input.model
      ? {
          provider: input.providerConfig,
          providerId: input.providerConfig.id,
          runner: input.providerConfig.runner || input.providerConfig.type,
          model: input.model
        }
      : await this.resolveTurnConfig(input.providerSelection || {});
    const runner = this.runnerFor(resolved.provider);
    const runnerType = resolved.runner || resolved.provider?.runner || resolved.provider?.type;
    const runnerInput = {
      ...input,
      providerConfig: resolved.provider,
      model: resolved.model
    };
    if (runnerType === "codex_app_server") {
      runnerInput.prompt = input.prompt || promptFromMessages(input.messages);
      delete runnerInput.messages;
    }
    const result = await runner.run(runnerInput);
    const message = result.assistantMessage || {
      role: "assistant",
      content: result.finalMessage || ""
    };
    return {
      message,
      toolCalls: result.toolCalls || message.tool_calls || [],
      structuredOutput: result.structuredOutput,
      structured: result.structured,
      usage: result.usage,
      raw: result.raw ?? result.stdout,
      provider: resolved.providerId,
      model: resolved.model
    };
  }
}

function promptFromMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map(messagePromptBlock)
    .filter(Boolean)
    .join("\n\n");
}

function messagePromptBlock(message = {}) {
  const role = message?.role || "user";
  const content = messageContentText(message?.content);
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length) {
    return [
      "ASSISTANT_TOOL_CALL:",
      JSON.stringify({
        content: content || undefined,
        tool_calls: message.tool_calls
      }, null, 2)
    ].join("\n");
  }
  if (role === "tool") {
    return [
      `TOOL_RESULT${message.tool_call_id ? ` ${message.tool_call_id}` : ""}:`,
      content
    ].filter(Boolean).join("\n");
  }
  return content ? `${role.toUpperCase()}:\n${content}` : "";
}

function messageContentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.content === "string") return part.content;
      return "";
    })
    .join("");
}

export function createModelProvider({ config, logger, providerConfigStore }) {
  const runner = createRunner({ config, logger });
  const providerId = config.provider?.id || config.runner.type;
  return new ModelProvider({
    id: providerId,
    runner,
    config,
    logger,
    providerConfigStore,
    capabilities: {
      runner: config.runner.type,
      model: config.provider?.model || config.runner.codexModel,
      supportsTools: false,
      supportsStreaming: false,
      sandbox: config.runner.codexSandbox,
      approvalMode: config.toolPolicy.approvalMode
    }
  });
}
