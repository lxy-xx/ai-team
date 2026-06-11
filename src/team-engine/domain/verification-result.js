import { TASK_STATUS } from "./schema.js";

function appendUnique(values, value) {
  return [...new Set([...(Array.isArray(values) ? values : []), value].filter(Boolean))];
}

export class VerificationResult {
  constructor({ task, result, verdict, checkedAt }) {
    this.task = task;
    this.result = result;
    this.verdict = verdict;
    this.checkedAt = checkedAt;
  }

  toTransition() {
    if (this.verdict === "pass") {
      return {
        status: TASK_STATUS.DONE,
        runId: this.runId,
        reason: "verification passed",
        patch: {
          ...this.basePatch(),
          completedAt: this.checkedAt
        }
      };
    }

    const reworkRounds = Number(this.task?.reworkRounds || 0) + 1;
    return {
      status: TASK_STATUS.WAITING,
      runId: this.runId,
      reason: "verification rejected for rework",
      patch: {
        ...this.basePatch(),
        reworkRounds,
        latestRejectionArtifactId: this.artifactId
      }
    };
  }

  basePatch() {
    return {
      verificationHistory: [
        ...(Array.isArray(this.task?.verificationHistory) ? this.task.verificationHistory : []),
        {
          artifactId: this.artifactId,
          runId: this.runId,
          verdict: this.verdict,
          findings: this.result?.artifact?.data?.findings || [],
          checkedAt: this.checkedAt
        }
      ],
      artifactIds: appendUnique(this.task?.artifactIds, this.artifactId),
      runIds: appendUnique(this.task?.runIds, this.runId)
    };
  }

  get artifactId() {
    return this.result?.artifact?.id;
  }

  get runId() {
    return this.result?.run?.id;
  }
}
