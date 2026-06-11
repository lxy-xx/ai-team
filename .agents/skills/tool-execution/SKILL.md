---
name: tool-execution
description: 当修改 ai-team 的 ToolRegistry、ToolExecutor、tool policy、role allowlist、ToolAuditLog、Bash/local execution、memory tools、MCP tools 或 HTTP/dashboard 暴露工具时使用。
---

# 工具执行

ToolExecutor 不是整个 Harness，它是 Harness 里的执行臂。Harness 还包括 memory、session、trace、log、ToolAuditLog、provider health 和 tool results，用来观察和调优 Agent。ToolExecutor 负责其中最硬的一件事：把 Agent 的工具请求安全落地，再把结果和证据带回回合里。

## 工具调用链

```text
AgentRuntime / HTTP route
  -> ToolExecutor.invoke
  -> ToolRegistry.allowed + schema validation
  -> registered handler 或 MCP runner
  -> ToolAuditLog.record
  -> trace.toolCalls / error.toolResult
```

ToolExecutor 的输出不只是给 Agent 看的结果，也是后续调优 Harness 的材料。看一次失败，通常要同时看 trace、tool audit、session turn、memory write 和 Engine run。

授权不是审批流。Agent profile 已授权的工具直接执行；未授权的工具拒绝执行并记录审计。`ToolRegistry` 只登记工具定义、schema 和 handler，不自带默认岗位授权；默认团队授权由 `default-agent-onboarding.js` 写入 profile `tools.json`。`ToolExecutor.invoke` 必须显式传入 role，调用方要自己决定这次工具动作属于 CEO、worker 还是 HTTP/admin 来源，不能由 ToolExecutor 默认归因。AgentRuntime 会把可恢复的工具失败作为 failed tool result 交回 Provider loop，让 Agent 自己修正或解释；403 授权/策略失败不可恢复，应立刻中止当前 Agent turn，并由 Engine 生命周期把相关工作阻塞。

## 先判断归属

- 只是新增工具定义：先改 `tool-registry.js` 和 ToolExecutor handler。只有当需求明确要某个 Agent 或默认团队立刻可用时，才改 profile `tools.json`、运行时 Agent overrides，或同步 `default-agent-onboarding.js` 的默认 profile seed。
- 需要执行外部动作：在 ToolExecutor handler 中实现，不要直接塞到 route、Provider 或 AgentRuntime。
- 需要调用 MCP：让 profile 暴露 MCP tool definition，并把对应 MCP tool id 显式加入 Agent profile `tools`，由 ToolExecutor 走 external tool runner。
- 需要改变本地执行默认目录：统一改 ToolExecutor 的 `Bash` cwd 解析和 AgentRuntime stable system prompt 的 workspace seed。

## 要守住的边界

- HTTP 和 Agent turns 发起的工具调用都走 ToolExecutor。
- 每次工具调用都要有显式 role attribution；漏传 role 是调用方错误，不应被默认记到 `ceo_cto`。
- HTTP/API 暴露的工具调用入口必须在调用 `ToolExecutor.invoke` 前校验 role，缺失时返回错误；不要在 route 层替请求补默认 CEO。
- HTTP 暴露的工具调用入口是 `/ai-team/api/tools/invoke`，属于统一 API 命名空间；不要重新开放根 `/api/tools/invoke`。
- 内置本地执行工具包括同步 `Bash`、底层异步 `async_bash.start/status/wait/cancel` 和工程派发封装 `coding_agent.start/status/wait/cancel`；新增异步能力时只改工具定义/handler/授权，不要把它塞进 Provider 或 AgentRuntime 分支。
- `Bash` 覆盖文件读写、命令、测试、日志检查和本地项目操作；`async_bash.start` 用于后台启动长命令并返回 job id；`coding_agent.start` 根据全局唯一的 `agent-workspace/framework/coding-agents/launchers.json` launcher 配置启动 Coding Agent，并复用 async job 状态与日志存储。launcher 值由 `CodingAgentLauncherStore` 管理，Dashboard/API 公开面只展示 `commandTemplate` 和超时，不返回 id、名称、描述或 env；`coding_agent.start` 的输入 `timeoutMs` 只能延长 launcher 超时，不能缩短它，等待结果应由 `coding_agent.wait` 完成。
- `async_bash.status/wait` 和 `coding_agent.status/wait` 默认只返回 tail；返回内容必须提示 Agent 可用当前工具名配合 `logMode=full`、cursor 或 `fromLine/toLine` 读取完整日志。不要把完整日志默认塞回模型上下文。
- AgentRuntime 是 `coding_agent.start` 的最终收口边界：同一轮 Agent 调用过 Coding Agent 后，若模型准备最终答复而仍有未收口 job，Runtime 会自动审计调用 `coding_agent.wait`，并把结果作为观察消息送回 Agent；只有 wait/cancel 返回 terminal state 才能把 job 从 pending 中移除。ToolExecutor 仍只负责执行和审计工具，不在工具层自行推进 Agent/Engine 状态。
- `async_bash.cancel` 不能空参数默认取消全部任务；必须有 `jobId`、`jobIds`，或显式 `state=running`。
- `coding_agent.cancel` 同样不能空参数默认取消全部任务；必须有 `jobId`、`jobIds`，或显式 `state=running`。
- `Bash`、`async_bash.*` 和 `coding_agent.*` 不做命令白名单、参数语法限制或 workspace 越界限制；安全边界是显式 role 授权、tool policy、ToolAuditLog 和结果回到 Provider loop。
- `Bash`、`async_bash.start` 与 `coding_agent.start` 默认 cwd/workspace 来自 Engine host context 的 project workspace，缺失时回退到 config workspace；工具 input 的 `cwd`/`workspace` 可以覆盖，绝对路径按原样解析，相对路径从当前 workspace 解析。
- 异步 Bash job 元数据和 stdout/stderr 日志属于 Harness 运行证据，保存在 `data/tools/async-bash/`；进程重启时仍处于 running/queued 的旧 job 应标记为 interrupted，不要假装仍在运行。
- 异步 Bash 默认每 role 最多 8 个 running job，全局最多 32 个 running job；配置项是 `AI_TEAM_ASYNC_BASH_MAX_RUNNING_PER_ROLE` 和 `AI_TEAM_ASYNC_BASH_MAX_RUNNING_GLOBAL`。
- `memory.search`、`memory.write` 是隐式 runtime 工具，默认可用但不在 Dashboard/API 公共配置面展示；不要把它们当成用户需要勾选的显式能力。
- MCP 工具不是隐式能力，必须显式在 Agent profile 的 `tools` 里授权；只配置 MCP server 不等于允许执行其中所有工具。
- Provider execution 不能偷跑本地命令或写 workspace；模型只返回 tool call，由 AgentRuntime 交给 ToolExecutor。
- `Bash` 返回给 Agent loop 的 stdout/stderr 必须截断，异步 Bash 默认也只返回日志 tail，避免长日志挤爆下一轮模型上下文；Agent 需要的是关键结果和失败片段，不是完整流式日志。
- 新增工具时同步工具定义和必要的 handler；默认 profile seed、运行时 Agent overrides 只在需求明确要授权时修改。不要把默认岗位 allowlist 写回 `ToolRegistry`。

## 新增工具前

新增工具前写清楚：谁能调用、输入 schema、风险等级、是否影响外部世界、是否需要 project context、是否隐式、审计记录是什么、失败如何对 Agent 可见。

详细示例只在需要时读：

- `references/tool-boundaries.md`
- `references/new-tool-example.md`
- `references/workspace-resolution.md`
