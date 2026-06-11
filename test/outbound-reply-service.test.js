import test from "node:test";
import assert from "node:assert/strict";
import { OutboundReplyService } from "../src/interfaces/channels/outbound-reply-service.js";

function testTask(channel = "feishu") {
  return {
    id: "task_1",
    channel,
    threadId: "oc_1",
    replyTarget: { chatId: "oc_1", messageId: "om_1" }
  };
}

test("OutboundReplyService records sent replies", async () => {
  const events = [];
  const service = new OutboundReplyService({
    channels: new Map([
      [
        "feishu",
        {
          name: "feishu",
          async sendReply(task, message) {
            assert.equal(task.id, "task_1");
            assert.equal(message, "done");
            return { sent: true, transport: "message_reply", messageId: "om_reply" };
          }
        }
      ]
    ]),
    memory: { async recordEvent(event) { events.push(event); } },
    logger: { info() {} }
  });

  const result = await service.send(testTask(), "done", { source: "test" });

  assert.equal(result.status, "sent");
  assert.equal(result.transport, "message_reply");
  assert.equal(result.messageId, "om_reply");
  assert.equal(events[0].type, "outbound_reply");
  assert.equal(events[0].taskId, "task_1");
});

test("OutboundReplyService falls back to cli and records skipped replies", async () => {
  const events = [];
  const service = new OutboundReplyService({
    channels: new Map([
      [
        "cli",
        {
          name: "cli",
          async sendReply() {
            return { sent: false, reason: "disabled" };
          }
        }
      ]
    ]),
    memory: { async recordEvent(event) { events.push(event); } },
    logger: { info() {} }
  });

  const result = await service.send(testTask("missing"), "done", { source: "test" });

  assert.equal(result.status, "skipped");
  assert.equal(result.channel, "cli");
  assert.equal(result.reason, "disabled");
  assert.equal(events[0].status, "skipped");
});
