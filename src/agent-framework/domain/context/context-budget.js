import { ContextBlock } from "./context-block.js";

const LOW_PRIORITY_DYNAMIC_DROP_REASON = "budget_low_priority_dynamic";
const LONG_TERM_BLOCK_ID = "memory.long_term.selected";

export class ContextBudget {
  static stableFirst(blocks = []) {
    return blocks
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const leftRank = left.item.cacheClass === "stable" ? 0 : 1;
        const rightRank = right.item.cacheClass === "stable" ? 0 : 1;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.index - right.index;
      })
      .map(({ item }) => item);
  }

  static totalCost(blocks = []) {
    return blocks.reduce((sum, item) => {
      const block = item instanceof ContextBlock ? item : ContextBlock.from(item);
      return sum + block.cost();
    }, 0);
  }

  constructor(limits = {}) {
    this.maxPromptChars = Number.isFinite(limits.maxPromptChars) && limits.maxPromptChars > 0
      ? limits.maxPromptChars
      : Infinity;
  }

  apply(blocks = []) {
    const ordered = ContextBudget.stableFirst(blocks.map((item) => ContextBlock.from(item).markRetained()));
    const budget = {
      maxPromptChars: this.maxPromptChars,
      initialChars: ContextBudget.totalCost(ordered),
      finalChars: ContextBudget.totalCost(ordered),
      overBudget: false,
      droppedCount: 0
    };
    if (!Number.isFinite(this.maxPromptChars) || budget.initialChars <= this.maxPromptChars) {
      return { blocks: ordered, budget };
    }

    this.dropLowPriorityDynamicBlocks(ordered);
    this.reduceLongTermEntries(ordered);

    budget.finalChars = ContextBudget.totalCost(ordered);
    budget.overBudget = budget.finalChars > this.maxPromptChars;
    budget.droppedCount = ordered.filter((item) => item.retained === false).length;
    return { blocks: ordered, budget };
  }

  dropLowPriorityDynamicBlocks(blocks) {
    const droppable = blocks
      .filter((item) => item.retained !== false && item.cacheClass !== "stable" && item.compressible && item.droppable)
      .sort((left, right) => {
        if (left.priority !== right.priority) return left.priority - right.priority;
        return right.cost() - left.cost();
      });
    for (const item of droppable) {
      if (ContextBudget.totalCost(blocks) <= this.maxPromptChars) break;
      item.drop(LOW_PRIORITY_DYNAMIC_DROP_REASON);
    }
  }

  reduceLongTermEntries(blocks) {
    const longTermBlock = blocks.find((item) => item.id === LONG_TERM_BLOCK_ID);
    if (!longTermBlock) return;

    const originalLines = longTermBlock.content.split("\n").filter((line) => line.trim());
    let retainedLines = originalLines.length;
    while (retainedLines > 0 && ContextBudget.totalCost(blocks) > this.maxPromptChars) {
      retainedLines -= 1;
      longTermBlock.reduceLongTermEntriesTo(retainedLines, originalLines);
    }
    if (retainedLines !== originalLines.length) return;
    if (!originalLines.length && ContextBudget.totalCost(blocks) > this.maxPromptChars) {
      longTermBlock.reduceLongTermEntriesTo(0, originalLines);
    }
  }
}
