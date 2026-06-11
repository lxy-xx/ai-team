import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createId } from "../../platform/ids.js";
import { ensureDir, readJsonFile, writeJsonFile } from "../../platform/json-file.js";

const DEFAULT_TAIL_LINES = 80;
const DEFAULT_WAIT_TIMEOUT_MS = 900_000;
const DEFAULT_JOB_TIMEOUT_MS = 900_000;
const DEFAULT_ROLE_RUNNING_LIMIT = 8;
const DEFAULT_GLOBAL_RUNNING_LIMIT = 32;
const TERMINAL_STATES = new Set(["completed", "failed", "cancelled", "timed_out", "interrupted"]);

function nowIso() {
  return new Date().toISOString();
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeJobId(value) {
  const jobId = String(value || "").trim();
  if (!/^async_[a-z0-9]+_[a-f0-9]+$/i.test(jobId)) throw new Error(`invalid async Bash job id: ${value}`);
  return jobId;
}

function normalizeState(value) {
  const state = String(value || "running").trim();
  if (!["running", "completed", "failed", "cancelled", "timed_out", "interrupted", "all"].includes(state)) {
    throw new Error(`invalid async Bash state: ${value}`);
  }
  return state;
}

function normalizeStream(value) {
  const stream = String(value || "both").trim();
  if (!["stdout", "stderr", "both"].includes(stream)) throw new Error(`invalid async Bash stream: ${value}`);
  return stream;
}

function normalizeTailLines(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TAIL_LINES;
  return Math.min(parsed, 2000);
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function countLines(chunk) {
  const text = String(chunk || "");
  if (!text) return 0;
  return (text.match(/\n/g) || []).length + (text.endsWith("\n") ? 0 : 1);
}

function splitLogLines(text) {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function lineSlice(lines, { fromLine, toLine }) {
  const start = Math.max(1, Number.isFinite(fromLine) ? fromLine : 1);
  const end = Number.isFinite(toLine) ? Math.max(start, toLine) : lines.length;
  return lines.slice(start - 1, end).join("\n");
}

async function readText(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function endStream(stream) {
  await new Promise((resolve) => stream.end(resolve));
}

function processEnvWithPatch(patch = {}) {
  const env = { ...process.env };
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return env;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete env[key];
    else env[key] = String(value);
  }
  return env;
}

export class AsyncBashJobManager {
  constructor({ config = {}, processFactory = spawn, logger = console } = {}) {
    this.config = config;
    this.processFactory = processFactory;
    this.logger = logger;
    this.baseDir = path.join(config.dataDir || config.rootDir || process.cwd(), "tools", "async-bash");
    this.jobsDir = path.join(this.baseDir, "jobs");
    this.logsDir = path.join(this.baseDir, "logs");
    this.liveJobs = new Map();
    this.jobWriteChains = new Map();
    this.initialized = false;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    await ensureDir(this.jobsDir);
    await ensureDir(this.logsDir);
    const jobs = await this.listJobsFromDisk();
    for (const job of jobs) {
      if (job.state === "running" || job.state === "queued") {
        await this.persistJob({
          ...job,
          state: "interrupted",
          endedAt: job.endedAt || nowIso(),
          interruptedAt: nowIso(),
          reason: "marked interrupted on async Bash manager startup"
        });
      }
    }
    this.initialized = true;
  }

  jobFile(jobId) {
    return path.join(this.jobsDir, `${normalizeJobId(jobId)}.json`);
  }

  logFile(jobId, stream) {
    return path.join(this.logsDir, `${normalizeJobId(jobId)}.${stream}.log`);
  }

  async persistJob(job) {
    const jobId = normalizeJobId(job.jobId);
    const file = this.jobFile(jobId);
    const snapshot = { ...job };
    const previous = this.jobWriteChains.get(jobId) || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => writeJsonFile(file, snapshot));
    this.jobWriteChains.set(jobId, next);
    try {
      await next;
    } finally {
      if (this.jobWriteChains.get(jobId) === next) this.jobWriteChains.delete(jobId);
    }
    return job;
  }

  async readJob(jobId) {
    await this.ensureInitialized();
    const job = await readJsonFile(this.jobFile(jobId), undefined);
    if (!job?.jobId) throw new Error(`async Bash job not found: ${jobId}`);
    return job;
  }

  async listJobsFromDisk() {
    let entries = [];
    try {
      entries = await fs.readdir(this.jobsDir, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const jobs = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readJsonFile(path.join(this.jobsDir, entry.name), undefined)));
    return jobs.filter((job) => job?.jobId);
  }

  assertCanAccess(job, context = {}) {
    if (job.role !== context.role) throw new Error(`async Bash job ${job.jobId} is not visible to role ${context.role}`);
    if (job.sessionId && context.sessionId && job.sessionId !== context.sessionId) {
      throw new Error(`async Bash job ${job.jobId} is not visible to session ${context.sessionId}`);
    }
  }

  async runningJobs() {
    const jobs = await this.listJobsFromDisk();
    return jobs.filter((job) => job.state === "running");
  }

  async start(input = {}, context = {}) {
    await this.ensureInitialized();
    const command = String(input.command || "").trim();
    if (!command) throw new Error("async_bash.start requires command");
    const roleLimit = normalizePositiveInt(this.config.asyncBash?.maxRunningPerRole, DEFAULT_ROLE_RUNNING_LIMIT);
    const globalLimit = normalizePositiveInt(this.config.asyncBash?.maxRunningGlobal, DEFAULT_GLOBAL_RUNNING_LIMIT);
    const runningJobs = await this.runningJobs();
    const roleRunning = runningJobs.filter((job) => job.role === context.role).length;
    if (roleRunning >= roleLimit) throw new Error(`async Bash running job limit reached for role ${context.role}: ${roleLimit}`);
    if (runningJobs.length >= globalLimit) throw new Error(`global async Bash running job limit reached: ${globalLimit}`);
    const timeoutMs = normalizePositiveInt(input.timeoutMs, DEFAULT_JOB_TIMEOUT_MS);
    const cwd = this.resolveCwd(input, context);
    const jobId = createId("async");
    const startedAt = nowIso();
    await ensureDir(this.logsDir);
    const stdoutPath = this.logFile(jobId, "stdout");
    const stderrPath = this.logFile(jobId, "stderr");
    await Promise.all([
      fs.writeFile(stdoutPath, "", "utf8"),
      fs.writeFile(stderrPath, "", "utf8")
    ]);
    const child = this.processFactory("bash", ["-lc", command], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: processEnvWithPatch(input.env)
    });
    const job = {
      jobId,
      state: "running",
      command,
      cwd,
      pid: child.pid,
      role: context.role,
      agentName: context.agentName,
      taskId: context.taskId,
      sessionId: context.sessionId,
      traceId: context.traceId,
      startedAt,
      timeoutMs,
      stdoutLines: 0,
      stderrLines: 0,
      stdoutBytes: 0,
      stderrBytes: 0
    };
    const stdoutStream = createWriteStream(stdoutPath, { flags: "a" });
    const stderrStream = createWriteStream(stderrPath, { flags: "a" });
    const live = {
      child,
      cancelled: false,
      timedOut: false,
      done: undefined
    };
    this.liveJobs.set(jobId, live);
    const persistLater = () => this.persistJob(job).catch((error) => this.logger?.error?.({ error: error.message, jobId }, "async Bash job persist failed"));
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk || "");
      job.stdoutBytes += Buffer.byteLength(text);
      job.stdoutLines += countLines(text);
      stdoutStream.write(text);
      persistLater();
    });
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk || "");
      job.stderrBytes += Buffer.byteLength(text);
      job.stderrLines += countLines(text);
      stderrStream.write(text);
      persistLater();
    });
    const timer = setTimeout(() => {
      live.timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    live.done = new Promise((resolve) => {
      child.on("error", async (error) => {
        clearTimeout(timer);
        job.state = "failed";
        job.error = error.message;
        job.endedAt = nowIso();
        await Promise.all([endStream(stdoutStream), endStream(stderrStream)]);
        await this.persistJob(job);
        this.liveJobs.delete(jobId);
        resolve(job);
      });
      child.on("close", async (exitCode, signal) => {
        clearTimeout(timer);
        job.exitCode = exitCode;
        job.signal = signal || undefined;
        job.endedAt = nowIso();
        if (live.cancelled) job.state = "cancelled";
        else if (live.timedOut) job.state = "timed_out";
        else job.state = exitCode === 0 ? "completed" : "failed";
        await Promise.all([endStream(stdoutStream), endStream(stderrStream)]);
        await this.persistJob(job);
        this.liveJobs.delete(jobId);
        resolve(job);
      });
    });
    await this.persistJob(job);
    return compactObject({
      jobId,
      state: job.state,
      pid: job.pid,
      cwd,
      command,
      startedAt,
      timeoutMs
    });
  }

  resolveCwd(input = {}, context = {}) {
    const workspace = context.hostContext?.workspace || this.config.workspace || process.cwd();
    const cwd = input.cwd || workspace;
    return path.isAbsolute(String(cwd)) ? path.resolve(String(cwd)) : path.resolve(workspace, String(cwd));
  }

  async status(input = {}, context = {}) {
    await this.ensureInitialized();
    const jobs = await this.selectJobs(input, context);
    return {
      jobs: await Promise.all(jobs.map((job) => this.formatJob(job, { ...input, hintToolId: context.toolId || "async_bash.status" }))),
      count: jobs.length
    };
  }

  async wait(input = {}, context = {}) {
    await this.ensureInitialized();
    const timeoutMs = normalizePositiveInt(input.timeoutMs, DEFAULT_WAIT_TIMEOUT_MS);
    const deadline = Date.now() + timeoutMs;
    let jobs = await this.selectJobs(input, context);
    while (jobs.some((job) => !TERMINAL_STATES.has(job.state))) {
      if (Date.now() >= deadline) {
        return {
          timedOut: true,
          jobs: await Promise.all(jobs.map((job) => this.formatJob(job, { ...input, hintToolId: context.toolId || "async_bash.status" }))),
          count: jobs.length
        };
      }
      await sleep(25);
      jobs = await Promise.all(jobs.map((job) => this.readJob(job.jobId)));
      for (const job of jobs) this.assertCanAccess(job, context);
    }
    return {
      jobs: await Promise.all(jobs.map((job) => this.formatJob(job, { ...input, hintToolId: context.toolId || "async_bash.status" }))),
      count: jobs.length
    };
  }

  async cancel(input = {}, context = {}) {
    await this.ensureInitialized();
    if (!input.jobId && !(Array.isArray(input.jobIds) && input.jobIds.length) && input.state !== "running") {
      throw new Error("async_bash.cancel requires jobId, jobIds, or state=running");
    }
    const jobs = await this.selectJobs(input, context);
    for (const job of jobs) {
      if (TERMINAL_STATES.has(job.state)) continue;
      const live = this.liveJobs.get(job.jobId);
      if (live?.child) {
        live.cancelled = true;
        live.child.kill(input.signal || "SIGTERM");
      }
      await this.persistJob({
        ...job,
        state: "cancelled",
        endedAt: job.endedAt || nowIso(),
        signal: input.signal || "SIGTERM"
      });
    }
    const refreshed = await Promise.all(jobs.map((job) => this.readJob(job.jobId)));
    return {
      jobs: await Promise.all(refreshed.map((job) => this.formatJob(job, { ...input, hintToolId: context.toolId || "async_bash.status" }))),
      count: refreshed.length
    };
  }

  async selectJobs(input = {}, context = {}) {
    let jobs;
    if (input.jobId) {
      jobs = [await this.readJob(input.jobId)];
    } else if (Array.isArray(input.jobIds) && input.jobIds.length) {
      jobs = await Promise.all(input.jobIds.map((jobId) => this.readJob(jobId)));
    } else {
      const state = normalizeState(input.state || "running");
      jobs = await this.listJobsFromDisk();
      if (state !== "all") jobs = jobs.filter((job) => job.state === state);
    }
    jobs = jobs.filter((job) => {
      this.assertCanAccess(job, context);
      return true;
    });
    jobs.sort((left, right) => String(right.startedAt || "").localeCompare(String(left.startedAt || "")));
    const limit = normalizePositiveInt(input.limit, jobs.length || 1);
    return jobs.slice(0, limit);
  }

  async formatJob(job, input = {}) {
    const stream = normalizeStream(input.stream);
    const tailLines = normalizeTailLines(input.tailLines);
    const stdoutText = stream === "stderr" ? "" : await readText(this.logFile(job.jobId, "stdout"));
    const stderrText = stream === "stdout" ? "" : await readText(this.logFile(job.jobId, "stderr"));
    const stdoutLines = splitLogLines(stdoutText);
    const stderrLines = splitLogLines(stderrText);
    const output = compactObject({
      jobId: job.jobId,
      state: job.state,
      command: job.command,
      cwd: job.cwd,
      pid: job.pid,
      role: job.role,
      taskId: job.taskId,
      sessionId: job.sessionId,
      traceId: job.traceId,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      durationMs: durationMs(job),
      timeoutMs: job.timeoutMs,
      exitCode: job.exitCode,
      signal: job.signal,
      stdoutLines: stdoutLines.length || job.stdoutLines || 0,
      stderrLines: stderrLines.length || job.stderrLines || 0,
      stdoutBytes: Buffer.byteLength(stdoutText) || job.stdoutBytes || 0,
      stderrBytes: Buffer.byteLength(stderrText) || job.stderrBytes || 0,
      fullLogHint: `Default output is a tail. Use ${input.hintToolId || "async_bash.status"} with logMode=full, cursor, or fromLine/toLine to read more output.`
    });
    const logMode = String(input.logMode || "tail");
    if (logMode === "full") {
      if (stream !== "stderr") output.stdout = stdoutText;
      if (stream !== "stdout") output.stderr = stderrText;
      output.truncated = false;
      return output;
    }
    const ranges = this.logRanges(input, { stdoutLines, stderrLines, tailLines });
    if (stream !== "stderr") output.stdoutTail = lineSlice(stdoutLines, ranges.stdout);
    if (stream !== "stdout") output.stderrTail = lineSlice(stderrLines, ranges.stderr);
    output.cursor = {
      stdoutLine: stdoutLines.length,
      stderrLine: stderrLines.length
    };
    output.truncated = Boolean(
      (stream !== "stderr" && ranges.stdout.fromLine > 1) ||
      (stream !== "stdout" && ranges.stderr.fromLine > 1)
    );
    return output;
  }

  logRanges(input, { stdoutLines, stderrLines, tailLines }) {
    if (input.cursor && typeof input.cursor === "object") {
      return {
        stdout: {
          fromLine: normalizePositiveInt(input.cursor.stdoutLine, 0) + 1,
          toLine: stdoutLines.length
        },
        stderr: {
          fromLine: normalizePositiveInt(input.cursor.stderrLine, 0) + 1,
          toLine: stderrLines.length
        }
      };
    }
    if (input.fromLine !== undefined || input.toLine !== undefined) {
      const fromLine = normalizePositiveInt(input.fromLine, 1);
      const toLine = input.toLine === undefined ? undefined : normalizePositiveInt(input.toLine, fromLine);
      return {
        stdout: { fromLine, toLine },
        stderr: { fromLine, toLine }
      };
    }
    return {
      stdout: { fromLine: Math.max(1, stdoutLines.length - tailLines + 1), toLine: stdoutLines.length },
      stderr: { fromLine: Math.max(1, stderrLines.length - tailLines + 1), toLine: stderrLines.length }
    };
  }
}

function durationMs(job = {}) {
  const start = Date.parse(job.startedAt || "");
  const end = job.endedAt ? Date.parse(job.endedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return Math.max(0, end - start);
}
