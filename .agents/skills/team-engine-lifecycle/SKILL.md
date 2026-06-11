---
name: team-engine-lifecycle
description: 当修改 ai-team 的 TeamEngine 业务账本、intent/task/run/artifact/operation 生命周期、wake routing、task_graph、QA/rework、block/retry/finalize 或 EngineStore 时使用。
---

# 生命周期：TeamEngine

把 TeamEngine 当成账本看会更准确。它不负责让某个 Agent 显得聪明；它负责记清楚什么工作存在、现在走到哪一步、下一次该由哪个角色消费。

## 因果链

1. CEO 通过 `engine.create_intent` 创建 intent。
2. `tick()` 先消费 `intent/new`，再消费 ready tasks，最后 finalize completed intents。
3. 配置中的 planning worker 产出 `task_graph` artifact，Engine 用 `TaskGraph` 把图落成 tasks 和 dependencies。
4. Task 满足依赖后按 wake rules 找 consumer，进入 worker run。
5. WorkerEngine 写 run/artifact，TeamEngine 根据结果 transition、block、retry 或 finalize。
6. Outbound reply、dashboard read model、WebSocket snapshot 都从 Engine 状态派生。

Scheduler tick 可以重叠触发，TeamEngine 不能用全局 running 锁把所有员工串住。并发安全靠实体级状态认领：`intent/new -> routing`、`task/waiting -> working`、`task/testing -> working`、finalize 的 `intent/in_progress -> routing` 都要通过 `EngineStore.transitionEntity(expectedStatus)` 原子确认，状态不匹配就跳过。Ready task 路由按 consumer role 并行 fan-out：不同 Agent role 可以同时运行，例如 engineer 处理 waiting task 的同时 qa 处理 testing task；调度入口用 active role 集合保证同一个 role 同时只领取一个 task，避免单个员工并发抢多个任务或同一业务实体被重复写入。

`intent/blocked` 如果只是由子 task 阻塞导致（`blocked.phase=task_blocked`），TeamEngine 在 finalize 阶段要重新检查子 task 状态。只要关联 task 已不再 blocked，就先通过 Engine transition 清掉 intent 的 blocked 信息、恢复到 `in_progress`，再继续判断 `all_tasks_done` finalization；不能让已修复 task 的父 intent 永久停在 blocked。

## 什么时候改这里

- 如果改变“实体何时存在、何时变状态、如何恢复”，改 TeamEngine。
- 如果改变“Agent 在一个回合里看到什么 prompt/memory/tools”，改 Agent Framework。
- 如果改变 WorkerEngine 给 Agent 的业务上下文形状，改 `adapters/agent-framework/assignment-builder.js`，并确认它传的是 intent/task/artifact 摘要，不是全量账本 JSON。
- 如果改变“某个角色默认由谁消费”，优先改 Engine routing 配置；源码默认 routing 只在 `src/team-engine/infrastructure/default-team-onboarding.js` 作为首次 onboarding seed 出现，并且调用时必须传入 `OnboardingStateStore`，由 `data/engine/onboarding.json` marker 防止启动时补回被用户删除的默认 routing。不要把默认团队写进 TeamEngine application/domain。默认 Agent profile、工具授权和 output contract 属于 Agent Framework 的 `default-agent-onboarding.js`。
- 如果只是 dashboard 展示方式，优先改 read model，不要新增持久状态。
- 如果改变 project workspace 或业务账本落点，同时检查 `EngineStore` 的全局 `data/engine` 读写和项目 `.engine/` 镜像是否仍然一致。

## 守住的事

- `EngineStore.transitionEntity()` 和 `engine.transition` 是状态变更入口，`operations[]` 是解释历史的依据。
- Project workspace 的 `.engine/` 是项目视角的业务账本镜像；`data/engine/` 仍是控制面索引和兼容读路径。不要只改其中一边的写入规则。
- 删除项目要通过 `EngineStore.deleteProject()` 一次性清理 project 以及相关 intent、task、run、artifact、session、feedback。只有项目 workspace 位于受管 `projectWorkspaceRoot` 下时才删除整个目录；外部 workspace 只清 `.engine/` 镜像，避免把用户真实项目误删。删除后要清理指向不存在 intent/task 的孤儿 feedback，避免旧运行痕迹重新出现在看板。
- `task_graph` 只描述工作分解和依赖，不携带 worker 名、assignee 或 QA 独立任务。
- `task_graph` task 是 role-agnostic 的，默认 worker routing 不按标题或描述做内容过滤。`engineer` 是 `task/waiting` 的兜底消费者；`operations` 只消费显式带对应 `consumerRole` 的 waiting task，并通过 routing priority 排在 engineer 前面。`customer_success` 默认不配置 wake rule，只有用户显式添加 routing 后才会参与 Engine task 消费。旧的 `consumerRole`-only engineer 默认路由会让新 task 停在 `waiting`，默认团队 onboarding 可以把它升级成 engineer waiting 兜底规则；但 onboarding marker 已存在后，缺失的默认 routing 不能被重新 seed。
- Ready task 并行只跨不同 consumer role；同一 role 保持串行领取。修改 `routeReadyTasks()` 时要保留 active role 边界，不要让同一个角色跨重叠 tick 同时跑多个 task；修改实体认领时要保留 `expectedStatus`，不要回到“先 list 后无条件 transition”的重复消费风险。
- Worker run 中如果 Agent 通过 `engine.transition` 显式改变了 task 状态，TeamEngine 收尾只补 run/artifact 关联，不再用 wake rule 的 `afterRunStatus` 覆盖该状态；只有 task 仍处于 `working` 时，才按 `afterRunStatus` 推进。
- TeamEngine 服务启动必须恢复上一进程遗留的 `running` run。启动恢复把 interrupted run 标记为 failed；如果对应 task 仍是 `working`，转成 `blocked`；如果对应 intent 仍是 `routing`，转成 `blocked`。恢复不自动重跑，后续由 retry/继续推进清理 blocker 后再按 routing 创建新 run。只读 Engine CLI（`engine health/intents/tasks/runs`）不能触发这类恢复写入，只有服务启动和 `engine tick` 这类推进入口需要恢复。
- TeamEngine 业务逻辑使用 routing 返回的 role，不使用 Agent 显示名，不持有 `AgentConfigStore`；除 CEO 入口外，application/domain 不应硬编码默认员工。Agent 名称来自 roster/config，只能作为展示、配置目录默认值或历史 alias 兼容。
- WorkerEngine 属于 TeamEngine 到 Agent Framework 的 adapter，不能 import Agent Framework 的默认 profile onboarding seed 或默认显示名；执行时使用 AgentRuntime/AgentConfigStore 给出的真实 profile snapshot，缺失配置的只读 fallback 也只能是通用 role snapshot。CEO 渠道入口的身份文案只读配置好的 CEO profile name，没有配置时使用通用 CEO/CTO 入口。
- `src/team-engine/adapters/agent-framework/default-team-mock-fixture.js` 是默认团队 mock runner 的测试/演示 fixture，不是通用 Agent mock provider；不要把它的角色剧本扩散到 TeamEngine application/domain。
- Worker assignment 只给 AgentRuntime 必要业务摘要：intent/task 保留可执行字段，artifact 只暴露结构化摘要、常见字段和 data keys，大 payload 默认省略；需要精确 artifact 内容时让 Agent 通过受审计工具读取。
- QA rejection 回到同一条 task lineage，让 rework 能继承 task、run、artifact、finding；拒绝验收没有返工次数上限，不能因为 reject 轮次过多自动 blocked。
- QA artifact 的结构化 `verdict` 决定 task 是 done 还是 rework。默认 QA prompt 和 `output.json` 都要求顶层 `verification_report.verdict`；兼容模型输出时，可以按 Agent profile `output.json` 配置从首行 `VERDICT: pass|reject` 兜底提取 verdict，但不要把没有 verdict 的 QA 消息默认为通过，也不要只依赖 message 里的文字判定通过。
- Blocked intent/task 保持原实体可见；retry 是清理 blocker 后继续推进，不是新建替代实体。
- Intent 进入 blocked 后，通知用户前优先通过 WorkerEngine 让 CEO AgentRuntime 使用 `blocker-diagnosis` skill 做只读诊断；TeamEngine 模板 blocker report 只作为 CEO runtime/provider 不可用时的兜底。
- 如果 intent 因某个 task blocked 而 blocked，该 task 后续验证通过时要清掉父 intent 的 blocker，并让 intent 回到 `in_progress`，否则所有 task done 后 finalization 不会运行。
- `replyTarget` 要从 ingress 保留到 finalization，否则系统完成了工作却无法回答原渠道。

## 加能力时

新增生命周期能力时，先写出实体、状态、触发条件、失败恢复和 read model 影响。想清楚这些，再决定要不要动这些地方：

- domain rule：`src/team-engine/domain/`
- orchestration：`src/team-engine/application/team-engine.js`
- persistence：`src/team-engine/infrastructure/engine-store.js`
- Agent assignment：`src/team-engine/adapters/agent-framework/assignment-builder.js`
- output normalization：`provider-output-normalizer.js`

详细示例只在需要时读：

- `references/entity-lifecycle.md`
- `references/task-graph.md`
- `references/new-engine-unit.md`
