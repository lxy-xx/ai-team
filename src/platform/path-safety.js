import fs from "node:fs/promises";
import path from "node:path";

export function isPathInside(base, target) {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${path.sep}`);
}

export function resolvePathInside(baseDir, targetPath = ".") {
  return path.resolve(path.resolve(baseDir), targetPath || ".");
}

export function assertPathInside(baseDir, targetPath = ".", { message } = {}) {
  const resolvedTarget = resolvePathInside(baseDir, targetPath);
  if (!isPathInside(baseDir, resolvedTarget)) {
    throw new Error(message || `path escapes base directory: ${targetPath}`);
  }
  return resolvedTarget;
}

export async function resolveExistingPathInside(baseDir, targetPath = ".", { message } = {}) {
  const file = assertPathInside(baseDir, targetPath, { message });
  const baseReal = await fs.realpath(baseDir);
  const targetReal = await fs.realpath(file);
  if (!isPathInside(baseReal, targetReal)) {
    throw new Error(message || `path escapes base directory through symlink: ${targetPath}`);
  }
  const stat = await fs.stat(file);
  return { file, stat };
}

export async function resolveWritablePathInside(baseDir, targetPath = ".", { message } = {}) {
  const file = assertPathInside(baseDir, targetPath, { message });
  const baseReal = await fs.realpath(baseDir);
  const parent = path.dirname(file);
  await fs.mkdir(parent, { recursive: true });
  const parentReal = await fs.realpath(parent);
  if (!isPathInside(baseReal, parentReal)) {
    throw new Error(message || `path escapes base directory through symlink: ${targetPath}`);
  }
  try {
    const linkStat = await fs.lstat(file);
    if (linkStat.isSymbolicLink()) {
      const targetReal = await fs.realpath(file);
      if (!isPathInside(baseReal, targetReal)) {
        throw new Error(message || `path escapes base directory through symlink: ${targetPath}`);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return file;
}

export function safePathSegment(value, label = "path segment") {
  const segment = String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!segment || segment === "." || segment === "..") throw new Error(`invalid ${label}: ${value}`);
  return segment;
}
