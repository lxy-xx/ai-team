import { toLegacyTask } from "../../domain/schema.js";

function compactPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const compacted = Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== "")
  );
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export class EngineToolHandlers {
  constructor({ config, engine, engineStore, channelConfigStore, toolRegistry, outboundReplyService }) {
    this.config = config;
    this.engine = engine;
    this.engineStore = engineStore;
    this.channelConfigStore = channelConfigStore;
    this.toolRegistry = toolRegistry;
    this.outboundReplyService = outboundReplyService;
  }

  register() {
    if (!this.toolRegistry?.registerHandler) return;
    this.toolRegistry.registerHandler("engine.projects", (input, context) => this.manageProjects(input, context));
    this.toolRegistry.registerHandler("engine.create_intent", (input, context) => this.createEngineIntent(input, context));
    this.toolRegistry.registerHandler("engine.transition", (input, context) => this.transitionEngineEntity(input, context));
    this.toolRegistry.registerHandler("engine.retry_blocked", (input, context) => this.retryBlockedWork(input, context));
    this.toolRegistry.registerHandler("channel.reply", (input, context) => this.channelReply(input, context));
    this.toolRegistry.registerHandler("scheduler.inspect", () => this.inspectScheduler());
  }

  async createEngineIntent(input, context = {}) {
    if (!this.engine?.createIntentFromMessage) throw new Error("engine.create_intent requires TeamEngine createIntentFromMessage support");
    const text = String(input.text || input.goal || "").trim();
    if (!text) throw new Error("engine.create_intent requires text");
    const host = context.hostContext || {};
    const channel = firstPresent(host.channel, input.channel, "unknown");
    const metadata = {
      ...(host.metadata || {}),
      ...(input.metadata || {})
    };
    if (Array.isArray(input.constraints)) metadata.constraints = input.constraints;
    if (Array.isArray(input.acceptanceCriteria)) metadata.acceptanceCriteria = input.acceptanceCriteria;
    if (input.priority) metadata.priority = input.priority;
    return this.engine.createIntentFromMessage({
      channel,
      source: firstPresent(host.source, input.source, channel, "unknown"),
      transport: firstPresent(host.transport, input.transport, "agent_tool"),
      threadId: firstPresent(host.threadId, input.threadId),
      userId: firstPresent(host.userId, input.userId),
      userName: firstPresent(host.userName, input.userName),
      eventId: firstPresent(host.eventId, input.eventId),
      dedupeKey: firstPresent(host.dedupeKey, input.dedupeKey),
      createdAt: firstPresent(host.createdAt, input.createdAt),
      name: firstPresent(input.name, input.intentName, metadata.name, metadata.intentName),
      description: firstPresent(input.description, input.intentDescription, metadata.description, metadata.intentDescription),
      text,
      replyTarget: compactPlainObject(host.replyTarget) || compactPlainObject(input.replyTarget),
      workspace: firstPresent(host.workspace, input.workspace),
      projectId: firstPresent(input.projectId, input.project?.id, metadata.projectId, host.projectId),
      projectName: firstPresent(input.projectName, input.project?.name, metadata.projectName, host.projectName),
      projectSlug: firstPresent(input.projectSlug, input.project?.slug, metadata.projectSlug, host.projectSlug),
      projectWorkspace: firstPresent(input.projectWorkspace, input.project?.workspace, metadata.projectWorkspace, host.projectWorkspace),
      metadata
    });
  }

  async manageProjects(input = {}, context = {}) {
    if (!this.engineStore?.listProjects) throw new Error("engine.projects requires EngineStore project support");
    const action = String(input.action || "list").trim();
    if (action === "list") {
      const limit = Math.max(1, Math.min(Number(input.limit) || 50, 200));
      const projects = await this.engineStore.listProjects();
      return { projects: projects.slice(0, limit) };
    }
    if (action === "get") {
      const project = input.projectId
        ? await this.engineStore.getProject(input.projectId)
        : await this.engineStore.getProjectBySlug(input.slug || input.projectName || input.name);
      if (!project) throw new Error(`project not found: ${input.projectId || input.slug || input.projectName || input.name || ""}`);
      return { project };
    }
    if (action === "create") {
      if (!this.engineStore.ensureProject) throw new Error("engine.projects create requires EngineStore ensureProject support");
      if (!input.name && !input.projectName) throw new Error("engine.projects create requires name or projectName");
      const project = await this.engineStore.ensureProject({
        name: input.name || input.projectName,
        slug: input.slug,
        workspace: input.workspace,
        projectWorkspaceRoot: this.config.projectWorkspaceRoot,
        source: { tool: "engine.projects", role: context.role },
        createdBy: context.role || "ceo"
      });
      return { project };
    }
    throw new Error(`unsupported engine.projects action: ${action}`);
  }

  async transitionEngineEntity(input, context) {
    if (!this.engineStore?.transitionEntity) throw new Error("engine.transition requires EngineStore transition support");
    if (!input.entityType) throw new Error("engine.transition requires entityType");
    if (!input.entityId) throw new Error("engine.transition requires entityId");
    if (!input.status) throw new Error("engine.transition requires status");
    return this.engineStore.transitionEntity({
      entityType: input.entityType,
      entityId: input.entityId,
      status: input.status,
      agentRole: input.agentRole || context.role,
      runId: input.runId,
      reason: input.reason,
      patch: input.patch || {}
    });
  }

  async retryBlockedWork(input, context = {}) {
    if (!this.engine?.retryBlockedWork) throw new Error("engine.retry_blocked requires TeamEngine retryBlockedWork support");
    if (!input.entityType) throw new Error("engine.retry_blocked requires entityType");
    if (!input.entityId) throw new Error("engine.retry_blocked requires entityId");
    return this.engine.retryBlockedWork({
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      agentRole: input.agentRole || context.role
    });
  }

  async channelReply(input, context) {
    if (!input.text) throw new Error("channel.reply requires text");
    const taskId = input.taskId || context.taskId;
    const task = taskId ? await this.lookupReplyTarget(taskId) : this.directReplyTargetFromContext(context);
    if (!task) throw new Error(`task not found: ${taskId}`);
    if (!this.outboundReplyService) {
      return {
        queued: false,
        taskId,
        message: "channel.reply is recorded for audit; outbound reply service is unavailable.",
        text: String(input.text)
      };
    }
    return this.outboundReplyService.send(task, String(input.text), {
      source: `tool:${context.role}`
    });
  }

  directReplyTargetFromContext(context = {}) {
    const host = context.hostContext || {};
    if (!host.replyTarget || !host.channel) return undefined;
    return {
      id: context.taskId || host.eventId || host.threadId || "direct_channel_reply",
      channel: host.channel,
      threadId: host.threadId || host.channel,
      userId: host.userId,
      replyTarget: host.replyTarget
    };
  }

  async lookupReplyTarget(id) {
    const directIntent = await this.engineStore.getIntent(id);
    if (directIntent) return toLegacyTask(directIntent);
    const engineTask = await this.engineStore.getTask(id);
    if (!engineTask?.intentId) return undefined;
    const intent = await this.engineStore.getIntent(engineTask.intentId);
    return intent ? toLegacyTask(intent) : undefined;
  }

  async inspectScheduler() {
    const model = await this.engineStore.readModel();
    return {
      pollIntervalMs: this.config.pollIntervalMs,
      feedbackScanIntervalMs: this.config.feedbackScanIntervalMs,
      projects: (model.projects || []).length,
      intents: model.intents.length,
      tasks: model.tasks.length,
      feedback: model.feedback.length,
      pending: model.intents.filter((intent) => intent.status === "new" || intent.status === "routing").length,
      running:
        model.intents.filter((intent) => intent.status === "in_progress").length +
        model.tasks.filter((task) => ["waiting", "working", "testing", "deploying", "worked", "tested"].includes(task.status)).length,
      completed: model.intents.filter((intent) => intent.status === "done").length,
      failed: model.intents.filter((intent) => intent.status === "blocked").length + model.tasks.filter((task) => task.status === "blocked").length
    };
  }

}
