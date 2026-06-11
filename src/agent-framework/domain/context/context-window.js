const DEFAULT_CONTEXT_LIMITS = {
  maxPromptChars: 60_000,
  compressionThresholdRatio: 0.8
};

export function contextLimits(config = {}) {
  return {
    ...DEFAULT_CONTEXT_LIMITS,
    ...(config.context || {})
  };
}

export function mergeRollingSummary(previous, next) {
  return [previous, next].filter(Boolean).join("\n");
}
