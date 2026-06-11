# 项目：AI Team Agent

AI Team Agent 运行一支纯 AI 团队，但它的重点不在“把消息转给某个 Agent”。重点在账本。外部消息先到 CEO，由 CEO 判断要不要立项；一旦立项，TeamEngine 会把事情落成 project、intent、task、run、artifact、operation。Agent Framework 管每一次 Agent 回合里的 prompt、memory、tools、Provider 和 trace。文件、shell、模型调用、渠道回复这些会影响外部世界的动作，都要经过工具策略和审计。

换句话说，用户可以随口说一句“帮我处理下这个问题”，系统内部不能也这么随口。它得知道这件事属于哪个项目、现在卡在哪一步、谁处理过、留下了什么结果，以及失败后怎么接着来。

## 命令

- 安装：`npm install`
- 开发服务：`npm run dev`
- 启动服务：`npm start`
- 单次任务：`npm run once -- "task text"`
- Engine CLI：`node src/index.js engine health|tick|intents|tasks|runs`
- 测试：`npm test`
- 语法检查：`node --check path/to/file.js`

## 模块索引

```text
.
├── src/
│   ├── index.js                         # CLI 入口：server、once、engine、channel 命令
│   ├── system.js                        # 组合根：把 Engine、Runtime、Tools、Channels、HTTP 组装到一起
│   ├── team-engine/
│   │   ├── domain/                      # Engine 实体、状态、任务图和验证结果规则
│   │   ├── application/                 # TeamEngine 编排：立项、tick、routing、阻塞、重试、finalize
│   │   ├── infrastructure/              # EngineStore、EngineBus、routing store、JSON 持久化
│   │   └── adapters/agent-framework/    # WorkerEngine、assignment、Engine tools、输出规范化
│   ├── agent-framework/
│   │   ├── application/                 # AgentRuntime、ToolExecutor、memory manager、direct chat
│   │   ├── domain/                      # roles、context budget、memory、tool policy、provider protocol
│   │   └── infrastructure/              # Agent config/state、memory store、Provider、Codex tool、MCP discovery
│   ├── interfaces/
│   │   ├── cli/                         # CLI 展示和命令入口
│   │   ├── http/                        # HTTP routes、dashboard read models、WebSocket
│   │   ├── channels/                    # ChannelGateway、Feishu、outbound replies
│   │   └── scheduler/                   # 周期性 tick
│   ├── fe/
│   │   ├── dashboard/                   # 自包含服务端渲染 dashboard
│   │   └── architecture/                # 自包含架构页面
│   └── platform/                        # JSON、path、id、time/env/config、logging 等共享工具
├── agent-workspace/
│   ├── agents/<Agent>/                  # 运行时 Agent 配置：prompt、tools、output contract、skills、MCP、memory、traces
│   └── framework/
│       ├── providers/                   # Provider 注册、凭据和 health 文件
│       └── coding-agents/               # Coding Agent launcher 运行时配置
├── .agents/skills/                      # 项目级模块知识
├── data/engine/                         # 生成的运行时状态，不是源码 fixture
└── test/                                # Node test suites
```

## 架构主线

| 层 | 它关心的问题 | 关键模块 |
| --- | --- | --- |
| Interfaces | 外部世界怎么进入系统，系统怎么被观察和操作？ | `src/interfaces/`、`src/fe/` |
| TeamEngine | 什么算一件工作，它处于什么状态，下一步谁来消费？ | `team-engine/` |
| Agent Framework | 一个 Agent 回合如何拿到角色、记忆、工具、模型，并留下 trace？ | `agent-framework/` |

`src/platform/` 是横向工具库，不参与业务因果。Provider runners 也不用单独抬成一层，它们属于 Agent Framework。

## 核心模型

### 1. 输入先到 CEO，不直接变工作

渠道消息只是一段外部输入。`ChannelGateway` 把它交给 CEO，不分类、不建 intent、不调 worker，也不替业务选择 workspace。CEO 在 AgentRuntime 中运行，然后做一个明确选择：直接回复，或者调用 `engine.create_intent` 把它写进 Engine。

Channel config 不保存 bot/CEO 显示名。Feishu 连接和提及过滤只使用平台 ID/凭据；CEO 渠道回合里的显示身份只来自已配置的 CEO Agent profile name，缺失时使用通用 CEO/CTO 入口。

### 2. TeamEngine 记账，也推进状态

创建 intent 之后，系统就有了一条可追踪的业务线。intent 描述目标，task 描述可执行步骤，run 描述某次 Agent 执行，artifact 保存结构化产物，operation 说明状态为什么变了。Dashboard、scheduler、outbound reply、retry 都要能从这些记录讲通。

Project workspace 下的 `.engine/` 保存项目视角的业务账本镜像：project、intent、task、run、artifact 会随 EngineStore 写入同步落到这里。`data/engine/` 仍然是控制面索引和兼容读路径；以后如果要把项目 `.engine` 提升为唯一事实源，需要同时重做 read model、恢复和跨项目索引。

### 3. 团队拓扑来自配置

哪个 Agent 消费哪个 entity/status，由 Engine-owned routing 配置决定。默认启动时 `default-team-onboarding.js` 在传入 `OnboardingStateStore` 后一次性把初始 wake rules 写到 `data/engine/routing/<role>.json`；历史 `agent-workspace/agents/<Agent>/.agents/routing.json` 只作为迁移输入。TeamEngine 只理解 entity、status、dependency、condition 和 consumer role，不持有 `AgentConfigStore`。当前默认团队只是这套配置的一个实例，不是写死在 Engine 里的组织结构。

`product_manager` 产出的 task 不写 `consumerRole`。默认 worker routing 不按标题或描述做内容过滤：`engineer` 是 `task/waiting` 的兜底消费者；`operations` 只消费显式带对应 `consumerRole` 的 waiting task，并通过 routing priority 排在 engineer 前面，避免显式指派被兜底规则抢走。`customer_success` 默认不配置 wake rule，只有用户显式添加 routing 后才会参与 Engine task 消费。历史版本里 `consumerRole`-only 的 engineer 默认 routing 会让 role-agnostic task 一直停在 `waiting`；启动时要把这个旧默认规则升级成 engineer 的 waiting 兜底规则。

Scheduler 可以发起重叠 tick，TeamEngine 不用全局 running 锁串住所有员工。并发安全靠实体级状态认领：`intent/new -> routing`、`task/waiting -> working`、`task/testing -> working`、finalize 的 `intent/in_progress -> routing` 都要通过 `EngineStore.transitionEntity(expectedStatus)` 原子确认，状态不匹配就跳过。Ready task 路由允许不同 consumer role 并行运行；调度入口用 active role 集合保证同一个 role 同时只领取一个 task，避免同一员工并发抢多个任务或同一个业务实体被重复写入。`intent/new` 规划仍先产出 task graph，随后 ready task 路由按 role fan-out，finalize 在任务推进后再判断。

### 4. Agent 回合只走一条 runtime

CEO 渠道回合、worker assignment、Dashboard one-on-one chat 都走 AgentRuntime。这样 role prompt、runtime config、skills、MCP、memory、tool manifest、Provider、session、trace、context budget 才不会因为入口不同而分叉。Dashboard one-on-one 可以不创建 TeamEngine intent，但不能自己拼 prompt 或直接调 Provider。

### 5. Session 是模型上下文的权威来源

Session 是 Agent 记忆在一次会话里的 fork。AgentRuntime 首次创建 session 时写入由 runtime 组织好的 system prompt、Agent prompt、工具协议和被选中的记忆；后续每一轮只追加当前 turn 和工具 loop 产生的新消息。Provider 请求前的消息必须从 Session 渲染，不能由入口侧重新拼接历史。除了明确的 session 压缩外，已经进入 session 的内容要原样回放，以便满足 prefix cache。

Agent 已安装 Skill 的 `name` 和 `description` 作为独立的 stable system block `skills.metadata` 进入新 Session seed；Skill 正文不进 seed，需要时由 Agent 调 `skill` 工具读取。`skill` 工具说明保持通用读取能力，不在 tool description 或参数枚举里重复列出已安装 Skill。

Session 内部可以保留多个 context block 作为预算、压缩和调试元数据；但提交给 Provider 的 seed 应表现为一个连续的 system prompt bundle，而不是一串离散的 system messages。工具文本协议如果已经进入 `tool.protocol`，Dashboard 运行详情不再把同一份 tool schema 重复展示成“上下文 tools”；原始 `submittedTools` 只作为 request 审计数据保留。Worker run 在调用 AgentRuntime 前必须预分配 `agentTraceId` 并写入 run，AgentRuntime 在 seed/context 确定、每次 Provider 回合结束、Provider delta 到达和工具结果返回时都要 best-effort 写 live trace，让 Dashboard 可以在 run 仍然 `running` 时展示当前对话、工具入参/出参和流式输出。

压缩也归 Session 管：第一轮用户 query 以及它之前的 seed 内容不压缩，当前最后一轮用户 query 不压缩，中间已完成的历史可以通过 AgentRuntime 注入的 Provider 摘要回调压成 system summary，再由 Session 重建 replay prefix。

### 6. Harness 用来调优 Agent

这里的 Harness 指 Agent 的调优与观测工具，不只是工具执行器。记忆是 Agent 的组件，不是 Harness 的一部分；Harness 记录的是 memory action、session、trace、log、ToolAuditLog、provider health、tool results 等运行证据。它们让我们知道 Agent 看到了什么、调用了什么、为什么失败、下次应该怎么调。ToolExecutor 是 Harness 的执行臂，负责把 Bash、Engine transition、channel reply 这些会影响外部世界的工具请求落地并审计。Provider 只管模型后端，不能顺手执行 Bash、写 workspace 或修改 Engine state。

内置本地执行工具分三类：`Bash` 负责同步命令，覆盖文件读写、命令、测试和日志检查；`async_bash.start/status/wait/cancel` 负责后台命令，`start` 返回 job id，`status` 默认返回日志 tail 并支持 `logMode=full`、cursor 和行号范围读取完整日志，`wait` 可等待一个或多个 job，`cancel` 只能取消明确指定的 job 或显式 `state=running` 的运行中 job；`coding_agent.start/status/wait/cancel` 是面向工程派发的异步封装，根据全局唯一的 `agent-workspace/framework/coding-agents/launchers.json` launcher 配置启动 Coding Agent，并复用同一套 job 状态和日志读取能力。launcher 是运行时配置，由 `CodingAgentLauncherStore` 读写；Dashboard/API 的公开面只展示一条 `commandTemplate` 和超时，不展示 id、名称、描述或 env；模型传给 `coding_agent.start` 的 `timeoutMs` 只能延长 launcher 超时，不能缩短它，等待结果应走 `coding_agent.wait`。它们不做命令白名单或 workspace 越界限制，只要求显式 role 授权和 ToolAuditLog 记录。服务启动时要初始化 async job manager，将上一进程遗留的 `running`/`queued` job 标记为 interrupted，避免后台任务状态永久挂起。当前 workspace 地址由 AgentRuntime 在新 Session 的不可压缩 stable system prompt 里指定一次，后续 replay 不应重新注入新的 workspace。异步后台执行默认并发上限是每 role 8 个、全局 32 个，可用 `AI_TEAM_ASYNC_BASH_MAX_RUNNING_PER_ROLE` 和 `AI_TEAM_ASYNC_BASH_MAX_RUNNING_GLOBAL` 调整；当前默认团队只给 Ada 显式授权 `coding_agent.*`，用于按 Coding Agent skill 并行派发和收口工程子任务。同一个 AgentRuntime turn 里只要调用过 `coding_agent.start`，Runtime 在接受该 Agent 最终答复前会对尚未收口的 Coding Agent job 强制执行 `coding_agent.wait`，只有 wait/cancel 返回 terminal state 才算收口；等待结果会作为新的观察消息交回同一个 Agent，再由 Agent 产出最终答复。默认 onboarding 允许知道默认 Coding Agent launcher 是 Codex CLI，但 Ada 的 prompt 和 skill 只认识 Coding Agent，不暴露具体 CLI。

`mock` model provider 是 Agent Framework 的内部运行时 provider，只在 `AI_TEAM_RUNNER=mock` 或显式 `AI_TEAM_PROVIDER=mock` 时供 `ProviderConfigStore.resolve()` 使用；Dashboard/API 的公共 Provider 列表和 health map 不展示它，用户也不能创建或设为公共默认 Provider。

工具没有单独审批流：Agent profile 已授权的工具可以直接执行，未授权的工具不能执行。`ToolRegistry` 只登记工具定义和 handler，不自带默认岗位授权；默认团队的工具授权由 `default-agent-onboarding.js` 写入各 Agent profile。`ToolExecutor.invoke` 必须由调用方显式传入 role，不能把漏传身份的调用默认记到 CEO 名下；HTTP/API 暴露的工具调用也必须拒绝缺失 role 的请求，而不是替调用方补成 CEO。`memory.search`、`memory.write` 是隐式 runtime 工具，默认可用但不作为可编辑工具显示在 Dashboard/API 的公共配置面；`skill` 是所有 Agent 默认可用的 runtime 工具，现有和新建 Agent 的 `tools.json` 都应保留它，AgentRuntime 来源的 `skill` 调用不能因为旧 role allowlist 漏配而被拒。MCP 工具相反，必须显式进入 Agent profile 的 `tools` 才能由 ToolExecutor 执行。普通工具失败要作为 failed tool result 回到 Provider loop，让 Agent 有机会恢复；403 授权/策略错误属于不可恢复配置问题，应让 AgentRuntime 立刻失败，由 WorkerEngine/TeamEngine 记录 failed run 并阻塞对应实体。

WorkerEngine 给 AgentRuntime 的 assignment 是当前业务上下文摘要，不是 Engine intent/task/artifact 的全量 JSON。artifact 大 payload 默认省略；如果 Agent 需要精确内容，应通过受审计工具读取。

### 7. Project 把记忆和 workspace 绑在一起

每个 intent 都要关联 Engine project。项目同时划定中期记忆和 workspace。业务项目 workspace 默认在 `~/ai-team/${project-name}`；`AI_TEAM_WORKSPACE` 只是控制面/仓库 fallback，别拿它当业务项目的默认目录。

项目 workspace 的 `.engine/` 放项目内业务账本镜像，不放 Agent 长期记忆或 Harness 观测记录。Agent 记忆仍属于 Agent Framework，Harness 记录仍用于调优和审计。

Dashboard 的“项目”页展示的是项目级读模型，不显示本地路径。删除项目必须走 TeamEngine/EngineStore 的项目删除入口：删除 project 以及相关 intent、task、run、artifact、session、feedback 等业务记录；只有 workspace 位于受管 project workspace root 下时才删除整个项目目录，否则只清理该 workspace 下的 `.engine/` 镜像，避免误删外部目录。

如果历史数据里已经出现指向不存在 intent/task 的 feedback 或上下文请求，Dashboard 不应继续把它们当成当前业务事项展示。EngineStore 负责清理孤儿 feedback；Agent memory 里的 context need 仍保留为历史记忆，但 read model 只把仍能对应到未完成 Engine 实体的问题列为“员工上下文请求”。

Dashboard 总览里的“正在工作的员工”只展示真实 `running`/`queued` run。Task 的 `claimedByRole`、owner、参与人和 testing/deploying 状态属于卡片投影，不能补进 working rail，否则会把 QA 正在验证和工程 owner 误看成两个 Agent 同时执行同一个 Task。工作中员工卡片应能打开对应 run 的 live detail，复用 `/ai-team/api/engine/runs/:id/detail` 和 WebSocket snapshot 刷新，展示 LLM 轮次、上下文、模型输出、实际工具执行 input/output、错误和 Provider 流式文本。

## 工作流

```text
外部渠道消息
  -> ChannelGateway.deliverToCeo
  -> TeamEngine.deliverChannelMessageToCeo
  -> WorkerEngine.runChannelMessage
  -> AgentRuntime.run(CEO)
  -> CEO 直接 channel.reply 或 engine.create_intent
  -> TeamEngine.tick
  -> routingStore 读取 wake rules
  -> WorkerEngine 构建 assignment
  -> AgentRuntime.run(worker)
  -> Provider 返回文本/工具调用
  -> ToolExecutor 执行允许的工具，并把结果写入 Harness 记录
  -> WorkerEngine 规范化输出并写入 run/artifact
  -> TeamEngine transition/finalize/retry/block
  -> OutboundReplyService 在需要时回复原渠道
```

## 默认运行时团队

下面是当前仓库自带的默认团队 onboarding seed。`src/agent-framework/infrastructure/default-agent-onboarding.js` 一次性写入默认 Agent profile，包括显示名、prompt、tools、skills 和 `output.json`；skills 只使用 `SKILL.md` 的 frontmatter `name`/`description` 和正文，不再维护 `skill.json`。`skill` 作为默认 runtime 工具由 `AgentConfigStore` 规范化进所有现有和新建 Agent 的工具配置，不依赖某个默认员工。`src/team-engine/infrastructure/default-team-onboarding.js` 一次性把默认 wake rules 写入 `data/engine/routing/<role>.json`。这两个 onboarding API 都必须显式传入 `OnboardingStateStore`，系统用 `src/platform/onboarding-state-store.js` 在 `data/engine/onboarding.json` 记录默认 seed 是否已完成；首次之后即使用户删除某个默认员工或 routing，启动也不会补回。后续运行期 `AgentConfigStore` 只列出现有 Agent 目录，`AgentConfigStore.get()`/`getExisting()` 不创建缺失目录；`AgentRuntime.run()` 带真实 `AgentConfigStore` 时不会运行未配置 role。需要初始化默认团队必须显式调用 onboarding，需要新增员工必须走 `create()`，修改已有员工才走 `update()`。`EngineRoutingStore` 只读持久化 routing 配置，不在代码里动态合成默认员工。`AgentRuntime`、`WorkerEngine` 和 Dashboard 只读入口不能 import 默认 profile seed 或默认显示名作为运行时兜底；无配置 store 的测试/只读 fallback 只能返回通用内存 profile，Dashboard 默认 CEO 渠道也只有在 CEO profile 已配置时才打开对应 runtime stores。历史 `agent-workspace/agents/<Agent>/.agents/routing.json` 只作为迁移输入。Agent 名称只是显示名和配置目录默认值；业务逻辑、session 绑定和 artifact contract 应使用 role。同一个 role 同时存在多个 Agent 目录是配置冲突，`AgentConfigStore` 必须报错，不按默认名或历史名折叠，也不能让 Dashboard 静默隐藏旧目录。

| Role | 当前默认显示名 | 默认唤醒条件 | 默认完成后状态 |
| --- | --- | --- | --- |
| `product_manager` | Darwin | `intent/new` | `intent/in_progress` |
| `engineer` | Ada | `task/waiting` | `task/testing` |
| `qa` | Turing | `task/testing` | `task/done` |
| `customer_success` | Bell | 无默认唤醒规则 | 无 |
| `operations` | Ford | `task/waiting` 且 `consumerRole=operations` | `task/done` |
| `ceo_cto` | Franklin | `intent/in_progress` 且 `condition=all_tasks_done` | `intent/done` |

默认 routing seed 带有优先级，避免显式 `consumerRole` 规则被 `engineer` 兜底规则抢走。自定义 wake rules 保存后仍属于配置，不应让 TeamEngine application/domain 重新理解默认员工。Worker run 中如果 Agent 通过 `engine.transition` 显式改变了 task 状态，TeamEngine 收尾只补 run/artifact 关联，不再用 wake rule 的 `afterRunStatus` 覆盖该状态；只有 task 仍处于 `working` 时，才按 `afterRunStatus` 推进。

默认 `product_manager` 的 `output.json` 约定产出 `task_graph`，并通过默认 skill `task-graph-contract` 约束如何拆任务图；任务图规则不要写进 role prompt，也不要在 TeamEngine 里感知默认员工。默认 `qa` 的 prompt 和 `output.json` 都要求顶层 `verification_report.verdict`，不能只把 `VERDICT: pass|reject` 写进 message；TeamEngine 只用结构化 verdict 判定通过或返工。QA/rework 应留在同一条 task lineage 上，拒绝验收只让 task 回到 `waiting` 继续返工，不设置返工次数上限，也不创建脱离原图的独立任务。AssignmentBuilder 和 ProviderOutputNormalizer 读取 Agent profile 的 output 配置，不应在执行代码里维护岗位契约表。

如果 intent 被阻塞只是因为子 task 阻塞（`blocked.phase=task_blocked`），TeamEngine finalize 阶段要重新检查关联 task。只要子 task 已不再 blocked，就先把父 intent 从 `blocked` 恢复到 `in_progress` 并清掉 blocked 元数据，再继续按 `all_tasks_done` 规则收口，避免 task 已修复但父 intent 永久卡住。

默认 `ceo_cto` 带有 `blocker-diagnosis` skill。Intent 阻塞通知优先通过 WorkerEngine 进入 CEO AgentRuntime，让 CEO 按该 skill 只读定位当前 ai-team 控制仓库和 Engine/runtime 记录，再回复真实原因；如果 CEO runtime 或 provider 失败，TeamEngine 才退回模板 blocker report。仓库路径不能写死，应通过当前工作目录、`AI_TEAM_CONTROL_WORKSPACE`、`AI_TEAM_WORKSPACE` 或向上查找项目标记动态确认。

`mock` runner 下的 TeamEngine 示例输出来自 `src/team-engine/adapters/agent-framework/default-team-mock-fixture.js`，它只是默认团队的测试/演示剧本，不代表 Agent Framework 的通用 mock provider。通用 Provider mock 属于 Agent Framework provider runner。

## 设计原则

- 先问“这是谁的事实”。传输事实放 Interfaces，业务事实放 TeamEngine，Agent 回合事实放 Agent Framework，调优证据放 Harness 记录。
- 不要为了省事绕过因果链。绕过 Engine transition、AgentRuntime 或 ToolExecutor，短期看起来快，后面恢复、审计、重试、dashboard 解释都会变麻烦。
- 配置可以换，边界别动。Agent 名称、wake rules、tools、Provider 都可以变；ChannelGateway 只入 CEO、TeamEngine 管业务状态、AgentRuntime 管 Agent 回合。除 CEO 入口外，TeamEngine 运行期不应硬编码默认员工，只通过 routing 配置得到 consumer role。
- Agent 名称不能成为业务 key。默认 profile seed 在 `src/agent-framework/infrastructure/default-agent-onboarding.js`，运行时配置可以覆盖显示名；TeamEngine routing、session binding、artifact kind 和 dashboard read model 应按 role 工作，不按显示名做业务判断。
- 状态流转要能复盘。行为变更后运行 `npm test`；修改 JS 且语法覆盖不明显时运行 `node --check path/to/file.js`。
- Agent 不能把没有工具证据的事情写成事实。声称写过文件、跑过测试、遇到权限失败或完成交付，都要能在 session、trace 或 ToolAuditLog 里找到对应证据。
- 服务启动时要恢复上一进程遗留的 `running` run：TeamEngine 初始化会把被服务中断的 run 标记为 failed，并把仍处于 `working`/`routing` 的实体阻塞。只读 Engine CLI（`engine health/intents/tasks/runs`）不能触发这类恢复写入；`engine tick` 和服务启动仍要恢复。WorkerEngine 在调用 AgentRuntime 前就预分配并写入 task/intent 的 Agent session 绑定，避免进程死在 provider 调用中间时丢失后续 retry 的上下文接续点。
- 代码变更结束前，要检查这次变更是否改变了项目认知：架构边界、模块职责、启动/测试命令、运行时约定、扩展示例。如果改变了，同步更新 `AGENTS.md` 和 `.agents/skills/` 下对应的知识类 Skill；如果没有改变，在最终说明里简单交代已检查。
- 运行时状态不是源码默认值。`agent-workspace/` 和 `data/` 是运行时状态；默认 Agent profile seed 在 `src/agent-framework/infrastructure/default-agent-onboarding.js`，默认 routing seed 在 `src/team-engine/infrastructure/default-team-onboarding.js`，两者都必须通过 `OnboardingStateStore` 记录在 `data/engine/onboarding.json` 后才执行。`roles.js` 只保存默认 prompt/title 内容，`tool-registry.js` 只保存工具定义，不保存默认岗位授权；application/runtime/adapter 代码不能把默认 onboarding seed 当缺省配置读取。
- 敏感信息别进公共面。Dashboard APIs、channel APIs、README、tests、logs 里不要暴露 admin values、Feishu credentials、customer messages、本地 credentials。
- 扩张外部能力前先确认。生产依赖、frontend framework、public API 语义变化、外部 database/queue、宽泛 shell/workspace 权限，都先问清楚设计意图。

## 约定

- 使用 ESM imports，并尽量使用 Node.js built-ins。
- 优先使用 `src/platform/json-file.js` 的结构化 JSON store 和辅助函数。
- 搜索文件和文本时使用 `rg` 或 `rg --files`。
- 对外 HTTP 路径必须带产品命名空间：页面放在 `/ai-team/console/*`，API、WebSocket、webhook 和兼容 task/feedback shape 放在 `/ai-team/api/*`。新增路由优先使用 `src/platform/http-paths.js`，不要重新开放根路径 `/dashboard`、`/api/*`、`/tasks` 或 `/feedback`。
- Dashboard 和 architecture pages 保持自包含服务端渲染 HTML/CSS/JS，除非项目明确决定引入 frontend framework。
- Dashboard UI 改动后，用浏览器尺寸 viewport 检查滚动、重叠、控件挤压和响应式可读性。
