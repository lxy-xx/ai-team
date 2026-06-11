export class OpenAICompatibleRunner {
  constructor({ config = {}, logger = console }) {
    this.config = config;
    this.logger = logger;
  }

  async run({ role, prompt, messages, tools, model, providerConfig = {} }) {
    const started = Date.now();
    const apiKeyEnv = providerConfig.apiKeyEnv || "OPENAI_API_KEY";
    const apiKey = providerConfig.apiKey || process.env[apiKeyEnv];
    if (!apiKey) throw new Error(`${apiKeyEnv} is not set`);
    const baseUrl = String(providerConfig.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    const selectedModel = model || providerConfig.defaultModel || providerConfig.models?.[0];
    if (!selectedModel) throw new Error("model is required for API key provider");
    const requestMessages = Array.isArray(messages) && messages.length ? messages : [{ role: "user", content: prompt }];
    const requestBody = {
      model: selectedModel,
      messages: requestMessages,
      stream: false
    };
    if (Array.isArray(tools) && tools.length) {
      requestBody.tools = tools;
      requestBody.tool_choice = "auto";
    }

    this.logger.info({ role, provider: providerConfig.id, model: selectedModel, baseUrl }, "starting openai-compatible agent turn");

    const controller = new AbortController();
    const timeoutMs = Number(providerConfig.timeoutMs || this.config.runner?.codexTimeoutMs || 900_000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`model API exited with ${response.status}: ${text}`);
        error.status = response.status;
        throw error;
      }
      const data = JSON.parse(text || "{}");
      const message = data.choices?.[0]?.message || {};
      const finalMessage = messageText(message?.content) || data.output_text || "";
      return {
        finalMessage: String(finalMessage).trim(),
        structuredOutput: undefined,
        toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
        assistantMessage: message,
        stdout: text,
        stderr: "",
        durationMs: Date.now() - started
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function messageText(content) {
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
