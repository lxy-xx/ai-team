function objectSchema(schema) {
  return schema && typeof schema === "object" && !Array.isArray(schema)
    ? schema
    : { type: "object", additionalProperties: true };
}

function toolNameFromDescriptor(tool) {
  if (typeof tool === "string") return tool.trim();
  if (!tool || typeof tool !== "object") return "";
  return String(tool.id || tool.name || tool.toolName || "").trim();
}

function fullToolId(serverId, toolName) {
  const name = String(toolName || "").trim();
  if (!name) return "";
  return name.includes(".") ? name : `${serverId}.${name}`;
}

export function normalizeMcpToolDescriptor(serverId, tool) {
  const rawName = toolNameFromDescriptor(tool);
  const id = fullToolId(serverId, rawName);
  if (!id) return undefined;
  const descriptor = tool && typeof tool === "object" && !Array.isArray(tool) ? tool : {};
  const shortName = String(descriptor.name || rawName).trim();
  return {
    id,
    name: shortName.includes(".") ? shortName.split(".").at(-1) : shortName,
    serverId,
    description: String(descriptor.description || descriptor.descriptionZh || `External tool ${id}.`),
    descriptionZh: descriptor.descriptionZh ? String(descriptor.descriptionZh) : undefined,
    parameters: objectSchema(descriptor.parameters || descriptor.inputSchema || descriptor.schema),
    risk: descriptor.risk || "medium",
    category: "external_tool",
    origin: { type: "mcp", serverId, name: shortName || id }
  };
}

export function mcpToolsFromServer(serverId, server = {}) {
  const configured = Array.isArray(server?.tools)
    ? server.tools
    : Array.isArray(server?.availableTools)
      ? server.availableTools
      : [];
  return configured
    .map((tool) => normalizeMcpToolDescriptor(serverId, tool))
    .filter(Boolean);
}

export function mcpToolDefinitionsFromProfile(profile = {}) {
  const byId = new Map();
  for (const mcp of profile.mcps || []) {
    for (const tool of mcp.tools || []) {
      const normalized = normalizeMcpToolDescriptor(mcp.id || tool.serverId, tool);
      if (normalized) byId.set(normalized.id, normalized);
    }
  }
  return [...byId.values()];
}

export function findMcpToolDefinition(profile = {}, toolId) {
  return mcpToolDefinitionsFromProfile(profile).find((tool) => tool.id === toolId);
}
