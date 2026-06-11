# 记忆分层参考

根据“未来怎么被用到”选择 memory layer。

记忆是 Agent 的组件，不是 Harness 观测层。Harness 可以记录 memory action 和由此产生的 trace/log，但不要把记忆本身当成调优日志。

- Semantic facts：稳定事实，例如用户偏好、项目背景、团队约定。
- Episodic events：发生过的一次事件，例如某次 run、某次决策、一次故障。
- Procedural playbooks：可复用过程，例如部署步骤、排障套路、代码审查方法。

## 选择规则

如果它回答“什么是真的”，放 semantic。
如果它回答“发生过什么”，放 episodic。
如果它回答“以后怎么做”，放 procedural。

同一信息不要重复存多层。重复会让 Agent 在检索时拿到互相覆盖的上下文，尤其容易污染 prompt budget。

Session 是 memory fork，不是新的语义记忆层。它保存一次会话内已经给过模型的 prefix、turn events、tool replay 和压缩 summary；长期复用的事实仍然要写回对应 memory layer。
