# 模型提供方扩展参考

只有新增 Provider runner 或大幅修改已有 runner 时使用。

## 设计问题

- 配置在哪里保存，哪些字段是 secret？
- health 如何判断，失败如何展示给 dashboard？
- Provider 是否支持 tool calls？如果支持，如何转换成统一 tool protocol？
- final text、usage、raw response、error 如何归一？
- 它如何和 AgentRuntime 的 trace/modelCalls 对齐？

## 落地顺序

1. 在 `src/agent-framework/domain/provider/` 添加或更新 provider contract。
2. 在 `src/agent-framework/infrastructure/provider/` 实现 runner。
3. 可编辑或含 secret 的配置放 `agent-workspace/framework/providers/`。
4. 通过 AgentRuntime provider selection 接入，不新增 worker execution path。
5. 覆盖 config persistence、success、failure、health、tool protocol、runner boundary。

Provider code 可以调用 model backends，但不运行 shell、不写 workspace、不修改 Engine lifecycle、不安装 skills。
