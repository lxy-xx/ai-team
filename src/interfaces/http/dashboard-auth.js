export const DEFAULT_DASHBOARD_ADMIN_TOKEN = "AI-team";

export function configuredDashboardAdminToken(config = {}) {
  return typeof config.adminToken === "string" && config.adminToken.trim()
    ? config.adminToken.trim()
    : undefined;
}

export function effectiveDashboardAdminToken(config = {}) {
  return configuredDashboardAdminToken(config) || DEFAULT_DASHBOARD_ADMIN_TOKEN;
}

export function dashboardAdminTokenMode(config = {}) {
  return configuredDashboardAdminToken(config) ? "configured" : "default";
}
