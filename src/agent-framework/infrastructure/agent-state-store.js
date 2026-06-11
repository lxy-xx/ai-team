import fs from "node:fs/promises";
import path from "node:path";
import { createId } from "../../platform/ids.js";
import { appendJsonLine, ensureDir, writeJsonFile } from "../../platform/json-file.js";
import { LongTermCandidateReview } from "../domain/memory/long-term-candidate-review.js";
import { entryText, normalizeMemoryText, stringifyMemoryValue } from "../domain/memory/memory-value.js";
import { MemoryWriteRequest } from "../domain/memory/memory-write-request.js";

function safeSegment(value, label = "path segment") {
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

function safeSlug(value) {
  const slug = String(value || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "event";
}

function cleanText(value, limit = 800) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizePriority(value) {
  const priority = cleanText(value, 40).toLowerCase();
  return ["critical", "high", "medium", "low"].includes(priority) ? priority : "medium";
}

function normalizeContextNeedStatus(value) {
  const status = cleanText(value, 40).toLowerCase();
  return ["open", "resolved", "dismissed"].includes(status) ? status : "open";
}

function publicStringMap(input = {}, limit = 160) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input)
    .map(([key, value]) => [cleanText(key, 80), cleanText(value, limit)])
    .filter(([key, value]) => key && value));
}

function normalizeContextNeedRecord({ need = {}, source = {}, now, role, agentName }) {
  const question = cleanText(need.question || need.need || need.text, 800);
  if (!question) return undefined;
  const status = normalizeContextNeedStatus(need.status);
  const createdAt = cleanText(need.createdAt, 80) || now.toISOString();
  return {
    id: cleanText(need.id, 120) || createId("need"),
    status,
    priority: normalizePriority(need.priority),
    category: cleanText(need.category || need.type || "context", 80) || "context",
    question,
    whyItMatters: cleanText(need.whyItMatters || need.reason || need.impact, 1000),
    suggestedMemoryKind: cleanText(need.suggestedMemoryKind || need.memoryKind, 80) || undefined,
    relatedIntentId: cleanText(need.relatedIntentId || need.intentId || source.linkedContext?.intentId, 160) || undefined,
    relatedTaskId: cleanText(need.relatedTaskId || need.taskId || source.linkedContext?.taskId, 160) || undefined,
    role,
    agentName,
    source: {
      mode: cleanText(source.mode, 80) || undefined,
      linkedContext: publicStringMap(source.linkedContext),
      coachingRecordId: cleanText(source.coachingRecordId, 160) || undefined,
      sessionId: cleanText(source.sessionId, 160) || undefined,
      traceId: cleanText(source.traceId, 160) || undefined
    },
    createdAt,
    operations: [{
      type: "created",
      at: createdAt,
      actor: cleanText(source.actor, 80) || "agent",
      toStatus: status,
      reason: cleanText(need.whyItMatters || need.reason || need.impact, 500) || undefined
    }]
  };
}

function contextNeedRank(need = {}) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[need.priority] ?? 2;
}

function contextNeedResolution(input = {}, status = "resolved", now) {
  return {
    type: cleanText(input.resolutionType || status, 80) || status,
    text: cleanText(input.resolution, 1200) || undefined,
    memoryId: cleanText(input.memoryId, 160) || undefined,
    actor: cleanText(input.actor, 80) || "dashboard",
    at: now
  };
}

function contextNeedOperation({ type, at, actor, fromStatus, toStatus, reason, resolutionType, memoryId }) {
  return Object.fromEntries(Object.entries({
    type,
    at,
    actor: cleanText(actor, 80) || "dashboard",
    fromStatus,
    toStatus,
    reason: cleanText(reason, 1000) || undefined,
    resolutionType: cleanText(resolutionType, 80) || undefined,
    memoryId: cleanText(memoryId, 160) || undefined
  }).filter(([, value]) => value !== undefined && value !== ""));
}

function utcFileStamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function readJsonIfExists(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readLinesIfExists(file) {
  try {
    return (await fs.readFile(file, "utf8")).split("\n").filter((line) => line.trim());
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function listFiles(dir, suffix) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && (!suffix || entry.name.endsWith(suffix)))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function eventMarkdown({ title, now, agentName, sessionId, traceId, summary, decisions = [], sideEffects = [], followUps = [] }) {
  const lines = [
    `# ${title}`,
    "",
    `Time: ${now.toISOString()}`,
    `Agent: ${agentName}`,
    `Session: ${sessionId || ""}`,
    `Trace: ${traceId || ""}`,
    "",
    "## Summary",
    summary || "",
    "",
    "## Important Decisions",
    decisions.length ? decisions.map((item) => `- ${item}`).join("\n") : "None recorded.",
    "",
    "## Side Effects",
    sideEffects.length ? sideEffects.map((item) => `- ${item}`).join("\n") : "None recorded.",
    "",
    "## Follow-ups",
    followUps.length ? followUps.map((item) => `- ${item}`).join("\n") : "None recorded.",
    ""
  ];
  return lines.join("\n");
}

function textScore(query, text) {
  const tokens = String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9\u3400-\u9fff]+/u)
    .filter((token) => token.length > 1);
  if (!tokens.length) return 1;
  const haystack = String(text || "").toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? token.length : 0), 0);
}

function longTermDedupeKey(entry = {}) {
  const key = entry.key ? String(entry.key) : "";
  const text = normalizeMemoryText(entryText(entry));
  const value = normalizeMemoryText(stringifyMemoryValue(entry.value ?? entry.text));
  return `${key}\n${text}\n${value}`;
}

function dedupeLongTermEntries(entries = []) {
  const seen = new Set();
  const deduped = [];
  for (const entry of entries) {
    const key = longTermDedupeKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function compactSessionTurn(turn) {
  return {
    traceId: turn.traceId,
    inputText: String(turn.inputText || ""),
    finalText: String(turn.finalText || ""),
    promptMessages: normalizePromptMessages(turn.promptMessages),
    toolResults: (turn.toolResults || []).map((tool) => ({
      toolId: tool.toolId,
      status: tool.status,
      summary: String(tool.summary || "")
    })),
    completedAt: turn.completedAt
  };
}

function normalizeMessageContent(message = {}) {
  if (!Object.hasOwn(message, "content")) return "";
  const content = message.content;
  if (typeof content === "string" || content === null) return content;
  return JSON.stringify(content);
}

function normalizePromptMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && typeof message === "object")
    .map((message) => {
      const normalized = {
        role: String(message.role || "user"),
        content: normalizeMessageContent(message)
      };
      if (message.tool_call_id) normalized.tool_call_id = String(message.tool_call_id);
      if (Array.isArray(message.tool_calls)) normalized.tool_calls = message.tool_calls;
      return normalized;
    });
}

function compactSessionFork(input = {}, now) {
  const seedMessages = normalizePromptMessages(input.seedMessages);
  return {
    id: input.id || createId("fork"),
    source: "memory",
    systemPromptOwner: "agent_runtime",
    createdAt: input.createdAt || now,
    createdByTraceId: input.traceId,
    seedMessages,
    seedMessageCount: seedMessages.length,
    memorySeed: {
      longTermFactCount: Number(input.longTermFactCount || 0),
      contextNeedCount: Number(input.contextNeedCount || 0),
      hasRecentSummary: Boolean(input.hasRecentSummary)
    }
  };
}

function compactSessionEvent(event = {}) {
  return Object.fromEntries(Object.entries({
    id: event.id,
    type: event.type,
    turnNumber: event.turnNumber,
    traceId: event.traceId,
    inputText: event.inputText,
    finalText: event.finalText,
    toolId: event.toolId,
    status: event.status,
    sequence: event.sequence,
    messages: normalizePromptMessages(event.messages),
    compressible: event.compressible,
    compressionReason: event.compressionReason,
    createdAt: event.createdAt
  }).filter(([, value]) => value !== undefined));
}

const SESSION_EVENT_ORDER = {
  user_query: 0,
  assistant_tool_call: 1,
  tool_result: 2,
  assistant_response: 3
};

function eventsForTurn(turn, { turnNumber, completedAt }) {
  const events = [];
  let sequence = 0;
  const traceId = turn.traceId;
  const userMessages = normalizePromptMessages(turn.userMessages);
  if (userMessages.length) {
    events.push(compactSessionEvent({
      id: `turn_${turnNumber}_user_query`,
      type: "user_query",
      turnNumber,
      traceId,
      inputText: String(turn.inputText || ""),
      messages: userMessages,
      sequence: sequence += 1,
      createdAt: completedAt
    }));
  }
  const toolLoopMessages = normalizePromptMessages(turn.toolLoopMessages);
  if (toolLoopMessages.length) {
    for (const [index, message] of toolLoopMessages.entries()) {
      const isToolResult = message.role === "tool";
      events.push(compactSessionEvent({
        id: `turn_${turnNumber}_${isToolResult ? "tool_result" : "assistant_tool_call"}_${index + 1}`,
        type: isToolResult ? "tool_result" : "assistant_tool_call",
        turnNumber,
        traceId,
        messages: [message],
        sequence: sequence += 1,
        createdAt: completedAt
      }));
    }
  } else {
    for (const [index, message] of normalizePromptMessages(turn.assistantToolCallMessages).entries()) {
      events.push(compactSessionEvent({
        id: `turn_${turnNumber}_assistant_tool_call_${index + 1}`,
        type: "assistant_tool_call",
        turnNumber,
        traceId,
        messages: [message],
        sequence: sequence += 1,
        createdAt: completedAt
      }));
    }
    for (const [index, tool] of (turn.toolEvents || []).entries()) {
      events.push(compactSessionEvent({
        id: `turn_${turnNumber}_tool_result_${index + 1}`,
        type: "tool_result",
        turnNumber,
        traceId,
        toolId: tool.toolId,
        status: tool.status,
        messages: tool.messages,
        sequence: sequence += 1,
        createdAt: completedAt
      }));
    }
  }
  const assistantMessages = normalizePromptMessages(turn.assistantMessages);
  if (assistantMessages.length) {
    events.push(compactSessionEvent({
      id: `turn_${turnNumber}_assistant_response`,
      type: "assistant_response",
      turnNumber,
      traceId,
      finalText: String(turn.finalText || ""),
      messages: assistantMessages,
      sequence: sequence += 1,
      createdAt: completedAt
    }));
  }
  return events;
}

function withCompressionPolicy(events = [], { coveredEventIds = [] } = {}) {
  const covered = new Set(coveredEventIds);
  const nextEvents = events.map((event) => ({ ...event }));
  const userEvents = nextEvents
    .filter((event) => event.type === "user_query")
    .sort((left, right) => Number(left.turnNumber || 0) - Number(right.turnNumber || 0));
  const firstUserId = userEvents[0]?.id;
  const latestUserId = userEvents[userEvents.length - 1]?.id;
  const latestUserTurnNumber = Number(userEvents[userEvents.length - 1]?.turnNumber || 0);
  const protectedEventIds = new Set([firstUserId, latestUserId].filter(Boolean));
  const eligibleEventIds = [];

  for (const event of nextEvents) {
    if (covered.has(event.id)) {
      event.compressible = false;
      event.compressionReason = "already_compressed";
      continue;
    }
    if (event.type !== "user_query") {
      const turnNumber = Number(event.turnNumber || 0);
      event.compressible = turnNumber > 0 && turnNumber < latestUserTurnNumber;
      event.compressionReason = event.compressible ? "session_middle_history" : "session_boundary_history";
      if (event.compressible) eligibleEventIds.push(event.id);
      continue;
    }
    if (event.id === firstUserId) {
      event.compressible = false;
      event.compressionReason = "first_user_query";
      continue;
    }
    if (event.id === latestUserId) {
      event.compressible = false;
      event.compressionReason = "latest_user_query";
      continue;
    }
    event.compressible = true;
    event.compressionReason = "session_middle_history";
    eligibleEventIds.push(event.id);
  }

  return {
    events: nextEvents,
    compression: {
      owner: "session",
      status: covered.size ? "compressed" : "not_compressed",
      protectedEventIds: [...protectedEventIds],
      eligibleEventIds,
      coveredEventIds: [...covered]
    }
  };
}

function compressedPrefixMessagesForSession(session = {}) {
  const messages = normalizePromptMessages(session.fork?.seedMessages);
  const compressions = Array.isArray(session.compressions) ? session.compressions : [];
  const compressionByEventId = new Map();
  for (const compression of compressions) {
    for (const eventId of compression.coveredEventIds || []) {
      compressionByEventId.set(eventId, compression);
    }
  }
  const emittedCompressionIds = new Set();
  const events = (session.events || [])
    .map(compactSessionEvent)
    .sort((left, right) => {
      const turnOrder = Number(left.turnNumber || 0) - Number(right.turnNumber || 0);
      if (turnOrder !== 0) return turnOrder;
      const sequenceOrder = Number(left.sequence || 0) - Number(right.sequence || 0);
      if (sequenceOrder !== 0) return sequenceOrder;
      return (SESSION_EVENT_ORDER[left.type] ?? 99) - (SESSION_EVENT_ORDER[right.type] ?? 99);
    });

  for (const event of events) {
    const compression = compressionByEventId.get(event.id);
    if (compression) {
      if (!emittedCompressionIds.has(compression.id)) {
        messages.push(...normalizePromptMessages([compression.summaryMessage]));
        emittedCompressionIds.add(compression.id);
      }
      continue;
    }
    messages.push(...normalizePromptMessages(event.messages));
  }
  return messages;
}

export class AgentSessionStore {
  constructor({ agentDir, agentName, role, clock = () => new Date(), compressSession, compressionMinEligibleEvents = Infinity, compressionMinEligibleChars = Infinity }) {
    this.agentDir = agentDir;
    this.agentName = agentName;
    this.role = role;
    this.clock = clock;
    this.compressSession = compressSession;
    this.compressionMinEligibleEvents = Number.isFinite(Number(compressionMinEligibleEvents))
      ? Number(compressionMinEligibleEvents)
      : Infinity;
    this.compressionMinEligibleChars = Number.isFinite(Number(compressionMinEligibleChars))
      ? Number(compressionMinEligibleChars)
      : Infinity;
    this.dir = path.join(agentDir, "memory", "sessions");
  }

  sessionPath(sessionId) {
    return path.join(this.dir, `${safeSegment(sessionId, "session id")}.json`);
  }

  async loadOrCreate(sessionId) {
    await ensureDir(this.dir);
    if (sessionId) {
      const existing = await readJsonIfExists(this.sessionPath(sessionId), undefined);
      if (existing) {
        if (existing.role && this.role && existing.role !== this.role) {
          throw new Error(`session ${sessionId} belongs to role ${existing.role}`);
        }
        if (!existing.role && existing.agentName && existing.agentName !== this.agentName) {
          throw new Error(`session ${sessionId} belongs to ${existing.agentName}`);
        }
        if ((this.role && existing.role !== this.role) || (this.agentName && existing.agentName !== this.agentName)) {
          const previousAgentNames = [
            ...(Array.isArray(existing.previousAgentNames) ? existing.previousAgentNames : []),
            existing.agentName
          ].filter(Boolean);
          const migrated = {
            ...existing,
            agentName: this.agentName || existing.agentName,
            role: this.role || existing.role,
            previousAgentNames: [...new Set(previousAgentNames)]
          };
          await writeJsonFile(this.sessionPath(sessionId), migrated);
          return migrated;
        }
        return existing;
      }
    }
    const now = this.clock().toISOString();
    const id = sessionId ? String(sessionId).trim() : createId("sess");
    if (!id) throw new Error(`invalid session id: ${sessionId}`);
    const session = {
      id,
      agentName: this.agentName,
      role: this.role,
      createdAt: now,
      updatedAt: now,
      recentTurns: [],
      traceIds: []
    };
    await writeJsonFile(this.sessionPath(id), session);
    return session;
  }

  async ensureFork(sessionId, fork = {}) {
    const session = await this.loadOrCreate(sessionId);
    if (session.fork) return session;
    const now = this.clock().toISOString();
    const next = {
      ...session,
      updatedAt: now,
      fork: compactSessionFork(fork, now)
    };
    next.prefixMessages = compressedPrefixMessagesForSession(next);
    await writeJsonFile(this.sessionPath(session.id), next);
    return next;
  }

  async load(sessionId) {
    if (!sessionId) return undefined;
    await ensureDir(this.dir);
    return readJsonIfExists(this.sessionPath(sessionId), undefined);
  }

  async list() {
    await ensureDir(this.dir);
    const files = await listFiles(this.dir, ".json");
    const rows = await Promise.all(files.map((file) => readJsonIfExists(path.join(this.dir, file), undefined)));
    return rows
      .filter(Boolean)
      .sort((left, right) => String(left.updatedAt || left.createdAt || "").localeCompare(String(right.updatedAt || right.createdAt || "")));
  }

  async renderProviderMessages(sessionId, { currentTurnMessages = [], activeLoopMessages = [] } = {}) {
    const session = await this.loadOrCreate(sessionId);
    const prefixMessages = session.prefixMessages?.length
      ? normalizePromptMessages(session.prefixMessages)
      : compressedPrefixMessagesForSession(session);
    return [
      ...prefixMessages,
      ...normalizePromptMessages(currentTurnMessages),
      ...normalizePromptMessages(activeLoopMessages)
    ];
  }

  async resetSession(sessionId) {
    if (!sessionId) throw new Error("session id is required");
    await ensureDir(this.dir);
    const existing = await this.load(sessionId);
    await fs.rm(this.sessionPath(sessionId), { force: true });
    return {
      sessionId: String(sessionId),
      clearedTurns: existing?.recentTurns?.length || 0,
      clearedTraceIds: existing?.traceIds?.length || 0
    };
  }

  async clearDynamicContext(sessionId) {
    if (!sessionId) throw new Error("session id is required");
    await ensureDir(this.dir);
    const existing = await this.load(sessionId);
    if (!existing) {
      return {
        sessionId: String(sessionId),
        clearedRollingSummary: false,
        clearedTurns: 0,
        clearedTraceIds: 0,
        missing: true
      };
    }
    const { rollingSummary, ...preserved } = existing;
    const clearedTurns = existing.recentTurns?.length || 0;
    const clearedTraceIds = existing.traceIds?.length || 0;
    const next = {
      ...preserved,
      recentTurns: [],
      traceIds: [],
      updatedAt: this.clock().toISOString()
    };
    await writeJsonFile(this.sessionPath(sessionId), next);
    return {
      sessionId: String(sessionId),
      clearedRollingSummary: Boolean(rollingSummary),
      clearedTurns,
      clearedTraceIds
    };
  }

  async appendTurn(sessionId, turn) {
    const session = await this.loadOrCreate(sessionId);
    const completedAt = turn.completedAt || this.clock().toISOString();
    const turnNumber = (session.recentTurns || []).length + 1;
    const previousCompressions = Array.isArray(session.compressions) ? session.compressions : [];
    const coveredEventIds = previousCompressions.flatMap((compression) => compression.coveredEventIds || []);
    const eventState = withCompressionPolicy([
      ...(session.events || []).map(compactSessionEvent),
      ...eventsForTurn(turn, { turnNumber, completedAt })
    ], { coveredEventIds });
    let next = {
      ...session,
      updatedAt: completedAt,
      recentTurns: [...(session.recentTurns || []), compactSessionTurn({ ...turn, completedAt })],
      traceIds: [...new Set([...(session.traceIds || []), turn.traceId].filter(Boolean))],
      prefixMessages: normalizePromptMessages(session.prefixMessages),
      rollingSummary: turn.rollingSummary || session.rollingSummary,
      events: eventState.events,
      compression: eventState.compression,
      compressions: previousCompressions
    };
    next.prefixMessages = compressedPrefixMessagesForSession(next);
    next = await this.maybeCompressSession(next, { traceId: turn.traceId, completedAt });
    await writeJsonFile(this.sessionPath(session.id), next);
    return next;
  }

  async maybeCompressSession(session, { traceId, completedAt } = {}) {
    if (typeof this.compressSession !== "function") return session;
    const eligibleEventIds = session.compression?.eligibleEventIds || [];
    if (!eligibleEventIds.length || eligibleEventIds.length < this.compressionMinEligibleEvents) return session;
    const eligibleEvents = (session.events || []).filter((event) => eligibleEventIds.includes(event.id));
    if (!eligibleEvents.length) return session;
    const eligibleChars = eligibleEvents.reduce((sum, event) => sum + JSON.stringify(event).length, 0);
    if (eligibleChars < this.compressionMinEligibleChars) return session;
    const result = await this.compressSession({
      session,
      events: eligibleEvents,
      protectedEventIds: session.compression?.protectedEventIds || [],
      eligibleChars,
      traceId
    });
    const summaryText = String(result?.summary || result?.summaryMessage?.content || "").trim();
    if (!summaryText) return session;
    const compression = {
      id: result.id || createId("cmp"),
      createdAt: completedAt || this.clock().toISOString(),
      createdByTraceId: traceId,
      coveredEventIds: eligibleEventIds,
      summaryMessage: {
        role: "system",
        content: summaryText
      }
    };
    const compressions = [...(session.compressions || []), compression];
    const recomputed = withCompressionPolicy(session.events, {
      coveredEventIds: compressions.flatMap((item) => item.coveredEventIds || [])
    });
    const next = {
      ...session,
      compressions,
      events: recomputed.events,
      compression: {
        ...recomputed.compression,
        lastCompressionId: compression.id
      }
    };
    return {
      ...next,
      prefixMessages: compressedPrefixMessagesForSession(next)
    };
  }
}

export class AgentTraceStore {
  constructor({ agentDir }) {
    this.dir = path.join(agentDir, "traces");
  }

  tracePath(traceId) {
    return path.join(this.dir, `${safeSegment(traceId, "trace id")}.json`);
  }

  async write(trace) {
    await ensureDir(this.dir);
    await writeJsonFile(this.tracePath(trace.traceId), trace);
    return trace;
  }

  async get(traceId) {
    return readJsonIfExists(this.tracePath(traceId), undefined);
  }
}

export class AgentMemoryStore {
  constructor({ agentDir, agentName, role, clock = () => new Date() }) {
    this.agentDir = agentDir;
    this.agentName = agentName;
    this.role = role;
    this.clock = clock;
    this.dir = path.join(agentDir, "memory");
    this.eventsDir = path.join(this.dir, "episodic", "events");
    this.recentSummaryFile = path.join(this.dir, "episodic", "recent-summary.md");
    this.contextNeedsFile = path.join(this.dir, "episodic", "context-needs.jsonl");
    this.longTermDir = path.join(this.dir, "long-term");
    this.factsFile = path.join(this.longTermDir, "facts.jsonl");
    this.playbooksFile = path.join(this.longTermDir, "playbooks.jsonl");
    this.candidatesDir = path.join(this.longTermDir, "candidates");
  }

  async init() {
    await ensureDir(this.eventsDir);
    await ensureDir(this.longTermDir);
    await ensureDir(this.candidatesDir);
  }

  async recordContextNeeds({ needs = [], source = {} } = {}) {
    await this.init();
    const now = this.clock();
    const records = (Array.isArray(needs) ? needs : [])
      .slice(0, 20)
      .map((need) => normalizeContextNeedRecord({
        need,
        source,
        now,
        role: this.role,
        agentName: this.agentName
      }))
      .filter(Boolean);
    for (const record of records) await appendJsonLine(this.contextNeedsFile, record);
    return records;
  }

  async readAllContextNeeds() {
    await this.init();
    const records = [];
    for (const line of await readLinesIfExists(this.contextNeedsFile)) {
      try {
        const record = JSON.parse(line);
        if (record && typeof record === "object" && !Array.isArray(record)) {
          records.push({
            ...record,
            status: normalizeContextNeedStatus(record.status),
            operations: Array.isArray(record.operations) ? record.operations : []
          });
        }
      } catch {
        continue;
      }
    }
    return records;
  }

  async writeAllContextNeeds(records = []) {
    await ensureDir(path.dirname(this.contextNeedsFile));
    const body = records.map((record) => JSON.stringify(record)).join("\n");
    await fs.writeFile(this.contextNeedsFile, body ? `${body}\n` : "", "utf8");
  }

  async readContextNeeds({ limit = 20, status = "open" } = {}) {
    const normalizedStatus = status === "all" ? "all" : normalizeContextNeedStatus(status || "open");
    const records = (await this.readAllContextNeeds())
      .filter((record) => normalizedStatus === "all" || record.status === normalizedStatus);
    return records
      .sort((left, right) => contextNeedRank(left) - contextNeedRank(right) || String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
      .slice(0, Math.max(0, Number(limit) || 20));
  }

  async resolveContextNeed(needId, input = {}) {
    const id = cleanText(needId, 120);
    if (!id) {
      const error = new Error("context need id is required");
      error.status = 400;
      throw error;
    }
    const nextStatus = input.status === "dismissed" ? "dismissed" : "resolved";
    const records = await this.readAllContextNeeds();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) {
      const error = new Error(`context need not found: ${id}`);
      error.status = 404;
      throw error;
    }
    const now = this.clock().toISOString();
    const current = records[index];
    const resolution = contextNeedResolution(input, nextStatus, now);
    const updated = {
      ...current,
      status: nextStatus,
      resolution,
      resolvedAt: nextStatus === "resolved" ? now : current.resolvedAt,
      dismissedAt: nextStatus === "dismissed" ? now : current.dismissedAt,
      updatedAt: now,
      operations: [
        ...(Array.isArray(current.operations) ? current.operations : []),
        contextNeedOperation({
          type: nextStatus,
          at: now,
          actor: resolution.actor,
          fromStatus: current.status || "open",
          toStatus: nextStatus,
          reason: resolution.text,
          resolutionType: resolution.type,
          memoryId: resolution.memoryId
        })
      ]
    };
    records[index] = updated;
    await this.writeAllContextNeeds(records);
    return updated;
  }

  async readLongTermFacts({ query = "", limit = 12 } = {}) {
    await this.init();
    const facts = [];
    const lines = await readLinesIfExists(this.factsFile);
    for (const line of lines) {
      try {
        const fact = JSON.parse(line);
        const text = entryText(fact) || JSON.stringify(fact);
        facts.push({
          id: fact.id || fact.key || createId("fact"),
          key: fact.key,
          text,
          value: fact.value,
          metadata: fact.metadata || {}
        });
      } catch {
        facts.push({ id: createId("fact"), text: line });
      }
    }
    return dedupeLongTermEntries(facts)
      .map((fact) => ({ ...fact, score: textScore(query, `${fact.key || ""} ${fact.text || ""}`) }))
      .filter((fact) => !query || fact.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async readLongTermPlaybooks({ query = "", limit = 12 } = {}) {
    await this.init();
    const playbooks = [];
    const lines = await readLinesIfExists(this.playbooksFile);
    for (const line of lines) {
      try {
        const playbook = JSON.parse(line);
        const text = entryText(playbook) || JSON.stringify(playbook);
        playbooks.push({
          id: playbook.id || playbook.key || createId("playbook"),
          key: playbook.key,
          text: String(text),
          value: playbook.value,
          metadata: playbook.metadata || {}
        });
      } catch {
        playbooks.push({ id: createId("playbook"), text: line });
      }
    }
    return dedupeLongTermEntries(playbooks)
      .map((playbook) => ({ ...playbook, score: textScore(query, `${playbook.key || ""} ${playbook.text || ""}`) }))
      .filter((playbook) => !query || playbook.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async appendLongTermFact({ key, text, value, metadata = {} }) {
    await this.init();
    const fact = {
      id: createId("fact"),
      key: key ? String(key) : undefined,
      text: text ? String(text) : undefined,
      value,
      metadata,
      createdAt: this.clock().toISOString()
    };
    await fs.appendFile(this.factsFile, `${JSON.stringify(fact)}\n`, "utf8");
    return fact;
  }

  async appendLongTermPlaybook({ key, text, value, metadata = {} }) {
    await this.init();
    const playbook = {
      id: createId("playbook"),
      key: key ? String(key) : undefined,
      text: text ? String(text) : undefined,
      value,
      metadata,
      createdAt: this.clock().toISOString()
    };
    await fs.appendFile(this.playbooksFile, `${JSON.stringify(playbook)}\n`, "utf8");
    return playbook;
  }

  async readRecentSummary() {
    try {
      return await fs.readFile(this.recentSummaryFile, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return "";
      throw error;
    }
  }

  async clearSessionEvents(sessionId) {
    await this.init();
    const rawSessionId = String(sessionId || "").trim();
    if (!rawSessionId) return { sessionId: rawSessionId, clearedEvents: 0 };
    const sessionMarkers = new Set([rawSessionId, safeSegment(rawSessionId, "session id")]);
    let clearedEvents = 0;
    for (const file of await listFiles(this.eventsDir, ".md")) {
      const fullPath = path.join(this.eventsDir, file);
      const content = await fs.readFile(fullPath, "utf8");
      const eventSessionId = content.match(/^Session:\s*(.*)$/m)?.[1]?.trim();
      if (!sessionMarkers.has(eventSessionId)) continue;
      await fs.rm(fullPath, { force: true });
      clearedEvents += 1;
    }
    if (clearedEvents) await this.updateRecentSummary();
    return { sessionId: rawSessionId, clearedEvents };
  }

  async writeMemory(input = {}, context = {}) {
    const request = new MemoryWriteRequest(input);
    const value = request.stringValue();
    const classification = request.classify(value);
    if (classification.kind === "fact" || classification.kind === "playbook") {
      const candidate = await this.writeLongTermCandidate({
        request,
        value,
        kind: classification.kind,
        reason: classification.reason,
        context
      });
      return { kind: "long_term_candidate", candidate, path: candidate.path };
    }
    return this.recordEvent({
      title: input.title || "Memory Write",
      summary: value,
      decisions: Array.isArray(input.decisions) ? input.decisions.map(String) : [],
      sideEffects: ["memory.write stored Agent-scoped episodic memory"],
      followUps: Array.isArray(input.followUps) ? input.followUps.map(String) : [],
      sessionId: context.sessionId,
      traceId: context.traceId,
      metadata: {
        type: "memory_write",
        hostContext: context.hostContext || {},
        ...(input.metadata || {})
      }
    });
  }

  async writeLongTermCandidate({ input = {}, request = new MemoryWriteRequest(input), value, kind, reason, context = {} }) {
    await this.init();
    const now = this.clock();
    const metadata = request.metadata();
    const key = request.key();
    const rawValue = request.rawValue();
    const review = await this.reviewLongTermCandidate({ key, text: value, value: rawValue, staleOf: request.staleOf() });
    const candidate = {
      id: createId("memcand"),
      status: "candidate",
      kind,
      key: key ? String(key) : undefined,
      reason,
      duplicateOf: review.duplicateOf,
      conflictsWith: review.conflictsWith,
      staleOf: review.staleOf,
      similarity: review.similarity,
      source: {
        agentName: context.agentName || this.agentName,
        role: context.role || this.role,
        sessionId: context.sessionId,
        traceId: context.traceId
      },
      text: String(value),
      value: rawValue,
      metadata,
      createdAt: now.toISOString()
    };
    const fileName = `${utcFileStamp(now)}-${safeSlug(kind)}-${safeSegment(candidate.id, "candidate id")}.json`;
    const file = path.join(this.candidatesDir, fileName);
    candidate.path = file;
    await writeJsonFile(file, candidate);
    return candidate;
  }

  async reviewLongTermCandidate({ key, text, value, staleOf }) {
    const canonical = (await this.readLongTermFacts({ limit: 10_000 }))
      .map((fact) => ({ ...fact, kind: "fact", text: entryText(fact) }));
    return new LongTermCandidateReview({ canonicalEntries: canonical }).evaluate({ key, text, value, staleOf });
  }

  async readCanonicalLongTermEntries() {
    const [facts, playbooks] = await Promise.all([
      this.readLongTermFacts({ limit: 10_000 }),
      this.readLongTermPlaybooks({ limit: 10_000 })
    ]);
    return facts
      .map((fact) => ({ ...fact, kind: "fact", text: entryText(fact) }))
      .concat(playbooks.map((playbook) => ({ ...playbook, kind: "playbook", text: entryText(playbook) })));
  }

  async promoteCandidate(candidateId) {
    await this.init();
    const files = await listFiles(this.candidatesDir, ".json");
    for (const fileName of files) {
      const file = path.join(this.candidatesDir, fileName);
      const candidate = await readJsonIfExists(file, undefined);
      if (!candidate || candidate.id !== candidateId) continue;
      const review = new LongTermCandidateReview({
        canonicalEntries: await this.readCanonicalLongTermEntries()
      }).evaluate({
        key: candidate.key,
        text: candidate.text,
        value: candidate.value,
        staleOf: candidate.staleOf
      });
      if (review.duplicateOf) {
        const existing = (await this.readCanonicalLongTermEntries()).find((entry) => entry.id === review.duplicateOf);
        const updated = {
          ...candidate,
          status: "duplicate",
          duplicateOf: review.duplicateOf,
          promotedId: review.duplicateOf,
          promotedAt: this.clock().toISOString(),
          similarity: review.similarity
        };
        await writeJsonFile(file, updated);
        return { candidate: updated, promoted: existing, duplicate: true };
      }
      const promoted = candidate.kind === "playbook"
        ? await this.appendLongTermPlaybook({
          key: candidate.key,
          text: candidate.text,
          metadata: { ...(candidate.metadata || {}), candidateId: candidate.id }
        })
        : await this.appendLongTermFact({
          key: candidate.key,
          text: candidate.text,
          metadata: { ...(candidate.metadata || {}), candidateId: candidate.id }
        });
      const updated = {
        ...candidate,
        status: "promoted",
        promotedId: promoted.id,
        promotedAt: this.clock().toISOString()
      };
      await writeJsonFile(file, updated);
      return { candidate: updated, promoted };
    }
    throw new Error(`memory candidate not found: ${candidateId}`);
  }

  async recordTurnEvent({ inputText, finalText, sessionId, traceId, toolCalls = [] }) {
    return this.recordEvent({
      title: "Agent Turn Completed",
      summary: [
        inputText ? `Assignment: ${String(inputText).slice(0, 1200)}` : "",
        finalText ? `Final: ${String(finalText).slice(0, 1800)}` : ""
      ].filter(Boolean).join("\n\n"),
      sideEffects: toolCalls.map((tool) => `${tool.toolId}: ${tool.status}`),
      sessionId,
      traceId,
      metadata: { type: "agent_turn_completed" }
    });
  }

  async recordEvent({ title = "Agent Event", summary = "", decisions = [], sideEffects = [], followUps = [], sessionId, traceId, metadata = {} }) {
    await this.init();
    const now = this.clock();
    const safeTrace = traceId ? safeSegment(traceId, "trace id") : createId("trace");
    const eventId = createId("event");
    const fileName = `${utcFileStamp(now)}-${safeSlug(title || summary)}-${safeTrace}-${safeSegment(eventId, "event id")}.md`;
    const file = path.join(this.eventsDir, fileName);
    const event = {
      id: eventId,
      title,
      summary,
      decisions,
      sideEffects,
      followUps,
      sessionId,
      traceId,
      metadata,
      path: file,
      createdAt: now.toISOString()
    };
    await fs.writeFile(file, eventMarkdown({
      title,
      now,
      agentName: this.agentName,
      sessionId,
      traceId,
      summary,
      decisions,
      sideEffects,
      followUps
    }), "utf8");
    await this.updateRecentSummary();
    return event;
  }

  async updateRecentSummary() {
    const files = (await listFiles(this.eventsDir, ".md")).slice(-10);
    const summaries = [];
    for (const file of files) {
      const content = await fs.readFile(path.join(this.eventsDir, file), "utf8");
      const title = content.match(/^#\s+(.+)$/m)?.[1] || file;
      const summary = content.match(/^## Summary\n([\s\S]*?)(?:\n## |\n?$)/m)?.[1]?.trim() || "";
      summaries.push(`- ${title}: ${summary.slice(0, 500)}`);
    }
    await ensureDir(path.dirname(this.recentSummaryFile));
    await fs.writeFile(
      this.recentSummaryFile,
      summaries.length ? `# Recent Agent Events\n\n${summaries.join("\n")}\n` : "# Recent Agent Events\n\nNo recent events.\n",
      "utf8"
    );
  }

  async search(query = "", limit = 8) {
    await this.init();
    const facts = (await this.readLongTermFacts({ query, limit })).map((fact) => ({
      layer: "long_term",
      kind: "fact",
      id: fact.id,
      text: fact.text,
      item: fact,
      score: fact.score
    }));
    const playbooks = (await this.readLongTermPlaybooks({ query, limit })).map((playbook) => ({
      layer: "long_term",
      kind: "playbook",
      id: playbook.id,
      text: playbook.text,
      item: playbook,
      score: playbook.score
    }));
    const eventFiles = await listFiles(this.eventsDir, ".md");
    const events = [];
    for (const file of eventFiles.slice(-100)) {
      const content = await fs.readFile(path.join(this.eventsDir, file), "utf8");
      const score = textScore(query, content);
      if (!query || score > 0) {
        events.push({
          layer: "episodic",
          kind: "event",
          id: file,
          text: content.slice(0, 2000),
          score
        });
      }
    }
    return facts.concat(playbooks, events).sort((left, right) => right.score - left.score).slice(0, limit);
  }
}
