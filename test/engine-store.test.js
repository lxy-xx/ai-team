import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EngineStore } from "../src/team-engine/infrastructure/engine-store.js";
import { INTENT_STATUS, TASK_STATUS } from "../src/team-engine/domain/schema.js";

test("EngineStore persists intents, tasks, runs, artifacts, and sessions", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-"));
  const store = new EngineStore({ dataDir });
  await store.init();

  const intent = await store.createIntent({
    name: "Customer feedback improvement",
    description: "Collect customer feedback and ship the smallest useful improvement with a mock verification loop.",
    source: { channel: "cli", threadId: "cli", userId: "local" },
    replyTarget: undefined,
    goal: "build a customer feedback improvement",
    constraints: ["no new dependency"],
    acceptanceCriteria: ["mock runner completes the loop"],
    context: { transport: "cli" }
  });

  assert.equal(intent.status, INTENT_STATUS.NEW);
  assert.equal(intent.consumerRole, undefined);

  const task = await store.createTask({
    intentId: intent.id,
    title: "Implement feedback improvement",
    description: "Ship the smallest useful implementation.",
    producerRole: "product_manager",
    consumerRole: "engineer",
    dependencies: [],
    acceptanceCriteria: ["implementation report exists"]
  });

  assert.equal(task.status, TASK_STATUS.WAITING);
  assert.equal(task.intentId, intent.id);

  const run = await store.createRun({
    entityType: "task",
    entityId: task.id,
    agentRole: "engineer",
    sessionKey: "engineer:cli:cli",
    runner: "mock",
    provider: "mock"
  });
  await store.completeRun(run.id, { transcriptSummary: "Ada completed implementation.", artifactIds: [] });

  const artifact = await store.writeArtifact({
    intentId: intent.id,
    entityType: "task",
    entityId: task.id,
    role: "engineer",
    kind: "implementation_report",
    data: { summary: "done" }
  });

  await store.updateTask(task.id, { artifactIds: [artifact.id], status: TASK_STATUS.DONE });
  await store.upsertSession({ key: "engineer:cli:cli", activeRunId: undefined, queuedEntityIds: [] });

  const storedIntent = await store.getIntent(intent.id);
  assert.deepEqual(storedIntent.taskIds, [task.id]);
  assert.deepEqual(storedIntent.artifactIds, [artifact.id]);

  const readModel = await store.readModel();
  assert.equal(readModel.intents.length, 1);
  assert.equal(readModel.intents[0].name, "Customer feedback improvement");
  assert.equal(readModel.intents[0].description, "Collect customer feedback and ship the smallest useful improvement with a mock verification loop.");
  assert.equal(readModel.tasks.length, 1);
  assert.equal(readModel.runs.length, 1);
  assert.equal(readModel.artifacts.length, 1);
  assert.equal(readModel.sessions.length, 1);

  const restarted = new EngineStore({ dataDir });
  await restarted.init();
  const restartedModel = await restarted.readModel();
  assert.equal(restartedModel.intents.length, 1);
  assert.equal(restartedModel.tasks.length, 1);
  assert.equal(restartedModel.runs.length, 1);
  assert.equal(restartedModel.artifacts.length, 1);
  assert.equal(restartedModel.sessions.length, 1);
  assert.deepEqual(restartedModel.intents[0].taskIds, [task.id]);
  assert.deepEqual(restartedModel.intents[0].artifactIds, [artifact.id]);
});

test("EngineStore manages projects and propagates project workspace to tasks and runs", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-projects-"));
  const projectWorkspaceRoot = path.join(dataDir, "project-workspaces");
  const store = new EngineStore({ dataDir, projectWorkspaceRoot });
  await store.init();

  const project = await store.ensureProject({ name: "AI Team Dashboard" });
  assert.equal(project.slug, "ai-team-dashboard");
  assert.equal(project.workspace, path.join(projectWorkspaceRoot, "ai-team-dashboard"));
  await fs.access(project.workspace);
  await fs.access(path.join(project.workspace, ".engine", "project.json"));

  const sameProject = await store.ensureProject({ name: "AI Team Dashboard" });
  assert.equal(sameProject.id, project.id);

  const intent = await store.createIntent({
    source: { channel: "feishu", threadId: "oc_1", userId: "ou_1" },
    goal: "make dashboard project aware",
    projectId: project.id,
    projectName: project.name,
    workspace: project.workspace,
    context: {}
  });
  assert.equal(intent.projectId, project.id);
  assert.equal(intent.projectName, "AI Team Dashboard");
  assert.equal(intent.workspace, project.workspace);
  assert.equal(intent.context.workspace, project.workspace);
  await fs.access(path.join(project.workspace, ".engine", "intents", `${intent.id}.json`));

  const task = await store.createTask({
    intentId: intent.id,
    title: "Implement project-aware task",
    description: "Carry workspace forward.",
    producerRole: "product_manager",
    consumerRole: "engineer"
  });
  assert.equal(task.projectId, project.id);
  assert.equal(task.projectName, "AI Team Dashboard");
  assert.equal(task.workspace, project.workspace);
  await fs.access(path.join(project.workspace, ".engine", "tasks", `${task.id}.json`));

  const run = await store.createRun({
    entityType: "task",
    entityId: task.id,
    agentRole: "engineer",
    sessionKey: "engineer:feishu:oc_1",
    runner: "mock",
    provider: "mock"
  });
  assert.equal(run.projectId, project.id);
  assert.equal(run.projectName, "AI Team Dashboard");
  assert.equal(run.workspace, project.workspace);
  await fs.access(path.join(project.workspace, ".engine", "runs", `${run.id}.json`));

  const artifact = await store.writeArtifact({
    intentId: intent.id,
    entityType: "task",
    entityId: task.id,
    role: "engineer",
    kind: "report",
    data: { summary: "project scoped artifact" }
  });
  await fs.access(path.join(project.workspace, ".engine", "artifacts", intent.id, `${artifact.id}.json`));

  const model = await store.readModel();
  assert.equal(model.projects.length, 1);
  assert.equal(model.projects[0].id, project.id);
});

test("EngineStore deletes a project with its project-scoped engine records and workspace", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-delete-project-"));
  const projectWorkspaceRoot = path.join(dataDir, "project-workspaces");
  const store = new EngineStore({ dataDir, projectWorkspaceRoot });
  await store.init();

  const project = await store.ensureProject({ name: "Retired Workspace" });
  const keptProject = await store.ensureProject({ name: "Kept Workspace" });
  await fs.writeFile(path.join(project.workspace, "business.txt"), "temporary business data", "utf8");

  const intent = await store.createIntent({
    projectId: project.id,
    projectName: project.name,
    workspace: project.workspace,
    source: { channel: "cli" },
    goal: "retire this workspace",
    context: {}
  });
  const keptIntent = await store.createIntent({
    projectId: keptProject.id,
    projectName: keptProject.name,
    workspace: keptProject.workspace,
    source: { channel: "cli" },
    goal: "keep this workspace",
    context: {}
  });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Delete project data",
    description: "Delete records that belong to this project.",
    producerRole: "product_manager",
    consumerRole: "engineer"
  });
  const run = await store.createRun({
    entityType: "task",
    entityId: task.id,
    agentRole: "engineer",
    sessionKey: "engineer:cli:retired",
    runner: "mock",
    provider: "mock"
  });
  const artifact = await store.writeArtifact({
    intentId: intent.id,
    entityType: "task",
    entityId: task.id,
    role: "engineer",
    kind: "report",
    data: { summary: "delete me" }
  });
  const feedback = await store.createFeedback({
    text: "Project feedback should be removed.",
    intentId: intent.id,
    taskId: task.id,
    source: { channel: "cli" }
  });
  await store.upsertSession({ key: "engineer:cli:retired", activeRunId: run.id, queuedEntityIds: [task.id] });

  const result = await store.deleteProject(project.id);

  assert.equal(result.deleted.projectId, project.id);
  assert.deepEqual(result.deleted.intentIds, [intent.id]);
  assert.deepEqual(result.deleted.taskIds, [task.id]);
  assert.deepEqual(result.deleted.runIds, [run.id]);
  assert.deepEqual(result.deleted.artifactIds, [artifact.id]);
  assert.deepEqual(result.deleted.feedbackIds, [feedback.id]);
  assert.equal(result.workspaceDeleted, true);
  await assert.rejects(fs.access(project.workspace), /ENOENT/);

  const model = await store.readModel();
  assert.deepEqual(model.projects.map((item) => item.id), [keptProject.id]);
  assert.deepEqual(model.intents.map((item) => item.id), [keptIntent.id]);
  assert.deepEqual(model.tasks, []);
  assert.deepEqual(model.runs, []);
  assert.deepEqual(model.artifacts, []);
  assert.deepEqual(model.feedback, []);
  assert.deepEqual(model.sessions, []);
});

test("EngineStore prunes feedback whose linked Engine records no longer exist", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-orphan-feedback-"));
  const store = new EngineStore({ dataDir });
  await store.init();
  const intent = await store.createIntent({
    source: { channel: "cli" },
    goal: "keep linked feedback",
    context: {}
  });
  const kept = await store.createFeedback({
    text: "Keep this feedback because its intent still exists.",
    intentId: intent.id,
    source: { channel: "dashboard" }
  });
  const removed = await store.createFeedback({
    text: "Remove this feedback because its intent was deleted with a project.",
    intentId: "intent_deleted",
    linkedIntentId: "intent_deleted",
    source: { channel: "dashboard" }
  });
  const standalone = await store.createFeedback({
    text: "Keep standalone intake feedback without Engine links.",
    source: { channel: "dashboard" }
  });

  const result = await store.pruneOrphanFeedback();

  assert.deepEqual(result.feedbackIds, [removed.id]);
  assert.deepEqual((await store.listFeedback()).map((item) => item.id).sort(), [kept.id, standalone.id].sort());
});

test("EngineStore updates runs, artifacts, sessions, and feedback", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-"));
  const store = new EngineStore({ dataDir });
  await store.init();

  await fs.access(path.join(dataDir, "engine", "feedback", "backlog.json"));

  const intent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "ship store interface coverage",
    constraints: [],
    acceptanceCriteria: [],
    context: {}
  });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Exercise interface",
    description: "Cover the store interface.",
    producerRole: "product_manager",
    consumerRole: "engineer",
    dependencies: [],
    acceptanceCriteria: []
  });
  const run = await store.createRun({
    entityType: "task",
    entityId: task.id,
    agentRole: "engineer",
    sessionKey: "engineer:cli:cli",
    runner: "mock",
    provider: "mock"
  });
  const artifact = await store.writeArtifact({
    intentId: intent.id,
    entityType: "task",
    entityId: task.id,
    role: "engineer",
    kind: "report",
    data: { summary: "first" }
  });
  const session = await store.upsertSession({
    key: "engineer:cli:cli",
    activeRunId: run.id,
    queuedEntityIds: [task.id]
  });
  const feedback = await store.createFeedback({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    text: "Please keep the interface complete.",
    intentId: intent.id,
    taskId: task.id
  });

  await new Promise((resolve) => setTimeout(resolve, 2));
  const updatedRun = await store.updateRun(run.id, { transcriptSummary: "partial progress" });
  assert.equal(updatedRun.transcriptSummary, "partial progress");
  assert.equal((await store.getRun(run.id)).transcriptSummary, "partial progress");
  assert.notEqual(updatedRun.updatedAt, run.updatedAt);

  const storedArtifact = await store.getArtifact(intent.id, artifact.id);
  assert.equal(storedArtifact.data.summary, "first");
  const updatedArtifact = await store.updateArtifact(intent.id, artifact.id, { data: { summary: "updated" } });
  assert.equal(updatedArtifact.data.summary, "updated");

  assert.deepEqual(await store.getSession(session.key), session);

  const storedFeedback = await store.getFeedback(feedback.id);
  assert.equal(storedFeedback.text, "Please keep the interface complete.");
  const updatedFeedback = await store.updateFeedback(feedback.id, { status: "triaged", priority: "high" });
  assert.equal(updatedFeedback.status, "triaged");
  assert.equal(updatedFeedback.priority, "high");

  const restarted = new EngineStore({ dataDir });
  await restarted.init();
  assert.equal((await restarted.getRun(run.id)).transcriptSummary, "partial progress");
  assert.equal((await restarted.getArtifact(intent.id, artifact.id)).data.summary, "updated");
  assert.deepEqual(await restarted.getSession(session.key), session);
  assert.equal((await restarted.getFeedback(feedback.id)).status, "triaged");
});

test("EngineStore transitions entities and records ordered agent operations", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-ops-"));
  const store = new EngineStore({ dataDir });
  await store.init();

  const intent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "track entity operations",
    constraints: [],
    acceptanceCriteria: [],
    context: {}
  });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Track task operation",
    description: "Task status changes should be attributed to agents.",
    producerRole: "product_manager",
    consumerRole: "engineer",
    dependencies: [],
    acceptanceCriteria: []
  });
  const feedback = await store.createFeedback({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    text: "Please track feedback transitions."
  });

  const routed = await store.transitionEntity({
    entityType: "intent",
    entityId: intent.id,
    status: "routing",
    agentRole: "product_manager",
    runId: "run_jobs",
    reason: "wake rule consumed new intent"
  });
  const working = await store.transitionEntity({
    entityType: "task",
    entityId: task.id,
    status: "working",
    agentRole: "engineer",
    runId: "run_linus",
    patch: { startedAt: "2026-05-21T00:00:00.000Z" }
  });
  const triaged = await store.transitionEntity({
    entityType: "feedback",
    entityId: feedback.id,
    status: "triaged",
    agentRole: "customer_success",
    reason: "feedback triage"
  });

  assert.equal(routed.status, "routing");
  assert.equal(routed.operations.length, 1);
  assert.deepEqual(routed.operations[0], {
    at: routed.operations[0].at,
    agentRole: "product_manager",
    action: "status_transition",
    fromStatus: "new",
    toStatus: "routing",
    runId: "run_jobs",
    reason: "wake rule consumed new intent"
  });
  assert.equal(working.status, "working");
  assert.equal(working.operations[0].agentRole, "engineer");
  assert.equal(working.operations[0].fromStatus, "waiting");
  assert.equal(working.startedAt, "2026-05-21T00:00:00.000Z");
  assert.equal(triaged.status, "triaged");
  assert.equal(triaged.operations[0].agentRole, "customer_success");

  const done = await store.transitionEntity({
    entityType: "task",
    entityId: task.id,
    status: "done",
    agentRole: "qa",
    runId: "run_turing"
  });
  assert.deepEqual(done.operations.map((operation) => operation.agentRole), ["engineer", "qa"]);
  assert.deepEqual(done.operations.map((operation) => operation.toStatus), ["working", "done"]);
});

test("EngineStore returns existing feedback for duplicate dedupe keys", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-dedupe-"));
  const store = new EngineStore({ dataDir });
  await store.init();

  const first = await store.createFeedback({
    source: { channel: "feishu", threadId: "thread_1" },
    text: "希望导出按钮更明显",
    dedupeKey: "feishu:thread_1:export"
  });
  const second = await store.createFeedback({
    source: { channel: "feishu", threadId: "thread_1" },
    text: "希望导出按钮更明显",
    dedupeKey: "feishu:thread_1:export"
  });

  assert.equal(second.id, first.id);
  assert.equal((await store.listFeedback()).length, 1);
});

test("EngineStore reserves channel deliveries for idempotent direct replies", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-delivery-"));
  const store = new EngineStore({ dataDir });
  await store.init();

  const first = await store.reserveChannelDelivery({
    dedupeKey: "feishu:om_1",
    channel: "feishu",
    threadId: "oc_1",
    eventId: "om_1"
  });
  const second = await store.reserveChannelDelivery({
    dedupeKey: "feishu:om_1",
    channel: "feishu",
    threadId: "oc_1",
    eventId: "om_1"
  });
  const completed = await store.updateChannelDelivery("feishu:om_1", {
    status: "completed",
    finalText: "我是 Franklin，AI Team 的 CEO/CTO 入口。",
    reply: { status: "sent", messageId: "om_reply" }
  });
  const restarted = new EngineStore({ dataDir });
  await restarted.init();

  assert.equal(first.created, true);
  assert.equal(first.delivery.status, "processing");
  assert.equal(second.created, false);
  assert.equal(second.delivery.id, first.delivery.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.reply.messageId, "om_reply");
  assert.equal((await restarted.getChannelDelivery("feishu:om_1")).finalText, "我是 Franklin，AI Team 的 CEO/CTO 入口。");
});

test("EngineStore failRun clears completion-only fields", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-"));
  const store = new EngineStore({ dataDir });
  await store.init();

  const run = await store.createRun({
    entityType: "task",
    entityId: "task_1",
    agentRole: "engineer",
    sessionKey: "engineer:cli:cli",
    runner: "mock",
    provider: "mock"
  });
  await store.completeRun(run.id, { transcriptSummary: "completed", artifactIds: ["artifact_1"] });

  const failed = await store.failRun(run.id, new Error("outbox failed"));

  assert.equal(failed.status, "failed");
  assert.equal(failed.completedAt, undefined);
  assert.equal(failed.transcriptSummary, undefined);
  assert.deepEqual(failed.artifactIds, []);
  assert.equal(failed.error.message, "outbox failed");
});

test("EngineStore appendTaskRunAndArtifact preserves concurrent appends", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-"));
  const store = new EngineStore({ dataDir });
  await store.init();

  const intent = await store.createIntent({
    source: { channel: "cli", threadId: "cli", userId: "local" },
    goal: "preserve concurrent task links",
    acceptanceCriteria: []
  });
  const task = await store.createTask({
    intentId: intent.id,
    title: "Append links",
    description: "Append all run and artifact links.",
    consumerRole: "engineer",
    dependencies: [],
    acceptanceCriteria: []
  });

  await Promise.all([
    store.appendTaskRunAndArtifact(task.id, { runId: "run_1", artifactId: "artifact_1" }),
    store.appendTaskRunAndArtifact(task.id, { runId: "run_2", artifactId: "artifact_2" }),
    store.appendTaskRunAndArtifact(task.id, { runId: "run_1", artifactId: "artifact_1" })
  ]);

  const storedTask = await store.getTask(task.id);
  assert.deepEqual(storedTask.runIds.sort(), ["run_1", "run_2"]);
  assert.deepEqual(storedTask.artifactIds.sort(), ["artifact_1", "artifact_2"]);
});

test("EngineStore rejects child records for missing intents", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-"));
  const store = new EngineStore({ dataDir });
  await store.init();

  await assert.rejects(
    store.createTask({
      intentId: "missing",
      title: "Orphan task",
      description: "This should not be written.",
      producerRole: "product_manager",
      consumerRole: "engineer",
      dependencies: [],
      acceptanceCriteria: []
    }),
    /intent not found: missing/
  );

  await assert.rejects(
    store.writeArtifact({
      intentId: "missing",
      entityType: "task",
      entityId: "task_missing",
      role: "engineer",
      kind: "report",
      data: { summary: "orphan" }
    }),
    /intent not found: missing/
  );

  const readModel = await store.readModel();
  assert.equal(readModel.tasks.length, 0);
  assert.equal(readModel.artifacts.length, 0);
});

test("EngineStore rejects path traversal ids", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-"));
  const store = new EngineStore({ dataDir });
  await store.init();

  await assert.rejects(
    store.createTask({
      intentId: "../escape",
      title: "Escaping task",
      description: "This should not be written.",
      producerRole: "product_manager",
      consumerRole: "engineer",
      dependencies: [],
      acceptanceCriteria: []
    }),
    /invalid id path: \.\.\/escape/
  );

  await assert.rejects(
    store.writeArtifact({
      intentId: "../escape",
      entityType: "task",
      entityId: "task_escape",
      role: "engineer",
      kind: "report",
      data: { summary: "escape" }
    }),
    /invalid id path: \.\.\/escape/
  );

  await assert.rejects(store.getIntent("../escape"), /invalid id path: \.\.\/escape/);
  await assert.rejects(store.updateTask("../escape", { status: TASK_STATUS.BLOCKED }), /invalid id path: \.\.\/escape/);

  const escapedPath = path.join(dataDir, "engine", "escape");
  await assert.rejects(fs.access(escapedPath), { code: "ENOENT" });
});

test("EngineStore confines artifact ids to their intent artifact directory", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-engine-store-"));
  const store = new EngineStore({ dataDir });
  await store.init();

  const intentA = await store.createIntent({
    source: { channel: "cli", threadId: "a", userId: "local" },
    goal: "intent a",
    constraints: [],
    acceptanceCriteria: [],
    context: {}
  });
  const intentB = await store.createIntent({
    source: { channel: "cli", threadId: "b", userId: "local" },
    goal: "intent b",
    constraints: [],
    acceptanceCriteria: [],
    context: {}
  });

  const artifactA = await store.writeArtifact({
    intentId: intentA.id,
    entityType: "intent",
    entityId: intentA.id,
    role: "engineer",
    kind: "report",
    data: { summary: "a" }
  });
  const artifactB = await store.writeArtifact({
    intentId: intentB.id,
    entityType: "intent",
    entityId: intentB.id,
    role: "engineer",
    kind: "report",
    data: { summary: "b" }
  });

  const crossIntentArtifactId = `../${intentB.id}/${artifactB.id}`;
  await assert.rejects(
    store.getArtifact(intentA.id, crossIntentArtifactId),
    new RegExp(`invalid id path: ${escapeRegExp(crossIntentArtifactId)}`)
  );
  await assert.rejects(
    store.updateArtifact(intentA.id, crossIntentArtifactId, { data: { summary: "hijacked" } }),
    new RegExp(`invalid id path: ${escapeRegExp(crossIntentArtifactId)}`)
  );

  assert.equal((await store.getArtifact(intentA.id, artifactA.id)).data.summary, "a");
  assert.equal((await store.getArtifact(intentB.id, artifactB.id)).data.summary, "b");
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
