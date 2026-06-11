# AI Team Agent

[简体中文](README.zh-CN.md)

AI Team Agent is a local-first prototype for running an AI-only team with a real work ledger.

Instead of passing a message directly to a random agent, the system routes work through a CEO agent and records the lifecycle as projects, intents, tasks, runs, artifacts, feedback, operations, sessions, tool calls, and verification results. The goal is to make agent work observable, recoverable, and configurable.

## What It Does

- Turns natural-language requests into tracked work through a CEO/CTO entry point.
- Breaks accepted work into TeamEngine intents and tasks.
- Routes tasks to configured AI employees through wake rules.
- Runs agent turns through AgentRuntime, model providers, memory, skills, MCP, and audited tools.
- Shows the whole lifecycle in a server-rendered Dashboard.
- Supports local CLI, HTTP/Dashboard, and Feishu/Lark channel ingress.

## Quick Start

Requirements:

- Node.js 20+
- npm

Install and run the test suite:

```bash
npm install
npm test
```

Run a smoke test without calling a real model:

```bash
AI_TEAM_RUNNER=mock npm run once -- "Create a small demo task and verify it"
```

Start the local server:

```bash
npm start
```

Open the Dashboard:

```text
http://localhost:8787/ai-team/console/dashboard
```

If `AI_TEAM_ADMIN_TOKEN` is not set, the local default token is `AI-team`. For any non-local or shared deployment, set your own token.

```bash
AI_TEAM_ADMIN_TOKEN=replace-me npm start
```

Then open:

```text
http://localhost:8787/ai-team/console/dashboard?token=replace-me
```

## First Onboarding Path

1. Start with `AI_TEAM_RUNNER=mock` and confirm the Dashboard opens.
2. Open `Settings` in the Dashboard.
3. Check setup readiness, model providers, employees, and wake rules.
4. Run a small `npm run once -- "..."` request.
5. Click a running employee in `Overview` to inspect the live agent conversation, tool calls, model output, and trace metadata.
6. Switch to a real provider only after the mock path works.

## Model Providers

The project has three provider modes:

```bash
# No external model calls. Best for onboarding and tests.
AI_TEAM_RUNNER=mock
AI_TEAM_PROVIDER=mock

# Codex subscription runner. The service user must have Codex installed and logged in.
AI_TEAM_RUNNER=codex_app_server
AI_TEAM_PROVIDER=codex
AI_TEAM_CODEX_BIN=codex

# OpenAI-compatible API provider, including DeepSeek.
AI_TEAM_RUNNER=openai_compatible
AI_TEAM_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
```

Provider settings are runtime configuration. They are written under `agent-workspace/framework/providers/` and should not be committed with local secrets or health state.

## Runtime Data

This repository is source code. Runtime state is local and should stay out of git:

```text
data/                           # Engine ledger, channel config, tool audit logs
agent-workspace/agents/          # Runtime employee profiles, memory, traces
agent-workspace/framework/        # Runtime provider and coding-agent launcher config
projects/                        # Example local project workspace root
```

Useful environment variables:

```bash
AI_TEAM_PORT=8787
AI_TEAM_HOST=0.0.0.0
AI_TEAM_DATA_DIR=./data
AI_TEAM_AGENT_WORKSPACE_DIR=./agent-workspace
AI_TEAM_PROJECT_WORKSPACE_ROOT=./projects
AI_TEAM_ADMIN_TOKEN=
```

Copy `.env.example` if you want a local env file:

```bash
cp .env.example .env
```

## Core Concepts

### CEO First

External input goes to the CEO/CTO agent first. The CEO either replies directly or creates a TeamEngine intent. Channels do not create tasks by themselves.

### TeamEngine Ledger

TeamEngine owns business state:

- `project`: workspace and medium-term context boundary
- `intent`: accepted work objective
- `task`: executable unit inside an intent
- `run`: one agent execution attempt
- `artifact`: structured output
- `operation`: why state changed

### AgentRuntime

AgentRuntime owns an agent turn:

- role prompt and profile
- memory
- skills and MCP metadata
- tool manifest
- model provider calls
- session replay and trace snapshots

### Tools

Tools that affect the outside world go through `ToolExecutor` and audit logging. Built-in local execution tools include:

- `Bash`
- `async_bash.start/status/wait/cancel`
- `coding_agent.start/status/wait/cancel`
- Engine tools such as `engine.create_intent` and `engine.transition`
- `channel.reply`

## Dashboard

Important routes:

```text
GET /ai-team/console/dashboard
GET /ai-team/console/architecture
GET /ai-team/api/health
GET /ai-team/api/dashboard
GET /ai-team/api/dashboard/ws
```

The Dashboard currently includes:

- `Overview`: active work, owner attention, context requests, working employees
- `Agents`: employee profile, skills, tools, wake rules, one-on-one chat
- `Evidence`: intent/task/run/artifact audit view
- `Intake`: manual work entry
- `Projects`: project read model
- `Settings`: provider, Feishu/Lark, readiness, runtime settings

## Feishu / Lark

Feishu/Lark is optional. Start with mock mode first, then configure the channel from Dashboard `Settings` or CLI:

```bash
node src/index.js channels scan
node src/index.js channels setup feishu
node src/index.js channels bind feishu --app cli_xxx:app-secret --enable
node src/index.js channels test feishu
```

Secrets are stored in runtime data, not source.

## Development

Common commands:

```bash
npm run dev
npm start
npm run once -- "..."
npm test
node src/index.js engine health
node src/index.js engine tick
```

When editing JavaScript, run at least:

```bash
node --check path/to/file.js
```

Dashboard UI changes should be checked in a browser viewport.

## Project Layout

```text
src/
  agent-framework/               # Agent runtime, memory, tools, providers
  team-engine/                   # Project/intent/task/run lifecycle
  interfaces/                    # HTTP, CLI, channels, scheduler
  fe/                            # Server-rendered Dashboard and architecture pages
  platform/                      # Shared JSON, path, config, id, time helpers
test/                            # Node test suites
.agents/skills/                  # Maintainer-facing repo skills
agent-workspace/                 # Runtime workspace scaffold; local state is ignored
data/                            # Runtime ledger; ignored
```

## Open Source Readiness

This repository includes the basic public project files:

- MIT `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- GitHub Actions CI running `npm test`
- `.gitignore` rules for runtime data and local credentials

Before cutting a public release, also review:

- whether `.agents/skills/` should remain public maintainer documentation
- whether `AGENTS.md` contains any internal-only operating assumptions
- whether ignored runtime directories are excluded from any manually created archive

## Status

This is an experimental local-first agent team runtime, not a hardened production system. It is useful for exploring TeamEngine-style agent orchestration, auditability, and dashboard observability.
