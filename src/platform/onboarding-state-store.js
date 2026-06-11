import path from "node:path";
import { ensureDir, readJsonFile, writeJsonFile } from "./json-file.js";

export class OnboardingStateStore {
  constructor({ dataDir, file } = {}) {
    const baseDir = dataDir || process.cwd();
    this.file = file || path.join(baseDir, "engine", "onboarding.json");
  }

  async init() {
    await ensureDir(path.dirname(this.file));
  }

  async read() {
    return readJsonFile(this.file, {});
  }

  async has(key) {
    const state = await this.read();
    const entry = state?.[key];
    return Boolean(entry === true || entry?.completedAt || entry?.seededAt);
  }

  async mark(key, patch = {}) {
    const state = await this.read();
    const previous = state[key] && typeof state[key] === "object" ? state[key] : {};
    const now = new Date().toISOString();
    state[key] = {
      ...previous,
      ...patch,
      completedAt: previous.completedAt || patch.completedAt || now,
      updatedAt: now
    };
    await writeJsonFile(this.file, state);
    return state[key];
  }
}
