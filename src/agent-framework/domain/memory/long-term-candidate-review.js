import { entryText, normalizeMemoryText, stringifyMemoryValue } from "./memory-value.js";

export class LongTermCandidateReview {
  constructor({ canonicalEntries = [] } = {}) {
    this.canonicalEntries = canonicalEntries.map((entry) => ({
      ...entry,
      text: entryText(entry)
    }));
  }

  evaluate({ key, text, value, staleOf } = {}) {
    const normalized = normalizeMemoryText(text);
    const normalizedValue = normalizeMemoryText(stringifyMemoryValue(value ?? text));
    const duplicate = this.canonicalEntries.find((entry) => {
      const entryNormalized = normalizeMemoryText(entry.text);
      const entryValueNormalized = normalizeMemoryText(stringifyMemoryValue(entry.value ?? entry.text));
      return entryNormalized === normalized || (key && entry.key === String(key) && entryValueNormalized === normalizedValue);
    });
    const conflicts = key
      ? this.canonicalEntries.filter((entry) => {
        const entryNormalized = normalizeMemoryText(entry.text);
        const entryValueNormalized = normalizeMemoryText(stringifyMemoryValue(entry.value ?? entry.text));
        return entry.key === String(key) && entryNormalized !== normalized && entryValueNormalized !== normalizedValue;
      })
      : [];
    return {
      duplicateOf: duplicate?.id,
      conflictsWith: conflicts.map((entry) => entry.id),
      staleOf: staleOf ? String(staleOf) : undefined,
      similarity: {
        normalizedText: normalized,
        duplicate: duplicate ? { id: duplicate.id, kind: duplicate.kind } : undefined,
        conflicts: conflicts.map((entry) => ({ id: entry.id, kind: entry.kind })),
        staleOf: staleOf ? String(staleOf) : undefined,
        comparedCanonicalCount: this.canonicalEntries.length
      }
    };
  }
}
