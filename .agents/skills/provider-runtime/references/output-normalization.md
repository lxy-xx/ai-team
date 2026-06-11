# 输出规范化参考

这里有两层 normalization，不要混在一起。

## Provider 到 AgentRuntime

把 runner-specific response 转成 AgentRuntime 能理解的 final text、assistant message、tool calls、usage、raw metadata。这个阶段保留模型语义，不解释 Engine artifact。

## AgentRuntime 到 Engine artifact

WorkerEngine 的 `ProviderOutputNormalizer` 把 Agent final output 转成 Engine artifact。默认 artifact kind、QA verdict fallback 和 transcript prefix 来自 Agent profile 的 `output.json`；默认团队的这些配置由 `default-agent-onboarding.js` 一次性 seed。模型显式返回的 structured `kind` 可以作为 artifact kind，但默认输出不要在代码里按 role 硬编码。

## 原则

- Provider transport parsing 不要知道 TeamEngine role output contract。
- Engine artifact normalization 不要知道模型厂商 API 细节，也不要在代码里按 role 维护默认 artifact kind 表；读取 profile output 配置。
- Error 必须能脱敏写 trace，不能把 credentials 带到 dashboard 或日志。
