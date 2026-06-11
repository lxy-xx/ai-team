import test from "node:test";
import assert from "node:assert/strict";
import { runEngineCommand, runOnce } from "../src/index.js";

test("runOnce ticks TeamEngine until the created intent finishes", async () => {
  let ticks = 0;
  let delivered;
  const system = {
    config: { workspace: "/workspace" },
    channelGateway: {
      async deliverToCeo(input) {
        delivered = input;
        return { intent: { id: "intent_1" }, created: true, ignored: false };
      }
    },
    scheduler: {
      async processOnce() {
        ticks += 1;
        return { processed: true, engine: true, count: 1 };
      }
    },
    engine: {},
    engineStore: {
      async getIntent(id) {
        assert.equal(id, "intent_1");
        return { id, status: ticks >= 3 ? "done" : "in_progress" };
      }
    }
  };

  const result = await runOnce(system, "ship it", { maxTicks: 8 });

  assert.equal(delivered.text, "ship it");
  assert.equal(delivered.workspace, "/workspace");
  assert.equal(ticks, 3);
  assert.equal(result.status, "done");
  assert.equal(result.intentId, "intent_1");
});

test("runOnce reports unavailable without TeamEngine", async () => {
  const system = {
    config: { workspace: "/workspace" },
    channelGateway: {
      async deliverToCeo() {
        return { created: true, ignored: false };
      }
    },
    scheduler: {}
  };

  const result = await runOnce(system, "no-engine");

  assert.deepEqual(result, { processed: false, engine: false, reason: "engine_unavailable" });
});

test("runEngineCommand returns JSON-ready engine command payloads", async () => {
  let ticked = false;
  const system = {
    engine: {
      async health() {
        return { ok: true };
      }
    },
    scheduler: {
      async processOnce() {
        ticked = true;
        return { processed: true, engine: true, count: 1 };
      }
    },
    engineStore: {
      async readModel() {
        return {
          intents: [{ id: "intent_1" }],
          tasks: [{ id: "task_1" }],
          runs: [{ id: "run_1" }],
          artifacts: [],
          sessions: [],
          feedback: []
        };
      }
    }
  };

  assert.deepEqual(await runEngineCommand(system, ["health"]), { ok: true });
  assert.deepEqual(await runEngineCommand(system, []), { ok: true });
  assert.deepEqual(await runEngineCommand(system, ["tick"]), { processed: true, engine: true, count: 1 });
  assert.deepEqual(await runEngineCommand(system, ["intents"]), { intents: [{ id: "intent_1" }] });
  assert.deepEqual(await runEngineCommand(system, ["tasks"]), { tasks: [{ id: "task_1" }] });
  assert.deepEqual(await runEngineCommand(system, ["runs"]), { runs: [{ id: "run_1" }] });
  assert.equal(ticked, true);
  await assert.rejects(() => runEngineCommand(system, ["bogus"]), /Unknown engine command: bogus/);
});

test("runEngineCommand reports unavailable health when engine has no health method", async () => {
  assert.deepEqual(await runEngineCommand({ engine: {} }, ["health"]), { ok: false, available: false });
});

test("runEngineCommand reports unavailable when Engine is unavailable", async () => {
  const system = {
    scheduler: {
      async processOnce() {
        throw new Error("scheduler should not tick when engine is unavailable");
      }
    }
  };

  assert.deepEqual(await runEngineCommand(system, ["tick"]), {
    processed: false,
    engine: false,
    reason: "engine_unavailable"
  });
});
