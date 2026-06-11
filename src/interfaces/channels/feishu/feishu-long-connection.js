import * as Lark from "@larksuiteoapi/node-sdk";
import { FeishuApiClient } from "./feishu-api-client.js";

function parseJsonMaybe(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return { text: String(value) };
  }
}

function allowList(patterns, value) {
  const list = String(patterns || "")
    .split(/[,\r\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!list.length || list.includes("*")) return true;
  return list.includes(value);
}

function normalizeText(message) {
  const content = parseJsonMaybe(message?.content);
  if (message?.message_type === "image") return "[image]";
  if (message?.message_type === "file") return `[file: ${content.file_name || content.file_key || "attachment"}]`;
  if (message?.message_type === "audio") return "[audio]";
  if (message?.message_type === "media") return `[video: ${content.file_name || content.file_key || "media"}]`;
  if (message?.message_type === "merge_forward") return "[merge_forward]";
  return String(content.text || content.title || content.content || JSON.stringify(content) || "")
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

function makeSessionKey(message, senderOpenId, runtime) {
  const chatId = message?.chat_id || "feishu";
  if (runtime.threadIsolation && (message?.thread_id || message?.root_id)) {
    return `${chatId}:${message.thread_id || message.root_id}`;
  }
  if (message?.chat_type === "p2p") return `p2p:${senderOpenId || chatId}`;
  return runtime.shareSessionInChannel === false ? `${chatId}:${senderOpenId || "unknown"}` : chatId;
}

function larkDomain(value) {
  return value === "lark" ? Lark.Domain.Lark : Lark.Domain.Feishu;
}

export class FeishuLongConnection {
  constructor({ channelConfigStore, channelGateway, logger, apiClient }) {
    this.channelConfigStore = channelConfigStore;
    this.channelGateway = channelGateway;
    this.logger = logger;
    this.apiClient = apiClient || new FeishuApiClient();
    this.wsClient = undefined;
    this.started = false;
    this.startedAt = Date.now();
    this.botOpenId = undefined;
  }

  async start() {
    if (this.started) return true;
    const runtime = await this.channelConfigStore.getFeishuRuntime();
    if (runtime.eventMode !== "websocket" || runtime.enabled === false) {
      this.logger.info({ enabled: runtime.enabled, eventMode: runtime.eventMode }, "feishu websocket disabled");
      return false;
    }
    if (!runtime.appId || !runtime.appSecret) {
      this.logger.warn({}, "feishu websocket not started; appId/appSecret missing");
      return false;
    }

    const baseConfig = {
      appId: runtime.appId,
      appSecret: runtime.appSecret,
      domain: larkDomain(runtime.domain),
      loggerLevel: Lark.LoggerLevel.info
    };

    this.runtime = runtime;
    await this.fetchBotOpenId(runtime);
    this.wsClient = new Lark.WSClient(baseConfig);
    const dispatcher = new Lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data) => {
        await this.handleMessage(data);
        return { code: 0 };
      }
    });

    this.wsClient.start({ eventDispatcher: dispatcher });
    this.started = true;
    this.logger.info({ eventMode: "websocket" }, "feishu websocket long connection started");
    return true;
  }

  async fetchBotOpenId(runtime) {
    try {
      const client = new Lark.Client({
        appId: runtime.appId,
        appSecret: runtime.appSecret,
        domain: larkDomain(runtime.domain)
      });
      const response = await client.contact.v3.user.batchGetId({
        data: { emails: [] }
      });
      this.botOpenId = response?.data?.user_list?.[0]?.user_id;
    } catch {
      this.botOpenId = undefined;
    }
  }

  async handleMessage(data) {
    const runtime = this.runtime || (await this.channelConfigStore.getFeishuRuntime());
    const message = data.message;
    const sender = data.sender;
    const senderId = sender?.sender_id || {};
    const userId = senderId.open_id || senderId.user_id || senderId.union_id || "unknown";
    const chatId = message?.chat_id || "feishu";
    if (message?.create_time && Number(message.create_time) < this.startedAt) {
      this.logger.debug({ messageId: message?.message_id }, "feishu websocket old message ignored");
      return;
    }
    if (!allowList(runtime.allowFrom, userId)) {
      this.logger.debug({ userId }, "feishu websocket message from unauthorized user ignored");
      return;
    }
    if (message?.chat_type === "group" && !allowList(runtime.allowChat, chatId)) {
      this.logger.debug({ chatId }, "feishu websocket message from unauthorized chat ignored");
      return;
    }
    if (runtime.groupOnly && message?.chat_type !== "group") {
      this.logger.debug({ chatType: message?.chat_type }, "feishu websocket p2p ignored because groupOnly=true");
      return;
    }
    if (message?.chat_type === "group" && !runtime.groupReplyAll && !botMentioned(message, this.botOpenId)) {
      this.logger.debug({ chatId }, "feishu websocket group message without bot mention ignored");
      return;
    }
    const text = normalizeText(message);
    const sessionKey = makeSessionKey(message, userId, runtime);
    if (text) await this.ackMessage(message?.message_id, runtime);
    const result = await this.channelGateway.deliverToCeo({
      channel: "feishu",
      source: "feishu_ws",
      transport: "feishu_websocket",
      threadId: sessionKey,
      userId,
      userName: senderId.union_id,
      text,
      eventId: message?.message_id,
      replyTarget: {
        chatId: message?.chat_id,
        messageId: message?.message_id,
        sessionKey
      },
      metadata: {
        eventType: "im.message.receive_v1",
        eventMode: "websocket",
        messageType: message?.message_type,
        chatType: message?.chat_type,
        rootId: message?.root_id,
        threadId: message?.thread_id
      }
    });
    this.logger.info({ taskId: result.task?.id, created: result.created }, "feishu websocket event routed to CEO/CTO");
  }

  async ackMessage(messageId, runtime) {
    if (!messageId || !runtime?.appId || !runtime?.appSecret) return undefined;
    try {
      return await this.apiClient.addMessageReaction(messageId, runtime.ackReactionType || "OK", runtime);
    } catch (error) {
      this.logger.warn?.({ messageId, error: error.message }, "feishu websocket reaction failed");
      return undefined;
    }
  }
}
