export class FeishuApiClient {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.cachedTenantToken = undefined;
  }

  async withTimeout(action) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await action(controller.signal);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`feishu request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async request(url, options) {
    return this.withTimeout((signal) => this.fetch(url, {
      ...options,
      signal
    }));
  }

  async requestJson(url, options) {
    return this.withTimeout(async (signal) => {
      const response = await this.fetch(url, {
        ...options,
        signal
      });
      return {
        response,
        data: await response.json()
      };
    });
  }

  async getTenantAccessToken(runtime) {
    const now = Date.now();
    if (this.cachedTenantToken && this.cachedTenantToken.expiresAt > now + 60_000) {
      return this.cachedTenantToken.token;
    }

    const { response, data } = await this.requestJson("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        app_id: runtime.appId,
        app_secret: runtime.appSecret
      })
    });
    if (!response.ok || data.code !== 0) {
      throw new Error(`failed to get feishu tenant token: ${JSON.stringify(data)}`);
    }
    this.cachedTenantToken = {
      token: data.tenant_access_token,
      expiresAt: now + (data.expire || 3600) * 1000
    };
    return this.cachedTenantToken.token;
  }

  async sendAppMessage(chatId, message, runtime) {
    const token = await this.getTenantAccessToken(runtime);
    const { response, data } = await this.requestJson("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text: message.slice(0, 20_000) })
      })
    });
    if (!response.ok || data.code !== 0) {
      throw new Error(`failed to send feishu message: ${JSON.stringify(data)}`);
    }
    return data;
  }

  async replyAppMessage(messageId, message, runtime) {
    const token = await this.getTenantAccessToken(runtime);
    const { response, data } = await this.requestJson(`https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        msg_type: "text",
        content: JSON.stringify({ text: message.slice(0, 20_000) })
      })
    });
    if (!response.ok || data.code !== 0) {
      throw new Error(`failed to reply feishu message: ${JSON.stringify(data)}`);
    }
    return data;
  }

  async addMessageReaction(messageId, reactionType = "OK", runtime) {
    const token = await this.getTenantAccessToken(runtime);
    const { response, data } = await this.requestJson(`https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reactions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        reaction_type: {
          emoji_type: reactionType || "OK"
        }
      })
    });
    if (!response.ok || data.code !== 0) {
      throw new Error(`failed to add feishu reaction: ${JSON.stringify(data)}`);
    }
    return data;
  }

  async sendIncomingWebhook(webhookUrl, message) {
    await this.request(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text: message }
      })
    });
  }
}
