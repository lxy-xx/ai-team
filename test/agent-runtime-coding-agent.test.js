import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentRuntime } from "../src/agent-framework/application/agent-runtime.js";
import { ToolRegistry } from "../src/agent-framework/domain/tools/tool-registry.js";
import { MemoryStore } from "../src/agent-framework/infrastructure/memory-store.js";

test("AgentRuntime waits for pending Coding Agent jobs before accepting a final answer", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-runtime-coding-agent-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry({
    roleAllowlist: {
      engineer: ["coding_agent.start", "coding_agent.wait"]
    }
  });
  const invocations = [];
  const providerMessages = [];
  const provider = {
    async complete(input) {
      providerMessages.push(input.messages);
      if (providerMessages.length === 1) {
        return {
          message: { role: "assistant", content: null },
          toolCalls: [{
            id: "call_start",
            type: "function",
            function: {
              name: "coding_agent_start",
              arguments: JSON.stringify({ prompt: "Implement the change" })
            }
          }]
        };
      }
      if (providerMessages.length === 2) {
        return { message: { role: "assistant", content: "Premature final answer." }, toolCalls: [] };
      }
      return { message: { role: "assistant", content: "Final answer after Coding Agent completed." }, toolCalls: [] };
    }
  };
  const toolExecutor = {
    async invoke(request) {
      invocations.push(request);
      if (request.toolId === "coding_agent.start") {
        return {
          toolId: "coding_agent.start",
          role: request.role,
          status: "completed",
          output: {
            kind: "coding_agent_job",
            job: { jobId: "async_job_1", state: "running" }
          }
        };
      }
      if (request.toolId === "coding_agent.wait") {
        return {
          toolId: "coding_agent.wait",
          role: request.role,
          status: "completed",
          output: {
            jobs: [{ jobId: "async_job_1", state: "completed", stdout: "Coding Agent result payload" }]
          }
        };
      }
      throw new Error(`unexpected tool: ${request.toolId}`);
    }
  };
  const runtime = new AgentRuntime({
    memory,
    toolRegistry,
    provider,
    toolExecutor,
    config: { rootDir: dataDir, dataDir, workspace: dataDir }
  });

  const result = await runtime.run({ agentName: "engineer", inputText: "Ship this change" });

  assert.equal(result.finalText, "Final answer after Coding Agent completed.");
  assert.deepEqual(invocations.map((item) => item.toolId), ["coding_agent.start", "coding_agent.wait"]);
  assert.equal(invocations[1].source, "agent_runtime_auto_wait");
  assert.deepEqual(invocations[1].input, { jobIds: ["async_job_1"] });
  assert.ok(providerMessages[2].some((message) => String(message.content || "").includes("Coding Agent result payload")));
  assert.equal(result.trace.toolCalls[1].source, "agent_runtime_auto_wait");
});

test("AgentRuntime keeps Coding Agent jobs pending when an explicit wait times out", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-agent-runtime-coding-agent-timeout-"));
  const memory = new MemoryStore({ dataDir });
  await memory.init();
  const toolRegistry = new ToolRegistry({
    roleAllowlist: {
      engineer: ["coding_agent.start", "coding_agent.wait"]
    }
  });
  const invocations = [];
  const providerMessages = [];
  const provider = {
    async complete(input) {
      providerMessages.push(input.messages);
      if (providerMessages.length === 1) {
        return {
          message: { role: "assistant", content: null },
          toolCalls: [{
            id: "call_start",
            type: "function",
            function: {
              name: "coding_agent_start",
              arguments: JSON.stringify({ prompt: "Implement the change" })
            }
          }]
        };
      }
      if (providerMessages.length === 2) {
        return {
          message: { role: "assistant", content: null },
          toolCalls: [{
            id: "call_wait",
            type: "function",
            function: {
              name: "coding_agent_wait",
              arguments: JSON.stringify({ jobId: "async_job_1", timeoutMs: 1 })
            }
          }]
        };
      }
      if (providerMessages.length === 3) {
        return { message: { role: "assistant", content: "Premature final answer after timed-out wait." }, toolCalls: [] };
      }
      return { message: { role: "assistant", content: "Final answer after auto wait result." }, toolCalls: [] };
    }
  };
  let waitCount = 0;
  const toolExecutor = {
    async invoke(request) {
      invocations.push(request);
      if (request.toolId === "coding_agent.start") {
        return {
          toolId: "coding_agent.start",
          role: request.role,
          status: "completed",
          output: {
            kind: "coding_agent_job",
            job: { jobId: "async_job_1", state: "running" }
          }
        };
      }
      if (request.toolId === "coding_agent.wait") {
        waitCount += 1;
        if (waitCount === 1) {
          return {
            toolId: "coding_agent.wait",
            role: request.role,
            status: "completed",
            output: {
              timedOut: true,
              jobs: [{ jobId: "async_job_1", state: "running", stdoutTail: "Still running" }]
            }
          };
        }
        return {
          toolId: "coding_agent.wait",
          role: request.role,
          status: "completed",
          output: {
            jobs: [{ jobId: "async_job_1", state: "completed", stdoutTail: "Final Coding Agent result" }]
          }
        };
      }
      throw new Error(`unexpected tool: ${request.toolId}`);
    }
  };
  const runtime = new AgentRuntime({
    memory,
    toolRegistry,
    provider,
    toolExecutor,
    config: { rootDir: dataDir, dataDir, workspace: dataDir }
  });

  const result = await runtime.run({ agentName: "engineer", inputText: "Ship this change" });

  assert.equal(result.finalText, "Final answer after auto wait result.");
  assert.deepEqual(invocations.map((item) => item.toolId), ["coding_agent.start", "coding_agent.wait", "coding_agent.wait"]);
  assert.equal(invocations[1].source, "agent_runtime");
  assert.equal(invocations[2].source, "agent_runtime_auto_wait");
  assert.ok(providerMessages[3].some((message) => String(message.content || "").includes("Final Coding Agent result")));
});
