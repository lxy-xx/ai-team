# 新增 Engine 单元示例

只有在新增持久 Engine unit 时使用，比如新的 entity type、lifecycle branch 或 routed work category。

## 架构判断

先问三个问题：

1. 它是不是一个需要跨进程恢复的业务事实？
2. 它是否有独立 status 和 transition？
3. 它是否会唤醒 Agent 或影响已有 entity 的推进？

三个问题都成立，才考虑新增 Engine unit。否则它更可能是 artifact、read model、metadata 或 memory。

## 落地顺序

1. 在 `src/team-engine/domain/` 添加 domain shape 和 status vocabulary。
2. 在 `src/team-engine/infrastructure/` 添加 store operations，并使用结构化 JSON helpers。
3. 在 `src/team-engine/application/` 添加 lifecycle orchestration。
4. 如果会唤醒 Agents，补 routing rule 和 assignment context。
5. 如果要展示，补 read-model projection，而不是让 UI 直接读 store 内部形状。
6. 覆盖 creation、transition、operation history、persistence reload、routing、API/read-model output。
