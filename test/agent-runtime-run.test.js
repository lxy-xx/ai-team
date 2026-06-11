import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentConfigStore } from "../src/agent-framework/infrastructure/agent-config-store.js";
import { onboardDefaultAgentProfiles } from "../src/agent-framework/infrastructure/default-agent-onboarding.js";
import { AgentRuntime } from "../src/agent-framework/application/agent-runtime.js";
import { AgentMemoryStore } from "../src/agent-framework/infrastructure/agent-state-store.js";
import { ToolExecutor } from "../src/agent-framework/application/tool-executor.js";
import { DEFAULT_TOOLS, ToolRegistry } from "../src/agent-framework/domain/tools/tool-registry.js";
import { MemoryStore } from "../src/agent-framework/infrastructure/memory-store.js";
import { OnboardingStateStore } from "../src/platform/onboarding-state-store.js";

async function onboardProfilesOnce(agentConfigStore, dataDir) {
  const onboardingStateStore = new OnboardingStateStore({ dataDir });
  await onboardingStateStore.init();
  return onboardDefaultAgentProfiles({ agentConfigStore, onboardingStateStore });
}

async function createRuntimeHarness({ provider, tools = ["Bash"], toolRegistry = new ToolRegistry(), configPatch = {} } = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-runtime-run-"));
  const agentsDir = path.join(dataDir, "agents-root");
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const agentConfigStore = new AgentConfigStore({ dataDir, agentsDir, toolRegistry });
  await agentConfigStore.init();
  await onboardProfilesOnce(agentConfigStore, dataDir);
  await agentConfigStore.update("engineer", {
    prompt: "ADA AGENTS PROMPT",
    tools,
    modelProvider: { providerId: "test-openai", model: "test-model" }
  });
  const config = {
    rootDir: dataDir,
    dataDir,
    agentsDir,
    workspace: dataDir,
    toolPolicy: {
      approvalMode: "never",
      maxAutoRisk: "medium",
      sandbox: "workspace-write",
      deniedTools: [],
      approvalRequiredTools: []
    },
    ...configPatch
  };
  const toolExecutor = new ToolExecutor({
    config,
    memory,
    toolRegistry,
    logger: { info() {}, warn() {}, error() {}, debug() {} }
  });
  const runtime = new AgentRuntime({
    memory,
    toolRegistry,
    agentConfigStore,
    provider,
    toolExecutor,
    config
  });
  return { dataDir, agentsDir, memory, toolRegistry, agentConfigStore, runtime };
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

test("AgentRuntime.run persists Agent-owned sessions/traces and uses structured non-compressible context blocks", async () => {
  const calls = [];
  const provider = {
    async resolveTurnConfig(selection = {}) {
      return {
        providerId: selection.providerId || "test-openai",
        runner: "openai_compatible",
        model: selection.model || "test-model",
        provider: { id: selection.providerId || "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input);
      return {
        message: { role: "assistant", content: `final ${calls.length}` },
        toolCalls: [],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
        raw: { choices: [{ message: { content: `final ${calls.length}` } }] }
      };
    },
    async runAgentTurn() {
      throw new Error("AgentRuntime.run must use provider.complete, not runAgentTurn");
    }
  };
  const { agentsDir, runtime } = await createRuntimeHarness({ provider });
  await fs.mkdir(path.join(agentsDir, "Ada", "memory", "long-term"), { recursive: true });
  await fs.writeFile(
    path.join(agentsDir, "Ada", "memory", "long-term", "facts.jsonl"),
    `${JSON.stringify({ id: "fact_runtime_boundary", text: "Long-term canonical runtime boundary fact." })}\n`,
    "utf8"
  );
  const agentMemory = new AgentMemoryStore({
    agentDir: path.join(agentsDir, "Ada"),
    agentName: "Ada",
    role: "engineer"
  });
  await agentMemory.recordContextNeeds({
    needs: [{
      category: "acceptance",
      priority: "high",
      question: "Which acceptance examples define done for the runtime boundary?",
      whyItMatters: "Acceptance examples prevent the Agent from overfitting to implementation details.",
      suggestedMemoryKind: "fact"
    }],
    source: { mode: "context_audit" }
  });

  const first = await runtime.run({
    agentName: "Ada",
    inputText: "Build the Agent Framework runtime boundary.",
    hostContext: { engineRunId: "run_secret_context" }
  });
  const second = await runtime.run({
    agentName: "Ada",
    sessionId: first.sessionId,
    inputText: "Continue the same runtime session."
  });

  assert.equal(first.finalText, "final 1");
  assert.equal(second.finalText, "final 2");
  assert.equal(second.sessionId, first.sessionId);
  assert.ok(first.trace.traceId.startsWith("trace_"));
  const sessionPath = path.join(agentsDir, "Ada", "memory", "sessions", `${first.sessionId}.json`);
  const tracePath = path.join(agentsDir, "Ada", "traces", `${first.trace.traceId}.json`);
  const session = await readJson(sessionPath);
  const trace = await readJson(tracePath);

  assert.equal(session.agentName, "Ada");
  assert.equal(session.recentTurns.length, 2);
  assert.equal(session.recentTurns[0].inputText, "Build the Agent Framework runtime boundary.");
  assert.equal(session.recentTurns[1].finalText, "final 2");
  assert.equal(trace.finalText, "final 1");
  assert.equal(trace.sessionId, first.sessionId);
  assert.ok(trace.modelCalls[0].submittedMessages.some((message) => String(message.content || "").includes("Build the Agent Framework runtime boundary.")));
  assert.ok(trace.modelCalls[0].submittedMessages.some((message) => String(message.content || "").includes("ADA AGENTS PROMPT")));
  assert.equal(calls[0].messages.filter((message) => message.role === "system").length, 1);
  assert.match(calls[0].messages[0].content, /## runtime\.system[\s\S]*## agent\.agents_md/);

  const firstPrompt = calls[0].messages.map((message) => message.content || "").join("\n");
  const secondPrompt = calls[1].messages.map((message) => message.content || "").join("\n");
  assert.match(firstPrompt, /ADA AGENTS PROMPT/);
  assert.match(firstPrompt, /Build the Agent Framework runtime boundary/);
  assert.match(firstPrompt, /Long-term canonical runtime boundary fact/);
  assert.match(firstPrompt, /Which acceptance examples define done for the runtime boundary/);
  assert.equal(firstPrompt.includes("run_secret_context"), false);
  assert.match(secondPrompt, /final 1/);

  const blocks = Object.fromEntries(first.trace.contextBlocks.map((block) => [block.id, block]));
  assert.equal(blocks["agent.agents_md"].compressible, false);
  assert.equal(blocks["assignment.current"].compressible, false);
  assert.equal(blocks["memory.long_term.selected"].compressible, false);
  assert.equal(blocks["memory.context_needs.open"].compressible, false);
});

test("AgentRuntime.run writes live trace snapshots during tool loops", async () => {
  const providerCalls = [];
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      providerCalls.push(input);
      if (providerCalls.length === 1) {
        await input.onProviderEvent?.({ type: "delta", delta: "streaming ", text: "streaming " });
        await input.onProviderEvent?.({ type: "delta", delta: "answer", text: "streaming answer" });
        return {
          message: { role: "assistant", content: null },
          toolCalls: [{
            id: "call_live_probe",
            type: "function",
            function: {
              name: "Bash",
              arguments: JSON.stringify({ command: "echo live" })
            }
          }]
        };
      }
      return {
        message: { role: "assistant", content: "live trace final" },
        toolCalls: []
      };
    }
  };
  const { agentsDir, runtime } = await createRuntimeHarness({ provider, tools: ["Bash"] });
  runtime.toolExecutor = {
    async invoke(request) {
      const liveTrace = await readJson(path.join(agentsDir, "Ada", "traces", "trace_live_probe.json"));
      assert.equal(liveTrace.traceId, "trace_live_probe");
      assert.equal(liveTrace.modelCalls.length, 1);
      assert.equal(liveTrace.modelCalls[0].streamText, "streaming answer");
      assert.equal(liveTrace.modelCalls[0].toolCalls[0].name, "Bash");
      return {
        toolId: request.toolId,
        role: request.role,
        status: "completed",
        output: { stdout: "live\n", exitCode: 0 }
      };
    }
  };

  const result = await runtime.run({
    agentName: "Ada",
    inputText: "Use a tool while live trace is visible.",
    traceId: "trace_live_probe"
  });

  assert.equal(result.finalText, "live trace final");
  const finalTrace = await readJson(path.join(agentsDir, "Ada", "traces", "trace_live_probe.json"));
  assert.equal(finalTrace.toolCalls.length, 1);
  assert.deepEqual(finalTrace.toolCalls[0].output, { stdout: "live\n", exitCode: 0 });
});

test("AgentRuntime.run replays prior turn context verbatim before appending the next turn", async () => {
  const calls = [];
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input.messages);
      return {
        message: { role: "assistant", content: `prefix final ${calls.length}` },
        toolCalls: [],
        raw: { choices: [{ message: { content: `prefix final ${calls.length}` } }] }
      };
    }
  };
  const { agentsDir, runtime } = await createRuntimeHarness({ provider });
  await fs.mkdir(path.join(agentsDir, "Ada", "memory", "long-term"), { recursive: true });
  await fs.writeFile(
    path.join(agentsDir, "Ada", "memory", "long-term", "facts.jsonl"),
    [
      JSON.stringify({ id: "fact_prefix_kiwi", text: "kiwi-only retained retrieval fact." }),
      JSON.stringify({ id: "fact_prefix_mango", text: "mango-only appended retrieval fact." })
    ].join("\n") + "\n",
    "utf8"
  );

  const first = await runtime.run({
    agentName: "Ada",
    inputText: "FIRST TURN ACTUAL CONTENT kiwi " + "a".repeat(4200)
  });
  await runtime.run({
    agentName: "Ada",
    sessionId: first.sessionId,
    inputText: "SECOND TURN ACTUAL CONTENT mango"
  });

  assert.equal(calls.length, 2);
  assert.ok(calls[0].some((message) => String(message.content || "").includes("kiwi-only retained retrieval fact")));
  assert.equal(calls[0].some((message) => String(message.content || "").includes("mango-only appended retrieval fact")), false);
  assert.deepEqual(calls[1].slice(0, calls[0].length), calls[0]);
  assert.deepEqual(calls[1][calls[0].length], {
    role: "assistant",
    content: "prefix final 1"
  });
  assert.ok(calls[1].some((message) => String(message.content || "").includes("SECOND TURN ACTUAL CONTENT")));
  const appendedMessages = calls[1].slice(calls[0].length + 1);
  assert.ok(appendedMessages.some((message) => String(message.content || "").includes("mango-only appended retrieval fact")));

  const sessionPath = path.join(agentsDir, "Ada", "memory", "sessions", `${first.sessionId}.json`);
  const session = await readJson(sessionPath);
  assert.equal(session.recentTurns.length, 2);
  assert.ok(session.recentTurns[0].inputText.includes("a".repeat(4200)));
  assert.deepEqual(session.prefixMessages.slice(0, calls[0].length), calls[0]);
  assert.deepEqual(session.prefixMessages[calls[0].length], {
    role: "assistant",
    content: "prefix final 1"
  });
});

test("AgentRuntime seeds workspace once in the stable system prompt", async () => {
  const calls = [];
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input.messages);
      return {
        message: { role: "assistant", content: `workspace final ${calls.length}` },
        toolCalls: []
      };
    }
  };
  const { agentsDir, runtime } = await createRuntimeHarness({ provider, tools: ["Bash"] });
  const firstWorkspace = path.join(agentsDir, "project-one");
  const secondWorkspace = path.join(agentsDir, "project-two");
  await fs.mkdir(firstWorkspace, { recursive: true });
  await fs.mkdir(secondWorkspace, { recursive: true });

  const first = await runtime.run({
    agentName: "Ada",
    inputText: "Use the project workspace.",
    hostContext: { workspace: firstWorkspace }
  });
  await runtime.run({
    agentName: "Ada",
    sessionId: first.sessionId,
    inputText: "Continue in the existing session.",
    hostContext: { workspace: secondWorkspace }
  });

  const session = await readJson(path.join(agentsDir, "Ada", "memory", "sessions", `${first.sessionId}.json`));
  const forkSeed = session.fork.seedMessages.map((message) => message.content || "").join("\n");
  assert.match(forkSeed, new RegExp(`Current workspace: ${firstWorkspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.equal(forkSeed.includes(secondWorkspace), false);
  const firstPrompt = calls[0].map((message) => message.content || "").join("\n");
  const secondPrompt = calls[1].map((message) => message.content || "").join("\n");
  assert.equal(firstPrompt.split(firstWorkspace).length - 1, 1);
  assert.equal(secondPrompt.split(firstWorkspace).length - 1, 1);
  assert.equal(secondPrompt.includes(secondWorkspace), false);
});

test("AgentRuntime.run no longer depends on an injected ContextBuilder to render provider messages", async () => {
  const calls = [];
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input.messages);
      return {
        message: { role: "assistant", content: "session rendered final" },
        toolCalls: []
      };
    }
  };
  const contextBuilder = {
    build() {
      throw new Error("ContextBuilder should not render provider messages");
    },
    applyBudget() {
      throw new Error("ContextBuilder should not budget provider messages");
    },
    messagesFor() {
      throw new Error("ContextBuilder should not produce provider messages");
    },
    metadataFor() {
      throw new Error("ContextBuilder should not own trace metadata");
    }
  };
  const { runtime } = await createRuntimeHarness({ provider, configPatch: {}, tools: ["Bash"] });
  runtime.contextBuilder = contextBuilder;

  const result = await runtime.run({
    agentName: "Ada",
    inputText: "Render this turn through Session-owned provider messages."
  });

  assert.equal(result.finalText, "session rendered final");
  const prompt = calls[0].map((message) => message.content || "").join("\n");
  assert.match(prompt, /ADA AGENTS PROMPT/);
  assert.match(prompt, /Render this turn through Session-owned provider messages/);
});

test("AgentRuntime.run records Session as a memory fork and protects first and latest user queries from compression", async () => {
  const calls = [];
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input.messages);
      return {
        message: { role: "assistant", content: `fork final ${calls.length}` },
        toolCalls: []
      };
    }
  };
  const { agentsDir, runtime } = await createRuntimeHarness({ provider });
  await fs.mkdir(path.join(agentsDir, "Ada", "memory", "long-term"), { recursive: true });
  await fs.writeFile(
    path.join(agentsDir, "Ada", "memory", "long-term", "facts.jsonl"),
    `${JSON.stringify({ id: "fact_session_fork", text: "session fork boundary retained seed fact." })}\n`,
    "utf8"
  );
  const agentMemory = new AgentMemoryStore({
    agentDir: path.join(agentsDir, "Ada"),
    agentName: "Ada",
    role: "engineer"
  });
  await agentMemory.recordContextNeeds({
    needs: [{
      category: "runtime",
      priority: "high",
      question: "Which context boundary should the session fork preserve?",
      whyItMatters: "The fork seed should explain what memory was selected.",
      suggestedMemoryKind: "fact"
    }],
    source: { mode: "context_audit" }
  });

  const first = await runtime.run({
    agentName: "Ada",
    inputText: "FIRST USER QUERY asks about session fork boundary and must stay literal."
  });
  await runtime.run({
    agentName: "Ada",
    sessionId: first.sessionId,
    inputText: "SECOND USER QUERY may later be compressed."
  });
  await runtime.run({
    agentName: "Ada",
    sessionId: first.sessionId,
    inputText: "THIRD USER QUERY is the latest and must stay literal."
  });

  assert.equal(calls.length, 3);
  const session = await readJson(path.join(agentsDir, "Ada", "memory", "sessions", `${first.sessionId}.json`));
  assert.equal(session.fork.source, "memory");
  assert.equal(session.fork.systemPromptOwner, "agent_runtime");
  const forkSeed = session.fork.seedMessages.map((message) => message.content || "").join("\n");
  assert.match(forkSeed, /ADA AGENTS PROMPT/);
  assert.match(forkSeed, /session fork boundary retained seed fact/);
  assert.match(forkSeed, /Which context boundary should the session fork preserve/);
  assert.equal(forkSeed.includes("FIRST USER QUERY"), false);

  const userEvents = session.events.filter((event) => event.type === "user_query");
  assert.equal(userEvents.length, 3);
  assert.ok(userEvents[0].messages[0].content.includes("FIRST USER QUERY"));
  assert.ok(userEvents[1].messages[0].content.includes("SECOND USER QUERY"));
  assert.ok(userEvents[2].messages[0].content.includes("THIRD USER QUERY"));
  assert.equal(userEvents[0].compressible, false);
  assert.equal(userEvents[0].compressionReason, "first_user_query");
  assert.equal(userEvents[1].compressible, true);
  assert.equal(userEvents[1].compressionReason, "session_middle_history");
  assert.equal(userEvents[2].compressible, false);
  assert.equal(userEvents[2].compressionReason, "latest_user_query");
  assert.deepEqual(session.compression.protectedEventIds.sort(), [userEvents[0].id, userEvents[2].id].sort());
  assert.ok(session.compression.eligibleEventIds.includes(userEvents[1].id));
  const firstAssistantEvent = session.events.find((event) => event.type === "assistant_response" && event.turnNumber === 1);
  assert.equal(firstAssistantEvent.compressible, true);
  assert.equal(firstAssistantEvent.compressionReason, "session_middle_history");
});

test("AgentRuntime.run lets Session request model compression through an AgentRuntime provider callback", async () => {
  const calls = [];
  let compressionRequestCount = 0;
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input);
      if (input.purpose === "session_compression") {
        compressionRequestCount += 1;
        const prompt = input.messages.map((message) => message.content || "").join("\n");
        if (compressionRequestCount === 1) {
          assert.match(prompt, /normal final 1/);
          assert.doesNotMatch(prompt, /FIRST USER QUERY protected/);
          assert.doesNotMatch(prompt, /SECOND USER QUERY compressible middle history/);
        } else if (compressionRequestCount === 2) {
          assert.match(prompt, /SECOND USER QUERY compressible middle history/);
          assert.doesNotMatch(prompt, /FIRST USER QUERY protected/);
          assert.doesNotMatch(prompt, /THIRD USER QUERY protected latest/);
          assert.doesNotMatch(prompt, /FOURTH USER QUERY should see compressed replay/);
        } else {
          assert.match(prompt, /THIRD USER QUERY protected latest/);
          assert.doesNotMatch(prompt, /FIRST USER QUERY protected/);
          assert.doesNotMatch(prompt, /FOURTH USER QUERY should see compressed replay/);
        }
        return {
          message: { role: "assistant", content: compressionRequestCount === 1 ? "COMPRESSED FIRST ASSISTANT SUMMARY" : compressionRequestCount === 2 ? "COMPRESSED MIDDLE HISTORY SUMMARY" : "COMPRESSED LATER HISTORY SUMMARY" },
          toolCalls: []
        };
      }
      return {
        message: { role: "assistant", content: `normal final ${calls.filter((call) => call.purpose !== "session_compression").length}` },
        toolCalls: []
      };
    }
  };
  const { agentsDir, runtime } = await createRuntimeHarness({
    provider,
    configPatch: {
      context: {
        sessionCompressionMinEligibleEvents: 1,
        maxPromptChars: 100,
        compressionThresholdRatio: 0.1
      }
    }
  });

  const first = await runtime.run({
    agentName: "Ada",
    inputText: "FIRST USER QUERY protected."
  });
  await runtime.run({
    agentName: "Ada",
    sessionId: first.sessionId,
    inputText: "SECOND USER QUERY compressible middle history."
  });
  await runtime.run({
    agentName: "Ada",
    sessionId: first.sessionId,
    inputText: "THIRD USER QUERY protected latest."
  });
  await runtime.run({
    agentName: "Ada",
    sessionId: first.sessionId,
    inputText: "FOURTH USER QUERY should see compressed replay."
  });

  const normalCalls = calls.filter((call) => call.purpose !== "session_compression");
  const fourthPrompt = normalCalls.at(-1).messages.map((message) => message.content || "").join("\n");
  assert.match(fourthPrompt, /COMPRESSED MIDDLE HISTORY SUMMARY/);
  assert.match(fourthPrompt, /FIRST USER QUERY protected/);
  assert.match(fourthPrompt, /THIRD USER QUERY protected latest/);
  assert.match(fourthPrompt, /FOURTH USER QUERY should see compressed replay/);
  assert.doesNotMatch(fourthPrompt, /SECOND USER QUERY compressible middle history/);
  const compressionCalls = calls.filter((call) => call.purpose === "session_compression");
  assert.ok(compressionCalls.length >= 1);
  const session = await readJson(path.join(agentsDir, "Ada", "memory", "sessions", `${first.sessionId}.json`));
  assert.equal(session.compression.status, "compressed");
  assert.equal(session.compressions[0].summaryMessage.role, "system");
  assert.equal(session.compressions[0].summaryMessage.content, "COMPRESSED FIRST ASSISTANT SUMMARY");
  assert.ok(session.compressions[0].coveredEventIds.every((id) => !session.compression.protectedEventIds.includes(id)));
  const replayPrefixText = session.prefixMessages.map((message) => message.content || "").join("\n");
  assert.match(replayPrefixText, /COMPRESSED MIDDLE HISTORY SUMMARY/);
  assert.match(replayPrefixText, /COMPRESSED LATER HISTORY SUMMARY/);
  assert.match(replayPrefixText, /FIRST USER QUERY protected/);
  assert.match(replayPrefixText, /FOURTH USER QUERY should see compressed replay/);
  assert.doesNotMatch(replayPrefixText, /SECOND USER QUERY compressible middle history/);
  assert.doesNotMatch(replayPrefixText, /THIRD USER QUERY protected latest/);
  const protectedUserEvents = session.events.filter((event) => event.type === "user_query" && !event.compressible);
  assert.ok(protectedUserEvents[0].messages[0].content.includes("FIRST USER QUERY protected"));
  assert.ok(protectedUserEvents.at(-1).messages[0].content.includes("FOURTH USER QUERY should see compressed replay"));
});

test("AgentRuntime.run makes memory tools implicit and routes normal memory.write to Agent memory", async () => {
  const calls = [];
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input);
      if (calls.length === 1) {
        const toolNames = input.tools.map((tool) => tool.function.name);
        assert.ok(toolNames.includes("memory_write"));
        assert.ok(!toolNames.includes("memory.write"));
        return {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_memory_write",
                type: "function",
                function: {
                  name: "memory_write",
                  arguments: JSON.stringify({ value: "Remember that AgentRuntime owns memory writes now." })
                }
              }
            ]
          },
          toolCalls: [
            {
              id: "call_memory_write",
              type: "function",
              function: {
                name: "memory_write",
                arguments: JSON.stringify({ value: "Remember that AgentRuntime owns memory writes now." })
              }
            }
          ],
          raw: { choices: [{ message: { tool_calls: ["omitted"] } }] }
        };
      }
      assert.ok(input.messages.some(
        (message) =>
          message.role === "tool" &&
          message.tool_call_id === "call_memory_write" &&
          String(message.content).includes("AgentRuntime owns memory writes")
      ));
      return {
        message: { role: "assistant", content: "memory stored" },
        toolCalls: [],
        raw: { choices: [{ message: { content: "memory stored" } }] }
      };
    }
  };
  const { agentsDir, runtime, toolRegistry } = await createRuntimeHarness({ provider, tools: ["Bash"] });
  assert.equal(toolRegistry.allowed("engineer", "memory.write"), false);

  const result = await runtime.run({
    agentName: "Ada",
    inputText: "Store a normal memory item without layer or key."
  });

  assert.equal(result.finalText, "memory stored");
  assert.equal(calls.length, 2);
  const eventsDir = path.join(agentsDir, "Ada", "memory", "episodic", "events");
  const eventFiles = await fs.readdir(eventsDir);
  const eventTexts = await Promise.all(eventFiles.map((file) => fs.readFile(path.join(eventsDir, file), "utf8")));
  assert.ok(eventTexts.some((text) => text.includes("AgentRuntime owns memory writes now.")));
  assert.ok(eventTexts.some((text) => text.includes(result.trace.traceId)));
});

test("AgentRuntime.run returns recoverable tool failures to the model loop", async () => {
  const calls = [];
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input);
      if (calls.length === 1) {
        return {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_missing_file",
              type: "function",
              function: {
                name: "Bash",
                arguments: JSON.stringify({ command: "cat does-not-exist.txt" })
              }
            }]
          },
          toolCalls: [{
            id: "call_missing_file",
            type: "function",
            function: {
              name: "Bash",
              arguments: JSON.stringify({ command: "cat does-not-exist.txt" })
            }
          }]
        };
      }
      const toolMessage = input.messages.find((message) => message.role === "tool" && message.tool_call_id === "call_missing_file");
      assert.ok(toolMessage);
      assert.match(String(toolMessage.content), /failed/);
      assert.match(String(toolMessage.content), /does-not-exist/);
      return {
        message: { role: "assistant", content: "I saw the missing file and can recover." },
        toolCalls: []
      };
    }
  };
  const { runtime } = await createRuntimeHarness({ provider, tools: ["Bash"] });

  const result = await runtime.run({
    agentName: "Ada",
    inputText: "Try reading a missing file and explain the failure."
  });

  assert.equal(result.finalText, "I saw the missing file and can recover.");
  assert.equal(calls.length, 2);
  assert.equal(result.trace.toolCalls[0].status, "failed");
});

test("AgentRuntime.run fails immediately on non-recoverable tool authorization errors", async () => {
  const calls = [];
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input);
      return {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_unauthorized_bash",
            type: "function",
            function: {
              name: "Bash",
              arguments: JSON.stringify({ command: "pwd" })
            }
          }]
        },
        toolCalls: [{
          id: "call_unauthorized_bash",
          type: "function",
          function: {
            name: "Bash",
            arguments: JSON.stringify({ command: "pwd" })
          }
        }]
      };
    }
  };
  const { runtime } = await createRuntimeHarness({ provider, tools: [] });

  await assert.rejects(
    () => runtime.run({
      agentName: "Ada",
      inputText: "Try using an unauthorized tool."
    }),
    /tool Bash is not allowed for role engineer/
  );
  assert.equal(calls.length, 1);
});

test("AgentRuntime.run applies context budget and records retained and dropped context blocks", async () => {
  const calls = [];
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input);
      const prompt = input.messages.map((message) => message.content || "").join("\n");
      assert.match(prompt, /CURRENT BUDGETED ASSIGNMENT MUST STAY|Warm up budget session/);
      return {
        message: { role: "assistant", content: `budget final ${calls.length}` },
        toolCalls: [],
        raw: { choices: [{ message: { content: `budget final ${calls.length}` } }] }
      };
    }
  };
  const { agentsDir, runtime } = await createRuntimeHarness({
    provider,
    configPatch: { context: { maxPromptChars: 600 } }
  });
  await fs.mkdir(path.join(agentsDir, "Ada", "memory", "long-term"), { recursive: true });
  await fs.writeFile(
    path.join(agentsDir, "Ada", "memory", "long-term", "facts.jsonl"),
    Array.from({ length: 18 }, (_, index) =>
      JSON.stringify({ id: `fact_budget_${index}`, text: `CANONICAL BUDGETED ASSIGNMENT FACT ${index} ${"x".repeat(140)}` })
    ).join("\n") + "\n",
    "utf8"
  );
  const first = await runtime.run({
    agentName: "Ada",
    inputText: "Warm up budget session."
  });

  const second = await runtime.run({
    agentName: "Ada",
    sessionId: first.sessionId,
    inputText: "CURRENT BUDGETED ASSIGNMENT MUST STAY"
  });

  const blocks = second.trace.contextBlocks;
  const longTerm = blocks.find((block) => block.id === "memory.long_term.selected");
  assert.ok(longTerm.retained);
  assert.equal(longTerm.compressible, false);
  assert.equal(longTerm.budgetReason, "long_term_entries_reduced");
  assert.ok(blocks.find((block) => block.id === "assignment.current").retained);
  assert.equal(blocks.some((block) => block.id === "turn.active_loop_tail"), false);
});

test("AgentRuntime.run can persist a public session input separate from the full assignment", async () => {
  const provider = {
    async resolveTurnConfig(selection = {}) {
      return {
        providerId: selection.providerId || "test-openai",
        runner: "openai_compatible",
        model: selection.model || "test-model",
        provider: { id: selection.providerId || "test-openai", runner: "openai_compatible" }
      };
    },
    async complete() {
      return {
        message: { role: "assistant", content: "收到，我会先判断是否需要立项。" },
        toolCalls: []
      };
    }
  };
  const { agentsDir, runtime } = await createRuntimeHarness({ provider });

  const result = await runtime.run({
    agentName: "Franklin",
    sessionId: "ceo_cto:dashboard:dashboard",
    inputText: "INTERNAL ASSIGNMENT\n\ntext: 我们聊一下下个大方向",
    sessionInputText: "我们聊一下下个大方向"
  });

  const sessionPath = path.join(agentsDir, "Franklin", "memory", "sessions", "ceo_cto-dashboard-dashboard.json");
  const session = await readJson(sessionPath);
  assert.equal(result.sessionId, "ceo_cto:dashboard:dashboard");
  assert.equal(session.recentTurns[0].inputText, "我们聊一下下个大方向");
  assert.equal(session.recentTurns[0].inputText.includes("INTERNAL ASSIGNMENT"), false);
});

test("AgentRuntime.run redacts tool output before session persistence and prompt replay", async () => {
  const calls = [];
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input);
      if (calls.length === 1) {
        return {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_read_secret_fixture",
                type: "function",
                function: {
                  name: "Bash",
                  arguments: JSON.stringify({ command: "cat secret-fixture.txt" })
                }
              }
            ]
          },
          toolCalls: [
            {
              id: "call_read_secret_fixture",
              type: "function",
              function: {
                name: "Bash",
                arguments: JSON.stringify({ command: "cat secret-fixture.txt" })
              }
            }
          ]
        };
      }
      if (calls.length === 3) {
        const replayedPrompt = input.messages.map((message) => message.content || "").join("\n");
        assert.equal(replayedPrompt.includes("sk-testsecret12345"), false);
        assert.equal(replayedPrompt.includes("TOKEN=secret-token-value"), false);
        assert.ok(replayedPrompt.includes("[redacted]"));
      }
      return {
        message: { role: "assistant", content: `final ${calls.length}` },
        toolCalls: []
      };
    }
  };
  const { dataDir, agentsDir, runtime } = await createRuntimeHarness({ provider, tools: ["Bash"] });
  await fs.writeFile(path.join(dataDir, "secret-fixture.txt"), "api sk-testsecret12345 TOKEN=secret-token-value\n", "utf8");

  const first = await runtime.run({
    agentName: "Ada",
    inputText: "Read the secret fixture."
  });
  await runtime.run({
    agentName: "Ada",
    sessionId: first.sessionId,
    inputText: "Continue after reading the fixture."
  });

  const sessionRaw = await fs.readFile(path.join(agentsDir, "Ada", "memory", "sessions", `${first.sessionId}.json`), "utf8");
  assert.equal(sessionRaw.includes("sk-testsecret12345"), false);
  assert.equal(sessionRaw.includes("TOKEN=secret-token-value"), false);
  assert.ok(sessionRaw.includes("[redacted]"));
});

test("AgentRuntime.run recursively redacts nested neutral-key trace strings and arrays", async () => {
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete() {
      return {
        message: {
          role: "assistant",
          content: "redacted trace"
        },
        toolCalls: [],
        raw: {
          neutral: [
            "sk-testsecret12345",
            { notes: ["TOKEN=trace-token-value", { text: "Bearer abc.def.ghi" }] }
          ]
        }
      };
    }
  };
  const { agentsDir, runtime } = await createRuntimeHarness({ provider });

  const result = await runtime.run({
    agentName: "Ada",
    inputText: "Produce trace redaction."
  });

  const traceRaw = await fs.readFile(path.join(agentsDir, "Ada", "traces", `${result.trace.traceId}.json`), "utf8");
  assert.equal(traceRaw.includes("sk-testsecret12345"), false);
  assert.equal(traceRaw.includes("trace-token-value"), false);
  assert.equal(traceRaw.includes("abc.def.ghi"), false);
  assert.ok(traceRaw.includes("[redacted]"));
});

test("AgentMemoryStore creates unique event files for same millisecond and trace", async () => {
  const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-memory-collision-"));
  const fixed = new Date("2026-05-23T01:02:03.004Z");
  const memory = new AgentMemoryStore({
    agentDir,
    agentName: "Ada",
    role: "engineer",
    clock: () => fixed
  });

  await memory.recordEvent({
    title: "Memory Write",
    summary: "first event",
    sessionId: "sess_same",
    traceId: "trace_same"
  });
  await memory.recordEvent({
    title: "Memory Write",
    summary: "second event",
    sessionId: "sess_same",
    traceId: "trace_same"
  });

  const eventsDir = path.join(agentDir, "memory", "episodic", "events");
  const files = await fs.readdir(eventsDir);
  const contents = await Promise.all(files.map((file) => fs.readFile(path.join(eventsDir, file), "utf8")));
  assert.equal(files.length, 2);
  assert.ok(contents.some((content) => content.includes("first event")));
  assert.ok(contents.some((content) => content.includes("second event")));
});

test("AgentRuntime.run exposes custom tool parameter schemas in provider tools", async () => {
  const calls = [];
  const toolRegistry = new ToolRegistry({
    tools: DEFAULT_TOOLS.map((tool) =>
      tool.id === "Bash"
        ? {
            ...tool,
            parameters: {
              type: "object",
              required: ["command"],
              properties: {
                command: { type: "string" }
              }
            }
          }
        : tool
    ).concat([
      {
        id: "custom.noop",
        category: "test",
        description: "Unused custom tool.",
        risk: "low"
      }
    ]),
    roleAllowlist: {
      engineer: ["Bash"],
      ceo_cto: [],
      product_manager: [],
      qa: [],
      customer_success: [],
      operations: []
    }
  });
  const provider = {
    async resolveTurnConfig() {
      return {
        providerId: "test-openai",
        runner: "openai_compatible",
        model: "test-model",
        provider: { id: "test-openai", runner: "openai_compatible" }
      };
    },
    async complete(input) {
      calls.push(input);
      return {
        message: { role: "assistant", content: "schema exposed" },
        toolCalls: []
      };
    }
  };
  const { runtime } = await createRuntimeHarness({ provider, toolRegistry, tools: ["Bash"] });

  await runtime.run({
    agentName: "Ada",
    inputText: "Check custom tool schema."
  });

  const bashTool = calls[0].tools.find((tool) => tool.function.name === "Bash");
  assert.deepEqual(bashTool.function.parameters.required, ["command"]);
  assert.deepEqual(bashTool.function.parameters.properties.command, { type: "string" });
});

test("AgentRuntime.run sends a generic tool protocol before the final assignment for codex app-server", async () => {
  const calls = [];
  const provider = {
    async resolveTurnConfig(selection = {}) {
      return {
        providerId: selection.providerId || "codex",
        runner: "codex_app_server",
        model: selection.model || "test-model",
        provider: { id: selection.providerId || "codex", runner: "codex_app_server" }
      };
    },
    async complete(input) {
      calls.push(input);
      return {
        message: { role: "assistant", content: "codex schema prompt ready" },
        toolCalls: []
      };
    }
  };
  const { agentConfigStore, runtime } = await createRuntimeHarness({ provider, tools: ["Bash"] });
  await agentConfigStore.update("engineer", {
    skills: [{ id: "patching", description: "Patch code safely." }],
    mcps: [{
      mcpServers: {
        github: {
          url: "https://example.com/mcp",
          tools: [{
            name: "search_issues",
            description: "Search GitHub issues.",
            inputSchema: {
              type: "object",
              required: ["query"],
              properties: { query: { type: "string" } }
            }
          }]
        }
      }
    }],
    tools: ["Bash", "github.search_issues"]
  });

  await runtime.run({
    agentName: "Ada",
    inputText: "Check codex tool protocol context."
  });

  const submittedText = calls[0].messages.map((message) => String(message.content || "")).join("\n\n");
  assert.deepEqual(calls[0].messages.map((message) => message.role), ["system", "user"]);
  assert.match(submittedText, /## tool\.protocol/);
  assert.match(submittedText, /## Tool Protocol/);
  assert.doesNotMatch(submittedText, /AI Team Tool Protocol/);
  assert.doesNotMatch(submittedText, /## tool\.policy_allowlist/);
  assert.doesNotMatch(submittedText, /## tool\.schemas/);
  assert.match(submittedText, /## skills\.metadata/);
  assert.match(submittedText, /Installed Skills/);
  assert.match(submittedText, /- patching: Patch code safely\./);
  assert.doesNotMatch(submittedText, /## mcp\.metadata/);
  assert.ok(submittedText.indexOf("## skills.metadata") < submittedText.indexOf("## tool.protocol"));
  assert.ok(submittedText.indexOf("## tool.protocol") < submittedText.indexOf("## assignment.current"));
  assert.ok(calls[0].messages.at(-1).content.includes("## assignment.current"));
  assert.ok(calls[0].tools.some((tool) => tool.function.name === "Bash"));
  const skillTool = calls[0].tools.find((tool) => tool.function.name === "skill");
  assert.ok(skillTool);
  assert.equal(skillTool.function.description, "Read an installed Skill markdown file by name.");
  assert.equal("enum" in skillTool.function.parameters.properties.name, false);
  assert.doesNotMatch(submittedText, /parameters: .*"name".*"patching"/s);
  assert.doesNotMatch(submittedText, /enabled Skill/i);
  const githubTool = calls[0].tools.find((tool) => tool.function.name === "github_search_issues");
  assert.ok(githubTool);
  assert.equal(githubTool.function.description, "Search GitHub issues.");
  assert.deepEqual(githubTool.function.parameters.required, ["query"]);
  assert.doesNotMatch(submittedText, /MCP|mcpServers|mcp\.metadata/);
});
