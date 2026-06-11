---
name: dashboard-fe
description: 当修改 ai-team 的 server-rendered dashboard、architecture pages、dashboard read models、WebSocket snapshots、settings/channel UI、one-on-one chat UI 或 responsive frontend behavior 时使用。
---

# 控制台前端

Dashboard 是操作台。它展示 Engine、Agent config、Provider、Channel 的状态，也触发少量受控操作；它不重新发明业务生命周期，也不绕过 ToolExecutor 或 AgentRuntime。

## 数据关系

```text
EngineStore / Agent config / Provider config / Channel config
  -> read models
  -> server-rendered HTML/CSS/JS
  -> focused HTTP actions
  -> WebSocket snapshots
```

## 先看变更类型

- 页面布局、交互、copy：`src/fe/`。
- Dashboard 数据形状：`src/interfaces/http/read-models/`。
- 触发 Engine 操作：HTTP route 调 TeamEngine/Engine tool handler，不直接改 store。
- 项目页展示的是脱敏后的项目投影：卡片只放项目名、状态和业务记录计数，不显示 workspace 路径。删除项目要调用受管理员保护的 Engine project delete API，由 EngineStore 负责级联清理业务记录和受管项目目录。
- one-on-one chat：走 AgentRuntime direct turn，不创建 TeamEngine intent。
- Dashboard 默认 CEO 渠道的读取、发送和 reset 只有在 CEO profile 已存在于 `AgentConfigStore` 时才打开 runtime stores；CEO 未配置时返回空/跳过 reset，不能通过 runtime fallback 创建 `ceo_cto` 或默认显示名目录。
- channel/provider/settings 展示：只展示脱敏后的状态和用户概念。Channel config 不拥有 bot/CEO 显示名，Feishu 设置页不要提供 Bot name 字段。
- 对外页面路径统一在 `/ai-team/console/*`，Dashboard API 和 WebSocket 统一在 `/ai-team/api/*`。页面链接、form action、client fetch/postJson/WebSocket URL 和测试断言都要走这个命名空间，不要重新使用 `/dashboard`、`/architecture` 或根 `/api/*`。
- 员工显示名来自 Agent roster/config；Dashboard read model 和筛选器要用 role 关联状态，再覆盖配置显示名。不要在 UI/read model 里写死具体员工名。同一个 role 的多个 Agent 目录是配置冲突，应由 `AgentConfigStore` 报错；Dashboard 不能靠按默认名或历史名折叠来静默隐藏旧目录。
- Dashboard read model 只展示已配置 Agent 和当前运行中出现的 role，不根据源码默认 roster 补齐员工数量；默认员工要靠 `default-agent-onboarding.js` 写入 profile 后出现。
- 总览里的“正在工作的员工”只展示真实 `running`/`queued` run；task owner、claimed role 或 testing/deploying task 只能作为卡片参与人/负责人展示，不能补进 working rail。
- 总览里的“正在工作的员工”卡片应打开对应 run 的 live detail，不切换业务状态。live detail 复用 `/ai-team/api/engine/runs/:id/detail` 和 WebSocket snapshot 更新，展示 LLM 轮次、context messages、模型输出、实际工具执行 input/output、错误和 Provider streaming delta；不要新建第二套 Agent 状态机。
- 看板卡片的工作主题分类是 Dashboard taxonomy，不是 Agent roster；不要把 `Infra/Agent/CRM/UI/Operations` 这类 topic 当成当前员工列表。员工列表、筛选和 owner 展示应从 Agent config/routing 投影得到。
- 看板 Intent 和 Task 可以用轻量背景深浅、边框和纸面纹理做区分，但不要重新引入左侧彩色竖条；回形针与纸张质感属于卡片样式的一部分，调整时保持内容空间和响应式可读性。
- 员工编辑页的 Memory 是 Agent memory 的只读投影，用来展示 semantic facts、procedural playbooks、episodic summaries、open context needs；写入和整理仍走 Agent Framework/memory tools。
- 总览里的“员工上下文请求”只展示仍然能对应到未完成 Engine task/intent 的 open context need。项目删除后，指向已删除 task/intent 的请求可以留在 Agent memory 历史里，但不能继续作为当前待处理事项露出。
- Evidence/Owner attention 里展示验证和返工时用 Verification/验收这类阶段概念，不把页面文案绑死为 QA。`qa_loop`、`qa_watch`、`qaRejects` 等旧 key 可以作为兼容数据字段保留。
- 运行详情里的 context messages 是给人看的 Provider 请求投影，可以合并相邻同 role 消息来表达 system prompt bundle。若消息内已经包含 `tool.protocol` 文本协议，不要再把同一批 `submittedTools` 展示成“上下文 tools”；原始 tools 留在 request 审计数据里。
- 运行详情既要展示模型请求的 tool calls，也要展示 AgentRuntime trace 里 ToolExecutor 的实际 tool execution input/output。前者说明模型想做什么，后者才是外部动作证据。
- 多轮 LLM 运行详情默认只展开最后一轮，前面轮次收起。展示层用“当前轮次 submitted text 是否以前一轮 submitted text 开头”判断 prefix 是否连续；不连续时把该轮标红，帮助定位 prefix cache 失效或上下文重组问题。
- 员工 routing 编辑器里，唤醒状态和成功后状态都是 Engine entity status，应使用同一组按 entityType 切换的下拉选项；不要把 `afterRunStatus` 做成自由输入。

## 界面不能做的事

- Dashboard 是 projection，不是第二套业务状态机。
- 不把 credentials、admin token、raw provider secrets、客户敏感内容渲染给前端。
- Retry blocked work 调 TeamEngine retry 入口，不创建 replacement intent。
- skill install 只能执行受限 `npx skills ...`，并限制在目标 Agent folder。
- 保持自包含 server-rendered HTML/CSS/JS，除非明确决定引入 frontend framework。

## 做新界面时

先判断新 UI 是“展示状态”还是“触发操作”。展示状态先做 read model；触发操作先确认后端边界和权限，再做 UI。可见 UI 改动后必须在浏览器尺寸 viewport 检查滚动、重叠、挤压、裁切和响应式。

详细示例只在需要时读：

- `references/read-models.md`
- `references/ui-verification.md`
