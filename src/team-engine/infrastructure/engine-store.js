import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createId, stableHash } from "../../platform/ids.js";
import { ensureDir, readJsonFile, writeJsonFile } from "../../platform/json-file.js";
import { FEEDBACK_STATUS, INTENT_STATUS, RUN_STATUS, TASK_STATUS } from "../domain/schema.js";
import { migrateEngineRuntimeData } from "./engine-data-migration.js";

export class EngineStore {
  constructor({ dataDir, projectWorkspaceRoot } = {}) {
    this.dataDir = dataDir;
    this.engineDir = path.join(dataDir, "engine");
    this.projectDir = path.join(this.engineDir, "projects");
    this.intentDir = path.join(this.engineDir, "intents");
    this.taskDir = path.join(this.engineDir, "tasks");
    this.runDir = path.join(this.engineDir, "runs");
    this.artifactDir = path.join(this.engineDir, "artifacts");
    this.sessionDir = path.join(this.engineDir, "sessions");
    this.feedbackDir = path.join(this.engineDir, "feedback");
    this.feedbackFile = path.join(this.feedbackDir, "backlog.json");
    this.operationsDir = path.join(this.engineDir, "operations");
    this.channelDeliveryDir = path.join(this.engineDir, "channel-deliveries");
    this.projectWorkspaceRoot = projectWorkspaceRoot || path.join(os.homedir(), "ai-team");
    this.queues = new Map();
  }

  async init() {
    await migrateEngineRuntimeData({ dataDir: this.dataDir, removeLegacy: false });
    await Promise.all([
      ensureDir(this.projectDir),
      ensureDir(this.intentDir),
      ensureDir(this.taskDir),
      ensureDir(this.runDir),
      ensureDir(this.artifactDir),
      ensureDir(this.sessionDir),
      ensureDir(this.feedbackDir),
      ensureDir(this.operationsDir),
      ensureDir(this.channelDeliveryDir)
    ]);
    await this.#ensureJsonFile(this.feedbackFile, []);
  }

  async createIntent(input) {
    const now = new Date().toISOString();
    const context = { ...(input.context || {}) };
    const workspace = input.workspace || context.workspace;
    if (input.projectId !== undefined && context.projectId === undefined) context.projectId = input.projectId;
    if (input.projectName !== undefined && context.projectName === undefined) context.projectName = input.projectName;
    if (workspace !== undefined && context.workspace === undefined) context.workspace = workspace;
    const intent = {
      id: createId("intent"),
      status: INTENT_STATUS.NEW,
      projectId: input.projectId,
      projectName: input.projectName,
      workspace,
      source: input.source || {},
      replyTarget: input.replyTarget,
      name: input.name,
      description: input.description,
      goal: input.goal,
      constraints: input.constraints || [],
      acceptanceCriteria: input.acceptanceCriteria || [],
      context,
      consumerRole: input.consumerRole,
      taskIds: [],
      artifactIds: [],
      operations: [],
      createdAt: now,
      updatedAt: now
    };
    await this.#writeEntity(this.intentDir, intent.id, intent);
    return intent;
  }

  async getIntent(id) {
    return this.#readEntity(this.intentDir, id);
  }

  async updateIntent(id, updates) {
    return this.#withQueue(`intent:${id}`, () => this.#updateEntity(this.intentDir, id, updates));
  }

  async createTask(input) {
    return this.#withQueue(`intent:${input.intentId}`, async () => {
      const intent = await this.getIntent(input.intentId);
      if (!intent) throw new Error(`intent not found: ${input.intentId}`);

      const now = new Date().toISOString();
      const task = {
        id: createId("task"),
        status: TASK_STATUS.WAITING,
        intentId: input.intentId,
        projectId: input.projectId || intent.projectId || intent.context?.projectId,
        projectName: input.projectName || intent.projectName || intent.context?.projectName,
        workspace: input.workspace || intent.workspace || intent.context?.workspace,
        title: input.title,
        description: input.description,
        producerRole: input.producerRole,
        consumerRole: input.consumerRole,
        dependencies: input.dependencies || [],
        acceptanceCriteria: input.acceptanceCriteria || [],
        artifactIds: [],
        operations: [],
        createdAt: now,
        updatedAt: now
      };
      await this.#writeEntity(this.taskDir, task.id, task);
      await this.#appendIntentRefLocked(intent, "taskIds", task.id);
      return task;
    });
  }

  async getTask(id) {
    return this.#readEntity(this.taskDir, id);
  }

  async updateTask(id, updates) {
    return this.#updateEntity(this.taskDir, id, updates);
  }

  async appendTaskRunAndArtifact(taskId, { runId, artifactId }) {
    return this.#withQueue(`task:${taskId}`, async () => {
      const task = await this.getTask(taskId);
      if (!task) return undefined;
      return this.#updateEntity(this.taskDir, taskId, {
        artifactIds: appendUnique(task.artifactIds, artifactId),
        runIds: appendUnique(task.runIds, runId)
      });
    });
  }

  async createRun(input) {
    const now = new Date().toISOString();
    const scope = await this.#projectScopeForRun(input);
    const run = {
      id: createId("run"),
      status: RUN_STATUS.RUNNING,
      entityType: input.entityType,
      entityId: input.entityId,
      projectId: input.projectId || scope.projectId,
      projectName: input.projectName || scope.projectName,
      workspace: input.workspace || scope.workspace,
      agentRole: input.agentRole,
      sessionKey: input.sessionKey,
      agentTraceId: input.agentTraceId,
      runner: input.runner,
      provider: input.provider,
      model: input.model,
      artifactIds: [],
      createdAt: now,
      updatedAt: now,
      startedAt: now
    };
    await this.#writeEntity(this.runDir, run.id, run);
    return run;
  }

  async getRun(id) {
    return this.#readEntity(this.runDir, id);
  }

  async updateRun(id, updates) {
    return this.#updateEntity(this.runDir, id, updates);
  }

  async completeRun(id, result = {}) {
    const now = new Date().toISOString();
    return this.updateRun(id, {
      status: RUN_STATUS.COMPLETED,
      completedAt: now,
      transcriptSummary: result.transcriptSummary,
      artifactIds: result.artifactIds || []
    });
  }

  async failRun(id, error) {
    const now = new Date().toISOString();
    return this.updateRun(id, {
      status: RUN_STATUS.FAILED,
      completedAt: undefined,
      transcriptSummary: undefined,
      artifactIds: [],
      failedAt: now,
      error: {
        message: error?.message || String(error),
        stack: error?.stack
      }
    });
  }

  async writeArtifact(input) {
    return this.#withQueue(`intent:${input.intentId}`, async () => {
      const intent = await this.getIntent(input.intentId);
      if (!intent) throw new Error(`intent not found: ${input.intentId}`);

      const now = new Date().toISOString();
      const artifact = {
        id: createId("artifact"),
        intentId: input.intentId,
        entityType: input.entityType,
        entityId: input.entityId,
        role: input.role,
        kind: input.kind,
        data: input.data,
        createdAt: now,
        updatedAt: now
      };
      await writeJsonFile(this.#artifactFile(input.intentId, artifact.id), artifact);
      await this.#writeProjectArtifactMirror(intent, artifact);
      await this.#appendIntentRefLocked(intent, "artifactIds", artifact.id);
      return artifact;
    });
  }

  async getArtifact(intentId, artifactId) {
    return readJsonFile(this.#artifactFile(intentId, artifactId), undefined);
  }

  async updateArtifact(intentId, artifactId, updates) {
    const existing = await this.getArtifact(intentId, artifactId);
    if (!existing) return undefined;
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await writeJsonFile(this.#artifactFile(intentId, artifactId), updated);
    await this.#writeProjectArtifactMirror(await this.getIntent(intentId), updated);
    return updated;
  }

  async upsertSession(input) {
    const existing = await readJsonFile(this.#sessionFile(input.key), undefined);
    const now = new Date().toISOString();
    const { key, activeRunId, queuedEntityIds, ...rest } = input;
    const session = {
      ...(existing || {}),
      ...rest,
      key,
      activeRunId,
      queuedEntityIds: queuedEntityIds || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    await writeJsonFile(this.#sessionFile(key), session);
    return session;
  }

  async getSession(key) {
    return readJsonFile(this.#sessionFile(key), undefined);
  }

  async listIntents() {
    return this.#listJson(this.intentDir);
  }

  async createProject(input = {}) {
    const name = normalizeProjectName(input.name || input.projectName || input.slug);
    const slug = normalizeProjectSlug(input.slug || name);
    return this.#withQueue(`project:${slug}`, async () => {
      const existing = await this.getProjectBySlug(slug);
      if (existing) return existing;
      const now = new Date().toISOString();
      const workspace = resolveProjectWorkspace({
        workspace: input.workspace,
        root: input.projectWorkspaceRoot || this.projectWorkspaceRoot,
        slug
      });
      await ensureDir(workspace);
      const project = {
        id: createId("project"),
        status: input.status || "active",
        name,
        slug,
        workspace,
        source: input.source || {},
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now
      };
      await this.#writeEntity(this.projectDir, project.id, project);
      return project;
    });
  }

  async ensureProject(input = {}) {
    const projectId = input.projectId || input.id;
    if (projectId) {
      const project = await this.getProject(projectId);
      if (!project) throw new Error(`project not found: ${projectId}`);
      return project;
    }
    const name = normalizeProjectName(input.name || input.projectName || input.slug);
    const slug = normalizeProjectSlug(input.slug || name);
    const existing = await this.getProjectBySlug(slug);
    if (existing) return existing;
    return this.createProject({ ...input, name, slug });
  }

  async getProject(id) {
    return this.#readEntity(this.projectDir, id);
  }

  async getProjectBySlug(slug) {
    const normalized = normalizeProjectSlug(slug);
    const projects = await this.listProjects();
    return projects.find((project) => project.slug === normalized);
  }

  async listProjects() {
    return this.#listJson(this.projectDir);
  }

  async deleteProject(id, { deleteWorkspace = true } = {}) {
    if (!id) throw new Error("project id is required");
    return this.#withQueue(`project:${id}`, async () => {
      const project = await this.getProject(id);
      if (!project) throw new Error(`project not found: ${id}`);

      const readModel = await this.readModel();
      const projectMatches = (entity = {}) =>
        entity.projectId === project.id ||
        entity.context?.projectId === project.id ||
        entity.projectName === project.name ||
        entity.context?.projectName === project.name ||
        entity.workspace === project.workspace ||
        entity.context?.workspace === project.workspace;

      const intents = (readModel.intents || []).filter(projectMatches);
      const intentIds = new Set(intents.map((intent) => intent.id).filter(Boolean));
      const tasks = (readModel.tasks || []).filter((task) => projectMatches(task) || intentIds.has(task.intentId));
      const taskIds = new Set(tasks.map((task) => task.id).filter(Boolean));
      const runs = (readModel.runs || []).filter((run) =>
        projectMatches(run) ||
        (run.entityType === "intent" && intentIds.has(run.entityId)) ||
        (run.entityType === "task" && taskIds.has(run.entityId))
      );
      const runIds = new Set(runs.map((run) => run.id).filter(Boolean));
      const artifacts = (readModel.artifacts || []).filter((artifact) =>
        intentIds.has(artifact.intentId) ||
        intentIds.has(artifact.entityId) ||
        taskIds.has(artifact.entityId)
      );
      const artifactIds = new Set(artifacts.map((artifact) => artifact.id).filter(Boolean));
      const sessions = (readModel.sessions || []).filter((session) =>
        runIds.has(session.activeRunId) ||
        (session.queuedEntityIds || []).some((entityId) => intentIds.has(entityId) || taskIds.has(entityId))
      );
      const feedback = (readModel.feedback || []).filter((item) =>
        intentIds.has(item.intentId) ||
        intentIds.has(item.linkedIntentId) ||
        taskIds.has(item.taskId) ||
        taskIds.has(item.linkedTaskId)
      );
      const feedbackIds = new Set(feedback.map((item) => item.id).filter(Boolean));

      await Promise.all([
        fs.rm(this.#entityFile(this.projectDir, project.id), { force: true }),
        ...intents.map((intent) => fs.rm(this.#entityFile(this.intentDir, intent.id), { force: true })),
        ...tasks.map((task) => fs.rm(this.#entityFile(this.taskDir, task.id), { force: true })),
        ...runs.map((run) => fs.rm(this.#entityFile(this.runDir, run.id), { force: true })),
        ...artifacts.map((artifact) => fs.rm(this.#artifactFile(artifact.intentId, artifact.id), { force: true })),
        ...sessions.map((session) => fs.rm(this.#sessionFile(session.key), { force: true }))
      ]);

      const backlog = await readJsonFile(this.feedbackFile, []);
      if (feedbackIds.size) {
        await writeJsonFile(this.feedbackFile, backlog.filter((item) => !feedbackIds.has(item.id)));
      }
      await Promise.all([...intentIds].map((intentId) => fs.rm(safeResolveInside(this.artifactDir, String(intentId), intentId), { recursive: true, force: true })));

      const workspaceDeleted = deleteWorkspace && await this.#deleteProjectWorkspace(project);
      if (!workspaceDeleted && project.workspace) {
        await fs.rm(this.#projectEngineDir(project.workspace), { recursive: true, force: true });
      }
      const orphanFeedback = await this.pruneOrphanFeedback();

      return {
        deleted: {
          projectId: project.id,
          intentIds: [...intentIds],
          taskIds: [...taskIds],
          runIds: [...runIds],
          artifactIds: [...artifactIds],
          feedbackIds: [...new Set([...feedbackIds, ...orphanFeedback.feedbackIds])],
          sessionKeys: sessions.map((session) => session.key).filter(Boolean)
        },
        workspaceDeleted
      };
    });
  }

  async pruneOrphanFeedback() {
    const [intents, tasks, feedback] = await Promise.all([
      this.listIntents(),
      this.listTasks(),
      this.listFeedback()
    ]);
    const intentIds = new Set(intents.map((intent) => intent.id).filter(Boolean));
    const taskIds = new Set(tasks.map((task) => task.id).filter(Boolean));
    const removed = [];
    const kept = [];
    for (const item of feedback) {
      if (feedbackHasMissingOnlyLinks(item, intentIds, taskIds)) removed.push(item);
      else kept.push(item);
    }
    if (removed.length) await writeJsonFile(this.feedbackFile, kept);
    return {
      deleted: removed.length,
      feedbackIds: removed.map((item) => item.id).filter(Boolean)
    };
  }

  async listTasks() {
    return this.#listJson(this.taskDir);
  }

  async listRuns() {
    return this.#listJson(this.runDir);
  }

  async listArtifacts() {
    return this.#listJson(this.artifactDir);
  }

  async listSessions() {
    return this.#listJson(this.sessionDir);
  }

  async listChannelDeliveries() {
    return this.#listJson(this.channelDeliveryDir);
  }

  async reserveChannelDelivery(input = {}) {
    const dedupeKey = String(input.dedupeKey || "").trim();
    if (!dedupeKey) throw new Error("channel delivery dedupeKey is required");
    return this.#withQueue(`channel-delivery:${dedupeKey}`, async () => {
      const existing = await this.getChannelDelivery(dedupeKey);
      if (existing) return { created: false, delivery: existing };
      const now = new Date().toISOString();
      const delivery = {
        id: `channel_${stableHash(dedupeKey)}`,
        dedupeKey,
        status: "processing",
        channel: input.channel,
        source: input.source,
        transport: input.transport,
        threadId: input.threadId,
        userId: input.userId,
        eventId: input.eventId,
        text: input.text,
        displayText: input.displayText,
        replyTarget: input.replyTarget,
        createdAt: now,
        updatedAt: now
      };
      await writeJsonFile(this.#channelDeliveryFile(dedupeKey), delivery);
      return { created: true, delivery };
    });
  }

  async getChannelDelivery(dedupeKey) {
    if (!dedupeKey) return undefined;
    return readJsonFile(this.#channelDeliveryFile(dedupeKey), undefined);
  }

  async updateChannelDelivery(dedupeKey, updates = {}) {
    if (!dedupeKey) throw new Error("channel delivery dedupeKey is required");
    return this.#withQueue(`channel-delivery:${dedupeKey}`, async () => {
      const existing = await this.getChannelDelivery(dedupeKey);
      if (!existing) return undefined;
      const updated = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await writeJsonFile(this.#channelDeliveryFile(dedupeKey), updated);
      return updated;
    });
  }

  async deleteChannelDeliveriesFor({ channel, threadId, userId } = {}) {
    const deliveries = await this.listChannelDeliveries();
    const matches = deliveries.filter((delivery) =>
      (!channel || delivery.channel === channel) &&
      (!threadId || delivery.threadId === threadId) &&
      (!userId || delivery.userId === userId)
    );
    await Promise.all(matches.map((delivery) => fs.rm(this.#channelDeliveryFile(delivery.dedupeKey), { force: true })));
    return { deleted: matches.length };
  }

  async listFeedback() {
    const feedback = await readJsonFile(this.feedbackFile, []);
    return [...feedback].sort(compareRows);
  }

  async createFeedback(input) {
    return this.#withQueue("feedback:backlog", async () => {
      const now = new Date().toISOString();
      const normalized = normalizeFeedbackLinks(input || {});
      const feedback = {
        id: createId("feedback"),
        status: normalized.status || FEEDBACK_STATUS.NEW,
        priority: normalized.priority || "untriaged",
        source: normalized.source || {},
        text: normalized.text,
        linkedIntentId: normalized.linkedIntentId,
        linkedTaskId: normalized.linkedTaskId,
        intentId: normalized.intentId,
        taskId: normalized.taskId,
        triageArtifactId: normalized.triageArtifactId,
        dedupeKey: normalized.dedupeKey,
        operations: [],
        createdAt: now,
        updatedAt: now
      };
      const backlog = await readJsonFile(this.feedbackFile, []);
      if (feedback.dedupeKey) {
        const existing = backlog.find((item) => item.dedupeKey === feedback.dedupeKey);
        if (existing) return existing;
      }
      await writeJsonFile(this.feedbackFile, [...backlog, feedback]);
      return feedback;
    });
  }

  async getFeedback(id) {
    const backlog = await this.listFeedback();
    return backlog.find((feedback) => feedback.id === id);
  }

  async updateFeedback(id, updates) {
    if (!id) throw new Error("feedback id is required");
    return this.#withQueue("feedback:backlog", async () => {
      const backlog = await readJsonFile(this.feedbackFile, []);
      const index = backlog.findIndex((feedback) => feedback.id === id);
      if (index === -1) throw new Error(`feedback not found: ${id}`);
      const patch = normalizeFeedbackLinks(updates || {});
      const updated = {
        ...backlog[index],
        ...patch,
        updatedAt: new Date().toISOString()
      };
      const next = [...backlog];
      next[index] = updated;
      await writeJsonFile(this.feedbackFile, next);
      return updated;
    });
  }

  async readModel() {
    const [projects, intents, tasks, runs, artifacts, sessions, feedback] = await Promise.all([
      this.listProjects(),
      this.listIntents(),
      this.listTasks(),
      this.listRuns(),
      this.listArtifacts(),
      this.listSessions(),
      this.listFeedback()
    ]);
    return { projects, intents, tasks, runs, artifacts, sessions, feedback };
  }

  async transitionEntity({ entityType, entityId, status, agentRole, runId, reason, patch = {}, expectedStatus }) {
    if (!entityType) throw new Error("entityType is required");
    if (!entityId) throw new Error("entityId is required");
    if (!status) throw new Error("status is required");
    const operation = ({ fromStatus }) => ({
      at: new Date().toISOString(),
      agentRole: agentRole || "engine",
      action: "status_transition",
      fromStatus,
      toStatus: status,
      runId,
      reason
    });
    if (entityType === "intent") {
      return this.#withQueue(`intent:${entityId}`, async () => {
        const existing = await this.getIntent(entityId);
        if (!existing) throw new Error(`intent not found: ${entityId}`);
        if (!statusMatches(expectedStatus, existing.status)) return undefined;
        return this.#updateEntity(this.intentDir, entityId, {
          ...patch,
          status,
          operations: appendOperation(existing.operations, operation({ fromStatus: existing.status }))
        });
      });
    }
    if (entityType === "task") {
      return this.#withQueue(`task:${entityId}`, async () => {
        const existing = await this.getTask(entityId);
        if (!existing) throw new Error(`task not found: ${entityId}`);
        if (!statusMatches(expectedStatus, existing.status)) return undefined;
        return this.#updateEntity(this.taskDir, entityId, {
          ...patch,
          status,
          operations: appendOperation(existing.operations, operation({ fromStatus: existing.status }))
        });
      });
    }
    if (entityType === "feedback") {
      return this.#withQueue("feedback:backlog", async () => {
        const backlog = await readJsonFile(this.feedbackFile, []);
        const index = backlog.findIndex((feedback) => feedback.id === entityId);
        if (index === -1) throw new Error(`feedback not found: ${entityId}`);
        const existing = backlog[index];
        if (!statusMatches(expectedStatus, existing.status)) return undefined;
        const updated = {
          ...existing,
          ...normalizeFeedbackLinks(patch),
          status,
          operations: appendOperation(existing.operations, operation({ fromStatus: existing.status })),
          updatedAt: new Date().toISOString()
        };
        const next = [...backlog];
        next[index] = updated;
        await writeJsonFile(this.feedbackFile, next);
        return updated;
      });
    }
    throw new Error(`unsupported entity type: ${entityType}`);
  }

  async #readEntity(dir, id) {
    return readJsonFile(this.#entityFile(dir, id), undefined);
  }

  async #ensureJsonFile(file, fallback) {
    const existing = await readJsonFile(file, undefined);
    if (existing === undefined) await writeJsonFile(file, fallback);
  }

  async #writeEntity(dir, id, entity) {
    await writeJsonFile(this.#entityFile(dir, id), entity);
    await this.#writeProjectMirror(dir, id, entity);
  }

  async #updateEntity(dir, id, updates) {
    const existing = await this.#readEntity(dir, id);
    if (!existing) return undefined;
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await this.#writeEntity(dir, id, updated);
    return updated;
  }

  async #appendIntentRefLocked(intent, field, id) {
    const values = intent[field] || [];
    if (values.includes(id)) return intent;
    return this.#updateEntity(this.intentDir, intent.id, { [field]: [...values, id] });
  }

  async #writeProjectMirror(dir, id, entity = {}) {
    const type = this.#projectMirrorType(dir);
    if (!type) return;
    const workspace = entity.workspace || entity.context?.workspace;
    if (!workspace) return;
    const engineDir = this.#projectEngineDir(workspace);
    await this.#ensureProjectEngineDirs(workspace);
    if (type === "projects") {
      await writeJsonFile(path.join(engineDir, "project.json"), entity);
    }
    await writeJsonFile(path.join(engineDir, type, `${id}.json`), entity);
  }

  async #writeProjectArtifactMirror(intent, artifact) {
    const workspace = intent?.workspace || intent?.context?.workspace;
    if (!workspace) return;
    await this.#ensureProjectEngineDirs(workspace);
    await writeJsonFile(
      path.join(this.#projectEngineDir(workspace), "artifacts", String(artifact.intentId), `${artifact.id}.json`),
      artifact
    );
  }

  #projectMirrorType(dir) {
    if (dir === this.projectDir) return "projects";
    if (dir === this.intentDir) return "intents";
    if (dir === this.taskDir) return "tasks";
    if (dir === this.runDir) return "runs";
    return undefined;
  }

  #projectEngineDir(workspace) {
    return path.join(path.resolve(workspace), ".engine");
  }

  async #ensureProjectEngineDirs(workspace) {
    const engineDir = this.#projectEngineDir(workspace);
    await Promise.all([
      ensureDir(engineDir),
      ensureDir(path.join(engineDir, "projects")),
      ensureDir(path.join(engineDir, "intents")),
      ensureDir(path.join(engineDir, "tasks")),
      ensureDir(path.join(engineDir, "runs")),
      ensureDir(path.join(engineDir, "artifacts")),
      ensureDir(path.join(engineDir, "feedback"))
    ]);
  }

  async #deleteProjectWorkspace(project = {}) {
    if (!project.workspace) return false;
    const workspace = path.resolve(project.workspace);
    const root = path.resolve(this.projectWorkspaceRoot);
    const underProjectRoot = workspace === root || workspace.startsWith(`${root}${path.sep}`);
    if (!underProjectRoot) return false;
    await fs.rm(workspace, { recursive: true, force: true });
    return true;
  }

  #sessionFile(key) {
    return this.#entityFile(this.sessionDir, encodeURIComponent(key));
  }

  #channelDeliveryFile(dedupeKey) {
    const hash = stableHash(String(dedupeKey));
    return safeResolveInside(this.channelDeliveryDir, `${hash}.json`, hash);
  }

  #entityFile(dir, id) {
    return safeResolveInside(dir, `${id}.json`, id);
  }

  #artifactFile(intentId, artifactId) {
    const intentDir = safeResolveInside(this.artifactDir, String(intentId), intentId);
    return safeResolveInside(intentDir, `${artifactId}.json`, artifactId);
  }

  async #withQueue(key, operation) {
    const previous = this.queues.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => {}).then(() => current);
    this.queues.set(key, tail);

    await previous.catch(() => {});
    try {
      return await operation();
    } finally {
      release();
      if (this.queues.get(key) === tail) this.queues.delete(key);
    }
  }

  async #listJson(dir) {
    const files = await this.#jsonFiles(dir);
    const rows = await Promise.all(files.map((file) => readJsonFile(file, undefined)));
    return rows.filter(Boolean).sort(compareRows);
  }

  async #jsonFiles(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }

    const files = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return this.#jsonFiles(entryPath);
        if (entry.isFile() && entry.name.endsWith(".json")) return [entryPath];
        return [];
      })
    );
    return files.flat();
  }

  async #projectScopeForRun(input = {}) {
    if (input.projectId || input.projectName || input.workspace) {
      return {
        projectId: input.projectId,
        projectName: input.projectName,
        workspace: input.workspace
      };
    }
    if (input.entityType === "intent") {
      const intent = await this.getIntent(input.entityId);
      return entityProjectScope(intent);
    }
    if (input.entityType === "task") {
      const task = await this.getTask(input.entityId);
      if (task?.projectId || task?.projectName || task?.workspace) return entityProjectScope(task);
      const intent = task?.intentId ? await this.getIntent(task.intentId) : undefined;
      return entityProjectScope(intent);
    }
    return {};
  }
}

function compareRows(a, b) {
  const created = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  if (created !== 0) return created;
  const updated = String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
  if (updated !== 0) return updated;
  return String(a.id || a.key || "").localeCompare(String(b.id || b.key || ""));
}

function safeResolveInside(baseDir, targetPath, sourceId) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, targetPath);
  if (target !== base && target.startsWith(`${base}${path.sep}`)) return target;
  throw new Error(`invalid id path: ${sourceId}`);
}

function appendUnique(values, value) {
  return [...new Set([...(Array.isArray(values) ? values : []), value].filter(Boolean))];
}

function appendOperation(values, operation) {
  const clean = Object.fromEntries(Object.entries(operation).filter(([, value]) => value !== undefined));
  return [...(Array.isArray(values) ? values : []), clean];
}

function statusMatches(expectedStatus, currentStatus) {
  if (expectedStatus === undefined) return true;
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  return expected.includes(currentStatus);
}

function feedbackHasMissingOnlyLinks(item = {}, intentIds = new Set(), taskIds = new Set()) {
  const linkedIntentIds = [item.intentId, item.linkedIntentId].filter(Boolean);
  const linkedTaskIds = [item.taskId, item.linkedTaskId].filter(Boolean);
  if (!linkedIntentIds.length && !linkedTaskIds.length) return false;
  return !linkedIntentIds.some((id) => intentIds.has(id)) && !linkedTaskIds.some((id) => taskIds.has(id));
}

function normalizeProjectName(value) {
  const name = String(value || "").trim().normalize("NFKC").replace(/\s+/g, " ");
  return name || "default";
}

function normalizeProjectSlug(value) {
  const normalized = String(value || "default")
    .trim()
    .normalize("NFKC")
    .replace(/[\\/]+/g, "-")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return normalized || `project-${stableHash(String(value || "default")).slice(0, 8)}`;
}

function resolveProjectWorkspace({ workspace, root, slug }) {
  if (workspace) return path.resolve(workspace);
  return path.join(path.resolve(root), slug);
}

function entityProjectScope(entity = {}) {
  return {
    projectId: entity.projectId || entity.context?.projectId,
    projectName: entity.projectName || entity.context?.projectName,
    workspace: entity.workspace || entity.context?.workspace
  };
}

function normalizeFeedbackLinks(input) {
  const normalized = { ...input };
  if (normalized.linkedIntentId === undefined && normalized.intentId !== undefined) {
    normalized.linkedIntentId = normalized.intentId;
  }
  if (normalized.linkedTaskId === undefined && normalized.taskId !== undefined) {
    normalized.linkedTaskId = normalized.taskId;
  }
  if (normalized.intentId === undefined && normalized.linkedIntentId !== undefined) {
    normalized.intentId = normalized.linkedIntentId;
  }
  if (normalized.taskId === undefined && normalized.linkedTaskId !== undefined) {
    normalized.taskId = normalized.linkedTaskId;
  }
  return normalized;
}
