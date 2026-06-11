import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createSystem } from "../src/system.js";
import { runOnce } from "../src/index.js";

const TEST_PROVIDER_ID = "local-openai-compatible";
const TEST_MODEL = "local-ai-team-test";

function jsonResponseForRole(role, prompt) {
  const taskId = prompt.match(/"id":\s*"(task_[^"]+)"/)?.[1];
  if (role === "product_manager") {
    return [
      "```json",
      JSON.stringify({
        kind: "task_graph",
        tasks: [
          {
            id: "implementation",
            title: "Implement runtime loop fix",
            description: "Make the real provider path produce a parseable implementation artifact.",
            dependencies: [],
            acceptanceCriteria: ["Implementation report is produced"]
          },
          {
            id: "customer-update",
            title: "Prepare customer update",
            description: "Explain the verified result to the requester.",
            dependencies: ["implementation"],
            acceptanceCriteria: ["Customer reply summarizes the completed work"]
          },
          {
            id: "operations-note",
            title: "Record operations note",
            description: "Capture the checks run for future operations handoff.",
            dependencies: ["implementation"],
            acceptanceCriteria: ["Runbook note includes verification status"]
          }
        ]
      }),
      "```"
    ].join("\n");
  }
  if (role === "engineer") {
    return JSON.stringify({
      kind: "implementation_report",
      taskId,
      summary: "Implemented the requested runtime behavior.",
      changedFiles: ["src/team-engine/adapters/agent-framework/worker-engine.js"],
      verification: ["npm test"]
    });
  }
  if (role === "qa") {
    return JSON.stringify({
      kind: "verification_report",
      taskId,
      verdict: "pass",
      findings: [],
      checks: ["validated implementation artifact"]
    });
  }
  if (role === "customer_success") {
    return JSON.stringify({
      kind: "customer_reply",
      taskId,
      message: "The runtime loop completed and QA passed."
    });
  }
  if (role === "operations") {
    return JSON.stringify({
      kind: "operations_runbook_note",
      taskId,
      message: "Recorded verification for the runtime loop."
    });
  }
  if (role === "ceo_cto") {
    return JSON.stringify({
      kind: "final_aggregation",
      message: "Done: all configured roles completed the loop."
    });
  }
  return JSON.stringify({ kind: "agent_output", message: `Unhandled role ${role}` });
}

async function startOpenAICompatibleServer() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || !request.url.endsWith("/chat/completions")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }

    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw || "{}");
    const prompt = (body.messages || []).map((message) => message.content || "").join("\n\n");
    const role = prompt.match(/^Role:\s*(.+)$/m)?.[1]?.trim() || "unknown";
    requests.push({ role, prompt, body });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: jsonResponseForRole(role, prompt)
          }
        }
      ]
    }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    requests,
    baseUrl: `http://${address.address}:${address.port}/v1`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

async function withEnv(patch, fn) {
  const previous = new Map(Object.keys(patch).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function writeProviderConfig(dataDir, baseUrl) {
  const providersDir = path.join(dataDir, "providers");
  await fs.mkdir(providersDir, { recursive: true });
  await fs.writeFile(
    path.join(providersDir, "providers.json"),
    JSON.stringify({
      defaultProviderId: TEST_PROVIDER_ID,
      providers: [
        {
          id: TEST_PROVIDER_ID,
          name: "Local OpenAI-compatible Test Provider",
          type: "openai_compatible",
          runner: "openai_compatible",
          authMode: "api_key",
          apiKeyEnv: "AI_TEAM_TEST_OPENAI_KEY",
          baseUrl,
          models: [TEST_MODEL],
          defaultModel: TEST_MODEL,
          enabled: true
        }
      ]
    }, null, 2)
  );
}

function singleEngineerTaskGraph() {
  return JSON.stringify({
    kind: "task_graph",
    tasks: [
      {
        id: "implementation",
        title: "Read runtime fixture",
        description: "Use Bash to read the runtime fixture before producing the implementation report.",
        dependencies: [],
        acceptanceCriteria: ["Implementation report includes the fixture contents"]
      }
    ]
  });
}

async function startToolCallingOpenAICompatibleServer() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || !request.url.endsWith("/chat/completions")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }

    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw || "{}");
    const prompt = body.messages?.find((message) => message.role === "user")?.content || "";
    const role = prompt.match(/^Role:\s*(.+)$/m)?.[1]?.trim() || "unknown";
    requests.push({ role, prompt, body });

    let message;
    if (role === "product_manager") {
      message = { role: "assistant", content: singleEngineerTaskGraph() };
    } else if (role === "engineer") {
      const toolResult = body.messages?.find((item) => item.role === "tool" && item.tool_call_id === "call_bash_fixture");
      if (!toolResult) {
        const requestedToolNames = (body.tools || []).map((tool) => tool.function?.name).filter(Boolean);
        const toolCallName = requestedToolNames.includes("Bash") ? "Bash" : "Bash";
        message = {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_bash_fixture",
              type: "function",
              function: {
                name: toolCallName,
                arguments: JSON.stringify({ command: "cat fixture.txt" })
              }
            }
          ]
        };
      } else {
        assert.match(String(toolResult.content), /runtime loop fixture/);
        const taskId = prompt.match(/"id":\s*"(task_[^"]+)"/)?.[1];
        message = {
          role: "assistant",
          content: JSON.stringify({
            kind: "implementation_report",
            taskId,
            summary: "Read fixture through ToolExecutor and produced the report.",
            changedFiles: ["fixture.txt"],
            verification: ["Bash returned runtime loop fixture"]
          })
        };
      }
    } else if (role === "qa") {
      const taskId = prompt.match(/"id":\s*"(task_[^"]+)"/)?.[1];
      message = {
        role: "assistant",
        content: JSON.stringify({
          kind: "verification_report",
          taskId,
          verdict: "pass",
          findings: [],
          checks: ["engineer artifact is structured JSON"]
        })
      };
    } else if (role === "ceo_cto") {
      message = {
        role: "assistant",
        content: JSON.stringify({
          kind: "final_aggregation",
          message: "Done: tool loop executed through ToolExecutor.",
          sourceArtifactIds: []
        })
      };
    } else {
      message = {
        role: "assistant",
        content: JSON.stringify({ kind: "agent_output", message: `Unhandled role ${role}` })
      };
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message }] }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    requests,
    baseUrl: `http://${address.address}:${address.port}/v1`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

test("real openai-compatible provider text JSON completes the TeamEngine runtime loop", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-openai-engine-data-"));
  const agentWorkspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-openai-engine-workspace-"));
  const api = await startOpenAICompatibleServer();
  try {
    await writeProviderConfig(dataDir, api.baseUrl);
    await withEnv({
      AI_TEAM_DATA_DIR: dataDir,
      AI_TEAM_AGENT_WORKSPACE_DIR: agentWorkspaceDir,
      AI_TEAM_PROJECT_WORKSPACE_ROOT: path.join(dataDir, "project-workspaces"),
      AI_TEAM_RUNNER: "openai_compatible",
      AI_TEAM_PROVIDER: TEST_PROVIDER_ID,
      AI_TEAM_MODEL: TEST_MODEL,
      AI_TEAM_TEST_OPENAI_KEY: "sk-local-test-key",
      AI_TEAM_CONTEXT_WINDOW_CHARS: "60000"
    }, async () => {
      const system = await createSystem();
      const result = await runOnce(system, "Ship a real non-mock runtime loop fix", { maxTicks: 12 });
      const readModel = await system.engineStore.readModel();

      assert.equal(result.status, "done");
      assert.equal(readModel.intents[0].status, "done");
      assert.deepEqual(
        [...new Set(readModel.runs.map((run) => run.agentRole))].sort(),
        ["ceo_cto", "engineer", "product_manager", "qa"]
      );
      assert.ok(readModel.runs.every((run) => run.runner === "openai_compatible"));
      assert.ok(readModel.runs.every((run) => run.provider === TEST_PROVIDER_ID));
      assert.ok(readModel.runs.every((run) => run.provider !== "mock" && run.runner !== "mock"));

      const artifactKinds = readModel.artifacts.map((artifact) => artifact.kind);
      assert.ok(artifactKinds.includes("task_graph"));
      assert.ok(artifactKinds.includes("verification_report"));
      assert.ok(readModel.artifacts.some(
        (artifact) =>
          artifact.kind === "verification_report" &&
          artifact.data?.verdict === "pass" &&
          Array.isArray(artifact.data.findings)
      ));
      assert.ok(api.requests.some((request) => request.role === "product_manager"));
      assert.ok(api.requests.some((request) => request.role === "qa"));
      const productPrompt = api.requests.find((request) => request.role === "product_manager")?.prompt || "";
      const qaPrompt = api.requests.find((request) => request.role === "qa")?.prompt || "";
      assert.match(productPrompt, /Return exactly one JSON object/);
      assert.match(productPrompt, /"kind": "task_graph"/);
      assert.match(qaPrompt, /Return exactly one JSON object/);
      assert.match(qaPrompt, /"kind": "verification_report"/);
      assert.match(qaPrompt, /"verdict": "pass"\|"reject"/);
    });
  } finally {
    await api.close();
  }
});

test("real openai-compatible provider tool calls execute through ToolExecutor and resume final JSON", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-openai-tools-data-"));
  const agentWorkspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-openai-tools-agent-workspace-"));
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-openai-tools-workspace-"));
  const api = await startToolCallingOpenAICompatibleServer();
  try {
    await fs.writeFile(path.join(workspace, "fixture.txt"), "runtime loop fixture\n", "utf8");
    await writeProviderConfig(dataDir, api.baseUrl);
    await withEnv({
      AI_TEAM_DATA_DIR: dataDir,
      AI_TEAM_AGENT_WORKSPACE_DIR: agentWorkspaceDir,
      AI_TEAM_PROJECT_WORKSPACE_ROOT: path.join(dataDir, "project-workspaces"),
      AI_TEAM_WORKSPACE: workspace,
      AI_TEAM_RUNNER: "openai_compatible",
      AI_TEAM_PROVIDER: TEST_PROVIDER_ID,
      AI_TEAM_MODEL: TEST_MODEL,
      AI_TEAM_TEST_OPENAI_KEY: "sk-local-test-key",
      AI_TEAM_CONTEXT_WINDOW_CHARS: "60000"
    }, async () => {
      const system = await createSystem();
      const result = await runOnce(system, "Exercise a real provider tool call loop", { maxTicks: 10 });
      const readModel = await system.engineStore.readModel();

      assert.equal(result.status, "done");
      assert.equal(readModel.intents[0].status, "done");
      assert.ok(readModel.runs.every((run) => run.runner === "openai_compatible"));
      assert.ok(readModel.runs.every((run) => run.provider === TEST_PROVIDER_ID));
      assert.ok(readModel.runs.every((run) => run.runner !== "mock" && run.provider !== "mock"));

      const engineerRequests = api.requests.filter((request) => request.role === "engineer");
      assert.equal(engineerRequests.length, 2);
      const firstToolNames = (engineerRequests[0].body.tools || []).map((tool) => tool.function?.name).filter(Boolean);
      assert.ok(firstToolNames.every((name) => /^[A-Za-z0-9_-]+$/.test(name)), "expected OpenAI-compatible safe tool names");
      assert.ok(firstToolNames.includes("Bash"));
      assert.ok(!firstToolNames.includes("workspace.read"));
      assert.ok(
        engineerRequests[0].body.tools?.some((tool) => tool.type === "function" && tool.function?.name === "Bash"),
        "expected first engineer request to include OpenAI-compatible tools schema"
      );
      assert.ok(
        engineerRequests[1].body.messages?.some(
          (message) =>
            message.role === "tool" &&
            message.tool_call_id === "call_bash_fixture" &&
            String(message.content).includes("runtime loop fixture")
        ),
        "expected second engineer request to include the ToolExecutor result"
      );

      const auditRaw = await fs.readFile(path.join(dataDir, "tools", "audit-log", "framework", "tool-audit.jsonl"), "utf8");
      const auditEvents = auditRaw.trim().split("\n").map((line) => JSON.parse(line));
      assert.ok(auditEvents.some(
        (event) =>
          event.type === "tool_invocation" &&
          event.source === "agent_runtime" &&
          event.role === "engineer" &&
          event.toolId === "Bash" &&
          event.status === "completed"
      ));

      const engineerArtifact = readModel.artifacts.find((artifact) => artifact.kind === "implementation_report");
      const qaArtifact = readModel.artifacts.find((artifact) => artifact.kind === "verification_report");
      assert.equal(engineerArtifact?.data?.kind, "implementation_report");
      assert.match(engineerArtifact.data.summary, /ToolExecutor/);
      assert.deepEqual(engineerArtifact.data.changedFiles, ["fixture.txt"]);
      assert.equal(qaArtifact?.data?.kind, "verification_report");
      assert.equal(qaArtifact.data.verdict, "pass");
      assert.ok(Array.isArray(qaArtifact.data.checks));
    });
  } finally {
    await api.close();
  }
});
