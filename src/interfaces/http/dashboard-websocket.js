import crypto from "node:crypto";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function acceptKey(key) {
  return crypto.createHash("sha1").update(`${key}${WEBSOCKET_GUID}`).digest("base64");
}

function frameText(payload) {
  const body = Buffer.from(String(payload), "utf8");
  if (body.length < 126) return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  if (body.length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

function frameClose() {
  return Buffer.from([0x88, 0x00]);
}

function framePong() {
  return Buffer.from([0x8a, 0x00]);
}

function stableDashboardHashInput(value) {
  if (Array.isArray(value)) return value.map(stableDashboardHashInput);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "generatedAt")
      .map(([key, child]) => [key, stableDashboardHashInput(child)])
  );
}

export function dashboardSnapshotHash(data) {
  return crypto.createHash("sha1").update(JSON.stringify(stableDashboardHashInput(data))).digest("hex");
}

export function createDashboardWebSocketHub({ buildSnapshot, logger = console, intervalMs = 1000 }) {
  const clients = new Set();

  const remove = (client) => {
    if (!clients.has(client)) return;
    clients.delete(client);
    clearInterval(client.timer);
  };

  const sendLatest = async (client) => {
    if (client.socket.destroyed) return remove(client);
    try {
      const data = await buildSnapshot(client.request);
      const hash = dashboardSnapshotHash(data);
      if (hash === client.lastHash) return;
      client.lastHash = hash;
      client.socket.write(frameText(JSON.stringify({ type: "dashboard:update", generatedAt: new Date().toISOString(), data })));
    } catch (error) {
      logger.warn?.({ error: error?.message || String(error) }, "dashboard websocket snapshot failed");
    }
  };

  const handleUpgrade = (request, socket) => {
    const key = request.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey(key)}`,
      "",
      ""
    ].join("\r\n"));
    socket.setNoDelay(true);
    const client = { request, socket, lastHash: undefined, timer: undefined };
    clients.add(client);
    const close = () => remove(client);
    socket.on("close", close);
    socket.on("end", close);
    socket.on("error", close);
    socket.on("data", (chunk) => {
      const opcode = chunk[0] & 0x0f;
      if (opcode === 0x8) {
        socket.write(frameClose());
        socket.end();
      } else if (opcode === 0x9) {
        socket.write(framePong());
      }
    });
    setImmediate(() => sendLatest(client));
    client.timer = setInterval(() => sendLatest(client), intervalMs);
  };

  return {
    clients,
    handleUpgrade
  };
}
