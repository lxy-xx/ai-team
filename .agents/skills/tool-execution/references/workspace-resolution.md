# Bash 工作区解析参考

Workspace 不是“当前 repo”的同义词。业务项目应该在 project workspace 中运行，控制面代码才在 repo workspace。

## 解析顺序

`Bash` 默认 cwd 按这个顺序解析：

1. Active Engine host context 的 project workspace。
2. Config fallback workspace。
3. `process.cwd()`。

如果工具 input 提供 `cwd`，绝对路径按原样解析，相对路径从当前 workspace 解析。

## 边界

`Bash` 不做命令白名单或 workspace 越界限制。边界来自 Agent profile 授权、ToolExecutor role attribution、ToolAuditLog 审计和 Provider loop 中的 tool result 证据。

Project workspaces 默认在 `~/ai-team/${project-name}` 下，除非提供 `AI_TEAM_PROJECT_WORKSPACE_ROOT` 或显式 project workspace。`AI_TEAM_WORKSPACE` 是 control/repo fallback，不应变成默认 business workspace。
