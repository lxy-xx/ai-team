import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { FEEDBACK_STATUS, ROLES, sessionKeyFor, toLegacyTask } from "../../team-engine/domain/schema.js";
import { resolveAgentContextNeed, runAgentOneOnOne, teachAgentOneOnOneMemory } from "../../agent-framework/application/one-on-one-chat.js";
import { renderArchitecturePage } from "../../fe/architecture/architecture-page.js";
import { buildDashboardData } from "./read-models/dashboard-read-model-controller.js";
import { renderDashboardLoginPage, renderDashboardPage } from "../../fe/dashboard/dashboard-page.js";
import { createDashboardWebSocketHub } from "./dashboard-websocket.js";
import { dashboardAdminTokenMode, effectiveDashboardAdminToken } from "./dashboard-auth.js";
import {
  ARCHITECTURE_PATH,
  DASHBOARD_LOGIN_PATH,
  DASHBOARD_PATH,
  apiResourcePath,
  consoleResourcePath
} from "../../platform/http-paths.js";

const DASHBOARD_AUTH_COOKIE = "ai_team_admin_token";

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function send(response, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers
  });
  response.end(payload);
}

function sendHtml(response, status, html, headers = {}) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    ...headers
  });
  response.end(html);
}

function redirect(response, location, status = 302, headers = {}) {
  response.writeHead(status, {
    location,
    "content-length": 0,
    ...headers
  });
  response.end();
}

function isLocalRequest(request) {
  const address = request.socket.remoteAddress;
  return address === "::1" || address === "127.0.0.1" || address === "::ffff:127.0.0.1";
}

function parseCookies(header = "") {
  return String(header || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const splitAt = item.indexOf("=");
      if (splitAt === -1) return cookies;
      const key = item.slice(0, splitAt).trim();
      const value = item.slice(splitAt + 1).trim();
      if (!key) return cookies;
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function requestAdminToken(request, url) {
  const headerToken = request.headers["x-ai-team-admin-token"];
  if (typeof headerToken === "string" && headerToken) return { token: headerToken, source: "header" };
  const queryToken = url?.searchParams?.get("token") || url?.searchParams?.get("admin_token");
  if (queryToken) return { token: queryToken, source: "query" };
  const cookieToken = parseCookies(request.headers.cookie)[DASHBOARD_AUTH_COOKIE];
  if (cookieToken) return { token: cookieToken, source: "cookie" };
  return { token: undefined, source: undefined };
}

export function dashboardAccessState(request, config = {}, url) {
  const requiresToken = true;
  const expectedToken = effectiveDashboardAdminToken(config);
  const { token, source } = requestAdminToken(request, url);
  return {
    requiresToken,
    authorized: Boolean(token && token === expectedToken),
    tokenSource: source
  };
}

function dashboardCookieHeader(token, request) {
  const secure = request.socket.encrypted || request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${DASHBOARD_AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

function dashboardAuthHeaders(request, config, url) {
  const access = dashboardAccessState(request, config, url);
  if (!access.authorized || access.tokenSource !== "query") return {};
  return { "set-cookie": dashboardCookieHeader(effectiveDashboardAdminToken(config), request) };
}

function safeDashboardNext(value = DASHBOARD_PATH) {
  try {
    const url = new URL(value || DASHBOARD_PATH, "http://ai-team.local");
    if (url.origin !== "http://ai-team.local") return DASHBOARD_PATH;
    if (![DASHBOARD_PATH, ARCHITECTURE_PATH].includes(url.pathname)) return DASHBOARD_PATH;
    url.searchParams.delete("token");
    url.searchParams.delete("admin_token");
    const query = url.searchParams.toString();
    return url.pathname + (query ? `?${query}` : "") + url.hash;
  } catch {
    return DASHBOARD_PATH;
  }
}

function dashboardLoginLocation(url) {
  const next = safeDashboardNext(`${url.pathname}${url.search}${url.hash}`);
  return `${DASHBOARD_LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

function requireAdmin(request, config) {
  if (isLocalRequest(request)) return;
  const token = requestAdminToken(request).token;
  if (token === effectiveDashboardAdminToken(config)) return;
  const error = new Error("admin token required");
  error.status = 403;
  throw error;
}

const DASHBOARD_DEFAULT_CHANNEL = {
  channel: "dashboard",
  source: "dashboard",
  transport: "http_api",
  threadId: "dashboard",
  userId: "dashboard",
  userName: "Dashboard"
};

function dashboardDefaultSessionId(channel = DASHBOARD_DEFAULT_CHANNEL) {
  return sessionKeyFor({
    agentRole: ROLES.CEO,
    channel: channel.channel,
    threadId: channel.threadId,
    userId: channel.userId
  });
}

function dashboardEventId() {
  return `dashboard_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAudioInput(audio = {}) {
  if (!audio || typeof audio !== "object" || Array.isArray(audio)) return undefined;
  if (!Object.keys(audio).length) return undefined;
  const name = String(audio.name || audio.fileName || "audio").trim().slice(0, 220);
  const mimeType = String(audio.mimeType || audio.type || "").trim().slice(0, 120);
  const size = Number(audio.size || audio.bytes || 0);
  if (!name && !mimeType && !Number.isFinite(size)) return undefined;
  return {
    name: name || "audio",
    mimeType: mimeType || undefined,
    size: Number.isFinite(size) && size > 0 ? size : undefined,
    hasData: typeof audio.dataUrl === "string" && audio.dataUrl.startsWith("data:"),
    transcript: String(audio.transcript || audio.text || "").trim() || undefined
  };
}

function dashboardDefaultChannelText(body = {}) {
  const text = String(body.text || "").trim();
  const audio = normalizeAudioInput(body.audio);
  if (!audio) return { text, displayText: text };
  const audioLines = [
    "用户在 Dashboard 默认渠道上传了一段音频，希望 CEO 先总结成一个大的意图，再判断是否需要创建 TeamEngine Intent。",
    `音频文件：${audio.name}`,
    audio.mimeType ? `音频类型：${audio.mimeType}` : undefined,
    audio.size ? `音频大小：${audio.size} bytes` : undefined,
    audio.hasData ? "音频数据已随请求上传；如果当前 CEO 运行器不能直接读取音频，请基于可读转写/说明继续推进。" : undefined,
    audio.transcript ? `音频转写或说明：\n${audio.transcript}` : undefined,
    text ? `用户补充说明：\n${text}` : undefined,
    !audio.transcript && !text ? "当前消息没有可读转写；如果你无法直接读取音频，请先自然回复用户，要求补充音频要点或转写。" : undefined,
    "如果信息足够，请创建 Intent，并把 name 写成短标题、description 写成较完整的背景和范围，text 保持为一句可执行目标。"
  ].filter(Boolean);
  return {
    text: audioLines.join("\n\n"),
    displayText: [`[Audio] ${audio.name}`, audio.transcript || text].filter(Boolean).join("\n\n"),
    audio
  };
}

function sessionTextFromTurn(turn = {}) {
  const input = String(turn.inputText || "");
  const match = input.match(/\ntext:\s*([\s\S]*?)\n\n请做出 CEO 判断/);
  if (match) return match[1].trim();
  const fallback = input.match(/\ntext:\s*([\s\S]*)$/);
  return fallback ? fallback[1].trim() : "";
}

function sessionUserIdFromTurn(turn = {}) {
  const match = String(turn.inputText || "").match(/\nuserId:\s*([^\n]+)/);
  return match ? match[1].trim() : undefined;
}

function sessionMessages(session = {}, skipTraceIds = new Set()) {
  return (session.recentTurns || [])
    .filter((turn) => !turn.traceId || !skipTraceIds.has(turn.traceId))
    .flatMap((turn) => {
      const userText = sessionTextFromTurn(turn);
      const agentText = String(turn.finalText || "").trim();
      return [
        userText ? {
          role: "user",
          text: userText,
          at: turn.completedAt,
          traceId: turn.traceId,
          source: "session"
        } : undefined,
        agentText ? {
          role: "agent",
          text: agentText,
          at: turn.completedAt,
          traceId: turn.traceId,
          source: "session"
        } : undefined
      ].filter(Boolean);
    });
}

function dashboardDefaultMessages(deliveries = [], channel = DASHBOARD_DEFAULT_CHANNEL, session) {
  const deliveryMessages = [...deliveries]
    .filter((delivery) =>
      delivery.channel === channel.channel &&
      delivery.threadId === channel.threadId &&
      delivery.userId === channel.userId
    )
    .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")))
    .flatMap((delivery) => {
      const userText = String(delivery.displayText || delivery.text || "").trim();
      const agentText = String(delivery.finalText || delivery.reply?.message || delivery.reply?.text || "").trim();
      return [
        userText ? {
          role: "user",
          text: userText,
          at: delivery.createdAt,
          eventId: delivery.eventId,
          deliveryId: delivery.id,
          traceId: delivery.traceId,
          status: delivery.status
        } : undefined,
        agentText ? {
          role: "agent",
          text: agentText,
          at: delivery.completedAt || delivery.updatedAt,
          eventId: delivery.eventId,
          deliveryId: delivery.id,
          traceId: delivery.traceId,
          status: delivery.status,
          intentId: delivery.intentId
        } : undefined
      ].filter(Boolean);
    });
  const deliveryTraceIds = new Set(deliveryMessages.map((message) => message.traceId).filter(Boolean));
  return [
    ...sessionMessages(session, deliveryTraceIds),
    ...deliveryMessages
  ].sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));
}

async function dashboardCeoStores(agentRuntime) {
  if (!agentRuntime?.profileForRole || !agentRuntime?.storesForProfile) return {};
  if (agentRuntime.agentConfigStore) {
    const readAgent = agentRuntime.agentConfigStore.getExisting || agentRuntime.agentConfigStore.get;
    if (typeof readAgent === "function") {
      const profile = await readAgent.call(agentRuntime.agentConfigStore, ROLES.CEO);
      if (!profile) return {};
      return {
        profile,
        stores: agentRuntime.storesForProfile(profile, profile?.name || ROLES.CEO)
      };
    }
  }
  const profile = await agentRuntime.profileForRole(ROLES.CEO);
  return {
    profile,
    stores: agentRuntime.storesForProfile(profile, profile?.name || ROLES.CEO)
  };
}

function latestFeishuPersonalSession(sessions = []) {
  return [...sessions]
    .filter((session) => {
      const id = String(session.id || "");
      return id.startsWith(`${ROLES.CEO}:feishu:p2p:`) || id.startsWith(`${ROLES.CEO}-feishu-p2p-`);
    })
    .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))[0];
}

function channelFromFeishuSession(session) {
  if (!session?.id) return undefined;
  const id = String(session.id);
  const rawPrefix = `${ROLES.CEO}:feishu:`;
  const legacyPrefix = `${ROLES.CEO}-feishu-`;
  let threadId;
  if (id.startsWith(rawPrefix)) {
    threadId = id.slice(rawPrefix.length);
  } else if (id.startsWith(legacyPrefix)) {
    const legacyPeer = id.slice(legacyPrefix.length);
    threadId = legacyPeer.startsWith("p2p-") ? `p2p:${legacyPeer.slice(4)}` : legacyPeer;
  }
  if (!threadId) return undefined;
  const latestTurn = [...(session.recentTurns || [])].reverse().find(Boolean);
  const userId = sessionUserIdFromTurn(latestTurn) || (threadId.startsWith("p2p:") ? threadId.slice(4) : undefined) || "unknown";
  const sessionId = sessionKeyFor({ agentRole: ROLES.CEO, channel: "feishu", threadId, userId });
  return {
    channel: "feishu",
    source: "dashboard_ceo_chat",
    transport: "http_api",
    threadId,
    userId,
    userName: "Dashboard",
    sessionId,
    syncSource: "feishu_personal"
  };
}

async function resolveDashboardDefaultChannel({ agentRuntime } = {}) {
  const { stores } = await dashboardCeoStores(agentRuntime);
  const sessions = stores?.sessions?.list ? await stores.sessions.list() : [];
  const feishuSession = latestFeishuPersonalSession(sessions);
  return {
    channel: channelFromFeishuSession(feishuSession) || {
      ...DASHBOARD_DEFAULT_CHANNEL,
      sessionId: dashboardDefaultSessionId(DASHBOARD_DEFAULT_CHANNEL),
      syncSource: "dashboard"
    },
    session: feishuSession
  };
}

async function dashboardDefaultChannelState(engine, agentRuntime) {
  const resolved = await resolveDashboardDefaultChannel({ agentRuntime });
  const deliveries = engine?.store?.listChannelDeliveries ? await engine.store.listChannelDeliveries() : [];
  return {
    ...resolved.channel,
    messages: dashboardDefaultMessages(deliveries, resolved.channel, resolved.session)
  };
}

async function resetDashboardCeoRuntimeContext({ engine, agentRuntime }) {
  const resolved = await resolveDashboardDefaultChannel({ agentRuntime });
  const channel = resolved.channel;
  const sessionId = channel.sessionId || dashboardDefaultSessionId(channel);
  const deliveryReset = engine?.store?.deleteChannelDeliveriesFor
    ? await engine.store.deleteChannelDeliveriesFor({
        channel: channel.channel,
        threadId: channel.threadId,
        userId: channel.userId
      })
    : { deleted: 0 };
  const { stores } = await dashboardCeoStores(agentRuntime);
  const sessionReset = stores?.sessions?.clearDynamicContext
    ? await stores.sessions.clearDynamicContext(sessionId)
    : {
        sessionId,
        clearedRollingSummary: false,
        clearedTurns: 0,
        clearedTraceIds: 0,
        skipped: true
      };
  const memoryReset = stores?.memory?.clearSessionEvents
    ? await stores.memory.clearSessionEvents(sessionId)
    : {
        sessionId,
        clearedEvents: 0,
        skipped: true
      };
  return {
    sessionId,
    deliveryReset,
    sessionReset,
    memoryReset,
    resetDynamicChatContext: true,
    preservedStaticContext: true
  };
}

function dashboardConfigForRequest(config, request) {
  return { ...config, localMode: isLocalRequest(request) };
}

const EMPTY_ENGINE_MODEL = Object.freeze({
  projects: [],
  intents: [],
  tasks: [],
  runs: [],
  artifacts: [],
  sessions: [],
  feedback: []
});

async function engineHealth(engine) {
  if (!engine) return { ok: false, available: false };
  if (typeof engine.health === "function") return engine.health();
  return { ok: false, available: false };
}

async function engineReadModel(engine) {
  if (!engine) return { ...EMPTY_ENGINE_MODEL };
  if (typeof engine.readModel === "function") return engine.readModel();
  if (typeof engine.store?.readModel === "function") return engine.store.readModel();
  return { ...EMPTY_ENGINE_MODEL };
}

function runsForIntent(model, intentId, tasks) {
  const taskIds = new Set(tasks.map((task) => task.id));
  return model.runs.filter((run) => run.entityId === intentId || taskIds.has(run.entityId));
}

function safeFileSegment(value, label = "path segment") {
  const segment = String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!segment || segment === "." || segment === "..") throw new Error(`invalid ${label}: ${value}`);
  return segment;
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function runAgentPaths(run = {}, agentConfigStore) {
  if (!run.agentRole || !agentConfigStore?.pathsFor) return {};
  const readAgent = agentConfigStore.getExisting || agentConfigStore.get;
  const agent = readAgent ? await readAgent.call(agentConfigStore, run.agentRole).catch(() => undefined) : undefined;
  return agentConfigStore.pathsFor(run.agentRole, { name: agent?.name || run.agentConfigSnapshot?.name });
}

function modelCallErrors(trace = {}, call = {}, index = 0, calls = []) {
  const ownErrors = [
    ...(Array.isArray(call.errors) ? call.errors : []),
    call.error
  ].filter(Boolean);
  const traceErrors = index === calls.length - 1 && Array.isArray(trace.errors) ? trace.errors : [];
  return [...ownErrors, ...traceErrors];
}

function hasModelMessageContent(message) {
  if (!message || typeof message !== "object") return message !== undefined && message !== null && message !== "";
  const content = message.content;
  if (typeof content === "string") return content.trim().length > 0;
  if (Array.isArray(content)) return content.length > 0;
  return content !== undefined && content !== null;
}

function modelCallResponseActual(call = {}) {
  if (hasModelMessageContent(call.message)) return call.message;
  const rawSummary = codexAppServerSummaryFromRaw(call.raw);
  if (rawSummary.assistantText) return rawSummary.assistantText;
  if (call.text !== undefined) return call.text;
  return call.message;
}

function parseJsonLines(value) {
  if (typeof value !== "string") return [];
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);
}

function codexContentText(content = []) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (["text", "input_text", "output_text"].includes(item?.type) && item.text) return item.text;
      return "";
    })
    .filter(Boolean)
    .join("");
}

function codexAppServerSummaryFromRaw(raw) {
  const events = parseJsonLines(raw);
  const contextMessages = [];
  const assistantDeltas = [];
  let prefixCache;
  for (const event of events) {
    const item = event.params?.item;
    if (item?.type === "userMessage" && (event.method === "item/started" || event.method === "item/completed")) {
      const content = codexContentText(item.content);
      if (content && !contextMessages.some((message) => message.content === content)) {
        contextMessages.push({ role: "user", content, source: "codex_app_server.userMessage" });
      }
    }
    if (event.method === "item/agentMessage/delta") {
      const delta = event.params?.delta;
      if (delta) assistantDeltas.push(delta);
    }
    if (event.method === "item/completed" && item?.type === "agentMessage" && item.text) {
      assistantDeltas.length = 0;
      assistantDeltas.push(item.text);
    }
    if (event.method === "thread/tokenUsage/updated") {
      const usage = event.params?.tokenUsage || {};
      const last = usage.last || usage.total || {};
      const inputTokens = last.inputTokens ?? last.promptTokens ?? usage.total?.inputTokens ?? usage.total?.promptTokens;
      const cachedInputTokens = last.cachedInputTokens ?? last.cachedTokens ?? usage.total?.cachedInputTokens ?? usage.total?.cachedTokens;
      prefixCache = {
        inputTokens,
        cachedInputTokens,
        modelContextWindow: usage.modelContextWindow,
        cacheHit: Number(cachedInputTokens || 0) > 0,
        source: "codex_app_server.tokenUsage"
      };
    }
  }
  return {
    contextMessages,
    assistantText: assistantDeltas.join("").trim(),
    prefixCache
  };
}

function submittedMessageContent(message = {}) {
  if (typeof message.content === "string") return message.content;
  return codexContentText(message.content) || (message.content ? JSON.stringify(message.content, null, 2) : "");
}

function submittedMessageSource(content = "", index = 0) {
  const headings = String(content || "").match(/^##\s+([^\n]+)/gm) || [];
  if (headings.length > 1) return "prompt bundle";
  if (headings.length === 1) return headings[0].replace(/^##\s+/, "").trim();
  return `message ${index + 1}`;
}

function submittedMessagesForContext(messages = []) {
  const contextMessages = (Array.isArray(messages) ? messages : [])
    .map((message, index) => {
      const content = submittedMessageContent(message);
      return {
        role: message.role || "user",
        content,
        source: submittedMessageSource(content, index)
      };
    })
    .filter((message) => message.content);
  return mergeAdjacentContextMessages(contextMessages);
}

function mergeAdjacentContextMessages(messages = []) {
  const merged = [];
  for (const message of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) {
      last.content = [last.content, message.content].filter(Boolean).join("\n\n");
      last.source = "prompt bundle";
      continue;
    }
    merged.push({ ...message });
  }
  return merged;
}

function messagesIncludeTextToolProtocol(messages = []) {
  return (Array.isArray(messages) ? messages : []).some((message) =>
    /(^|\n)##\s*tool\.protocol\b|(^|\n)##\s*Tool Protocol\b|<tool_calls>/i.test(String(message?.content || ""))
  );
}

function prefixCacheFromUsage(usage = {}) {
  const details = usage.prompt_tokens_details || usage.input_tokens_details || {};
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens;
  const cachedInputTokens = details.cached_tokens ?? details.cachedInputTokens ?? usage.cachedInputTokens ?? usage.cached_input_tokens;
  if (inputTokens === undefined && cachedInputTokens === undefined) return undefined;
  return {
    inputTokens,
    cachedInputTokens,
    cacheHit: Number(cachedInputTokens || 0) > 0,
    source: "model_usage"
  };
}

function llmTurnsForTrace(trace = {}) {
  const calls = Array.isArray(trace.modelCalls) ? trace.modelCalls : [];
  return calls.map((call = {}, index) => {
    const rawSummary = codexAppServerSummaryFromRaw(call.raw);
    const submittedMessages = submittedMessagesForContext(call.submittedMessages);
    const contextMessages = submittedMessages.length ? submittedMessages : rawSummary.contextMessages;
    const contextTools = messagesIncludeTextToolProtocol(contextMessages) ? [] : (call.submittedTools || []);
    return {
      round: call.round ?? index,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      context: {
        messages: contextMessages,
        tools: contextTools,
        prefixCache: prefixCacheFromUsage(call.usage) || rawSummary.prefixCache
      },
      request: {
        messages: call.submittedMessages,
        tools: call.submittedTools,
        messageCount: call.messageCount,
        toolCount: call.toolCount
      },
      response: {
        message: call.message,
        raw: call.raw,
        usage: call.usage,
        actual: modelCallResponseActual(call)
      },
      streamText: call.streamText,
      streamEvents: call.streamEvents || [],
      toolCalls: call.toolCalls || [],
      errors: modelCallErrors(trace, call, index, calls)
    };
  });
}

async function engineRunDetail({ engine, agentConfigStore, runId }) {
  const model = await engineReadModel(engine);
  const run = engine?.store?.getRun ? await engine.store.getRun(runId) : model.runs.find((item) => item.id === runId);
  if (!run) return undefined;
  const task = run.entityType === "task"
    ? model.tasks.find((item) => item.id === run.entityId)
    : undefined;
  const intentId = run.entityType === "intent" ? run.entityId : task?.intentId;
  const intent = intentId ? model.intents.find((item) => item.id === intentId) : undefined;
  const artifacts = model.artifacts.filter((artifact) =>
    artifact.entityId === run.entityId ||
    (run.artifactIds || []).includes(artifact.id) ||
    (intentId && artifact.intentId === intentId && artifact.role === run.agentRole)
  );
  const paths = await runAgentPaths(run, agentConfigStore);
  const traceId = run.agentTraceId;
  const traceFile = traceId && paths.tracesDir ? path.join(paths.tracesDir, `${safeFileSegment(traceId, "trace id")}.json`) : undefined;
  const sessionFile = run.sessionKey && paths.sessionsDir ? path.join(paths.sessionsDir, `${safeFileSegment(run.sessionKey, "session id")}.json`) : undefined;
  const [trace, session] = await Promise.all([
    traceFile ? readJsonIfExists(traceFile) : undefined,
    sessionFile ? readJsonIfExists(sessionFile) : undefined
  ]);
  return {
    run,
    intent,
    task,
    artifacts,
    trace,
    llmTurns: llmTurnsForTrace(trace),
    session,
    files: {
      trace: traceFile,
      session: sessionFile
    }
  };
}

function agentPatchWithoutRouting(input = {}) {
  const { wakeRules, ...agentPatch } = input;
  return agentPatch;
}

async function attachAgentWakeRules(agent, routingStore) {
  if (!agent || !routingStore?.get) return agent;
  const routing = await routingStore.get(agent.role);
  return { ...agent, wakeRules: routing.wakeRules };
}

function hiddenPublicToolIds(toolRegistry) {
  return new Set((toolRegistry?.list ? toolRegistry.list() : [])
    .filter((tool) => tool?.implicit === true)
    .map((tool) => tool.id));
}

function publicToolList(toolRegistry) {
  return (toolRegistry?.list ? toolRegistry.list() : []).filter((tool) => tool?.implicit !== true);
}

function publicAgentConfig(agent, toolRegistry) {
  if (!agent) return agent;
  const hiddenToolIds = hiddenPublicToolIds(toolRegistry);
  return {
    ...agent,
    tools: (agent.tools || []).filter((toolId) => !hiddenToolIds.has(toolId))
  };
}

async function attachPublicAgentWakeRules(agent, routingStore, toolRegistry) {
  return publicAgentConfig(await attachAgentWakeRules(agent, routingStore), toolRegistry);
}

async function listAgentsWithWakeRules(agentConfigStore, routingStore, toolRegistry) {
  const agents = agentConfigStore?.list ? await agentConfigStore.list() : [];
  return Promise.all(agents.map((agent) => attachPublicAgentWakeRules(agent, routingStore, toolRegistry)));
}

function fallbackModelProviders(config = {}) {
  const providerId = config.provider?.id || config.runner?.type;
  return {
    defaultProviderId: providerId && providerId !== "mock" ? providerId : undefined,
    providers: []
  };
}

async function saveRoutingPatch(role, body, routingStore) {
  if (body?.wakeRules === undefined || !routingStore?.update) return undefined;
  return routingStore.update(role, body.wakeRules);
}

async function resolveEngineFeedback(engine, feedbackId, body = {}) {
  if (!feedbackId) {
    const error = new Error("feedback id is required");
    error.status = 400;
    throw error;
  }
  const input = {
    entityType: "feedback",
    entityId: feedbackId,
    status: FEEDBACK_STATUS.DONE,
    agentRole: body.agentRole || ROLES.CEO,
    reason: body.reason || "dashboard marked feedback handled"
  };
  try {
    if (typeof engine?.store?.transitionEntity === "function") {
      return { feedback: await engine.store.transitionEntity(input) };
    }
    if (typeof engine?.updateFeedback === "function") {
      return { feedback: await engine.updateFeedback(feedbackId, { status: FEEDBACK_STATUS.DONE }) };
    }
  } catch (error) {
    if (/feedback not found/.test(error.message)) error.status = 404;
    throw error;
  }
  const error = new Error("engine feedback transition unavailable");
  error.status = 404;
  throw error;
}

async function deleteEngineProject(engine, projectId, body = {}) {
  if (!projectId) {
    const error = new Error("project id is required");
    error.status = 400;
    throw error;
  }
  const options = { deleteWorkspace: body.deleteWorkspace !== false };
  const deleteProject = engine?.deleteProject?.bind(engine) || engine?.store?.deleteProject?.bind(engine.store);
  if (!deleteProject) {
    const error = new Error("engine project delete unavailable");
    error.status = 404;
    throw error;
  }
  try {
    return await deleteProject(projectId, options);
  } catch (error) {
    if (/project not found/.test(error.message)) error.status = 404;
    throw error;
  }
}

export function createHttpServer({
  config,
  channels,
  logger,
  channelConfigStore,
  channelGateway,
  feishuLongConnection,
  toolExecutor,
  engine,
  memory,
  agentConfigStore,
  routingStore,
  toolRegistry,
  providerConfigStore,
  codingAgentLauncherStore,
  agentRuntime,
  provider
}) {
  const feishu = channels.get("feishu");
  const dashboardData = (request) => buildDashboardData({
    config: dashboardConfigForRequest(config, request),
    channelConfigStore,
    engine,
    memory,
    agentConfigStore,
    routingStore,
    toolRegistry,
    providerConfigStore,
    codingAgentLauncherStore
  });
  const dashboardWebSocketHub = createDashboardWebSocketHub({ buildSnapshot: dashboardData, logger });

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const apiPath = apiResourcePath(url.pathname);
      const consolePath = consoleResourcePath(url.pathname);

      if (request.method === "GET" && apiPath === "/health") {
        send(response, 200, { ok: true, service: "ai-team-agent" });
        return;
      }

      if (request.method === "GET" && apiPath === "/tasks") {
        const model = await engineReadModel(engine);
        send(response, 200, { tasks: model.intents.map(toLegacyTask), intents: model.intents });
        return;
      }

      if (request.method === "GET" && apiPath === "/feedback") {
        const model = await engineReadModel(engine);
        send(response, 200, { feedback: model.feedback, backlog: model.feedback });
        return;
      }

      if (request.method === "GET" && apiPath === "/engine/health") {
        send(response, 200, await engineHealth(engine));
        return;
      }

      if (request.method === "GET" && apiPath === "/engine") {
        send(response, 200, await engineReadModel(engine));
        return;
      }

      if (request.method === "GET" && apiPath === "/engine/intents") {
        const model = await engineReadModel(engine);
        send(response, 200, { intents: model.intents });
        return;
      }

      if (request.method === "GET" && apiPath === "/engine/tasks") {
        const model = await engineReadModel(engine);
        send(response, 200, { tasks: model.tasks });
        return;
      }

      if (request.method === "GET" && apiPath === "/engine/runs") {
        const model = await engineReadModel(engine);
        send(response, 200, { runs: model.runs });
        return;
      }

      const projectDeleteMatch = apiPath?.match(/^\/engine\/projects\/([^/]+)$/);
      if (request.method === "DELETE" && projectDeleteMatch) {
        requireAdmin(request, config);
        const rawBody = await readBody(request);
        const body = rawBody ? JSON.parse(rawBody) : {};
        send(response, 200, await deleteEngineProject(engine, decodeURIComponent(projectDeleteMatch[1]), body));
        return;
      }

      const runDetailMatch = apiPath?.match(/^\/engine\/runs\/([^/]+)\/detail$/);
      if (request.method === "GET" && runDetailMatch) {
        requireAdmin(request, config);
        const detail = await engineRunDetail({
          engine,
          agentConfigStore,
          runId: decodeURIComponent(runDetailMatch[1])
        });
        if (!detail) {
          send(response, 404, { error: "run not found" });
          return;
        }
        send(response, 200, detail);
        return;
      }

      if (request.method === "GET" && apiPath === "/engine/feedback") {
        const model = await engineReadModel(engine);
        send(response, 200, { feedback: model.feedback });
        return;
      }

      const feedbackResolveMatch = apiPath?.match(/^\/engine\/feedback\/([^/]+)\/resolve$/);
      if (request.method === "POST" && feedbackResolveMatch) {
        requireAdmin(request, config);
        const body = JSON.parse(await readBody(request) || "{}");
        send(response, 200, await resolveEngineFeedback(engine, decodeURIComponent(feedbackResolveMatch[1]), body));
        return;
      }

      if (request.method === "POST" && apiPath === "/engine/retry-blocked") {
        requireAdmin(request, config);
        if (!engine?.retryBlockedWork) {
          send(response, 404, { error: "engine retry unavailable" });
          return;
        }
        const body = JSON.parse(await readBody(request) || "{}");
        send(response, 200, await engine.retryBlockedWork({
          entityType: body.entityType,
          entityId: body.entityId,
          reason: body.reason || "dashboard retry blocked work",
          agentRole: body.agentRole || "ceo_cto"
        }));
        return;
      }

      const intentDetailMatch = apiPath?.match(/^\/engine\/intents\/([^/]+)$/);
      if (request.method === "GET" && intentDetailMatch) {
        const model = await engineReadModel(engine);
        const id = decodeURIComponent(intentDetailMatch[1]);
        const intent = model.intents.find((candidate) => candidate.id === id);
        if (!intent) {
          send(response, 404, { error: "intent not found" });
          return;
        }
        const tasks = model.tasks.filter((task) => task.intentId === id);
        send(response, 200, {
          intent,
          tasks,
          runs: runsForIntent(model, id, tasks),
          artifacts: model.artifacts.filter((artifact) => artifact.intentId === id)
        });
        return;
      }

      if (request.method === "GET" && apiPath === "/dashboard") {
        if (!dashboardAccessState(request, config, url).authorized) {
          send(response, 403, { error: "admin token required" });
          return;
        }
        send(response, 200, await dashboardData(request));
        return;
      }

      if (request.method === "GET" && consolePath === "/dashboard/login") {
        const next = safeDashboardNext(url.searchParams.get("next") || DASHBOARD_PATH);
        if (dashboardAccessState(request, config, url).authorized) {
          redirect(response, next, 302, dashboardAuthHeaders(request, config, url));
          return;
        }
        sendHtml(response, 200, renderDashboardLoginPage({
          next,
          tokenMode: dashboardAdminTokenMode(config),
          error: url.searchParams.get("error") || ""
        }));
        return;
      }

      if (request.method === "POST" && consolePath === "/dashboard/login") {
        const body = new URLSearchParams(await readBody(request));
        const token = body.get("token") || "";
        const next = safeDashboardNext(body.get("next") || DASHBOARD_PATH);
        if (token === effectiveDashboardAdminToken(config)) {
          redirect(response, next, 303, { "set-cookie": dashboardCookieHeader(token, request) });
          return;
        }
        sendHtml(response, 403, renderDashboardLoginPage({
          next,
          tokenMode: dashboardAdminTokenMode(config),
          error: "Invalid admin token."
        }));
        return;
      }

      if (request.method === "GET" && consolePath === "/dashboard") {
        if (!dashboardAccessState(request, config, url).authorized) {
          redirect(response, dashboardLoginLocation(url));
          return;
        }
        const data = await dashboardData(request);
        sendHtml(response, 200, renderDashboardPage(data), dashboardAuthHeaders(request, config, url));
        return;
      }

      if (request.method === "GET" && consolePath === "/architecture") {
        if (!dashboardAccessState(request, config, url).authorized) {
          redirect(response, dashboardLoginLocation(url));
          return;
        }
        sendHtml(response, 200, renderArchitecturePage(), dashboardAuthHeaders(request, config, url));
        return;
      }

      if (request.method === "GET" && apiPath === "/channels") {
        send(response, 200, { channels: await channelConfigStore.listPublic() });
        return;
      }

      if (request.method === "GET" && apiPath === "/agents/config") {
        send(response, 200, {
          agents: await listAgentsWithWakeRules(agentConfigStore, routingStore, toolRegistry),
          tools: publicToolList(toolRegistry),
          modelProviders: providerConfigStore?.list ? await providerConfigStore.list() : undefined
        });
        return;
      }

      if (request.method === "GET" && apiPath === "/model-providers") {
        send(response, 200, providerConfigStore?.list ? await providerConfigStore.list() : fallbackModelProviders(config));
        return;
      }

      if (request.method === "POST" && apiPath === "/model-providers") {
        requireAdmin(request, config);
        if (!providerConfigStore?.updateProvider) {
          send(response, 404, { error: "provider config store unavailable" });
          return;
        }
        const body = JSON.parse(await readBody(request) || "{}");
        const updated = body.defaultProviderId
          ? await providerConfigStore.setDefault(body.defaultProviderId)
          : await providerConfigStore.updateProvider(body.provider || body);
        send(response, 200, updated);
        return;
      }

      const providerCheckMatch = apiPath?.match(/^\/model-providers\/([^/]+)\/check$/);
      if (request.method === "POST" && providerCheckMatch) {
        requireAdmin(request, config);
        if (!providerConfigStore?.check) {
          send(response, 404, { error: "provider config store unavailable" });
          return;
        }
        send(response, 200, await providerConfigStore.check(decodeURIComponent(providerCheckMatch[1])));
        return;
      }

      if (request.method === "GET" && apiPath === "/coding-agent-launchers") {
        send(response, 200, codingAgentLauncherStore?.listPublic ? await codingAgentLauncherStore.listPublic() : []);
        return;
      }

      if (request.method === "POST" && apiPath === "/coding-agent-launchers") {
        requireAdmin(request, config);
        if (!codingAgentLauncherStore?.write) {
          send(response, 404, { error: "coding agent launcher config unavailable" });
          return;
        }
        const body = JSON.parse(await readBody(request) || "{}");
        await codingAgentLauncherStore.update(body.launcher || body.launchers || body.agents || []);
        send(response, 200, await codingAgentLauncherStore.listPublic());
        return;
      }

      if (request.method === "POST" && apiPath === "/agents/config") {
        requireAdmin(request, config);
        if (!agentConfigStore?.create) {
          send(response, 404, { error: "agent config store unavailable" });
          return;
        }
        const body = JSON.parse(await readBody(request) || "{}");
        const agent = await agentConfigStore.create(agentPatchWithoutRouting(body));
        await saveRoutingPatch(agent.role, body, routingStore);
        send(response, 201, { agent: await attachPublicAgentWakeRules(agent, routingStore, toolRegistry), tools: publicToolList(toolRegistry), modelProviders: providerConfigStore?.list ? await providerConfigStore.list() : undefined });
        return;
      }

      const agentConfigMatch = apiPath?.match(/^\/agents\/config\/([^/]+)$/);
      const agentSkillMatch = apiPath?.match(/^\/agents\/config\/([^/]+)\/skills$/);
      const agentMcpToolSyncMatch = apiPath?.match(/^\/agents\/config\/([^/]+)\/mcps\/([^/]+)\/tools\/sync$/);
      const agentOneOneMatch = apiPath?.match(/^\/agents\/([^/]+)\/one-one$/);
      const agentMemoryMatch = apiPath?.match(/^\/agents\/([^/]+)\/memory$/);
      const agentContextNeedResolveMatch = apiPath?.match(/^\/agents\/([^/]+)\/context-needs\/([^/]+)\/resolve$/);
      if (request.method === "POST" && agentOneOneMatch) {
        requireAdmin(request, config);
        const role = decodeURIComponent(agentOneOneMatch[1]);
        const body = JSON.parse(await readBody(request) || "{}");
        send(response, 200, {
          reply: await runAgentOneOnOne({
            role,
            message: body.message,
            mode: body.mode,
            linkedContext: body.linkedContext,
            history: body.history || [],
            agentRuntime,
            provider,
            toolExecutor,
            config,
            logger
          })
        });
        return;
      }

      if (request.method === "POST" && agentMemoryMatch) {
        requireAdmin(request, config);
        const role = decodeURIComponent(agentMemoryMatch[1]);
        const body = JSON.parse(await readBody(request) || "{}");
        send(response, 200, {
          result: await teachAgentOneOnOneMemory({
            role,
            value: body.value || body.text || body.content,
            key: body.key,
            kind: body.kind,
            contextNeedId: body.contextNeedId,
            agentRuntime
          })
        });
        return;
      }

      if (request.method === "POST" && agentContextNeedResolveMatch) {
        requireAdmin(request, config);
        const role = decodeURIComponent(agentContextNeedResolveMatch[1]);
        const contextNeedId = decodeURIComponent(agentContextNeedResolveMatch[2]);
        const body = JSON.parse(await readBody(request) || "{}");
        send(response, 200, await resolveAgentContextNeed({
          role,
          contextNeedId,
          status: body.status,
          resolutionType: body.resolutionType,
          resolution: body.resolution,
          agentRuntime
        }));
        return;
      }

      if (request.method === "GET" && agentConfigMatch) {
        if (!agentConfigStore?.get) {
          send(response, 404, { error: "agent config store unavailable" });
          return;
        }
        const role = decodeURIComponent(agentConfigMatch[1]);
        const readAgent = agentConfigStore.getExisting || agentConfigStore.get;
        const agent = await readAgent.call(agentConfigStore, role);
        if (!agent) {
          send(response, 404, { error: `agent role not found: ${role}` });
          return;
        }
        send(response, 200, { agent: await attachPublicAgentWakeRules(agent, routingStore, toolRegistry), tools: publicToolList(toolRegistry), modelProviders: providerConfigStore?.list ? await providerConfigStore.list() : undefined });
        return;
      }

      if (request.method === "POST" && agentConfigMatch) {
        requireAdmin(request, config);
        if (!agentConfigStore?.update) {
          send(response, 404, { error: "agent config store unavailable" });
          return;
        }
        const role = decodeURIComponent(agentConfigMatch[1]);
        const body = JSON.parse(await readBody(request) || "{}");
        const agent = await agentConfigStore.update(role, agentPatchWithoutRouting(body));
        await saveRoutingPatch(role, body, routingStore);
        send(response, 200, { agent: await attachPublicAgentWakeRules(agent, routingStore, toolRegistry), tools: publicToolList(toolRegistry), modelProviders: providerConfigStore?.list ? await providerConfigStore.list() : undefined });
        return;
      }

      if (request.method === "POST" && agentMcpToolSyncMatch) {
        requireAdmin(request, config);
        if (!agentConfigStore?.syncMcpTools) {
          send(response, 404, { error: "agent MCP tool sync unavailable" });
          return;
        }
        const role = decodeURIComponent(agentMcpToolSyncMatch[1]);
        const mcpId = decodeURIComponent(agentMcpToolSyncMatch[2]);
        send(response, 200, {
          agent: await attachPublicAgentWakeRules(await agentConfigStore.syncMcpTools(role, mcpId), routingStore, toolRegistry),
          tools: publicToolList(toolRegistry),
          modelProviders: providerConfigStore?.list ? await providerConfigStore.list() : undefined
        });
        return;
      }

      if (request.method === "POST" && agentSkillMatch) {
        requireAdmin(request, config);
        if (!agentConfigStore?.installSkillFromCommand) {
          send(response, 404, { error: "agent skill installer unavailable" });
          return;
        }
        const role = decodeURIComponent(agentSkillMatch[1]);
        const body = JSON.parse(await readBody(request) || "{}");
        send(response, 200, {
          agent: await attachPublicAgentWakeRules(await agentConfigStore.installSkillFromCommand(role, body.command || body.installCommand), routingStore, toolRegistry),
          tools: publicToolList(toolRegistry),
          modelProviders: providerConfigStore?.list ? await providerConfigStore.list() : undefined
        });
        return;
      }

      if (request.method === "POST" && apiPath === "/channels/feishu/scan") {
        requireAdmin(request, config);
        const scan = await channelConfigStore.scanFeishu();
        const registration = await channelConfigStore.startFeishuRegistration();
        send(response, 200, {
          ...scan,
          registration,
          registerQrSvg: registration.qrSvg,
          registerQrUrl: registration.qrUrl
        });
        return;
      }

      if (request.method === "GET" && apiPath === "/channels/feishu/registration") {
        const id = url.searchParams.get("id");
        if (!id) {
          send(response, 400, { error: "id is required" });
          return;
        }
        const status = await channelConfigStore.getFeishuRegistrationStatus(id);
        if (status.session.status === "completed") {
          await feishuLongConnection.start();
        }
        send(response, 200, status);
        return;
      }

      if (request.method === "POST" && apiPath === "/channels/feishu/config") {
        requireAdmin(request, config);
        const body = JSON.parse(await readBody(request) || "{}");
        const channel = await channelConfigStore.configureFeishu(body);
        if (body.enabled !== false && channel.eventMode === "websocket") {
          await feishuLongConnection.start();
        }
        send(response, 200, { channel });
        return;
      }

      if (request.method === "POST" && apiPath === "/channels/feishu/test") {
        requireAdmin(request, config);
        send(response, 200, await channelConfigStore.testFeishu());
        return;
      }

      if (request.method === "GET" && apiPath === "/dashboard/default-channel") {
        if (!dashboardAccessState(request, config, url).authorized) {
          send(response, 403, { error: "admin token required" });
          return;
        }
        send(response, 200, await dashboardDefaultChannelState(engine, agentRuntime));
        return;
      }

      if (request.method === "POST" && apiPath === "/dashboard/default-channel/reset") {
        requireAdmin(request, config);
        const reset = await resetDashboardCeoRuntimeContext({ engine, agentRuntime });
        send(response, 200, {
          reset,
          ...(await dashboardDefaultChannelState(engine, agentRuntime))
        });
        return;
      }

      if (request.method === "POST" && apiPath === "/dashboard/default-channel/messages") {
        requireAdmin(request, config);
        const body = JSON.parse(await readBody(request) || "{}");
        const message = dashboardDefaultChannelText(body);
        if (!message.text) {
          send(response, 400, { error: "text or audio is required" });
          return;
        }
        const defaultChannel = await dashboardDefaultChannelState(engine, agentRuntime);
        const eventId = body.eventId || dashboardEventId();
        const dedupeKey = body.dedupeKey || `${defaultChannel.channel}:${eventId}`;
        const result = await channelGateway.deliverToCeo({
          channel: defaultChannel.channel,
          source: defaultChannel.source || "dashboard_ceo_chat",
          transport: defaultChannel.transport || "http_api",
          threadId: defaultChannel.threadId,
          userId: defaultChannel.userId,
          userName: defaultChannel.userName,
          eventId,
          dedupeKey,
          createdAt: body.createdAt,
          text: message.text,
          displayText: message.displayText,
          forceIntent: body.forceIntent === true,
          projectId: body.projectId,
          projectName: body.projectName,
          projectSlug: body.projectSlug,
          projectWorkspace: body.projectWorkspace,
          metadata: {
            ...(body.metadata || {}),
            origin: "dashboard",
            surface: "dashboard_default_channel",
            audio: message.audio
          }
        });
        send(response, 200, {
          task: result.task,
          intent: result.intent,
          created: result.created,
          directAgentTurn: result.directAgentTurn,
          finalText: result.finalText,
          reply: result.reply,
          route: "ceo_cto",
          ...(await dashboardDefaultChannelState(engine, agentRuntime))
        });
        return;
      }

      if (request.method === "POST" && apiPath === "/dashboard/intents") {
        requireAdmin(request, config);
        const body = JSON.parse(await readBody(request) || "{}");
        const text = String(body.text || "").trim();
        if (!text) {
          send(response, 400, { error: "text is required" });
          return;
        }
        const result = await channelGateway.deliverToCeo({
          channel: "dashboard",
          source: "dashboard",
          transport: "http_api",
          threadId: body.threadId || "dashboard",
          userId: body.userId || "dashboard",
          userName: body.userName || "Dashboard",
          eventId: body.eventId,
          dedupeKey: body.dedupeKey,
          createdAt: body.createdAt,
          name: body.name,
          description: body.description,
          text,
          forceIntent: true,
          projectId: body.projectId,
          projectName: body.projectName,
          projectSlug: body.projectSlug,
          projectWorkspace: body.projectWorkspace,
          replyTarget: body.replyTarget,
          metadata: { ...(body.metadata || {}), origin: "dashboard" }
        });
        send(response, result.created ? 201 : 200, {
          task: result.task,
          intent: result.intent,
          created: result.created,
          route: "ceo_cto"
        });
        return;
      }

      if (request.method === "POST" && apiPath === "/tools/invoke") {
        requireAdmin(request, config);
        const body = JSON.parse(await readBody(request) || "{}");
        if (!body.toolId) {
          send(response, 400, { error: "toolId is required" });
          return;
        }
        if (!String(body.role || "").trim()) {
          send(response, 400, { error: "role is required" });
          return;
        }
        send(response, 200, await toolExecutor.invoke({
          role: body.role,
          toolId: body.toolId,
          input: body.input || {},
          taskId: body.taskId,
          source: "http_api"
        }));
        return;
      }

      if (request.method === "POST" && apiPath === "/tasks") {
        const body = JSON.parse(await readBody(request));
        if (!body.text) {
          send(response, 400, { error: "text is required" });
          return;
        }
        const result = await channelGateway.deliverToCeo({
          channel: body.channel || "cli",
          source: "manual_http",
          transport: "http_api",
          threadId: body.threadId || body.channel || "cli",
          userId: body.userId || "http",
          userName: body.userName,
          eventId: body.eventId,
          dedupeKey: body.dedupeKey,
          createdAt: body.createdAt,
          text: body.text,
          forceIntent: true,
          workspace: body.workspace,
          projectId: body.projectId,
          projectName: body.projectName,
          projectSlug: body.projectSlug,
          projectWorkspace: body.projectWorkspace,
          replyTarget: body.replyTarget,
          metadata: body.metadata || {}
        });
        send(response, result.created ? 201 : 200, {
          task: result.task,
          intent: result.intent,
          created: result.created,
          route: "ceo_cto"
        });
        return;
      }

      if (request.method === "POST" && apiPath === "/webhooks/feishu") {
        const rawBody = await readBody(request);
        const result = await feishu.handleWebhook({
          rawBody,
          headers: request.headers
        });
        send(response, result.status, result.body);
        return;
      }

      send(response, 404, { error: "not found" });
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, "http request failed");
      send(response, error.status || 500, { error: error.message });
    }
  });

  server.on("upgrade", (request, socket) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const apiPath = apiResourcePath(url.pathname);
      if (apiPath === "/dashboard/ws") {
        if (!dashboardAccessState(request, config, url).authorized) {
          socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n");
          socket.destroy();
          return;
        }
        dashboardWebSocketHub.handleUpgrade(request, socket);
        return;
      }
    } catch (error) {
      logger.warn?.({ error: error?.message || String(error) }, "http upgrade failed");
    }
    socket.destroy();
  });

  return server;
}
