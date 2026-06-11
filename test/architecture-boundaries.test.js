import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const SRC_ROOT = path.resolve("src");
const AGENT_FRAMEWORK_ROOT = path.resolve("src", "agent-framework");
const TEAM_ENGINE_ROOT = path.resolve("src", "team-engine");
const INTERFACES_ROOT = path.resolve("src", "interfaces");
const FE_ROOT = path.resolve("src", "fe");
const PLATFORM_ROOT = path.resolve("src", "platform");
const TEAM_ENGINE_AGENT_FRAMEWORK_ADAPTER = path.join(TEAM_ENGINE_ROOT, "adapters", "agent-framework");
const DATA_ROOT = path.resolve("data");
const AGENT_WORKSPACE_ROOT = path.resolve("agent-workspace");
const FORBIDDEN_RETIRED_ENGINE_ROOT = path.resolve("src", ["clockless", "engine"].join("-"));

const TARGET_SOURCE_ROOTS = [
  AGENT_FRAMEWORK_ROOT,
  TEAM_ENGINE_ROOT,
  INTERFACES_ROOT,
  FE_ROOT,
  PLATFORM_ROOT
];

const LEGACY_IMPLEMENTATION_ROOTS = [
  path.resolve("src", "agents"),
  path.resolve("src", "engine"),
  path.resolve("src", "providers"),
  path.resolve("src", "runners"),
  path.resolve("src", "server"),
  path.resolve("src", "channels"),
  path.resolve("src", "core")
];

const PRODUCT_LAYER_ROOTS = [
  AGENT_FRAMEWORK_ROOT,
  TEAM_ENGINE_ROOT,
  INTERFACES_ROOT,
  FE_ROOT
];

const FILESYSTEM_MODULES = new Set(["fs", "fs/promises", "node:fs", "node:fs/promises"]);

function repoRelative(filePath) {
  return path.relative(process.cwd(), filePath);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function scanJavaScriptFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return scanJavaScriptFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
    })
  );
  return nested.flat();
}

function staticImportExportSpecifiers(source) {
  const specifiers = [];
  const importPattern = /\bimport\s+(?:[^;"']*?\s+from\s*)?["']([^"']+)["']/g;
  const exportPattern = /\bexport\s+[^;"']*?\s+from\s*["']([^"']+)["']/g;

  for (const match of source.matchAll(importPattern)) specifiers.push(match[1]);
  for (const match of source.matchAll(exportPattern)) specifiers.push(match[1]);
  return specifiers;
}

function dynamicImportSpecifiers(source) {
  return [...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["'](?:\s*,[^)]*)?\s*\)/g)].map((match) => match[1]);
}

function resolveRelativeSpecifier(importerFile, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  return path.resolve(path.dirname(importerFile), specifier);
}

function isInsidePath(filePath, rootPath) {
  const relativePath = path.relative(rootPath, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

async function readImportEdges(rootDirs, { includeStatic = true, includeDynamic = true } = {}) {
  const files = (await Promise.all(rootDirs.map((dir) => scanJavaScriptFiles(dir)))).flat();
  const edges = [];

  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    const specifiers = [
      ...(includeStatic ? staticImportExportSpecifiers(source) : []),
      ...(includeDynamic ? dynamicImportSpecifiers(source) : [])
    ];

    for (const specifier of specifiers) {
      edges.push({
        importer: file,
        specifier,
        resolved: resolveRelativeSpecifier(file, specifier)
      });
    }
  }

  return edges;
}

function formatEdge(edge) {
  return `${repoRelative(edge.importer)} -> ${edge.specifier}`;
}

function pointsInside(edge, rootPath) {
  return edge.resolved && isInsidePath(edge.resolved, rootPath);
}

function isStoreOrFilesystemBackedRuntimePath(filePath) {
  const normalized = filePath.split(path.sep).join("/").toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  return basename.includes("store") || basename === "json-file" || basename === "json-file.js" || normalized.includes("/stores/");
}

async function topLevelJavaScriptFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(dir, entry.name));
}

test("target source roots exist", async () => {
  const missing = [];
  for (const root of TARGET_SOURCE_ROOTS) {
    if (!(await pathExists(root))) missing.push(repoRelative(root));
  }

  assert.deepEqual(missing, [], `missing target roots: ${missing.join(", ")}`);
});

test("legacy implementation roots are gone", async () => {
  const existing = [];
  for (const root of LEGACY_IMPLEMENTATION_ROOTS) {
    if (await pathExists(root)) existing.push(repoRelative(root));
  }

  assert.deepEqual(existing, [], `existing legacy roots: ${existing.join(", ")}`);
});

test("Agent Framework does not import Team Engine", async () => {
  const offenders = (await readImportEdges([AGENT_FRAMEWORK_ROOT]))
    .filter((edge) => pointsInside(edge, TEAM_ENGINE_ROOT))
    .map(formatEdge);

  assert.deepEqual(offenders, []);
});

test("Team Engine domain and application do not import Agent Framework", async () => {
  const offenders = (await readImportEdges([
    path.join(TEAM_ENGINE_ROOT, "domain"),
    path.join(TEAM_ENGINE_ROOT, "application")
  ]))
    .filter((edge) => pointsInside(edge, AGENT_FRAMEWORK_ROOT))
    .map(formatEdge);

  assert.deepEqual(offenders, []);
});

test("Team Engine adapter is the only Team Engine layer importing Agent Framework", async () => {
  const offenders = (await readImportEdges([TEAM_ENGINE_ROOT]))
    .filter((edge) => pointsInside(edge, AGENT_FRAMEWORK_ROOT))
    .filter((edge) => !isInsidePath(edge.importer, TEAM_ENGINE_AGENT_FRAMEWORK_ADAPTER))
    .map(formatEdge);

  assert.deepEqual(offenders, []);
});

test("FE does not import stores or filesystem-backed runtime stores", async () => {
  const offenders = (await readImportEdges([FE_ROOT]))
    .filter((edge) => {
      if (FILESYSTEM_MODULES.has(edge.specifier)) return true;
      return edge.resolved && isStoreOrFilesystemBackedRuntimePath(edge.resolved);
    })
    .map(formatEdge);

  assert.deepEqual(offenders, []);
});

test("Platform does not import product layers", async () => {
  const offenders = (await readImportEdges([PLATFORM_ROOT]))
    .filter((edge) => PRODUCT_LAYER_ROOTS.some((root) => pointsInside(edge, root)))
    .map(formatEdge);

  assert.deepEqual(offenders, []);
});

test("src never statically imports data or agent-workspace defaults", async () => {
  const offenders = (await readImportEdges([SRC_ROOT], { includeDynamic: false }))
    .filter((edge) => {
      if (edge.specifier.startsWith("data/") || edge.specifier.startsWith("agent-workspace/")) return true;
      return edge.resolved && (isInsidePath(edge.resolved, DATA_ROOT) || isInsidePath(edge.resolved, AGENT_WORKSPACE_ROOT));
    })
    .map(formatEdge);

  assert.deepEqual(offenders, []);
});

test("Provider and runners live under Agent Framework infrastructure provider", async () => {
  const providerRoot = path.join(AGENT_FRAMEWORK_ROOT, "infrastructure", "provider");
  const runnersRoot = path.join(providerRoot, "runners");
  const missingTargetRoots = [];
  const existingLegacyRoots = [];

  for (const root of [providerRoot, runnersRoot]) {
    if (!(await pathExists(root))) missingTargetRoots.push(repoRelative(root));
  }
  for (const root of [path.resolve("src", "providers"), path.resolve("src", "runners")]) {
    if (await pathExists(root)) existingLegacyRoots.push(repoRelative(root));
  }

  assert.deepEqual(
    { missingTargetRoots, existingLegacyRoots },
    { missingTargetRoots: [], existingLegacyRoots: [] },
    `provider boundary mismatch: missing target roots: ${missingTargetRoots.join(", ")}; existing legacy roots: ${existingLegacyRoots.join(", ")}`
  );
});

test("old root shims remain absent", async () => {
  const existingRootShims = (
    await Promise.all([
      topLevelJavaScriptFiles(path.resolve("src", "agents")),
      topLevelJavaScriptFiles(path.resolve("src", "engine"))
    ])
  )
    .flat()
    .map(repoRelative);
  const existingForbiddenRoots = [];

  if (await pathExists(FORBIDDEN_RETIRED_ENGINE_ROOT)) existingForbiddenRoots.push(repoRelative(FORBIDDEN_RETIRED_ENGINE_ROOT));

  assert.deepEqual(
    { existingRootShims, existingForbiddenRoots },
    { existingRootShims: [], existingForbiddenRoots: [] }
  );
});
