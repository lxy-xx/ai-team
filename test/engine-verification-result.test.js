import test from "node:test";
import assert from "node:assert/strict";
import { VerificationResult } from "../src/team-engine/domain/verification-result.js";
import { TASK_STATUS } from "../src/team-engine/domain/schema.js";

const checkedAt = "2026-05-23T10:00:00.000Z";

function task(patch = {}) {
  return {
    id: "task_1",
    reworkRounds: 0,
    artifactIds: ["artifact_impl"],
    runIds: ["run_impl"],
    verificationHistory: [],
    ...patch
  };
}

function result({ artifactId = "artifact_qa", runId = "run_qa", findings = ["needs changes"] } = {}) {
  return {
    artifact: {
      id: artifactId,
      data: { findings }
    },
    run: { id: runId }
  };
}

function transitionFor({ taskPatch, resultPatch, verdict = "reject" } = {}) {
  return new VerificationResult({
    task: task(taskPatch),
    result: result(resultPatch),
    verdict,
    checkedAt
  }).toTransition();
}

test("VerificationResult marks passing verification done with completion metadata", () => {
  const transition = transitionFor({
    verdict: "pass",
    resultPatch: { artifactId: "artifact_pass", runId: "run_pass", findings: [] }
  });

  assert.equal(transition.status, TASK_STATUS.DONE);
  assert.equal(transition.reason, "verification passed");
  assert.equal(transition.runId, "run_pass");
  assert.equal(transition.patch.completedAt, checkedAt);
  assert.equal(transition.patch.reworkRounds, undefined);
  assert.deepEqual(transition.patch.verificationHistory, [
    {
      artifactId: "artifact_pass",
      runId: "run_pass",
      verdict: "pass",
      findings: [],
      checkedAt
    }
  ]);
});

test("VerificationResult rejects back to waiting for rework", () => {
  const transition = transitionFor({
    taskPatch: { reworkRounds: 1 },
    resultPatch: { artifactId: "artifact_reject", runId: "run_reject" }
  });

  assert.equal(transition.status, TASK_STATUS.WAITING);
  assert.equal(transition.reason, "verification rejected for rework");
  assert.equal(transition.patch.reworkRounds, 2);
  assert.equal(transition.patch.blockedAt, undefined);
  assert.equal(transition.patch.latestRejectionArtifactId, "artifact_reject");
});

test("VerificationResult keeps rejected task in rework regardless of prior rounds", () => {
  const transition = transitionFor({
    taskPatch: { reworkRounds: 99 },
    resultPatch: { artifactId: "artifact_final_reject", runId: "run_final_reject" }
  });

  assert.equal(transition.status, TASK_STATUS.WAITING);
  assert.equal(transition.reason, "verification rejected for rework");
  assert.equal(transition.patch.reworkRounds, 100);
  assert.equal(transition.patch.blockedAt, undefined);
  assert.equal(transition.patch.latestRejectionArtifactId, "artifact_final_reject");
});

test("VerificationResult appends verification history and keeps artifact and run ids unique", () => {
  const transition = transitionFor({
    taskPatch: {
      artifactIds: ["artifact_impl", "artifact_qa"],
      runIds: ["run_impl", "run_qa"],
      verificationHistory: [
        {
          artifactId: "artifact_previous",
          runId: "run_previous",
          verdict: "reject",
          findings: ["old finding"],
          checkedAt: "2026-05-23T09:00:00.000Z"
        }
      ]
    },
    resultPatch: { artifactId: "artifact_qa", runId: "run_qa", findings: ["new finding"] },
    verdict: "pass"
  });

  assert.deepEqual(transition.patch.artifactIds, ["artifact_impl", "artifact_qa"]);
  assert.deepEqual(transition.patch.runIds, ["run_impl", "run_qa"]);
  assert.deepEqual(transition.patch.verificationHistory, [
    {
      artifactId: "artifact_previous",
      runId: "run_previous",
      verdict: "reject",
      findings: ["old finding"],
      checkedAt: "2026-05-23T09:00:00.000Z"
    },
    {
      artifactId: "artifact_qa",
      runId: "run_qa",
      verdict: "pass",
      findings: ["new finding"],
      checkedAt
    }
  ]);
});
