import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildDashboardData } from "../src/interfaces/http/read-models/dashboard-read-model-controller.js";
import { MemoryStore } from "../src/agent-framework/infrastructure/memory-store.js";
import { AgentConfigStore } from "../src/agent-framework/infrastructure/agent-config-store.js";
import { onboardDefaultAgentProfiles } from "../src/agent-framework/infrastructure/default-agent-onboarding.js";
import { AgentMemoryStore } from "../src/agent-framework/infrastructure/agent-state-store.js";
import { EngineRoutingStore } from "../src/team-engine/infrastructure/routing-store.js";
import { onboardDefaultTeamRouting } from "../src/team-engine/infrastructure/default-team-onboarding.js";
import { ToolRegistry } from "../src/agent-framework/domain/tools/tool-registry.js";
import { ProviderConfigStore } from "../src/agent-framework/infrastructure/provider/provider-config-store.js";
import { OnboardingStateStore } from "../src/platform/onboarding-state-store.js";
import { CodingAgentLauncherStore } from "../src/agent-framework/infrastructure/coding-agent-launcher-store.js";

const droppedConfigFields = ["miss" + "ion", "ali" + "as"];

function assertNoDroppedConfigFields(value) {
  for (const field of droppedConfigFields) assert.equal(field in value, false);
}

async function onboardingStateStoreFor(dataDir) {
  const onboardingStateStore = new OnboardingStateStore({ dataDir });
  await onboardingStateStore.init();
  return onboardingStateStore;
}

async function onboardProfilesOnce(agentConfigStore, dataDir) {
  return onboardDefaultAgentProfiles({
    agentConfigStore,
    onboardingStateStore: await onboardingStateStoreFor(dataDir)
  });
}

async function onboardRoutingOnce(routingStore, dataDir) {
  return onboardDefaultTeamRouting({
    routingStore,
    onboardingStateStore: await onboardingStateStoreFor(dataDir)
  });
}

async function writeAgentProfileDir(agentsDir, dirName, metadata) {
  const agentDir = path.join(agentsDir, dirName);
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(path.join(agentDir, "agent.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

test("dashboard data uses engine read model when engine is available", async () => {
  const now = "2026-05-20T01:00:00.000Z";
  const readModel = {
    intents: [
      {
        id: "intent_alpha",
        status: "in_progress",
        goal: "Outcome:\nLaunch the onboarding automation\n\nContext:\nUse the existing dashboard setup flow.\n\nAcceptance criteria:\nActivation checklist passes.\n\nConstraints and risks:\nNo external dependency.",
        source: { channel: "feishu", threadId: "client-a", userId: "u-a", userName: "Client A" },
        context: {
          briefQuality: 100,
          briefCompletedFields: ["outcome", "context", "acceptance", "constraints", "secret-token"],
          briefFields: {
            outcome: "Launch the onboarding automation",
            context: "Use the existing dashboard setup flow.",
            acceptance: "Activation checklist passes.",
            constraints: "No external dependency."
          },
          secretToken: "do-not-expose"
        },
        acceptanceCriteria: ["Activation checklist passes."],
        constraints: ["No external dependency."],
        taskIds: ["task_alpha"],
        runIds: ["run_jobs"],
        createdAt: now,
        updatedAt: now,
        operations: [
          {
            at: "2026-05-20T01:01:00.000Z",
            agentRole: "product_manager",
            action: "status_transition",
            fromStatus: "new",
            toStatus: "in_progress",
            runId: "run_jobs",
            reason: "Darwin converted the ask into an executable plan."
          }
        ]
      }
    ],
    tasks: [
      {
        id: "task_alpha",
        intentId: "intent_alpha",
        status: "testing",
        title: "Implement onboarding checklist",
        description: "Build the checklist and verify the behavior",
        producerRole: "product_manager",
        consumerRole: "engineer",
        reworkRounds: 1,
        verificationHistory: [
          { verdict: "reject", artifactId: "artifact_reject" },
          { verdict: "pass", artifactId: "artifact_pass" }
        ],
        artifactIds: ["artifact_impl", "artifact_pass"],
        runIds: ["run_build", "run_qa"],
        createdAt: now,
        updatedAt: now,
        operations: [
          {
            at: "2026-05-20T01:02:00.000Z",
            agentRole: "engineer",
            action: "status_transition",
            fromStatus: "waiting",
            toStatus: "working",
            runId: "run_build"
          },
          {
            at: "2026-05-20T01:03:00.000Z",
            agentRole: "qa",
            action: "status_transition",
            fromStatus: "testing",
            toStatus: "done",
            runId: "run_qa"
          }
        ]
      }
    ],
    runs: [
      {
        id: "run_build",
        entityType: "task",
        entityId: "task_alpha",
        agentRole: "engineer",
        status: "completed",
        runner: "codex_app_server",
        provider: "codex",
        model: "gpt-5.5",
        agentConfigSnapshot: {
          role: "engineer",
          title: "Coding Engineer",
          prompt: "Sensitive role prompt",
          modelProvider: { providerId: "codex", model: "gpt-5.5" },
          skills: [{ id: "patching", description: "Sensitive skill details" }],
          mcps: [{ id: "github", configJson: "{}" }],
          tools: [{ id: "Bash", category: "execution", risk: "high", policy: "approval_required" }]
        },
        transcriptSummary: "Sensitive implementation transcript",
        transcript: "Full internal transcript"
      },
      { id: "run_qa", entityId: "task_alpha", agentRole: "qa", status: "completed" }
    ],
    artifacts: [
      { id: "artifact_impl", entityId: "task_alpha", role: "engineer", kind: "implementation" },
      {
        id: "artifact_reject",
        entityId: "task_alpha",
        role: "qa",
        kind: "turing_verification_report",
        data: { verdict: "reject" }
      },
      {
        id: "artifact_pass",
        entityId: "task_alpha",
        role: "qa",
        kind: "turing_verification_report",
        data: { verdict: "pass" }
      }
    ],
    sessions: [],
    feedback: [
      {
        id: "feedback_alpha",
        status: "triaged",
        priority: "high",
        intentId: "intent_alpha",
        triageArtifactId: "artifact_reject",
        dedupeKey: "secret-client-thread-key",
        text: "The onboarding copy is unclear",
        source: { channel: "feishu", threadId: "client-a", userName: "Client A" },
        createdAt: now,
        updatedAt: now,
        operations: [
          {
            at: "2026-05-20T01:04:00.000Z",
            agentRole: "customer_success",
            action: "status_transition",
            fromStatus: "new",
            toStatus: "triaged",
            reason: "Linked to the onboarding intent."
          }
        ]
      },
      {
        id: "feedback_done",
        status: "done",
        linkedTaskId: "task_alpha",
        text: "The onboarding copy is fixed",
        source: { channel: "feishu", threadId: "client-a", userName: "Client A" },
        createdAt: now,
        updatedAt: now
      }
    ]
  };
  const engine = {
    async readModel() {
      return readModel;
    },
    async health() {
      return { ok: true, activeRuns: 1 };
    }
  };
  const data = await buildDashboardData({
    config: {
      runner: { type: "mock" },
      provider: { id: "mock" },
      workspace: "/tmp/ai-team-dashboard-engine-test",
      pollIntervalMs: 5000,
      feedbackScanIntervalMs: 14_400_000
    },
    engine
  });

  assert.deepEqual(data.nav, ["Overview", "Team", "Evidence", "Intake", "Projects", "Settings"]);
  assert.deepEqual(data.filters, ["All"]);
  assert.equal(data.engine.snapshot.intents[0].id, "intent_alpha");
  assert.equal(data.engine.snapshot.intents[0].brief.outcome, "Launch the onboarding automation");
  assert.deepEqual(data.engine.snapshot.intents[0].brief.completedFields, ["outcome", "context", "acceptance", "constraints"]);
  assert.equal(data.engine.snapshot.intents[0].brief.secretToken, undefined);
  assert.deepEqual(data.engine.health, { ok: true, activeRuns: 1 });
  assert.deepEqual(data.engine.snapshot.intents[0].runIds, ["run_jobs"]);
  assert.equal(data.engine.snapshot.intents[0].operations[0].agentRole, "product_manager");
  assert.ok(data.columns.find((column) => column.title === "TESTING").items.some((item) => item.rawId === "task_alpha"));
  assert.ok(data.columns.find((column) => column.title === "FEEDBACK").items.some((item) => item.rawId === "feedback_done"));
  assert.deepEqual(data.workingAgents, []);
  const intentCard = data.columns.flatMap((column) => column.items).find((item) => item.rawId === "intent_alpha");
  assert.equal(intentCard.intentId, "intent_alpha");
  assert.equal(intentCard.title, "Launch the onboarding automation");
  assert.equal(intentCard.brief.acceptance, "Activation checklist passes.");
  const taskCard = data.columns.flatMap((column) => column.items).find((item) => item.rawId === "task_alpha");
  assert.equal(taskCard.intentId, "intent_alpha");
  const feedbackCard = data.columns.flatMap((column) => column.items).find((item) => item.rawId === "feedback_alpha");
  assert.equal(feedbackCard.intentId, "intent_alpha");
  const linkedFeedbackCard = data.columns.flatMap((column) => column.items).find((item) => item.rawId === "feedback_done");
  assert.equal(linkedFeedbackCard.intentId, "intent_alpha");
  assert.equal(taskCard.reworkRounds, 1);
  assert.equal(taskCard.verificationCount, 2);
  assert.equal(taskCard.ownerRole, "engineer");
  assert.equal(taskCard.artifactCount, 2);
  assert.equal(taskCard.runCount, 2);
  assert.equal(data.reports.qaRuns, 2);
  assert.equal(data.reports.qaRejects, 1);
  assert.equal(data.reports.rejectionRate, 50);
  assert.equal(data.ownerAttention.status, "needs_attention");
  assert.ok(data.ownerAttention.items.some((item) => item.kind === "qa_loop" && item.intentId === "intent_alpha"));
  assert.ok(data.ownerAttention.items.some((item) => item.kind === "feedback" && item.intentId === "intent_alpha"));
  assert.doesNotMatch(JSON.stringify(data.ownerAttention), /Sensitive role prompt|Full internal transcript|do-not-expose/);
  assert.equal(data.engine.snapshot.feedback[0].priority, "high");
  assert.equal(data.engine.snapshot.feedback[0].triageArtifactId, "artifact_reject");
  assert.equal(data.engine.snapshot.feedback[0].dedupeKey, undefined);
  assert.equal(data.engine.snapshot.feedback[0].operations[0].agentRole, "customer_success");
  assert.equal(data.engine.snapshot.artifacts[1].data, undefined);
  assert.deepEqual(data.engine.snapshot.runs[0].agentConfigSnapshot, {
    role: "engineer",
    title: "Coding Engineer",
    modelProvider: { providerId: "codex", model: "gpt-5.5" },
    skills: ["patching"],
    mcps: ["github"],
    tools: [{ id: "Bash", category: "execution", risk: "high", policy: "approval_required" }]
  });
  assert.equal(data.engine.snapshot.runs[0].agentConfigSnapshot.prompt, undefined);
  assert.equal(data.engine.snapshot.runs[0].transcriptSummary, undefined);
  assert.equal(data.engine.snapshot.runs[0].transcript, undefined);
  const dossier = data.evidence.dossiers.find((item) => item.id === "intent_alpha");
  assert.equal(dossier.title, "Launch the onboarding automation");
  assert.equal(dossier.brief.quality, 100);
  assert.equal(dossier.brief.constraints, "No external dependency.");
  assert.equal(dossier.metrics.tasks, 1);
  assert.equal(dossier.metrics.runs, 2);
  assert.equal(dossier.metrics.artifacts, 3);
  assert.equal(dossier.metrics.feedback, 2);
  assert.equal(dossier.metrics.operations, 4);
  assert.equal(dossier.metrics.qaRuns, 2);
  assert.equal(dossier.metrics.qaRejects, 1);
  assert.equal(dossier.review.state, "needs_attention");
  assert.equal(dossier.review.severity, "high");
  assert.equal(dossier.review.progress, 0);
  assert.equal(dossier.review.nextAction.kind, "close_verified_task");
  assert.equal(dossier.review.nextAction.role, "engineer");
  assert.equal(dossier.review.nextAction.targetTaskId, "task_alpha");
  assert.deepEqual(dossier.review.counts, {
    tasks: 1,
    doneTasks: 0,
    openTasks: 1,
    blockedTasks: 0,
    failedRuns: 0,
    openFeedback: 1,
    qaRejects: 1,
    verifiedOpenTasks: 1
  });
  assert.ok(dossier.review.risks.some((risk) => risk.kind === "verified_task_not_closed" && risk.taskId === "task_alpha"));
  assert.ok(dossier.review.risks.some((risk) => risk.kind === "open_feedback" && risk.feedbackId === "feedback_alpha"));
  assert.deepEqual(dossier.operations.map((operation) => operation.entityType), ["intent", "task", "task", "feedback"]);
  assert.equal(dossier.runs[0].agentConfigSnapshot.prompt, undefined);
  assert.equal(dossier.artifacts[1].data, undefined);
  assert.equal(data.counts.feedback, 2);
});

test("dashboard intent brief only exposes structured fields and clamps quality", async () => {
  const now = "2026-05-20T01:00:00.000Z";
  const engine = {
    async health() {
      return { ok: true };
    },
    async readModel() {
      return {
        intents: [
          {
            id: "intent_high_quality",
            status: "new",
            goal: "Legacy fallback should not become the card title",
            context: {
              briefQuality: 150,
              briefCompletedFields: ["outcome", "unknown-field"],
              briefFields: { outcome: "High quality structured outcome" }
            },
            acceptanceCriteria: ["Legacy acceptance should not leak into brief"],
            constraints: ["Legacy constraint should not leak into brief"],
            createdAt: now,
            updatedAt: now
          },
          {
            id: "intent_low_quality",
            status: "new",
            goal: "Low quality structured work",
            context: {
              briefQuality: -10,
              briefFields: { outcome: "Low quality structured outcome" }
            },
            createdAt: now,
            updatedAt: now
          },
          {
            id: "intent_legacy_only",
            status: "new",
            goal: "Legacy only intent",
            context: {},
            acceptanceCriteria: ["Legacy acceptance should stay outside intake brief"],
            constraints: ["Legacy constraint should stay outside intake brief"],
            createdAt: now,
            updatedAt: now
          }
        ],
        tasks: [],
        runs: [],
        artifacts: [],
        sessions: [],
        feedback: []
      };
    }
  };

  const data = await buildDashboardData({
    config: { runner: { type: "mock" }, workspace: "/tmp/ai-team-dashboard-brief-clamp-test" },
    engine
  });

  const highQuality = data.engine.snapshot.intents.find((intent) => intent.id === "intent_high_quality");
  assert.equal(highQuality.brief.quality, 100);
  assert.deepEqual(highQuality.brief.completedFields, ["outcome"]);
  assert.equal(highQuality.brief.acceptance, undefined);
  assert.equal(highQuality.brief.constraints, undefined);

  const lowQuality = data.engine.snapshot.intents.find((intent) => intent.id === "intent_low_quality");
  assert.equal(lowQuality.brief.quality, 0);

  const legacyOnly = data.engine.snapshot.intents.find((intent) => intent.id === "intent_legacy_only");
  assert.equal(legacyOnly.brief, undefined);
  const legacyCard = data.columns.flatMap((column) => column.items).find((item) => item.rawId === "intent_legacy_only");
  assert.equal(legacyCard.title, "Legacy only intent");
  assert.equal(legacyCard.brief, undefined);
});

test("evidence dossiers derive QA events from legacy verification artifacts", async () => {
  const now = "2026-05-20T02:00:00.000Z";
  const data = await buildDashboardData({
    config: {
      runner: { type: "mock" },
      provider: { id: "mock" },
      workspace: "/tmp/ai-team-dashboard-legacy-qa-test",
      pollIntervalMs: 5000,
      feedbackScanIntervalMs: 14_400_000
    },
    engine: {
      async readModel() {
        return {
          intents: [{ id: "intent_legacy", status: "in_progress", goal: "Verify a legacy task", taskIds: ["task_legacy"], source: { channel: "cli" }, createdAt: now, updatedAt: now }],
          tasks: [{ id: "task_legacy", intentId: "intent_legacy", status: "testing", title: "Legacy QA task", verificationHistory: [], createdAt: now, updatedAt: now }],
          runs: [],
          artifacts: [
            {
              id: "artifact_legacy_reject",
              entityType: "task",
              entityId: "task_legacy",
              role: "qa",
              kind: "turing_verification_report",
              data: {
                verdict: "reject",
                findings: ["Missing rollback coverage"],
                secretInternalNotes: "do not expose"
              },
              createdAt: now,
              updatedAt: now
            }
          ],
          sessions: [],
          feedback: []
        };
      }
    }
  });

  const dossier = data.evidence.dossiers[0];
  assert.equal(dossier.id, "intent_legacy");
  assert.equal(dossier.metrics.qaRuns, 1);
  assert.equal(dossier.metrics.qaRejects, 1);
  assert.deepEqual(dossier.verifications[0], {
    taskId: "task_legacy",
    taskTitle: "Legacy QA task",
    artifactId: "artifact_legacy_reject",
    runId: undefined,
    verdict: "reject",
    findings: ["Missing rollback coverage"],
    checkedAt: now
  });
  assert.equal(dossier.verifications[0].secretInternalNotes, undefined);
});

test("evidence dossiers include Overview-linked intents beyond the recency cap", async () => {
  const intents = Array.from({ length: 21 }, (_, index) => ({
    id: `intent_${String(index).padStart(2, "0")}`,
    status: "done",
    goal: `Completed intent ${index}`,
    createdAt: `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    updatedAt: `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`
  }));
  const data = await buildDashboardData({
    config: { runner: { type: "mock" }, workspace: "/tmp/ai-team-dashboard-evidence-cap" },
    engine: {
      async readModel() {
        return { intents, tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
      }
    }
  });

  const boardIntentIds = new Set(data.columns.flatMap((column) => column.items.map((item) => item.intentId).filter(Boolean)));
  assert.equal(boardIntentIds.has("intent_00"), true);
  assert.equal(data.evidence.dossiers.some((dossier) => dossier.id === "intent_00"), true);
});

test("dashboard data uses engine.store read model when direct engine readModel is unavailable", async () => {
  const readModel = {
    intents: [{ id: "intent_store", status: "new", goal: "Store-backed dashboard", source: { channel: "cli" } }],
    tasks: [],
    runs: [],
    artifacts: [],
    sessions: [],
    feedback: [{ id: "feedback_rejected", status: "rejected", text: "Not actionable", source: { channel: "cli" } }]
  };

  const data = await buildDashboardData({
    config: {
      runner: { type: "mock" },
      provider: { id: "mock" },
      workspace: "/tmp/ai-team-dashboard-engine-store-test",
      pollIntervalMs: 5000,
      feedbackScanIntervalMs: 14_400_000
    },
    engine: { store: { async readModel() { return readModel; } } }
  });

  assert.equal(data.engine.snapshot.intents[0].id, "intent_store");
  assert.ok(data.columns.find((column) => column.title === "FEEDBACK").items.some((item) => item.rawId === "feedback_rejected"));
});

test("dashboard owner attention ignores resolved historical signals", async () => {
  const now = "2026-05-24T10:00:00.000Z";
  const data = await buildDashboardData({
    config: { runner: { type: "mock" }, workspace: "/tmp/ai-team-dashboard-resolved-attention-test" },
    engine: {
      async readModel() {
        return {
          intents: [
            { id: "intent_done", status: "done", goal: "Completed color cleanup", taskIds: ["task_done"], createdAt: now, updatedAt: now },
            { id: "intent_active", status: "in_progress", goal: "Active customer follow-up", createdAt: now, updatedAt: now }
          ],
          tasks: [
            { id: "task_done", intentId: "intent_done", status: "done", title: "Remove primary color", consumerRole: "engineer", createdAt: now, updatedAt: now }
          ],
          runs: [
            { id: "run_failed_old", entityType: "task", entityId: "task_done", agentRole: "engineer", status: "failed", error: { message: "Old failed attempt" }, createdAt: now, updatedAt: now },
            { id: "run_completed_later", entityType: "task", entityId: "task_done", agentRole: "engineer", status: "completed", createdAt: "2026-05-24T10:05:00.000Z", updatedAt: "2026-05-24T10:05:00.000Z" }
          ],
          artifacts: [],
          sessions: [],
          feedback: [
            { id: "feedback_resolved", status: "new", intentId: "intent_done", text: "The primary color is gone now.", createdAt: now, updatedAt: now },
            { id: "feedback_active", status: "new", intentId: "intent_active", text: "Please triage the active follow-up.", createdAt: now, updatedAt: now }
          ]
        };
      }
    }
  });

  const attentionIds = data.ownerAttention.items.map((item) => item.id);
  assert.equal(attentionIds.includes("run:run_failed_old"), false);
  assert.equal(attentionIds.includes("feedback:feedback_resolved"), false);
  assert.equal(attentionIds.includes("feedback:feedback_active"), true);
});

test("dashboard context requests only surface unresolved linked work", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-actionable-context-"));
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  const routingStore = new EngineRoutingStore({ dataDir });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await routingStore.init();
  const engineer = await agentConfigStore.get("engineer");
  const agentMemory = new AgentMemoryStore({ agentDir: engineer.agentDir, agentName: engineer.name, role: engineer.role });
  await agentMemory.recordContextNeeds({
    needs: [
      {
        category: "acceptance",
        priority: "high",
        question: "Should the completed task still ask for primary color guidance?",
        whyItMatters: "This was already resolved in the finished task.",
        suggestedMemoryKind: "fact",
        relatedTaskId: "task_done"
      },
      {
        category: "decision",
        priority: "high",
        question: "What decision blocks the active task?",
        whyItMatters: "The active task cannot proceed without this decision.",
        suggestedMemoryKind: "fact",
        relatedTaskId: "task_active"
      },
      {
        category: "decision",
        priority: "high",
        question: "Should a deleted task still request context?",
        whyItMatters: "This task no longer exists after project deletion.",
        suggestedMemoryKind: "fact",
        relatedTaskId: "task_deleted"
      },
      {
        category: "decision",
        priority: "high",
        question: "Should a deleted intent still request context?",
        whyItMatters: "This intent no longer exists after project deletion.",
        suggestedMemoryKind: "fact",
        relatedIntentId: "intent_deleted"
      }
    ],
    source: { mode: "context_audit" }
  });

  const data = await buildDashboardData({
    config: { runner: { type: "mock" }, workspace: dataDir },
    engine: {
      async readModel() {
        return {
          intents: [{ id: "intent_active", status: "in_progress", goal: "Active work", taskIds: ["task_active"] }],
          tasks: [
            { id: "task_done", status: "done", title: "Completed primary color cleanup", consumerRole: "engineer" },
            { id: "task_active", intentId: "intent_active", status: "working", title: "Active implementation", consumerRole: "engineer" }
          ],
          runs: [],
          artifacts: [],
          sessions: [],
          feedback: []
        };
      }
    },
    agentConfigStore,
    routingStore,
    toolRegistry
  });

  assert.equal(data.contextRequests.total, 1);
  assert.match(data.contextRequests.items[0].question, /active task/);
  assert.equal(data.ownerAttention.items.some((item) => /completed task/.test(item.title || "")), false);
  assert.equal(data.ownerAttention.items.some((item) => /deleted task/.test(item.title || "")), false);
  assert.equal(data.ownerAttention.items.some((item) => /deleted intent/.test(item.title || "")), false);
  assert.equal(data.ownerAttention.items.some((item) => /active task/.test(item.title || "")), true);
});

test("dashboard data keeps blocked intents in the intent lane and exposes currently working employees", async () => {
  const now = "2026-05-24T10:00:00.000Z";
  const data = await buildDashboardData({
    config: { runner: { type: "mock" }, workspace: "/tmp/ai-team-dashboard-working-test" },
    engine: {
      async readModel() {
        return {
          intents: [
            {
              id: "intent_blocked",
              status: "blocked",
              goal: "Fix blocked channel work",
              source: { channel: "feishu", threadId: "oc_1" },
              consumerRole: "product_manager",
              blocked: { reason: "model provider failed" },
              createdAt: now,
              updatedAt: now
            },
            {
              id: "intent_active",
              status: "in_progress",
              goal: "Ship live board",
              source: { channel: "dashboard" },
              taskIds: ["task_active"],
              createdAt: now,
              updatedAt: now
            }
          ],
          tasks: [
            {
              id: "task_active",
              intentId: "intent_active",
              status: "working",
              title: "Wire WebSocket board updates",
              producerRole: "product_manager",
              consumerRole: "engineer",
              createdAt: now,
              updatedAt: now
            },
            {
              id: "task_done_with_stale_run",
              intentId: "intent_active",
              status: "done",
              title: "Completed task with stale run",
              producerRole: "product_manager",
              consumerRole: "engineer",
              createdAt: now,
              updatedAt: now
            }
          ],
          runs: [
            {
              id: "run_active",
              entityType: "task",
              entityId: "task_active",
              agentRole: "engineer",
              status: "running",
              provider: "deepseek",
              model: "deepseek-v4-pro",
              startedAt: now,
              createdAt: now,
              updatedAt: now
            },
            {
              id: "run_stale",
              entityType: "task",
              entityId: "task_done_with_stale_run",
              agentRole: "engineer",
              status: "running",
              provider: "codex",
              model: "gpt-5.5",
              startedAt: now,
              createdAt: now,
              updatedAt: now
            }
          ],
          artifacts: [],
          sessions: [],
          feedback: []
        };
      }
    }
  });

  const intentLane = data.columns.find((column) => column.id === "intents");
  const workingLane = data.columns.find((column) => column.id === "working");
  const blockedLane = data.columns.find((column) => column.id === "blocked");
  const blockedIntentCard = intentLane.items.find((item) => item.rawId === "intent_blocked");
  const activeTaskCard = workingLane.items.find((item) => item.rawId === "task_active");
  assert.ok(blockedIntentCard);
  assert.equal(blockedIntentCard.entityType, "intent");
  assert.ok(activeTaskCard);
  assert.equal(activeTaskCard.entityType, "task");
  assert.equal(blockedLane.items.some((item) => item.rawId === "intent_blocked"), false);
  assert.deepEqual(data.workingAgents.map((agent) => ({
    role: agent.role,
    runId: agent.runId,
    workTitle: agent.workTitle,
    provider: agent.provider,
    model: agent.model
  })), [
    {
      role: "engineer",
      runId: "run_active",
      workTitle: "Wire WebSocket board updates",
      provider: "deepseek",
      model: "deepseek-v4-pro"
    }
  ]);
  assert.equal(data.agents.find((agent) => agent.role === "engineer").active, true);
  assert.equal(data.agents.some((agent) => agent.role === "product_manager"), false);
  assert.equal(data.workingAgents.some((agent) => agent.runId === "run_stale"), false);
});

test("dashboard data uses configured profile names without legacy aliases", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-profile-names-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await writeAgentProfileDir(agentsDir, "Ada", { role: "engineer", name: "Ada", title: "Coding Engineer" });
  await writeAgentProfileDir(agentsDir, "Darwin", { role: "product_manager", name: "Darwin", title: "Product Manager" });
  await agentConfigStore.init();

  const data = await buildDashboardData({
    config: { runner: { type: "mock" }, provider: { id: "mock" }, workspace: dataDir },
    engine: {
      async readModel() {
        return {
          intents: [
            {
              id: "intent_done",
              status: "done",
              goal: "Ship renamed-agent dashboard",
              consumerRole: "product_manager",
              taskIds: ["task_done"]
            }
          ],
          tasks: [
            {
              id: "task_done",
              intentId: "intent_done",
              status: "done",
              title: "Implement renamed-agent dashboard",
              producerRole: "product_manager",
              consumerRole: "engineer"
            }
          ],
          runs: [],
          artifacts: [],
          sessions: [],
          feedback: []
        };
      }
    },
    agentConfigStore,
    toolRegistry
  });

  assert.ok(data.filters.includes("Darwin"));
  assert.equal(data.filters.includes("Ada Copy"), false);
  assert.equal(data.filters.includes("Former Product"), false);
  assert.equal(data.agentConfigs.agents.find((agent) => agent.role === "engineer").name, "Ada");
  const doneItems = data.columns.find((column) => column.id === "done").items;
  const intentCard = doneItems.find((item) => item.rawId === "intent_done");
  const taskCard = doneItems.find((item) => item.rawId === "task_done");
  assert.equal(intentCard.owner, "Darwin");
  assert.equal(taskCard.owner, "Ada");
  assert.equal(taskCard.involvedAgents.find((agent) => agent.role === "product_manager").name, "Darwin");
});

test("dashboard data projects active QA verification into the testing lane", async () => {
  const now = "2026-06-10T15:00:00.000Z";
  const data = await buildDashboardData({
    config: { runner: { type: "mock" }, workspace: "/tmp/ai-team-dashboard-verification-test" },
    engine: {
      async readModel() {
        return {
          intents: [{ id: "intent_qa", status: "in_progress", goal: "Ship feature", taskIds: ["task_qa"], createdAt: now, updatedAt: now }],
          tasks: [{
            id: "task_qa",
            intentId: "intent_qa",
            status: "working",
            title: "Verify feature",
            producerRole: "product_manager",
            claimedByRole: "engineer",
            createdAt: now,
            updatedAt: now
          }],
          runs: [{
            id: "run_qa",
            entityType: "task",
            entityId: "task_qa",
            agentRole: "qa",
            status: "running",
            provider: "deepseek",
            model: "deepseek-v4-pro",
            startedAt: now,
            createdAt: now,
            updatedAt: now
          }],
          artifacts: [],
          sessions: [],
          feedback: []
        };
      }
    }
  });

  const workingLane = data.columns.find((column) => column.id === "working");
  const testingLane = data.columns.find((column) => column.id === "testing");
  assert.equal(workingLane.items.some((item) => item.rawId === "task_qa"), false);
  const qaCard = testingLane.items.find((item) => item.rawId === "task_qa");
  assert.ok(qaCard);
  assert.equal(qaCard.status, "testing");
  assert.equal(qaCard.ownerRole, "qa");
});

test("dashboard data reads knowledge facts and recent memory events", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-memory-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  await memory.upsertFact("architecture.engine", "TeamEngine owns intent and task lifecycle.");
  await memory.recordEvent({
    type: "engine_intent_created",
    intentId: "intent_knowledge",
    text: "希望知识面板显示记忆"
  });

  const data = await buildDashboardData({
    config: {
      runner: { type: "mock" },
      provider: { id: "mock" },
      workspace: dataDir,
      pollIntervalMs: 5000,
      feedbackScanIntervalMs: 14_400_000
    },
    engine: {
      async readModel() {
        return { intents: [], tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
      }
    },
    memory
  });

  assert.equal(data.knowledge.facts[0].key, "architecture.engine");
  assert.equal(data.knowledge.recentEvents[0].type, "engine_intent_created");
  assert.equal(data.knowledge.recentEvents[0].intentId, "intent_knowledge");
});

test("dashboard data exposes Engine projects and project workspace root", async () => {
  const data = await buildDashboardData({
    config: {
      runner: { type: "mock" },
      provider: { id: "mock" },
      workspace: "/tmp/ai-team-control",
      projectWorkspaceRoot: "/tmp/ai-team-projects",
      pollIntervalMs: 5000,
      feedbackScanIntervalMs: 14_400_000
    },
    engine: {
      async readModel() {
        return {
          projects: [
            {
              id: "project_1",
              name: "AI Team Dashboard",
              slug: "ai-team-dashboard",
              status: "active",
              workspace: "/tmp/ai-team-projects/ai-team-dashboard"
            }
          ],
          intents: [
            {
              id: "intent_1",
              status: "new",
              goal: "project-aware dashboard",
              projectId: "project_1",
              projectName: "AI Team Dashboard",
              workspace: "/tmp/ai-team-projects/ai-team-dashboard",
              source: { channel: "feishu" },
              context: {}
            }
          ],
          tasks: [],
          runs: [],
          artifacts: [],
          sessions: [],
          feedback: []
        };
      }
    }
  });

  assert.equal(data.settings.projectWorkspaceRoot, "/tmp/ai-team-projects");
  assert.equal(data.projects[0].name, "AI Team Dashboard");
  assert.equal(data.columns[0].items[0].projectName, "AI Team Dashboard");
  assert.equal(data.engine.snapshot.projects[0].workspace, "/tmp/ai-team-projects/ai-team-dashboard");
});

test("dashboard data includes editable agent configuration read model", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-agent-config-"));
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  const routingStore = new EngineRoutingStore({ dataDir });
  const providerConfigStore = new ProviderConfigStore({ dataDir, config: { runner: { type: "mock" }, provider: { id: "mock" } } });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await routingStore.init();
  await providerConfigStore.init();
  await agentConfigStore.update("customer_success", {
    name: "Florence",
    prompt: "Custom Bell prompt",
    skills: ["customer-tone"],
    mcps: ["hubspot"],
    tools: ["memory.search", "channel.reply"],
    modelProvider: { providerId: "mock", model: "mock" }
  });
  await routingStore.update("customer_success", [
    { entityType: "task", status: "waiting", consumerRole: "customer_success", afterRunStatus: "done" },
    { entityType: "feedback", status: "new", afterRunStatus: "done" }
  ]);

  const data = await buildDashboardData({
    config: {
      runner: { type: "mock" },
      provider: { id: "mock" },
      workspace: dataDir,
      pollIntervalMs: 5000,
      feedbackScanIntervalMs: 14_400_000
    },
    engine: {
      async readModel() {
        return { intents: [], tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
      }
    },
    agentConfigStore,
    routingStore,
    toolRegistry,
    providerConfigStore
  });

  assert.deepEqual(data.nav, ["Overview", "Team", "Evidence", "Intake", "Projects", "Settings"]);
  assert.ok(data.filters.includes("Florence"));
  assert.equal(data.filters.includes("Bell"), false);
  assert.ok(data.agentConfigs.tools.some((tool) => tool.id === "channel.reply"));
  assert.equal(data.agentConfigs.tools.some((tool) => tool.id === "memory.search"), false);
  const config = data.agentConfigs.agents.find((agent) => agent.role === "customer_success");
  assert.equal(config.name, "Florence");
  assert.equal(config.prompt, "Custom Bell prompt");
  assertNoDroppedConfigFields(config);
  assert.deepEqual(config.skills.map((skill) => skill.id), ["customer-tone"]);
  assert.deepEqual(config.mcps.map((mcp) => mcp.id), ["hubspot"]);
  assert.deepEqual(config.tools, ["skill", "channel.reply"]);
  assert.deepEqual(config.wakeRules, [
    { entityType: "task", status: "waiting", consumerRole: "customer_success", afterRunStatus: "done" },
    { entityType: "feedback", status: "new", afterRunStatus: "done" }
  ]);
  assert.deepEqual(config.modelProvider, { providerId: "mock", model: "mock" });
  assert.equal(data.modelProviders.defaultProviderId, "codex");
  assert.equal(data.modelProviders.providers.some((provider) => provider.id === "mock" || provider.type === "mock"), false);
});

test("dashboard data includes Agent-scoped memory summaries", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-agent-memory-"));
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  const routingStore = new EngineRoutingStore({ dataDir });
  const providerConfigStore = new ProviderConfigStore({ dataDir, config: { runner: { type: "mock" }, provider: { id: "mock" } } });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await routingStore.init();
  await onboardRoutingOnce(routingStore, dataDir);
  await providerConfigStore.init();
  await agentConfigStore.update("engineer", { modelProvider: { providerId: "mock", model: "mock" } });
  await agentConfigStore.update("qa", { modelProvider: { providerId: "mock", model: "mock" } });
  const engineer = await agentConfigStore.get("engineer");
  const agentMemory = new AgentMemoryStore({ agentDir: engineer.agentDir, agentName: engineer.name, role: engineer.role });
  await agentMemory.appendLongTermFact({ key: "repo.boundary", text: "TeamEngine owns lifecycle transitions. TOKEN=secret-token sk-local-demo-secret /Users/example/private.txt" });
  await agentMemory.appendLongTermPlaybook({ key: "qa.loop", text: "Ask Turing to verify rejected tasks before finalizing. SECRET=hidden" });
  await agentMemory.recordEvent({ title: "One one coaching", summary: "User taught Ada how to ask for missing context from /Users/example/.ssh/id_rsa." });
  await agentMemory.recordEvent({ title: "Agent Turn Completed", summary: "Assignment included /Users/example/private-runtime.txt and should not appear as coaching." });
  await agentMemory.recordContextNeeds({
    needs: [
      {
        category: "acceptance",
        priority: "high",
        question: "Which launch examples define done from /Users/example/private-brief.md? {\"token\":\"json-context-secret\"}",
        whyItMatters: "Without examples Ada may optimize the wrong behavior. TOKEN=context-secret Authorization: Bearer owner-secret-token Authorization: Basic dXNlcjpwYXNz Authorization: token ghp_secretcontext",
        suggestedMemoryKind: "fact",
        relatedTaskId: "task_launch"
      },
      {
        category: "files",
        priority: "low",
        question: "Which task-specific evidence should Ada use?",
        whyItMatters: "Without task evidence Ada may answer generically. SECRET=linked-secret",
        suggestedMemoryKind: "fact",
        createdAt: "TOKEN=created-secret /Users/example/private-created.txt"
      }
    ],
    source: {
      mode: "context_audit",
      linkedContext: { intentId: "intent_launch", taskId: "task_launch" },
      coachingRecordId: "event_launch"
    }
  });

  const data = await buildDashboardData({
    config: {
      runner: { type: "mock" },
      provider: { id: "mock" },
      workspace: dataDir,
      pollIntervalMs: 5000,
      feedbackScanIntervalMs: 14_400_000
    },
    engine: {
      async readModel() {
        return { intents: [], tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
      }
    },
    agentConfigStore,
    routingStore,
    toolRegistry,
    providerConfigStore
  });

  const config = data.agentConfigs.agents.find((agent) => agent.role === "engineer");
  assert.equal(config.memory.factCount, 1);
  assert.equal(config.memory.playbookCount, 1);
  assert.equal(config.memory.hasRecentSummary, true);
  assert.equal(config.memory.readiness.status, "ready");
  assert.equal(config.memory.readiness.score, 100);
  assert.deepEqual(config.memory.readiness.gaps.map((gap) => gap.id), []);
  assert.equal(config.memory.facts[0].key, "repo.boundary");
  assert.equal(config.memory.playbooks[0].key, "qa.loop");
  assert.equal(Object.hasOwn(config.memory.facts[0], "path"), false);
  assert.equal(Object.hasOwn(config.memory.facts[0], "id"), false);
  assert.equal(Object.hasOwn(config.memory.facts[0], "metadata"), false);
  assert.doesNotMatch(JSON.stringify(config.memory), /secret-token|sk-local-demo-secret|SECRET=hidden|\/Users\/example/);
  assert.match(config.memory.facts[0].text, /\[redacted/);
  assert.match(config.memory.recentSummaryPreview, /One one coaching/);
  assert.match(config.memory.recentSummaryPreview, /Agent Turn Completed/);
  assert.equal(config.memory.hasCoachingJournal, true);
  assert.match(config.memory.coachingJournalPreview, /One one coaching/);
  assert.doesNotMatch(config.memory.coachingJournalPreview, /Agent Turn Completed|private-runtime|\/Users\/example/);
  assert.equal(config.memory.openContextNeedCount, 0);
  assert.deepEqual(config.memory.contextNeeds, []);
  assert.doesNotMatch(JSON.stringify(config.memory.contextNeeds), /context-secret|private-brief|linked-secret|created-secret|private-created|\/Users\/example/);
  assert.equal(data.contextRequests.total, 0);
  assert.equal(data.ownerAttention.items.some((item) => item.kind === "context_request"), false);
  assert.doesNotMatch(JSON.stringify(data.ownerAttention), /json-context-secret|owner-secret-token|Bearer owner-secret-token|dXNlcjpwYXNz|ghp_secretcontext/);
  assert.equal(data.employeeImprovementPlan.status, "needs_attention");
  assert.ok(data.employeeImprovementPlan.total >= 1);
  assert.ok(data.employeeImprovementPlan.affectedEmployees >= 1);
  assert.equal(data.employeeImprovementPlan.counts.byKind.context_request || 0, 0);
  const memoryGap = data.employeeImprovementPlan.items.find((item) => item.kind === "memory_gap" && item.gapId === "fact_memory");
  assert.match(memoryGap.action.target, /^one_one:[^:]+:gap:fact_memory$/);
  assert.equal(memoryGap.promptKey, "oneOne.gap.fact_memory.prompt");
  assert.doesNotMatch(JSON.stringify(data.employeeImprovementPlan), /json-context-secret|owner-secret-token|Bearer owner-secret-token|dXNlcjpwYXNz|ghp_secretcontext|private-brief|\/Users\/example/);
  assert.doesNotMatch(JSON.stringify(data.contextRequests), /context-secret|private-brief|linked-secret|created-secret|private-created|\/Users\/example/);

  const qaConfig = data.agentConfigs.agents.find((agent) => agent.role === "qa");
  assert.equal(qaConfig.memory.readiness.status, "needs_context");
  assert.equal(qaConfig.memory.readiness.score, 0);
  assert.deepEqual(qaConfig.memory.readiness.gaps.map((gap) => gap.id), ["fact_memory", "procedure_memory", "recent_summary"]);
});

test("dashboard Agent context readiness flags operational configuration gaps", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-agent-readiness-gaps-"));
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  const routingStore = new EngineRoutingStore({ dataDir });
  const providerConfigStore = new ProviderConfigStore({ dataDir, config: { runner: { type: "mock" }, provider: { id: "mock" } } });
  await agentConfigStore.init();
  await routingStore.init();
  await onboardRoutingOnce(routingStore, dataDir);
  await providerConfigStore.init();
  const agent = await agentConfigStore.create({
    role: "strategy_blank",
    name: "Strategy Blank",
    title: "Strategy Analyst",
    prompt: "Analyze strategic opportunities.",
    tools: []
  });
  await routingStore.update(agent.role, []);
  const agentMemory = new AgentMemoryStore({ agentDir: agent.agentDir, agentName: agent.name, role: agent.role });
  await agentMemory.appendLongTermFact({ key: "market.focus", text: "Prioritize durable product loops." });
  await agentMemory.appendLongTermPlaybook({ key: "research.loop", text: "Frame assumptions, inspect evidence, and recommend next bets." });
  await agentMemory.recordEvent({ title: "One one coaching", summary: "User taught how to escalate missing context before execution." });

  const data = await buildDashboardData({
    config: {
      runner: { type: "mock" },
      provider: { id: "mock" },
      workspace: dataDir,
      pollIntervalMs: 5000,
      feedbackScanIntervalMs: 14_400_000
    },
    engine: {
      async readModel() {
        return { intents: [], tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
      }
    },
    agentConfigStore,
    routingStore,
    toolRegistry,
    providerConfigStore
  });

  const config = data.agentConfigs.agents.find((item) => item.role === "strategy_blank");
  assert.equal(config.memory.readiness.status, "needs_context");
  assert.equal(config.memory.readiness.score, 75);
  assert.deepEqual(config.memory.readiness.gaps.map((gap) => gap.id), ["provider_model", "tool_policy", "wake_rules"]);
  assert.equal(data.agentConfigs.summary.total, data.agentConfigs.agents.length);
  assert.ok(data.agentConfigs.summary.needsContext >= 1);
  assert.ok(data.agentConfigs.summary.gaps.providerModel >= 1);
  assert.ok(data.agentConfigs.summary.gaps.toolPolicy >= 1);
  assert.ok(data.agentConfigs.summary.gaps.wakeRules >= 1);
  const configActions = data.employeeImprovementPlan.items.filter((item) => item.role === "strategy_blank" && item.kind === "config_gap");
  assert.deepEqual(configActions.map((item) => item.gapId), ["provider_model", "tool_policy", "wake_rules"]);
  assert.deepEqual(configActions.map((item) => item.action.target), ["edit_agent:strategy_blank", "edit_agent:strategy_blank", "edit_agent:strategy_blank"]);
});

test("dashboard data includes setup readiness read model", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-readiness-"));
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  const routingStore = new EngineRoutingStore({ dataDir });
  const providerConfigStore = new ProviderConfigStore({ dataDir, config: { runner: { type: "mock" }, provider: { id: "mock" } } });
  await agentConfigStore.init();
  await routingStore.init();
  await providerConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", {
    modelProvider: { providerId: "codex", model: "gpt-5.5" }
  });

  const data = await buildDashboardData({
    config: {
      runner: { type: "mock" },
      provider: { id: "mock" },
      workspace: dataDir,
      localMode: true,
      adminToken: "configured-token",
      pollIntervalMs: 5000,
      feedbackScanIntervalMs: 14_400_000
    },
    engine: {
      async readModel() {
        return { intents: [], tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
      }
    },
    agentConfigStore,
    routingStore,
    toolRegistry,
    providerConfigStore,
    channelConfigStore: {
      async listPublic() {
        return [{ id: "feishu", enabled: false, status: "disabled", credentials: {} }];
      }
    }
  });

  assert.match(data.readiness.overall, /^(ready|needs_setup|failed)$/);
  const ids = data.readiness.items.map((item) => item.id);
  assert.deepEqual(ids, [
    "admin_access",
    "default_provider",
    "provider_check",
    "agent_binding",
    "one_on_one_smoke",
    "channel_readiness"
  ]);
  assert.equal(data.readiness.items.find((item) => item.id === "admin_access").status, "ready");
  assert.equal(data.readiness.items.find((item) => item.id === "default_provider").status, "ready");
  assert.equal(data.readiness.items.find((item) => item.id === "default_provider").action.target, "provider:codex");
  assert.equal(data.readiness.items.find((item) => item.id === "provider_check").status, "not_checked");
  assert.equal(data.readiness.items.find((item) => item.id === "agent_binding").status, "ready");
  assert.equal(data.readiness.items.find((item) => item.id === "one_on_one_smoke").status, "not_checked");
  assert.equal(data.readiness.items.find((item) => item.id === "one_on_one_smoke").action.target, "smoke:engineer");
  assert.equal(data.readiness.items.find((item) => item.id === "channel_readiness").status, "skipped");
  assert.equal(data.readiness.overall, "needs_setup");
});

test("dashboard readiness requires channel setup when Feishu is disabled outside local demo", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-remote-readiness-"));
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  const routingStore = new EngineRoutingStore({ dataDir });
  const providerConfigStore = new ProviderConfigStore({ dataDir, config: { runner: { type: "mock" }, provider: { id: "mock" } } });
  await agentConfigStore.init();
  await routingStore.init();
  await providerConfigStore.init();

  const data = await buildDashboardData({
    config: {
      runner: { type: "mock" },
      provider: { id: "mock" },
      workspace: dataDir,
      host: "0.0.0.0",
      pollIntervalMs: 5000,
      feedbackScanIntervalMs: 14_400_000
    },
    engine: {
      async readModel() {
        return { intents: [], tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
      }
    },
    agentConfigStore,
    routingStore,
    toolRegistry,
    providerConfigStore,
    channelConfigStore: {
      async listPublic() {
        return [{ id: "feishu", enabled: false, status: "disabled", credentials: {} }];
      }
    }
  });

  const channel = data.readiness.items.find((item) => item.id === "channel_readiness");
  assert.equal(channel.status, "needs_setup");
  assert.match(channel.reason, /Connect Feishu/);
});

test("dashboard data exposes only the global Coding Agent command template", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-dashboard-launchers-"));
  const toolRegistry = new ToolRegistry();
  const agentConfigStore = new AgentConfigStore({ dataDir, toolRegistry });
  const routingStore = new EngineRoutingStore({ dataDir });
  const codingAgentLauncherStore = new CodingAgentLauncherStore({
    dataDir,
    agentWorkspaceDir: path.join(dataDir, "agent-workspace")
  });
  await agentConfigStore.init();
  await routingStore.init();
  await codingAgentLauncherStore.init();
  await codingAgentLauncherStore.write([{
    id: "default",
    name: "Coding Agent",
    description: "Default delegated implementation worker.",
    command: "delegate",
    args: ["run", "{{workspace}}", "{{prompt}}"],
    timeoutMs: 60000,
    env: {
      DELEGATE_TOKEN: "secret-token",
      CODEX_SANDBOX: null
    }
  }]);

  const data = await buildDashboardData({
    config: {
      runner: { type: "mock" },
      provider: { id: "mock" },
      workspace: dataDir,
      pollIntervalMs: 5000,
      feedbackScanIntervalMs: 14_400_000
    },
    engine: {
      async readModel() {
        return { intents: [], tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
      }
    },
    agentConfigStore,
    routingStore,
    toolRegistry,
    codingAgentLauncherStore,
    channelConfigStore: {
      async listPublic() {
        return [];
      }
    }
  });

  assert.deepEqual(data.codingAgentLaunchers, [{
    commandTemplate: "delegate run {{workspace}} {{prompt}}",
    timeoutMs: 60000
  }]);
  assert.equal(JSON.stringify(data).includes("secret-token"), false);
  assert.equal(JSON.stringify(data).includes("DELEGATE_TOKEN"), false);
});
