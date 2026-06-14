---
name: agent-runtime
description: 当修改 ai-team 的 AgentRuntime、Agent 配置、role prompt、memory、context budget、skills/MCP、Provider tool loop、session、trace、direct one-on-one chat 或 WorkerEngine 到 AgentRuntime 的接入时使用。
---

# 智能体运行时

AgentRuntime 是 Agent 真正开始工作的地方。CEO 渠道消息、TeamEngine worker assignment、dashboard one-on-one chat，入口不同，但进入回合后应该拿到同一套配置、记忆、工具、模型和 trace 行为。

## 回合结构

一次 `AgentRuntime.run()` 大致做这些事：

1. 用 Agent 名或 role 解析 profile；role 是稳定业务 ID，Agent 名只是显示名和配置目录默认值。默认 profile 只由 `default-agent-onboarding.js` 在传入 `OnboardingStateStore` 后一次性 seed，`OnboardingStateStore` 记录首次 seed marker，`AgentConfigStore.init()` 不自动创建默认团队，`AgentConfigStore.get()`/`getExisting()`/`update()` 也不创建缺失目录。Agent profile skills 只读写 `agent-workspace/agents/<Agent>/.agents/skills/<skill>/SKILL.md`，从 frontmatter `name`/`description` 和正文生成运行时 skill，不维护 `skill.json`，也不使用 Agent 目录顶层 `skills/`。默认产品经理的任务图约束放在 `task-graph-contract` skill 和 `output.json`，默认 QA 的验收结构由 prompt 和 `output.json` 共同要求顶层 `verification_report.verdict`，默认 CEO 的阻塞诊断流程放在 `blocker-diagnosis` skill；不要把这些规则写进运行时代码。如果同一个 role 同时有多个 Agent 目录，`AgentConfigStore` 必须把它当成配置冲突报错，不按默认名或历史名折叠。
2. 打开该 Agent 的 memory、session、trace stores。
3. 读取 long-term facts、open context needs、recent summary。
4. 由 `AgentSessionFactory` 创建 Session fork seed 和当前 turn material；Session store 负责渲染 Provider 消息和压缩 replay prefix。
5. 生成 tool manifest，包含 profile `tools`、隐式 memory tools、默认 runtime `skill` 工具、skills、显式授权的 MCP tools。
6. 调 Provider；如果 Provider 请求 tool calls，则通过 ToolExecutor 执行并进入下一轮。
7. 写 turn event、session turn、trace。

## Session 与上下文

Session 是 Provider 消息的权威来源。Runtime 可以决定本轮要追加哪些 material，但不能在 Session 外重新拼完整历史。

- 新 session：Runtime 把 system/runtime 指令、Agent prompt、Skill metadata、工具协议、长期/中期记忆选择结果作为 fork seed 写入 Session。Skill metadata 是独立 stable system block，只列已安装 Skill 的 `name` 和 `description`；Skill 正文仍由 `skill` 工具按需读取，`skill` 工具说明和参数不要重复列出已安装 Skill。
- Session 可以保留多个 context block 做预算、压缩和 trace 元数据；提交给 Provider 的 seed 要合并成一个连续的 system prompt bundle，避免运行详情里出现多条离散 system submitted messages。
- 已有 session：历史 prefix 从 Session 读取；本轮只追加当前 assignment/user prompt 和工具 loop 消息。
- 工具调用：assistant tool call 和 tool result 先作为 active loop messages 临时参与下一次 Provider 请求，turn 结束后再写入 Session events。
- live trace：Worker run 进入 AgentRuntime 前要预分配并写入 `agentTraceId`，Runtime 接受可选 `traceId`。Runtime 在 seed/context 确定、Provider 回合创建、Provider delta 到达、Provider 回合完成、工具结果返回和自动 Coding Agent wait 后都要 best-effort 写 trace 文件；Dashboard 依赖这些中间快照展示 running run 的对话、工具入参/出参和流式输出。
- 多轮工具调用写回 Session 时必须保留原始交错顺序：assistant tool call 后面紧跟对应 tool result，再进入下一次 assistant tool call。不能把所有 assistant tool call 排在所有 tool result 前面，否则 OpenAI-compatible Provider 会拒绝 replay。
- Provider 工具循环有上限，用来阻止无限工具调用；上限要允许正常 QA/工程验证完成多步检查，当前是 8 轮。普通工具失败要以 failed tool result 回到 Provider loop，让 Agent 有机会修正参数、换工具或解释失败；403 授权/策略错误是不可恢复配置问题，要立刻抛出，让 WorkerEngine/TeamEngine 把 run 记为 failed 并阻塞实体。
- 压缩：Session 选择可压缩的中间历史，Runtime 只提供一个能调用 Provider 的摘要回调。第一轮用户 query 以及它之前的 seed 内容、当前最后一轮用户 query 必须保留原文；中间历史压缩后写回 system summary，不伪装成 user message。
- 角色 prompt 不能鼓励 Agent 直接声明外部动作结果。文件写入、测试运行、权限失败、命令执行完成等说法，必须能对应到 session、trace 或 ToolAuditLog 中的真实工具证据。

## 先分清改什么

- 改 Agent 初始能看到什么：profile、memory、skills、MCP、`AgentSessionFactory`。
- 改历史如何回放：Session store、compression policy、`renderProviderMessages()`。
- 改 Agent 能做什么：tool registry、tool policy、ToolExecutor。
- 改本地执行能力：同步 `Bash`、底层异步 `async_bash.start/status/wait/cancel` 和工程派发封装 `coding_agent.start/status/wait/cancel` 都属于内置本地执行工具，不设命令白名单或 workspace 越界限制，但必须保留 ToolAuditLog 证据。`coding_agent.*` 根据全局唯一的 `agent-workspace/framework/coding-agents/launchers.json` launcher 配置启动 Coding Agent；运行时代码不能写死默认 launcher，默认 onboarding 才能 seed 默认 Coding Agent CLI。Dashboard/API 公开面只展示 `commandTemplate` 和超时，不返回 id、名称、描述或 env。模型传给 `coding_agent.start` 的短 `timeoutMs` 不能缩短 launcher 超时，等待结果必须通过 `coding_agent.wait`。同一个 `AgentRuntime.run()` turn 中如果模型调用过 `coding_agent.start`，Runtime 接受最终答复前必须自动对尚未收口的 job 调用 `coding_agent.wait`；只有 wait/cancel 返回 terminal state 才能从 pending 中移除，并且等待结果要作为新的观察消息交回该 Agent，再继续模型循环生成最终答复。
- 改 workspace 注入：AgentRuntime 只在新 Session 的不可压缩 stable system prompt 里指定当前 workspace 一次；后续同一 Session replay 不应因新 hostContext 重写 workspace。
- 改模型调用协议：Provider protocol 或 model provider。
- 改 Engine assignment 的权威上下文：WorkerEngine/AssignmentBuilder，而不是 context budget。

## 别破坏这些

- non-mock CEO 和 worker 都必须走 `AgentRuntime.run()`。
- Dashboard one-on-one chat 可以绕过 TeamEngine intent，但不能绕过 AgentRuntime。
- WorkerEngine 传给 Runtime 的 assignment 要是 Engine 上下文摘要，不能注入 intent/task/artifact 的全量 JSON；大 artifact payload 只给摘要，精确内容通过受审计工具读取。
- WorkerEngine/AssignmentBuilder 的输出契约来自 Agent profile 的 `output.json`，不要在执行代码里按 role 维护 JSON shape 表。
- WorkerEngine 的 blocked intent 诊断入口应进入 CEO AgentRuntime 并提示读取 `blocker-diagnosis` skill；不要把阻塞诊断退化成只由 TeamEngine 拼模板，模板只能作为 runtime/provider 失败时的兜底。
- Provider 请求前的历史消息必须来自 Session；不要重新引入独立上下文拼装器去拼历史。
- `agentConfigSnapshot` 要记录 run 当时的 prompt、skills、MCP、tools、modelProvider、output，以及必要的 launcher 配置摘要，避免历史 run 被新配置污染。
- 缺失 role 的 profile fallback 只能用于只读/测试上下文里的通用内存 profile，不能 import `default-agent-onboarding.js` 或读取默认团队 seed；带真实 `AgentConfigStore` 的 `AgentRuntime.run()` 必须拒绝未配置 role，不能因为一次 routing 命中、one-on-one chat 或 Provider 回合而落 session/memory/trace。写入默认团队走带 `OnboardingStateStore` 的 onboarding，新增员工走 `AgentConfigStore.create()`，修改已有员工才走 `update()`。
- `toolManifestForRun()` 不能用默认 profile seed 补工具授权；没有 profile 时只能从显式传入的 run snapshot/profile 计算工具，或按选项加入隐式 memory tools。`skill` 是所有 Agent 默认可用的 runtime 工具：`AgentConfigStore` 规范化现有和新建 Agent 的 `tools.json` 时要保留它，AgentRuntime 来源的 `skill` 调用即使遇到旧 allowlist 漏配也应进入 `readSkill`，再由已安装 skill 列表决定是否可读。
- WorkerEngine 接入 Runtime 时只能用真实 profile snapshot；缺失配置的只读 snapshot 也必须是 role/name/title 的通用形状，不能从默认团队 seed 补 prompt、tools、display name 或 output contract。CEO 渠道回合的显示身份来自 CEO profile name；没有配置名时使用通用 CEO/CTO 入口。
- Memory 要按语义分层：semantic facts、episodic events、procedural playbooks。`memory.search`、`memory.write` 是隐式 runtime 工具，默认可用但不出现在 Dashboard 可编辑工具列表。
- WorkerEngine 记录 task/intent 的 Agent session binding 时优先用 role key；历史 Agent 名只作为读取旧 session 的 alias，不要把当前显示名当业务主键。非 mock worker run 在调用 AgentRuntime 前必须预分配 `sess_` session id，并立刻写入 run.sessionKey 和实体 `agentSessions[role]`，这样服务进程死在 provider 调用中间时，启动恢复和后续 retry 仍能复用同一个 Agent session。
- `AgentConfigStore.loadRoleDirectoryIndex()` 会被多个 worker/runtime 入口并发调用；重建 role 目录索引时必须先构造局部 Map，检查真实重复 role 后再一次性替换共享 cache。不要在扫描目录过程中清空并逐项写入共享 `roleDirCache`，否则并发 profile 读取会把别的扫描写入误判成重复 role。

## 扩展时

新增 Agent 能力时先判断它是配置，还是运行时行为。可由用户调整的进入 `agent-workspace/agents/<Agent>/`；默认 profile seed 进入 `src/agent-framework/infrastructure/default-agent-onboarding.js`；role prompt/title 内容在 `src/agent-framework/domain/roles.js`；回合执行逻辑进入 `src/agent-framework/application/`。

改完代码后，检查是否需要同步更新 `AGENTS.md` 和本 skill 的 reference。只要改变了 Session、Provider loop、memory、工具协议、trace 或 WorkerEngine 接入的职责边界，就要更新知识。

详细示例只在需要时读：

- `references/agent-turn-flow.md`
- `references/memory-layers.md`
- `references/runtime-extension.md`
