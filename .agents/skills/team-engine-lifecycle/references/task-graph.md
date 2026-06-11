# 任务图参考：task_graph

默认团队里的 `product_manager` 是 intent 到 task graph 的翻译器；如果用户换了团队配置，也应由对应配置中的 planning worker 产出同样的 `task_graph`。它不决定“谁来做”，只决定“要做哪些事、依赖关系是什么、验收标准是什么”。

## 图的边界

- `task_graph` 描述 tasks 和 dependencies，是 planning worker 的当前输出格式。
- 不写 worker names、Agent roles、assignee、owner、routing hints。
- 不创建 QA task。QA 是 task 进入 `testing` 后由 Engine wake rule 唤醒的 verification phase。
- 不把用户原话整段塞进 task；task 应该可执行、可验收、可被后续 Agent 独立理解。

## Rework 语义

QA reject 仍然属于同一 task：它表示这件事没通过验收。rework 要保留同一 task lineage，让 implementation report、verification report、finding、addressed rejection 能串起来。

## 判断一个图好不好

一个好的 task graph 应该让 TeamEngine 能纯粹根据 dependency + status 推进，不需要知道具体 Agent 名，也不需要从自然语言里再猜下一步。
