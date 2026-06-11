# 飞书入口参考

Feishu 是一个具体 transport，不是业务入口。它的职责是把官方长连接事件稳定转换成 ChannelGateway input。

## 入口语义

- 使用 `FeishuLongConnection` 和官方 long-connection WebSocket flow。
- Ingress 阶段只解析 transport-level fields：消息、用户、会话、事件 id、reply target。
- 尽可能先 reaction 原始消息，给用户即时反馈。
- Reaction 失败只记录，不阻断 routing。
- 不在 Feishu adapter 中判断是否立项、选项目、分配 worker。

## 敏感信息

`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、tenant 信息、原始客户消息都不能进入 public API、dashboard、docs、tests 或普通日志。
