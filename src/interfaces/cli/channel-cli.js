import QRCode from "qrcode";

function parseArgs(args) {
  const parsed = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (!item.startsWith("--")) {
      parsed._.push(item);
      continue;
    }
    const key = item.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printChannel(channel) {
  console.log(`${channel.name} (${channel.id})`);
  console.log(`  enabled: ${channel.enabled}`);
  console.log(`  status: ${channel.status}`);
  if (channel.eventMode) console.log(`  eventMode: ${channel.eventMode}`);
  console.log(`  callback: ${channel.eventMode === "websocket" ? "not required" : channel.callbackUrl || "not configured"}`);
  if (channel.credentials) {
    for (const [name, state] of Object.entries(channel.credentials)) {
      console.log(`  ${name}: ${state.configured ? `set (${state.source})` : "missing"}`);
    }
  }
}

function usage() {
  console.log(`Usage:
  node src/index.js channels
  node src/index.js channels setup feishu [--app cli_xxx:secret]
  node src/index.js channels new feishu
  node src/index.js channels bind feishu --app cli_xxx:secret
  node src/index.js channels test feishu

	Notes:
	  - setup follows cc-connect: without credentials it creates a QR registration; with --app it binds.
	  - bind writes app_id/app_secret and starts the single Feishu websocket adapter on server boot.
	  - dashboard writes require AI_TEAM_ADMIN_TOKEN remotely, but CLI writes directly.`);
}

function appCredentials(options) {
  if (options.app) {
    const [appId, ...secretParts] = String(options.app).split(":");
    return { appId, appSecret: secretParts.join(":") };
  }
  return { appId: options.appId, appSecret: options.appSecret };
}

export async function runChannelCli(system, args) {
  const [subcommand, channelId, ...rest] = args;
  const options = parseArgs(rest);

  if (!subcommand || subcommand === "list") {
    const channels = await system.channelConfigStore.listPublic();
    for (const channel of channels) {
      printChannel(channel);
    }
    return;
  }

  if (subcommand === "scan") {
    const scan = await system.channelConfigStore.scanFeishu();
    printJson(scan);
    return;
  }

  if ((subcommand === "setup" || subcommand === "bind" || subcommand === "init") && channelId === "feishu") {
    const creds = appCredentials(options);
    if (subcommand === "setup" && (!creds.appId || !creds.appSecret)) {
      const scan = await system.channelConfigStore.scanFeishu();
      const registration = await system.channelConfigStore.startFeishuRegistration();
      console.log("Feishu/Lark setup created a registerApp QR session.");
      console.log(`URL: ${registration.qrUrl}`);
      console.log("");
      console.log(await QRCode.toString(registration.qrUrl, { type: "terminal" }));
      console.log(`registrationId: ${registration.id}`);
      console.log(`expiresAt: ${registration.expiresAt}`);
      console.log("");
      console.log("Polling continues in this process while it is alive. You can also use the dashboard Scan button.");
      printJson({ registration, guide: scan.websocketGuide });
      return;
    }

    if (subcommand === "bind" && (!creds.appId || !creds.appSecret)) {
      throw new Error("bind requires --app cli_xxx:secret or --app-id/--app-secret");
    }

    const channel = await system.channelConfigStore.bindFeishuApp({
      enabled: Boolean(options.enable ?? true),
      publicBaseUrl: options.baseUrl || options.publicBaseUrl,
      appId: creds.appId,
      appSecret: creds.appSecret,
      verificationToken: options.verificationToken,
      encryptKey: options.encryptKey,
      outgoingWebhookUrl: options.outgoingWebhookUrl,
      allowFrom: options.allowFrom,
      allowChat: options.allowChat,
      groupOnly: options.groupOnly === true,
      groupReplyAll: options.groupReplyAll === true,
      threadIsolation: options.threadIsolation === false ? false : undefined,
      progressStyle: options.progressStyle,
      doneEmoji: options.doneEmoji,
      enableFeishuCard: options.enableFeishuCard === true
    });
    printChannel(channel);
    console.log("");
    console.log("Feishu runtime:");
    console.log("  method: Long Connection / 长连接");
    console.log("  public callback URL: not required");
    console.log("  one websocket adapter is enough for ingress.");
    console.log("Subscribe to event in Feishu:");
    console.log("  im.message.receive_v1");
    if (channel.enableFeishuCard) console.log("  card.action.trigger");
    return;
  }

  if (subcommand === "new" && channelId === "feishu") {
    const scan = await system.channelConfigStore.scanFeishu();
    const registration = await system.channelConfigStore.startFeishuRegistration();
    printJson({ registration, guide: scan.websocketGuide });
    return;
  }

  if (subcommand === "test" && channelId === "feishu") {
    printJson(await system.channelConfigStore.testFeishu());
    return;
  }

  usage();
  throw new Error(`Unknown channels command: ${args.join(" ")}`);
}
