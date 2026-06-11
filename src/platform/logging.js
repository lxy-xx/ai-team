const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99
};

export function createLogger(level = process.env.AI_TEAM_LOG_LEVEL || "info") {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function write(name, data, message) {
    if ((LEVELS[name] ?? LEVELS.info) < threshold) return;
    const entry = {
      ts: new Date().toISOString(),
      level: name,
      message,
      ...data
    };
    const line = JSON.stringify(entry);
    if (name === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (data, message = "debug") => write("debug", data, message),
    info: (data, message = "info") => write("info", data, message),
    warn: (data, message = "warn") => write("warn", data, message),
    error: (data, message = "error") => write("error", data, message)
  };
}
