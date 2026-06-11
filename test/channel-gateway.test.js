import test from "node:test";
import assert from "node:assert/strict";
import { ChannelGateway } from "../src/interfaces/channels/channel-gateway.js";

test("ChannelGateway delegates every non-empty channel message to CEO delivery", async () => {
  let engineInput;
  let logEvent;
  const engineResult = { ignored: false, directAgentTurn: true, finalText: "我是 Franklin。" };
  const gateway = new ChannelGateway({
    engine: {
      async createIntentFromMessage() {
        throw new Error("Gateway must not create intents directly");
      },
      async deliverChannelMessageToCeo(input) {
        engineInput = input;
        return engineResult;
      }
    },
    logger: {
      info(event) {
        logEvent = event;
      }
    },
    config: { workspace: "/workspace" }
  });

  const result = await gateway.deliverToCeo({
    channel: "feishu",
    transport: "websocket",
    threadId: "thread_1",
    userId: "user_1",
    text: "  你叫什么名字？  ",
    metadata: { priority: "high" }
  });

  assert.equal(result, engineResult);
  assert.equal(engineInput.text, "你叫什么名字？");
  assert.equal(engineInput.workspace, undefined);
  assert.equal(engineInput.metadata.priority, "high");
  assert.equal(engineInput.channel, "feishu");
  assert.equal(engineInput.transport, "websocket");
  assert.deepEqual(logEvent, { intentId: undefined, channel: "feishu", created: undefined, directAgentTurn: true });
});

test("ChannelGateway does not triage work-like text before CEO sees it", async () => {
  const delivered = [];
  const gateway = new ChannelGateway({
    engine: {
      async createIntentFromMessage() {
        throw new Error("Gateway must not create intents directly");
      },
      async deliverChannelMessageToCeo(input) {
        delivered.push(input);
        return { intent: { id: "intent_1" }, created: true, ignored: false, directAgentTurn: true };
      }
    },
    logger: { info() {} },
    config: { workspace: "/workspace" }
  });

  const result = await gateway.deliverToCeo({
    channel: "feishu",
    threadId: "thread_1",
    userId: "user_1",
    text: "帮我把 Dashboard 支持中英文切换"
  });

  assert.equal(result.created, true);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].text, "帮我把 Dashboard 支持中英文切换");
});

test("ChannelGateway ignores empty text without requiring TeamEngine", async () => {
  const gateway = new ChannelGateway({
    logger: { info() {} },
    config: { workspace: "/workspace" }
  });

  const result = await gateway.deliverToCeo({
    channel: "feishu",
    threadId: "thread_1",
    userId: "user_1",
    text: "   "
  });

  assert.equal(result.ignored, true);
  assert.equal(result.reason, "empty text");
});

test("ChannelGateway requires CEO delivery support for non-empty ingress", async () => {
  const gateway = new ChannelGateway({
    logger: { info() {} },
    config: { workspace: "/workspace" }
  });

  await assert.rejects(() => gateway.deliverToCeo({
    channel: "cli",
    threadId: "cli",
    userId: "local",
    text: "ship the feature"
  }), /CEO channel delivery is required/);
});
