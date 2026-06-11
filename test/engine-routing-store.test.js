import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EngineRoutingStore } from "../src/team-engine/infrastructure/routing-store.js";
import { onboardDefaultTeamRouting } from "../src/team-engine/infrastructure/default-team-onboarding.js";
import { OnboardingStateStore } from "../src/platform/onboarding-state-store.js";

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function initOnboardingStateStore(dataDir) {
  const onboardingStateStore = new OnboardingStateStore({ dataDir });
  await onboardingStateStore.init();
  return onboardingStateStore;
}

test("EngineRoutingStore persists wake rules outside agent folders", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-routing-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const store = new EngineRoutingStore({ dataDir, agentsDir });
  await store.init();

  await store.update("requirements", [
    { entityType: "intent", status: "new", afterRunStatus: "in_progress" },
    { entityType: "task", status: "waiting", consumerRole: "analyst", afterRunStatus: "done" }
  ]);

  const loaded = await store.get("requirements");
  assert.deepEqual(loaded.wakeRules, [
    { entityType: "intent", status: "new", afterRunStatus: "in_progress" },
    { entityType: "task", status: "waiting", consumerRole: "analyst", afterRunStatus: "done" }
  ]);
  assert.equal(await exists(path.join(dataDir, "engine", "routing", "requirements.json")), true);
  assert.equal(await exists(path.join(agentsDir, "Ada", ".agents", "routing.json")), false);
  assert.deepEqual(
    (await store.consumersFor({ entityType: "intent", status: "new", entity: { status: "new" } })).map((match) => match.role),
    ["requirements"]
  );
  assert.deepEqual(await store.taskConsumerRoles(), ["analyst"]);
});

test("EngineRoutingStore init does not synthesize the default team", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-routing-empty-"));
  const store = new EngineRoutingStore({ dataDir });
  await store.init();

  assert.deepEqual(await store.list(), []);
  assert.deepEqual(
    await store.consumersFor({ entityType: "intent", status: "new", entity: {} }),
    []
  );
  assert.deepEqual(await store.taskConsumerRoles(), []);
});

test("onboardDefaultTeamRouting seeds defaults once without overwriting custom rules", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-routing-onboard-"));
  const store = new EngineRoutingStore({ dataDir });
  await store.init();
  const onboardingStateStore = await initOnboardingStateStore(dataDir);

  const first = await onboardDefaultTeamRouting({ routingStore: store, onboardingStateStore });
  await store.update("engineer", [{ entityType: "task", status: "waiting", afterRunStatus: "done" }]);
  const second = await onboardDefaultTeamRouting({ routingStore: store, onboardingStateStore });

  assert.deepEqual(first.map((change) => change.role), ["ceo_cto", "product_manager", "customer_success", "operations", "engineer", "qa"]);
  assert.deepEqual(second, []);
  assert.deepEqual((await store.get("customer_success")).wakeRules, []);
  assert.deepEqual((await store.get("engineer")).wakeRules, [
    { entityType: "task", status: "waiting", afterRunStatus: "done" }
  ]);
  assert.deepEqual(
    (await store.consumersFor({ entityType: "intent", status: "new", entity: { status: "new" } })).map((match) => match.role),
    ["product_manager"]
  );
});

test("onboardDefaultTeamRouting requires an onboarding state store", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-routing-onboard-state-required-"));
  const store = new EngineRoutingStore({ dataDir });
  await store.init();

  await assert.rejects(
    () => onboardDefaultTeamRouting({ routingStore: store }),
    /onboardDefaultTeamRouting requires onboardingStateStore/
  );
  assert.deepEqual(await store.list(), []);
});

test("onboardDefaultTeamRouting state does not recreate removed default routing after first seed", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-routing-onboard-state-"));
  const store = new EngineRoutingStore({ dataDir });
  const onboardingStateStore = new OnboardingStateStore({ dataDir });
  await store.init();
  await onboardingStateStore.init();

  await onboardDefaultTeamRouting({ routingStore: store, onboardingStateStore });
  assert.equal(await store.has("engineer"), true);

  await fs.rm(path.join(dataDir, "engine", "routing", "engineer.json"), { force: true });
  await onboardDefaultTeamRouting({ routingStore: store, onboardingStateStore });

  assert.equal(await store.has("engineer"), false);
  assert.deepEqual(
    (await store.consumersFor({
      entityType: "task",
      status: "waiting",
      entity: { title: "实现新功能", description: "build the new feature" }
    })).map((match) => match.role),
    []
  );
});

test("onboardDefaultTeamRouting preserves default routing priority", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-routing-priority-"));
  const store = new EngineRoutingStore({ dataDir });
  await store.init();
  const onboardingStateStore = await initOnboardingStateStore(dataDir);
  await onboardDefaultTeamRouting({ routingStore: store, onboardingStateStore });

  assert.deepEqual(
    (await store.consumersFor({
      entityType: "task",
      status: "waiting",
      entity: { title: "实现客户反馈驱动的小功能", description: "Build a customer-visible feature." }
    })).map((match) => match.role),
    ["engineer"]
  );
  assert.deepEqual(
    (await store.consumersFor({
      entityType: "task",
      status: "waiting",
      entity: { title: "Anything", consumerRole: "operations" }
    })).map((match) => match.role),
    ["operations", "engineer"]
  );
});

test("EngineRoutingStore upgrades stale default consumerRole-only task routing", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-routing-upgrade-"));
  const routingDir = path.join(dataDir, "engine", "routing");
  await fs.mkdir(routingDir, { recursive: true });
  await fs.writeFile(path.join(routingDir, "engineer.json"), JSON.stringify({
    role: "engineer",
    wakeRules: [{ entityType: "task", status: "waiting", consumerRole: "engineer", afterRunStatus: "testing" }]
  }));
  const store = new EngineRoutingStore({ dataDir });
  await store.init();
  const onboardingStateStore = await initOnboardingStateStore(dataDir);
  await onboardDefaultTeamRouting({ routingStore: store, onboardingStateStore });

  const loaded = await store.get("engineer");
  assert.equal(loaded.wakeRules[0].consumerRole, undefined);
  assert.deepEqual(loaded.wakeRules[0], { entityType: "task", status: "waiting", afterRunStatus: "testing" });
  assert.deepEqual(
    (await store.consumersFor({
      entityType: "task",
      status: "waiting",
      entity: { title: "创建独立静态网页项目骨架" }
    })).map((match) => match.role),
    ["engineer"]
  );
  const persisted = JSON.parse(await fs.readFile(path.join(routingDir, "engineer.json"), "utf8"));
  assert.equal(persisted.wakeRules[0].consumerRole, undefined);
});

test("EngineRoutingStore migrates legacy agent routing as input but writes Engine-owned files", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-routing-migration-"));
  const agentsDir = path.join(dataDir, "agents-root");
  await fs.mkdir(path.join(agentsDir, "Ada", ".agents"), { recursive: true });
  await fs.writeFile(path.join(agentsDir, "Ada", "agent.json"), JSON.stringify({ role: "requirements", name: "Ada" }));
  await fs.writeFile(
    path.join(agentsDir, "Ada", ".agents", "routing.json"),
    JSON.stringify({ wakeRules: [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }] })
  );

  const store = new EngineRoutingStore({ dataDir, agentsDir });
  await store.init();

  assert.deepEqual(await store.get("requirements"), {
    role: "requirements",
    wakeRules: [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }]
  });
  await store.update("requirements", [{ entityType: "task", status: "waiting", consumerRole: "analyst" }]);
  assert.deepEqual(await store.get("requirements"), {
    role: "requirements",
    wakeRules: [{ entityType: "task", status: "waiting", consumerRole: "analyst" }]
  });
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(agentsDir, "Ada", ".agents", "routing.json"), "utf8")).wakeRules,
    [{ entityType: "intent", status: "new", afterRunStatus: "in_progress" }]
  );
});
