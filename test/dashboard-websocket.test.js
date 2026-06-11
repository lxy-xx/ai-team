import test from "node:test";
import assert from "node:assert/strict";
import { dashboardSnapshotHash } from "../src/interfaces/http/dashboard-websocket.js";

test("dashboard websocket hash ignores generatedAt-only snapshot churn", () => {
  const first = dashboardSnapshotHash({
    generatedAt: "2026-05-24T15:00:00.000Z",
    counts: { intents: 1 }
  });
  const second = dashboardSnapshotHash({
    generatedAt: "2026-05-24T15:00:01.000Z",
    counts: { intents: 1 }
  });
  const changed = dashboardSnapshotHash({
    generatedAt: "2026-05-24T15:00:01.000Z",
    counts: { intents: 2 }
  });

  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test("dashboard websocket hash still tracks overview lanes, working agents, and staff counts", () => {
  const baseline = dashboardSnapshotHash({
    generatedAt: "2026-05-24T15:00:00.000Z",
    counts: { onlineAgents: 3, workingAgents: 1 },
    lanes: [{
      id: "active",
      cards: [{ id: "intent_1", status: "running", title: "客户成功中台" }]
    }],
    workingAgents: [{ name: "Ada", status: "working", taskId: "task_1" }]
  });

  assert.notEqual(baseline, dashboardSnapshotHash({
    generatedAt: "2026-05-24T15:00:01.000Z",
    counts: { onlineAgents: 3, workingAgents: 1 },
    lanes: [{
      id: "active",
      cards: [{ id: "intent_1", status: "verifying", title: "客户成功中台" }]
    }],
    workingAgents: [{ name: "Ada", status: "working", taskId: "task_1" }]
  }));
  assert.notEqual(baseline, dashboardSnapshotHash({
    generatedAt: "2026-05-24T15:00:01.000Z",
    counts: { onlineAgents: 3, workingAgents: 2 },
    lanes: [{
      id: "active",
      cards: [{ id: "intent_1", status: "running", title: "客户成功中台" }]
    }],
    workingAgents: [
      { name: "Ada", status: "working", taskId: "task_1" },
      { name: "Turing", status: "working", taskId: "task_2" }
    ]
  }));
  assert.notEqual(baseline, dashboardSnapshotHash({
    generatedAt: "2026-05-24T15:00:01.000Z",
    counts: { onlineAgents: 4, workingAgents: 1 },
    lanes: [{
      id: "active",
      cards: [{ id: "intent_1", status: "running", title: "客户成功中台" }]
    }],
    workingAgents: [{ name: "Ada", status: "working", taskId: "task_1" }]
  }));
});
