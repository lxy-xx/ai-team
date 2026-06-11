---
name: channel-interface
description: 当修改 ai-team 的 ChannelGateway、Feishu ingress、channel config/status APIs、message dedupe、replyTarget、reaction、OutboundReplyService 或 channel-to-CEO delivery 时使用。
---

# 渠道接口

ChannelInterface 只处理传输。它把外部世界的消息、用户、线程、事件、reply target 变成系统内部能理解的输入；业务含义留给 CEO 和 TeamEngine。

## 输入链路

```text
Feishu / CLI / HTTP channel
  -> transport adapter
  -> ChannelGateway.deliverToCeo
  -> TeamEngine.deliverChannelMessageToCeo
  -> CEO AgentRuntime turn
```

## 该改哪一层

- 传输字段、反应、注册、连接状态：Interfaces。
- 是否创建 intent、选择 project、如何回复用户：CEO + Engine tools。
- 工作完成后回复哪个地方：保留 `replyTarget`，由 OutboundReplyService 发送。
- Dashboard 展示 channel 状态：HTTP read model，不是 channel adapter 的业务逻辑。
- Channel config 不保存 bot/CEO 显示名；Feishu 提及过滤使用平台 bot/open/chat ID，CEO 渠道身份显示只来自 Agent profile，缺失时使用通用 CEO/CTO 入口。
- 对外 channel API 和 webhook 统一在 `/ai-team/api/*`；Feishu webhook callback 是 `/ai-team/api/webhooks/feishu`，不要重新使用根 `/webhooks/feishu`。

## 不能弄混的事

- ChannelGateway 不分类工作、不创建 intent、不调用 worker、不注入 repo workspace。
- Feishu ingress 尽量先 reaction 原消息，但 reaction 失败不能阻塞 routing。
- `replyTarget` 要从 ingress 传到 intent/session/finalization。
- dedupe 发生在 delivery 级别，避免同一外部事件创建多个 CEO 回合或多个 intent。
- 不要把 Feishu app credentials、admin token、客户消息明文暴露到 public API、dashboard、docs、tests、logs。

## 接新渠道时

新增渠道时，先实现 transport normalization，再接入 ChannelGateway。不要在新渠道里复制 CEO 判断逻辑；如果业务判断需要变化，改 CEO prompt/Engine tool，而不是改 channel adapter。

详细示例只在需要时读：

- `references/feishu-ingress.md`
- `references/outbound-reply.md`
