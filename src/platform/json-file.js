import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJsonFile(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJsonFile(file, data) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

export async function appendJsonLine(file, data) {
  await ensureDir(path.dirname(file));
  await fs.appendFile(file, `${JSON.stringify(data)}\n`, "utf8");
}
