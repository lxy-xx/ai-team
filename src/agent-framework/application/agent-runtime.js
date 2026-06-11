import path from "node:path";
import { AgentSessionFactory } from "./agent-session-factory.js";
import { AgentMemoryStore, AgentSessionStore, AgentTraceStore } from "../infrastructure/agent-state-store.js";
import { MemoryManager } from "./memory-manager.js";
import { ToolPolicyEngine } from "../domain/tools/tool-policy.js";
import { ToolRegistry } from "../domain/tools/tool-registry.js";
import { formatTextToolProtocol } from "../domain/tools/text-tool-protocol.js";
import { mcpToolDefinitionsFromProfile } from "../domain/tools/mcp-tools.js";
import { contextLimits } from "../domain/context/context-window.js";
import { redactSecretValue } from "../domain/security/redaction.js";
import { ProviderToolProtocol } from "../domain/provider/provider-tool-protocol.js";
import { createId } from "../../platform/ids.js";

const MAX_PROVIDER_TOOL_ROUNDS = 8;
const CODING_AGENT_RESULT_NOTICE = "Runtime waited for pending Coding Agent jobs before accepting the final answer.";
const CODING_AGENT_TERMINAL_STATES = new Set(["completed", "failed", "cancelled", "timed_out", "interrupted"]);

function isFatalToolError(error) {
  return error?.status === 403;
}

function providerUsesTextToolProtocol(selection = {}, config = {}) {
  const runner = selection?.runner || selection?.provider?.runner || selection?.provider?.type || config.runner?.type || "";
  return String(runner).replaceAll("-", "_") === "codex_app_server";
}

function sessionForkSeedBlocks(blocks = []) {
  return blocks.filter((block) =>
    block?.retained !== false &&
    block?.content?.trim?.() &&
    !["assignment.current", "turn.active_loop_tail", "session.recent_raw", "session.rolling_summary"].includes(block.id)
  );
}

function currentUserBlocks(blocks = []) {
  return blocks.filter((block) =>
    block?.retained !== false &&
    block?.content?.trim?.() &&
    block.id === "assignment.current"
  );
}

function taskForTurn(input = {}) {
  const intent = input.intent || {};
  const task = input.task || input;
  return {
    id: task.id || intent.id,
    text: task.text || task.description || task.title || intent.goal,
    title: task.title,
    description: task.description,
    goal: intent.goal || task.goal,
    channel: intent.source?.channel || task.channel,
    threadId: intent.source?.threadId || task.threadId,
    userId: intent.source?.userId || task.userId
  };
}

export class AgentRuntime {
  constructor({ memory, toolRegistry, agentConfigStore, toolPolicy = {}, config = {}, provider, toolExecutor, sessionFactory, providerToolProtocol } = {}) {
    this.memory = memory;
    this.memoryManager = new MemoryManager({ memory });
    this.toolRegistry = toolRegistry || new ToolRegistry({ policyEngine: new ToolPolicyEngine(toolPolicy) });
    this.agentConfigStore = agentConfigStore;
    this.limits = contextLimits(config);
    this.config = config;
    this.provider = provider;
    this.toolExecutor = toolExecutor;
    this.sessionFactory = sessionFactory || new AgentSessionFactory();
    this.providerToolProtocol = providerToolProtocol || new ProviderToolProtocol();
  }

  async run({ agentName, inputText, sessionInputText, sessionId, traceId: requestedTraceId, hostContext = {}, abortSignal, purpose = "agent_runtime_run" } = {}) {
    if (!agentName) throw new Error("AgentRuntime.run requires agentName");
    if (typeof inputText !== "string" || !inputText.trim()) throw new Error("AgentRuntime.run requires inputText");
    const profile = await this.profileForAgent(agentName);
    if (this.agentConfigStore && !profile?.agentDir) {
      const error = new Error(`agent not found: ${agentName}`);
      error.status = 404;
      throw error;
    }
    const resolvedAgentName = profile.name || agentName;
    const stores = this.storesForProfile(profile, resolvedAgentName);
    await stores.memory.init();
    const session = await stores.sessions.loadOrCreate(sessionId);
    const traceId = requestedTraceId || createId("trace");
    const startedAt = new Date().toISOString();
    const providerSelection = await this.resolveProviderSelection(profile);
    const tools = this.toolManifestForRun(profile.role || agentName, profile);
    const toolManifest = this.providerToolProtocol.openAICompatibleToolManifest(tools);
    const trace = {
      traceId,
      agentName: resolvedAgentName,
      role: profile.role || agentName,
      sessionId: session.id,
      provider: providerSelection.providerId,
      model: providerSelection.model,
      startedAt,
      endedAt: undefined,
      contextBlocks: [],
      modelCalls: [],
      toolCalls: [],
      memoryActions: [],
      errors: [],
      finalText: ""
    };
    const activeLoopMessages = [];
    const toolResultsForSession = [];
    const toolEventsForSession = [];
    const assistantToolCallMessagesForSession = [];
    const pendingCodingAgentJobIds = new Set();
    let codingAgentAutoWaitInjected = false;
    let finalText = "";
    let structuredOutput;
    let lastSubmittedMessages = [];

    try {
      const priorPrefixMessages = Array.isArray(session.prefixMessages) ? session.prefixMessages : [];
      const hasSessionFork = Boolean(session.fork || priorPrefixMessages.length);
      const [longTermFacts, openContextNeeds, recentSummary] = await Promise.all([
        stores.memory.readLongTermFacts({ query: inputText, limit: 12 }),
        stores.memory.readContextNeeds({ limit: 5 }),
        stores.memory.readRecentSummary()
      ]);
      const blocks = this.sessionFactory.build({
        profile,
        inputText,
        longTermFacts,
        openContextNeeds,
        recentSummary: hasSessionFork ? "" : recentSummary,
        workspace: this.workspaceForRun(hostContext),
        toolProtocolText: providerUsesTextToolProtocol(providerSelection, this.config)
          ? formatTextToolProtocol(toolManifest.tools)
          : ""
      });
      const budgetedContext = this.sessionFactory.applyBudget(blocks, this.limits);
      trace.contextBudget = redactTraceValue(budgetedContext.budget);
      trace.contextBlocks = this.sessionFactory.metadataFor(budgetedContext.blocks).map(redactTraceValue);
      await this.writeLiveTrace(stores, trace);
      const currentUserMessages = this.sessionFactory.messagesFor(currentUserBlocks(budgetedContext.blocks), {
        includeStable: true
      });
      const currentTurnMessages = hasSessionFork
        ? this.sessionFactory.messagesFor(budgetedContext.blocks, { includeStable: false })
        : currentUserMessages;
      if (!hasSessionFork) {
        await stores.sessions.ensureFork(session.id, {
          traceId,
          seedMessages: this.sessionFactory.messagesFor(sessionForkSeedBlocks(budgetedContext.blocks), {
            includeStable: true
          }),
          longTermFactCount: longTermFacts.length,
          contextNeedCount: openContextNeeds.length,
          hasRecentSummary: Boolean(recentSummary)
        });
      }

      for (let round = 0; round <= MAX_PROVIDER_TOOL_ROUNDS; round += 1) {
        const messages = await stores.sessions.renderProviderMessages(session.id, {
          currentTurnMessages,
          activeLoopMessages
        });
        lastSubmittedMessages = messages;
        const modelCall = {
          round,
          startedAt: new Date().toISOString(),
          messageCount: messages.length,
          toolCount: toolManifest.tools.length,
          submittedMessages: redactTraceValue(messages),
          submittedTools: redactTraceValue(toolManifest.tools)
        };
        trace.modelCalls.push(modelCall);
        await this.writeLiveTrace(stores, trace);
        const response = await this.completeModel({
          role: profile.role || agentName,
          providerSelection,
          messages,
          tools: toolManifest.tools,
          abortSignal,
          purpose,
          onProviderEvent: async (event = {}) => {
            modelCall.streamEvents = [...(modelCall.streamEvents || []), redactTraceValue(event)].slice(-200);
            if (event.delta) modelCall.streamText = String(modelCall.streamText || "") + String(event.delta);
            if (event.text) modelCall.streamText = String(event.text);
            await this.writeLiveTrace(stores, trace);
          }
        });
        const toolCalls = this.providerToolProtocol.normalizeProviderToolCalls(response?.toolCalls || response?.message?.tool_calls || []);
        modelCall.endedAt = new Date().toISOString();
        modelCall.usage = response?.usage;
        modelCall.toolCalls = toolCalls.map(({ id, name }) => ({ id, name }));
        modelCall.message = redactTraceValue(response?.message || {});
        modelCall.raw = redactTraceValue(response?.raw || {});
        await this.writeLiveTrace(stores, trace);

        if (!toolCalls.length) {
          finalText = this.providerToolProtocol.completionText(response);
          if (!finalText) throw new Error("provider returned empty final text");
          if (pendingCodingAgentJobIds.size && !codingAgentAutoWaitInjected) {
            if (round === MAX_PROVIDER_TOOL_ROUNDS) {
              throw new Error(`provider cannot finish while Coding Agent jobs are pending after ${MAX_PROVIDER_TOOL_ROUNDS} rounds`);
            }
            const waitObservation = await this.waitForPendingCodingAgents({
              jobIds: [...pendingCodingAgentJobIds],
              role: profile.role || agentName,
              agentName: resolvedAgentName,
              sessionId: session.id,
              traceId,
              hostContext,
              stores,
              profile,
              trace,
              toolResultsForSession,
              toolEventsForSession
            });
            await this.writeLiveTrace(stores, trace);
            codingAgentAutoWaitInjected = true;
            this.trackCodingAgentJobs({ toolId: "coding_agent.wait", toolResult: waitObservation.toolResult, pendingCodingAgentJobIds });
            if (pendingCodingAgentJobIds.size) {
              throw new Error(`Coding Agent jobs are still pending after runtime auto-wait: ${[...pendingCodingAgentJobIds].join(", ")}`);
            }
            activeLoopMessages.push(this.codingAgentWaitObservationMessage(waitObservation));
            finalText = "";
            continue;
          }
          structuredOutput = response?.structuredOutput ?? response?.structured;
          break;
        }
        if (round === MAX_PROVIDER_TOOL_ROUNDS) {
          throw new Error(`provider exceeded ${MAX_PROVIDER_TOOL_ROUNDS} tool call rounds`);
        }
        if (!this.toolExecutor?.invoke) throw new Error("provider requested tools but ToolExecutor is unavailable");

        const assistantToolCallMessage = this.providerToolProtocol.assistantToolCallMessage(response, toolCalls);
        activeLoopMessages.push(assistantToolCallMessage);
        assistantToolCallMessagesForSession.push(redactTraceValue(assistantToolCallMessage));
        for (const toolCall of toolCalls) {
          const toolId = toolManifest.nameToId.get(toolCall.name) || toolCall.name;
          const toolInput = this.providerToolProtocol.parseToolCallArguments(toolCall);
          let toolResult;
          let fatalToolError;
          try {
            toolResult = await this.toolExecutor.invoke({
              role: profile.role || agentName,
              agentName: resolvedAgentName,
              toolId,
              input: toolInput,
              taskId: hostContext?.taskId || hostContext?.engineEntityId || hostContext?.engineRunId,
              source: "agent_runtime",
              sessionId: session.id,
              traceId,
              hostContext,
              agentMemory: stores.memory,
              agentProfile: profile
            });
          } catch (error) {
            toolResult = error?.toolResult || {
              toolId,
              role: profile.role || agentName,
              status: "failed",
              output: { error: error?.message || String(error) }
            };
            if (isFatalToolError(error)) {
              fatalToolError = error;
            }
          }
          const sessionToolResult = {
            toolId,
            status: toolResult.status,
            summary: JSON.stringify(redactTraceValue(toolResult.output || {})).slice(0, 1000)
          };
          toolResultsForSession.push(sessionToolResult);
          const traceToolCall = {
            id: toolCall.id,
            name: toolCall.name,
            toolId,
            status: toolResult.status,
            input: redactTraceValue(toolInput),
            output: redactTraceValue(toolResult.output)
          };
          trace.toolCalls.push(traceToolCall);
          this.trackCodingAgentJobs({ toolId, toolResult, pendingCodingAgentJobIds });
          await this.writeLiveTrace(stores, trace);
          if (toolId.startsWith("memory.")) {
            trace.memoryActions.push({
              toolId,
              status: toolResult.status,
              input: redactTraceValue(toolInput),
              output: redactTraceValue(toolResult.output)
            });
          }
          activeLoopMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              toolId: toolResult.toolId,
              status: toolResult.status,
              output: toolResult.output
            })
          });
          toolEventsForSession.push({
            toolId,
            status: toolResult.status,
            messages: [{
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(redactTraceValue({
                toolId: toolResult.toolId,
                status: toolResult.status,
                output: toolResult.output
              }))
            }]
          });
          if (fatalToolError) throw fatalToolError;
        }
      }

      trace.finalText = finalText;
      trace.endedAt = new Date().toISOString();
      const publicInputText = typeof sessionInputText === "string" && sessionInputText.trim() ? sessionInputText : inputText;
      await stores.memory.recordTurnEvent({
        inputText: publicInputText,
        finalText,
        sessionId: session.id,
        traceId,
        toolCalls: trace.toolCalls
      });
      await stores.sessions.appendTurn(session.id, {
        inputText: publicInputText,
        finalText,
        traceId,
        promptMessages: redactTraceValue(lastSubmittedMessages),
        prefixMessages: redactTraceValue(lastSubmittedMessages).concat({ role: "assistant", content: finalText }),
        userMessages: redactTraceValue(currentUserMessages),
        assistantMessages: [{ role: "assistant", content: finalText }],
        toolLoopMessages: redactTraceValue(activeLoopMessages),
        assistantToolCallMessages: assistantToolCallMessagesForSession,
        toolEvents: toolEventsForSession,
        toolResults: toolResultsForSession
      });
      await stores.traces.write(trace);
      return { finalText, structuredOutput, structured: structuredOutput, sessionId: session.id, trace };
    } catch (error) {
      const agentRuntimeMetadata = { sessionId: session.id, traceId };
      trace.endedAt = new Date().toISOString();
      trace.errors.push({ message: error?.message || String(error) });
      if (error && typeof error === "object") {
        error.agentRuntime = agentRuntimeMetadata;
      }
      try {
        await stores.traces.write(trace);
      } catch (traceError) {
        if (traceError && typeof traceError === "object") {
          traceError.agentRuntime = agentRuntimeMetadata;
        }
        throw traceError;
      }
      throw error;
    }
  }

  async writeLiveTrace(stores, trace) {
    try {
      await stores.traces.write(trace);
    } catch (error) {
      this.config.logger?.warn?.({ error: error?.message || String(error), traceId: trace?.traceId }, "agent runtime live trace write failed");
    }
  }

  trackCodingAgentJobs({ toolId, toolResult, pendingCodingAgentJobIds }) {
    if (!pendingCodingAgentJobIds || toolResult?.status === "failed") return;
    if (toolId === "coding_agent.start") {
      const jobId = toolResult.output?.job?.jobId || toolResult.output?.jobId;
      if (jobId) pendingCodingAgentJobIds.add(jobId);
      return;
    }
    if (toolId === "coding_agent.wait" || toolId === "coding_agent.cancel") {
      const jobs = Array.isArray(toolResult.output?.jobs) ? toolResult.output.jobs : [];
      for (const job of jobs) {
        if (job?.jobId && CODING_AGENT_TERMINAL_STATES.has(job.state)) pendingCodingAgentJobIds.delete(job.jobId);
      }
      const jobId = toolResult.output?.job?.jobId || toolResult.output?.jobId;
      const state = toolResult.output?.job?.state || toolResult.output?.state;
      if (jobId && CODING_AGENT_TERMINAL_STATES.has(state)) pendingCodingAgentJobIds.delete(jobId);
    }
  }

  async waitForPendingCodingAgents({
    jobIds = [],
    role,
    agentName,
    sessionId,
    traceId,
    hostContext,
    stores,
    profile,
    trace,
    toolResultsForSession,
    toolEventsForSession
  }) {
    if (!this.toolExecutor?.invoke) throw new Error("Coding Agent jobs are pending but ToolExecutor is unavailable");
    const toolId = "coding_agent.wait";
    const input = { jobIds };
    let toolResult;
    let fatalToolError;
    try {
      toolResult = await this.toolExecutor.invoke({
        role,
        agentName,
        toolId,
        input,
        taskId: hostContext?.taskId || hostContext?.engineEntityId || hostContext?.engineRunId,
        source: "agent_runtime_auto_wait",
        sessionId,
        traceId,
        hostContext,
        agentMemory: stores.memory,
        agentProfile: profile
      });
    } catch (error) {
      toolResult = error?.toolResult || {
        toolId,
        role,
        status: "failed",
        output: { error: error?.message || String(error) }
      };
      if (isFatalToolError(error)) fatalToolError = error;
    }
    const redactedOutput = redactTraceValue(toolResult.output);
    const sessionToolResult = {
      toolId,
      status: toolResult.status,
      summary: JSON.stringify(redactedOutput || {}).slice(0, 1000)
    };
    toolResultsForSession.push(sessionToolResult);
    const traceToolCall = {
      id: "runtime_auto_wait_coding_agent",
      name: toolId,
      toolId,
      status: toolResult.status,
      input: redactTraceValue(input),
      output: redactedOutput,
      source: "agent_runtime_auto_wait"
    };
    trace.toolCalls.push(traceToolCall);
    toolEventsForSession.push({
      toolId,
      status: toolResult.status,
      messages: [this.codingAgentWaitObservationMessage({ toolResult })]
    });
    if (fatalToolError) throw fatalToolError;
    return { toolResult };
  }

  codingAgentWaitObservationMessage({ toolResult } = {}) {
    return {
      role: "user",
      content: [
        CODING_AGENT_RESULT_NOTICE,
        "Use these observed Coding Agent results before producing your final response.",
        JSON.stringify(redactTraceValue({
          toolId: toolResult?.toolId || "coding_agent.wait",
          status: toolResult?.status,
          output: toolResult?.output
        }))
      ].join("\n\n")
    };
  }

  async prepareTurn(input) {
    const role = input?.role || "ceo_cto";
    const task = taskForTurn(input);
    const memoryContext = await this.memoryManager.buildContext({ task });
    const supportsTools = input?.supportsTools !== false;
    const sessionId = input?.session?.key || task.threadId || task.channel || "default";
    const profile = input?.profile || await this.profileForRole(role);
    const memoryText = this.formatMemoryContext(memoryContext);
    const sessionText = this.formatSessionContext(input?.session);
    const tools = this.toolManifestForRun(role, profile, { includeImplicitMemory: false });
    return {
      agentId: role,
      role,
      sessionId,
      profile,
      memoryContext,
      plan: undefined,
      tools,
      memoryText,
      sessionText,
      context: [memoryText, sessionText].filter(Boolean).join("\n\n")
    };
  }

  formatSpecialistContext(role, memoryContext, { session, supportsTools = true } = {}) {
    return [
      this.formatMemoryContext(memoryContext),
      this.formatSessionContext(session)
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  formatMemoryContext(memoryContext) {
    return this.memoryManager.format(memoryContext);
  }

  async profileForRole(role) {
    if (this.agentConfigStore) {
      const configuredProfile = this.agentConfigStore.getExisting
        ? await this.agentConfigStore.getExisting(role)
        : await this.agentConfigStore.get?.(role);
      if (configuredProfile) return configuredProfile;
      return this.fallbackProfileForRole(role);
    }
    return this.fallbackProfileForRole(role);
  }

  fallbackProfileForRole(role) {
    return {
      role,
      name: role,
      title: role,
      prompt: `You are ${role}. Follow your configured wake rules and use Engine tools for lifecycle changes.`,
      skills: [],
      mcps: [],
      tools: []
    };
  }

  async profileForAgent(agentName) {
    if (this.agentConfigStore?.list) {
      const agents = await this.agentConfigStore.list();
      const match = agents.find((agent) => agent.name === agentName || agent.role === agentName);
      if (match) return match;
    }
    return this.profileForRole(agentName);
  }

  storesForProfile(profile, agentName) {
    const fallbackRoot = this.config.rootDir || this.config.dataDir || (this.memory?.dir ? path.dirname(this.memory.dir) : ".");
    const fallbackWorkspaceDir = this.config.agentWorkspaceDir || path.join(fallbackRoot, "agent-workspace");
    const agentDir = profile.agentDir || path.join(this.config.agentsDir || path.join(fallbackWorkspaceDir, "agents"), agentName);
    return {
      sessions: new AgentSessionStore({
        agentDir,
        agentName,
        role: profile.role,
        compressionMinEligibleEvents: this.config.context?.sessionCompressionMinEligibleEvents,
        compressionMinEligibleChars: this.limits.maxPromptChars * this.limits.compressionThresholdRatio,
        compressSession: (request) => this.compressSessionWithProvider({
          ...request,
          profile,
          agentName
        })
      }),
      traces: new AgentTraceStore({ agentDir }),
      memory: new AgentMemoryStore({ agentDir, agentName, role: profile.role })
    };
  }

  async compressSessionWithProvider({ profile = {}, events = [], protectedEventIds = [] } = {}) {
    if (!events.length) return undefined;
    const providerSelection = await this.resolveProviderSelection(profile);
    const eventText = events.map((event) => [
      `## ${event.id}`,
      `type: ${event.type}`,
      `turn: ${event.turnNumber}`,
      event.inputText ? `input: ${event.inputText}` : "",
      event.finalText ? `assistant: ${event.finalText}` : "",
      (event.messages || []).map((message) => `${message.role}: ${message.content || ""}`).join("\n")
    ].filter(Boolean).join("\n")).join("\n\n");
    const response = await this.completeModel({
      role: profile.role || profile.name,
      providerSelection,
      messages: [{
        role: "system",
        content: [
          "You summarize completed middle session history for replay.",
          "Preserve concrete user intent, decisions, tool observations, and unresolved follow-ups.",
          "Do not summarize first-turn or latest-turn user queries; they are excluded from this request."
        ].join("\n")
      }, {
        role: "user",
        content: [
          "Compress only these eligible session events.",
          protectedEventIds.length ? `Protected event ids not included: ${protectedEventIds.join(", ")}` : "",
          eventText
        ].filter(Boolean).join("\n\n")
      }],
      tools: [],
      purpose: "session_compression"
    });
    const summary = this.providerToolProtocol.completionText(response);
    return summary ? { summary: redactTraceValue(summary) } : undefined;
  }

  async resolveProviderSelection(profile = {}) {
    const modelProvider = profile.modelProvider || {};
    if (this.provider?.resolveTurnConfig) return this.provider.resolveTurnConfig(modelProvider);
    return {
      providerId: modelProvider.providerId || this.config.provider?.id || this.provider?.id || this.config.runner?.type,
      runner: this.config.runner?.type,
      model: modelProvider.model || this.config.provider?.model || this.provider?.capabilities?.model,
      provider: {
        id: modelProvider.providerId || this.config.provider?.id || this.provider?.id || this.config.runner?.type,
        runner: this.config.runner?.type,
        type: this.config.runner?.type
      }
    };
  }

  workspaceForRun(hostContext = {}) {
    const workspace = hostContext?.workspace || this.config.workspace;
    return workspace ? path.resolve(workspace) : "";
  }

  async completeModel({ role, providerSelection, messages, tools, abortSignal, purpose = "agent_runtime_run", onProviderEvent }) {
    if (this.provider?.complete) {
      return this.provider.complete({
        role,
        providerConfig: providerSelection.provider,
        providerSelection,
        model: providerSelection.model,
        messages,
        tools,
        abortSignal,
        purpose,
        onProviderEvent
      });
    }
    if (!this.provider?.runAgentTurn) throw new Error("AgentRuntime.run requires a model provider");
    const prompt = messages.map((message) => message.content || "").join("\n\n");
    const output = await this.provider.runAgentTurn({
      role,
      prompt,
      messages,
      tools,
      providerSelection,
      purpose,
      onProviderEvent
    });
    return {
      message: output.assistantMessage || { role: "assistant", content: output.finalMessage || "" },
      toolCalls: output.toolCalls || [],
      structuredOutput: output.structuredOutput,
      structured: output.structured,
      usage: output.usage,
      raw: output.raw || output.stdout
    };
  }

  toolManifestForRun(role, profile = {}, { includeImplicitMemory = true } = {}) {
    const activeProfile = Object.keys(profile || {}).length ? profile : { role, tools: [], skills: [], mcps: [] };
    const explicit = this.toolRegistry.manifestForRole(role);
    const byId = new Map(explicit.map((tool) => [tool.id, tool]));
    if (includeImplicitMemory) {
      for (const tool of this.toolRegistry.list().filter((item) => item.category === "memory" || item.id?.startsWith("memory."))) {
        if (!byId.has(tool.id)) {
          byId.set(tool.id, {
            ...tool,
            policy: this.toolRegistry.policyEngine.evaluate(tool, role)
          });
        }
      }
    }
    if ((activeProfile.skills || []).length) {
      const definition = this.toolRegistry.get?.("skill") || {
        id: "skill",
        category: "skill",
        description: "Read an installed Skill markdown file by name.",
        risk: "low"
      };
      byId.set("skill", {
        ...definition,
        description: definition.description,
        parameters: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
              description: "Installed Skill name to read."
            }
          }
        },
        policy: this.toolRegistry.policyEngine.evaluate(definition, role)
      });
    }
    const selectedToolIds = new Set((activeProfile.tools || []).map(String));
    const hasExplicitProfileTools = Array.isArray(activeProfile.tools);
    for (const toolId of selectedToolIds) {
      if (toolId === "skill" && (activeProfile.skills || []).length) continue;
      const definition = this.toolRegistry.get?.(toolId);
      if (definition) {
        byId.set(definition.id, {
          ...definition,
          policy: this.toolRegistry.policyEngine.evaluate(definition, role)
        });
      }
    }
    for (const tool of mcpToolDefinitionsFromProfile(activeProfile)) {
      if (hasExplicitProfileTools && !selectedToolIds.has(tool.id)) continue;
      byId.set(tool.id, {
        ...tool,
        policy: this.toolRegistry.policyEngine.evaluate(tool, role)
      });
    }
    return [...byId.values()];
  }

  formatSessionContext(session) {
    return session?.rollingSummary ? ["## Session Context", session.rollingSummary].join("\n") : "";
  }

  describeBackendBoundary({ backend, role, sandbox }) {
    return [
      "## Backend Boundary",
      `Backend: ${backend || "unknown"}`,
      `Role: ${role || "unknown"}`,
      `Sandbox: ${sandbox || "unspecified"}`
    ].join("\n");
  }

  toolManifest(role) {
    return this.toolRegistry.manifestForRole(role);
  }
}

function redactTraceValue(value) {
  return redactSecretValue(value);
}
