import path from "node:path";
import os from "node:os";
import process from "node:process";

function readInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optional(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function readFloat(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig() {
  const rootDir = process.cwd();
  const dataDir = path.resolve(rootDir, process.env.AI_TEAM_DATA_DIR || "./data");
  const agentWorkspaceDir = path.resolve(rootDir, process.env.AI_TEAM_AGENT_WORKSPACE_DIR || "agent-workspace");
  const agentsDir = path.join(agentWorkspaceDir, "agents");
  const runnerType = process.env.AI_TEAM_RUNNER || "mock";
  const projectWorkspaceRoot = path.resolve(
    process.env.AI_TEAM_PROJECT_WORKSPACE_ROOT || path.join(os.homedir(), "ai-team")
  );

  return {
    rootDir,
    agentWorkspaceDir,
    agentsDir,
    host: process.env.AI_TEAM_HOST || "0.0.0.0",
    port: readInt("AI_TEAM_PORT", 8787),
    dataDir,
    workspace: path.resolve(rootDir, process.env.AI_TEAM_WORKSPACE || rootDir),
    projectWorkspaceRoot,
    defaultProjectName: process.env.AI_TEAM_DEFAULT_PROJECT_NAME || "default",
    publicBaseUrl: optional("AI_TEAM_PUBLIC_BASE_URL"),
    adminToken: optional("AI_TEAM_ADMIN_TOKEN"),
    pollIntervalMs: readInt("AI_TEAM_POLL_INTERVAL_MS", 5000),
    feedbackScanIntervalMs: readInt("AI_TEAM_FEEDBACK_SCAN_INTERVAL_MS", 14_400_000),
    context: {
      maxPromptChars: readInt("AI_TEAM_CONTEXT_WINDOW_CHARS", 60_000),
      compressionThresholdRatio: readFloat("AI_TEAM_CONTEXT_COMPRESSION_RATIO", 0.8)
    },
    asyncBash: {
      maxRunningPerRole: readInt("AI_TEAM_ASYNC_BASH_MAX_RUNNING_PER_ROLE", 8),
      maxRunningGlobal: readInt("AI_TEAM_ASYNC_BASH_MAX_RUNNING_GLOBAL", 32)
    },
    toolPolicy: {
      approvalMode: process.env.AI_TEAM_APPROVAL_MODE || "never",
      maxAutoRisk: process.env.AI_TEAM_MAX_AUTO_TOOL_RISK || "medium",
      sandbox: process.env.AI_TEAM_TOOL_SANDBOX || process.env.AI_TEAM_CODEX_SANDBOX || "workspace-write",
      deniedTools: (process.env.AI_TEAM_DENIED_TOOLS || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      approvalRequiredTools: (process.env.AI_TEAM_APPROVAL_REQUIRED_TOOLS || "Bash,channel.reply")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    },
    runner: {
      type: runnerType,
      codexBin: process.env.AI_TEAM_CODEX_BIN || "codex",
      codexModel: optional("AI_TEAM_CODEX_MODEL"),
      codexSandbox: process.env.AI_TEAM_CODEX_SANDBOX || "workspace-write",
      codexApproval: process.env.AI_TEAM_CODEX_APPROVAL || "never",
      codexTimeoutMs: readInt("AI_TEAM_CODEX_TIMEOUT_MS", 900_000)
    },
    provider: {
      id: process.env.AI_TEAM_PROVIDER || (runnerType === "mock" ? "mock" : "codex"),
      model: optional("AI_TEAM_MODEL") || optional("AI_TEAM_CODEX_MODEL")
    },
    feishu: {
      verificationToken: optional("FEISHU_VERIFICATION_TOKEN"),
      encryptKey: optional("FEISHU_ENCRYPT_KEY"),
      appId: optional("FEISHU_APP_ID"),
      appSecret: optional("FEISHU_APP_SECRET"),
      outgoingWebhookUrl: optional("FEISHU_OUTGOING_WEBHOOK_URL")
    }
  };
}
