# 实体生命周期参考

新增或修改 TeamEngine entity transition 时使用。重点在于让状态变化解释得了后续所有投影。

## 设计顺序

1. 定义这个 entity 代表什么业务事实，以及它为什么需要持久化。
2. 定义 status vocabulary：每个 status 表示谁已经完成了什么承诺。
3. 决定哪些事件能触发 transition：wake rule、Agent result、tool call、retry、feedback、system failure。
4. 决定 recovery 语义：失败后 block、重试后回哪个 status、是否保留 run/artifact。
5. 最后才改 store、read model 和 API。

## Operation 语义

`operations[]` 是历史解释层，不只是日志。每个 status change 应能回答：谁触发、何时触发、从哪里到哪里、基于哪个 run、为什么这样变。

如果某个状态变化不值得写 operation，通常说明它不是生命周期变化，而只是 read model 或临时计算。

## 投影规则

Dashboard、WebSocket、scheduler、outbound reply 都只能从 Engine state 投影。不要在投影层补业务状态，否则恢复进程后会丢失事实。

## Project `.engine`

Project workspace 下的 `.engine/` 是项目视角的业务账本镜像，用来让项目目录自己携带 project、intent、task、run、artifact。当前 read model 仍从 `data/engine/` 读取全局索引；修改 `EngineStore` 写入时，要保证全局账本和项目镜像一起更新。不要把 Agent memory、Provider health、ToolAuditLog 或 Harness trace 混进 project `.engine`，这些属于 Agent Framework/Harness。
