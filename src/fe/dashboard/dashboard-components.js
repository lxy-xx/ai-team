export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderDashboardBody() {
  return `<body>
  <header class="topbar">
    <div class="brand"><span class="mark">T</span><span>Team Engine</span></div>
    <div class="divider"></div>
    <nav class="nav" id="nav"></nav>
    <div class="top-spacer"></div>
    <div class="active-agents"><span class="active-dot"></span><span id="activeAgents">0 agents active</span></div>
    <div class="language-switch" id="languageSwitch" role="group" aria-label="Language">
      <button type="button" data-locale-option="zh">中文</button>
      <button type="button" data-locale-option="en">EN</button>
    </div>
  </header>
  <section class="subbar">
    <div class="view-title" id="viewTitle">All Work</div>
    <div class="item-count" id="itemCount">0 items</div>
    <div class="filters" id="filters"></div>
  </section>
  <main>
    <section class="tab active" data-tab="Overview"><div class="overview-layout"><div class="overview-main-stack"><div class="owner-attention-row"><div class="owner-attention" id="ownerAttention"></div></div><div class="board" id="board"></div></div><aside class="overview-employee-rail"><div class="working-agents-panel" id="workingAgentsPanel"></div><div class="context-requests" id="contextRequests"></div></aside></div></section>
    <section class="tab" data-tab="Team"><div class="panel-grid employee-config" id="agentConfig"></div></section>
    <section class="tab" data-tab="Evidence"><div class="detail-layout" id="intentDetail"></div></section>
    <section class="tab" data-tab="Intake"><div class="work-intake" id="workIntake"></div></section>
    <section class="tab" data-tab="Projects"><div class="projects-view" id="projects"></div></section>
    <section class="tab" data-tab="Settings"><div class="overview-readiness settings-readiness" id="settingsReadiness"></div><div class="panel-grid" id="settings"></div></section>
  </main>
  <div id="agentConfigModalRoot"></div>
  <div id="agentChatModalRoot"></div>
  <div id="runDetailModalRoot"></div>
  <div id="providerConfigModalRoot"></div>
  <div id="codingAgentLauncherModalRoot"></div>`;
}
