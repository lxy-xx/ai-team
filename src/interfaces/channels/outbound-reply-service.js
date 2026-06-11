export class OutboundReplyService {
  constructor({ channels, memory, logger }) {
    this.channels = channels;
    this.memory = memory;
    this.logger = logger;
  }

  async send(task, message, { source = "scheduler" } = {}) {
    const channel = this.channels.get(task.channel) || this.channels.get("cli");
    if (!channel || typeof channel.sendReply !== "function") {
      return this.record(task, {
        source,
        status: "skipped",
        reason: "channel has no sendReply",
        message
      });
    }

    try {
      const result = await channel.sendReply(task, message);
      return this.record(task, {
        source,
        status: result?.sent === false ? "skipped" : "sent",
        channel: channel.name || task.channel,
        reason: result?.reason,
        transport: result?.transport,
        messageId: result?.messageId,
        message
      });
    } catch (error) {
      await this.record(task, {
        source,
        status: "failed",
        channel: channel.name || task.channel,
        reason: error.message,
        message
      });
      throw error;
    }
  }

  async record(task, event) {
    const entry = {
      type: "outbound_reply",
      taskId: task.id,
      channel: task.channel,
      threadId: task.threadId,
      replyTarget: task.replyTarget,
      ...event
    };
    if (this.memory) await this.memory.recordEvent(entry);
    this.logger?.info?.(entry, `outbound reply ${entry.status}`);
    return entry;
  }
}
