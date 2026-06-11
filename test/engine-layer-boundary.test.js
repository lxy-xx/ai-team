import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const TEAM_ENGINE_DIR = path.resolve("src", "team-engine");
const AGENT_FRAMEWORK_DIR = path.resolve("src", "agent-framework");
const TEAM_ENGINE_AGENT_FRAMEWORK_ADAPTER = path.join(TEAM_ENGINE_DIR, "adapters", "agent-framework");

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

test("Team Engine target exports remain available", async () => {
  const modules = [
    ["../src/team-engine/domain/schema.js", "ROLES", "object"],
    ["../src/team-engine/application/team-engine.js", "TeamEngine", "function"],
    ["../src/team-engine/infrastructure/engine-store.js", "EngineStore", "function"],
    ["../src/team-engine/infrastructure/engine-bus.js", "EngineBus", "function"],
    ["../src/team-engine/infrastructure/routing-store.js", "EngineRoutingStore", "function"],
    ["../src/team-engine/adapters/agent-framework/worker-engine.js", "WorkerEngine", "function"],
    ["../src/team-engine/adapters/agent-framework/default-team-mock-fixture.js", "defaultTeamMockRoleOutput", "function"],
    ["../src/team-engine/adapters/agent-framework/engine-tool-handlers.js", "EngineToolHandlers", "function"]
  ];

  for (const [modulePath, exportName, type] of modules) {
    const module = await import(modulePath);
    assert.equal(typeof module[exportName], type, modulePath);
  }
});

test("Team Engine domain and application stay independent of Agent Framework", async () => {
  const offenders = [];
  for (const dir of [path.join(TEAM_ENGINE_DIR, "domain"), path.join(TEAM_ENGINE_DIR, "application")]) {
    for (const file of await jsFiles(dir)) {
      const source = await fs.readFile(file, "utf8");
      for (const specifier of moduleSpecifiers(source)) {
        const resolved = resolvedImportPath(file, specifier);
        if (isInsidePath(resolved, AGENT_FRAMEWORK_DIR)) {
          offenders.push(`${path.relative(process.cwd(), file)} -> ${specifier}`);
        }
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("Team Engine Agent Framework imports stay in the adapter layer", async () => {
  const offenders = [];
  for (const file of await jsFiles(TEAM_ENGINE_DIR)) {
    const source = await fs.readFile(file, "utf8");
    for (const specifier of moduleSpecifiers(source)) {
      const resolved = resolvedImportPath(file, specifier);
      if (isInsidePath(resolved, AGENT_FRAMEWORK_DIR) && !isInsidePath(file, TEAM_ENGINE_AGENT_FRAMEWORK_ADAPTER)) {
        offenders.push(`${path.relative(process.cwd(), file)} -> ${specifier}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("WorkerEngine does not import default Agent onboarding profiles", async () => {
  const source = await fs.readFile(path.join(TEAM_ENGINE_AGENT_FRAMEWORK_ADAPTER, "worker-engine.js"), "utf8");

  assert.doesNotMatch(source, /default-agent-onboarding\.js/);
  assert.doesNotMatch(source, /\bdefaultAgentProfileForRole\b/);
  assert.doesNotMatch(source, /\bdefaultCeoName\b/);
});
