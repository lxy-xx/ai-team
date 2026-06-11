import { redactSecretText } from "../domain/security/redaction.js";

function compactHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-16)
    .map((item) => ({
      role: item?.role === "agent" ? "agent" : "user",
      text: String(item?.text || "").slice(0, 4000)
    }))
    .filter((item) => item.text.trim());
}

const ONE_ON_ONE_MODES = new Set(["chat", "context_audit", "memory_plan"]);
const MEMORY_SUGGESTION_KINDS = new Set(["fact", "preference", "procedure", "episodic"]);

function normalizeOneOnOneMode(mode) {
  const value = String(mode || "chat").trim();
  return ONE_ON_ONE_MODES.has(value) ? value : "chat";
}

function cleanText(value, limit = 800) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanBlock(value, limit = 4000) {
  return String(value || "").trim().slice(0, limit);
}

function redactPublicText(value) {
  return redactSecretText(value)
    .replace(/\/users\/[^\s)'"`]+/gi, "[redacted-path]")
    .replace(/\/home\/[^\s)'"`]+/gi, "[redacted-path]");
}

function redactPublicValue(value, key = "") {
  if (/secret|token|password|credential|authorization|access[_-]?key|api[_-]?key|private[_-]?key/i.test(key)) return "[redacted]";
  if (typeof value === "string") return redactPublicText(value);
  if (Array.isArray(value)) return value.map((item) => redactPublicValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactPublicValue(entryValue, entryKey)]));
  }
  return value;
}

function publicLinkedContext(input = {}) {
  const linked = {};
  for (const key of ["intentId", "taskId", "runId", "artifactId"]) {
    const value = cleanText(input?.[key], 160);
    if (value) linked[key] = value;
  }
  return linked;
}

function modelText(output) {
  for (const value of [output?.finalMessage, output?.stdout]) {
    if (typeof value !== "string" || !value.trim()) continue;
    const parsed = parseJsonObject(value);
    if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message.trim();
    if (typeof parsed?.summary === "string" && parsed.summary.trim()) return parsed.summary.trim();
    if (parsed) return "Structured coaching response captured.";
    return value.trim();
  }
  const structured = output?.structuredOutput ?? output?.structured;
  if (structured && typeof structured === "object") {
    if (typeof structured.message === "string" && structured.message.trim()) return structured.message.trim();
    if (typeof structured.summary === "string" && structured.summary.trim()) return structured.summary.trim();
    return "Structured coaching response captured.";
  }
  return "";
}

function parseJsonObject(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("{") || !text.endsWith("}")) return undefined;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function structuredPayload(output, finalMessage = "") {
  const structured = output?.structuredOutput ?? output?.structured;
  if (structured && typeof structured === "object" && !Array.isArray(structured)) return structured;
  return parseJsonObject(output?.finalMessage) || parseJsonObject(output?.stdout) || parseJsonObject(finalMessage) || {};
}

function normalizePriority(value) {
  const priority = cleanText(value, 40).toLowerCase();
  return ["critical", "high", "medium", "low"].includes(priority) ? priority : "medium";
}

function normalizeMemoryKind(value) {
  const kind = cleanText(value, 40).toLowerCase();
  return MEMORY_SUGGESTION_KINDS.has(kind) ? kind : undefined;
}

function normalizeContextNeeds(payload = {}, limit = 8) {
  const source = Array.isArray(payload.contextNeeds)
    ? payload.contextNeeds
    : Array.isArray(payload.needs)
      ? payload.needs
      : [];
  return source.slice(0, limit).map((item = {}) => {
    const question = cleanText(item.question || item.need || item.text, 600);
    if (!question) return undefined;
    return {
      category: cleanText(item.category || item.type || "context", 80) || "context",
      priority: normalizePriority(item.priority),
      question,
      whyItMatters: cleanText(item.whyItMatters || item.reason || item.impact, 900),
      suggestedMemoryKind: normalizeMemoryKind(item.suggestedMemoryKind || item.memoryKind),
      relatedTaskId: cleanText(item.relatedTaskId || item.taskId, 160) || undefined
    };
  }).filter(Boolean);
}

function normalizeMemorySuggestions(payload = {}, limit = 8) {
  const source = Array.isArray(payload.memorySuggestions)
    ? payload.memorySuggestions
    : Array.isArray(payload.memories)
      ? payload.memories
      : [];
  return source.slice(0, limit).map((item = {}) => {
    const text = cleanBlock(item.text || item.value || item.memory, 2000);
    if (!text) return undefined;
    return {
      kind: normalizeMemoryKind(item.kind || item.memoryKind) || "fact",
      key: cleanText(item.key, 120) || undefined,
      text,
      reason: cleanText(item.reason || item.whyItMatters, 900) || undefined
    };
  }).filter(Boolean);
}

function summarizeTurn(turn = {}) {
  const profile = turn.profile || {};
  return {
    role: turn.role || turn.agentId,
    name: profile.name,
    title: profile.title,
    modelProvider: profile.modelProvider,
    skills: (profile.skills || []).map((skill) => skill.id),
    mcps: (profile.mcps || []).map((mcp) => mcp.id),
    tools: visibleToolIds(turn.tools)
  };
}

function visibleToolIds(tools = []) {
  return (tools || [])
    .filter((tool) => tool?.implicit !== true)
    .map((tool) => tool.id);
}

function summarizeCapabilities(turn = {}) {
  const skills = (turn.profile?.skills || []).map((skill) => skill.id);
  const mcps = (turn.profile?.mcps || []).map((mcp) => mcp.id);
  const tools = visibleToolIds(turn.tools);
  return {
    skillCount: skills.length,
    mcpCount: mcps.length,
    toolCount: tools.length,
    skills,
    mcps,
    tools
  };
}

function summarizeAgentMemory(memory = {}) {
  const facts = memory.facts || [];
  const playbooks = memory.playbooks || [];
  const contextNeeds = memory.openContextNeeds || [];
  return {
    factCount: facts.length,
    playbookCount: playbooks.length,
    hasRecentSummary: Boolean(memory.recentSummary && String(memory.recentSummary).trim()),
    openContextNeedCount: contextNeeds.length
  };
}

function formatAgentMemory(memory = {}) {
  const lines = [];
  if (memory.facts?.length) {
    lines.push("## Agent Long-Term Facts");
    lines.push(...memory.facts.map((fact) => `- ${fact.key ? `${fact.key}: ` : ""}${fact.text || fact.value || ""}`));
  }
  if (memory.playbooks?.length) {
    lines.push("", "## Agent Playbooks");
    lines.push(...memory.playbooks.map((playbook) => `- ${playbook.key ? `${playbook.key}: ` : ""}${playbook.text || playbook.value || ""}`));
  }
  if (memory.recentSummary) {
    lines.push("", "## Recent Agent Memory");
    lines.push(String(memory.recentSummary).trim());
  }
  if (memory.openContextNeeds?.length) {
    lines.push("", "## Open Agent Context Needs");
    lines.push(...memory.openContextNeeds.map((need) => `- [${need.priority || "medium"}] ${need.category || "context"}: ${need.question || ""}`));
  }
  return lines.filter((line) => line !== undefined).join("\n").trim();
}

async function loadAgentMemory({ agentRuntime, profile, role, message }) {
  if (typeof agentRuntime?.storesForProfile !== "function") return { facts: [], playbooks: [], recentSummary: "", openContextNeeds: [] };
  const agentName = profile?.name || role;
  const stores = agentRuntime.storesForProfile(profile || { role }, agentName);
  const [facts, playbooks, recentSummary, openContextNeeds] = await Promise.all([
    stores.memory.readLongTermFacts({ query: message, limit: 12 }),
    stores.memory.readLongTermPlaybooks({ query: message, limit: 8 }),
    stores.memory.readRecentSummary(),
    stores.memory.readContextNeeds({ limit: 5 })
  ]);
  return { facts, playbooks, recentSummary, openContextNeeds };
}

function publicProviderSelection(selection = {}) {
  return {
    providerId: selection.providerId,
    runner: selection.runner,
    model: selection.model
  };
}

function fallbackProviderSelection({ provider, config, selection = {} }) {
  const providerId = selection.providerId || config.provider?.id || provider?.id || config.runner?.type;
  return {
    providerId,
    runner: config.runner?.type,
    model: selection.model || config.provider?.model,
    provider: {
      id: providerId,
      runner: config.runner?.type,
      type: config.runner?.type,
      sandbox: config.runner?.codexSandbox || config.toolPolicy?.sandbox,
      timeoutMs: config.runner?.codexTimeoutMs,
      codexBin: config.runner?.codexBin
    }
  };
}

function providerSelectionSupportsTools(selection = {}) {
  const runner = selection.runner || selection.provider?.runner || selection.provider?.type;
  return runner === "openai_compatible";
}

function sameProviderSelection(left = {}, right = {}) {
  return left.providerId === right.providerId &&
    left.runner === right.runner &&
    left.model === right.model;
}

function oneOnOneModeInstruction(mode, linkedContext = {}) {
  const contextLines = Object.entries(linkedContext)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");
  const schema = mode === "memory_plan"
    ? `Return a JSON object when possible with:
{
  "message": "short coaching reply",
  "memorySuggestions": [
    { "kind": "fact|preference|procedure|episodic", "key": "optional.stable_key", "text": "memory to teach", "reason": "why this improves future work" }
  ]
}`
    : mode === "context_audit"
      ? `Return a JSON object when possible with:
{
  "message": "short coaching reply",
  "contextNeeds": [
    { "category": "domain|acceptance|files|tools|risk|decision", "priority": "critical|high|medium|low", "question": "specific question for the user", "whyItMatters": "quality impact", "suggestedMemoryKind": "fact|preference|procedure|episodic", "relatedTaskId": "optional task id" }
  ],
  "memorySuggestions": [
    { "kind": "fact|preference|procedure|episodic", "key": "optional.stable_key", "text": "memory to teach", "reason": "why this improves future work" }
  ]
}`
      : "Reply naturally. If you identify durable context or missing information, name it clearly.";
  return [
    "You are running a structured coaching turn for AI Team's One One console.",
    `Mode: ${mode}`,
    contextLines ? `Linked work context:\n${contextLines}` : undefined,
    schema
  ].filter(Boolean).join("\n");
}

function publicCoachingRecord(event = {}) {
  return {
    id: event.id,
    title: event.title,
    createdAt: event.createdAt,
    sessionId: event.sessionId,
    traceId: event.traceId
  };
}

async function recordOneOnOneCoaching({
  agentRuntime,
  profile,
  role,
  mode,
  message,
  finalMessage,
  contextNeeds = [],
  memorySuggestions = [],
  linkedContext = {},
  sessionId,
  traceId,
  logger = console
}) {
  if (typeof agentRuntime?.storesForProfile !== "function") return undefined;
  try {
    const agentName = profile?.name || role;
    const stores = agentRuntime.storesForProfile(profile || { role }, agentName);
    const headline = [
      `Mode: ${mode}`,
      contextNeeds.length ? `Needs: ${contextNeeds.map((need) => need.question).join("; ")}` : "",
      memorySuggestions.length ? `Memory: ${memorySuggestions.map((item) => item.key || item.text).join("; ")}` : ""
    ].filter(Boolean).join(" | ");
    const event = await stores.memory.recordEvent({
      title: "One One Coaching",
      summary: [
        headline,
        `User: ${cleanBlock(message, 1200)}`,
        `Agent: ${cleanBlock(finalMessage, 1800)}`,
        contextNeeds.length ? `Context needs:\n${contextNeeds.map((need) => `- [${need.priority}] ${need.question}`).join("\n")}` : "",
        memorySuggestions.length ? `Memory suggestions:\n${memorySuggestions.map((item) => `- ${item.kind}${item.key ? ` ${item.key}` : ""}: ${item.text}`).join("\n")}` : ""
      ].filter(Boolean).join("\n\n"),
      decisions: memorySuggestions.map((item) => `${item.kind}${item.key ? ` ${item.key}` : ""}: ${item.text}`),
      followUps: contextNeeds.map((need) => `[${need.priority}] ${need.question}`),
      sideEffects: [`one_one mode ${mode}`],
      sessionId: sessionId || `one-one:${role}`,
      traceId: traceId || `one-one-${mode}-${Date.now()}`,
      metadata: {
        type: "one_one_coaching",
        mode,
        linkedContext,
        contextNeedCount: contextNeeds.length,
        memorySuggestionCount: memorySuggestions.length
      }
    });
    if (contextNeeds.length && typeof stores.memory.recordContextNeeds === "function") {
      try {
        await stores.memory.recordContextNeeds({
          needs: contextNeeds,
          source: {
            mode,
            linkedContext,
            coachingRecordId: event.id,
            sessionId: event.sessionId,
            traceId: event.traceId
          }
        });
      } catch (error) {
        logger?.debug?.({ role, error: error.message }, "one one context needs backlog unavailable");
      }
    }
    return publicCoachingRecord(event);
  } catch (error) {
    logger?.debug?.({ role, error: error.message }, "one one coaching record unavailable");
    return undefined;
  }
}

export function buildOneOnOnePrompt({ message, history, turn, backendBoundary, agentMemoryText, mode = "chat", linkedContext = {} }) {
  const profile = turn?.profile || {};
  const normalizedMode = normalizeOneOnOneMode(mode);
  return [
    profile.prompt,
    "",
    "You are in a direct one-on-one dashboard conversation with the user.",
    "Answer as this configured Agent. Use the loaded prompt, memory, and host-provided tools as your operating context.",
    "Do not claim a tool call happened unless the runtime reports it.",
    backendBoundary ? "\n" + backendBoundary : undefined,
    "",
    "## One One Coaching Contract",
    oneOnOneModeInstruction(normalizedMode, linkedContext),
    "",
    "## User Message",
    message,
    history.length ? "\n## Conversation History" : undefined,
    history.length ? JSON.stringify(history, null, 2) : undefined,
    turn?.memoryText ? "\n" + turn.memoryText : undefined,
    agentMemoryText ? "\n" + agentMemoryText : undefined,
    turn?.sessionText ? "\n" + turn.sessionText : undefined
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function buildOneOnOneAssignment({ message, history, mode = "chat", linkedContext = {} }) {
  const normalizedMode = normalizeOneOnOneMode(mode);
  return [
    "You are in a direct one-on-one dashboard conversation with the user.",
    "Answer as this configured Agent. Use the loaded prompt, memory, and host-provided tools as your operating context.",
    "Do not claim a tool call happened unless the runtime reports it.",
    "",
    "## One One Coaching Contract",
    oneOnOneModeInstruction(normalizedMode, linkedContext),
    "",
    "## User Message",
    message,
    history.length ? "\n## Conversation History" : undefined,
    history.length ? JSON.stringify(history, null, 2) : undefined
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export async function runAgentOneOnOne({
  role,
  message,
  mode = "chat",
  linkedContext = {},
  history = [],
  agentRuntime,
  provider,
  config = {},
  logger = console
}) {
  const text = String(message || "").trim();
  if (!role) throw new Error("agent role is required");
  if (!text) throw new Error("message is required");
  if (!agentRuntime?.prepareTurn || !agentRuntime?.run) throw new Error("agent runtime unavailable");
  const { profile } = await storesForOneOneRole({ role, agentRuntime });

  const normalizedMode = normalizeOneOnOneMode(mode);
  const publicContext = publicLinkedContext(linkedContext);
  const compactedHistory = compactHistory(history);
  const threadId = `one-one:${role}`;
  const intent = {
    id: threadId,
    status: "one_one",
    goal: text,
    source: { channel: "dashboard", threadId, userId: "dashboard" }
  };
  const task = {
    id: threadId,
    title: normalizedMode === "context_audit" ? "One one context audit" : normalizedMode === "memory_plan" ? "One one memory plan" : "One one chat",
    text,
    description: text,
    consumerRole: role,
    channel: "dashboard",
    threadId,
    mode: normalizedMode,
    linkedContext: publicContext
  };
  const previousProvider = agentRuntime.provider;
  const installedFallbackProvider = !agentRuntime.provider && provider;
  if (installedFallbackProvider) agentRuntime.provider = provider;
  let providerSelection;
  let turn;
  try {
    providerSelection = agentRuntime.resolveProviderSelection
      ? await agentRuntime.resolveProviderSelection(profile || {})
      : provider?.resolveTurnConfig
        ? await provider.resolveTurnConfig(profile?.modelProvider || {})
        : fallbackProviderSelection({ provider, config, selection: profile?.modelProvider || {} });
    turn = await agentRuntime.prepareTurn({
      role,
      intent,
      task,
      previousArtifacts: [],
      session: {
        key: threadId,
        rollingSummary: compactedHistory.length
          ? compactedHistory.map((item) => `${item.role}: ${item.text}`).join("\n").slice(-6000)
          : undefined
      },
      profile,
      supportsTools: providerSelectionSupportsTools(providerSelection)
    });
    if (!profile) {
      const turnProviderSelection = agentRuntime.resolveProviderSelection
        ? await agentRuntime.resolveProviderSelection(turn?.profile || {})
        : provider?.resolveTurnConfig
          ? await provider.resolveTurnConfig(turn?.profile?.modelProvider || {})
          : fallbackProviderSelection({ provider, config, selection: turn?.profile?.modelProvider || {} });
      if (!sameProviderSelection(providerSelection, turnProviderSelection)) {
        const previousSupportsTools = providerSelectionSupportsTools(providerSelection);
        providerSelection = turnProviderSelection;
        if (providerSelectionSupportsTools(providerSelection) !== previousSupportsTools) {
          turn = await agentRuntime.prepareTurn({
            role,
            intent,
            task,
            previousArtifacts: [],
            session: {
              key: threadId,
              rollingSummary: compactedHistory.length
                ? compactedHistory.map((item) => `${item.role}: ${item.text}`).join("\n").slice(-6000)
                : undefined
            },
            profile: turn?.profile,
            supportsTools: providerSelectionSupportsTools(providerSelection)
          });
        }
      }
    }
  } catch (error) {
    if (installedFallbackProvider) agentRuntime.provider = previousProvider;
    throw error;
  }
  const backendBoundary = agentRuntime.describeBackendBoundary?.({
    backend: providerSelection.runner || providerSelection.provider?.runner || config.runner?.type,
    role,
    sandbox: providerSelection.provider?.sandbox || config.toolPolicy?.sandbox || config.runner?.codexSandbox
  });
  const agentMemory = await loadAgentMemory({
    agentRuntime,
    profile: turn.profile,
    role,
    message: text
  });
  const assignmentText = buildOneOnOneAssignment({
    message: text,
    history: compactedHistory,
    mode: normalizedMode,
    linkedContext: publicContext
  });
  let runtimeResult;
  try {
    runtimeResult = await agentRuntime.run({
      agentName: turn?.profile?.name || profile?.name || role,
      inputText: assignmentText,
      sessionInputText: text,
      sessionId: threadId,
      purpose: "agent_one_one",
      hostContext: {
        source: "dashboard_one_one",
        mode: normalizedMode,
        ...publicContext
      }
    });
  } finally {
    if (installedFallbackProvider) agentRuntime.provider = previousProvider;
  }

  const output = {
    finalMessage: runtimeResult?.finalText,
    structuredOutput: runtimeResult?.structuredOutput,
    structured: runtimeResult?.structured,
    provider: runtimeResult?.trace?.provider,
    model: runtimeResult?.trace?.model
  };
  const finalMessage = modelText(output);
  if (!finalMessage) throw new Error("agent returned empty output");
  const structured = structuredPayload(output, finalMessage);
  const contextNeeds = normalizeContextNeeds(structured);
  const memorySuggestions = normalizeMemorySuggestions(structured);
  const coachingRecord = await recordOneOnOneCoaching({
    agentRuntime,
    profile: turn.profile,
    role,
    mode: normalizedMode,
    message: text,
    finalMessage,
    contextNeeds,
    memorySuggestions,
    linkedContext: publicContext,
    sessionId: runtimeResult?.sessionId,
    traceId: runtimeResult?.trace?.traceId,
    logger
  });
  logger?.debug?.({ role, provider: providerSelection.providerId, model: providerSelection.model }, "agent one one completed");
  return {
    role,
    mode: normalizedMode,
    message: finalMessage,
    finalMessage,
    contextNeeds,
    memorySuggestions,
    linkedContext: publicContext,
    coachingRecord,
    provider: output?.provider || providerSelection.providerId,
    model: output?.model || providerSelection.model,
    sessionId: runtimeResult?.sessionId,
    traceId: runtimeResult?.trace?.traceId,
    directAgentTurn: true,
    engineIntentCreated: false,
    providerSelection: publicProviderSelection(providerSelection),
    capabilities: summarizeCapabilities(turn),
    agentMemory: summarizeAgentMemory(agentMemory),
    turn: summarizeTurn(turn)
  };
}

function publicMemoryResult(result = {}) {
  if (result.kind === "long_term_candidate") {
    const candidate = result.candidate || {};
    return redactPublicValue({
      kind: "long_term",
      candidate: {
        id: candidate.id,
        status: candidate.status,
        kind: candidate.kind,
        key: candidate.key,
        text: candidate.text,
        reason: candidate.reason,
        duplicateOf: candidate.duplicateOf,
        conflictsWith: candidate.conflictsWith || [],
        staleOf: candidate.staleOf,
        similarity: candidate.similarity,
        createdAt: candidate.createdAt
      }
    });
  }
  return redactPublicValue({
    kind: "episodic",
    event: {
      id: result.id,
      title: result.title,
      summary: result.summary,
      createdAt: result.createdAt
    }
  });
}

function publicContextNeedResult(need = {}) {
  if (!need?.id) return undefined;
  return redactPublicValue({
    id: need.id,
    status: need.status,
    priority: need.priority,
    category: need.category,
    question: need.question,
    whyItMatters: need.whyItMatters,
    suggestedMemoryKind: need.suggestedMemoryKind,
    relatedTaskId: need.relatedTaskId,
    resolution: need.resolution ? {
      type: need.resolution.type,
      text: need.resolution.text,
      memoryId: need.resolution.memoryId,
      actor: need.resolution.actor,
      at: need.resolution.at
    } : undefined,
    createdAt: need.createdAt,
    updatedAt: need.updatedAt,
    resolvedAt: need.resolvedAt,
    dismissedAt: need.dismissedAt,
    operations: (need.operations || []).map((operation) => ({
      type: operation.type,
      at: operation.at,
      actor: operation.actor,
      fromStatus: operation.fromStatus,
      toStatus: operation.toStatus,
      reason: operation.reason,
      resolutionType: operation.resolutionType,
      memoryId: operation.memoryId
    }))
  });
}

async function storesForOneOneRole({ role, agentRuntime }) {
  if (!role) {
    const error = new Error("agent role is required");
    error.status = 400;
    throw error;
  }
  if (!agentRuntime?.profileForRole || !agentRuntime?.storesForProfile) throw new Error("agent runtime unavailable");
  if (agentRuntime.agentConfigStore?.list) {
    const agents = await agentRuntime.agentConfigStore.list();
    if (!agents.some((agent) => agent.role === role)) {
      const error = new Error(`agent not found: ${role}`);
      error.status = 404;
      throw error;
    }
  }
  const profile = await agentRuntime.profileForRole(role);
  return {
    profile,
    stores: agentRuntime.storesForProfile(profile, profile?.name || role)
  };
}

async function requireOpenContextNeed(stores, contextNeedId) {
  const id = String(contextNeedId || "").trim();
  if (!id) return undefined;
  const needs = await stores.memory.readContextNeeds({ status: "all", limit: 10_000 });
  const need = needs.find((item) => item.id === id);
  if (!need) {
    const error = new Error(`context need not found: ${id}`);
    error.status = 404;
    throw error;
  }
  if (need.status !== "open") {
    const error = new Error(`context need is not open: ${id}`);
    error.status = 409;
    throw error;
  }
  return need;
}

export async function teachAgentOneOnOneMemory({
  role,
  value,
  key,
  kind = "fact",
  contextNeedId,
  agentRuntime
}) {
  const text = String(value || "").trim();
  if (!text) {
    const error = new Error("memory value is required");
    error.status = 400;
    throw error;
  }
  const { profile, stores } = await storesForOneOneRole({ role, agentRuntime });
  await requireOpenContextNeed(stores, contextNeedId);
  const normalizedKind = ["fact", "preference", "procedure", "playbook", "episodic"].includes(kind) ? kind : "fact";
  const write = await stores.memory.writeMemory(
    {
      value: text,
      key: key || undefined,
      metadata: {
        kind: normalizedKind === "playbook" ? "procedure" : normalizedKind,
        key: key || undefined,
        source: "dashboard_one_one"
      }
    },
    {
      role,
      agentName: profile?.name || role,
      sessionId: `one-one:${role}`,
      traceId: `one-one-memory:${Date.now()}`,
      hostContext: { source: "dashboard_one_one" }
    }
  );
  let promoted;
  if (write.kind === "long_term_candidate" && write.candidate?.id) {
    promoted = await stores.memory.promoteCandidate(write.candidate.id);
  }
  let contextNeed;
  if (contextNeedId) {
    const memoryId = promoted?.promoted?.id || write.candidate?.id || write.id;
    contextNeed = await stores.memory.resolveContextNeed(contextNeedId, {
      status: "resolved",
      resolutionType: "memory",
      resolution: "Saved as Agent memory from One One.",
      memoryId,
      actor: "dashboard"
    });
  }
  return redactPublicValue({
    role,
    active: Boolean(promoted || write.kind !== "long_term_candidate"),
    memory: {
      ...publicMemoryResult(write),
      promoted: promoted?.promoted ? {
        id: promoted.promoted.id,
        kind: write.candidate?.kind,
        key: promoted.promoted.key,
        text: promoted.promoted.text,
        createdAt: promoted.promoted.createdAt
      } : undefined
    },
    contextNeed: publicContextNeedResult(contextNeed)
  });
}

export async function resolveAgentContextNeed({
  role,
  contextNeedId,
  status = "resolved",
  resolutionType,
  resolution,
  agentRuntime
}) {
  const id = String(contextNeedId || "").trim();
  if (!id) {
    const error = new Error("context need id is required");
    error.status = 400;
    throw error;
  }
  const { stores } = await storesForOneOneRole({ role, agentRuntime });
  const contextNeed = await stores.memory.resolveContextNeed(id, {
    status,
    resolutionType,
    resolution,
    actor: "dashboard"
  });
  return redactPublicValue({
    role,
    contextNeed: publicContextNeedResult(contextNeed)
  });
}
