import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import * as Lark from "@larksuiteoapi/node-sdk";
import { ensureDir, readJsonFile, writeJsonFile } from "../../platform/json-file.js";
import { FEISHU_WEBHOOK_PATH } from "../../platform/http-paths.js";

const DEFAULT_CHANNELS = {
  cli: {
    id: "cli",
    type: "cli",
    name: "CLI",
    internal: true,
    enabled: true,
    status: "ready",
    webhookPath: undefined,
    publicBaseUrl: undefined,
    callbackUrl: undefined,
    updatedAt: undefined,
    notes: "Local manual task entry."
  },
  feishu: {
    id: "feishu",
    type: "feishu",
    name: "Feishu",
    enabled: false,
    status: "needs_config",
    eventMode: "websocket",
    webhookPath: FEISHU_WEBHOOK_PATH,
    publicBaseUrl: undefined,
    callbackUrl: undefined,
    allowFrom: "",
    allowChat: "",
    groupOnly: false,
    groupReplyAll: false,
    threadIsolation: true,
    ackReactionType: "OK",
    progressStyle: "compact",
    enableFeishuCard: false,
    doneEmoji: "Done",
    updatedAt: undefined,
    notes: "Use one Feishu/Lark WebSocket adapter. setup/new/bind manages credentials."
  }
};

const PUBLIC_CREDENTIAL_FIELDS = [
  "appId",
  "appSecret"
];

const SECRET_FIELDS = [
  "verificationToken",
  "encryptKey",
  "appId",
  "appSecret",
  "outgoingWebhookUrl"
];

const ENV_MAP = {
  verificationToken: "FEISHU_VERIFICATION_TOKEN",
  encryptKey: "FEISHU_ENCRYPT_KEY",
  appId: "FEISHU_APP_ID",
  appSecret: "FEISHU_APP_SECRET",
  outgoingWebhookUrl: "FEISHU_OUTGOING_WEBHOOK_URL"
};

function normalizeBaseUrl(value) {
  if (!value) return undefined;
  return String(value).replace(/\/+$/, "");
}

function callbackUrl(publicBaseUrl, webhookPath) {
  const base = normalizeBaseUrl(publicBaseUrl);
  if (!base || !webhookPath) return undefined;
  return `${base}${webhookPath}`;
}

function globalIpv6Addresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter((item) => item.family === "IPv6" && !item.internal && item.scopeid === 0)
    .map((item) => item.address)
    .filter((address) => !address.startsWith("fe80:") && !address.startsWith("fd"));
}

function configuredSource(localSecrets, field) {
  if (localSecrets[field]) return "local";
  if (process.env[ENV_MAP[field]]) return "env";
  return undefined;
}

function publicCredentialState(localSecrets) {
  return Object.fromEntries(
    PUBLIC_CREDENTIAL_FIELDS.map((field) => {
      const source = configuredSource(localSecrets, field);
      return [
        field,
        {
          configured: Boolean(source),
          source
        }
      ];
    })
  );
}

function mergedSecret(localSecrets, field, fallback) {
  return localSecrets[field] || process.env[ENV_MAP[field]] || fallback;
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function stripChannelOwnedDisplayFields(channel = {}) {
  const { botName, ...rest } = channel;
  return rest;
}

function normalizeFeishuChannel(channel = {}) {
  const normalized = stripChannelOwnedDisplayFields(channel);
  return {
    ...normalized,
    webhookPath: FEISHU_WEBHOOK_PATH
  };
}

export class ChannelConfigStore {
  constructor({ dataDir, config }) {
    this.dir = path.join(dataDir, "channels");
    this.channelsFile = path.join(this.dir, "channels.json");
    this.secretsFile = path.join(this.dir, "channel-secrets.json");
    this.registrationSessionsFile = path.join(this.dir, "registration-sessions.json");
    this.config = config;
    this.activeRegistrations = new Map();
  }

  async init() {
    await ensureDir(this.dir);
    const channels = await readJsonFile(this.channelsFile, undefined);
    if (!channels) {
      await writeJsonFile(this.channelsFile, DEFAULT_CHANNELS);
    }
    const secrets = await readJsonFile(this.secretsFile, undefined);
    if (!secrets) {
      await this.writeSecrets({});
    }
    const registrationSessions = await readJsonFile(this.registrationSessionsFile, undefined);
    if (!registrationSessions) {
      await writeJsonFile(this.registrationSessionsFile, []);
    } else {
      const normalized = registrationSessions.map((session) => {
        if (["starting", "qr_ready", "polling", "slow_down", "domain_switched"].includes(session.status)) {
          return {
            ...session,
            status: "interrupted",
            updatedAt: new Date().toISOString(),
            error: "Registration polling stopped because the service restarted. Click Scan again."
          };
        }
        return session;
      });
      await writeJsonFile(this.registrationSessionsFile, normalized);
    }
  }

  async listRaw() {
    const channels = await readJsonFile(this.channelsFile, DEFAULT_CHANNELS);
    return {
      cli: { ...DEFAULT_CHANNELS.cli, ...(channels.cli || {}) },
      feishu: normalizeFeishuChannel({ ...DEFAULT_CHANNELS.feishu, ...(channels.feishu || {}) }),
      ...Object.fromEntries(
        Object.entries(channels)
          .filter(([id]) => !DEFAULT_CHANNELS[id])
          .map(([id, value]) => [id, value])
      )
    };
  }

  async listPublic() {
    const channels = await this.listRaw();
    const secrets = await readJsonFile(this.secretsFile, {});
    return Object.values(channels)
      .filter((channel) => !channel.internal)
      .map((channel) => this.toPublicChannel(channel, secrets[channel.id] || {}));
  }

  async getPublic(id) {
    const channels = await this.listRaw();
    const secrets = await readJsonFile(this.secretsFile, {});
    return this.toPublicChannel(channels[id] || DEFAULT_CHANNELS[id], secrets[id] || {});
  }

  toPublicChannel(channel, localSecrets) {
    const publicChannel = channel.id === "feishu" ? stripChannelOwnedDisplayFields(channel) : channel;
    const eventMode = publicChannel.id === "feishu" ? (publicChannel.eventMode || "websocket") : publicChannel.eventMode;
    const publicBaseUrl =
      publicChannel.id === "feishu" && eventMode === "websocket"
        ? undefined
        : normalizeBaseUrl(publicChannel.publicBaseUrl || this.config.publicBaseUrl);
    return {
      ...publicChannel,
      eventMode,
      publicBaseUrl,
      callbackUrl: callbackUrl(publicBaseUrl, publicChannel.webhookPath),
      credentials: publicChannel.id === "feishu" ? publicCredentialState(localSecrets) : {},
      secretsWritable: true
    };
  }

  async configureFeishu(input = {}) {
    const channels = await this.listRaw();
    const existing = channels.feishu || DEFAULT_CHANNELS.feishu;
    const eventMode = input.eventMode || existing.eventMode || "websocket";
    const publicBaseUrl =
      eventMode === "webhook"
        ? normalizeBaseUrl(input.publicBaseUrl ?? existing.publicBaseUrl ?? this.config.publicBaseUrl)
        : existing.publicBaseUrl;
    const updated = {
      ...existing,
      enabled: input.enabled ?? existing.enabled ?? true,
      status: input.enabled === false ? "disabled" : "configured",
      eventMode,
      allowFrom: input.allowFrom ?? existing.allowFrom ?? "",
      allowChat: input.allowChat ?? existing.allowChat ?? "",
      groupOnly: input.groupOnly ?? existing.groupOnly ?? false,
      groupReplyAll: input.groupReplyAll ?? existing.groupReplyAll ?? false,
      threadIsolation: input.threadIsolation ?? existing.threadIsolation ?? true,
      ackReactionType: input.ackReactionType || existing.ackReactionType || "OK",
      progressStyle: input.progressStyle || existing.progressStyle || "compact",
      enableFeishuCard: input.enableFeishuCard ?? existing.enableFeishuCard ?? false,
      doneEmoji: input.doneEmoji ?? existing.doneEmoji ?? "Done",
      notes: DEFAULT_CHANNELS.feishu.notes,
      webhookPath: FEISHU_WEBHOOK_PATH,
      publicBaseUrl,
      callbackUrl: eventMode === "webhook" ? callbackUrl(publicBaseUrl, FEISHU_WEBHOOK_PATH) : existing.callbackUrl,
      updatedAt: new Date().toISOString()
    };
    channels.feishu = updated;
    await writeJsonFile(this.channelsFile, channels);

    const nextSecrets = stripUndefined({
      verificationToken: input.verificationToken,
      encryptKey: input.encryptKey,
      appId: input.appId,
      appSecret: input.appSecret,
      outgoingWebhookUrl: input.outgoingWebhookUrl
    });
    if (Object.keys(nextSecrets).length > 0) {
      const secrets = await readJsonFile(this.secretsFile, {});
      secrets.feishu = {
        ...(secrets.feishu || {}),
        ...nextSecrets,
        updatedAt: new Date().toISOString()
      };
      await this.writeSecrets(secrets);
    }

    return this.getPublic("feishu");
  }

  async bindFeishuApp({ appId, appSecret, ...options }) {
    if (!appId || !appSecret) {
      const error = new Error("appId and appSecret are required for Feishu bind");
      error.status = 400;
      throw error;
    }
    return this.configureFeishu({
      ...options,
      enabled: options.enabled ?? true,
      eventMode: "websocket",
      appId,
      appSecret
    });
  }

  async writeSecrets(secrets) {
    await writeJsonFile(this.secretsFile, secrets);
    try {
      await fs.chmod(this.secretsFile, 0o600);
    } catch {
      // Best effort on filesystems that support chmod.
    }
  }

  async getFeishuRuntime(fallback = {}) {
    const channels = await this.listRaw();
    const allSecrets = await readJsonFile(this.secretsFile, {});
    const channel = channels.feishu || DEFAULT_CHANNELS.feishu;
    const runtimeFallback = stripChannelOwnedDisplayFields(fallback);
    const localSecrets = allSecrets.feishu || {};
    const eventMode = channel.eventMode || fallback.eventMode || "websocket";
    const publicBaseUrl =
      eventMode === "webhook"
        ? normalizeBaseUrl(channel.publicBaseUrl || fallback.publicBaseUrl || this.config.publicBaseUrl)
        : undefined;
    return {
      ...runtimeFallback,
      ...channel,
      eventMode,
      publicBaseUrl,
      callbackUrl: callbackUrl(publicBaseUrl, channel.webhookPath),
      verificationToken: mergedSecret(localSecrets, "verificationToken", fallback.verificationToken),
      encryptKey: mergedSecret(localSecrets, "encryptKey", fallback.encryptKey),
      appId: mergedSecret(localSecrets, "appId", fallback.appId),
      appSecret: mergedSecret(localSecrets, "appSecret", fallback.appSecret),
      outgoingWebhookUrl: mergedSecret(localSecrets, "outgoingWebhookUrl", fallback.outgoingWebhookUrl)
    };
  }

  async scanFeishu() {
    const channels = await this.listRaw();
    const existing = channels.feishu || DEFAULT_CHANNELS.feishu;
    const eventMode = existing.eventMode || "websocket";
    const publicBaseUrl = eventMode === "webhook" ? normalizeBaseUrl(existing.publicBaseUrl || this.config.publicBaseUrl) : undefined;
    const candidates = [];
    if (eventMode === "webhook" && publicBaseUrl) {
      candidates.push(callbackUrl(publicBaseUrl, DEFAULT_CHANNELS.feishu.webhookPath));
    }
    if (eventMode === "webhook") {
      for (const address of globalIpv6Addresses()) {
        candidates.push(`http://[${address}]:${this.config.port}${DEFAULT_CHANNELS.feishu.webhookPath}`);
      }
    }

    const runtime = await this.getFeishuRuntime(this.config.feishu);
    const status =
      runtime.verificationToken || runtime.encryptKey || runtime.appId || runtime.outgoingWebhookUrl
        ? "configured"
        : "needs_config";

    channels.feishu = {
      ...existing,
      status,
      notes: DEFAULT_CHANNELS.feishu.notes,
      lastScanAt: new Date().toISOString()
    };
    if (eventMode === "webhook") {
      channels.feishu.publicBaseUrl = publicBaseUrl || existing.publicBaseUrl;
      channels.feishu.callbackUrl = callbackUrl(publicBaseUrl || existing.publicBaseUrl, DEFAULT_CHANNELS.feishu.webhookPath);
    }
    await writeJsonFile(this.channelsFile, channels);

    const websocketGuide = {
      mode: "websocket",
      requiresPublicUrl: false,
      initialization: "registerApp QR device authorization",
      eventSubscriptionMethod: "Long Connection / 长连接",
      events: ["im.message.receive_v1"],
      callbacks: ["card.action.trigger when interactive cards are enabled"],
      ccConnectPattern: "setup/new/bind writes app_id/app_secret; runtime owns a single WebSocket adapter."
    };

    return {
      channel: await this.getPublic("feishu"),
      candidates: [...new Set(candidates)].filter(Boolean),
      websocketGuide,
      env: Object.fromEntries(
        Object.entries(ENV_MAP).map(([field, envName]) => [field, { envName, configured: Boolean(process.env[envName]) }])
      ),
      checklist: [
        "Use setup/new to create a Feishu/Lark registerApp authorization session.",
        "Use bind when you already have app_id/app_secret.",
        "Scan the QR code with Feishu/Lark and approve the app initialization.",
        "The app_id and app_secret are stored locally after authorization succeeds.",
        "The channel switches to websocket mode and connects with Long Connection / 长连接.",
        "All im.message.receive_v1 events are routed only to the CEO/CTO agent."
      ]
    };
  }

  async listRegistrationSessions() {
    return readJsonFile(this.registrationSessionsFile, []);
  }

  async writeRegistrationSession(session) {
    const sessions = await this.listRegistrationSessions();
    const index = sessions.findIndex((item) => item.id === session.id);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    await writeJsonFile(this.registrationSessionsFile, sessions.slice(-30));
    return session;
  }

  async getRegistrationSession(id) {
    const sessions = await this.listRegistrationSessions();
    return sessions.find((session) => session.id === id);
  }

  async startFeishuRegistration() {
    const id = `reg_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
    const controller = new AbortController();
    const now = new Date().toISOString();
    const baseSession = {
      id,
      channel: "feishu",
      status: "starting",
      eventMode: "websocket",
      createdAt: now,
      updatedAt: now
    };
    await this.writeRegistrationSession(baseSession);

    const qrReady = new Promise((resolve, reject) => {
      let settledQr = false;
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for Feishu QR code")), 15_000);
      const registration = Lark.registerApp({
        source: "ai-team-agent",
        signal: controller.signal,
        onQRCodeReady: async (info) => {
          clearTimeout(timeout);
          const qrSvg = await QRCode.toString(info.url, {
            type: "svg",
            margin: 1,
            width: 200
          });
          const session = {
            ...baseSession,
            status: "qr_ready",
            qrUrl: info.url,
            qrSvg,
            expireIn: info.expireIn,
            expiresAt: new Date(Date.now() + (info.expireIn || 600) * 1000).toISOString(),
            updatedAt: new Date().toISOString()
          };
          await this.writeRegistrationSession(session);
          settledQr = true;
          resolve(session);
        },
        onStatusChange: async (info) => {
          const current = (await this.getRegistrationSession(id)) || baseSession;
          await this.writeRegistrationSession({
            ...current,
            status: info.status || current.status,
            pollInterval: info.interval,
            updatedAt: new Date().toISOString()
          });
        }
      });

      registration
        .then(async (result) => {
          const configured = await this.configureFeishu({
            enabled: true,
            eventMode: "websocket",
            appId: result.client_id,
            appSecret: result.client_secret
          });
          const current = (await this.getRegistrationSession(id)) || baseSession;
          await this.writeRegistrationSession({
            ...current,
            status: "completed",
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            appId: result.client_id,
            userInfo: result.user_info,
            configuredChannel: configured
          });
        })
        .catch(async (error) => {
          clearTimeout(timeout);
          const current = (await this.getRegistrationSession(id)) || baseSession;
          await this.writeRegistrationSession({
            ...current,
            status: "failed",
            error: error.description || error.message || String(error),
            errorCode: error.code,
            updatedAt: new Date().toISOString()
          });
          if (!settledQr) reject(error);
        });

      this.activeRegistrations.set(id, { controller, registration });
    });

    return qrReady;
  }

  async getFeishuRegistrationStatus(id) {
    const session = await this.getRegistrationSession(id);
    if (!session) {
      const error = new Error("registration session not found");
      error.status = 404;
      throw error;
    }
    return {
      session,
      channel: await this.getPublic("feishu")
    };
  }

  async testFeishu() {
    const runtime = await this.getFeishuRuntime(this.config.feishu);
    const checks = [];
    if (runtime.eventMode === "webhook") {
      checks.push(
        {
          name: "callbackUrl",
          ok: Boolean(runtime.callbackUrl),
          message: runtime.callbackUrl || "Set AI_TEAM_PUBLIC_BASE_URL or configure publicBaseUrl."
        },
        {
          name: "verificationToken",
          ok: Boolean(runtime.verificationToken),
          message: runtime.verificationToken ? "configured" : "missing"
        },
        {
          name: "replyCredentials",
          ok: Boolean((runtime.appId && runtime.appSecret) || runtime.outgoingWebhookUrl),
          message:
            runtime.appId && runtime.appSecret
              ? "app reply configured"
              : runtime.outgoingWebhookUrl
                ? "incoming webhook fallback configured"
                : "missing reply credentials"
        }
      );
    } else {
      checks.push({
        name: "replyCredentials",
        ok: Boolean(runtime.appId && runtime.appSecret),
        message: runtime.appId && runtime.appSecret ? "app reply configured" : "missing app credentials"
      });
    }

    if (runtime.appId && runtime.appSecret) {
      try {
        const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            app_id: runtime.appId,
            app_secret: runtime.appSecret
          })
        });
        const data = await response.json();
        checks.push({
          name: "tenantAccessToken",
          ok: response.ok && data.code === 0,
          message: response.ok && data.code === 0 ? "ok" : JSON.stringify(data)
        });
      } catch (error) {
        checks.push({ name: "tenantAccessToken", ok: false, message: error.message });
      }
    }

    return {
      channel: await this.getPublic("feishu"),
      ok: checks.every((check) => check.ok),
      checks
    };
  }
}
