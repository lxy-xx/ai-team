import path from "node:path";
import { readJsonFile, writeJsonFile } from "./json-file.js";

export class SetupReadinessStore {
  constructor({ dataDir, file } = {}) {
    const baseDir = dataDir || process.cwd();
    this.file = file || path.join(baseDir, "engine", "setup-readiness.local.json");
  }

  async read() {
    return readJsonFile(this.file, {});
  }

  async recordOneOnOneSmoke(result = {}) {
    const current = await this.read();
    const smoke = {
      ok: result.ok !== false,
      status: result.status,
      checkedAt: result.checkedAt || new Date().toISOString(),
      role: result.role,
      provider: result.provider,
      model: result.model,
      sessionId: result.sessionId,
      traceId: result.traceId,
      message: result.message || (result.ok === false ? "One one smoke test failed." : "One one smoke test completed.")
    };
    await writeJsonFile(this.file, {
      ...current,
      oneOnOneSmoke: smoke
    });
    return smoke;
  }
}
