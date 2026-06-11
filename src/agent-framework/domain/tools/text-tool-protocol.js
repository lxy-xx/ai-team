function normalizeToolsForProtocol(tools = []) {
  return (Array.isArray(tools) ? tools : [])
    .map((tool) => {
      const fn = tool?.function || {};
      const name = fn.name || tool.name;
      if (!name) return undefined;
      return {
        name,
        description: fn.description || tool.description || "",
        parameters: fn.parameters && typeof fn.parameters === "object" ? fn.parameters : { type: "object", additionalProperties: true }
      };
    })
    .filter(Boolean);
}

export function formatTextToolProtocol(tools = []) {
  const normalized = normalizeToolsForProtocol(tools);
  if (!normalized.length) return "";
  return [
    "## Tool Protocol",
    "你可以请求宿主工具。宿主会执行工具、审计调用，并把结果作为下一轮 TOOL 消息返回给你。",
    "如果需要调用工具，只输出一个 XML 标签，不要夹杂解释文字：",
    '<tool_calls>[{"id":"call_1","name":"tool_name","arguments":{}}]</tool_calls>',
    "如果不需要工具，就正常回复用户。",
    "",
    "Available tools:",
    ...normalized.map((tool) => [
      `- ${tool.name}: ${tool.description || "Host tool"}`,
      `  parameters: ${JSON.stringify(tool.parameters)}`
    ].join("\n"))
  ].join("\n");
}

export function promptHasTextToolProtocol(prompt = "") {
  return /##\s*Tool Protocol\b|<tool_calls>|<ai_team_tool_calls>/i.test(String(prompt || ""));
}

export function promptWithTextToolProtocol(prompt, tools = []) {
  const protocol = formatTextToolProtocol(tools);
  if (!protocol || promptHasTextToolProtocol(prompt)) return String(prompt || "");
  return [String(prompt || ""), protocol].filter(Boolean).join("\n");
}
