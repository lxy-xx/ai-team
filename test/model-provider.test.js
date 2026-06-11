import test from "node:test";
import assert from "node:assert/strict";
import { ModelProvider } from "../src/agent-framework/infrastructure/provider/model-provider.js";

test("ModelProvider.complete builds a prompt and preserves tools for codex_app_server runners", async () => {
  let runnerInput;
  const provider = new ModelProvider({
    id: "codex",
    config: { runner: { type: "codex_app_server" } },
    capabilities: { model: "gpt-test" },
    runner: {
      async run(input) {
        runnerInput = input;
        if (!input.prompt?.includes("Current assignment")) {
          throw new Error("codex app-server runner requires prompt");
        }
        return { finalMessage: "codex completed", stdout: "", stderr: "", durationMs: 1 };
      }
    }
  });

  const result = await provider.complete({
    providerConfig: { id: "codex", runner: "codex_app_server" },
    model: "gpt-test",
    messages: [
      { role: "system", content: "System prompt" },
      { role: "user", content: "Current assignment: ship the adapter" }
    ],
    tools: [{ type: "function", function: { name: "Bash" } }]
  });

  assert.equal(result.message.content, "codex completed");
  assert.match(runnerInput.prompt, /System prompt/);
  assert.match(runnerInput.prompt, /Current assignment: ship the adapter/);
  assert.equal(runnerInput.messages, undefined);
  assert.deepEqual(runnerInput.tools, [{ type: "function", function: { name: "Bash" } }]);
});

test("ModelProvider.complete preserves messages and tools for openai-compatible runners", async () => {
  let runnerInput;
  const messages = [{ role: "user", content: "hello api model" }];
  const tools = [{ type: "function", function: { name: "Bash" } }];
  const provider = new ModelProvider({
    id: "api",
    config: { runner: { type: "openai_compatible" } },
    capabilities: { model: "api-test" },
    runner: {
      async run(input) {
        runnerInput = input;
        return {
          assistantMessage: { role: "assistant", content: "api completed" },
          toolCalls: [],
          stdout: "{}",
          stderr: "",
          durationMs: 1
        };
      }
    }
  });

  const result = await provider.complete({
    providerConfig: { id: "api", runner: "openai_compatible" },
    model: "api-test",
    messages,
    tools
  });

  assert.equal(result.message.content, "api completed");
  assert.equal(runnerInput.messages, messages);
  assert.equal(runnerInput.tools, tools);
  assert.equal(runnerInput.prompt, undefined);
});

test("ModelProvider.complete preserves tool-call transcript for codex text runners", async () => {
  let runnerInput;
  const provider = new ModelProvider({
    id: "codex",
    config: { runner: { type: "codex_app_server" } },
    capabilities: { model: "gpt-test" },
    runner: {
      async run(input) {
        runnerInput = input;
        return { finalMessage: "codex completed", stdout: "", stderr: "", durationMs: 1 };
      }
    }
  });

  await provider.complete({
    providerConfig: { id: "codex", runner: "codex_app_server" },
    model: "gpt-test",
    messages: [
      { role: "system", content: "System prompt" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call_1",
          type: "function",
          function: { name: "Bash", arguments: "{\"command\":\"cat README.md\"}" }
        }]
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: "{\"status\":\"completed\"}"
      },
      { role: "user", content: "Continue after the tool result." }
    ],
    tools: [{ type: "function", function: { name: "Bash" } }]
  });

  assert.match(runnerInput.prompt, /ASSISTANT_TOOL_CALL/);
  assert.match(runnerInput.prompt, /call_1/);
  assert.match(runnerInput.prompt, /Bash/);
  assert.match(runnerInput.prompt, /TOOL_RESULT/);
});
