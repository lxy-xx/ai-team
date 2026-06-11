# AI Team Agent

[English](README.md)

AI Team Agent 是一个本地优先的 AI 团队运行时原型。它的重点不是“把一句话转给某个 Agent”，而是给 AI 团队工作建立一套可以追踪、恢复和观察的账本。

外部输入会先进入 CEO/CTO Agent。CEO 可以直接回复，也可以创建一条 TeamEngine intent。后续系统会把工作记录成 project、intent、task、run、artifact、feedback、operation、session、tool call 和验证结果。这样一件事为什么开始、谁处理过、卡在哪一步、调用了什么工具、留下了什么产物，都能被复盘。

## 它能做什么

- 把自然语言请求先交给 CEO/CTO 入口判断。
- 把被接受的工作拆成 TeamEngine intents 和 tasks。
- 按 wake rules 把任务路由给配置好的 AI 员工。
- 通过 AgentRuntime 管理每个 Agent 回合里的 prompt、memory、skills、MCP、provider 和工具调用。
- 用服务端渲染 Dashboard 展示完整工作生命周期。
- 支持本地 CLI、HTTP/Dashboard，以及可选的飞书/Lark 接入。

## 快速开始

环境要求：

- Node.js 20+
- npm

安装依赖并运行测试：

```bash
npm install
npm test
```

先用 mock 模式跑一次，不会调用真实模型：

```bash
AI_TEAM_RUNNER=mock npm run once -- "Create a small demo task and verify it"
```

启动本地服务：

```bash
npm start
```

打开 Dashboard：

```text
http://localhost:8787/ai-team/console/dashboard
```

如果没有设置 `AI_TEAM_ADMIN_TOKEN`，本地默认 token 是 `AI-team`。只要不是纯本地单人使用，都建议显式设置自己的 token：

```bash
AI_TEAM_ADMIN_TOKEN=replace-me npm start
```

然后打开：

```text
http://localhost:8787/ai-team/console/dashboard?token=replace-me
```

## 第一次 Onboarding 路径

1. 先用 `AI_TEAM_RUNNER=mock` 启动，确认 Dashboard 能打开。
2. 进入 Dashboard 的 `Settings`。
3. 检查 setup readiness、模型 provider、员工配置和 wake rules。
4. 跑一个小请求：`npm run once -- "..."`。
5. 在 `Overview` 点击正在工作的员工，查看实时对话、工具调用、模型输出和 trace metadata。
6. mock 路径跑通后，再切换到真实模型 provider。

## 模型 Provider

项目目前支持三类 provider 模式：

```bash
# 不调用外部模型。适合 onboarding 和测试。
AI_TEAM_RUNNER=mock
AI_TEAM_PROVIDER=mock

# Codex 订阅 runner。运行服务的用户需要已安装并登录 Codex。
AI_TEAM_RUNNER=codex_app_server
AI_TEAM_PROVIDER=codex
AI_TEAM_CODEX_BIN=codex

# OpenAI-compatible API provider，包括 DeepSeek。
AI_TEAM_RUNNER=openai_compatible
AI_TEAM_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
```

Provider 配置属于运行时配置，会写入 `agent-workspace/framework/providers/`。本地 secret、health state 和 provider 配置不要提交到源码仓库。

## 运行时数据

这个仓库保存源码。运行时状态是本地数据，应该留在 git 外：

```text
data/                           # Engine 账本、渠道配置、工具审计日志
agent-workspace/agents/          # 运行时员工 profile、memory、trace
agent-workspace/framework/        # 运行时 provider 和 coding-agent launcher 配置
projects/                        # 示例项目 workspace root
```

常用环境变量：

```bash
AI_TEAM_PORT=8787
AI_TEAM_HOST=0.0.0.0
AI_TEAM_DATA_DIR=./data
AI_TEAM_AGENT_WORKSPACE_DIR=./agent-workspace
AI_TEAM_PROJECT_WORKSPACE_ROOT=./projects
AI_TEAM_ADMIN_TOKEN=
```

如果想用本地 env 文件，可以复制 `.env.example`：

```bash
cp .env.example .env
```

## 核心概念

### CEO First

外部输入先进入 CEO/CTO Agent。CEO 决定直接回复，或者创建 TeamEngine intent。渠道层不会自己创建 task。

### TeamEngine Ledger

TeamEngine 负责业务状态：

- `project`：workspace 和中期上下文边界
- `intent`：被接受的工作目标
- `task`：intent 内的可执行单元
- `run`：某个 Agent 的一次执行尝试
- `artifact`：结构化产物
- `operation`：状态变化原因

### AgentRuntime

AgentRuntime 负责一次 Agent 回合：

- role prompt 和 profile
- memory
- skills 和 MCP metadata
- tool manifest
- model provider 调用
- session replay 和 trace snapshot

### Tools

会影响外部世界的工具调用都会经过 `ToolExecutor` 和审计日志。内置本地执行工具包括：

- `Bash`
- `async_bash.start/status/wait/cancel`
- `coding_agent.start/status/wait/cancel`
- Engine tools，例如 `engine.create_intent` 和 `engine.transition`
- `channel.reply`

## Dashboard

重要路由：

```text
GET /ai-team/console/dashboard
GET /ai-team/console/architecture
GET /ai-team/api/health
GET /ai-team/api/dashboard
GET /ai-team/api/dashboard/ws
```

Dashboard 目前包含：

- `Overview`：当前工作、owner attention、上下文请求、正在工作的员工
- `Agents`：员工 profile、skills、tools、wake rules、一对一聊天
- `Evidence`：intent/task/run/artifact 审计视图
- `Intake`：手动创建工作
- `Projects`：项目读模型
- `Settings`：provider、飞书/Lark、readiness、运行时配置

## 飞书 / Lark

飞书/Lark 是可选能力。建议先跑通 mock 模式，再从 Dashboard `Settings` 或 CLI 配置渠道：

```bash
node src/index.js channels scan
node src/index.js channels setup feishu
node src/index.js channels bind feishu --app cli_xxx:app-secret --enable
node src/index.js channels test feishu
```

Secret 会保存在运行时数据里，不属于源码。

## 开发

常用命令：

```bash
npm run dev
npm start
npm run once -- "..."
npm test
node src/index.js engine health
node src/index.js engine tick
```

修改 JavaScript 时，至少运行：

```bash
node --check path/to/file.js
```

Dashboard UI 改动需要用浏览器 viewport 检查滚动、重叠和响应式可读性。

## 项目结构

```text
src/
  agent-framework/               # Agent runtime、memory、tools、providers
  team-engine/                   # project/intent/task/run 生命周期
  interfaces/                    # HTTP、CLI、channels、scheduler
  fe/                            # 服务端渲染 Dashboard 和架构页面
  platform/                      # JSON、path、config、id、time 等共享工具
test/                            # Node test suites
.agents/skills/                  # 面向维护者的仓库知识
agent-workspace/                 # 运行时 workspace 脚手架；本地状态被 ignore
data/                            # 运行时账本；被 ignore
```

## 开源状态

仓库已经包含基础开源文件：

- MIT `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- GitHub Actions CI，运行 `npm test`
- 针对运行时数据和本地凭据的 `.gitignore`

正式公开发布前仍建议复查：

- `.agents/skills/` 是否保留为公开维护者文档
- `AGENTS.md` 是否还有内部操作假设
- 手动打包发布时，是否排除了 ignored runtime directories

## 状态

这是一个实验性的本地优先 AI 团队运行时，不是已经加固过的生产系统。它适合用来探索 TeamEngine 风格的 Agent 编排、审计能力和 Dashboard 可观测性。
