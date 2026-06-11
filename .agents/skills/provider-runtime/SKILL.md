---
name: provider-runtime
description: 当修改 ai-team 的 Provider 配置、Codex app-server、OpenAI-compatible runner、mock runner、Provider tool protocol、output normalization、Provider health 或 runner boundary 时使用。
---

# 模型提供方运行时

ProviderRuntime 是 Agent Framework 里的模型适配部分。它只处理模型怎么调用、结果怎么归一；任务怎么推进、工具怎么执行、Engine 状态怎么变，都不在这里做。

## 调用关系

```text
AgentRuntime
  -> resolveProviderSelection(profile.modelProvider)
  -> provider.complete / provider.runAgentTurn
  -> ProviderToolProtocol normalize tool calls
  -> AgentRuntime 把工具调用交给 ToolExecutor
```

WorkerEngine 会把 AgentRuntime 的结果再交给 `ProviderOutputNormalizer`，转成 Engine artifact 所需的结构化输出。

## 先分清边界

- 模型 API、runner、health、credential persistence：Provider subsystem。
- Provider 返回 tool call 的协议差异：ProviderToolProtocol。
- worker artifact 结构：`provider-output-normalizer.js`。
- 工具执行：ToolExecutor，不是 Provider。
- Engine 生命周期：TeamEngine，不是 Provider。

## 不要越界

- Provider 不调用 `Bash`，不写 workspace，不修改 Engine state。
- `codex_app_server` 是 subscription Provider runner，不是本地执行工具；本地文件、命令、测试和日志动作都必须由 AgentRuntime 交给 ToolExecutor 的 `Bash`。
- Dashboard copy 展示 `Subscription`、`API Key` 等用户概念，不展示内部 runner id。
- Mock runner 只隔离模型执行，不改变 TeamEngine 状态语义。
- `mock` model provider 是内部运行时 provider；`resolve()` 可以在 mock 模式使用它，但 Dashboard/API 的公共 provider list、health map 和用户配置写入都不能暴露或接受它。
- Provider errors 要结构化、可脱敏、可写 trace。

## 新增 Provider 时

新增 Provider 时，先定义它如何保存配置、如何做 health、如何选择 model、如何表达 tool calls、如何归一 final text 和 usage。再补 runner-boundary 测试，确认它没有绕过 AgentRuntime 或 ToolExecutor。

详细示例只在需要时读：

- `references/provider-extension.md`
- `references/output-normalization.md`
