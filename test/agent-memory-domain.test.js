import test from "node:test";
import assert from "node:assert/strict";
import { MemoryWriteRequest } from "../src/agent-framework/domain/memory/memory-write-request.js";
import { LongTermCandidateReview } from "../src/agent-framework/domain/memory/long-term-candidate-review.js";

test("MemoryWriteRequest classifies explicit metadata kinds", () => {
  const fact = new MemoryWriteRequest({ value: "Persist this.", metadata: { kind: "fact" } });
  const playbook = new MemoryWriteRequest({ value: "Run this process.", type: "procedure" });
  const episodic = new MemoryWriteRequest({ value: "Only this turn.", layer: "short_term" });

  assert.deepEqual(fact.classify(), { kind: "fact", reason: "metadata_fact" });
  assert.deepEqual(playbook.classify(), { kind: "playbook", reason: "metadata_procedure" });
  assert.deepEqual(episodic.classify(), { kind: "episodic", reason: "metadata_episodic" });
});

test("MemoryWriteRequest classifies durable flags as facts", () => {
  assert.deepEqual(new MemoryWriteRequest({ value: "Durable.", durable: true }).classify(), {
    kind: "fact",
    reason: "metadata_durable"
  });
  assert.deepEqual(new MemoryWriteRequest({ value: "Long term.", metadata: { longTerm: true } }).classify(), {
    kind: "fact",
    reason: "metadata_durable"
  });
});

test("MemoryWriteRequest classifies key prefixes", () => {
  assert.deepEqual(new MemoryWriteRequest({ value: "Steps.", key: "workflow.release" }).classify(), {
    kind: "playbook",
    reason: "key_playbook"
  });
  assert.deepEqual(new MemoryWriteRequest({ value: "Boundary.", metadata: { key: "decision.boundary" } }).classify(), {
    kind: "fact",
    reason: "key_fact"
  });
});

test("MemoryWriteRequest classifies English and Chinese text markers", () => {
  assert.deepEqual(new MemoryWriteRequest({ value: "Preference: terse replies." }).classify(), {
    kind: "fact",
    reason: "text_fact_marker"
  });
  assert.deepEqual(new MemoryWriteRequest({ value: "Procedure: run tests." }).classify(), {
    kind: "playbook",
    reason: "text_playbook_marker"
  });
  assert.deepEqual(new MemoryWriteRequest({ value: "事实：ChannelGateway owns ingress." }).classify(), {
    kind: "fact",
    reason: "text_fact_marker"
  });
  assert.deepEqual(new MemoryWriteRequest({ value: "流程：先读代码再改。" }).classify(), {
    kind: "playbook",
    reason: "text_playbook_marker"
  });
});

test("MemoryWriteRequest uses keyed durable default and default episodic classification", () => {
  assert.deepEqual(new MemoryWriteRequest({ value: "Remember under key.", key: "project.boundary" }).classify(), {
    kind: "fact",
    reason: "key_durable"
  });
  assert.deepEqual(new MemoryWriteRequest({ value: "Short-lived result." }).classify(), {
    kind: "episodic",
    reason: "default_episodic"
  });
});

test("MemoryWriteRequest validates and exposes raw value, string value, metadata, and key", () => {
  const request = new MemoryWriteRequest({
    content: { project: "ai-team", boundary: "ChannelGateway" },
    metadata: { key: "architecture.boundary" }
  });

  assert.deepEqual(request.rawValue(), { project: "ai-team", boundary: "ChannelGateway" });
  assert.equal(request.stringValue(), "{\"project\":\"ai-team\",\"boundary\":\"ChannelGateway\"}");
  assert.equal(request.key(), "architecture.boundary");
  assert.deepEqual(request.metadata(), { key: "architecture.boundary" });
  assert.throws(() => new MemoryWriteRequest({ value: "" }).stringValue(), /memory\.write requires value/);
});

test("LongTermCandidateReview detects duplicates against canonical text and keyed values", () => {
  const review = new LongTermCandidateReview({
    canonicalEntries: [
      { id: "fact_text", kind: "fact", key: "architecture.boundary", text: "ChannelGateway is the only inbound boundary." },
      { id: "fact_value", kind: "fact", key: "preference.reply_style", text: "Use terse replies.", value: "terse" }
    ]
  });

  assert.equal(
    review.evaluate({ text: "ChannelGateway is the only inbound boundary." }).duplicateOf,
    "fact_text"
  );
  assert.equal(
    review.evaluate({ key: "preference.reply_style", text: "Preference: terse", value: "terse" }).duplicateOf,
    "fact_value"
  );
});

test("LongTermCandidateReview detects keyed conflicts and stale references", () => {
  const review = new LongTermCandidateReview({
    canonicalEntries: [
      { id: "fact_existing", kind: "fact", key: "preference.reply_style", text: "Use terse replies.", value: "terse" },
      { id: "playbook_existing", kind: "playbook", key: "workflow.release", text: "Procedure: run npm test." }
    ]
  });

  const result = review.evaluate({
    key: "preference.reply_style",
    text: "Use detailed replies.",
    value: "detailed",
    staleOf: "playbook_existing"
  });

  assert.equal(result.duplicateOf, undefined);
  assert.deepEqual(result.conflictsWith, ["fact_existing"]);
  assert.equal(result.staleOf, "playbook_existing");
  assert.deepEqual(result.similarity.conflicts, [{ id: "fact_existing", kind: "fact" }]);
  assert.equal(result.similarity.staleOf, "playbook_existing");
  assert.equal(result.similarity.comparedCanonicalCount, 2);
});
