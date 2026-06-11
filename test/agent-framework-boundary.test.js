import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const AGENT_FRAMEWORK_DIR = path.resolve("src", "agent-framework");
const TEAM_ENGINE_DIR = path.resolve("src", "team-engine");

async function jsFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return jsFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
    })
  );
  return files.flat();
}

function moduleSpecifiers(source) {
  return [
    ...source.matchAll(/\b(?:import|export)\s+(?:[^;"']*?\s+from\s*)?["'](\.{1,2}\/[^"']+)["']/g),
    ...source.matchAll(/\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["'](?:\s*,[^)]*)?\s*\)/g)
  ].map((match) => match[1]);
}

function resolvedImportPath(file, specifier) {
  return path.resolve(path.dirname(file), specifier);
}

function isInsidePath(filePath, rootPath) {
  const relativePath = path.relative(rootPath, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

test("Agent Framework code does not import Team Engine modules", async () => {
  const offenders = [];
  for (const file of await jsFiles(AGENT_FRAMEWORK_DIR)) {
    const source = await fs.readFile(file, "utf8");
    for (const specifier of moduleSpecifiers(source)) {
      const resolved = resolvedImportPath(file, specifier);
      if (isInsidePath(resolved, TEAM_ENGINE_DIR)) {
        offenders.push(`${path.relative(process.cwd(), file)} -> ${specifier}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("AgentRuntime does not import legacy local planner implementations", async () => {
  const source = await fs.readFile(path.join(AGENT_FRAMEWORK_DIR, "application", "agent-runtime.js"), "utf8");

  assert.doesNotMatch(source, /ceo-cto-agent\.js/);
  assert.doesNotMatch(source, /planning\/planner\.js/);
  assert.doesNotMatch(source, /\bCeoCtoAgent\b/);
  assert.doesNotMatch(source, /\bPlanner\b/);
});

test("AgentRuntime does not import default onboarding profiles as runtime fallback", async () => {
  const source = await fs.readFile(path.join(AGENT_FRAMEWORK_DIR, "application", "agent-runtime.js"), "utf8");

  assert.doesNotMatch(source, /default-agent-onboarding\.js/);
  assert.doesNotMatch(source, /\bdefaultAgentProfileForRole\b/);
});

test("Agent Framework target exports remain available", async () => {
  const modules = [
    ["../src/agent-framework/domain/roles.js", "ROLES", "object"],
    ["../src/agent-framework/domain/tools/tool-registry.js", "ToolRegistry", "function"],
    ["../src/agent-framework/domain/tools/tool-policy.js", "ToolPolicyEngine", "function"],
    ["../src/agent-framework/domain/context/context-window.js", "contextLimits", "function"],
    ["../src/agent-framework/domain/security/redaction.js", "redactSecretValue", "function"],
    ["../src/agent-framework/application/agent-runtime.js", "AgentRuntime", "function"],
    ["../src/agent-framework/application/agent-session-factory.js", "AgentSessionFactory", "function"],
    ["../src/agent-framework/application/memory-manager.js", "MemoryManager", "function"],
    ["../src/agent-framework/application/tool-executor.js", "ToolExecutor", "function"],
    ["../src/agent-framework/application/one-on-one-chat.js", "runAgentOneOnOne", "function"],
    ["../src/agent-framework/infrastructure/agent-config-store.js", "AgentConfigStore", "function"],
    ["../src/agent-framework/infrastructure/agent-state-store.js", "AgentMemoryStore", "function"]
  ];

  for (const [modulePath, exportName, type] of modules) {
    const module = await import(modulePath);
    assert.equal(typeof module[exportName], type, modulePath);
  }
});

test("Agent Framework does not ship legacy local planner modules", async () => {
  const legacyFiles = [
    path.join(AGENT_FRAMEWORK_DIR, "domain", "planning", "planner.js"),
    path.join(AGENT_FRAMEWORK_DIR, "application", "ceo-cto-agent.js")
  ];

  for (const file of legacyFiles) {
    await assert.rejects(() => fs.access(file), { code: "ENOENT" });
  }
});
