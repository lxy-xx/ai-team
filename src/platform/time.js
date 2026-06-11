export function nowIso(clock = Date) {
  return new clock().toISOString();
}

export function nowMs(clock = Date) {
  return clock.now();
}

export function isoFromEpochMs(epochMs) {
  return new Date(epochMs).toISOString();
}
