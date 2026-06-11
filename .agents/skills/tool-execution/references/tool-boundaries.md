# 工具边界参考

新增或修改工具时，先把它当作 Harness 的执行能力设计，而不是一个普通函数。

## 设计问题

- 调用者是谁：AgentRuntime、HTTP route、CLI，还是系统内部？
- 授权依据是什么：Agent profile `tools`、tool policy、显式用户操作，还是 Engine 状态？
- 它触碰什么边界：workspace、shell、model、memory、channel、Engine lifecycle？
- 它如何限制输入：schema、path safety、command allowlist、secret redaction？
- 它如何审计：caller、role、agentName、sessionId、traceId、taskId、hostContextKeys、status、redacted input/output。
- 它给调优留下什么证据：trace.toolCalls、ToolAuditLog、session turn、memory action、Engine run metadata。

## 返回语义

工具结果应该让 Agent 能继续推理，但不能泄露敏感值。失败时尽量返回可处理的 error class 或 message；真正异常仍由 ToolExecutor 写入 `error.toolResult` 和 audit log。
