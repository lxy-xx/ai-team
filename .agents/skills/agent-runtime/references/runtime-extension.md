# 运行时扩展参考

新增 AgentRuntime context 或 Agent config 时使用。

## 分类

- Profile extension：用户或 dashboard 需要配置，例如 prompt、tools、skills、MCP、modelProvider。
- Session seed extension：创建 session fork 时需要进入长期 replay prefix 的内容，例如 runtime system、Agent prompt、tool protocol text、被选中的长期记忆。
- Turn material extension：只属于当前 turn 的内容，例如 assignment、direct chat 输入、当前检索结果。
- Execution extension：改变 provider loop、tool loop、trace、session 写入。

## 落地原则

可编辑配置放 `agent-workspace/agents/<Agent>/`，源码默认值放 `src/agent-framework/domain/`。如果值会影响历史 run 的可复现性，要进入 `agentConfigSnapshot`。

如果新增 context 可能很长，必须考虑 context budget 和 trace metadata；不要把大块上下文无条件塞进每个回合。

新增上下文时先判断它应该进入哪里：

- 需要长期稳定回放：放进 `AgentSessionFactory` 生成的 fork seed。
- 每轮会变，而且应该追加：作为 current turn material。
- 只是工具 loop 的中间态：放 active loop messages，turn 结束后由 Session event 持久化。
- 已完成的中间历史：交给 Session compression policy，不要在 Runtime 里手写摘要替换。
