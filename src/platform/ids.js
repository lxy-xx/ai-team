import crypto from "node:crypto";

export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`;
}

export function stableHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
