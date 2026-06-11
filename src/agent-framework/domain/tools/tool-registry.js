import { ToolPolicyEngine } from "./tool-policy.js";

export const DEFAULT_TOOLS = [
  {
    id: "skill",
    category: "skill",
    description: "Read an installed Skill markdown file by name.",
    descriptionZh: "按名称读取当前员工已安装的 Skill Markdown 内容。",
    risk: "low",
    parameters: {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: {
        name: { type: "string", description: "Installed Skill name to read." }
      }
    }
  },
  {
    id: "memory.search",
    category: "memory",
    implicit: true,
    description: "Search semantic, episodic, and procedural memory before acting.",
    descriptionZh: "搜索长期事实、事件记忆和流程经验，适合员工开始工作前先找上下文。",
    risk: "low"
  },
  {
    id: "memory.write",
    category: "memory",
    implicit: true,
    description: "Write durable facts, decisions, procedures, and lessons.",
    descriptionZh: "写入长期记忆，例如结论、经验、流程规则或可复用的项目事实。",
    risk: "medium"
  },
  {
    id: "engine.create_intent",
    category: "engine",
    description: "Create a CEO-owned TeamEngine intent after the CEO decides a channel message is real company work.",
    descriptionZh: "当 CEO 判断渠道消息确实是公司工作、战略事项或明确需求后，创建一个 CEO-owned TeamEngine intent。",
    risk: "medium",
    parameters: {
      type: "object",
      required: ["text"],
      additionalProperties: true,
      properties: {
        text: { type: "string", description: "Normalized user-visible goal for the intent." },
        name: { type: "string", description: "Short human-readable name for the intent." },
        description: { type: "string", description: "Long-form background, context, and scope for the intent." },
        constraints: { type: "array", items: { type: "string" } },
        acceptanceCriteria: { type: "array", items: { type: "string" } },
        priority: { type: "string" },
        projectId: { type: "string", description: "Existing Engine project id to associate this intent with." },
        projectName: { type: "string", description: "Project name to create or reuse when no projectId is known." },
        projectSlug: { type: "string" },
        projectWorkspace: { type: "string", description: "Optional explicit workspace for the project." },
        channel: { type: "string" },
        threadId: { type: "string" },
        userId: { type: "string" },
        userName: { type: "string" },
        eventId: { type: "string" },
        dedupeKey: { type: "string" },
        replyTarget: { type: "object", additionalProperties: true },
        metadata: { type: "object", additionalProperties: true }
      }
    }
  },
  {
    id: "engine.projects",
    category: "engine",
    description: "List, inspect, or create Engine projects before the CEO creates intents.",
    descriptionZh: "让 CEO 查看、检查或创建项目。创建 Intent 前应先关联已有项目，或在没有合适项目时创建项目。",
    risk: "medium",
    parameters: {
      type: "object",
      required: ["action"],
      additionalProperties: true,
      properties: {
        action: { type: "string", enum: ["list", "get", "create"] },
        projectId: { type: "string" },
        projectName: { type: "string" },
        name: { type: "string" },
        slug: { type: "string" },
        workspace: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    id: "engine.transition",
    category: "engine",
    description: "Request an Engine-owned entity status transition with agent attribution.",
    descriptionZh: "请求 TeamEngine 变更 intent、task 或 feedback 的状态，并记录是哪一个员工在什么时间操作过实体。",
    risk: "medium"
  },
  {
    id: "engine.retry_blocked",
    category: "engine",
    description: "Retry blocked TeamEngine intent or task work through the Engine lifecycle.",
    descriptionZh: "通过 TeamEngine 生命周期继续推进受阻的 intent 或 task，适合 CEO 判断问题已可重试后使用。",
    risk: "medium",
    parameters: {
      type: "object",
      required: ["entityType", "entityId"],
      additionalProperties: true,
      properties: {
        entityType: { type: "string", enum: ["intent", "task"] },
        entityId: { type: "string" },
        reason: { type: "string" }
      }
    }
  },
  {
    id: "Bash",
    category: "execution",
    description: "Run Bash commands. Use it for file inspection, file edits, tests, logs, git, npm, node, and local project commands.",
    descriptionZh: "运行 Bash 命令。用于读取/编辑文件、运行测试、查看日志、执行 git、npm、node 和本地项目命令。",
    risk: "high",
    parameters: {
      type: "object",
      required: ["command"],
      additionalProperties: false,
      properties: {
        command: {
          type: "string",
          description: "Shell command to run with Bash."
        },
        cwd: {
          type: "string",
          description: "Optional working directory. Relative paths resolve from the current workspace."
        },
        timeoutMs: {
          type: "number",
          description: "Optional timeout in milliseconds. Defaults to 120000."
        }
      }
    }
  },
  {
    id: "async_bash.start",
    category: "execution",
    description: "Start a long-running Bash command in the background and return an async job id immediately.",
    descriptionZh: "后台启动长时间运行的 Bash 命令，并立即返回异步 job id。",
    risk: "high",
    parameters: {
      type: "object",
      required: ["command"],
      additionalProperties: false,
      properties: {
        command: { type: "string", description: "Shell command to run with Bash." },
        cwd: { type: "string", description: "Optional working directory. Relative paths resolve from the current workspace." },
        timeoutMs: { type: "number", description: "Optional job timeout in milliseconds. Defaults to 900000." }
      }
    }
  },
  {
    id: "async_bash.status",
    category: "execution",
    description: "Inspect async Bash jobs by job id, job ids, or state. Returns status plus log tail by default; use logMode=full, cursor, or line ranges to read more logs.",
    descriptionZh: "按 job id、多个 job id 或状态查看异步 Bash 任务。默认返回日志 tail；可用 logMode=full、cursor 或行号范围读取更多日志。",
    risk: "medium",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        jobId: { type: "string" },
        jobIds: { type: "array", items: { type: "string" } },
        state: { type: "string", enum: ["running", "completed", "failed", "cancelled", "timed_out", "interrupted", "all"] },
        limit: { type: "number" },
        tailLines: { type: "number" },
        stream: { type: "string", enum: ["stdout", "stderr", "both"] },
        logMode: { type: "string", enum: ["tail", "full"] },
        cursor: {
          type: "object",
          additionalProperties: false,
          properties: {
            stdoutLine: { type: "number" },
            stderrLine: { type: "number" }
          }
        },
        fromLine: { type: "number" },
        toLine: { type: "number" }
      }
    }
  },
  {
    id: "async_bash.wait",
    category: "execution",
    description: "Wait for one or more async Bash jobs to reach a terminal state, returning final status and log tail by default.",
    descriptionZh: "等待一个或多个异步 Bash 任务结束，并默认返回最终状态和日志 tail。",
    risk: "medium",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        jobId: { type: "string" },
        jobIds: { type: "array", items: { type: "string" } },
        timeoutMs: { type: "number" },
        tailLines: { type: "number" },
        stream: { type: "string", enum: ["stdout", "stderr", "both"] },
        logMode: { type: "string", enum: ["tail", "full"] },
        cursor: {
          type: "object",
          additionalProperties: false,
          properties: {
            stdoutLine: { type: "number" },
            stderrLine: { type: "number" }
          }
        },
        fromLine: { type: "number" },
        toLine: { type: "number" }
      }
    }
  },
  {
    id: "async_bash.cancel",
    category: "execution",
    description: "Cancel one or more running async Bash jobs.",
    descriptionZh: "取消一个或多个正在运行的异步 Bash 任务。",
    risk: "high",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        jobId: { type: "string" },
        jobIds: { type: "array", items: { type: "string" } },
        state: { type: "string", enum: ["running"] },
        signal: { type: "string", description: "Signal to send. Defaults to SIGTERM." }
      }
    }
  },
  {
    id: "coding_agent.start",
    category: "execution",
    description: "Start a configured Coding Agent in the background and return an async job id immediately.",
    descriptionZh: "按当前员工配置后台启动一个 Coding Agent，并立即返回异步 job id。",
    risk: "high",
    parameters: {
      type: "object",
      required: ["prompt"],
      additionalProperties: false,
      properties: {
        prompt: { type: "string", description: "Self-contained assignment prompt for the Coding Agent." },
        workspace: { type: "string", description: "Explicit project workspace. Relative paths resolve from the current workspace." },
        timeoutMs: { type: "number", description: "Optional job timeout in milliseconds. It may extend the configured launcher timeout, but cannot shorten it. Use coding_agent.wait for waiting on results." }
      }
    }
  },
  {
    id: "coding_agent.status",
    category: "execution",
    description: "Inspect Coding Agent jobs by job id, job ids, or state. Returns status plus log tail by default; use logMode=full, cursor, or line ranges to read more logs.",
    descriptionZh: "按 job id、多个 job id 或状态查看 Coding Agent 任务。默认返回日志 tail；可用 logMode=full、cursor 或行号范围读取更多日志。",
    risk: "medium",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        jobId: { type: "string" },
        jobIds: { type: "array", items: { type: "string" } },
        state: { type: "string", enum: ["running", "completed", "failed", "cancelled", "timed_out", "interrupted", "all"] },
        limit: { type: "number" },
        tailLines: { type: "number" },
        stream: { type: "string", enum: ["stdout", "stderr", "both"] },
        logMode: { type: "string", enum: ["tail", "full"] },
        cursor: {
          type: "object",
          additionalProperties: false,
          properties: {
            stdoutLine: { type: "number" },
            stderrLine: { type: "number" }
          }
        },
        fromLine: { type: "number" },
        toLine: { type: "number" }
      }
    }
  },
  {
    id: "coding_agent.wait",
    category: "execution",
    description: "Wait for one or more Coding Agent jobs to reach a terminal state, returning final status and log tail by default.",
    descriptionZh: "等待一个或多个 Coding Agent 任务结束，并默认返回最终状态和日志 tail。",
    risk: "medium",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        jobId: { type: "string" },
        jobIds: { type: "array", items: { type: "string" } },
        timeoutMs: { type: "number" },
        tailLines: { type: "number" },
        stream: { type: "string", enum: ["stdout", "stderr", "both"] },
        logMode: { type: "string", enum: ["tail", "full"] },
        cursor: {
          type: "object",
          additionalProperties: false,
          properties: {
            stdoutLine: { type: "number" },
            stderrLine: { type: "number" }
          }
        },
        fromLine: { type: "number" },
        toLine: { type: "number" }
      }
    }
  },
  {
    id: "coding_agent.cancel",
    category: "execution",
    description: "Cancel one or more running Coding Agent jobs.",
    descriptionZh: "取消一个或多个正在运行的 Coding Agent 任务。",
    risk: "high",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        jobId: { type: "string" },
        jobIds: { type: "array", items: { type: "string" } },
        state: { type: "string", enum: ["running"] },
        signal: { type: "string", description: "Signal to send. Defaults to SIGTERM." }
      }
    }
  },
  {
    id: "channel.reply",
    category: "channel",
    description: "Send updates back to the originating channel.",
    descriptionZh: "回复原始渠道，例如把最终结果发回飞书、CLI 或 HTTP 来源。",
    risk: "medium"
  },
  {
    id: "scheduler.inspect",
    category: "operations",
    description: "Inspect polling, scheduled work, and health signals.",
    descriptionZh: "查看调度、轮询、计划任务和健康状态，适合运维员工。",
    risk: "low"
  }
];

export const DEFAULT_ROLE_TOOL_ALLOWLIST = {};

export class ToolRegistry {
  constructor({ tools = DEFAULT_TOOLS, roleAllowlist = DEFAULT_ROLE_TOOL_ALLOWLIST, policyEngine = new ToolPolicyEngine(), handlers = {} } = {}) {
    this.tools = new Map(tools.map((tool) => [tool.id, tool]));
    this.handlers = new Map();
    this.roleAllowlist = Object.fromEntries(Object.entries(roleAllowlist).map(([role, ids]) => [role, [...ids]]));
    this.policyEngine = policyEngine;
    for (const [toolId, handler] of Object.entries(handlers || {})) {
      this.registerHandler(toolId, handler);
    }
  }

  list() {
    return [...this.tools.values()];
  }

  get(toolId) {
    return this.tools.get(toolId);
  }

  registerTool(tool, handler) {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) throw new Error("tool definition must be an object");
    if (typeof tool.id !== "string" || !tool.id.trim()) throw new Error("tool definition requires id");
    const definition = { ...tool, id: tool.id.trim() };
    this.tools.set(definition.id, definition);
    if (handler) this.registerHandler(definition.id, handler);
    return definition;
  }

  registerHandler(toolId, handler) {
    if (typeof toolId !== "string" || !toolId.trim()) throw new Error("tool handler requires toolId");
    if (typeof handler !== "function") throw new Error(`handler for ${toolId} must be a function`);
    this.handlers.set(toolId.trim(), handler);
    return handler;
  }

  handlerFor(toolId) {
    return this.handlers.get(toolId);
  }

  forRole(role) {
    const allowed = new Set(this.roleAllowlist[role] || []);
    return this.list().filter((tool) => allowed.has(tool.id));
  }

  describeForRole(role) {
    return this.policyEngine.describe(role, this.forRole(role));
  }

  allowed(role, toolId) {
    const tool = this.forRole(role).find((item) => item.id === toolId);
    return Boolean(tool && this.policyEngine.evaluate(tool, role).allowed);
  }

  setRoleTools(role, toolIds) {
    const unknown = (toolIds || []).filter((toolId) => !this.tools.has(toolId));
    if (unknown.length) throw new Error(`unknown tool ids for ${role}: ${unknown.join(", ")}`);
    this.roleAllowlist[role] = [...new Set(toolIds || [])];
    return this.roleAllowlist[role];
  }

  defaultToolsForRole(role) {
    return [...(DEFAULT_ROLE_TOOL_ALLOWLIST[role] || [])];
  }

  manifestForRole(role) {
    return this.policyEngine.manifestFor(role, this.forRole(role));
  }
}
