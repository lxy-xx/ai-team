import { createHttpServer } from "../http/server.js";
import { createSystem } from "../../system.js";
import { runChannelCli } from "./channel-cli.js";
import { runEngineCommand } from "./engine-cli.js";

export async function runOnce(system, text, { maxTicks = 25 } = {}) {
  let intentId;
  if (text) {
    const result = await system.channelGateway.deliverToCeo({
      channel: "cli",
      source: "manual_cli",
      transport: "cli",
      threadId: "cli",
      userId: "local",
      text,
      workspace: system.config.workspace,
      forceIntent: true
    });
    intentId = result.intent?.id || result.task?.metadata?.engineIntentId;
  }

  if (!system.engine || !intentId) {
    return { processed: false, engine: false, reason: "engine_unavailable" };
  }

  let lastResult = { processed: false, engine: true, count: 0, reason: "not_started" };
  for (let tick = 1; tick <= maxTicks; tick += 1) {
    lastResult = await system.scheduler.processOnce();
    const intent = await system.engineStore.getIntent(intentId);
    if (intent?.status === "done" || intent?.status === "blocked") {
      return { ...lastResult, intentId, status: intent.status, ticks: tick };
    }
  }

  const intent = await system.engineStore.getIntent(intentId);
  return {
    ...lastResult,
    intentId,
    status: intent?.status,
    ticks: maxTicks,
    reason: "max_ticks"
  };
}

export async function main(argv = process.argv) {
  const command = argv[2] || "server";
  const system = await createSystem({
    recoverInterruptedRuns: shouldRecoverInterruptedRuns(command, argv.slice(3))
  });

  if (command === "server" || command === "start") {
    const server = createHttpServer(system);
    server.listen(system.config.port, system.config.host, () => {
      system.logger.info(
        { host: system.config.host, port: system.config.port, runner: system.config.runner.type },
        "server listening"
      );
    });
    system.scheduler.start();
    await system.feishuLongConnection.start();
    return;
  }

  if (command === "once") {
    const text = argv.slice(3).join(" ").trim();
    const result = await runOnce(system, text);
    if (!result.processed) {
      console.log(`No task processed: ${result.reason}`);
    }
    return;
  }

  if (command === "engine") {
    console.log(JSON.stringify(await runEngineCommand(system, argv.slice(3)), null, 2));
    return;
  }

  if (command === "channels") {
    await runChannelCli(system, argv.slice(3));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

export function shouldRecoverInterruptedRuns(command, args = []) {
  if (command !== "engine") return true;
  const subcommand = args[0] || "health";
  return subcommand === "tick";
}
