const RISK_RANK = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const DEFAULT_POLICY = {
  approvalMode: "never",
  maxAutoRisk: "medium",
  sandbox: "workspace-write",
  deniedTools: [],
  approvalRequiredTools: ["Bash", "channel.reply"]
};

function rank(risk) {
  return RISK_RANK[risk] || RISK_RANK.medium;
}

export class ToolPolicyEngine {
  constructor(policy = {}) {
    this.policy = {
      ...DEFAULT_POLICY,
      ...policy,
      deniedTools: policy.deniedTools || DEFAULT_POLICY.deniedTools,
      approvalRequiredTools: policy.approvalRequiredTools || DEFAULT_POLICY.approvalRequiredTools
    };
  }

  evaluate(tool, role) {
    if (!tool) {
      return {
        allowed: false,
        approvalRequired: false,
        reason: "unknown tool"
      };
    }
    if (this.policy.deniedTools.includes(tool.id)) {
      return {
        allowed: false,
        approvalRequired: false,
        reason: "tool is denied by policy"
      };
    }

    const highRisk = rank(tool.risk) > rank(this.policy.maxAutoRisk);
    const configuredApproval = this.policy.approvalRequiredTools.includes(tool.id);
    const approvalRequired = this.policy.approvalMode !== "never" && (highRisk || configuredApproval);

    return {
      allowed: true,
      approvalRequired,
      sandbox: this.policy.sandbox,
      reason: approvalRequired
        ? `${tool.id} requires approval for role ${role}`
        : `${tool.id} is allowed for role ${role}`
    };
  }

  manifestFor(role, tools) {
    return tools.map((tool) => ({
      ...tool,
      policy: this.evaluate(tool, role)
    }));
  }

  describe(role, tools) {
    const manifest = this.manifestFor(role, tools);
    if (!manifest.length) return "No tools are enabled for this role.";
    return manifest
      .map((tool) => {
        const state = tool.policy.allowed
          ? tool.policy.approvalRequired
            ? "approval_required"
            : "allowed"
          : "denied";
        return `- ${tool.id} [${tool.risk}, ${state}, sandbox=${tool.policy.sandbox || "none"}]: ${tool.description}`;
      })
      .join("\n");
  }
}
