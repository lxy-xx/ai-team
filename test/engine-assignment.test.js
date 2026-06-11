import test from "node:test";
import assert from "node:assert/strict";
import { AssignmentBuilder } from "../src/team-engine/adapters/agent-framework/assignment-builder.js";
import { defaultAgentProfileForRole } from "../src/agent-framework/infrastructure/default-agent-onboarding.js";

const intent = {
  id: "intent_1",
  goal: "Ship the feature",
  source: {
    channel: "cli",
    threadId: "thread_1"
  }
};

const task = {
  id: "task_1",
  title: "Implement",
  description: "Write the code"
};

test("AssignmentBuilder builds AgentRuntime assignment text with expected sections", () => {
  const assignment = new AssignmentBuilder();

  const text = assignment.buildAgentRuntimeAssignment({
    role: "engineer",
    intent,
    task,
    entity: task,
    entityType: "task",
    previousArtifacts: [{ id: "artifact_1", kind: "task_graph" }],
    run: { id: "run_1" },
    profile: defaultAgentProfileForRole("engineer")
  });

  assert.match(text, /## Current assignment/);
  assert.match(text, /Role: engineer/);
  assert.match(text, /Engine entity type: task/);
  assert.match(text, /Engine run id: run_1/);
  assert.match(text, /## Expected final output/);
  assert.match(text, /implementation_report/);
  assert.match(text, /## Intent/);
  assert.match(text, /"id": "intent_1"/);
  assert.match(text, /## Task/);
  assert.match(text, /"id": "task_1"/);
  assert.match(text, /## Previous Engine Artifacts/);
  assert.match(text, /artifact_1/);
});

test("AssignmentBuilder summarizes previous artifacts instead of injecting full payloads", () => {
  const assignment = new AssignmentBuilder();
  const blob = `artifact-payload-${"x".repeat(25_000)}-end`;

  const text = assignment.buildAgentRuntimeAssignment({
    role: "qa",
    intent,
    task,
    entity: task,
    entityType: "task",
    previousArtifacts: [{ id: "artifact_large", data: { blob } }],
    run: { id: "run_2" }
  });

  assert.match(text, /artifact_large/);
  assert.match(text, /payload omitted/);
  assert.equal(text.includes(blob), false);
});

test("AssignmentBuilder builds host context with string values only for present ids", () => {
  const assignment = new AssignmentBuilder();

  assert.deepEqual(
    assignment.hostContextForRun({
      run: { id: 123 },
      entityType: "task",
      entityId: "task_1",
      intent,
      task
    }),
    {
      engineRunId: "123",
      engineEntityType: "task",
      engineEntityId: "task_1",
      intentId: "intent_1",
      taskId: "task_1"
    }
  );
});

test("AssignmentBuilder tells the product manager to create role-agnostic task entities", () => {
  const assignment = new AssignmentBuilder();

  const text = assignment.outputContractFor("product_manager", defaultAgentProfileForRole("product_manager"));

  assert.match(text, /task_graph/);
  assert.match(text, /title/);
  assert.match(text, /description/);
  assert.doesNotMatch(text, /must include:.*consumerRole/);
  assert.doesNotMatch(text, /engineer/);
  assert.match(text, /Engine routing selects workers/);
});
