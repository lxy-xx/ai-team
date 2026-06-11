import path from "node:path";
import { ensureDir, writeJsonFile } from "../../platform/json-file.js";

function sanitizeSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_.:-]+/g, "_");
}

function assertSafeRole(role) {
  const value = String(role || "");
  if (!value || value === "." || value === ".." || sanitizeSegment(value) !== value) {
    throw new Error(`invalid engine bus role: ${role}`);
  }
  return value;
}

export class EngineBus {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.agentRootDir = path.join(dataDir, "engine", "agents");
  }

  async init() {
    await ensureDir(this.agentRootDir);
  }

  async writeInbox(input) {
    return this.#writeEnvelope("inbox", input);
  }

  async writeOutbox(input) {
    return this.#writeEnvelope("outbox", input);
  }

  async #writeEnvelope(box, { role, entityType, entityId, runId, payload }) {
    const safeRole = assertSafeRole(role);
    const safeEntityId = sanitizeSegment(entityId);
    const safeRunId = sanitizeSegment(runId);
    const boxDir = path.resolve(this.agentRootDir, safeRole, box);
    const file = path.resolve(boxDir, `${safeEntityId}.${safeRunId}.json`);
    this.#assertInside(file, boxDir);
    await writeJsonFile(file, {
      role: safeRole,
      entityType,
      entityId,
      runId,
      createdAt: new Date().toISOString(),
      payload
    });
    return file;
  }

  #assertInside(file, dir) {
    const relative = path.relative(dir, file);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`unsafe engine bus path: ${file}`);
    }
  }
}
