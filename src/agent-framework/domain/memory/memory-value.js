export function stringifyMemoryValue(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeMemoryText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function entryText(entry = {}) {
  if (entry.text !== undefined && entry.text !== null) return String(entry.text);
  if (entry.value !== undefined && entry.value !== null) {
    return typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value);
  }
  if (entry.summary !== undefined && entry.summary !== null) return String(entry.summary);
  return "";
}
