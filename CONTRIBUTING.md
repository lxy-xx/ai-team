# Contributing

Thanks for taking a look at AI Team Agent.

This project is an experimental local-first agent team runtime. The most useful contributions are bug reports, small focused fixes, documentation improvements, and examples that make the onboarding path easier to understand.

## Development Setup

Requirements:

- Node.js 20+
- npm

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run the local server:

```bash
npm start
```

Open the dashboard:

```text
http://localhost:8787/ai-team/console/dashboard
```

For a first local run, prefer mock mode:

```bash
AI_TEAM_RUNNER=mock npm run once -- "Create a small demo task and verify it"
```

## Pull Requests

- Keep changes focused.
- Include tests for behavior changes.
- Run `npm test` before opening a pull request.
- For JavaScript-only edits, also run `node --check path/to/file.js` when the touched file is not covered by a nearby test.
- Do not commit runtime state, local credentials, provider health files, channel secrets, logs, or local project workspaces.

## Runtime State

The repository is source code. These paths are local runtime state and should stay out of commits:

```text
data/
agent-workspace/agents/
agent-workspace/framework/providers/
agent-workspace/framework/coding-agents/
projects/
```

If you need to share a reproduction, describe the steps and include sanitized snippets instead of raw runtime files.

## Reporting Issues

When filing an issue, include:

- What you expected to happen.
- What happened instead.
- The command or UI path you used.
- Relevant logs with secrets removed.
- Whether you were using `mock`, `codex_app_server`, or `openai_compatible`.
