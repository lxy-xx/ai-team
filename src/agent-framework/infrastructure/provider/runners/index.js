import { CodexAppServerRunner } from "./codex-app-server-runner.js";
import { MockSubagentRunner } from "./mock-runner.js";
import { OpenAICompatibleRunner } from "./openai-compatible-runner.js";

export function createRunner({ config, logger }) {
  if (config.runner.type === "mock") {
    return new MockSubagentRunner();
  }
  if (config.runner.type === "codex") {
    throw new Error("Codex CLI is not available as a runner. Use the codex_app_server provider runner.");
  }
  if (config.runner.type === "codex_app_server") {
    return new CodexAppServerRunner({ config, logger });
  }
  if (config.runner.type === "openai_compatible") {
    return new OpenAICompatibleRunner({ config, logger });
  }
  throw new Error(`Unknown AI_TEAM_RUNNER: ${config.runner.type}`);
}
