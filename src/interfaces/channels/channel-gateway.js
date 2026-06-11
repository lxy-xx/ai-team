export class ChannelGateway {
  constructor({ logger, config, engine }) {
    this.logger = logger;
    this.config = config;
    this.engine = engine;
  }

  async deliverToCeo(input) {
    const text = String(input.text || "").trim();
    if (!text) return { ignored: true, reason: "empty text" };
    if (typeof this.engine?.deliverChannelMessageToCeo !== "function") {
      throw new Error("CEO channel delivery is required for channel ingress");
    }

    const result = await this.engine.deliverChannelMessageToCeo({
      ...input,
      text
    });
    this.logger.info(
      { intentId: result.intent?.id, channel: input.channel || "unknown", created: result.created, directAgentTurn: result.directAgentTurn },
      "channel message delivered to CEO"
    );
    return result;
  }
}
