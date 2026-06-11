import path from "node:path";
import { appendJsonLine, ensureDir } from "../../../platform/json-file.js";
import { createId } from "../../../platform/ids.js";

export class ToolAuditLog {
  constructor({ dataDir }) {
    this.dir = path.join(dataDir, "tools", "audit-log", "framework");
    this.file = path.join(this.dir, "tool-audit.jsonl");
  }

  async init() {
    await ensureDir(this.dir);
  }

  async record(entry) {
    const event = {
      id: createId("tool"),
      ts: new Date().toISOString(),
      ...entry
    };
    await appendJsonLine(this.file, event);
    return event;
  }
}
