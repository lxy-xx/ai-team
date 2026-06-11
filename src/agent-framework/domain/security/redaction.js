const SECRET_KEY_PATTERN = /secret|token|password|credential|authorization|access[_-]?key|api[_-]?key|private[_-]?key|^key$/i;

export function redactSecretText(value) {
  return String(value || "")
    .replace(
      /("(?:(?:[^"]*(?:secret|token|password|credential|authorization|access[_-]?key|api[_-]?key|private[_-]?key)[^"]*)|key)"\s*:\s*)"[^"]*"/gi,
      '$1"[redacted]"'
    )
    .replace(/\b((?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTHORIZATION|ACCESS[-_]?KEY|API[-_]?KEY|PRIVATE[-_]?KEY)[A-Z0-9_]*)\s*=\s*)[^\s"']+/gi, "$1[redacted]")
    .replace(/\b((?:Authorization|X-Api-Key|Api-Key)\s*:\s*)(?:[A-Za-z][A-Za-z0-9_-]*\s+)?[^\s,;]+/gi, "$1[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]");
}

export function redactSecretValue(value, key = "") {
  if (SECRET_KEY_PATTERN.test(key)) return "[redacted]";
  if (typeof value === "string") return redactSecretText(value);
  if (Array.isArray(value)) return value.map((item) => redactSecretValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactSecretValue(entryValue, entryKey)]));
  }
  return value;
}

export function safeHostContextKeys(hostContext = {}) {
  if (!hostContext || typeof hostContext !== "object" || Array.isArray(hostContext)) return [];
  return Object.keys(hostContext).filter((key) => !SECRET_KEY_PATTERN.test(key)).sort();
}
