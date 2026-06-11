# 出站回复参考

Outbound reply 的核心是：业务完成由 TeamEngine/CEO 决定，怎么发回原渠道由 Channel adapter 决定。

## ReplyTarget 链路

1. Ingress 规范化 `replyTarget`。
2. CEO 直接回复时，`sendDirectChannelReply` 使用它。
3. 创建 intent 时，把它随 intent/session context 保留下来。
4. Finalization 或失败可见时，OutboundReplyService 用它发送原渠道回复。

## 设计边界

Channel adapter 可以知道 transport-specific send API，但不应该知道 task 是否完成、QA 是否通过、summary 应该怎么写。
