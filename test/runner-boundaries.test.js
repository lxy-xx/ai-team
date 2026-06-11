import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { createRunner } from "../src/agent-framework/infrastructure/provider/runners/index.js";
import { CodexAppServerRunner } from "../src/agent-framework/infrastructure/provider/runners/codex-app-server-runner.js";

function logger() {
  return { info() {}, warn() {}, error() {}, debug() {} };
}

function fakeCodexAppServerFactory({ requests, finalText = "hello world" }) {
  return (bin, args, options) => {
    requests.spawn = { bin, args, options };
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let input = "";
    const emitJson = (message) => {
      child.stdout.write(`${JSON.stringify(message)}\n`);
    };
    const handleRequest = (request) => {
      requests.messages.push(request);
      if (request.method === "initialize") {
        emitJson({ id: request.id, result: { userAgent: "fake-codex", codexHome: "/tmp/codex", platformFamily: "unix", platformOs: "macos" } });
        return;
      }
      if (request.method === "thread/start") {
        emitJson({ id: request.id, result: { thread: { id: "thread_1" }, model: request.params.model, modelProvider: "openai" } });
        return;
      }
      if (request.method === "turn/start") {
        emitJson({ id: request.id, result: { turn: { id: "turn_1" } } });
        emitJson({ method: "item/agentMessage/delta", params: { threadId: "thread_1", turnId: "turn_1", itemId: "item_1", delta: finalText } });
        emitJson({ method: "turn/completed", params: { threadId: "thread_1", turn: { id: "turn_1", status: "completed", items: [], error: null } } });
      }
    };
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        input += chunk.toString();
        const lines = input.split("\n");
        input = lines.pop() || "";
        for (const line of lines) {
          if (line.trim()) handleRequest(JSON.parse(line));
        }
        callback();
      }
    });
    child.kill = () => {
      child.emit("close", 0);
      return true;
    };
    return child;
  };
}

test("createRunner keeps Codex CLI out of provider runners", () => {
  assert.throws(
    () => createRunner({ config: { runner: { type: "codex" } }, logger: logger() }),
    /Codex CLI is not available as a runner/
  );
  assert.ok(createRunner({ config: { runner: { type: "codex_app_server" } }, logger: logger() }) instanceof CodexAppServerRunner);
});

test("CodexAppServerRunner exposes host tools through a text protocol", async () => {
  const requests = { messages: [], spawn: undefined };
  const runner = new CodexAppServerRunner({
    config: {
      workspace: "/workspace",
      runner: {
        codexBin: "codex",
        codexTimeoutMs: 1000,
        codexSandbox: "workspace-write",
        codexApproval: "never"
      }
    },
    logger: logger(),
    processFactory: fakeCodexAppServerFactory({
      requests,
      finalText: '<tool_calls>[{"id":"call_1","name":"engine_create_intent","arguments":{"text":"推进国际化"}}]</tool_calls>'
    })
  });

  const result = await runner.run({
    role: "ceo_cto",
    prompt: "Decide whether to create work",
    workspace: "/workspace",
    model: "gpt-5.5",
    providerConfig: {
      id: "codex",
      codexBin: "codex",
      timeoutMs: 1000
    },
    tools: [
      {
        type: "function",
        function: {
          name: "engine_create_intent",
          description: "Create an intent",
          parameters: { type: "object", required: ["text"], properties: { text: { type: "string" } } }
        }
      }
    ]
  });

  const turnStart = requests.messages.find((message) => message.method === "turn/start");
  assert.match(turnStart.params.input[0].text, /Tool Protocol/);
  assert.doesNotMatch(turnStart.params.input[0].text, /AI Team Tool Protocol/);
  assert.match(turnStart.params.input[0].text, /engine_create_intent/);
  assert.deepEqual(result.toolCalls, [
    {
      id: "call_1",
      type: "function",
      function: {
        name: "engine_create_intent",
        arguments: JSON.stringify({ text: "推进国际化" })
      }
    }
  ]);
  assert.equal(result.finalMessage, "");
});

test("CodexAppServerRunner uses codex app-server protocol instead of codex exec", async () => {
  const requests = { messages: [], spawn: undefined };
  const runner = new CodexAppServerRunner({
    config: {
      workspace: "/workspace",
      runner: {
        codexBin: "codex",
        codexTimeoutMs: 1000,
        codexSandbox: "workspace-write",
        codexApproval: "never"
      }
    },
    logger: logger(),
    processFactory: fakeCodexAppServerFactory({ requests })
  });

  const result = await runner.run({
    role: "engineer",
    prompt: "Say hello",
    workspace: "/workspace",
    model: "gpt-5.5",
    providerConfig: {
      id: "codex",
      codexBin: "codex",
      sandbox: "read-only",
      timeoutMs: 1000
    }
  });

  assert.equal(result.finalMessage, "hello world");
  assert.equal(requests.spawn.args[0], "app-server");
  assert.ok(requests.spawn.args.includes("--disable"));
  assert.ok(requests.spawn.args.includes("shell_tool"));
  assert.ok(requests.spawn.args.includes("plugins"));
  assert.ok(requests.spawn.args.includes("tool_search"));
  assert.equal(requests.spawn.args.at(-2), "--listen");
  assert.equal(requests.spawn.args.at(-1), "stdio://");
  assert.equal(requests.spawn.args.includes("exec"), false);
  const threadStart = requests.messages.find((message) => message.method === "thread/start");
  assert.equal(threadStart.params.sandbox, "read-only");
  const turnStart = requests.messages.find((message) => message.method === "turn/start");
  assert.equal(turnStart.params.input[0].text, "Say hello");
  assert.equal(turnStart.params.model, "gpt-5.5");
});
