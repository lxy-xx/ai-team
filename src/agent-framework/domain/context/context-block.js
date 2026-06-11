export function estimateTokens(content) {
  return Math.ceil(String(content || "").length / 4);
}

export class ContextBlock {
  static from(input = {}) {
    if (input instanceof ContextBlock) return new ContextBlock(input);
    return new ContextBlock(input);
  }

  constructor(input = {}) {
    const content = String(input.content || "");
    this.id = input.id;
    this.type = input.type;
    this.role = input.role || "system";
    this.priority = input.priority ?? 50;
    this.cacheClass = input.cacheClass || "dynamic";
    this.compressible = input.compressible !== false;
    this.droppable = input.droppable === true;
    this.content = content;
    this.tokenEstimate = Number.isFinite(input.tokenEstimate) ? input.tokenEstimate : estimateTokens(content);

    if ("retained" in input) this.retained = input.retained;
    if (input.budgetReason) this.budgetReason = input.budgetReason;
    if (input.dropReason) this.dropReason = input.dropReason;
    if ("originalEntryCount" in input) this.originalEntryCount = input.originalEntryCount;
    if ("retainedEntryCount" in input) this.retainedEntryCount = input.retainedEntryCount;
  }

  cost() {
    if (this.retained === false) return 0;
    if (!this.content.trim()) return 0;
    return this.content.length + String(this.id || "").length + 8;
  }

  markRetained() {
    this.retained = true;
    this.budgetReason = "retained";
    delete this.dropReason;
    return this;
  }

  drop(reason) {
    this.retained = false;
    this.budgetReason = "dropped";
    this.dropReason = reason;
    return this;
  }

  updateContent(content) {
    this.content = String(content || "");
    this.tokenEstimate = estimateTokens(this.content);
    return this;
  }

  reduceLongTermEntriesTo(retainedLines, originalLines) {
    this.updateContent(originalLines.slice(0, retainedLines).join("\n"));
    this.retained = true;
    this.originalEntryCount = originalLines.length;
    this.retainedEntryCount = retainedLines;
    this.budgetReason = "long_term_entries_reduced";
    delete this.dropReason;
    return this;
  }
}
