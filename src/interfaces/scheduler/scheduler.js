import { stableHash } from "../../platform/ids.js";

const FEEDBACK_HINTS = [
  "希望",
  "建议",
  "能不能",
  "可不可以",
  "改成",
  "调整",
  "不好用",
  "问题",
  "bug",
  "feature",
  "feedback",
  "request",
  "change"
];

function looksLikeFeedback(text) {
  const lowered = String(text || "").toLowerCase();
  return FEEDBACK_HINTS.some((hint) => lowered.includes(hint.toLowerCase()));
}

function isFeedbackSourceEvent(event) {
  return event?.type === "task_received" ||
    event?.type === "channel_message_to_ceo" ||
    event?.type === "engine_intent_created";
}

async function engineFeedbackRows(engine) {
  if (typeof engine?.readModel === "function") return (await engine.readModel()).feedback || [];
  if (typeof engine?.store?.readModel === "function") return (await engine.store.readModel()).feedback || [];
  return [];
}

export class Scheduler {
  constructor({
    logger,
    pollIntervalMs,
    memory,
    feedbackScanIntervalMs,
    engine
  }) {
    this.logger = logger;
    this.pollIntervalMs = pollIntervalMs;
    this.memory = memory;
    this.feedbackScanIntervalMs = feedbackScanIntervalMs;
    this.engine = engine;
    this.timer = undefined;
    this.feedbackTimer = undefined;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processOnce().catch((error) => {
        this.logger.error({ error: error.message, stack: error.stack }, "scheduler tick failed");
      });
    }, this.pollIntervalMs);
    this.timer.unref?.();
    if (this.engine?.createFeedback && this.memory?.recentEvents && !this.feedbackTimer) {
      this.feedbackTimer = setInterval(() => {
        this.scanFeedback().catch((error) => {
          this.logger.error({ error: error.message, stack: error.stack }, "feedback scan failed");
        });
      }, this.feedbackScanIntervalMs);
      this.feedbackTimer.unref?.();
    }
    this.logger.info({ pollIntervalMs: this.pollIntervalMs }, "scheduler started");
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.feedbackTimer) clearInterval(this.feedbackTimer);
    this.timer = undefined;
    this.feedbackTimer = undefined;
  }

  async scanFeedback() {
    if (!this.engine?.createFeedback || !this.memory?.recentEvents) return [];
    return this.scanEngineFeedback();
  }

  async scanEngineFeedback() {
    const events = await this.memory.recentEvents(500);
    const existing = new Set(
      (await engineFeedbackRows(this.engine)).map((item) => item.dedupeKey || stableHash(`${item.source?.threadId}:${item.text}`))
    );
    const additions = [];

    for (const event of events) {
      if (!isFeedbackSourceEvent(event)) continue;
      if (event.channel === "cli") continue;
      if (!looksLikeFeedback(event.text)) continue;
      const dedupeKey = stableHash(`${event.threadId}:${event.text}`);
      if (existing.has(dedupeKey)) continue;
      existing.add(dedupeKey);
      additions.push(
        await this.engine.createFeedback({
          status: "new",
          priority: "untriaged",
          source: {
            channel: event.channel,
            threadId: event.threadId,
            userId: event.userId,
            taskId: event.taskId
          },
          text: event.text,
          linkedIntentId: event.intentId,
          linkedTaskId: event.taskId,
          dedupeKey
        })
      );
    }

    if (additions.length > 0) {
      this.logger.info({ count: additions.length }, "engine customer feedback backlog updated");
    }
    return additions;
  }

  async processOnce() {
    if (!this.engine) return { processed: false, engine: false, reason: "engine_unavailable" };
    const result = await this.engine.tick();
    return {
      processed: result.processed > 0,
      engine: true,
      count: result.processed,
      reason: result.reason
    };
  }
}
