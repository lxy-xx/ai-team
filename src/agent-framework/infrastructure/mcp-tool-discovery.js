function objectSchema(schema) {
  return schema && typeof schema === "object" && !Array.isArray(schema)
    ? schema
    : { type: "object", additionalProperties: true };
}

function resolveEnvPlaceholders(value) {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (match, name) => process.env[name] || match);
  }
  if (Array.isArray(value)) return value.map(resolveEnvPlaceholders);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveEnvPlaceholders(item)]));
  }
  return value;
}

function normalizeHeaderMap(headers = {}) {
  return Object.fromEntries(
    Object.entries(resolveEnvPlaceholders(headers) || {})
      .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
      .map(([key, value]) => [key, String(value)])
  );
}

export function normalizeDiscoveredMcpTools(tools = []) {
  const list = Array.isArray(tools?.tools) ? tools.tools : tools;
  if (!Array.isArray(list)) return [];
  return list
    .map((tool) => {
      if (!tool || typeof tool !== "object" || Array.isArray(tool)) return undefined;
      const name = String(tool.name || tool.id || "").trim();
      if (!name) return undefined;
      return {
        name,
        description: tool.description ? String(tool.description) : undefined,
        inputSchema: objectSchema(tool.inputSchema || tool.parameters || tool.schema)
      };
    })
    .filter(Boolean);
}

function parseEventStreamJson(text, id) {
  const events = String(text || "").split(/\n\n+/);
  for (const event of events) {
    const data = event
      .split(/\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data);
      if (parsed.id === id || parsed.result || parsed.error) return parsed;
    } catch {}
  }
  throw new Error("MCP server returned an unreadable event stream response");
}

async function parseMcpResponse(response, id) {
  const text = await response.text();
  if (!response.ok) throw new Error(`MCP request failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) return parseEventStreamJson(text, id);
  try {
    return JSON.parse(text);
  } catch {
    return parseEventStreamJson(text, id);
  }
}

async function postMcpJson({ url, headers, body, id, timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return {
      response,
      payload: await parseMcpResponse(response, id)
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverMcpTools(server = {}, { timeoutMs = 15_000, fetchImpl = globalThis.fetch } = {}) {
  if (!server?.url) throw new Error("MCP tool sync requires an HTTP MCP server URL");
  if (typeof fetchImpl !== "function") throw new Error("MCP tool sync requires fetch support");
  const url = String(server.url);
  const baseHeaders = {
    ...normalizeHeaderMap(server.headers),
    accept: "application/json, text/event-stream",
    "content-type": "application/json"
  };
  const initialize = await postMcpJson({
    url,
    headers: baseHeaders,
    id: 1,
    timeoutMs,
    fetchImpl,
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ai-team", version: "0.1.0" }
      }
    }
  });
  if (initialize.payload?.error) throw new Error(`MCP initialize failed: ${initialize.payload.error.message || JSON.stringify(initialize.payload.error)}`);
  const sessionId = initialize.response.headers.get("mcp-session-id");
  const sessionHeaders = sessionId ? { ...baseHeaders, "mcp-session-id": sessionId } : baseHeaders;
  try {
    await postMcpJson({
      url,
      headers: sessionHeaders,
      id: undefined,
      timeoutMs,
      fetchImpl,
      body: { jsonrpc: "2.0", method: "notifications/initialized", params: {} }
    });
  } catch {}
  const listed = await postMcpJson({
    url,
    headers: sessionHeaders,
    id: 2,
    timeoutMs,
    fetchImpl,
    body: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    }
  });
  if (listed.payload?.error) throw new Error(`MCP tools/list failed: ${listed.payload.error.message || JSON.stringify(listed.payload.error)}`);
  return normalizeDiscoveredMcpTools(listed.payload?.result?.tools || []);
}
