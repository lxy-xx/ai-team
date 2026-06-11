import fs from "node:fs/promises";
import path from "node:path";
import { appendJsonLine, ensureDir, readJsonFile, writeJsonFile } from "../../platform/json-file.js";
import { createId, stableHash } from "../../platform/ids.js";

function tokenize(text) {
  const rawTokens = String(text || "")
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`~@#$%^&*+=\\/|<>，。！？、；：“”‘’（）【】《》]+/)
    .filter(Boolean);
  const tokens = [];
  for (const token of rawTokens) {
    tokens.push(token);
    if (/[\u3400-\u9fff]/u.test(token)) {
      for (let index = 0; index < token.length - 1; index += 1) {
        tokens.push(token.slice(index, index + 2));
      }
    }
  }
  return [...new Set(tokens)];
}

function scoreText(queryTokens, candidate) {
  const text = String(candidate || "").toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (token.length > 1 && text.includes(token)) score += token.length;
  }
  return score;
}

export class MemoryStore {
  constructor({ dataDir }) {
    this.dir = path.join(dataDir, "memory");
    this.eventsFile = path.join(this.dir, "events.jsonl");
    this.factsFile = path.join(this.dir, "facts.json");
    this.proceduresFile = path.join(this.dir, "procedures.json");
  }

  async init() {
    await ensureDir(this.dir);
    await readJsonFile(this.factsFile, {});
    await readJsonFile(this.proceduresFile, {});
  }

  async recordEvent(event) {
    const entry = {
      id: createId("mem"),
      ts: new Date().toISOString(),
      ...event
    };
    await appendJsonLine(this.eventsFile, entry);
    return entry;
  }

  async upsertFact(key, value, metadata = {}) {
    const facts = await readJsonFile(this.factsFile, {});
    facts[key] = {
      key,
      value,
      updatedAt: new Date().toISOString(),
      ...metadata
    };
    await writeJsonFile(this.factsFile, facts);
    return facts[key];
  }

  async upsertProcedure(key, value, metadata = {}) {
    const procedures = await readJsonFile(this.proceduresFile, {});
    procedures[key] = {
      key,
      value,
      updatedAt: new Date().toISOString(),
      ...metadata
    };
    await writeJsonFile(this.proceduresFile, procedures);
    return procedures[key];
  }

  async getFacts() {
    return readJsonFile(this.factsFile, {});
  }

  async getProcedures() {
    return readJsonFile(this.proceduresFile, {});
  }

  async recentEvents(limit = 50) {
    try {
      const raw = await fs.readFile(this.eventsFile, "utf8");
      return raw
        .trim()
        .split("\n")
        .filter(Boolean)
        .slice(-limit)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async searchLayer(layer, query, limit = 8) {
    const queryTokens = tokenize(query);
    let candidates = [];
    if (layer === "semantic") {
      const facts = Object.values(await this.getFacts());
      candidates = facts.map((fact) => ({
        kind: "fact",
        id: fact.key,
        text: `${fact.key}: ${JSON.stringify(fact.value)}`,
        item: fact
      }));
    } else if (layer === "episodic") {
      const events = await this.recentEvents(200);
      candidates = events.map((event) => ({
        kind: "event",
        id: event.id,
        text: JSON.stringify(event),
        item: event
      }));
    } else if (layer === "procedural") {
      const procedures = Object.values(await this.getProcedures());
      candidates = procedures.map((procedure) => ({
        kind: "procedure",
        id: procedure.key,
        text: `${procedure.key}: ${JSON.stringify(procedure.value)}`,
        item: procedure
      }));
    } else {
      throw new Error(`Unknown memory layer: ${layer}`);
    }

    return candidates
      .map((candidate) => ({
        ...candidate,
        layer,
        score: scoreText(queryTokens, candidate.text)
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async search(query, limit = 8) {
    const results = await Promise.all([
      this.searchLayer("semantic", query, limit),
      this.searchLayer("episodic", query, limit),
      this.searchLayer("procedural", query, limit)
    ]);
    return results.flat().sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async rememberTaskResult(task, result) {
    const summary = typeof result === "string" ? result : result?.summary;
    const assignments = Array.isArray(result?.assignments) ? result.assignments : [];
    await this.recordEvent({
      type: "task_result",
      taskId: task.id,
      threadId: task.threadId,
      channel: task.channel,
      textHash: stableHash(task.text || ""),
      summary,
      roles: assignments.map((assignment) => assignment.role)
    });
    if (summary) {
      await this.upsertFact(`task:${task.id}:summary`, summary, {
        type: "task_summary",
        taskId: task.id,
        channel: task.channel
      });
    }
  }
}
