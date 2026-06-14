import path from "node:path";

function safeSegment(value, label = "path segment") {
  const segment = String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!segment || segment === "." || segment === "..") throw new Error(`invalid ${label}: ${value}`);
  return segment;
}

export function resolveAgentWorkspacePaths({ agentWorkspaceDir, agentName } = {}) {
  if (!agentWorkspaceDir) throw new Error("agentWorkspaceDir is required");
  const workspaceDir = path.resolve(agentWorkspaceDir);
  const agentsDir = path.join(workspaceDir, "agents");
  const paths = {
    agentWorkspaceDir: workspaceDir,
    agentsDir
  };
  if (!agentName) return paths;

  const agentDir = path.join(agentsDir, safeSegment(agentName, "agent name"));
  const dotAgentsDir = path.join(agentDir, ".agents");
  const memoryDir = path.join(agentDir, "memory");
  const episodicDir = path.join(memoryDir, "episodic");
  const longTermDir = path.join(memoryDir, "long-term");
  return {
    ...paths,
    agentDir,
    agentsMd: path.join(agentDir, "AGENTS.md"),
    agentJson: path.join(agentDir, "agent.json"),
    toolsJson: path.join(agentDir, "tools.json"),
    dotAgentsDir,
    routingJson: path.join(dotAgentsDir, "routing.json"),
    legacyMcpDir: path.join(dotAgentsDir, "mcp"),
    skillsDir: path.join(dotAgentsDir, "skills"),
    mcpDir: path.join(agentDir, "mcp"),
    memoryDir,
    sessionsDir: path.join(memoryDir, "sessions"),
    episodicDir,
    episodicEventsDir: path.join(episodicDir, "events"),
    longTermDir,
    tracesDir: path.join(agentDir, "traces")
  };
}

export function resolveProviderWorkspacePaths({ agentWorkspaceDir } = {}) {
  if (!agentWorkspaceDir) throw new Error("agentWorkspaceDir is required");
  const workspaceDir = path.resolve(agentWorkspaceDir);
  const providersDir = path.join(workspaceDir, "framework", "providers");
  return {
    agentWorkspaceDir: workspaceDir,
    frameworkDir: path.join(workspaceDir, "framework"),
    providersDir,
    providersFile: path.join(providersDir, "providers.json"),
    providerSecretsFile: path.join(providersDir, "provider-secrets.local.json"),
    providerHealthFile: path.join(providersDir, "provider-health.local.json")
  };
}
