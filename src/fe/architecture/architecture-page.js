import { ARCHITECTURE_STYLES } from "./architecture-styles.js";
import { ARCHITECTURE_PATH, DASHBOARD_PATH } from "../../platform/http-paths.js";

export function renderArchitecturePage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Team Architecture</title>
  <style>
${ARCHITECTURE_STYLES}
  </style>
</head>
<body>
  <header class="topbar">
    <span class="mark">T</span>
    <span class="brand">AI Team</span>
    <nav>
      <a class="nav-link" href="${DASHBOARD_PATH}">Work Board</a>
      <a class="nav-link active" href="${ARCHITECTURE_PATH}">Architecture</a>
    </nav>
  </header>
  <main>
    <p class="eyebrow">System Architecture</p>
    <h1>TeamEngine-centered AI-only team</h1>
    <p class="subtitle">All channels enter through one gateway, preserve reply targets, and deliver messages to the CEO role for the intent decision. TeamEngine owns lifecycle, routing, dependencies, sessions, traces, and read models. The product manager role consumes approved intents and produces the product spec plus task graph; every worker turn is prepared by AgentRuntime, and runtime context is model-compressed once the prompt reaches 80% of the configured context window.</p>

    <h2 class="section-title">Current Component Architecture</h2>
    <div class="diagram-wrap">
      <svg viewBox="0 0 1120 760" role="img" aria-labelledby="arch-title arch-desc">
        <title id="arch-title">Current AI Team Agent architecture</title>
        <desc id="arch-desc">External channels route into a gateway, TeamEngine, worker roles, provider, tools, engine store, file bus, read models, and outbound replies.</desc>
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#667085"/></marker>
          <marker id="arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#0f766e"/></marker>
          <marker id="arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#2563eb"/></marker>
          <style>
            .label { font: 600 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Arial, sans-serif; fill: #161a1d; }
            .sub { font: 400 9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; fill: #667085; }
            .tag { font: 600 8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; fill: #667085; letter-spacing: .12em; }
            .arrow-text { font: 500 8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; fill: #667085; letter-spacing: .08em; }
            .note { font: italic 13px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; fill: #667085; }
          </style>
        </defs>
        <rect width="1120" height="760" fill="#ffffff"/>

        <rect x="32" y="76" width="180" height="356" rx="8" fill="rgba(102,112,133,0.05)" stroke="rgba(102,112,133,0.32)" stroke-width="1" stroke-dasharray="5,4"/>
        <rect x="64" y="68" width="116" height="20" rx="3" fill="#ffffff"/>
        <text x="122" y="82" text-anchor="middle" class="tag">CHANNELS</text>

        <rect x="260" y="76" width="408" height="356" rx="8" fill="rgba(15,118,110,0.04)" stroke="rgba(15,118,110,0.40)" stroke-width="1" stroke-dasharray="5,4"/>
        <rect x="392" y="68" width="144" height="20" rx="3" fill="#ffffff"/>
        <text x="464" y="82" text-anchor="middle" class="tag">CONTROL PLANE</text>

        <rect x="712" y="76" width="376" height="356" rx="8" fill="rgba(37,99,235,0.04)" stroke="rgba(37,99,235,0.34)" stroke-width="1" stroke-dasharray="5,4"/>
        <rect x="832" y="68" width="136" height="20" rx="3" fill="#ffffff"/>
        <text x="900" y="82" text-anchor="middle" class="tag">EXECUTION PLANE</text>

        <rect x="260" y="488" width="828" height="148" rx="8" fill="rgba(16,24,40,0.035)" stroke="rgba(102,112,133,0.34)" stroke-width="1" stroke-dasharray="5,4"/>
        <rect x="616" y="480" width="124" height="20" rx="3" fill="#ffffff"/>
        <text x="678" y="494" text-anchor="middle" class="tag">DURABLE STATE</text>

        <path d="M184 136 L284 136" stroke="#2563eb" stroke-width="1.2" fill="none" marker-end="url(#arrow-link)"/>
        <path d="M184 224 L284 224" stroke="#2563eb" stroke-width="1.2" fill="none" marker-end="url(#arrow-link)"/>
        <path d="M184 344 L284 344" stroke="#2563eb" stroke-width="1.2" fill="none" marker-end="url(#arrow-link)"/>
        <path d="M444 224 L500 224" stroke="#0f766e" stroke-width="1.4" fill="none" marker-end="url(#arrow-accent)"/>
        <path d="M620 224 L744 224" stroke="#0f766e" stroke-width="1.4" fill="none" marker-end="url(#arrow-accent)"/>
        <path d="M848 224 L920 224" stroke="#667085" stroke-width="1.2" fill="none" marker-end="url(#arrow)"/>
        <path d="M984 280 L984 344 L920 344" stroke="#667085" stroke-width="1.2" fill="none" marker-end="url(#arrow)"/>
        <path d="M516 296 L516 516" stroke="#667085" stroke-width="1.1" fill="none" marker-end="url(#arrow)"/>
        <path d="M808 296 L808 516" stroke="#667085" stroke-width="1.1" fill="none" marker-end="url(#arrow)"/>
        <path d="M380 516 L380 392" stroke="#667085" stroke-width="1.1" stroke-dasharray="5,4" fill="none" marker-end="url(#arrow)"/>
        <path d="M620 344 L744 344" stroke="#667085" stroke-width="1.1" fill="none" marker-end="url(#arrow)"/>
        <path d="M808 376 L808 456 L124 456 L124 380" stroke="#2563eb" stroke-width="1.1" fill="none" marker-end="url(#arrow-link)"/>

        <rect x="64" y="104" width="120" height="64" rx="6" fill="#ffffff"/>
        <rect x="64" y="104" width="120" height="64" rx="6" fill="rgba(37,99,235,0.05)" stroke="rgba(37,99,235,0.58)" stroke-width="1"/>
        <text x="124" y="140" text-anchor="middle" class="label">Feishu WS</text>
        <text x="124" y="156" text-anchor="middle" class="sub">one event socket</text>

        <rect x="64" y="192" width="120" height="64" rx="6" fill="#ffffff"/>
        <rect x="64" y="192" width="120" height="64" rx="6" fill="rgba(37,99,235,0.035)" stroke="rgba(37,99,235,0.42)" stroke-width="1" stroke-dasharray="5,4"/>
        <text x="124" y="228" text-anchor="middle" class="label">Bash</text>
        <text x="124" y="244" text-anchor="middle" class="sub">audited local exec</text>

        <rect x="64" y="312" width="120" height="64" rx="6" fill="#ffffff"/>
        <rect x="64" y="312" width="120" height="64" rx="6" fill="rgba(102,112,133,0.07)" stroke="rgba(102,112,133,0.52)" stroke-width="1"/>
        <text x="124" y="348" text-anchor="middle" class="label">HTTP / CLI</text>
        <text x="124" y="364" text-anchor="middle" class="sub">manual tasks</text>

        <rect x="284" y="184" width="160" height="80" rx="6" fill="#f7f8f8"/>
        <rect x="284" y="184" width="160" height="80" rx="6" fill="#e7f5f2" stroke="#0f766e" stroke-width="1.2"/>
        <text x="364" y="220" text-anchor="middle" class="label">Channel Gateway</text>
        <text x="364" y="236" text-anchor="middle" class="sub">normalize + deliver to CEO</text>
        <text x="364" y="252" text-anchor="middle" class="sub">dedupe + replyTarget</text>

        <rect x="500" y="176" width="120" height="96" rx="6" fill="#f7f8f8"/>
        <rect x="500" y="176" width="120" height="96" rx="6" fill="#e7f5f2" stroke="#0f766e" stroke-width="1.2"/>
        <text x="560" y="212" text-anchor="middle" class="label">TeamEngine</text>
        <text x="560" y="228" text-anchor="middle" class="sub">lifecycle + routing</text>
        <text x="560" y="244" text-anchor="middle" class="sub">dependencies + sessions</text>
        <text x="560" y="260" text-anchor="middle" class="sub">traces + read models</text>

        <rect x="332" y="328" width="96" height="64" rx="6" fill="#ffffff"/>
        <rect x="332" y="328" width="96" height="64" rx="6" fill="rgba(16,24,40,0.035)" stroke="rgba(102,112,133,0.54)" stroke-width="1"/>
        <text x="380" y="356" text-anchor="middle" class="label">Scheduler</text>
        <text x="380" y="372" text-anchor="middle" class="sub">wake engine.tick()</text>

        <rect x="500" y="312" width="120" height="80" rx="6" fill="#ffffff"/>
        <rect x="500" y="312" width="120" height="80" rx="6" fill="rgba(16,24,40,0.035)" stroke="rgba(102,112,133,0.54)" stroke-width="1"/>
        <text x="560" y="348" text-anchor="middle" class="label">Tool Executor</text>
        <text x="560" y="364" text-anchor="middle" class="sub">role allowlist</text>
        <text x="560" y="380" text-anchor="middle" class="sub">audit backend calls</text>

        <rect x="744" y="176" width="128" height="96" rx="6" fill="#ffffff"/>
        <rect x="744" y="176" width="128" height="96" rx="6" fill="rgba(37,99,235,0.05)" stroke="rgba(37,99,235,0.62)" stroke-width="1.2"/>
        <text x="808" y="212" text-anchor="middle" class="label">Worker Engines</text>
        <text x="808" y="228" text-anchor="middle" class="sub">task_graph artifact</text>
        <text x="808" y="244" text-anchor="middle" class="sub">configured workers</text>
        <text x="808" y="260" text-anchor="middle" class="sub">task execution loop</text>

        <rect x="920" y="176" width="128" height="96" rx="6" fill="#ffffff"/>
        <rect x="920" y="176" width="128" height="96" rx="6" fill="rgba(16,24,40,0.035)" stroke="rgba(102,112,133,0.56)" stroke-width="1"/>
        <text x="984" y="212" text-anchor="middle" class="label">Model Provider</text>
        <text x="984" y="228" text-anchor="middle" class="sub">app-server / API / mock</text>
        <text x="984" y="244" text-anchor="middle" class="sub">runtime context</text>

        <rect x="744" y="312" width="128" height="80" rx="6" fill="#ffffff"/>
        <rect x="744" y="312" width="128" height="80" rx="6" fill="rgba(37,99,235,0.05)" stroke="rgba(37,99,235,0.62)" stroke-width="1"/>
        <text x="808" y="348" text-anchor="middle" class="label">Outbound Reply</text>
        <text x="808" y="364" text-anchor="middle" class="sub">replyTarget aware</text>
        <text x="808" y="380" text-anchor="middle" class="sub">message reply first</text>

        <rect x="920" y="320" width="96" height="64" rx="6" fill="#ffffff"/>
        <rect x="920" y="320" width="96" height="64" rx="6" fill="rgba(16,24,40,0.03)" stroke="rgba(102,112,133,0.44)" stroke-width="1"/>
        <text x="968" y="348" text-anchor="middle" class="label">Dashboard</text>
        <text x="968" y="364" text-anchor="middle" class="sub">read model</text>

        <rect x="316" y="516" width="128" height="64" rx="6" fill="#ffffff"/>
        <rect x="316" y="516" width="128" height="64" rx="6" fill="rgba(16,24,40,0.05)" stroke="rgba(102,112,133,0.56)" stroke-width="1"/>
        <text x="380" y="544" text-anchor="middle" class="label">Engine Store</text>
        <text x="380" y="560" text-anchor="middle" class="sub">intents/tasks/runs</text>

        <rect x="492" y="516" width="128" height="64" rx="6" fill="#ffffff"/>
        <rect x="492" y="516" width="128" height="64" rx="6" fill="rgba(16,24,40,0.05)" stroke="rgba(102,112,133,0.56)" stroke-width="1"/>
        <text x="556" y="544" text-anchor="middle" class="label">Memory</text>
        <text x="556" y="560" text-anchor="middle" class="sub">facts/events/playbooks</text>

        <rect x="668" y="516" width="128" height="64" rx="6" fill="#ffffff"/>
        <rect x="668" y="516" width="128" height="64" rx="6" fill="rgba(16,24,40,0.05)" stroke="rgba(102,112,133,0.56)" stroke-width="1"/>
        <text x="732" y="544" text-anchor="middle" class="label">File Bus</text>
        <text x="732" y="560" text-anchor="middle" class="sub">role boxes + artifacts</text>

        <rect x="844" y="516" width="128" height="64" rx="6" fill="#ffffff"/>
        <rect x="844" y="516" width="128" height="64" rx="6" fill="rgba(16,24,40,0.05)" stroke="rgba(102,112,133,0.56)" stroke-width="1"/>
        <text x="908" y="544" text-anchor="middle" class="label">Channel Config</text>
        <text x="908" y="560" text-anchor="middle" class="sub">local secrets</text>

        <path d="M620 164 C656 132, 700 124, 744 140" stroke="#667085" stroke-width="1" fill="none" stroke-dasharray="4,4"/>
        <text x="752" y="144" class="note">Engine owns lifecycle; planner decomposes work.</text>
        <text x="752" y="162" class="note">AgentRuntime owns turns; adapters keep runs visible.</text>

        <line x1="40" y1="704" x2="1080" y2="704" stroke="rgba(16,24,40,0.12)" stroke-width="0.8"/>
        <text x="44" y="728" class="tag">LEGEND</text>
        <rect x="128" y="716" width="20" height="12" rx="2" fill="#e7f5f2" stroke="#0f766e" stroke-width="1"/>
        <text x="160" y="726" class="sub">focal control path</text>
        <rect x="320" y="716" width="20" height="12" rx="2" fill="rgba(37,99,235,0.05)" stroke="rgba(37,99,235,0.62)" stroke-width="1"/>
        <text x="352" y="726" class="sub">external or agent execution</text>
        <rect x="588" y="716" width="20" height="12" rx="2" fill="rgba(16,24,40,0.05)" stroke="rgba(102,112,133,0.56)" stroke-width="1"/>
        <text x="620" y="726" class="sub">durable state</text>
        <line x1="780" y1="722" x2="816" y2="722" stroke="#667085" stroke-width="1" stroke-dasharray="5,4"/>
        <text x="828" y="726" class="sub">async boundary</text>
      </svg>
    </div>

    <h2 class="section-title">Message To Delivery Flow</h2>
    <div class="diagram-wrap">
      <svg viewBox="0 0 1120 980" role="img" aria-labelledby="flow-title flow-desc">
        <title id="flow-title">TeamEngine intent processing flow</title>
        <desc id="flow-desc">A Feishu message enters through WebSocket, becomes a CEO-approved intent, is advanced by TeamEngine ticks, turned into a spec and task graph by the product manager role, executed and verified by worker roles, then replied back to the originating channel.</desc>
        <defs>
          <marker id="flow-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#667085"/></marker>
          <marker id="flow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#0f766e"/></marker>
          <marker id="flow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#2563eb"/></marker>
          <style>
            .f-label { font: 600 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Arial, sans-serif; fill: #161a1d; }
            .f-sub { font: 400 9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; fill: #667085; }
            .f-tag { font: 600 8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; fill: #667085; letter-spacing: .12em; }
            .f-arrow { font: 500 8px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; fill: #667085; letter-spacing: .08em; }
          </style>
        </defs>
        <rect width="1120" height="980" fill="#ffffff"/>

        <rect x="48" y="60" width="1024" height="108" rx="8" fill="rgba(37,99,235,0.035)" stroke="rgba(37,99,235,0.30)" stroke-width="1" stroke-dasharray="5,4"/>
        <text x="76" y="84" class="f-tag">INGRESS</text>
        <rect x="96" y="104" width="144" height="44" rx="22" fill="#ffffff" stroke="rgba(37,99,235,0.58)" stroke-width="1"/>
        <text x="168" y="124" text-anchor="middle" class="f-label">Feishu message</text>
        <text x="168" y="138" text-anchor="middle" class="f-sub">user or group chat</text>
        <rect x="320" y="96" width="152" height="60" rx="6" fill="#ffffff" stroke="rgba(37,99,235,0.58)" stroke-width="1"/>
        <text x="396" y="122" text-anchor="middle" class="f-label">WebSocket adapter</text>
        <text x="396" y="138" text-anchor="middle" class="f-sub">allowlist + dedupe</text>
        <polygon points="592,96 672,126 592,156 512,126" fill="#ffffff" stroke="rgba(37,99,235,0.58)" stroke-width="1"/>
        <text x="592" y="122" text-anchor="middle" class="f-label">Allowed?</text>
        <text x="592" y="138" text-anchor="middle" class="f-sub">user/chat/group</text>
        <rect x="768" y="96" width="160" height="60" rx="6" fill="#ffffff" stroke="rgba(15,118,110,0.68)" stroke-width="1"/>
        <text x="848" y="122" text-anchor="middle" class="f-label">Channel Gateway</text>
        <text x="848" y="138" text-anchor="middle" class="f-sub">normalize replyTarget</text>

        <path d="M240 126 L320 126" stroke="#2563eb" stroke-width="1.2" fill="none" marker-end="url(#flow-link)"/>
        <path d="M472 126 L512 126" stroke="#2563eb" stroke-width="1.2" fill="none" marker-end="url(#flow-link)"/>
        <path d="M672 126 L768 126" stroke="#2563eb" stroke-width="1.2" fill="none" marker-end="url(#flow-link)"/>
        <path d="M592 156 L592 192 L260 192" stroke="#667085" stroke-width="1" stroke-dasharray="5,4" fill="none" marker-end="url(#flow-arrow)"/>
        <rect x="600" y="170" width="24" height="14" rx="2" fill="#ffffff"/>
        <text x="612" y="180" text-anchor="middle" class="f-arrow">NO</text>
        <rect x="120" y="176" width="140" height="44" rx="6" fill="#ffffff" stroke="rgba(102,112,133,0.42)" stroke-width="1" stroke-dasharray="5,4"/>
        <text x="190" y="202" text-anchor="middle" class="f-label">Ignore event</text>

        <rect x="48" y="252" width="1024" height="196" rx="8" fill="rgba(15,118,110,0.035)" stroke="rgba(197,83,0,0.32)" stroke-width="1" stroke-dasharray="5,4"/>
        <text x="76" y="276" class="f-tag">ENGINE LIFECYCLE</text>
        <rect x="160" y="312" width="156" height="60" rx="6" fill="#f7f8f8"/>
        <rect x="160" y="312" width="156" height="60" rx="6" fill="#e7f5f2" stroke="#0f766e" stroke-width="1.2"/>
        <text x="238" y="338" text-anchor="middle" class="f-label">Create intent</text>
        <text x="238" y="354" text-anchor="middle" class="f-sub">CEO role owned</text>
        <rect x="396" y="312" width="156" height="60" rx="6" fill="#ffffff" stroke="rgba(102,112,133,0.54)" stroke-width="1"/>
        <text x="474" y="338" text-anchor="middle" class="f-label">Scheduler wakes</text>
        <text x="474" y="354" text-anchor="middle" class="f-sub">engine.tick()</text>
        <rect x="632" y="300" width="168" height="84" rx="6" fill="#f7f8f8"/>
        <rect x="632" y="300" width="168" height="84" rx="6" fill="#e7f5f2" stroke="#0f766e" stroke-width="1.2"/>
        <text x="716" y="326" text-anchor="middle" class="f-label">TeamEngine</text>
        <text x="716" y="342" text-anchor="middle" class="f-sub">route + dependencies</text>
        <text x="716" y="358" text-anchor="middle" class="f-sub">sessions + traces</text>
        <rect x="880" y="312" width="132" height="60" rx="6" fill="#ffffff" stroke="rgba(102,112,133,0.54)" stroke-width="1"/>
        <text x="946" y="338" text-anchor="middle" class="f-label">Task graph</text>
        <text x="946" y="354" text-anchor="middle" class="f-sub">spec + task_graph</text>

        <path d="M848 156 L848 220 L238 220 L238 312" stroke="#0f766e" stroke-width="1.4" fill="none" marker-end="url(#flow-accent)"/>
        <path d="M316 342 L396 342" stroke="#667085" stroke-width="1.1" fill="none" marker-end="url(#flow-arrow)"/>
        <path d="M552 342 L632 342" stroke="#0f766e" stroke-width="1.4" fill="none" marker-end="url(#flow-accent)"/>
        <path d="M800 342 L880 342" stroke="#0f766e" stroke-width="1.4" fill="none" marker-end="url(#flow-accent)"/>

        <rect x="48" y="532" width="1024" height="224" rx="8" fill="rgba(37,99,235,0.035)" stroke="rgba(37,99,235,0.30)" stroke-width="1" stroke-dasharray="5,4"/>
        <text x="76" y="556" class="f-tag">WORKER EXECUTION</text>
        <rect x="116" y="604" width="128" height="60" rx="6" fill="#ffffff" stroke="rgba(37,99,235,0.58)" stroke-width="1"/>
        <text x="180" y="630" text-anchor="middle" class="f-label">Product</text>
        <text x="180" y="646" text-anchor="middle" class="f-sub">spec + graph</text>
        <rect x="308" y="604" width="128" height="60" rx="6" fill="#ffffff" stroke="rgba(37,99,235,0.58)" stroke-width="1"/>
        <text x="372" y="630" text-anchor="middle" class="f-label">Engineer</text>
        <text x="372" y="646" text-anchor="middle" class="f-sub">implementation</text>
        <rect x="500" y="604" width="128" height="60" rx="6" fill="#ffffff" stroke="rgba(37,99,235,0.58)" stroke-width="1"/>
        <text x="564" y="630" text-anchor="middle" class="f-label">Verify</text>
        <text x="564" y="646" text-anchor="middle" class="f-sub">verify + risks</text>
        <polygon points="704,592 784,634 704,676 624,634" fill="#ffffff" stroke="rgba(37,99,235,0.58)" stroke-width="1"/>
        <text x="704" y="630" text-anchor="middle" class="f-label">Pass?</text>
        <text x="704" y="646" text-anchor="middle" class="f-sub">verification gate</text>
        <rect x="860" y="604" width="132" height="60" rx="6" fill="#ffffff" stroke="rgba(37,99,235,0.58)" stroke-width="1"/>
        <text x="926" y="630" text-anchor="middle" class="f-label">Customer</text>
        <text x="926" y="646" text-anchor="middle" class="f-sub">user update</text>

        <path d="M946 372 L946 488 L180 488 L180 604" stroke="#667085" stroke-width="1.1" fill="none" marker-end="url(#flow-arrow)"/>
        <path d="M244 634 L308 634" stroke="#667085" stroke-width="1.1" fill="none" marker-end="url(#flow-arrow)"/>
        <path d="M436 634 L500 634" stroke="#667085" stroke-width="1.1" fill="none" marker-end="url(#flow-arrow)"/>
        <path d="M628 634 L624 634" stroke="#667085" stroke-width="1.1" fill="none" marker-end="url(#flow-arrow)"/>
        <path d="M784 634 L860 634" stroke="#667085" stroke-width="1.1" fill="none" marker-end="url(#flow-arrow)"/>
        <path d="M704 676 L704 720 L372 720 L372 664" stroke="#667085" stroke-width="1" stroke-dasharray="5,4" fill="none" marker-end="url(#flow-arrow)"/>
        <rect x="712" y="692" width="28" height="14" rx="2" fill="#ffffff"/>
        <text x="726" y="702" text-anchor="middle" class="f-arrow">NO</text>

        <rect x="48" y="832" width="1024" height="100" rx="8" fill="rgba(16,24,40,0.035)" stroke="rgba(102,112,133,0.32)" stroke-width="1" stroke-dasharray="5,4"/>
        <text x="76" y="856" class="f-tag">DELIVERY AND MEMORY</text>
        <rect x="144" y="872" width="140" height="44" rx="6" fill="#ffffff" stroke="rgba(102,112,133,0.54)" stroke-width="1"/>
        <text x="214" y="898" text-anchor="middle" class="f-label">Finalize intent</text>
        <rect x="376" y="872" width="148" height="44" rx="6" fill="#ffffff" stroke="rgba(102,112,133,0.54)" stroke-width="1"/>
        <text x="450" y="898" text-anchor="middle" class="f-label">Trace/read model</text>
        <rect x="616" y="864" width="156" height="60" rx="6" fill="#f7f8f8"/>
        <rect x="616" y="864" width="156" height="60" rx="6" fill="#e7f5f2" stroke="#0f766e" stroke-width="1.2"/>
        <text x="694" y="890" text-anchor="middle" class="f-label">Outbound Reply</text>
        <text x="694" y="906" text-anchor="middle" class="f-sub">replyTarget aware</text>
        <rect x="852" y="872" width="148" height="44" rx="22" fill="#ffffff" stroke="rgba(37,99,235,0.58)" stroke-width="1"/>
        <text x="926" y="898" text-anchor="middle" class="f-label">Reply to Feishu</text>

        <path d="M926 664 L926 792 L214 792 L214 872" stroke="#667085" stroke-width="1.1" fill="none" marker-end="url(#flow-arrow)"/>
        <path d="M284 894 L376 894" stroke="#667085" stroke-width="1.1" fill="none" marker-end="url(#flow-arrow)"/>
        <path d="M524 894 L616 894" stroke="#0f766e" stroke-width="1.4" fill="none" marker-end="url(#flow-accent)"/>
        <path d="M772 894 L852 894" stroke="#2563eb" stroke-width="1.2" fill="none" marker-end="url(#flow-link)"/>
        <rect x="800" y="882" width="36" height="14" rx="2" fill="#ffffff"/>
        <text x="818" y="892" text-anchor="middle" class="f-arrow">API</text>
      </svg>
    </div>

    <section class="summary">
      <article class="card">
        <h2><span class="dot green"></span>Current design that is reasonable</h2>
        <ul>
          <li>All IM channels still enter through one gateway, preserving replyTarget and dedupe before Engine handling.</li>
          <li>Feishu ingress is a single WebSocket adapter; local execution is exposed only through audited Bash.</li>
          <li>TeamEngine owns lifecycle, routing, dependencies, sessions, traces, and read models.</li>
          <li>AgentRuntime prepares each worker turn with memory, tool policy, session summary, and prompt budget.</li>
          <li>Non-runtime context is never truncated; oversized runtime context is compressed by the model before the target turn.</li>
          <li>The product manager role consumes CEO-approved intents and emits product spec plus task graph for worker execution.</li>
        </ul>
      </article>
      <article class="card">
        <h2><span class="dot"></span>Design points to watch</h2>
        <ul>
          <li>Scheduler is intentionally thin: it should only wake Engine with <code>engine.tick()</code>.</li>
          <li>The file-backed Engine store and bus are transparent for debugging but are still prototype adapters.</li>
          <li>Server, provider runner, worker execution, and tool executor still share one Node process.</li>
          <li><code>Bash</code> is the audited local execution boundary; Codex Subscription Provider turns use <code>codex_app_server</code> as a model runner, not as a separate execution tool.</li>
        </ul>
      </article>
      <article class="card">
        <h2><span class="dot red"></span>Production hardening path</h2>
        <ul>
          <li>Move Engine store and bus adapters to a database plus queue while preserving the same lifecycle contract.</li>
          <li>Run provider and worker execution in separate worker processes.</li>
          <li>Move channel secrets into Keychain, Vault, or cloud Secret Manager.</li>
          <li>Add auth to dashboard read APIs before exposing it outside a trusted network.</li>
        </ul>
      </article>
    </section>
    <div class="footer">Route: ${ARCHITECTURE_PATH} · Source of truth: current ai-team server modules, channel runtime, agent runtime, and data stores.</div>
  </main>
</body>
</html>`;
}
