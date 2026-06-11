import test from "node:test";
import assert from "node:assert/strict";
import { ContextBlock } from "../src/agent-framework/domain/context/context-block.js";
import { ContextBudget } from "../src/agent-framework/domain/context/context-budget.js";

function block(input) {
  return ContextBlock.from({
    role: "system",
    priority: 50,
    cacheClass: "dynamic",
    compressible: true,
    droppable: false,
    content: "content",
    ...input
  });
}

test("ContextBudget orders stable context first while preserving order within cache class", () => {
  const dynamicFirst = block({ id: "dynamic.first", cacheClass: "dynamic" });
  const stableSecond = block({ id: "stable.second", cacheClass: "stable" });
  const dynamicThird = block({ id: "dynamic.third", cacheClass: "dynamic" });
  const stableFourth = block({ id: "stable.fourth", cacheClass: "stable" });

  const result = new ContextBudget({ maxPromptChars: Infinity }).apply([
    dynamicFirst,
    stableSecond,
    dynamicThird,
    stableFourth
  ]);

  assert.deepEqual(result.blocks.map((item) => item.id), [
    "stable.second",
    "stable.fourth",
    "dynamic.first",
    "dynamic.third"
  ]);
  assert.ok(result.blocks.every((item) => item.retained === true));
  assert.equal(result.budget.overBudget, false);
});

test("ContextBudget drops lower-priority dynamic droppable blocks before higher-priority dynamic blocks", () => {
  const required = block({
    id: "assignment.current",
    priority: 100,
    compressible: false,
    droppable: false,
    content: "required assignment"
  });
  const lowPriority = block({
    id: "session.rolling_summary",
    priority: 10,
    droppable: true,
    content: "x".repeat(120)
  });
  const highPriority = block({
    id: "memory.episodic.recent_summary",
    priority: 80,
    droppable: true,
    content: "y".repeat(120)
  });
  const initialChars = ContextBudget.totalCost([required, lowPriority, highPriority]);
  const result = new ContextBudget({ maxPromptChars: initialChars - lowPriority.cost() }).apply([
    required,
    lowPriority,
    highPriority
  ]);

  const budgetedLowPriority = result.blocks.find((item) => item.id === lowPriority.id);
  const budgetedHighPriority = result.blocks.find((item) => item.id === highPriority.id);

  assert.equal(budgetedLowPriority.retained, false);
  assert.equal(budgetedLowPriority.budgetReason, "dropped");
  assert.equal(budgetedLowPriority.dropReason, "budget_low_priority_dynamic");
  assert.equal(budgetedHighPriority.retained, true);
  assert.equal(result.budget.droppedCount, 1);
  assert.equal(result.budget.overBudget, false);
});

test("ContextBudget reduces long-term canonical memory by entry count without summarizing it", () => {
  const required = block({
    id: "assignment.current",
    priority: 100,
    compressible: false,
    droppable: false,
    content: "required assignment"
  });
  const longTerm = block({
    id: "memory.long_term.selected",
    type: "long_term_memory",
    priority: 88,
    compressible: false,
    droppable: false,
    content: [
      "- fact one " + "a".repeat(80),
      "- fact two " + "b".repeat(80),
      "- fact three " + "c".repeat(80),
      "- fact four " + "d".repeat(80)
    ].join("\n")
  });
  const originalLines = longTerm.content.split("\n").filter(Boolean);
  const result = new ContextBudget({ maxPromptChars: required.cost() + 180 }).apply([required, longTerm]);
  const budgetedLongTerm = result.blocks.find((item) => item.id === "memory.long_term.selected");
  const retainedLines = budgetedLongTerm.content.split("\n").filter(Boolean);

  assert.ok(retainedLines.length < originalLines.length);
  assert.deepEqual(retainedLines, originalLines.slice(0, retainedLines.length));
  assert.equal(budgetedLongTerm.retained, true);
  assert.equal(budgetedLongTerm.originalEntryCount, originalLines.length);
  assert.equal(budgetedLongTerm.retainedEntryCount, retainedLines.length);
  assert.equal(budgetedLongTerm.budgetReason, "long_term_entries_reduced");
  assert.equal(budgetedLongTerm.content.includes("summary"), false);
});

test("ContextBudget retains required assignment and active loop tail even when still over budget", () => {
  const assignment = block({
    id: "assignment.current",
    role: "user",
    priority: 100,
    compressible: false,
    droppable: false,
    content: "CURRENT ASSIGNMENT MUST STAY " + "a".repeat(120)
  });
  const activeLoopTail = block({
    id: "turn.active_loop_tail",
    role: "assistant",
    priority: 96,
    compressible: false,
    droppable: false,
    content: "RAW ACTIVE LOOP TAIL MUST STAY " + "b".repeat(120)
  });
  const droppable = block({
    id: "session.recent_raw",
    role: "user",
    priority: 40,
    compressible: true,
    droppable: true,
    content: "DROPPABLE " + "c".repeat(120)
  });

  const result = new ContextBudget({ maxPromptChars: 80 }).apply([assignment, activeLoopTail, droppable]);
  const retainedIds = result.blocks.filter((item) => item.retained !== false).map((item) => item.id);

  assert.deepEqual(retainedIds, ["assignment.current", "turn.active_loop_tail"]);
  assert.equal(result.blocks.find((item) => item.id === "session.recent_raw").retained, false);
  assert.equal(result.budget.overBudget, true);
  assert.equal(result.budget.droppedCount, 1);
  assert.ok(result.budget.finalChars > result.budget.maxPromptChars);
});
