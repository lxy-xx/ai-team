import { CliChannel } from "./cli-channel.js";
import { FeishuChannel } from "./feishu/feishu-webhook-adapter.js";

export function createChannels({ config, logger, channelConfigStore, channelGateway }) {
  const cli = new CliChannel({ logger });
  const feishu = new FeishuChannel({ config, logger, channelConfigStore, channelGateway });
  return new Map([
    ["cli", cli],
    ["feishu", feishu]
  ]);
}
