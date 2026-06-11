import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentSessionFactory } from "../src/agent-framework/application/agent-session-factory.js";
import { AgentMemoryStore, AgentSessionStore } from "../src/agent-framework/infrastructure/agent-state-store.js";

async function tempAgentMemory() {
  const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-memory-context-"));
  const memory = new AgentMemoryStore({
    agentDir,
    agentName: "Ada",
    role: "engineer",
    clock: () => new Date("2026-05-23T01:02:03.004Z")
  });
  return { agentDir, memory };
}

async function readJsonFiles(dir) {
  const files = await fs.readdir(dir);
  return Promise.all(files.map(async (file) => JSON.parse(await fs.readFile(path.join(dir, file), "utf8"))));
}

test("AgentMemoryStore.writeMemory without layer or key writes an episodic event", async () => {
  const { agentDir, memory } = await tempAgentMemory();

  const result = await memory.writeMemory(
    { value: "Short-lived result from this turn." },
    { sessionId: "sess_default", traceId: "trace_default" }
  );

  const eventText = await fs.readFile(result.path, "utf8");
  assert.match(eventText, /Short-lived result from this turn/);
  assert.match(eventText, /sess_default/);

  const candidateFiles = await fs.readdir(path.join(agentDir, "memory", "long-term", "candidates"));
  assert.deepEqual(candidateFiles, []);
});

test("AgentSessionStore.clearDynamicContext clears chat state while preserving the channel session binding", async () => {
  const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-session-context-"));
  const sessions = new AgentSessionStore({
    agentDir,
    agentName: "Franklin",
    role: "ceo_cto",
    clock: () => new Date("2026-05-24T01:02:03.004Z")
  });
  await sessions.appendTurn("ceo_cto:feishu:p2p:ou_owner", {
    traceId: "trace_feishu_1",
    inputText: "text: 你叫什么名字？",
    finalText: "我是 Franklin。",
    rollingSummary: "用户正在和 CEO 私聊默认渠道上下文。"
  });

  const result = await sessions.clearDynamicContext("ceo_cto:feishu:p2p:ou_owner");
  const session = await sessions.load("ceo_cto:feishu:p2p:ou_owner");

  assert.deepEqual(result, {
    sessionId: "ceo_cto:feishu:p2p:ou_owner",
    clearedRollingSummary: true,
    clearedTurns: 1,
    clearedTraceIds: 1
  });
  assert.equal(session.id, "ceo_cto:feishu:p2p:ou_owner");
  assert.equal(session.agentName, "Franklin");
  assert.equal(session.role, "ceo_cto");
  assert.equal(session.rollingSummary, undefined);
  assert.deepEqual(session.recentTurns, []);
  assert.deepEqual(session.traceIds, []);
});

test("AgentSessionStore keeps role-owned sessions usable after display rename", async () => {
  const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-session-rename-"));
  const oldSessions = new AgentSessionStore({
    agentDir,
    agentName: "Former CEO",
    role: "ceo_cto",
    clock: () => new Date("2026-05-24T01:02:03.004Z")
  });
  await oldSessions.appendTurn("ceo_cto:dashboard:dashboard", {
    traceId: "trace_old_name",
    inputText: "你叫什么名字？",
    finalText: "我是 Former CEO。"
  });

  const renamedSessions = new AgentSessionStore({
    agentDir,
    agentName: "Franklin",
    role: "ceo_cto",
    clock: () => new Date("2026-05-24T02:02:03.004Z")
  });
  await renamedSessions.appendTurn("ceo_cto:dashboard:dashboard", {
    traceId: "trace_new_name",
    inputText: "继续",
    finalText: "继续处理。"
  });
  const session = await renamedSessions.load("ceo_cto:dashboard:dashboard");

  assert.equal(session.agentName, "Franklin");
  assert.equal(session.role, "ceo_cto");
  assert.deepEqual(session.previousAgentNames, ["Former CEO"]);
  assert.equal(session.recentTurns.length, 2);
});

test("AgentSessionStore replays multi-round tool loops with each tool result after its call", async () => {
  const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-session-tools-"));
  const sessions = new AgentSessionStore({
    agentDir,
    agentName: "Turing",
    role: "qa",
    clock: () => new Date("2026-05-24T01:02:03.004Z")
  });
  await sessions.ensureFork("sess_tool_loop", {
    seedMessages: [{ role: "system", content: "seed" }]
  });
  await sessions.appendTurn("sess_tool_loop", {
    traceId: "trace_tools",
    inputText: "verify",
    userMessages: [{ role: "user", content: "verify" }],
    toolLoopMessages: [
      { role: "assistant", tool_calls: [{ id: "call_1", type: "function", function: { name: "Bash", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_1", content: "{\"ok\":true}" },
      { role: "assistant", tool_calls: [{ id: "call_2", type: "function", function: { name: "Bash", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_2", content: "{\"exitCode\":0}" }
    ],
    assistantMessages: [{ role: "assistant", content: "VERDICT: pass" }],
    finalText: "VERDICT: pass"
  });

  const messages = await sessions.renderProviderMessages("sess_tool_loop");
  assert.deepEqual(messages.map((message) => message.role), ["system", "user", "assistant", "tool", "assistant", "tool", "assistant"]);
  assert.equal(messages[2].tool_calls[0].id, "call_1");
  assert.equal(messages[3].tool_call_id, "call_1");
  assert.equal(messages[4].tool_calls[0].id, "call_2");
  assert.equal(messages[5].tool_call_id, "call_2");
});

test("AgentMemoryStore.writeMemory creates long-term candidates with duplicate conflict and stale review metadata", async () => {
  const { agentDir, memory } = await tempAgentMemory();
  const canonicalBoundary = await memory.appendLongTermFact({
    key: "architecture.boundary",
    text: "ChannelGateway is the only inbound boundary."
  });
  const canonicalPreference = await memory.appendLongTermFact({
    key: "preference.reply_style",
    text: "Use terse replies."
  });

  const duplicate = await memory.writeMemory(
    {
      value: "ChannelGateway is the only inbound boundary.",
      metadata: { kind: "fact", key: "architecture.boundary" }
    },
    { sessionId: "sess_candidates", traceId: "trace_duplicate" }
  );
  const conflict = await memory.writeMemory(
    {
      value: "Use detailed replies.",
      metadata: { type: "preference", key: "preference.reply_style" }
    },
    { sessionId: "sess_candidates", traceId: "trace_conflict" }
  );
  const stale = await memory.writeMemory(
    {
      value: "Procedure: retire the old CLI handoff.",
      metadata: { kind: "procedure", staleOf: canonicalBoundary.id }
    },
    { sessionId: "sess_candidates", traceId: "trace_stale" }
  );

  assert.equal(duplicate.kind, "long_term_candidate");
  assert.equal(duplicate.candidate.status, "candidate");
  assert.equal(duplicate.candidate.duplicateOf, canonicalBoundary.id);
  assert.equal(duplicate.candidate.source.sessionId, "sess_candidates");
  assert.equal(duplicate.candidate.source.traceId, "trace_duplicate");
  assert.equal(conflict.candidate.conflictsWith.includes(canonicalPreference.id), true);
  assert.equal(stale.candidate.kind, "playbook");
  assert.equal(stale.candidate.staleOf, canonicalBoundary.id);

  const candidateDir = path.join(agentDir, "memory", "long-term", "candidates");
  const candidates = await readJsonFiles(candidateDir);
  assert.equal(candidates.length, 3);
  assert.ok(candidates.every((candidate) => candidate.status === "candidate"));
  assert.ok(candidates.every((candidate) => candidate.reason));
  assert.ok(candidates.every((candidate) => candidate.similarity));
});

test("AgentMemoryStore reuses canonical long-term facts when promoting duplicates", async () => {
  const { memory } = await tempAgentMemory();
  const canonical = await memory.appendLongTermFact({
    key: "preference.product_strategy",
    text: "偏好：从长期产品战略出发，先说明取舍，再开始实现。"
  });
  const duplicate = await memory.writeMemory(
    {
      value: "偏好：从长期产品战略出发，先说明取舍，再开始实现。",
      metadata: { kind: "fact", key: "preference.product_strategy" }
    },
    { sessionId: "sess_duplicate", traceId: "trace_duplicate" }
  );

  const promoted = await memory.promoteCandidate(duplicate.candidate.id);
  const facts = await memory.readLongTermFacts({ query: "", limit: 10_000 });

  assert.equal(promoted.duplicate, true);
  assert.equal(promoted.promoted.id, canonical.id);
  assert.equal(promoted.candidate.status, "duplicate");
  assert.equal(promoted.candidate.promotedId, canonical.id);
  assert.equal(facts.filter((fact) => fact.key === "preference.product_strategy").length, 1);
});

test("AgentMemoryStore readLongTermFacts deduplicates historical repeated facts", async () => {
  const { memory } = await tempAgentMemory();
  await memory.appendLongTermFact({
    key: "context.layout_verification",
    text: "Layout verification completed after responsive browser checks."
  });
  await memory.appendLongTermFact({
    key: "context.layout_verification",
    text: "Layout verification completed after responsive browser checks."
  });

  const facts = await memory.readLongTermFacts({ query: "", limit: 10_000 });

  assert.equal(facts.filter((fact) => fact.key === "context.layout_verification").length, 1);
});

test("AgentMemoryStore tracks context need lifecycle operations", async () => {
  const { memory } = await tempAgentMemory();

  const [need] = await memory.recordContextNeeds({
    needs: [{
      category: "acceptance",
      priority: "critical",
      question: "Which examples define done?",
      whyItMatters: "Acceptance examples prevent rework.",
      suggestedMemoryKind: "fact",
      relatedTaskId: "task_demo"
    }],
    source: {
      mode: "context_audit",
      linkedContext: { intentId: "intent_demo", taskId: "task_demo" },
      coachingRecordId: "event_demo"
    }
  });

  assert.equal(need.status, "open");
  assert.equal(need.operations[0].toStatus, "open");
  assert.equal(need.source.linkedContext.intentId, "intent_demo");
  assert.equal(need.relatedTaskId, "task_demo");

  const resolved = await memory.resolveContextNeed(need.id, {
    status: "resolved",
    resolutionType: "memory",
    resolution: "Saved acceptance examples as memory.",
    memoryId: "fact_acceptance"
  });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolution.type, "memory");
  assert.equal(resolved.resolution.memoryId, "fact_acceptance");
  assert.equal(resolved.operations.at(-1).fromStatus, "open");
  assert.equal(resolved.operations.at(-1).toStatus, "resolved");

  const openNeeds = await memory.readContextNeeds();
  assert.deepEqual(openNeeds, []);
  const allNeeds = await memory.readContextNeeds({ status: "all" });
  assert.equal(allNeeds.length, 1);
  assert.equal(allNeeds[0].status, "resolved");
});

test("AgentMemoryStore derives context need task links from source linked context", async () => {
  const { memory } = await tempAgentMemory();

  const [need] = await memory.recordContextNeeds({
    needs: [{
      category: "files",
      priority: "low",
      question: "Which task evidence should I use?",
      whyItMatters: "Task-specific evidence prevents generic answers."
    }],
    source: {
      mode: "context_audit",
      linkedContext: { intentId: "intent_demo", taskId: "task_linked" }
    }
  });

  assert.equal(need.relatedTaskId, "task_linked");
});

test("AgentSessionFactory budget preserves required seed and current user materials", () => {
  const builder = new AgentSessionFactory();
  const longTermFacts = Array.from({ length: 12 }, (_, index) => ({
    id: `fact_${index}`,
    text: `CANONICAL FACT ${index} ${"x".repeat(120)}`
  }));
  const blocks = builder.build({
    profile: { prompt: "AGENTS MD MUST STAY" },
    inputText: "CURRENT ASSIGNMENT MUST STAY",
    longTermFacts,
    recentSummary: `DROP EPISODIC SUMMARY ${"e".repeat(1200)}`
  });
  const originalLongTerm = blocks.find((block) => block.id === "memory.long_term.selected");

  const budgeted = builder.applyBudget(blocks, { maxPromptChars: 1400 });
  const retainedBlocks = budgeted.blocks.filter((block) => block.retained !== false);
  const promptText = builder.messagesFor(budgeted.blocks)
    .map((message) => message.content || "")
    .join("\n");
  const budgetedLongTerm = budgeted.blocks.find((block) => block.id === "memory.long_term.selected");
  const originalLines = originalLongTerm.content.split("\n").filter(Boolean);
  const retainedLongTermLines = budgetedLongTerm.content.split("\n").filter(Boolean);

  assert.equal(budgeted.blocks[0].cacheClass, "stable");
  assert.ok(retainedBlocks.find((block) => block.id === "assignment.current"));
  assert.match(promptText, /CURRENT ASSIGNMENT MUST STAY/);
  assert.ok(retainedLongTermLines.length < originalLines.length);
  assert.deepEqual(retainedLongTermLines, originalLines.slice(0, retainedLongTermLines.length));
  assert.equal(budgetedLongTerm.compressible, false);
  assert.equal(budgetedLongTerm.content.includes("summary"), false);
  assert.ok(budgeted.blocks.some((block) => block.retained === false && block.dropReason === "budget_low_priority_dynamic"));
  assert.ok(
    budgeted.blocks.findIndex((block) => block.cacheClass === "dynamic") >
      budgeted.blocks.findLastIndex((block) => block.cacheClass === "stable")
  );
});
