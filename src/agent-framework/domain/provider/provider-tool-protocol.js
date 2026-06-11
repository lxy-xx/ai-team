const OPENAI_TOOL_NAME_MAX_CHARS = 64;

export class ProviderToolProtocol {
  completionText(response = {}) {
    const content = response.message?.content ?? response.finalMessage ?? "";
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join("")
      .trim();
  }

  normalizeProviderToolCalls(toolCalls = []) {
    return (Array.isArray(toolCalls) ? toolCalls : [])
      .map((toolCall, index) => {
        const fn = toolCall.function || {};
        const name = fn.name || toolCall.name || toolCall.toolId || toolCall.id;
        if (!name) return undefined;
        return {
          id: toolCall.id || `call_${index}`,
          type: toolCall.type || "function",
          name,
          arguments: fn.arguments ?? toolCall.arguments ?? toolCall.input ?? {}
        };
      })
      .filter(Boolean);
  }

  assistantToolCallMessage(response, toolCalls) {
    const original = response?.message || response?.assistantMessage;
    if (original && Array.isArray(original.tool_calls)) {
      const replay = {
        role: "assistant",
        content: original.content ?? null,
        tool_calls: original.tool_calls
      };
      if (typeof original.reasoning_content === "string") {
        replay.reasoning_content = original.reasoning_content;
      }
      return replay;
    }
    return {
      role: "assistant",
      content: this.completionText(response) || null,
      tool_calls: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: toolCall.type || "function",
        function: {
          name: toolCall.name,
          arguments: typeof toolCall.arguments === "string" ? toolCall.arguments : JSON.stringify(toolCall.arguments || {})
        }
      }))
    };
  }

  parseToolCallArguments(toolCall) {
    const args = toolCall.arguments;
    if (args === undefined || args === null || args === "") return {};
    if (typeof args === "string") {
      try {
        const parsed = JSON.parse(args);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("arguments must be a JSON object");
        }
        return parsed;
      } catch (error) {
        throw new Error(`tool call ${toolCall.name} arguments must be valid JSON: ${error.message}`);
      }
    }
    if (typeof args === "object" && !Array.isArray(args)) return args;
    throw new Error(`tool call ${toolCall.name} arguments must be an object`);
  }

  openAICompatibleToolManifest(tools = []) {
    const allowedTools = (Array.isArray(tools) ? tools : []).filter((tool) => tool?.id && tool?.policy?.allowed !== false);
    const baseCounts = new Map();
    const baseById = new Map();
    for (const tool of allowedTools) {
      const base = this.safeOpenAIToolName(tool.id);
      baseById.set(tool.id, base);
      baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
    }

    const usedNames = new Set();
    const nameToId = new Map();
    const openAITools = allowedTools.map((tool) => {
      const base = baseById.get(tool.id);
      let safeName = baseCounts.get(base) > 1
        ? this.safeOpenAIToolNameWithSuffix(base, this.stableToolNameSuffix(tool.id))
        : base;
      let attempt = 2;
      while (usedNames.has(safeName)) {
        safeName = this.safeOpenAIToolNameWithSuffix(base, `${this.stableToolNameSuffix(tool.id)}_${attempt}`);
        attempt += 1;
      }
      usedNames.add(safeName);
      nameToId.set(safeName, tool.id);
      return {
        type: "function",
        function: {
          name: safeName,
          description: tool.description || tool.descriptionZh || `Host tool ${tool.id}`,
          parameters: tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters) ? tool.parameters : {
            type: "object",
            additionalProperties: true
          }
        }
      };
    });
    return { tools: openAITools, nameToId };
  }

  safeOpenAIToolName(toolId) {
    const safe = String(toolId || "")
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return (safe || "tool").slice(0, OPENAI_TOOL_NAME_MAX_CHARS);
  }

  safeOpenAIToolNameWithSuffix(base, suffix) {
    const cleanSuffix = this.safeOpenAIToolName(suffix);
    const trimmedBase = String(base || "tool").slice(0, Math.max(1, OPENAI_TOOL_NAME_MAX_CHARS - cleanSuffix.length - 1));
    return `${trimmedBase}_${cleanSuffix}`.slice(0, OPENAI_TOOL_NAME_MAX_CHARS);
  }

  stableToolNameSuffix(value) {
    let hash = 2166136261;
    for (const char of String(value || "")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
}
