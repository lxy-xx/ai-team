import test from "node:test";
import assert from "node:assert/strict";
import { calculateFeishuSignature, FeishuChannel, verifyFeishuSignature } from "../src/interfaces/channels/feishu/feishu-webhook-adapter.js";
import { FeishuApiClient } from "../src/interfaces/channels/feishu/feishu-api-client.js";
import { FeishuLongConnection } from "../src/interfaces/channels/feishu/feishu-long-connection.js";

test("Feishu signature uses timestamp + nonce + encrypt key + raw body", () => {
  const rawBody = JSON.stringify({ hello: "world" });
  const signature = calculateFeishuSignature({
    timestamp: "100",
    nonce: "abc",
    encryptKey: "secret",
    rawBody
  });
  assert.equal(signature.length, 64);
  assert.equal(
    verifyFeishuSignature({
      headers: {
        "x-lark-request-timestamp": "100",
        "x-lark-request-nonce": "abc",
        "x-lark-signature": signature
      },
      rawBody,
      encryptKey: "secret"
    }),
    true
  );
});

test("FeishuChannel replies to the original message when messageId is available", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes("tenant_access_token")) {
      return {
        ok: true,
        async json() {
          return { code: 0, tenant_access_token: "tenant_token", expire: 3600 };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return { code: 0, data: { message_id: "om_reply" } };
      }
    };
  };

  try {
    const channel = new FeishuChannel({
      config: { feishu: {} },
      channelConfigStore: {
        async getFeishuRuntime() {
          return { appId: "cli_test", appSecret: "secret" };
        }
      },
      logger: { info() {}, debug() {} }
    });
    const result = await channel.sendReply(
      { id: "task_1", replyTarget: { chatId: "oc_1", messageId: "om_1" } },
      "完成"
    );

    assert.equal(result.sent, true);
    assert.equal(result.transport, "message_reply");
    assert.equal(result.messageId, "om_reply");
    assert.equal(calls.length, 2);
    assert.ok(String(calls[1].url).endsWith("/im/v1/messages/om_1/reply"));
    assert.equal(calls[1].options.headers.authorization, "Bearer tenant_token");
    assert.deepEqual(JSON.parse(JSON.parse(calls[1].options.body).content), { text: "完成" });
  } finally {
    global.fetch = originalFetch;
  }
});

test("FeishuChannel reports missing reply target separately from missing credentials", async () => {
  const channel = new FeishuChannel({
    config: { feishu: {} },
    channelConfigStore: {
      async getFeishuRuntime() {
        return { appId: "cli_test", appSecret: "secret" };
      }
    },
    logger: { info() {}, debug() {} }
  });

  const result = await channel.sendReply(
    { id: "task_1", replyTarget: { channel: "feishu", threadId: "oc_1", userId: "ou_1" } },
    "阻塞了"
  );

  assert.equal(result.sent, false);
  assert.equal(result.reason, "missing reply target");
});

test("FeishuApiClient adds a reaction to the original message", async () => {
  const calls = [];
  const client = new FeishuApiClient({
    async fetchImpl(url, options) {
      calls.push({ url, options });
      if (String(url).includes("tenant_access_token")) {
        return {
          ok: true,
          async json() {
            return { code: 0, tenant_access_token: "tenant_token", expire: 3600 };
          }
        };
      }
      return {
        ok: true,
        async json() {
          return { code: 0, data: { reaction_id: "reaction_1" } };
        }
      };
    }
  });

  const result = await client.addMessageReaction("om_1", "OK", { appId: "cli_test", appSecret: "secret" });

  assert.equal(result.data.reaction_id, "reaction_1");
  assert.equal(calls.length, 2);
  assert.ok(String(calls[1].url).endsWith("/im/v1/messages/om_1/reactions"));
  assert.equal(calls[1].options.headers.authorization, "Bearer tenant_token");
  assert.deepEqual(JSON.parse(calls[1].options.body), { reaction_type: { emoji_type: "OK" } });
});

test("Feishu websocket reacts to the original message before routing it", async () => {
  const events = [];
  const connection = new FeishuLongConnection({
    channelConfigStore: {
      async getFeishuRuntime() {
        return {
          appId: "cli_test",
          appSecret: "secret",
          ackReactionType: "OK",
          groupReplyAll: true,
          shareSessionInChannel: true
        };
      }
    },
    apiClient: {
      async addMessageReaction(messageId, reactionType) {
        events.push({ type: "reaction", messageId, reactionType });
        return { code: 0 };
      }
    },
    channelGateway: {
      async deliverToCeo(input) {
        events.push({ type: "deliver", input });
        return { created: true, task: { id: "task_1" } };
      }
    },
    logger: { info() {}, debug() {}, warn() {} }
  });

  await connection.handleMessage({
    sender: { sender_id: { open_id: "ou_allowed", union_id: "on_allowed" } },
    message: {
      message_id: "om_allowed",
      chat_id: "oc_allowed",
      chat_type: "group",
      message_type: "text",
      content: JSON.stringify({ text: "帮我修复 Dashboard 国际化" })
    }
  });

  assert.deepEqual(events.map((event) => event.type), ["reaction", "deliver"]);
  assert.equal(events[0].messageId, "om_allowed");
  assert.equal(events[0].reactionType, "OK");
});

test("Feishu websocket continues routing when reaction fails", async () => {
  const delivered = [];
  const warnings = [];
  const connection = new FeishuLongConnection({
    channelConfigStore: {
      async getFeishuRuntime() {
        return {
          appId: "cli_test",
          appSecret: "secret",
          groupReplyAll: true,
          shareSessionInChannel: true
        };
      }
    },
    apiClient: {
      async addMessageReaction() {
        throw new Error("missing reaction scope");
      }
    },
    channelGateway: {
      async deliverToCeo(input) {
        delivered.push(input);
        return { created: true, task: { id: "task_1" } };
      }
    },
    logger: { info() {}, debug() {}, warn(event) { warnings.push(event); } }
  });

  await connection.handleMessage({
    sender: { sender_id: { open_id: "ou_allowed", union_id: "on_allowed" } },
    message: {
      message_id: "om_allowed",
      chat_id: "oc_allowed",
      chat_type: "group",
      message_type: "text",
      content: JSON.stringify({ text: "帮我修复 Dashboard 国际化" })
    }
  });

  assert.equal(delivered.length, 1);
  assert.equal(warnings[0].messageId, "om_allowed");
});

test("Feishu websocket reacts and routes conversational messages for CEO judgment", async () => {
  const reactions = [];
  const delivered = [];
  const connection = new FeishuLongConnection({
    channelConfigStore: {
      async getFeishuRuntime() {
        return {
          appId: "cli_test",
          appSecret: "secret",
          groupReplyAll: true,
          shareSessionInChannel: true
        };
      }
    },
    apiClient: {
      async addMessageReaction(messageId, reactionType) {
        reactions.push({ messageId, reactionType });
      }
    },
    channelGateway: {
      async deliverToCeo(input) {
        delivered.push(input);
        return { ignored: false, directAgentTurn: true, finalText: "你好，我是 Franklin。" };
      }
    },
    logger: { info() {}, debug() {}, warn() {} }
  });

  await connection.handleMessage({
    sender: { sender_id: { open_id: "ou_allowed", union_id: "on_allowed" } },
    message: {
      message_id: "om_chitchat",
      chat_id: "oc_allowed",
      chat_type: "group",
      message_type: "text",
      content: JSON.stringify({ text: "你好" })
    }
  });

  assert.deepEqual(reactions, [{ messageId: "om_chitchat", reactionType: "OK" }]);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].text, "你好");
});

test("Feishu websocket allowlists accept newline-separated user and chat IDs", async () => {
  const delivered = [];
  const connection = new FeishuLongConnection({
    channelConfigStore: {
      async getFeishuRuntime() {
        return {
          allowFrom: "ou_blocked\nou_allowed",
          allowChat: "oc_blocked\noc_allowed",
          groupReplyAll: true,
          shareSessionInChannel: true
        };
      }
    },
    channelGateway: {
      async deliverToCeo(input) {
        delivered.push(input);
        return { created: true, task: { id: "task_1" } };
      }
    },
    logger: { info() {}, debug() {} }
  });

  await connection.handleMessage({
    sender: { sender_id: { open_id: "ou_allowed", union_id: "on_allowed" } },
    message: {
      message_id: "om_allowed",
      chat_id: "oc_allowed",
      chat_type: "group",
      message_type: "text",
      content: JSON.stringify({ text: "hello" })
    }
  });
  await connection.handleMessage({
    sender: { sender_id: { open_id: "ou_missing" } },
    message: {
      message_id: "om_user_denied",
      chat_id: "oc_allowed",
      chat_type: "group",
      message_type: "text",
      content: JSON.stringify({ text: "blocked user" })
    }
  });
  await connection.handleMessage({
    sender: { sender_id: { open_id: "ou_allowed" } },
    message: {
      message_id: "om_chat_denied",
      chat_id: "oc_missing",
      chat_type: "group",
      message_type: "text",
      content: JSON.stringify({ text: "blocked chat" })
    }
  });

  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].userId, "ou_allowed");
  assert.equal(delivered[0].threadId, "oc_allowed");
  assert.equal(delivered[0].text, "hello");
});

test("Feishu websocket ignores unmentioned group messages when bot identity is unknown", async () => {
  const delivered = [];
  const connection = new FeishuLongConnection({
    channelConfigStore: {
      async getFeishuRuntime() {
        return {
          groupReplyAll: false,
          shareSessionInChannel: true
        };
      }
    },
    channelGateway: {
      async deliverToCeo(input) {
        delivered.push(input);
        return { created: true, task: { id: "task_1" } };
      }
    },
    logger: { info() {}, debug() {} }
  });

  await connection.handleMessage({
    sender: { sender_id: { open_id: "ou_sender", union_id: "on_sender" } },
    message: {
      message_id: "om_group_unmentioned",
      chat_id: "oc_group",
      chat_type: "group",
      message_type: "text",
      mentions: [],
      content: JSON.stringify({ text: "hello group" })
    }
  });

  assert.equal(delivered.length, 0);
});

test("Feishu webhook ignores unmentioned group messages when bot identity is unknown", async () => {
  const delivered = [];
  const channel = new FeishuChannel({
    config: { feishu: {} },
    channelConfigStore: {
      async getFeishuRuntime() {
        return {
          groupReplyAll: false,
          shareSessionInChannel: true
        };
      }
    },
    channelGateway: {
      async deliverToCeo(input) {
        delivered.push(input);
        return { created: true, task: { id: "task_1" } };
      }
    },
    logger: { info() {}, debug() {} }
  });

  const result = await channel.handleWebhook({
    headers: {},
    rawBody: JSON.stringify({
      header: { event_type: "im.message.receive_v1", event_id: "evt_group_unmentioned" },
      event: {
        sender: { sender_id: { open_id: "ou_sender", union_id: "on_sender" } },
        message: {
          message_id: "om_group_unmentioned",
          chat_id: "oc_group",
          chat_type: "group",
          message_type: "text",
          mentions: [],
          content: JSON.stringify({ text: "hello group" })
        }
      }
    })
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ignored, true);
  assert.equal(delivered.length, 0);
});

test("FeishuApiClient passes abort signal to tenant token request", async () => {
  const client = new FeishuApiClient({
    timeoutMs: 25,
    async fetchImpl(url, options) {
      assert.ok(String(url).includes("tenant_access_token"));
      assert.ok(options.signal instanceof AbortSignal);
      return {
        ok: true,
        async json() {
          return { code: 0, tenant_access_token: "tenant_token", expire: 3600 };
        }
      };
    }
  });

  const token = await client.getTenantAccessToken({ appId: "app_1", appSecret: "secret_1" });

  assert.equal(token, "tenant_token");
});

test("FeishuApiClient reports timed out requests", async () => {
  const client = new FeishuApiClient({
    timeoutMs: 5,
    fetchImpl(_url, options) {
      assert.ok(options.signal instanceof AbortSignal);
      return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    }
  });

  await assert.rejects(
    () => client.getTenantAccessToken({ appId: "app_1", appSecret: "secret_1" }),
    /feishu request timed out after 5ms/
  );
});

test("FeishuApiClient keeps timeout active while reading tenant token body", async () => {
  const client = new FeishuApiClient({
    timeoutMs: 5,
    async fetchImpl(_url, options) {
      assert.ok(options.signal instanceof AbortSignal);
      return {
        ok: true,
        json() {
          return new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            }, { once: true });
            setTimeout(() => reject(new Error("json body was not aborted")), 25);
          });
        }
      };
    }
  });

  await assert.rejects(
    () => client.getTenantAccessToken({ appId: "app_1", appSecret: "secret_1" }),
    /feishu request timed out after 5ms/
  );
});
