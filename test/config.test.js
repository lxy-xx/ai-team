import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

function withEnv(values, fn) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("loadConfig aligns the default provider with the resolved default runner", () => {
  withEnv({ AI_TEAM_RUNNER: undefined, AI_TEAM_PROVIDER: undefined }, () => {
    const config = loadConfig();
    assert.equal(config.runner.type, "mock");
    assert.equal(config.provider.id, "mock");
  });
});

test("loadConfig defaults real runners to the codex provider unless explicitly overridden", () => {
  withEnv({ AI_TEAM_RUNNER: "codex_app_server", AI_TEAM_PROVIDER: undefined }, () => {
    const config = loadConfig();
    assert.equal(config.runner.type, "codex_app_server");
    assert.equal(config.provider.id, "codex");
  });

  withEnv({ AI_TEAM_RUNNER: "openai_compatible", AI_TEAM_PROVIDER: "deepseek" }, () => {
    const config = loadConfig();
    assert.equal(config.runner.type, "openai_compatible");
    assert.equal(config.provider.id, "deepseek");
  });
});

test("loadConfig exposes async Bash concurrency limits", () => {
  withEnv({
    AI_TEAM_ASYNC_BASH_MAX_RUNNING_PER_ROLE: undefined,
    AI_TEAM_ASYNC_BASH_MAX_RUNNING_GLOBAL: undefined
  }, () => {
    const config = loadConfig();
    assert.equal(config.asyncBash.maxRunningPerRole, 8);
    assert.equal(config.asyncBash.maxRunningGlobal, 32);
  });

  withEnv({
    AI_TEAM_ASYNC_BASH_MAX_RUNNING_PER_ROLE: "4",
    AI_TEAM_ASYNC_BASH_MAX_RUNNING_GLOBAL: "12"
  }, () => {
    const config = loadConfig();
    assert.equal(config.asyncBash.maxRunningPerRole, 4);
    assert.equal(config.asyncBash.maxRunningGlobal, 12);
  });
});
