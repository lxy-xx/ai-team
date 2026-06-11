import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, readJsonFile, writeJsonFile } from "../../platform/json-file.js";

const ENGINE_DIRS = ["intents", "tasks", "feedback", "runs", "artifacts", "sessions", "operations"];

function createReport() {
  return { copied: [], skipped: [], removed: [] };
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function ensureEngineDirs(dataDir) {
  const engineDir = path.join(dataDir, "engine");
  await Promise.all(ENGINE_DIRS.map((dir) => ensureDir(path.join(engineDir, dir))));
  return engineDir;
}

function safeEntityFile(dir, id) {
  const base = path.resolve(dir);
  const target = path.resolve(base, `${id}.json`);
  if (target !== base && target.startsWith(`${base}${path.sep}`)) return target;
  throw new Error(`invalid id path: ${id}`);
}

async function writeIfMissing(file, value, report) {
  if (await exists(file)) {
    report.skipped.push(file);
    return false;
  }
  await writeJsonFile(file, value);
  report.copied.push(file);
  return true;
}

async function removeIfExists(target, report) {
  if (!(await exists(target))) return;
  await fs.rm(target, { recursive: true, force: true });
  report.removed.push(target);
}

async function listJsonFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsonFiles(entryPath);
    if (entry.isFile() && entry.name.endsWith(".json")) return [entryPath];
    return [];
  }));
  return files.flat();
}

function legacyTasksFrom(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.tasks)) return input.tasks;
  if (input && typeof input === "object") return Object.values(input).filter((item) => item && typeof item === "object" && item.id);
  return [];
}

function mergeById(existing = [], incoming = []) {
  const byId = new Map();
  for (const item of existing) {
    if (item?.id) byId.set(item.id, item);
  }
  let changed = false;
  for (const item of incoming) {
    if (!item?.id) continue;
    if (byId.has(item.id)) continue;
    byId.set(item.id, item);
    changed = true;
  }
  return { rows: [...byId.values()], changed };
}

export async function migrateEngineRuntimeData({ dataDir, removeLegacy = false } = {}) {
  const report = createReport();
  const engineDir = await ensureEngineDirs(dataDir);
  const taskDir = path.join(engineDir, "tasks");
  const feedbackDir = path.join(engineDir, "feedback");
  const legacyTasksDir = path.join(dataDir, "tasks");
  const legacyTasksFile = path.join(legacyTasksDir, "tasks.json");
  const legacyFeedbackDir = path.join(dataDir, "customer-feedback");
  const legacyFeedbackFile = path.join(legacyFeedbackDir, "backlog.json");
  const targetFeedbackFile = path.join(feedbackDir, "backlog.json");

  const legacyTasks = legacyTasksFrom(await readJsonFile(legacyTasksFile, undefined));
  for (const task of legacyTasks) {
    if (!task?.id) continue;
    await writeIfMissing(safeEntityFile(taskDir, task.id), task, report);
  }

  const legacyFeedback = await readJsonFile(legacyFeedbackFile, undefined);
  if (Array.isArray(legacyFeedback)) {
    const existing = await readJsonFile(targetFeedbackFile, []);
    if (await exists(targetFeedbackFile)) {
      const merged = mergeById(existing, legacyFeedback);
      if (merged.changed) {
        await writeJsonFile(targetFeedbackFile, merged.rows);
        report.copied.push(targetFeedbackFile);
      } else {
        report.skipped.push(targetFeedbackFile);
      }
    } else {
      await writeJsonFile(targetFeedbackFile, legacyFeedback);
      report.copied.push(targetFeedbackFile);
    }
  } else if (await exists(targetFeedbackFile)) {
    report.skipped.push(targetFeedbackFile);
  }

  for (const dirName of ENGINE_DIRS) {
    const files = await listJsonFiles(path.join(engineDir, dirName));
    for (const file of files) {
      if (!report.copied.includes(file)) report.skipped.push(file);
    }
  }

  if (removeLegacy) {
    await removeIfExists(legacyTasksDir, report);
    await removeIfExists(legacyFeedbackDir, report);
  }

  report.skipped = [...new Set(report.skipped.filter((item) => !report.copied.includes(item)))];
  return report;
}
