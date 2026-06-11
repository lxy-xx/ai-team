const EMPTY_ENGINE_MODEL = Object.freeze({
  intents: [],
  tasks: [],
  runs: [],
  artifacts: [],
  sessions: [],
  feedback: []
});

async function engineHealth(system) {
  if (!system.engine) return { ok: false, available: false };
  if (typeof system.engine.health === "function") return system.engine.health();
  return { ok: false, available: false };
}

async function engineReadModel(system) {
  if (typeof system.engine?.readModel === "function") return system.engine.readModel();
  if (typeof system.engineStore?.readModel === "function") return system.engineStore.readModel();
  if (typeof system.engine?.store?.readModel === "function") return system.engine.store.readModel();
  return { ...EMPTY_ENGINE_MODEL };
}

export async function runEngineCommand(system, args) {
  const subcommand = args[0] || "health";
  if (subcommand === "health") return engineHealth(system);
  if (subcommand === "tick") {
    if (!system.engine) return { processed: false, engine: false, reason: "engine_unavailable" };
    return system.scheduler.processOnce();
  }

  const model = await engineReadModel(system);
  if (subcommand === "intents") return { intents: model.intents };
  if (subcommand === "tasks") return { tasks: model.tasks };
  if (subcommand === "runs") return { runs: model.runs };

  throw new Error(`Unknown engine command: ${subcommand || ""}`.trim());
}
