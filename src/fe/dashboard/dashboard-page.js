import { renderDashboardClientJs } from "./dashboard-client-js.js";
import { escapeHtml, renderDashboardBody } from "./dashboard-components.js";
import { DASHBOARD_I18N_STYLES } from "./dashboard-i18n.js";
import { DASHBOARD_PRODUCT_STYLES } from "./dashboard-product-styles.js";
import { DASHBOARD_STYLES } from "./dashboard-styles.js";
import { DASHBOARD_LOGIN_PATH, DASHBOARD_PATH } from "../../platform/http-paths.js";

export function renderDashboardPage(initialData) {
  const initialJson = JSON.stringify(initialData).replaceAll("<", "\\u003c");
  const baseStyles = DASHBOARD_STYLES.replaceAll("skill-install-row", "inline-install-row");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Team Dashboard</title>
  <style>
${baseStyles}
${DASHBOARD_I18N_STYLES}
${DASHBOARD_PRODUCT_STYLES}
  </style>
</head>
${renderDashboardBody()}
  <script>
${renderDashboardClientJs(initialJson)}
  </script>
</body>
</html>`;
}

export function renderDashboardLoginPage({ next = DASHBOARD_PATH, error = "", tokenMode = "configured" } = {}) {
  const description = tokenMode === "default"
    ? "Enter the admin token. If AI_TEAM_ADMIN_TOKEN is not set, use the default token: AI-team."
    : "Enter the admin token for this server.";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Team Dashboard Login</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8f8;
      --surface: #ffffff;
      --line: #d9dee3;
      --text: #161a1d;
      --muted: #667085;
      --accent: #0f766e;
      --danger: #b91c1c;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
    }
    main {
      width: min(420px, 100%);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      padding: 22px;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
    }
    h1 { margin: 0 0 8px; font-size: 20px; line-height: 1.25; }
    p { margin: 0 0 18px; color: var(--muted); font-size: 13px; line-height: 1.45; }
    form { display: grid; gap: 12px; }
    label { color: var(--muted); font-size: 12px; font-weight: 700; }
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 7px;
      padding: 10px 11px;
      font: inherit;
      color: var(--text);
      background: #fff;
    }
    button {
      border: 1px solid var(--accent);
      border-radius: 7px;
      padding: 10px 12px;
      color: #fff;
      background: var(--accent);
      font: inherit;
      cursor: pointer;
    }
    .error { color: var(--danger); }
  </style>
</head>
<body>
  <main>
    <h1>AI Team Dashboard Login</h1>
    <p>${escapeHtml(description)}</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
    <form method="post" action="${DASHBOARD_LOGIN_PATH}">
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <label for="token">Admin token</label>
      <input id="token" name="token" type="password" autocomplete="current-password" autofocus>
      <button type="submit">Continue</button>
    </form>
  </main>
</body>
</html>`;
}

export { escapeHtml };
