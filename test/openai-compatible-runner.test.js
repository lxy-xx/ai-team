import test from "node:test";
import assert from "node:assert/strict";
import { OpenAICompatibleRunner } from "../src/agent-framework/infrastructure/provider/runners/openai-compatible-runner.js";

test("OpenAICompatibleRunner calls a DeepSeek-style chat completions endpoint", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.AI_TEAM_TEST_DEEPSEEK_KEY;
  let request;
  process.env.AI_TEAM_TEST_DEEPSEEK_KEY = "test-key";
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      choices: [{ message: { content: "DeepSeek response" } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const runner = new OpenAICompatibleRunner({ config: { runner: { codexTimeoutMs: 1000 } }, logger: { info() {} } });
    const result = await runner.run({
      role: "engineer",
      prompt: "hello",
      providerConfig: {
        id: "deepseek",
        provider: "deepseek",
        apiKeyEnv: "AI_TEAM_TEST_DEEPSEEK_KEY",
        baseUrl: "https://api.deepseek.com",
        defaultModel: "deepseek-chat"
      }
    });

    assert.equal(request.url, "https://api.deepseek.com/chat/completions");
    assert.equal(request.options.headers.authorization, "Bearer test-key");
    assert.equal(request.body.model, "deepseek-chat");
    assert.deepEqual(request.body.messages, [{ role: "user", content: "hello" }]);
    assert.equal(result.finalMessage, "DeepSeek response");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.AI_TEAM_TEST_DEEPSEEK_KEY;
    else process.env.AI_TEAM_TEST_DEEPSEEK_KEY = previousKey;
  }
});

test("OpenAICompatibleRunner can use a resolved direct API key", async () => {
  const previousFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      choices: [{ message: { content: "Direct key response" } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const runner = new OpenAICompatibleRunner({ config: { runner: { codexTimeoutMs: 1000 } }, logger: { info() {} } });
    const result = await runner.run({
      role: "product_manager",
      prompt: "hello direct",
      providerConfig: {
        id: "deepseek",
        provider: "deepseek",
        apiKeyEnv: "SHOULD_NOT_BE_READ",
        apiKey: "sk-direct-test",
        baseUrl: "https://api.deepseek.com",
        defaultModel: "deepseek-chat"
      }
    });

    assert.equal(request.options.headers.authorization, "Bearer sk-direct-test");
    assert.equal(result.finalMessage, "Direct key response");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
