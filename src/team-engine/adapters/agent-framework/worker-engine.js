import { defaultTeamMockRoleOutput } from "./default-team-mock-fixture.js";
import { ROLES, sessionKeyFor } from "../../domain/schema.js";
import { createId } from "../../../platform/ids.js";
import { AssignmentBuilder } from "./assignment-builder.js";
import {
  ProviderOutputNormalizer,
  artifactKindFor
} from "./provider-output-normalizer.js";

const MOCK_WORK_REQUEST_PATTERN = /(?:帮我|请|需要|麻烦|把|给|做|实现|修|修改|改|优化|规划|调研|分析|设计|写|生成|部署|上线|接入|配置|支持|排查|检查|启动|继续|迭代|完成|创建|新增|删除|合并|迁移|重构|测试一下|验证|发布|监控|梳理|总结|评估|建议|战略|需求|客户|产品|公司|项目|页面|服务|渠道|员工|模型|飞书|国际化|dashboard|agent|provider|channel|bug|fix|ship|build|implement|add|create|debug|design|plan|research|deploy|verify|support|optimi[sz]e|refactor|analy[sz]e|review|investigate|start|run|launch)/i;

const IDENTITY_QUESTION_PATTERN = /(?:你|您|机器人|智能体|ai|AI).{0,8}(?:是谁|叫(?:什么)?名字|名字是什么)|(?:你|您).{0,8}(?:叫什么|哪位)|who\s+are\s+you|what(?:'s| is)\s+your\s+name/i;

export { artifactKindFor };

export class WorkerEngine {
  constructor({ store, bus, agentRuntime, provider, config = {}, logger = console, toolAuditLog, toolExecutor }) {
    this.store = store;
    this.bus = bus;
    this.agentRuntime = agentRuntime;
    this.provider = provider;
    if (this.agentRuntime && !this.agentRuntime.provider && provider) {
      this.agentRuntime.provider = provider;
    }
    this.config = config;
    this.logger = logger;
    this.toolAuditLog = toolAuditLog;
    this.toolExecutor = toolExecutor;
    this.assignment = new AssignmentBuilder();
    this.outputNormalizer = new ProviderOutputNormalizer();
  }

  async runIntent({ role, intent, previousArtifacts = [] }) {
    return this.runEntity({
      role,
      intent,
      entity: intent,
      entityType: "intent",
      previousArtifacts
    });
  }

  async runTask({ role, intent, task, previousArtifacts = [] }) {
    return this.runEntity({
      role,
      intent,
      task,
      entity: task,
      entityType: "task",
      previousArtifacts
    });
  }

  async runChannelMessage({ role = ROLES.CEO, message, sessionId, forceIntent = false }) {
    if (!message?.text) throw new Error("runChannelMessage requires message.text");
    const profile = await this.loadAgentProfile(role);
    const providerSelection = await this.resolveProviderSelection({ role, profile });
    const runnerType = providerSelection?.runner || providerSelection?.provider?.runner || this.config.runner?.type;
    const resolvedSessionId = sessionId || sessionKeyFor({
      agentRole: role,
      channel: message.channel,
      threadId: message.threadId,
      userId: message.userId
    });
    const hostContext = this.channelHostContext(message);

    if (runnerType === "mock") {
      return this.runMockChannelMessage({ role, message, sessionId: resolvedSessionId, forceIntent, hostContext, profile });
    }

    if (typeof this.agentRuntime?.run === "function") {
      const runtimeResult = await this.agentRuntime.run({
        agentName: profile?.name || role,
        inputText: this.buildChannelCeoAssignment({ message, forceIntent, profile, role }),
        sessionInputText: message.text,
        sessionId: resolvedSessionId,
        hostContext
      });
      return {
        finalText: runtimeResult.finalText,
        sessionId: runtimeResult.sessionId,
        trace: runtimeResult.trace
      };
    }

    throw new Error("CEO channel delivery requires AgentRuntime.run support");
  }

  async runBlockedIntentDiagnosis({ role = ROLES.CEO, intent, blocked = {}, agentRole } = {}) {
    if (!intent?.id) throw new Error("runBlockedIntentDiagnosis requires intent");
    const profile = await this.loadAgentProfile(role);
    const providerSelection = await this.resolveProviderSelection({ role, profile });
    const runnerType = providerSelection?.runner || providerSelection?.provider?.runner || this.config.runner?.type;
    const resolvedSessionId = sessionKeyFor({
      agentRole: role,
      channel: intent.source?.channel,
      threadId: intent.source?.threadId,
      userId: intent.source?.userId
    });
    const hostContext = this.blockedIntentHostContext({ intent, blocked, agentRole });

    if (runnerType === "mock") {
      return {
        finalText: mockBlockedIntentDiagnosis({ intent, blocked, agentRole }),
        sessionId: resolvedSessionId,
        trace: {
          traceId: `mock_blocker_${intent.id}`,
          agentName: configuredProfileDisplayName(profile, role) || role,
          role,
          sessionId: resolvedSessionId,
          toolCalls: [{
            id: "mock_call_skill_blocker_diagnosis",
            name: "skill",
            toolId: "skill",
            status: "completed",
            input: { name: "blocker-diagnosis" },
            output: { kind: "skill", id: "blocker-diagnosis" }
          }]
        }
      };
    }

    if (typeof this.agentRuntime?.run === "function") {
      const runtimeResult = await this.agentRuntime.run({
        agentName: profile?.name || role,
        inputText: this.buildBlockedIntentDiagnosisAssignment({ intent, blocked, agentRole, profile, role }),
        sessionInputText: `诊断阻塞意图：${intent.id}`,
        sessionId: resolvedSessionId,
        hostContext,
        purpose: "ceo_blocker_diagnosis"
      });
      return {
        finalText: runtimeResult.finalText,
        sessionId: runtimeResult.sessionId,
        trace: runtimeResult.trace
      };
    }

    throw new Error("blocked intent diagnosis requires AgentRuntime.run support");
  }

  async runMockChannelMessage({ role, message, sessionId, forceIntent, hostContext, profile }) {
    const text = String(message.text || "").trim();
    const shouldCreateIntent = forceIntent || MOCK_WORK_REQUEST_PATTERN.test(text);
    const agentName = configuredProfileDisplayName(profile, role) || role;
    const trace = {
      traceId: `mock_channel_${message.eventId || Date.now()}`,
      agentName,
      role,
      sessionId,
      toolCalls: []
    };
    if (shouldCreateIntent && this.toolExecutor?.invoke) {
      const toolResult = await this.toolExecutor.invoke({
        role,
        agentName,
        toolId: "engine.create_intent",
        input: {
          text,
          metadata: {
            ...(message.metadata || {}),
            createdBy: "mock_ceo_channel_decision"
          }
        },
        taskId: message.eventId || message.threadId,
        source: "agent_runtime",
        sessionId,
        traceId: trace.traceId,
        hostContext
      });
      trace.toolCalls.push({
        id: "mock_call_create_intent",
        name: "engine_create_intent",
        toolId: "engine.create_intent",
        status: toolResult.status,
        input: { text },
        output: toolResult.output
      });
      return {
        finalText: "收到，我会把这件事作为工作推进。",
        sessionId,
        trace
      };
    }
    return {
      finalText: IDENTITY_QUESTION_PATTERN.test(text)
        ? channelCeoIdentityReply(profile, role)
        : "收到，我在。你可以直接告诉我接下来要推进的事情。",
      sessionId,
      trace
    };
  }

  channelHostContext(message = {}) {
    return {
      channel: message.channel,
      source: message.source,
      transport: message.transport,
      threadId: message.threadId,
      userId: message.userId,
      userName: message.userName,
      eventId: message.eventId,
      dedupeKey: message.dedupeKey,
      createdAt: message.createdAt,
      replyTarget: message.replyTarget,
      projectId: message.projectId,
      projectName: message.projectName,
      projectSlug: message.projectSlug,
      projectWorkspace: message.projectWorkspace,
      workspace: message.workspace,
      metadata: message.metadata || {}
    };
  }

  blockedIntentHostContext({ intent, blocked = {}, agentRole } = {}) {
    return {
      channel: intent.source?.channel,
      source: "ceo_blocker_diagnosis",
      transport: intent.source?.transport,
      threadId: intent.source?.threadId,
      userId: intent.source?.userId,
      userName: intent.source?.userName,
      eventId: intent.source?.eventId,
      projectId: intent.projectId || intent.context?.projectId,
      projectName: intent.projectName || intent.context?.projectName,
      projectWorkspace: intent.workspace || intent.context?.workspace,
      workspace: this.config.workspace,
      intentId: intent.id,
      engineEntityId: intent.id,
      metadata: {
        blocked,
        blockedByRole: agentRole
      }
    };
  }

  buildChannelCeoAssignment({ message, forceIntent = false, profile, role = ROLES.CEO }) {
    return [
      `你正在以 ${channelCeoIdentityLabel(profile, role)} 的身份处理一条外部渠道消息。你和用户是在对话，不是在读取一个已经确定的任务单。`,
      "",
      "## 立项原则",
      "- 只有当用户表达了需要团队完成的公司事项、产品/工程需求、客户交付、战略判断、调研分析、排障修复或明确的后续工作时，才创建 TeamEngine Intent。",
      "- 寒暄、问你是谁/叫什么、感谢、确认、闲聊、单纯补充上下文、轻量澄清、状态追问，不要创建 Intent，直接自然回复或最多问一个真正阻塞的问题。",
      "- 如果消息来自显式工作入口并标记 forceIntent=true，除非文本为空或明显不是工作，否则应当创建 Intent。",
      "- 创建 Intent 时，先把目标改写成清楚、可执行、可验收的一句话；不要把整段闲聊或内部过程塞进目标。",
      "- 创建 Intent 时可以传 name 和 description：name 是短标题，description 可以很长，用来承载背景、上下文、范围、风险和音频/长对话总结；text/goal 仍保持一句可执行目标。",
      "",
      "## 可用工具",
      "- 可以调用 engine.projects 查看已有项目、检查项目详情，或在没有合适项目时创建项目。",
      "- 创建 Intent 前必须关联项目：已存在就把 projectId 传给 engine.create_intent；不存在就先创建项目，或至少传清楚的 projectName。",
      "- 需要立项时，调用 engine.create_intent。只让 CEO 拥有这个入口。",
      "- 需要直接回用户时，调用 channel.reply；如果你没有调用，系统会把你的最终回复发回原渠道。",
      "- 不要让 Channel Gateway 或飞书适配器替你判断是否立项。",
      "",
      "## 当前渠道消息",
      `channel: ${message.channel || "unknown"}`,
      `threadId: ${message.threadId || ""}`,
      `userId: ${message.userId || ""}`,
      message.projectId || message.projectName ? `project: ${message.projectName || message.projectId}` : undefined,
      `forceIntent: ${forceIntent ? "true" : "false"}`,
      `text: ${message.text}`,
      "",
      "请做出 CEO 判断：要么调用 engine.create_intent 创建工作，要么像负责人一样自然回复用户。默认中文，除非用户使用英文。"
    ].join("\n");
  }

  buildBlockedIntentDiagnosisAssignment({ intent, blocked = {}, agentRole, profile, role = ROLES.CEO }) {
    const blockedJson = JSON.stringify(blocked || {}, null, 2);
    const intentSummary = JSON.stringify({
      id: intent.id,
      status: intent.status,
      goal: intent.goal,
      name: intent.name,
      projectId: intent.projectId,
      projectName: intent.projectName,
      workspace: intent.workspace,
      taskIds: intent.taskIds || [],
      artifactIds: intent.artifactIds || [],
      blocked: intent.blocked,
      source: intent.source,
      replyTarget: intent.replyTarget
    }, null, 2);
    return [
      `你正在以 ${channelCeoIdentityLabel(profile, role)} 的身份处理一个 TeamEngine 阻塞诊断。`,
      "",
      "## 必须执行的诊断流程",
      "- 先调用 skill 工具读取 blocker-diagnosis。",
      "- 按该 skill 的要求只读检查 ai-team 控制仓库、Engine 账本、相关 task/run/artifact/trace/session。",
      "- 不要调用 channel.reply；最终文本会由 TeamEngine 统一发送给原渠道。",
      "- 不要调用 engine.retry_blocked、engine.transition、engine.create_intent，也不要修改任何文件。",
      "- 回复必须告诉用户：真正阻塞原因、关键证据、继续推进是否会重复卡住、下一步最小修正。",
      "",
      "## 当前阻塞 Intent",
      intentSummary,
      "",
      "## 阻塞负载",
      blockedJson,
      "",
      `reportedByRole: ${agentRole || "engine"}`,
      "",
      "默认中文，语气像负责人，不要暴露无关堆栈或敏感凭据。"
    ].join("\n");
  }

  async runEntity({ role, intent, task, entity, entityType, previousArtifacts = [] }) {
    let run;
    let artifact;
    let outboxPublished = false;
    let sessionKey;
    let agentBinding;
    let runnerType;
    let agentTraceId;
    try {
      const legacySessionKey = sessionKeyFor({
        agentRole: role,
        channel: intent.source?.channel,
        threadId: intent.source?.threadId,
        userId: intent.source?.userId
      });
      const preloadedProfile = await this.loadAgentProfile(role);
      const providerSelection = await this.resolveProviderSelection({ role, profile: preloadedProfile });
      runnerType = this.runnerTypeFor(providerSelection);
      if (runnerType !== "mock" && typeof this.agentRuntime?.run !== "function") {
        throw new Error("WorkerEngine non-mock execution requires AgentRuntime.run");
      }
      agentBinding = this.agentBindingFor({ role, profile: preloadedProfile, entity });
      if (runnerType !== "mock" && !agentBinding.sessionId) {
        agentBinding.sessionId = createId("sess");
      }
      if (runnerType !== "mock") {
        agentTraceId = createId("trace");
      }
      sessionKey = agentBinding.sessionId || legacySessionKey;
      run = await this.store.createRun({
        entityType,
        entityId: entity.id,
        projectId: entity.projectId || intent.projectId || intent.context?.projectId,
        projectName: entity.projectName || intent.projectName || intent.context?.projectName,
        workspace: workspaceForAssignment({ intent, task: entityType === "task" ? entity : task, config: this.config }),
        agentRole: role,
        sessionKey,
        runner: providerSelection.runner,
        provider: providerSelection.providerId,
        model: providerSelection.model,
        agentTraceId
      });
      const turn = await this.agentRuntimeTurnSnapshot({ role, profile: preloadedProfile });
      run = await this.store.updateRun?.(run.id, {
        runner: providerSelection.runner,
        provider: providerSelection.providerId,
        model: providerSelection.model,
        agentConfigSnapshot: this.assignment.agentConfigSnapshot(turn)
      }) || run;
      if (runnerType !== "mock" && agentBinding.sessionId) {
        await this.storeAgentSessionBinding({ entityType, entityId: entity.id, agentKey: agentBinding.agentKey, sessionId: agentBinding.sessionId });
      }

      await this.bus.writeInbox({
        role,
        entityType,
        entityId: entity.id,
        runId: run.id,
        payload: { intent, task, previousArtifacts, turn: this.assignment.summarizeTurnForEnvelope(turn) }
      });
      await this.recordToolManifest({ role, intent, task, run, profile: preloadedProfile });

      const providerOutput = await this.invokeProvider({
        role,
        intent,
        task,
        entity,
        entityType,
        previousArtifacts,
        run,
        turn,
        providerSelection,
        agentBinding,
        agentTraceId
      });
      if (runnerType !== "mock") {
        run = await this.recordAgentRuntimeResult({ run, entityType, entityId: entity.id, agentBinding, providerOutput });
      }
      const outputProfile = preloadedProfile || turn?.profile || {};
      const { finalMessage, structured } = this.outputNormalizer.normalize(role, providerOutput, outputProfile);
      artifact = await this.store.writeArtifact({
        intentId: intent.id,
        entityType,
        entityId: entity.id,
        role,
        kind: this.outputNormalizer.artifactKindFor(role, structured, outputProfile),
        data: structured
      });

      if (entityType === "task") {
        await this.linkTaskRunAndArtifact({ task, runId: run.id, artifactId: artifact.id });
      }
      const completedRun = await this.store.completeRun(run.id, {
        transcriptSummary: this.outputNormalizer.transcriptSummaryFor(role, finalMessage, outputProfile),
        artifactIds: [artifact.id]
      });
      await this.bus.writeOutbox({
        role,
        entityType,
        entityId: entity.id,
        runId: run.id,
        payload: {
          finalMessage,
          structuredOutput: structured,
          artifactId: artifact.id
        }
      });
      outboxPublished = true;
      return { run: completedRun, artifact, output: providerOutput };
    } catch (error) {
      if (artifact && !outboxPublished) {
        await this.cleanupFailedArtifact({ intentId: intent.id, artifact, error });
      }
      if (run && runnerType !== "mock") {
        run = await this.recordAgentRuntimeFailure({ run, entityType, entityId: entity.id, agentBinding, error });
      }
      if (run) await this.failRun(run.id, error);
      this.logger?.error?.(
        { error: error.message, role, intentId: intent?.id, taskId: task?.id, runId: run?.id },
        "worker engine run failed"
      );
      throw error;
    }
  }

  async loadAgentProfile(role) {
    if (typeof this.agentRuntime?.profileForRole !== "function") return undefined;
    return this.agentRuntime.profileForRole(role);
  }

  runnerTypeFor(providerSelection) {
    return providerSelection?.runner || providerSelection?.provider?.runner || this.config.runner?.type;
  }

  agentBindingFor({ role, profile, entity }) {
    const agentName = profile?.name || role;
    const agentKey = role || agentName;
    const sessions = entity?.agentSessions && typeof entity.agentSessions === "object" ? entity.agentSessions : {};
    const fallbackKeys = [
      role,
      agentName
    ].filter(Boolean);
    return {
      agentName: agentName || role,
      agentKey,
      sessionId: fallbackKeys.map((key) => sessions[key]).find(Boolean)
    };
  }

  async agentRuntimeTurnSnapshot({ role, profile }) {
    const resolvedProfile = profile || await this.loadAgentProfile(role) || { role, name: role, title: role, prompt: "", tools: [], skills: [], mcps: [] };
    let tools = [];
    try {
      tools = this.toolManifestForRuntime(role, resolvedProfile);
    } catch (error) {
      this.logBestEffortError(error, { role }, "tool manifest unavailable");
    }
    return {
      agentId: resolvedProfile.name || role,
      role,
      profile: resolvedProfile,
      tools
    };
  }

  async recordAgentRuntimeResult({ run, entityType, entityId, agentBinding, providerOutput }) {
    const sessionId = providerOutput?.sessionId;
    const agentTraceId = providerOutput?.trace?.traceId || providerOutput?.trace?.id;
    let updatedRun = run;
    const runPatch = Object.fromEntries(Object.entries({
      sessionKey: sessionId || run.sessionKey,
      agentTraceId
    }).filter(([, value]) => value !== undefined));
    if (Object.keys(runPatch).length) {
      updatedRun = await this.store.updateRun?.(run.id, runPatch) || run;
    }
    if (sessionId) {
      await this.storeAgentSessionBinding({ entityType, entityId, agentKey: agentBinding.agentKey, sessionId });
    }
    return updatedRun;
  }

  async recordAgentRuntimeFailure({ run, entityType, entityId, agentBinding, error }) {
    const metadata = error?.agentRuntime;
    if (!run || !agentBinding || !metadata || typeof metadata !== "object") return run;
    const sessionId = nonEmptyString(metadata.sessionId);
    const traceId = nonEmptyString(metadata.traceId);
    if (!sessionId && !traceId) return run;
    try {
      return await this.recordAgentRuntimeResult({
        run,
        entityType,
        entityId,
        agentBinding,
        providerOutput: {
          sessionId,
          trace: traceId ? { traceId } : undefined
        }
      });
    } catch (metadataError) {
      this.logBestEffortError(metadataError, { runId: run.id, entityType, entityId }, "agent runtime failure metadata unavailable");
      return run;
    }
  }

  async storeAgentSessionBinding({ entityType, entityId, agentKey, sessionId }) {
    if (!agentKey || !sessionId) return undefined;
    if (entityType === "task" && this.store.getTask && this.store.updateTask) {
      const current = await this.store.getTask(entityId);
      if (!current) return undefined;
      return this.store.updateTask(entityId, {
        agentSessions: {
          ...(current.agentSessions || {}),
          [agentKey]: sessionId
        }
      });
    }
    if (entityType === "intent" && this.store.getIntent && this.store.updateIntent) {
      const current = await this.store.getIntent(entityId);
      if (!current) return undefined;
      return this.store.updateIntent(entityId, {
        agentSessions: {
          ...(current.agentSessions || {}),
          [agentKey]: sessionId
        }
      });
    }
    return undefined;
  }

  async recoverInterruptedRunMetadata(run = {}) {
    const directSession = recoverableSessionKey(run.sessionKey);
    if (directSession) {
      return {
        sessionKey: directSession,
        agentTraceId: nonEmptyString(run.agentTraceId)
      };
    }
    if (typeof this.agentRuntime?.storesForProfile !== "function") return {};
    const role = run.agentRole;
    if (!role) return {};
    try {
      const profile = await this.loadAgentProfile(role) || { role, name: role, title: role, prompt: "", tools: [], skills: [], mcps: [] };
      const agentName = profile.name || role;
      const stores = this.agentRuntime.storesForProfile(profile, agentName);
      const sessions = await stores?.sessions?.list?.();
      const match = nearestInterruptedSession({ sessions, run, role, agentName });
      if (!match) return {};
      return {
        sessionKey: match.id,
        agentTraceId: nonEmptyString(match.fork?.createdByTraceId)
      };
    } catch (error) {
      this.logBestEffortError(error, { role, runId: run.id }, "interrupted run session metadata unavailable");
      return {};
    }
  }

  async recordToolManifest({ role, intent, task, run, profile }) {
    if (!this.toolAuditLog) return;
    let tools = [];
    try {
      tools = this.toolManifestForRuntime(role, profile);
    } catch (error) {
      this.logBestEffortError(error, { role, intentId: intent.id, taskId: task?.id, runId: run.id }, "tool manifest unavailable");
      return;
    }

    try {
      await this.toolAuditLog.record({
        type: "tool_manifest_granted",
        taskId: task?.id,
        intentId: intent.id,
        runId: run.id,
        role,
        tools
      });
    } catch (error) {
      this.logBestEffortError(error, { role, intentId: intent.id, taskId: task?.id, runId: run.id }, "tool audit failed");
    }
  }

  async linkTaskRunAndArtifact({ task, runId, artifactId }) {
    await this.store.appendTaskRunAndArtifact(task.id, { runId, artifactId });
  }

  async cleanupFailedArtifact({ intentId, artifact, error }) {
    try {
      const intent = await this.store.getIntent(intentId);
      if (intent?.artifactIds?.includes(artifact.id)) {
        await this.store.updateIntent(intentId, {
          artifactIds: intent.artifactIds.filter((id) => id !== artifact.id)
        });
      }
      await this.store.updateArtifact(intentId, artifact.id, {
        status: "failed",
        error: {
          message: error?.message || String(error)
        }
      });
    } catch (cleanupError) {
      this.logger?.error?.(
        { error: cleanupError.message, intentId, artifactId: artifact.id },
        "worker engine failed to cleanup artifact"
      );
    }
  }

  logBestEffortError(error, fields, message) {
    const log = this.logger?.warn || this.logger?.error;
    log?.call(this.logger, { ...fields, error: error?.message || String(error) }, message);
  }

  async resolveProviderSelection({ role, turn, profile } = {}) {
    const modelProvider = turn?.profile?.modelProvider || profile?.modelProvider || {};
    if (this.provider?.resolveTurnConfig) {
      return this.provider.resolveTurnConfig(modelProvider);
    }
    const providerId = modelProvider.providerId || this.config.provider?.id || this.provider?.id || this.config.runner?.type;
    return {
      providerId,
      runner: this.config.runner?.type,
      model: modelProvider.model || this.config.provider?.model,
      provider: {
        id: providerId,
        runner: this.config.runner?.type,
        type: this.config.runner?.type
      }
    };
  }

  async invokeProvider({ role, intent, task, entity, entityType, previousArtifacts = [], run, turn, providerSelection, agentBinding, agentTraceId }) {
    const runnerType = this.runnerTypeFor(providerSelection);
    if (runnerType === "mock") {
      const output = defaultTeamMockRoleOutput({ role, intent, task, previousArtifacts });
      return {
        finalMessage: output.finalMessage,
        structuredOutput: output.structured,
        stdout: "",
        stderr: "",
        durationMs: 0
      };
    }

    if (typeof this.agentRuntime?.run !== "function") {
      throw new Error("WorkerEngine non-mock execution requires AgentRuntime.run");
    }
    const runtimeResult = await this.agentRuntime.run({
      agentName: agentBinding?.agentName || turn?.profile?.name || role,
      inputText: this.buildAgentRuntimeAssignment({ role, intent, task, entity, entityType, previousArtifacts, run, profile: turn?.profile }),
      sessionId: agentBinding?.sessionId,
      traceId: agentTraceId,
      hostContext: this.assignment.hostContextForRun({ run, entityType, entityId: entity?.id, intent, task })
    });
    return {
      finalMessage: runtimeResult?.finalText,
      structuredOutput: runtimeResult?.structuredOutput,
      structured: runtimeResult?.structured,
      stdout: runtimeResult?.stdout,
      sessionId: runtimeResult?.sessionId,
      trace: runtimeResult?.trace
    };
  }

  buildAgentRuntimeAssignment({ role, intent, task, entity, entityType, previousArtifacts = [], run, profile }) {
    return this.assignment.buildAgentRuntimeAssignment({ role, intent, task, entity, entityType, previousArtifacts, run, profile });
  }

  engineAssignmentOutputContract(role, profile) {
    return this.assignment.outputContractFor(role, profile);
  }

  toolManifestForRuntime(role, profile) {
    if (typeof this.agentRuntime?.toolManifestForRun === "function") {
      return this.agentRuntime.toolManifestForRun(role, profile || {});
    }
    if (typeof this.agentRuntime?.toolManifest === "function") {
      return this.agentRuntime.toolManifest(role, profile);
    }
    return [];
  }

  async failRun(runId, error) {
    try {
      await this.store.failRun(runId, error);
    } catch (failError) {
      this.logger?.error?.({ error: failError.message, runId }, "worker engine failed to mark run failed");
    }
  }
}

function nonEmptyString(value) {
  if (typeof value !== "string") return undefined;
  return value.trim() ? value : undefined;
}

function recoverableSessionKey(value) {
  const sessionKey = nonEmptyString(value);
  if (!sessionKey) return undefined;
  return sessionKey.startsWith("sess_") ? sessionKey : undefined;
}

function nearestInterruptedSession({ sessions = [], run = {}, role, agentName }) {
  const runStartedAt = Date.parse(run.createdAt || run.startedAt || "");
  if (!Number.isFinite(runStartedAt)) return undefined;
  const candidates = sessions
    .filter((session) => {
      if (!session?.id || !session.id.startsWith("sess_")) return false;
      if (Array.isArray(session.recentTurns) && session.recentTurns.length) return false;
      if (!session.fork?.createdByTraceId) return false;
      if (role && session.role && session.role !== role) return false;
      if (agentName && session.agentName && session.agentName !== agentName) return false;
      const sessionCreatedAt = Date.parse(session.createdAt || session.fork?.createdAt || "");
      if (!Number.isFinite(sessionCreatedAt)) return false;
      return Math.abs(sessionCreatedAt - runStartedAt) <= 10_000;
    })
    .map((session) => ({
      session,
      distance: Math.abs(Date.parse(session.createdAt || session.fork?.createdAt || "") - runStartedAt)
    }))
    .sort((left, right) => left.distance - right.distance);
  return candidates[0]?.session;
}

function configuredProfileDisplayName(profile, role) {
  const name = nonEmptyString(profile?.name);
  return name && name !== role ? name : undefined;
}

function channelCeoIdentityLabel(profile, role) {
  const name = configuredProfileDisplayName(profile, role);
  return name ? `${name}（AI Team CEO/CTO 入口）` : "AI Team CEO/CTO 入口";
}

function channelCeoIdentityReply(profile, role) {
  const name = configuredProfileDisplayName(profile, role);
  return name ? `我是 ${name}，AI Team 的 CEO/CTO 入口。` : "我是 AI Team 的 CEO/CTO 入口。";
}

function mockBlockedIntentDiagnosis({ intent, blocked = {}, agentRole } = {}) {
  const reason = blocked.message || blocked.reason || "系统遇到阻塞，需要处理后才能继续。";
  const title = intent?.goal || intent?.name || intent?.id || "这个意图";
  return [
    `我先按阻塞诊断流程看了一下，意图「${title}」当前卡住了。`,
    `直接原因：${reason}`,
    `证据：阻塞记录来自 ${agentRole || blocked.agentRole || "engine"}，Intent ID 是 ${intent?.id || "-"}。`,
    "继续推进前需要先处理这个阻塞原因；否则大概率会回到同一处。"
  ].join("\n");
}

function workspaceForAssignment({ intent, task, config = {} } = {}) {
  return task?.workspace || task?.context?.workspace || intent?.workspace || intent?.context?.workspace || config.workspace;
}
