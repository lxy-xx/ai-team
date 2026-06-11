export const ROLES = {
  CEO: "ceo_cto"
};

export const INTENT_STATUS = {
  NEW: "new",
  ROUTING: "routing",
  IN_PROGRESS: "in_progress",
  DONE: "done",
  BLOCKED: "blocked"
};

export const TASK_STATUS = {
  WAITING: "waiting",
  WORKING: "working",
  TESTING: "testing",
  DEPLOYING: "deploying",
  WORKED: "worked",
  TESTED: "tested",
  DONE: "done",
  BLOCKED: "blocked"
};

export const FEEDBACK_STATUS = {
  NEW: "new",
  TRIAGED: "triaged",
  LINKED_TO_TASK: "linked_to_task",
  DONE: "done",
  REJECTED: "rejected",
  ESCALATED: "escalated"
};

export const RUN_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  TIMED_OUT: "timed_out"
};

function sanitize(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_.:-]+/g, "_");
}

export function sessionKeyFor({ agentRole, channel = "unknown", threadId, userId }) {
  const peer = threadId || userId || "default";
  return [agentRole, channel, peer].map(sanitize).join(":");
}

export function taskRouteForStatus(task) {
  if (!task) return undefined;
  return task.claimedByRole || task.consumerRole;
}

export function toLegacyTask(intent) {
  const status = compatibilityStatusForIntent(intent?.status);
  return {
    id: intent.id,
    status,
    channel: intent.source?.channel || "cli",
    threadId: intent.source?.threadId || intent.source?.channel || "default",
    userId: intent.source?.userId || "unknown",
    userName: intent.source?.userName,
    text: intent.goal,
    replyTarget: intent.replyTarget,
    metadata: {
      ...(intent.context || {}),
      engineIntentId: intent.id
    },
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
    error: intent.status === INTENT_STATUS.BLOCKED ? intent.blocked : undefined,
    result: intent.finalSummary ? { summary: intent.finalSummary } : undefined
  };
}

function compatibilityStatusForIntent(status) {
  if (status === INTENT_STATUS.DONE) return "completed";
  if (status === INTENT_STATUS.BLOCKED) return "failed";
  return "pending";
}
