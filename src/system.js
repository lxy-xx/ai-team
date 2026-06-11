import { loadConfig } from "./config.js";
import { createLogger } from "./platform/logging.js";
import { MemoryStore } from "./agent-framework/infrastructure/memory-store.js";
import { Scheduler } from "./interfaces/scheduler/scheduler.js";
import { ChannelConfigStore } from "./interfaces/channels/channel-config-store.js";
import { ChannelGateway } from "./interfaces/channels/channel-gateway.js";
import { ToolAuditLog } from "./agent-framework/infrastructure/tools/tool-audit-log.js";
import { OutboundReplyService } from "./interfaces/channels/outbound-reply-service.js";
import { AgentRuntime } from "./agent-framework/application/agent-runtime.js";
import { ToolExecutor } from "./agent-framework/application/tool-executor.js";
import { ToolRegistry } from "./agent-framework/domain/tools/tool-registry.js";
import { ToolPolicyEngine } from "./agent-framework/domain/tools/tool-policy.js";
import { AgentConfigStore } from "./agent-framework/infrastructure/agent-config-store.js";
import { onboardDefaultAgentProfiles } from "./agent-framework/infrastructure/default-agent-onboarding.js";
import { createModelProvider } from "./agent-framework/infrastructure/provider/model-provider.js";
import { ProviderConfigStore } from "./agent-framework/infrastructure/provider/provider-config-store.js";
import { createChannels } from "./interfaces/channels/index.js";
import { FeishuLongConnection } from "./interfaces/channels/feishu/feishu-long-connection.js";
import { EngineBus } from "./team-engine/infrastructure/engine-bus.js";
import { TeamEngine } from "./team-engine/application/team-engine.js";
import { EngineToolHandlers } from "./team-engine/adapters/agent-framework/engine-tool-handlers.js";
import { EngineRoutingStore } from "./team-engine/infrastructure/routing-store.js";
import { onboardDefaultTeamRouting } from "./team-engine/infrastructure/default-team-onboarding.js";
import { EngineStore } from "./team-engine/infrastructure/engine-store.js";
import { WorkerEngine } from "./team-engine/adapters/agent-framework/worker-engine.js";
import { OnboardingStateStore } from "./platform/onboarding-state-store.js";
import { CodingAgentLauncherStore, onboardDefaultCodingAgentLaunchers } from "./agent-framework/infrastructure/coding-agent-launcher-store.js";

export async function createSystem({ recoverInterruptedRuns = true } = {}) {
  const config = loadConfig();
  const logger = createLogger();
  const memory = new MemoryStore({ dataDir: config.dataDir });
  const channelConfigStore = new ChannelConfigStore({ dataDir: config.dataDir, config });
  const toolAuditLog = new ToolAuditLog({ dataDir: config.dataDir });
  const engineStore = new EngineStore({ dataDir: config.dataDir, projectWorkspaceRoot: config.projectWorkspaceRoot });
  const engineBus = new EngineBus({ dataDir: config.dataDir });
  const providerConfigStore = new ProviderConfigStore({
    dataDir: config.dataDir,
    agentWorkspaceDir: config.agentWorkspaceDir,
    config,
    includeMockProvider: config.runner?.type === "mock" || config.provider?.id === "mock"
  });
  const toolRegistry = new ToolRegistry({ policyEngine: new ToolPolicyEngine(config.toolPolicy) });
  const agentConfigStore = new AgentConfigStore({ dataDir: config.dataDir, agentWorkspaceDir: config.agentWorkspaceDir, toolRegistry });
  const routingStore = new EngineRoutingStore({ dataDir: config.dataDir, agentWorkspaceDir: config.agentWorkspaceDir });
  const onboardingStateStore = new OnboardingStateStore({ dataDir: config.dataDir });
  await memory.init();
  await channelConfigStore.init();
  await toolAuditLog.init();
  await providerConfigStore.init();
  await agentConfigStore.init();
  await onboardingStateStore.init();
  await onboardDefaultAgentProfiles({ agentConfigStore, onboardingStateStore });
  await routingStore.init();
  await onboardDefaultTeamRouting({ routingStore, onboardingStateStore });

  const codingAgentLauncherStore = new CodingAgentLauncherStore({ dataDir: config.dataDir, agentWorkspaceDir: config.agentWorkspaceDir, agentsDir: config.agentsDir });
  await codingAgentLauncherStore.init();
  await onboardDefaultCodingAgentLaunchers({ store: codingAgentLauncherStore, onboardingStateStore });

  const provider = createModelProvider({ config, logger, providerConfigStore });
  const agentRuntime = new AgentRuntime({ memory, toolRegistry, agentConfigStore, toolPolicy: config.toolPolicy, config, provider });
  const toolExecutor = new ToolExecutor({
    config,
    memory,
    toolRegistry,
    toolAuditLog,
    logger,
    codingAgentLauncherStore
  });
  await toolExecutor.asyncBashJobManager.ensureInitialized();
  agentRuntime.toolExecutor = toolExecutor;
  const engineWorker = new WorkerEngine({
    store: engineStore,
    bus: engineBus,
    agentRuntime,
    provider,
    config,
    logger,
    toolAuditLog,
    toolExecutor
  });
  const engine = new TeamEngine({
    store: engineStore,
    bus: engineBus,
    worker: engineWorker,
    config,
    memory,
    outboundReplyService: undefined,
    logger,
    routingStore
  });
  await engine.init({ recoverInterruptedRuns });
  const channelGateway = new ChannelGateway({ logger, config, engine });
  const channels = createChannels({ config, logger, channelConfigStore, channelGateway });
  const feishuLongConnection = new FeishuLongConnection({ channelConfigStore, channelGateway, logger });
  const outboundReplyService = new OutboundReplyService({ channels, memory, logger });
  engine.outboundReplyService = outboundReplyService;
  const engineToolHandlers = new EngineToolHandlers({
    config,
    engine,
    engineStore,
    channelConfigStore,
    toolRegistry,
    outboundReplyService
  });
  engineToolHandlers.register();
  const scheduler = new Scheduler({
    logger,
    pollIntervalMs: config.pollIntervalMs,
    memory,
    feedbackScanIntervalMs: config.feedbackScanIntervalMs,
    engine
  });

  return {
    config,
    logger,
    memory,
    channelConfigStore,
    toolAuditLog,
    engineStore,
    engineBus,
    engineWorker,
    engine,
    toolExecutor,
    toolRegistry,
    channelGateway,
    agentRuntime,
    agentConfigStore,
    routingStore,
    onboardingStateStore,
    providerConfigStore,
    feishuLongConnection,
    outboundReplyService,
    engineToolHandlers,
    provider,
    providerConfigStore,
    codingAgentLauncherStore,
    channels,
    scheduler
  };
}
