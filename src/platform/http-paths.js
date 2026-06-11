export const HTTP_BASE_PATH = "/ai-team";
export const API_BASE_PATH = `${HTTP_BASE_PATH}/api`;
export const CONSOLE_BASE_PATH = `${HTTP_BASE_PATH}/console`;

export const DASHBOARD_PATH = `${CONSOLE_BASE_PATH}/dashboard`;
export const DASHBOARD_LOGIN_PATH = `${DASHBOARD_PATH}/login`;
export const ARCHITECTURE_PATH = `${CONSOLE_BASE_PATH}/architecture`;
export const FEISHU_WEBHOOK_PATH = `${API_BASE_PATH}/webhooks/feishu`;

function normalizeResourcePath(path = "/") {
  const value = String(path || "/").trim();
  return value.startsWith("/") ? value : `/${value}`;
}

function joinBase(base, path = "/") {
  const resourcePath = normalizeResourcePath(path);
  return resourcePath === "/" ? base : `${base}${resourcePath}`;
}

function stripBase(pathname = "", base = "") {
  const path = String(pathname || "");
  if (path === base) return "/";
  if (path.startsWith(`${base}/`)) return path.slice(base.length);
  return undefined;
}

export function apiPath(path = "/") {
  const resourcePath = normalizeResourcePath(path).replace(/^\/api(?=\/|$)/, "") || "/";
  return joinBase(API_BASE_PATH, resourcePath);
}

export function consolePath(path = "/dashboard") {
  return joinBase(CONSOLE_BASE_PATH, path);
}

export function apiResourcePath(pathname = "") {
  return stripBase(pathname, API_BASE_PATH);
}

export function consoleResourcePath(pathname = "") {
  return stripBase(pathname, CONSOLE_BASE_PATH);
}
