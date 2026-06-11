import { stableHash } from "../../platform/ids.js";
import { TaskGraph } from "../domain/task-graph.js";
import { VerificationResult } from "../domain/verification-result.js";
import { INTENT_STATUS, ROLES, RUN_STATUS, TASK_STATUS, sessionKeyFor, toLegacyTask } from "../domain/schema.js";

function nowIso() {
  return new Date().toISOString();
}

function appendUnique(values, value) {
  return [...new Set([...(Array.isArray(values) ? values : []), value].filter(Boolean))];
}

function firstCompletedToolOutput(result, toolId) {
  const calls = Array.isArray(result?.trace?.toolCalls) ? result.trace.toolCalls : [];
  const match = calls.find((call) => call?.toolId === toolId && call.status !== "failed");
  return match?.output;
}

function channelDeliveryDedupeKey(message = {}) {
  const channel = message.channel || "unknown";
  if (message.dedupeKey) return String(message.dedupeKey);
  if (message.eventId) return `${channel}:${message.eventId}`;
  if (message.replyTarget?.messageId) return `${channel}:${message.replyTarget.messageId}`;
  return undefined;
}

function resultFromDuplicateChannelDelivery(delivery = {}) {
  return {
    ignored: false,
    duplicate: true,
    reason: "duplicate_channel_message",
    directAgentTurn: true,
    created: Boolean(delivery.intentCreated),
    finalText: delivery.finalText,
    reply: delivery.reply,
    intent: delivery.intentId ? { id: delivery.intentId } : undefined,
    task: delivery.taskId ? { id: delivery.taskId } : undefined,
    sessionId: delivery.sessionId
  };
}

function taskFinished(task) {
  return task?.status === TASK_STATUS.DONE || task?.status === TASK_STATUS.TESTED;
}

function latestBlockedTransition(entity = {}) {
  return [...(entity.operations || [])].reverse().find((operation) => operation?.toStatus === "blocked");
}

function retryStatusForTask(task = {}) {
  const previousStatus = latestBlockedTransition(task)?.fromStatus;
  if (task.blocked?.phase === "verification" || previousStatus === TASK_STATUS.TESTING) return TASK_STATUS.TESTING;
  return TASK_STATUS.WAITING;
}

function retryStatusForIntent(intent = {}, blockedTasks = [], allTasks = []) {
  if (blockedTasks.length) return INTENT_STATUS.IN_PROGRESS;
  if (intent.blocked?.phase === "intent_consumer" || allTasks.length === 0) return INTENT_STATUS.NEW;
  return INTENT_STATUS.IN_PROGRESS;
}

function retryClearPatch(entity = {}) {
  const patch = {
    blockedAt: undefined,
    blocked: undefined
  };
  if (
    entity.context &&
    typeof entity.context === "object" &&
    !Array.isArray(entity.context) &&
    Object.hasOwn(entity.context, "blockerNotification")
  ) {
    const { blockerNotification, ...context } = entity.context;
    patch.context = context;
  }
  return patch;
}

function recoverableRunSessionKey(value) {
  const sessionKey = typeof value === "string" ? value.trim() : "";
  return sessionKey.startsWith("sess_") ? sessionKey : undefined;
}

function agentSessionBindingPatch(entity = {}, agentRole, sessionKey) {
  if (!agentRole || !sessionKey) return {};
  return {
    agentSessions: {
      ...(entity.agentSessions || {}),
      [agentRole]: sessionKey
    }
  };
}

function interruptedRunError() {
  return new Error("interrupted run recovered on startup");
}

function interruptedRunBlockedPayload(run = {}, previousStatus) {
  return {
    phase: "interrupted_run",
    reason: "interrupted run recovered on startup",
    message: "The previous service process stopped before AgentRuntime returned a result. Continue work will retry from the preserved Agent session when available.",
    runId: run.id,
    previousStatus,
    agentRole: run.agentRole
  };
}

function taskDependenciesMet(task, tasks) {
  return (task.dependencies || []).every((dependency) => {
    const match = tasks.find((candidate) => candidate.id === dependency);
    return Boolean(match && taskFinished(match));
  });
}

function shortText(value, maxLength = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function formatCeoBlockerReport({ intent, blocked = {}, agentRole }) {
  const title = shortText(intent?.goal || intent?.id || "这个意图", 80);
  const reason = shortText(blocked.message || blocked.reason || "系统遇到阻塞，需要处理后才能继续。", 220);
  const owner = agentRole || blocked.agentRole || "engine";
  return [
    `CEO 入口同步：意图「${title}」暂时无法继续推进。`,
    `原因：${reason}`,
    `当前卡片会继续保留在看板的意图泳道里；负责人：${owner}。我会等系统恢复或拿到必要上下文后继续推进。`
  ].join("\n");
}

export class TeamEngine {
  constructor({ store, bus, worker, config = {}, memory, outboundReplyService, logger = console, routingStore }) {
    this.store = store;
    this.bus = bus;
    this.worker = worker;
    this.config = config;
    this.memory = memory;
    this.outboundReplyService = outboundReplyService;
    this.logger = logger;
    this.routingStore = routingStore;
    this.activeRoles = new Set();
    this.healthState = {
      memory: { ok: true },
      outbound: { ok: true }
    };
  }

  async init({ recoverInterruptedRuns = true } = {}) {
    await this.store.init();
    await this.bus.init();
    if (recoverInterruptedRuns) await this.recoverInterruptedRuns();
  }

  async recoverInterruptedRuns() {
    if (typeof this.store.listRuns !== "function") return { recovered: 0 };
    const runs = await this.store.listRuns();
    const runningRuns = runs.filter((run) => run.status === RUN_STATUS.RUNNING);
    let recovered = 0;
    for (const run of runningRuns) {
      await this.recoverInterruptedRun(run);
      recovered += 1;
    }
    return { recovered };
  }

  async recoverInterruptedRun(run = {}) {
    const metadata = await this.interruptedRunMetadata(run);
    const runPatch = Object.fromEntries(Object.entries({
      sessionKey: metadata.sessionKey,
      agentTraceId: metadata.agentTraceId
    }).filter(([, value]) => value !== undefined));
    if (Object.keys(runPatch).length) {
      await this.store.updateRun(run.id, runPatch);
    }
    await this.store.failRun(run.id, interruptedRunError());
    if (run.entityType === "task") {
      const task = await this.store.getTask(run.entityId);
      if (task?.status && ![TASK_STATUS.WORKING, TASK_STATUS.TESTING].includes(task.status)) {
        return;
      }
      await this.recoverInterruptedTaskRun(run, metadata);
    } else if (run.entityType === "intent") {
      const intent = await this.store.getIntent(run.entityId);
      if (intent?.status && ![INTENT_STATUS.ROUTING, INTENT_STATUS.IN_PROGRESS].includes(intent.status)) {
        return;
      }
      await this.recoverInterruptedIntentRun(run, metadata);
    }
  }

  async interruptedRunMetadata(run = {}) {
    let metadata = {};
    if (typeof this.worker?.recoverInterruptedRunMetadata === "function") {
      try {
        metadata = await this.worker.recoverInterruptedRunMetadata(run) || {};
      } catch (error) {
        this.logger?.warn?.({ error: error?.message || String(error), runId: run.id }, "interrupted run metadata recovery failed");
      }
    }
    const sessionKey = metadata.sessionKey || recoverableRunSessionKey(run.sessionKey);
    return {
      sessionKey,
      agentTraceId: metadata.agentTraceId || run.agentTraceId
    };
  }

  async recoverInterruptedTaskRun(run = {}, metadata = {}) {
    const task = await this.store.getTask(run.entityId);
    if (!task) return;
    const patch = {
      ...agentSessionBindingPatch(task, run.agentRole, metadata.sessionKey)
    };
    if (task.status !== TASK_STATUS.WORKING) {
      if (Object.keys(patch).length) await this.store.updateTask(task.id, patch);
      return;
    }
    await this.store.transitionEntity({
      entityType: "task",
      entityId: task.id,
      status: TASK_STATUS.BLOCKED,
      agentRole: run.agentRole || "engine",
      runId: run.id,
      reason: "interrupted run recovered on startup",
      patch: {
        ...patch,
        blockedAt: nowIso(),
        blocked: interruptedRunBlockedPayload(run, task.status)
      }
    });
  }

  async recoverInterruptedIntentRun(run = {}, metadata = {}) {
    const intent = await this.store.getIntent(run.entityId);
    if (!intent) return;
    const patch = {
      ...agentSessionBindingPatch(intent, run.agentRole, metadata.sessionKey)
    };
    if (intent.status !== INTENT_STATUS.ROUTING) {
      if (Object.keys(patch).length) await this.store.updateIntent(intent.id, patch);
      return;
    }
    await this.store.transitionEntity({
      entityType: "intent",
      entityId: intent.id,
      status: INTENT_STATUS.BLOCKED,
      agentRole: run.agentRole || "engine",
      runId: run.id,
      reason: "interrupted run recovered on startup",
      patch: {
        ...patch,
        blockedAt: nowIso(),
        blocked: interruptedRunBlockedPayload(run, intent.status)
      }
    });
  }

  async createIntentFromMessage(input) {
    const text = String(input.text || "").trim();
    if (!text) return { ignored: true, reason: "empty text" };

    const channel = input.channel || "unknown";
    const threadId = input.threadId || channel;
    const eventId = input.eventId || stableHash(`${channel}:${threadId}:${text}:${input.createdAt || ""}`);
    const dedupeKey = input.dedupeKey || `${channel}:${eventId}`;
    const existing = (await this.store.listIntents()).find((intent) => intent.context?.dedupeKey === dedupeKey);
    if (existing) {
      return { intent: existing, task: toLegacyTask(existing), created: false, ignored: false };
    }

    const metadata = input.metadata || {};
    const project = await this.resolveIntentProject(input, metadata);
    const name = String(input.name || metadata.name || metadata.intentName || "").trim() || undefined;
    const description = String(input.description || metadata.description || metadata.intentDescription || "").trim() || undefined;
    const intent = await this.store.createIntent({
      projectId: project?.id,
      projectName: project?.name,
      workspace: project?.workspace || input.workspace,
      source: {
        channel,
        transport: input.transport || "http",
        source: input.source || channel,
        threadId,
        userId: input.userId || "unknown",
        userName: input.userName,
        eventId
      },
      replyTarget: input.replyTarget,
      name,
      description,
      goal: text,
      constraints: metadata.constraints || [],
      acceptanceCriteria: metadata.acceptanceCriteria || [],
      context: {
        ...metadata,
        route: "channel_to_ceo",
        addressedTo: ROLES.CEO,
        dedupeKey,
        eventId,
        transport: input.transport || "http",
        projectId: project?.id,
        projectName: project?.name,
        workspace: project?.workspace || input.workspace
      }
    });

    await this.recordMemoryEvent({
      type: "engine_intent_created",
      channel,
      threadId,
      userId: input.userId || "unknown",
      intentId: intent.id,
      projectId: intent.projectId,
      projectName: intent.projectName,
      text
    }, { phase: "intent_memory", intentId: intent.id });

    return { intent, task: toLegacyTask(intent), created: true, ignored: false };
  }

  async deliverChannelMessageToCeo(input) {
    const text = String(input.text || "").trim();
    if (!text) return { ignored: true, reason: "empty text" };
    if (typeof this.worker?.runChannelMessage !== "function") {
      throw new Error("CEO channel delivery requires WorkerEngine runChannelMessage support");
    }

    const message = {
      ...input,
      text,
      channel: input.channel || "unknown",
      threadId: input.threadId || input.channel || "unknown",
      userId: input.userId || "unknown",
      workspace: input.workspace,
      metadata: input.metadata || {}
    };
    const deliveryDedupeKey = channelDeliveryDedupeKey(message);
    const reservation = deliveryDedupeKey && this.store.reserveChannelDelivery
      ? await this.store.reserveChannelDelivery({
          dedupeKey: deliveryDedupeKey,
          channel: message.channel,
          source: message.source,
          transport: message.transport,
          threadId: message.threadId,
          userId: message.userId,
          eventId: message.eventId,
          text: message.text,
          displayText: message.displayText,
          replyTarget: message.replyTarget
        })
      : undefined;
    if (reservation && !reservation.created) return resultFromDuplicateChannelDelivery(reservation.delivery);

    try {
      const result = await this.worker.runChannelMessage({
        role: ROLES.CEO,
        message,
        sessionId: sessionKeyFor({
          agentRole: ROLES.CEO,
          channel: message.channel,
          threadId: message.threadId,
          userId: message.userId
        }),
        forceIntent: input.forceIntent === true || input.metadata?.forceIntent === true
      });
      const createIntentResult = firstCompletedToolOutput(result, "engine.create_intent");
      const replyResult = firstCompletedToolOutput(result, "channel.reply");
      const fallbackIntent = !createIntentResult && (input.forceIntent === true || input.metadata?.forceIntent === true)
        ? await this.createIntentFromMessage({
            ...message,
            metadata: {
              ...message.metadata,
              route: "explicit_work_intake",
              createdBy: "ceo_force_intent_fallback"
            }
          })
        : undefined;
      const intentResult = createIntentResult || fallbackIntent;
      const finalText = String(result?.finalText || "").trim();
      const reply = replyResult || (finalText ? await this.sendDirectChannelReply(message, finalText) : undefined);
      const response = {
        ...(intentResult || { created: false, ignored: false }),
        directAgentTurn: true,
        finalText,
        sessionId: result?.sessionId,
        trace: result?.trace,
        reply
      };
      if (deliveryDedupeKey && this.store.updateChannelDelivery) {
        await this.store.updateChannelDelivery(deliveryDedupeKey, {
          status: "completed",
          completedAt: nowIso(),
          finalText,
          intentId: intentResult?.intent?.id,
          taskId: intentResult?.task?.id,
          intentCreated: Boolean(intentResult?.created),
          reply,
          sessionId: result?.sessionId,
          traceId: result?.trace?.traceId
        });
      }
      return response;
    } catch (error) {
      if (deliveryDedupeKey && this.store.updateChannelDelivery) {
        await this.store.updateChannelDelivery(deliveryDedupeKey, {
          status: "failed",
          failedAt: nowIso(),
          error: { message: error?.message || String(error) }
        });
      }
      throw error;
    }
  }

  async sendDirectChannelReply(message, finalText) {
    if (!this.outboundReplyService?.send || !message.replyTarget || !message.channel || !finalText) return undefined;
    const directTask = {
      id: `direct_${stableHash(`${message.channel}:${message.threadId}:${message.eventId || message.text}`)}`,
      channel: message.channel,
      threadId: message.threadId || message.channel,
      userId: message.userId,
      replyTarget: message.replyTarget
    };
    try {
      return await this.outboundReplyService.send(directTask, finalText, { source: "ceo_direct_reply" });
    } catch (error) {
      this.recordOutboundFailure(error, {
        phase: "ceo_direct_reply",
        channel: message.channel,
        threadId: message.threadId,
        eventId: message.eventId
      });
      return { status: "failed", reason: error.message };
    }
  }

  async resolveIntentProject(input = {}, metadata = {}) {
    if (typeof this.store?.ensureProject !== "function") {
      return input.workspace
        ? { id: input.projectId || metadata.projectId, name: input.projectName || metadata.projectName, workspace: input.workspace }
        : undefined;
    }
    const metadataProject = metadata.project && typeof metadata.project === "object" ? metadata.project : {};
    const projectId = input.projectId || metadata.projectId || metadataProject.id;
    const projectName =
      input.projectName ||
      metadata.projectName ||
      metadataProject.name ||
      (typeof metadata.project === "string" ? metadata.project : undefined) ||
      input.projectSlug ||
      metadata.projectSlug ||
      this.config.defaultProjectName ||
      "default";
    return this.store.ensureProject({
      projectId,
      name: projectName,
      slug: input.projectSlug || metadata.projectSlug || metadataProject.slug,
      workspace: input.projectWorkspace || metadata.projectWorkspace || metadataProject.workspace || input.workspace,
      projectWorkspaceRoot: this.config.projectWorkspaceRoot,
      source: {
        channel: input.channel || "unknown",
        threadId: input.threadId || input.channel || "unknown",
        userId: input.userId || "unknown"
      },
      createdBy: metadata.createdBy || "ceo"
    });
  }

  async createFeedback(input) {
    const feedback = await this.store.createFeedback(input);
    await this.recordFeedbackMemoryEvent({
      type: "engine_feedback_created",
      feedbackId: feedback.id,
      source: feedback.source,
      text: feedback.text,
      priority: feedback.priority,
      linkedIntentId: feedback.linkedIntentId,
      linkedTaskId: feedback.linkedTaskId
    });
    return feedback;
  }

  async updateFeedback(id, patch) {
    const feedback = await this.store.updateFeedback(id, patch);
    await this.recordFeedbackMemoryEvent({
      type: "engine_feedback_updated",
      feedbackId: feedback.id,
      source: feedback.source,
      text: feedback.text,
      status: feedback.status,
      priority: feedback.priority,
      linkedIntentId: feedback.linkedIntentId,
      linkedTaskId: feedback.linkedTaskId
    });
    return feedback;
  }

  async tick() {
    const processed =
      (await this.routeNewIntents()) +
      (await this.routeReadyTasks()) +
      (await this.finalizeCompletedIntents());
    return { processed };
  }

  async routeNewIntents() {
    const intents = await this.store.listIntents();
    let processed = 0;
    for (const intent of intents.filter((candidate) => candidate.status === INTENT_STATUS.NEW)) {
      const consumer = await this.firstConsumerFor({
        entityType: "intent",
        status: INTENT_STATUS.NEW,
        entity: intent
      });
      if (!consumer) continue;
      if (await this.consumeIntentWithPlanner(intent, consumer)) processed += 1;
    }
    return processed;
  }

  async consumeIntentWithPlanner(intent, consumer) {
    const agentRole = consumer.role;
    if (!this.claimRole(agentRole)) return false;
    try {
      const claimedIntent = await this.store.transitionEntity({
        entityType: "intent",
        entityId: intent.id,
        status: INTENT_STATUS.ROUTING,
        expectedStatus: INTENT_STATUS.NEW,
        agentRole,
        reason: "wake rule consumed intent"
      });
      if (!claimedIntent) return false;
      let result;
      try {
        result = await this.worker.runIntent({ role: agentRole, intent: claimedIntent, previousArtifacts: [] });
      } catch (error) {
        await this.blockIntent(intent.id, {
          phase: "intent_consumer",
          reason: "Intent consumer failed",
          message: error?.message || String(error)
        }, agentRole);
        return true;
      }
      const graph = result.artifact?.data;
      const taskGraph = new TaskGraph(graph);
      const invalidReason = taskGraph.validate();
      if (invalidReason) {
        await this.blockIntent(intent.id, {
          phase: "intent_consumer",
          reason: invalidReason,
          artifactId: result.artifact?.id,
          runId: result.run?.id
        }, agentRole);
        return true;
      }

      const createdTasks = [];
      for (const task of taskGraph.tasks) {
        createdTasks.push(
          await this.store.createTask({
            intentId: intent.id,
            title: task.title,
            description: task.description,
            producerRole: agentRole,
            dependencies: task.dependencies || [],
            acceptanceCriteria: task.acceptanceCriteria || []
          })
        );
      }
      const dependencyMap = taskGraph.dependencyMapFor(createdTasks);
      await Promise.all(
        createdTasks.map((createdTask, index) =>
          this.store.updateTask(createdTask.id, {
            dependencies: (taskGraph.tasks[index].dependencies || []).map((dependency) => dependencyMap.get(dependency))
          })
        )
      );

      const current = await this.store.getIntent(intent.id);
      await this.store.transitionEntity({
        entityType: "intent",
        entityId: intent.id,
        status: consumer.rule?.afterRunStatus || INTENT_STATUS.IN_PROGRESS,
        expectedStatus: INTENT_STATUS.ROUTING,
        agentRole,
        runId: result.run?.id,
        reason: "intent consumer produced task graph",
        patch: {
          taskIds: [...new Set([...(current?.taskIds || []), ...createdTasks.map((task) => task.id)])],
          runIds: appendUnique(current?.runIds, result.run?.id)
        }
      });
      return true;
    } finally {
      this.releaseRole(agentRole);
    }
  }

  async routeReadyTasks() {
    const tasks = await this.store.listTasks();
    const jobs = [];
    const claimedRoles = new Set();
    for (const task of tasks) {
      const intentTasks = tasks.filter((candidate) => candidate.intentId === task.intentId);
      if (task.status === TASK_STATUS.WAITING && taskDependenciesMet(task, intentTasks)) {
        const consumer = await this.firstConsumerFor({
          entityType: "task",
          status: TASK_STATUS.WAITING,
          entity: task
        });
        if (!consumer) continue;
        const role = consumer.role || task.claimedByRole || task.consumerRole;
        if (claimedRoles.has(role) || !this.claimRole(role)) continue;
        claimedRoles.add(role);
        jobs.push(async () => {
          try {
            return await this.runImplementationOrCustomerTask(task, consumer);
          } finally {
            this.releaseRole(role);
          }
        });
      } else if (task.status === TASK_STATUS.TESTING) {
        const consumer = await this.firstConsumerFor({
          entityType: "task",
          status: TASK_STATUS.TESTING,
          entity: task
        });
        if (!consumer) continue;
        const role = consumer.role;
        if (claimedRoles.has(role) || !this.claimRole(role)) continue;
        claimedRoles.add(role);
        jobs.push(async () => {
          try {
            return await this.runVerification(task, consumer);
          } finally {
            this.releaseRole(role);
          }
        });
      }
    }
    const results = await Promise.allSettled(jobs.map((job) => job()));
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
    return results.filter((result) => result.status === "fulfilled" && result.value).length;
  }

  async runImplementationOrCustomerTask(task, consumer = {}) {
    const agentRole = consumer.role || task.claimedByRole || task.consumerRole;
    if (!agentRole) throw new Error("task run requires a configured routing consumer role");
    const afterRunStatus = consumer.rule?.afterRunStatus || TASK_STATUS.DONE;
    const intent = await this.store.getIntent(task.intentId);
    const artifacts =
      afterRunStatus === TASK_STATUS.TESTING
        ? await this.artifactsForTask(task.intentId, task.id)
        : await this.artifactsForIntent(task.intentId);
    const working = await this.store.transitionEntity({
      entityType: "task",
      entityId: task.id,
      status: TASK_STATUS.WORKING,
      expectedStatus: TASK_STATUS.WAITING,
      agentRole,
      reason: "wake rule started task",
      patch: {
        startedAt: task.startedAt || nowIso(),
        claimedByRole: agentRole
      }
    });
    if (!working) return undefined;
    let result;
    try {
      result = await this.worker.runTask({
        role: agentRole,
        intent,
        task: working,
        previousArtifacts: artifacts
      });
    } catch (error) {
      return this.blockTask(task.id, {
        phase: "implementation",
        reason: "Task worker failed",
        message: error?.message || String(error)
      }, agentRole);
    }
    const refreshed = await this.store.getTask(task.id);
    if (refreshed?.status && refreshed.status !== TASK_STATUS.WORKING) {
      return this.store.updateTask(task.id, {
        artifactIds: appendUnique(refreshed?.artifactIds, result.artifact?.id),
        runIds: appendUnique(refreshed?.runIds, result.run?.id)
      });
    }
    return this.store.transitionEntity({
      entityType: "task",
      entityId: task.id,
      status: afterRunStatus,
      expectedStatus: TASK_STATUS.WORKING,
      agentRole,
      runId: result.run?.id,
      reason: "task consumer completed run",
      patch: {
        completedAt: afterRunStatus === TASK_STATUS.DONE ? nowIso() : undefined,
        artifactIds: appendUnique(refreshed?.artifactIds, result.artifact?.id),
        runIds: appendUnique(refreshed?.runIds, result.run?.id)
      }
    });
  }

  async runVerification(task, consumer = {}) {
    const agentRole = consumer.role;
    if (!agentRole) throw new Error("verification run requires a configured routing consumer role");
    const intent = await this.store.getIntent(task.intentId);
    const artifacts = await this.artifactsForTask(task.intentId, task.id);
    const working = await this.store.transitionEntity({
      entityType: "task",
      entityId: task.id,
      status: TASK_STATUS.WORKING,
      expectedStatus: TASK_STATUS.TESTING,
      agentRole,
      reason: "wake rule started verification",
      patch: {
        startedAt: task.startedAt || nowIso()
      }
    });
    if (!working) return undefined;
    let result;
    try {
      result = await this.worker.runTask({
        role: agentRole,
        intent,
        task: working,
        previousArtifacts: artifacts
      });
    } catch (error) {
      return this.blockTask(task.id, {
        phase: "verification",
        reason: "Verification worker failed",
        message: error?.message || String(error)
      }, agentRole);
    }
    const verdict = result.artifact?.data?.verdict;
    const refreshed = await this.store.getTask(task.id);
    const transition = new VerificationResult({
      task: refreshed,
      result,
      verdict,
      checkedAt: nowIso()
    }).toTransition();
    const updatedTask = await this.store.transitionEntity({
      entityType: "task",
      entityId: task.id,
      status: transition.status,
      expectedStatus: TASK_STATUS.WORKING,
      agentRole,
      runId: transition.runId,
      reason: transition.reason,
      patch: transition.patch
    });
    if (
      transition.status === TASK_STATUS.DONE &&
      intent?.status === INTENT_STATUS.BLOCKED &&
      intent.blocked?.phase === "task_blocked" &&
      (intent.blocked.blockedTaskIds || []).includes(task.id)
    ) {
      await this.store.transitionEntity({
        entityType: "intent",
        entityId: intent.id,
        status: INTENT_STATUS.IN_PROGRESS,
        agentRole: "engine",
        reason: "blocked task passed verification",
        patch: retryClearPatch(intent)
      });
    }
    return updatedTask;
  }

  async finalizeCompletedIntents() {
    const intents = await this.store.listIntents();
    let processed = 0;
    const allTasks = await this.store.listTasks();
    for (const candidate of intents.filter((item) =>
      item.status === INTENT_STATUS.IN_PROGRESS ||
      (item.status === INTENT_STATUS.BLOCKED && item.blocked?.phase === "task_blocked")
    )) {
      let intent = candidate;
      const tasks = allTasks.filter((task) => task.intentId === intent.id);
      if (!tasks.length) continue;
      if (intent.status === INTENT_STATUS.BLOCKED) {
        if (tasks.some((task) => task.status === TASK_STATUS.BLOCKED)) continue;
        const reopened = await this.store.transitionEntity({
          entityType: "intent",
          entityId: intent.id,
          status: INTENT_STATUS.IN_PROGRESS,
          expectedStatus: INTENT_STATUS.BLOCKED,
          agentRole: "engine",
          reason: "blocked tasks are no longer blocked",
          patch: retryClearPatch(intent)
        });
        if (!reopened) continue;
        intent = reopened;
      }
      if (tasks.some((task) => task.status === TASK_STATUS.BLOCKED)) {
        await this.blockIntent(intent.id, {
          phase: "task_blocked",
          reason: "task blocked",
          blockedTaskIds: tasks.filter((task) => task.status === TASK_STATUS.BLOCKED).map((task) => task.id)
        });
        processed += 1;
        continue;
      }
      if (!tasks.every(taskFinished)) continue;
      const consumer = await this.firstConsumerFor({
        entityType: "intent",
        status: INTENT_STATUS.IN_PROGRESS,
        entity: intent,
        condition: "all_tasks_done"
      });
      if (!consumer) continue;
      const agentRole = consumer.role;
      if (!this.claimRole(agentRole)) continue;
      try {
        const claimedIntent = await this.store.transitionEntity({
          entityType: "intent",
          entityId: intent.id,
          status: INTENT_STATUS.ROUTING,
          expectedStatus: INTENT_STATUS.IN_PROGRESS,
          agentRole,
          reason: "wake rule started finalization"
        });
        if (!claimedIntent) continue;

        const previousArtifacts = await this.artifactsForIntent(intent.id);
        let result;
        try {
          result = await this.worker.runIntent({ role: agentRole, intent: claimedIntent, previousArtifacts });
        } catch (error) {
          await this.blockIntent(intent.id, {
            phase: "finalization",
            reason: "Finalization agent failed",
            message: error?.message || String(error)
          }, agentRole);
          processed += 1;
          continue;
        }
        const current = await this.store.getIntent(intent.id);
        const finalMessage = result.artifact?.data?.message || result.output?.finalMessage || current.goal;
        const doneIntent = await this.store.transitionEntity({
          entityType: "intent",
          entityId: intent.id,
          status: INTENT_STATUS.DONE,
          expectedStatus: INTENT_STATUS.ROUTING,
          agentRole,
          runId: result.run?.id,
          reason: "finalization completed",
          patch: {
            completedAt: nowIso(),
            finalSummary: finalMessage,
            artifactIds: appendUnique(current?.artifactIds, result.artifact?.id),
            runIds: appendUnique(current?.runIds, result.run?.id)
          }
        });
        if (!doneIntent) continue;
        await this.runFinalSideEffect({
          intentId: intent.id,
          phase: "memory",
          action: () => this.memory?.rememberTaskResult?.(toLegacyTask(doneIntent), { summary: finalMessage })
        });
        await this.runFinalSideEffect({
          intentId: intent.id,
          phase: "outbound",
          action: () => this.outboundReplyService?.send?.(toLegacyTask(doneIntent), finalMessage, { source: "engine" })
        });
        processed += 1;
      } finally {
        this.releaseRole(agentRole);
      }
    }
    return processed;
  }

  async health() {
    const [projects, intents, tasks, runs, artifacts] = await Promise.all([
      this.store.listProjects?.() || [],
      this.store.listIntents(),
      this.store.listTasks(),
      this.store.listRuns(),
      this.store.listArtifacts()
    ]);
    return {
      ok: this.healthState.memory.ok !== false && this.healthState.outbound.ok !== false,
      service: "team-engine",
      generatedAt: nowIso(),
      memory: this.healthState.memory,
      outbound: this.healthState.outbound,
      counts: {
        projects: projects.length,
        intents: intents.length,
        tasks: tasks.length,
        runs: runs.length,
        artifacts: artifacts.length
      }
    };
  }

  readModel() {
    return this.store.readModel();
  }

  async deleteProject(projectId, options = {}) {
    if (!this.store?.deleteProject) throw new Error("project delete unavailable");
    return this.store.deleteProject(projectId, options);
  }

  async artifactsForIntent(intentId) {
    return (await this.store.listArtifacts()).filter((artifact) => artifact.intentId === intentId);
  }

  async artifactsForTask(intentId, taskId) {
    return (await this.artifactsForIntent(intentId)).filter(
      (artifact) => artifact.entityId === taskId || artifact.data?.taskId === taskId
    );
  }

  async retryBlockedWork(input = {}) {
    const entityType = String(input.entityType || "").trim();
    const entityId = String(input.entityId || "").trim();
    const agentRole = input.agentRole || ROLES.CEO;
    const reason = input.reason || "retry blocked work";
    if (!entityType) throw new Error("retry blocked work requires entityType");
    if (!entityId) throw new Error("retry blocked work requires entityId");
    if (entityType === "task") {
      return this.retryBlockedTask(entityId, { agentRole, reason, reopenParentIntent: true });
    }
    if (entityType === "intent") {
      return this.retryBlockedIntent(entityId, { agentRole, reason });
    }
    throw new Error(`unsupported retry entity type: ${entityType}`);
  }

  async retryBlockedTask(taskOrId, { agentRole = ROLES.CEO, reason = "retry blocked task", reopenParentIntent = true } = {}) {
    const task = typeof taskOrId === "string" ? await this.store.getTask(taskOrId) : taskOrId;
    if (!task) throw new Error(`task not found: ${taskOrId}`);
    if (task.status !== TASK_STATUS.BLOCKED) throw new Error(`task is not blocked: ${task.id}`);
    const retryStatus = retryStatusForTask(task);
    const retriedTask = await this.store.transitionEntity({
      entityType: "task",
      entityId: task.id,
      status: retryStatus,
      agentRole,
      reason,
      patch: retryClearPatch(task)
    });
    let reopenedIntent;
    if (reopenParentIntent && retriedTask?.intentId) {
      const intent = await this.store.getIntent(retriedTask.intentId);
      const siblingTasks = await this.store.listTasks();
      const hasRemainingBlockedTask = siblingTasks.some((candidate) => candidate.intentId === retriedTask.intentId && candidate.status === TASK_STATUS.BLOCKED);
      if (intent?.status === INTENT_STATUS.BLOCKED && !hasRemainingBlockedTask) {
        reopenedIntent = await this.store.transitionEntity({
          entityType: "intent",
          entityId: intent.id,
          status: INTENT_STATUS.IN_PROGRESS,
          agentRole,
          reason,
          patch: retryClearPatch(intent)
        });
      }
    }
    return {
      retried: true,
      entityType: "task",
      entityId: task.id,
      retryStatus,
      task: retriedTask,
      intent: reopenedIntent
    };
  }

  async retryBlockedIntent(intentId, { agentRole = ROLES.CEO, reason = "retry blocked intent" } = {}) {
    const intent = await this.store.getIntent(intentId);
    if (!intent) throw new Error(`intent not found: ${intentId}`);
    if (intent.status !== INTENT_STATUS.BLOCKED) throw new Error(`intent is not blocked: ${intent.id}`);
    const tasks = (await this.store.listTasks()).filter((task) => task.intentId === intent.id || intent.taskIds?.includes(task.id));
    const blockedTasks = tasks.filter((task) => task.status === TASK_STATUS.BLOCKED);
    const retriedTasks = [];
    for (const task of blockedTasks) {
      const result = await this.retryBlockedTask(task, { agentRole, reason, reopenParentIntent: false });
      retriedTasks.push(result.task);
    }
    const retryStatus = retryStatusForIntent(intent, blockedTasks, tasks);
    const retriedIntent = await this.store.transitionEntity({
      entityType: "intent",
      entityId: intent.id,
      status: retryStatus,
      agentRole,
      reason,
      patch: retryClearPatch(intent)
    });
    return {
      retried: true,
      entityType: "intent",
      entityId: intent.id,
      retryStatus,
      intent: retriedIntent,
      tasks: retriedTasks
    };
  }

  async blockIntent(intentId, blocked, agentRole = "engine") {
    const updated = await this.store.transitionEntity({
      entityType: "intent",
      entityId: intentId,
      status: INTENT_STATUS.BLOCKED,
      agentRole,
      reason: blocked?.reason,
      patch: {
        blockedAt: nowIso(),
        blocked
      }
    });
    await this.notifyCeoOfBlockedIntent(updated, blocked, agentRole);
    return updated;
  }

  blockTask(taskId, blocked, agentRole = "engine") {
    return this.store.transitionEntity({
      entityType: "task",
      entityId: taskId,
      status: TASK_STATUS.BLOCKED,
      agentRole,
      reason: blocked?.reason,
      patch: {
        blockedAt: nowIso(),
        blocked
      }
    });
  }

  async firstConsumerFor(input) {
    const consumers = await this.consumersFor(input);
    return consumers[0];
  }

  async consumersFor({ entityType, status, entity, condition }) {
    if (this.routingStore?.consumersFor) {
      return this.routingStore.consumersFor({ entityType, status, entity, condition });
    }
    return [];
  }

  claimRole(role) {
    if (!role) return false;
    if (this.activeRoles.has(role)) return false;
    this.activeRoles.add(role);
    return true;
  }

  releaseRole(role) {
    if (role) this.activeRoles.delete(role);
  }

  async runFinalSideEffect({ intentId, phase, action }) {
    try {
      await action();
    } catch (error) {
      if (phase === "memory") this.recordMemoryFailure(error, { phase, intentId });
      if (phase === "outbound") this.recordOutboundFailure(error, { phase, intentId });
      const log = this.logger?.warn || this.logger?.error;
      log?.call(this.logger, {
        intentId,
        phase,
        error: error?.message || String(error)
      });
    }
  }

  async notifyCeoOfBlockedIntent(intent, blocked = {}, agentRole = "engine") {
    if (!intent?.id || intent.context?.blockerNotification?.status === "sent") return undefined;
    if (!this.outboundReplyService?.send || !intent.replyTarget || !intent.source?.channel) return undefined;
    const diagnosis = await this.blockedIntentDiagnosisMessage(intent, blocked, agentRole);
    const message = diagnosis.message;
    let result;
    try {
      result = await this.outboundReplyService.send(toLegacyTask(intent), message, { source: diagnosis.source });
    } catch (error) {
      this.recordOutboundFailure(error, { phase: "ceo_blocker_report", intentId: intent.id });
      result = { status: "failed", reason: error?.message || String(error) };
    }
    try {
      await this.store.updateIntent(intent.id, {
        context: {
          ...(intent.context || {}),
          blockerNotification: {
            source: diagnosis.source,
            status: result?.status,
            reason: result?.reason,
            diagnosisTraceId: diagnosis.traceId,
            fallbackReason: diagnosis.fallbackReason,
            sentAt: nowIso()
          }
        }
      });
    } catch (error) {
      const log = this.logger?.warn || this.logger?.error;
      log?.call(this.logger, {
        intentId: intent.id,
        phase: "ceo_blocker_report_marker",
        error: error?.message || String(error)
      });
    }
    return result;
  }

  async blockedIntentDiagnosisMessage(intent, blocked = {}, agentRole = "engine") {
    if (typeof this.worker?.runBlockedIntentDiagnosis !== "function") {
      return {
        source: "ceo_blocker_report",
        message: formatCeoBlockerReport({ intent, blocked, agentRole })
      };
    }
    try {
      const result = await this.worker.runBlockedIntentDiagnosis({
        role: ROLES.CEO,
        intent,
        blocked,
        agentRole
      });
      const message = String(result?.finalText || "").trim();
      if (!message) throw new Error("CEO blocker diagnosis returned empty text");
      return {
        source: "ceo_blocker_diagnosis",
        message,
        traceId: result?.trace?.traceId || result?.trace?.id
      };
    } catch (error) {
      const log = this.logger?.warn || this.logger?.error;
      log?.call(this.logger, {
        intentId: intent.id,
        phase: "ceo_blocker_diagnosis",
        error: error?.message || String(error)
      });
      return {
        source: "ceo_blocker_report",
        message: formatCeoBlockerReport({ intent, blocked, agentRole }),
        fallbackReason: error?.message || String(error)
      };
    }
  }

  async recordFeedbackMemoryEvent(event) {
    return this.recordMemoryEvent(event, { phase: "feedback_memory", feedbackId: event.feedbackId });
  }

  async recordMemoryEvent(event, logContext = {}) {
    try {
      await this.memory?.recordEvent?.(event);
    } catch (error) {
      this.recordMemoryFailure(error, logContext);
      const log = this.logger?.warn || this.logger?.error;
      log?.call(this.logger, {
        ...logContext,
        error: error?.message || String(error)
      });
    }
  }

  recordMemoryFailure(error, context = {}) {
    this.healthState.memory = {
      ok: false,
      lastFailure: {
        ...context,
        error: error?.message || String(error),
        at: nowIso()
      }
    };
  }

  recordOutboundFailure(error, context = {}) {
    this.healthState.outbound = {
      ok: false,
      lastFailure: {
        ...context,
        error: "outbound_failed",
        at: nowIso()
      }
    };
  }
}
