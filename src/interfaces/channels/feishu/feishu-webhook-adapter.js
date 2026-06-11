import crypto from "node:crypto";
import { stableHash } from "../../../platform/ids.js";
import { FeishuApiClient } from "./feishu-api-client.js";

function header(headers, name) {
  return headers[name.toLowerCase()];
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(a || "", "utf8");
  const right = Buffer.from(b || "", "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function calculateFeishuSignature({ timestamp, nonce, encryptKey, rawBody }) {
  const prefix = Buffer.from(`${timestamp}${nonce}${encryptKey}`, "utf8");
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  return crypto.createHash("sha256").update(Buffer.concat([prefix, body])).digest("hex");
}

export function verifyFeishuSignature({ headers, rawBody, encryptKey }) {
  if (!encryptKey) return true;
  const timestamp = header(headers, "x-lark-request-timestamp");
  const nonce = header(headers, "x-lark-request-nonce");
  const signature = header(headers, "x-lark-signature");
  if (!timestamp || !nonce || !signature) return false;
  const expected = calculateFeishuSignature({ timestamp, nonce, encryptKey, rawBody });
  return timingSafeEqualString(expected, signature);
}

export function decryptFeishuPayload(encryptKey, encrypted) {
  const key = crypto.createHash("sha256").update(encryptKey, "utf8").digest();
  const encryptedBytes = Buffer.from(encrypted, "base64");
  const iv = encryptedBytes.subarray(0, 16);
  const cipherText = encryptedBytes.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

function parseJsonMaybe(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return { text: String(value) };
  }
}

function normalizeText(message) {
  const content = parseJsonMaybe(message?.content);
  const text = content.text || content.title || JSON.stringify(content);
  return String(text || "")
    .replace(/<at[^>]*>.*?<\/at>/g, "")
    .trim();
}

function botMentioned(message, botOpenId) {
  if (!botOpenId) return false;
  return (message?.mentions || []).some((mention) => {
    const id = mention?.id || mention?.user_id || {};
    return id.open_id === botOpenId || id.user_id === botOpenId || mention?.key === botOpenId;
  });
}

export class FeishuChannel {
  constructor({ config, logger, channelConfigStore, channelGateway, apiClient }) {
    this.name = "feishu";
    this.config = config.feishu;
    this.channelConfigStore = channelConfigStore;
    this.channelGateway = channelGateway;
    this.logger = logger;
    this.apiClient = apiClient || new FeishuApiClient();
  }

  async handleWebhook({ rawBody, headers }) {
    const runtime = await this.getRuntimeConfig();
    let envelope = JSON.parse(rawBody || "{}");
    if (runtime.encryptKey && !verifyFeishuSignature({ headers, rawBody, encryptKey: runtime.encryptKey })) {
      return {
        status: 401,
        body: { error: "invalid feishu signature" }
      };
    }

    const encrypted = Boolean(envelope.encrypt);
    const payload = encrypted
      ? decryptFeishuPayload(runtime.encryptKey, envelope.encrypt)
      : envelope;

    if (payload.type === "url_verification") {
      this.verifyToken(payload, runtime);
      return {
        status: 200,
        body: { challenge: payload.challenge }
      };
    }

    this.verifyToken(payload, runtime);

    const eventType = payload.header?.event_type || payload.type;
    if (eventType !== "im.message.receive_v1") {
      this.logger.debug({ eventType }, "ignored feishu event");
      return { status: 200, body: { ok: true, ignored: true } };
    }

    const message = payload.event?.message;
    const sender = payload.event?.sender;
    if (message?.chat_type === "group" && !runtime.groupReplyAll && !botMentioned(message, runtime.botOpenId)) {
      this.logger.debug({ chatId: message?.chat_id }, "ignored feishu webhook group message without bot mention");
      return { status: 200, body: { ok: true, ignored: true, reason: "bot not mentioned" } };
    }
    const text = normalizeText(message);
    if (!text) return { status: 200, body: { ok: true, ignored: true, reason: "empty text" } };

    const chatId = message?.chat_id;
    const eventId = payload.header?.event_id || message?.message_id || stableHash(rawBody);
    await this.ackMessage(message?.message_id, runtime);
    const result = await this.channelGateway.deliverToCeo({
      channel: "feishu",
      source: "feishu",
      transport: "http_webhook",
      threadId: chatId || message?.message_id || "feishu",
      userId: sender?.sender_id?.open_id || sender?.sender_id?.user_id || "unknown",
      userName: sender?.sender_id?.union_id,
      text,
      dedupeKey: `feishu:${eventId}`,
      replyTarget: {
        chatId,
        messageId: message?.message_id
      },
      metadata: {
        eventId,
        eventType,
        encrypted,
        eventMode: "webhook"
      }
    });

    const intentId = result.intent?.id || result.task?.id;
    this.logger.info({ intentId, created: result.created, eventId }, "feishu event routed to CEO/CTO");
    return { status: 200, body: { ok: true, intentId, created: result.created, route: "ceo_cto" } };
  }

  async getRuntimeConfig() {
    if (!this.channelConfigStore) return this.config;
    return this.channelConfigStore.getFeishuRuntime(this.config);
  }

  verifyToken(payload, runtime) {
    if (!runtime.verificationToken) return true;
    const token = payload.token || payload.header?.token;
    if (token !== runtime.verificationToken) {
      const error = new Error("invalid feishu verification token");
      error.status = 401;
      throw error;
    }
    return true;
  }

  async sendReply(task, message) {
    const runtime = await this.getRuntimeConfig();
    const chatId = task.replyTarget?.chatId;
    const messageId = task.replyTarget?.messageId;
    if (runtime.appId && runtime.appSecret && messageId) {
      const result = await this.replyAppMessage(messageId, message, runtime);
      return { sent: true, channel: "feishu", transport: "message_reply", messageId: result?.data?.message_id };
    }
    if (runtime.appId && runtime.appSecret && chatId) {
      const result = await this.sendAppMessage(chatId, message, runtime);
      return { sent: true, channel: "feishu", transport: "chat_message", messageId: result?.data?.message_id };
    }
    if (runtime.outgoingWebhookUrl) {
      await this.apiClient.sendIncomingWebhook(runtime.outgoingWebhookUrl, message);
      return { sent: true, channel: "feishu", transport: "incoming_webhook" };
    }
    if (runtime.appId && runtime.appSecret) {
      this.logger.info({ taskId: task.id, replyTarget: task.replyTarget }, "feishu reply skipped; missing reply target");
      return { sent: false, channel: "feishu", reason: "missing reply target" };
    }
    this.logger.info({ taskId: task.id, message }, "feishu reply skipped; no credentials configured");
    return { sent: false, channel: "feishu", reason: "no credentials configured" };
  }

  async getTenantAccessToken(runtime) {
    return this.apiClient.getTenantAccessToken(runtime);
  }

  async sendAppMessage(chatId, message, runtime) {
    return this.apiClient.sendAppMessage(chatId, message, runtime);
  }

  async replyAppMessage(messageId, message, runtime) {
    return this.apiClient.replyAppMessage(messageId, message, runtime);
  }

  async ackMessage(messageId, runtime) {
    if (!messageId || !runtime?.appId || !runtime?.appSecret) return undefined;
    try {
      return await this.apiClient.addMessageReaction(messageId, runtime.ackReactionType || "OK", runtime);
    } catch (error) {
      this.logger.warn?.({ messageId, error: error.message }, "feishu reaction failed");
      return undefined;
    }
  }
}
