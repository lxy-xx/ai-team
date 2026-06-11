import { stringifyMemoryValue } from "./memory-value.js";

const EXPLICIT_KINDS = new Map([
  ["fact", { kind: "fact", reason: "metadata_fact" }],
  ["facts", { kind: "fact", reason: "metadata_fact" }],
  ["semantic", { kind: "fact", reason: "metadata_semantic" }],
  ["preference", { kind: "fact", reason: "metadata_preference" }],
  ["preferences", { kind: "fact", reason: "metadata_preference" }],
  ["convention", { kind: "fact", reason: "metadata_convention" }],
  ["decision", { kind: "fact", reason: "metadata_decision" }],
  ["lesson", { kind: "fact", reason: "metadata_lesson" }],
  ["durable", { kind: "fact", reason: "metadata_durable" }],
  ["long_term", { kind: "fact", reason: "metadata_long_term" }],
  ["long-term", { kind: "fact", reason: "metadata_long_term" }],
  ["procedure", { kind: "playbook", reason: "metadata_procedure" }],
  ["procedural", { kind: "playbook", reason: "metadata_procedure" }],
  ["playbook", { kind: "playbook", reason: "metadata_playbook" }],
  ["episodic", { kind: "episodic", reason: "metadata_episodic" }],
  ["event", { kind: "episodic", reason: "metadata_episodic" }],
  ["short_term", { kind: "episodic", reason: "metadata_episodic" }],
  ["short-term", { kind: "episodic", reason: "metadata_episodic" }]
]);

export class MemoryWriteRequest {
  constructor(input = {}) {
    this.input = input || {};
  }

  metadata() {
    return this.input.metadata && typeof this.input.metadata === "object" ? this.input.metadata : {};
  }

  rawValue() {
    return this.input.value ?? this.input.text ?? this.input.content ?? this.input.summary;
  }

  stringValue() {
    const value = this.rawValue();
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new Error("memory.write requires value");
    }
    return stringifyMemoryValue(value);
  }

  key() {
    return this.input.key || this.metadata().key;
  }

  staleOf() {
    return this.input.staleOf || this.metadata().staleOf;
  }

  classify(value = this.stringValue()) {
    const metadata = this.metadata();
    const key = String(this.key() || "").toLowerCase().trim();
    const explicit = String(
      metadata.kind ||
      metadata.type ||
      metadata.layer ||
      this.input.kind ||
      this.input.type ||
      this.input.layer ||
      ""
    )
      .toLowerCase()
      .trim();
    if (EXPLICIT_KINDS.has(explicit)) return EXPLICIT_KINDS.get(explicit);

    if (
      this.input.durable === true ||
      metadata.durable === true ||
      this.input.longTerm === true ||
      metadata.longTerm === true ||
      this.input.long_term === true ||
      metadata.long_term === true
    ) {
      return { kind: "fact", reason: "metadata_durable" };
    }
    if (/^(procedure|procedural|playbook|process|workflow)[._:-]/.test(key)) {
      return { kind: "playbook", reason: "key_playbook" };
    }
    if (/^(fact|facts|semantic|preference|preferences|convention|decision|lesson)[._:-]/.test(key)) {
      return { kind: "fact", reason: "key_fact" };
    }

    const text = String(value || "").trim();
    if (/^(fact|preference|convention|decision|lesson)\s*[:：]/i.test(text)) {
      return { kind: "fact", reason: "text_fact_marker" };
    }
    if (/^(procedure|playbook)\s*[:：]/i.test(text)) {
      return { kind: "playbook", reason: "text_playbook_marker" };
    }
    if (/^(事实|偏好|约定)\s*[:：]/u.test(text)) {
      return { kind: "fact", reason: "text_fact_marker" };
    }
    if (/^(流程|步骤|操作手册|剧本)\s*[:：]/u.test(text)) {
      return { kind: "playbook", reason: "text_playbook_marker" };
    }
    if (key) {
      return { kind: "fact", reason: "key_durable" };
    }
    return { kind: "episodic", reason: "default_episodic" };
  }
}
