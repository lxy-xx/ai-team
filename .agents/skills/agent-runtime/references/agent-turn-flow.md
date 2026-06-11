# 智能体回合流参考

三个入口共享一个原则：入口可以不同，Agent 回合容器必须相同。

## Provider 上下文组织

`AgentRuntime` 不直接拼完整 Provider 历史。它只负责解析 profile、读取记忆、生成 tool manifest，并把本轮需要追加的 material 交给 Session。

新 session 的第一轮会先 fork：

1. `AgentSessionFactory` 生成 runtime system、Agent prompt、工具协议、被选中的长期记忆、open context needs、recent summary 和当前 assignment。
2. Runtime 把稳定 seed 写入 Session fork。
3. Provider 消息从 Session 渲染出来，再追加当前 turn 消息。

已有 session 的后续轮次：

1. Session 提供已有 replay prefix。
2. Runtime 只追加本轮当前 user/assignment material。
3. 如果模型调用工具，assistant tool call 和 tool result 作为 active loop messages 临时追加到下一次 Provider 请求。
4. turn 结束后，输入、输出、工具结果和 tool call replay 写入 Session events，Session 重建下次使用的 prefix。

除压缩外，已经进入 Session 的消息不应被改写。压缩只处理中间历史；第一轮用户 query 和当前最后一轮用户 query 要保留原文。

## 渠道回合：CEO

`ChannelGateway.deliverToCeo` 规范化 inbound transport，并把 CEO turn 交给 TeamEngine。WorkerEngine 通过 AgentRuntime 运行 CEO。CEO 要么自然回复，要么调用 `engine.create_intent`。

这个回合的特殊点是：它面对的是对话，不是已经确定的任务单，所以 prompt 要包含立项原则和可用工具，而不是 assignment output contract。

## 工作回合：Worker Assignment

TeamEngine 根据 routing rules 唤醒 worker，WorkerEngine 构建 assignment。assignment 里的 intent、task、previous artifacts、output contract 是权威上下文，不应被 context budget 摘掉。

WorkerEngine 负责写 Engine run 和 artifact；AgentRuntime 负责这一次 Agent 怎么思考和调用工具。

## 直接回合：One-on-One

Dashboard one-on-one chat 绕过 TeamEngine intent creation，但不绕过 AgentRuntime。它仍然加载 Agent config、tools、memory、Provider choice、sessions、traces。

不要把 one-on-one chat 当作业务工作流；如果用户在 direct chat 中要求立项，应通过 CEO/Engine 工具进入 TeamEngine。
