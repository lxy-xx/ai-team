# 控制台 Read Models 参考

Dashboard read model 是“展示形状”，不是“新状态”。它应该把持久状态投影成 UI 需要的 JSON，同时保持来源可追踪。

## 设计问题

- 这个字段来自 Engine、Agent config、Provider config、Channel config，还是运行时 health？
- 它是否是持久事实，还是仅用于排序、分组、展示？
- 是否包含 secret、token、客户原文、raw provider response？
- Route 是否需要保持向后兼容？

## 原则

Engine data 从 TeamEngine/EngineStore read paths 派生。Agent/provider/channel 配置只暴露脱敏后的状态和用户可理解概念。不要让 UI 直接依赖 store 内部私有形状。
