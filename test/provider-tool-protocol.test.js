import test from "node:test";
import assert from "node:assert/strict";
import { ProviderToolProtocol } from "../src/agent-framework/domain/provider/provider-tool-protocol.js";

test("ProviderToolProtocol maps unsafe tool ids to OpenAI-compatible names", () => {
  const protocol = new ProviderToolProtocol();
  const manifest = protocol.openAICompatibleToolManifest([
    {
      id: "memory.write/fact!",
      description: "Write a memory fact",
      parameters: { type: "object", properties: { text: { type: "string" } } }
    }
  ]);

  assert.equal(manifest.tools[0].function.name, "memory_write_fact");
  assert.equal(manifest.nameToId.get("memory_write_fact"), "memory.write/fact!");
});

test("ProviderToolProtocol suffixes duplicate safe tool names", () => {
  const protocol = new ProviderToolProtocol();
  const manifest = protocol.openAICompatibleToolManifest([
    { id: "a.b", description: "First" },
    { id: "a/b", description: "Second" }
  ]);
  const names = manifest.tools.map((tool) => tool.function.name);

  assert.equal(new Set(names).size, 2);
  assert(names.every((name) => name.startsWith("a_b_")));
  assert.equal(manifest.nameToId.get(names[0]), "a.b");
  assert.equal(manifest.nameToId.get(names[1]), "a/b");
});

test("ProviderToolProtocol reports invalid JSON tool arguments with tool name", () => {
  const protocol = new ProviderToolProtocol();

  assert.throws(
    () => protocol.parseToolCallArguments({ name: "memory_write", arguments: "{bad json" }),
    /tool call memory_write arguments must be valid JSON/
  );
});

test("ProviderToolProtocol passes object tool arguments through", () => {
  const protocol = new ProviderToolProtocol();
  const args = { text: "remember this", tags: ["note"] };

  assert.equal(protocol.parseToolCallArguments({ name: "memory_write", arguments: args }), args);
});

test("ProviderToolProtocol creates assistant tool-call replay messages", () => {
  const protocol = new ProviderToolProtocol();
  const message = protocol.assistantToolCallMessage(
    { message: { content: [{ text: "Checking memory. " }] } },
    [
      {
        id: "call_1",
        type: "function",
        name: "memory_search",
        arguments: { query: "project" }
      }
    ]
  );

  assert.deepEqual(message, {
    role: "assistant",
    content: "Checking memory.",
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "memory_search",
          arguments: JSON.stringify({ query: "project" })
        }
      }
    ]
  });
});

test("ProviderToolProtocol preserves DeepSeek thinking content on tool-call replay messages", () => {
  const protocol = new ProviderToolProtocol();
  const toolCalls = [
    {
      id: "call_1",
      type: "function",
      function: {
        name: "memory_search",
        arguments: JSON.stringify({ query: "project" })
      }
    }
  ];
  const message = protocol.assistantToolCallMessage(
    {
      assistantMessage: {
        role: "assistant",
        content: null,
        reasoning_content: "I should inspect memory before answering.",
        tool_calls: toolCalls
      }
    },
    toolCalls
  );

  assert.deepEqual(message, {
    role: "assistant",
    content: null,
    reasoning_content: "I should inspect memory before answering.",
    tool_calls: toolCalls
  });
});

test("ProviderToolProtocol extracts completion text from string and array content", () => {
  const protocol = new ProviderToolProtocol();

  assert.equal(protocol.completionText({ message: { content: "  final answer  " } }), "final answer");
  assert.equal(
    protocol.completionText({ message: { content: ["hello ", { text: "from " }, { content: "parts" }] } }),
    "hello from parts"
  );
});
