import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChannelConfigStore } from "../src/interfaces/channels/channel-config-store.js";

function testConfig(dataDir) {
  return {
    dataDir,
    port: 8787,
    publicBaseUrl: "https://agent.example.com",
    feishu: {}
  };
}

function testConfigWithoutPublicBaseUrl(dataDir) {
  return {
    dataDir,
    port: 8787,
    publicBaseUrl: undefined,
    feishu: {}
  };
}

async function writeLegacyFeishuChannel(dataDir) {
  const legacyPublicBaseUrl = "http://[2001:db8::8]:8787";
  await fs.writeFile(
    path.join(dataDir, "channels", "channels.json"),
    JSON.stringify(
      {
        feishu: {
          id: "feishu",
          type: "feishu",
          name: "Feishu",
          enabled: true,
          status: "configured",
          eventMode: "websocket",
          webhookPath: "/webhooks/feishu",
          publicBaseUrl: legacyPublicBaseUrl,
          callbackUrl: `${legacyPublicBaseUrl}/webhooks/feishu`
        }
      },
      null,
      2
    )
  );
}

async function withSuccessfulTenantAccessToken(run) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      async json() {
        return { code: 0, tenant_access_token: "tenant-token" };
      }
    };
  };
  try {
    return await run(calls);
  } finally {
    global.fetch = originalFetch;
  }
}

test("ChannelConfigStore configures Feishu without exposing secret values publicly", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-test-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfig(dataDir) });
  await store.init();

  const channel = await store.configureFeishu({
    enabled: true,
    verificationToken: "secret-token",
    appId: "cli_test",
    appSecret: "secret-value"
  });

  assert.equal(channel.enabled, true);
  assert.equal(channel.eventMode, "websocket");
  assert.equal(channel.publicBaseUrl, undefined);
  assert.equal(channel.callbackUrl, undefined);
  assert.equal("botName" in channel, false);
  assert.equal(channel.credentials.appId.configured, true);
  assert.equal(channel.credentials.appId.source, "local");
  assert.equal(JSON.stringify(channel).includes("secret-token"), false);

  const runtime = await store.getFeishuRuntime({});
  assert.equal(runtime.publicBaseUrl, undefined);
  assert.equal(runtime.callbackUrl, undefined);
  assert.equal("botName" in runtime, false);
  assert.equal(runtime.verificationToken, "secret-token");
  assert.equal(runtime.appSecret, "secret-value");
});

test("ChannelConfigStore public list excludes internal CLI while raw list keeps it", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-public-test-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfig(dataDir) });
  await store.init();

  const publicChannels = await store.listPublic();
  const rawChannels = await store.listRaw();

  assert.deepEqual(
    publicChannels.map((channel) => channel.id),
    ["feishu"]
  );
  assert.equal(rawChannels.cli.id, "cli");
  assert.equal(rawChannels.feishu.id, "feishu");
});

test("ChannelConfigStore strips legacy Feishu botName from channel projections", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-bot-name-test-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfig(dataDir) });
  await store.init();
  await fs.writeFile(
    path.join(dataDir, "channels", "channels.json"),
    JSON.stringify(
      {
        feishu: {
          id: "feishu",
          type: "feishu",
          name: "Feishu",
          enabled: true,
          status: "configured",
          eventMode: "websocket",
          webhookPath: "/webhooks/feishu",
          botName: "Legacy Bot"
        }
      },
      null,
      2
    )
  );

  const publicChannel = await store.getPublic("feishu");
  const rawChannels = await store.listRaw();
  const runtime = await store.getFeishuRuntime({ botName: "Fallback CEO" });
  const saved = await store.configureFeishu({ enabled: true, botName: "Ignored CEO" });
  const rawAfterSave = await store.listRaw();

  assert.equal("botName" in publicChannel, false);
  assert.equal("botName" in rawChannels.feishu, false);
  assert.equal(rawChannels.feishu.webhookPath, "/ai-team/api/webhooks/feishu");
  assert.equal("botName" in runtime, false);
  assert.equal("botName" in saved, false);
  assert.equal("botName" in rawAfterSave.feishu, false);
});

test("ChannelConfigStore scan returns Feishu setup checklist", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-scan-test-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfig(dataDir) });
  await store.init();

  const scan = await store.scanFeishu();
  assert.deepEqual(scan.candidates, []);
  assert.ok(scan.checklist.some((item) => item.includes("im.message.receive_v1")));
  assert.equal(scan.checklist.some((item) => item.includes("feishu-cli")), false);
  assert.equal(scan.websocketGuide.requiresPublicUrl, false);
});

test("ChannelConfigStore binds Feishu as a single websocket adapter", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-bind-test-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfig(dataDir) });
  await store.init();

  const channel = await store.bindFeishuApp({
    appId: "cli_test",
    appSecret: "secret-value",
    allowChat: "oc_1",
    threadIsolation: true,
    progressStyle: "compact"
  });

  assert.equal(channel.enabled, true);
  assert.equal(channel.eventMode, "websocket");
  assert.equal(channel.allowChat, "oc_1");
  assert.equal(channel.threadIsolation, true);
  assert.equal(channel.credentials.appSecret.configured, true);
  assert.equal("feishuCliBin" in channel.credentials, false);

  const runtime = await store.getFeishuRuntime({});
  assert.equal(runtime.appSecret, "secret-value");
  assert.equal("feishuCliBin" in runtime, false);
});

test("ChannelConfigStore websocket public Feishu channel ignores legacy public callback fields", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-ws-public-test-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfig(dataDir) });
  await store.init();
  await writeLegacyFeishuChannel(dataDir);

  const channel = await store.getPublic("feishu");

  assert.equal(channel.eventMode, "websocket");
  assert.equal(channel.publicBaseUrl, undefined);
  assert.equal(channel.callbackUrl, undefined);
  assert.equal(channel.webhookPath, "/ai-team/api/webhooks/feishu");
});

test("ChannelConfigStore websocket Feishu runtime ignores legacy and config public callback fields", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-ws-runtime-test-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfig(dataDir) });
  await store.init();
  await writeLegacyFeishuChannel(dataDir);

  const runtime = await store.getFeishuRuntime({});

  assert.equal(runtime.eventMode, "websocket");
  assert.equal(runtime.publicBaseUrl, undefined);
  assert.equal(runtime.callbackUrl, undefined);
});

test("ChannelConfigStore testFeishu websocket does not check callbackUrl", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-ws-test-checks-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfigWithoutPublicBaseUrl(dataDir) });
  await store.init();
  await store.configureFeishu({
    enabled: true,
    eventMode: "websocket",
    appId: "cli_test",
    appSecret: "secret-value"
  });

  await withSuccessfulTenantAccessToken(async () => {
    const result = await store.testFeishu();
    const checkNames = result.checks.map((check) => check.name);

    assert.equal(checkNames.includes("callbackUrl"), false);
  });
});

test("ChannelConfigStore testFeishu websocket can pass with app credentials only", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-ws-test-ok-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfigWithoutPublicBaseUrl(dataDir) });
  await store.init();
  await store.configureFeishu({
    enabled: true,
    eventMode: "websocket",
    appId: "cli_test",
    appSecret: "secret-value"
  });

  await withSuccessfulTenantAccessToken(async (calls) => {
    const result = await store.testFeishu();

    assert.equal(calls.length, 1);
    assert.equal(result.ok, true);
  });
});

test("ChannelConfigStore testFeishu webhook mode still exposes and checks callbackUrl", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-webhook-test-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfig(dataDir) });
  await store.init();
  const channel = await store.configureFeishu({
    enabled: true,
    eventMode: "webhook",
    publicBaseUrl: "https://hooks.example.com",
    verificationToken: "secret-token",
    appId: "cli_test",
    appSecret: "secret-value"
  });

  assert.equal(channel.publicBaseUrl, "https://hooks.example.com");
  assert.equal(channel.callbackUrl, "https://hooks.example.com/ai-team/api/webhooks/feishu");

  await withSuccessfulTenantAccessToken(async () => {
    const result = await store.testFeishu();
    const callbackCheck = result.checks.find((check) => check.name === "callbackUrl");

    assert.equal(result.channel.callbackUrl, "https://hooks.example.com/ai-team/api/webhooks/feishu");
    assert.equal(callbackCheck?.ok, true);
  });
});

test("ChannelConfigStore scanFeishu websocket omits callback candidates by default", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-scan-ws-candidates-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfig(dataDir) });
  await store.init();

  const scan = await store.scanFeishu();

  assert.deepEqual(scan.candidates, []);
});

test("ChannelConfigStore scanFeishu websocket does not write public callback fields", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-team-channel-scan-ws-public-"));
  const store = new ChannelConfigStore({ dataDir, config: testConfig(dataDir) });
  await store.init();

  const scan = await store.scanFeishu();
  const channel = await store.getPublic("feishu");

  assert.equal(scan.channel.publicBaseUrl, undefined);
  assert.equal(scan.channel.callbackUrl, undefined);
  assert.equal(channel.publicBaseUrl, undefined);
  assert.equal(channel.callbackUrl, undefined);
});
