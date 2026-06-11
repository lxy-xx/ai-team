# 新增工具示例

只有新增 Agent-visible tool 时使用。

## 落地顺序

1. 在 `tool-registry.js` 定义 id、category、description、risk、parameters。
2. 在 ToolExecutor 注册 handler，并把所有外部动作收口在 handler 里。
3. 把需要授权的 Agent profile `tools.json` 加上该 tool id；如果是默认团队能力，同步 `default-agent-onboarding.js`。
4. 如果工具需要 workspace，使用统一 workspace resolution，不自己拼路径。
5. 确认 ToolRegistry 只保存定义/handler，不引入默认岗位授权。
6. 覆盖 success、denied、invalid input、audit、path safety。

## 归属判断

Engine 状态变化优先做成 Engine tool；模型后端适配留给 Provider；用户授权的外部动作才是 ToolExecutor tool。
