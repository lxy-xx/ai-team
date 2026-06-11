export const DASHBOARD_PRODUCT_STYLES = `
    :root {
      --sidebar-width: 248px;
      --bg: #f3f6f8;
      --surface: #ffffff;
      --surface-soft: #eef3f6;
      --line: rgba(91, 107, 122, 0.22);
      --line-strong: rgba(62, 76, 92, 0.3);
      --text: #111827;
      --muted: #647080;
      --faint: #94a3b8;
      --orange: #0f766e;
      --teal: #0f766e;
      --blue: #0f766e;
      --amber: #b7791f;
      --green: #15803d;
      --red: #b91c1c;
      --purple: #6d28d9;
      --yellow: #b7791f;
      --glass: rgba(255, 255, 255, 0.86);
      --glass-strong: rgba(255, 255, 255, 0.94);
      --glass-soft: rgba(255, 255, 255, 0.74);
      --shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
      --shadow-tight: 0 1px 2px rgba(15, 23, 42, 0.05);
      --inner-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.66);
      --glass-border: rgba(91, 107, 122, 0.18);
    }
    html,
    body {
      background: var(--bg);
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      display: none;
    }
    body::after {
      content: "";
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      display: none;
    }
    main,
    .subbar {
      position: relative;
      z-index: 1;
      margin-left: var(--sidebar-width);
      width: calc(100% - var(--sidebar-width));
      max-width: calc(100vw - var(--sidebar-width));
    }
    .topbar {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 30;
      width: var(--sidebar-width);
      max-width: var(--sidebar-width);
      height: 100vh;
      min-height: 100vh;
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
      padding: 18px 14px;
      border-right: 1px solid var(--line);
      border-bottom: 0;
      background: rgba(255,255,255,0.92);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
      box-shadow: 1px 0 0 rgba(15, 23, 42, 0.03);
    }
    .brand {
      min-width: 0;
      padding: 2px 4px 8px;
    }
    .mark {
      background: linear-gradient(145deg, #0f766e, #0b6f68);
      box-shadow: var(--inner-highlight);
    }
    .divider {
      width: 100%;
      height: 1px;
      background: rgba(72, 86, 100, 0.16);
    }
    .nav {
      flex: 0 0 auto;
      width: 100%;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      overflow: hidden;
    }
    .nav button {
      width: 100%;
      text-align: left;
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 9px 10px;
      background: transparent;
      color: var(--muted);
    }
    .nav button:hover {
      border-color: rgba(15, 118, 110, 0.22);
      background: rgba(255,255,255,0.48);
      color: var(--text);
    }
    .nav button.active {
      color: var(--teal);
      border-color: rgba(15, 118, 110, 0.28);
      background: #e7f5f2;
      box-shadow: var(--inner-highlight);
    }
    .top-spacer {
      flex: 1 1 auto;
    }
    .active-agents,
    .language-switch {
      align-self: stretch;
    }
    .active-agents {
      justify-content: flex-start;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.72);
      padding: 8px 10px;
      box-shadow: var(--inner-highlight);
    }
    .language-switch {
      width: 100%;
      background: rgba(255,255,255,0.72);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
      box-shadow: var(--inner-highlight);
    }
    .language-switch button.active {
      background: rgba(255,255,255,0.82);
      color: var(--teal);
      box-shadow: var(--shadow-tight);
    }
    .subbar {
      position: sticky;
      top: 0;
      z-index: 18;
      min-height: 56px;
      border-bottom: 1px solid var(--line);
      background: rgba(250, 252, 253, 0.92);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
      box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
    }
    .chip-button,
    .quiet-button,
    .action-button,
    .model-chip,
    .readonly-skill,
    .mcp-json-button,
    .provider-kind-badge,
    .credential,
    .capability-count,
    .status-pill,
    .tag,
    .step,
    .agent-chip,
    .wake-token {
      border-color: var(--line);
      background: rgba(255,255,255,0.66);
      box-shadow: var(--inner-highlight);
    }
    .chip-button.active,
    .mcp-json-button.active {
      color: var(--teal);
      border-color: rgba(15, 118, 110, 0.32);
      background: #e7f5f2;
      box-shadow: var(--inner-highlight);
    }
    .action-button.primary {
      border-color: rgba(15, 118, 110, 0.72);
      background: linear-gradient(135deg, #0f766e, #0b6f68);
      box-shadow: var(--shadow-tight), var(--inner-highlight);
    }
    .field input,
    .field textarea,
    .field select,
    .capability-row input,
    .inline-install-row input,
    .work-intake-form textarea,
    .one-one-composer textarea,
    .context-request-answer-grid textarea,
    .context-request-answer-grid input,
    .context-request-answer-grid select {
      border-color: var(--line);
      background: rgba(255,255,255,0.72);
      box-shadow: var(--inner-highlight);
    }
    .panel,
    .readiness-panel,
    .owner-attention-panel,
    .context-request-panel,
    .working-agents,
    .working-agents-empty,
    .work-intake-panel,
    .project-card,
    .employee-command-panel,
    .employee-improvement-panel,
    .agent-summary-card,
    .provider-card,
    .settings-group,
    .provider-auth-panel,
    .provider-model-panel,
    .evidence-index,
    .agent-modal,
    .one-one-modal,
    .run-detail-json,
    .channel-output,
    .one-one-messages,
    .work-intake-chat {
      border-color: var(--line);
      background: rgba(255,255,255,0.9);
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
      box-shadow: var(--shadow), var(--inner-highlight);
    }
    .work-card,
    .owner-attention-card,
    .context-request-card,
    .working-agent-card,
    .evidence-index-card,
    .evidence-brief-row,
    .project-metric,
    .wake-rule-card,
    .mcp-capability-card,
    .skill-capability-card,
    .mcp-tool-row,
    .one-one-message,
    .work-intake-bubble {
      border-color: rgba(111, 128, 145, 0.2);
      background: #ffffff;
      box-shadow: var(--shadow-tight), var(--inner-highlight);
    }
    .work-card {
      text-align: left;
    }
    .work-card:not(:disabled):hover,
    .agent-summary-card:hover,
    .provider-card:hover,
    .evidence-index-card:hover {
      border-color: rgba(15, 118, 110, 0.36);
      background: rgba(255,255,255,0.88);
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.07), var(--inner-highlight);
    }
    .overview-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);
      gap: 14px;
      align-items: stretch;
      min-height: calc(100vh - 56px);
      min-width: 0;
      padding: 16px 24px 28px;
    }
    .overview-main-stack {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 0;
      min-width: 0;
    }
    .owner-attention-row,
    .overview-main-stack,
    .overview-employee-rail,
    .overview-employee-rail > .working-agents-panel,
    .overview-employee-rail > .context-requests {
      min-width: 0;
    }
    .owner-attention-row > .owner-attention,
    .overview-employee-rail > .working-agents-panel,
    .overview-employee-rail > .context-requests {
      padding: 0;
    }
    .owner-attention-row .owner-attention-panel {
      min-height: 0;
      overflow: visible;
    }
    .owner-attention-row .owner-attention-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
      gap: 10px;
      overflow: visible;
      padding: 1px;
    }
    .owner-attention-row .owner-attention-card {
      min-width: 0;
    }
    .owner-attention-row .owner-attention-card h3,
    .owner-attention-row .owner-attention-card p {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      overflow: visible;
    }
    .owner-attention-row .owner-attention-card h3 {
      -webkit-line-clamp: 2;
    }
    .owner-attention-row .owner-attention-card p {
      -webkit-line-clamp: 2;
    }
    .overview-main-stack > .board {
      min-height: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr));
      grid-auto-flow: row;
      grid-auto-columns: initial;
      align-items: start;
      overflow: visible;
      padding: 0;
    }
    .overview-employee-rail {
      display: grid;
      grid-template-rows: auto auto;
      gap: 12px;
      align-items: start;
      align-content: start;
      align-self: stretch;
      min-height: calc(100vh - 100px);
      padding: 12px;
      border-left: 1px solid rgba(91, 107, 122, 0.22);
      border-radius: 0 8px 8px 0;
      background: linear-gradient(180deg, rgba(239, 244, 247, 0.72), rgba(249, 251, 252, 0.5));
      box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.78);
    }
    .overview-employee-rail .working-agents,
    .overview-employee-rail .working-agents-empty,
    .overview-employee-rail .context-request-panel {
      border-color: rgba(111, 128, 145, 0.16);
      background: rgba(255,255,255,0.78);
      box-shadow: 0 1px 1px rgba(15, 23, 42, 0.035), var(--inner-highlight);
    }
    .overview-employee-rail .context-request-panel {
      height: auto;
      min-height: 0;
      max-height: min(520px, calc(100vh - 184px));
      overflow: auto;
      scrollbar-width: thin;
    }
    .overview-employee-rail .working-agents,
    .overview-employee-rail .working-agents-empty {
      min-height: 0;
      max-height: min(360px, calc(50vh - 72px));
      overflow: auto;
      scrollbar-width: thin;
    }
    .overview-employee-rail .working-agent-grid,
    .overview-employee-rail .context-request-list {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .overview-employee-rail .working-agent-card,
    .overview-employee-rail .context-request-card {
      padding: 10px;
    }
    .overview-employee-rail .context-request-title,
    .overview-employee-rail .working-agents-title {
      margin-bottom: 10px;
    }
    .overview-employee-rail .context-request-answer-grid {
      gap: 7px;
    }
    .tab:not([data-tab="Overview"]) {
      background: linear-gradient(180deg, rgba(247, 250, 252, 0.82), rgba(243, 246, 248, 0.96));
    }
    .tab[data-tab="Team"] > .panel-grid,
    .tab[data-tab="Settings"] > .panel-grid,
    .tab[data-tab="Evidence"] > .detail-layout,
    .tab[data-tab="Intake"] > .work-intake,
    .tab[data-tab="Projects"] {
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 20px 24px 30px;
      min-height: calc(100vh - 56px);
    }
    .tab[data-tab="Settings"] > .settings-readiness {
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 20px 24px 0;
    }
    .tab[data-tab="Settings"] > .panel-grid {
      min-height: 0;
      padding-top: 14px;
    }
    .panel-grid,
    .detail-layout,
    .project-card-grid,
    .agent-summary-grid,
    .evidence-dossier {
      align-items: start;
    }
    .panel,
    .readiness-panel,
    .employee-command-panel,
    .employee-improvement-panel,
    .settings-group,
    .evidence-index,
    .work-intake-panel,
    .project-section-head,
    .project-card {
      background: rgba(255,255,255,0.88);
      border-color: rgba(91, 107, 122, 0.18);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.045), var(--inner-highlight);
    }
    .project-section-head {
      border: 1px solid rgba(91, 107, 122, 0.18);
      border-radius: 8px;
      padding: 16px;
    }
    .board {
      min-height: 0;
      grid-auto-flow: row;
      grid-auto-columns: initial;
      gap: 14px;
      padding: 16px 28px 34px;
      overflow: visible;
    }
    .column {
      border: 1px solid rgba(91, 107, 122, 0.18);
      border-radius: 8px;
      background: rgba(255,255,255,0.58);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.62);
      padding: 12px;
    }
    .column-head {
      margin-bottom: 10px;
    }
    .empty {
      background: rgba(255,255,255,0.38);
      box-shadow: var(--inner-highlight);
    }
    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      .topbar,
      .subbar,
      .panel,
      .readiness-panel,
      .owner-attention-panel,
      .context-request-panel,
      .working-agents,
      .working-agents-empty,
      .work-intake-panel,
      .project-card,
      .agent-summary-card,
      .provider-card,
      .settings-group,
      .evidence-index,
      .agent-modal,
      .one-one-modal {
        background: #f8fbfd;
      }
    }
    @media (max-width: 1180px) {
      .overview-layout {
        padding: 16px 18px 30px;
        grid-template-columns: minmax(0, 1fr) minmax(270px, 300px);
      }
      .overview-main-stack > .board {
        grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
      }
    }
    @media (max-width: 980px) {
      .topbar {
        position: sticky;
        top: 0;
        bottom: auto;
        width: 100%;
        max-width: 100vw;
        height: auto;
        min-height: 0;
        flex-direction: row;
        align-items: center;
        border-right: 0;
        border-bottom: 1px solid rgba(255,255,255,0.68);
        padding: 10px 14px 8px;
      }
      .brand {
        padding: 0;
      }
      .nav {
        display: flex;
        flex-direction: row;
        overflow-x: auto;
      }
      .nav button {
        width: auto;
        text-align: center;
      }
      .language-switch {
        width: auto;
      }
      main,
      .subbar {
        margin-left: 0;
        width: 100%;
        max-width: 100vw;
      }
      .subbar {
        top: 0;
      }
      .overview-layout {
        padding: 14px;
        grid-template-columns: 1fr;
        align-items: start;
        min-height: 0;
      }
      .overview-main-stack > .board {
        min-height: auto;
        grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
        padding: 0;
      }
      .overview-employee-rail {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto;
        align-self: auto;
        min-height: 0;
        border-left: 0;
        border-top: 1px solid rgba(91, 107, 122, 0.2);
        border-radius: 8px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
      }
      .overview-employee-rail .working-agents,
      .overview-employee-rail .working-agents-empty,
      .overview-employee-rail .context-request-panel {
        max-height: none;
      }
    }
    @media (max-width: 600px) {
      .topbar {
        align-items: flex-start;
        gap: 8px 10px;
        padding: 10px 12px;
      }
      .brand {
        flex: 1 1 auto;
      }
      .nav {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        width: 100%;
        overflow: visible;
      }
      .nav button {
        width: 100%;
        min-width: 0;
        padding: 8px 4px;
        text-align: center;
        white-space: normal;
        line-height: 1.15;
      }
      .subbar {
        padding: 8px 12px;
      }
      .overview-layout {
        gap: 12px;
        padding: 12px;
      }
      .overview-main-stack {
        display: contents;
      }
      .owner-attention-row {
        order: 1;
      }
      .overview-employee-rail {
        order: 2;
        grid-template-columns: 1fr;
        grid-template-rows: auto auto;
        gap: 12px;
      }
      .overview-main-stack > .board {
        order: 3;
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .column {
        padding: 10px;
      }
      .column-head {
        margin-bottom: 7px;
      }
      .cards {
        gap: 8px;
      }
      .empty {
        min-height: 38px;
        padding: 8px;
      }
      .work-card {
        padding: 10px;
      }
      .work-card-brief,
      .work-card .agent-row,
      .work-card .steps {
        gap: 4px;
      }
      .owner-attention-row .owner-attention-grid,
      .overview-employee-rail .working-agent-grid,
      .overview-employee-rail .context-request-list {
        grid-template-columns: 1fr;
      }
      .overview-employee-rail .working-agents,
      .overview-employee-rail .working-agents-empty,
      .overview-employee-rail .context-request-panel {
        max-height: none;
        overflow: visible;
      }
    }
    .one-one-modal {
      width: min(1060px, calc(100vw - 32px));
      grid-template-rows: auto minmax(360px, 1fr);
    }
    .one-one-body {
      grid-template-columns: minmax(220px, 0.34fr) minmax(0, 1fr);
      grid-template-rows: 1fr;
      gap: 0;
      padding: 0;
    }
    .one-one-sidebar {
      min-width: 0;
      border-right: 1px solid var(--line);
      background: var(--surface-soft);
      padding: 14px;
      overflow: auto;
    }
    .one-one-main {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto 1fr;
      overflow: hidden;
    }
    .one-one-mode-tabs {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: #fff;
    }
    .one-one-mode-tab {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      color: var(--muted);
      cursor: pointer;
      font-size: 12px;
      line-height: 1.2;
      padding: 8px 6px;
      overflow-wrap: anywhere;
    }
    .one-one-mode-tab.active {
      border-color: #8bc7bf;
      background: #e7f5f2;
      color: var(--teal);
    }
    .one-one-pane {
      min-height: 0;
      overflow: auto;
      padding: 14px;
    }
    .one-one-pane[hidden] {
      display: none;
    }
    .one-one-section-title {
      margin: 0 0 6px;
      font-size: 13px;
      line-height: 1.3;
    }
    .one-one-side-block {
      display: flex;
      flex-direction: column;
      gap: 9px;
      margin-top: 14px;
    }
    .one-one-side-block:first-child {
      margin-top: 0;
    }
    .one-one-readiness-head {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      align-items: center;
      min-width: 0;
    }
    .one-one-gap-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      margin-top: 9px;
    }
    .one-one-gap-card {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 9px;
    }
    .one-one-gap-card strong {
      display: block;
      font-size: 12px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .one-one-gap-card .small {
      margin: 4px 0 0;
    }
    .one-one-gap-action {
      align-self: flex-start;
    }
    .one-one-coaching-journal {
      margin: 0;
      max-height: 150px;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
      color: var(--muted);
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .one-one-need-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
      gap: 10px;
      margin: 10px 0 14px;
      min-width: 0;
    }
    .one-one-need-card {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 11px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .one-one-need-card p {
      margin: 0;
      font-size: 12px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }
    .one-one-need-head {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .one-one-need-head strong {
      min-width: 0;
      font-size: 12px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .one-one-need-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .one-one-prompt-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .one-one-prompt {
      min-height: 92px;
      text-align: left;
      white-space: normal;
      line-height: 1.35;
    }
    .one-one-form {
      display: grid;
      grid-template-columns: minmax(120px, 0.34fr) minmax(180px, 0.66fr);
      gap: 10px;
      align-items: end;
      max-width: 760px;
    }
    .one-one-form .field.full {
      grid-column: 1 / -1;
    }
    .one-one-memory-output {
      display: none;
      grid-column: 1 / -1;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--surface-soft);
      color: var(--muted);
      padding: 10px;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .one-one-memory-output.is-open {
      display: block;
    }
    .one-one-diagnostics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
      gap: 10px;
    }
    .one-one-diagnostic-group {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 11px;
    }
    .one-one-diagnostic-group h3 {
      margin: 0 0 8px;
      font-size: 13px;
    }
    .one-one-chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      min-width: 0;
    }
    .one-one-composer {
      grid-column: 1 / -1;
    }
    .work-card {
      width: 100%;
      text-align: left;
      color: inherit;
      cursor: pointer;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
      display: block;
      position: relative;
      min-height: 86px;
      padding: 13px 14px 12px;
      overflow: visible;
      background:
        radial-gradient(circle at 18px 16px, rgba(15, 23, 42, 0.018) 0 0.42px, transparent 0.66px),
        radial-gradient(circle at 76% 62%, rgba(15, 23, 42, 0.012) 0 0.48px, transparent 0.72px),
        repeating-linear-gradient(112deg, rgba(15, 23, 42, 0.006) 0 1px, transparent 1px 13px),
        linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(253, 254, 253, 0.93));
      background-size: 17px 19px, 23px 29px, auto, auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .work-card:hover,
    .work-card:focus-visible {
      border-top-color: #8bc7bf;
      border-right-color: #8bc7bf;
      border-bottom-color: #8bc7bf;
      background:
        radial-gradient(circle at 18px 16px, rgba(15, 23, 42, 0.018) 0 0.42px, transparent 0.66px),
        radial-gradient(circle at 76% 62%, rgba(15, 23, 42, 0.012) 0 0.48px, transparent 0.72px),
        repeating-linear-gradient(112deg, rgba(15, 23, 42, 0.006) 0 1px, transparent 1px 13px),
        linear-gradient(180deg, rgba(249, 254, 252, 0.96), rgba(241, 253, 250, 0.86));
      background-size: 17px 19px, 23px 29px, auto, auto;
      outline: none;
    }
    .work-card:disabled {
      cursor: default;
      opacity: 1;
    }
    .work-card:disabled:hover {
      border-color: var(--line);
      background:
        radial-gradient(circle at 18px 16px, rgba(15, 23, 42, 0.018) 0 0.42px, transparent 0.66px),
        radial-gradient(circle at 76% 62%, rgba(15, 23, 42, 0.012) 0 0.48px, transparent 0.72px),
        repeating-linear-gradient(112deg, rgba(15, 23, 42, 0.006) 0 1px, transparent 1px 13px),
        linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(253, 254, 253, 0.93));
      background-size: 17px 19px, 23px 29px, auto, auto;
    }
    .work-card.entity-intent {
      border-color: rgba(43, 71, 84, 0.36);
      background:
        radial-gradient(circle at 18px 16px, rgba(15, 23, 42, 0.028) 0 0.42px, transparent 0.66px),
        radial-gradient(circle at 76% 62%, rgba(15, 23, 42, 0.02) 0 0.48px, transparent 0.72px),
        repeating-linear-gradient(112deg, rgba(15, 23, 42, 0.011) 0 1px, transparent 1px 13px),
        linear-gradient(180deg, rgba(239, 246, 247, 0.99), rgba(220, 234, 236, 0.94));
      background-size: 17px 19px, 23px 29px, auto, auto;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
    }
    .work-card.entity-intent:hover,
    .work-card.entity-intent:focus-visible {
      border-color: rgba(15, 118, 110, 0.5);
      background:
        radial-gradient(circle at 18px 16px, rgba(15, 23, 42, 0.028) 0 0.42px, transparent 0.66px),
        radial-gradient(circle at 76% 62%, rgba(15, 23, 42, 0.02) 0 0.48px, transparent 0.72px),
        repeating-linear-gradient(112deg, rgba(15, 23, 42, 0.011) 0 1px, transparent 1px 13px),
        linear-gradient(180deg, rgba(232, 244, 244, 0.99), rgba(210, 229, 229, 0.94));
      background-size: 17px 19px, 23px 29px, auto, auto;
    }
    .card-clip {
      position: absolute;
      top: -4px;
      left: -2px;
      width: 13px;
      height: 32px;
      transform: rotate(-7deg);
      transform-origin: 50% 12px;
      pointer-events: none;
      opacity: 0.96;
      z-index: 2;
      filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.12));
    }
    .card-clip img {
      position: relative;
      z-index: 1;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      user-select: none;
    }
    .work-card-status-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      min-width: 0;
      margin-bottom: 5px;
      padding-right: 18px;
    }
    .work-card-status-meta .card-id {
      margin: 0;
      flex: 0 1 auto;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .work-card-status-meta .tag {
      margin-left: 0;
      padding: 0 4px;
      color: var(--faint);
      background: transparent;
      border-color: transparent;
      font-size: 10px;
    }
    .work-card-status-meta .tag.status {
      color: var(--muted);
    }
    .tag.entity {
      letter-spacing: 0;
      font-weight: 700;
    }
    .tag.entity.intent {
      color: var(--faint);
      background: transparent;
      border-color: transparent;
    }
    .tag.entity.task {
      color: var(--faint);
      background: transparent;
      border-color: transparent;
    }
    .work-card-status-meta .card-id {
      color: var(--faint);
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
    }
    .work-card .card-title {
      padding-right: 18px;
      font-size: 14px;
      color: var(--text);
      font-weight: 700;
      line-height: 1.28;
      overflow-wrap: anywhere;
    }
    .work-card-brief {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-top: 0;
      min-width: 0;
    }
    .work-card-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: fit-content;
      max-width: 100%;
      margin-top: 11px;
      border: 1px solid #f1a7a7;
      border-radius: 7px;
      background: #fef2f2;
      color: var(--red);
      padding: 6px 9px;
      font-size: 12px;
      line-height: 1.2;
      cursor: pointer;
      overflow-wrap: anywhere;
    }
    .work-card-action:hover,
    .work-card-action:focus-visible {
      border-color: var(--red);
      background: #fef2f2;
      outline: none;
    }
    .work-card-action[aria-disabled="true"] {
      cursor: wait;
      opacity: 0.66;
    }
    .work-card-action.failed {
      color: var(--amber);
      border-color: #d6b15e;
      background: #fffbeb;
    }
    .card-brief {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
      min-width: 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .brief-chip {
      align-self: flex-start;
      max-width: 100%;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface-soft);
      color: var(--muted);
      padding: 3px 7px;
      font-size: 11px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .work-card .progress-row {
      margin-top: 12px;
    }
    .work-card .progress-track {
      margin-top: 5px;
    }
    .work-card .steps {
      margin-top: 9px;
      max-height: 46px;
      overflow: hidden;
    }
    .work-card .step.more {
      border-style: dashed;
      color: var(--faint);
      background: var(--surface-soft);
    }
    .work-card .agent-row {
      margin-top: 10px;
      gap: 5px;
    }
    .work-card .agent-chip {
      max-width: 100%;
    }
    .agent-overflow {
      display: inline-flex;
      align-items: center;
      border: 1px dashed var(--line);
      border-radius: 999px;
      padding: 3px 7px;
      font-size: 11px;
      line-height: 1.15;
      color: var(--faint);
      background: var(--surface-soft);
    }
    .work-card .meta-row {
      width: 100%;
      max-width: 100%;
      margin-top: 12px;
      min-height: 20px;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      color: var(--faint);
      font-size: 11px;
      line-height: 1.25;
      overflow: hidden;
    }
    .work-card-owner,
    .work-card-project,
    .work-card-association {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .work-card-project,
    .work-card-association {
      margin-left: auto;
      color: var(--muted);
    }
    .work-card-association {
      flex: 1 1 auto;
      min-width: 0;
      max-width: 100%;
      color: var(--faint);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .empty {
      min-height: 46px;
      padding: 10px;
      font-size: 12px;
    }
    .evidence-brief-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
      gap: 10px;
      min-width: 0;
    }
    .evidence-brief-row {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
      min-width: 0;
    }
    .evidence-brief-row span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.25;
      margin-bottom: 5px;
      overflow-wrap: anywhere;
    }
    .evidence-brief-row strong {
      display: block;
      color: var(--text);
      font-size: 13px;
      line-height: 1.35;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .owner-attention {
      padding: 22px 28px 0;
      min-width: 0;
    }
    .owner-attention-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.9);
      box-shadow: var(--shadow);
      padding: 14px;
      min-width: 0;
    }
    .owner-attention-head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
      margin-bottom: 12px;
    }
    .owner-attention-head h2 {
      margin: 0 0 4px;
      font-size: 15px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .owner-attention-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
      gap: 10px;
      min-width: 0;
    }
    .owner-attention-card {
      min-width: 0;
      border: 1px solid var(--line);
      border-left: 3px solid var(--amber);
      border-radius: 8px;
      background: #fff;
      padding: 11px;
      display: grid;
      gap: 7px;
      align-content: start;
    }
    .owner-attention-card.critical,
    .owner-attention-card.high {
      border-left-color: var(--red);
    }
    .owner-attention-card.medium {
      border-left-color: var(--amber);
    }
    .owner-attention-card.low {
      border-left-color: var(--teal);
    }
    .owner-attention-card-head,
    .owner-attention-card-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .owner-attention-card-head {
      justify-content: space-between;
    }
    .owner-attention-card-head .capability-count,
    .owner-attention-card-head .status-pill {
      padding: 3px 7px;
      font-size: 11px;
    }
    .owner-attention-card h3 {
      margin: 0;
      font-size: 13px;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .owner-attention-card p {
      margin: 0;
      font-size: 12px;
      line-height: 1.45;
      color: var(--muted);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .owner-attention-meta {
      color: var(--faint);
      font-size: 11px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .owner-attention-card-actions {
      margin-top: 2px;
    }
    .status-pill.needs_attention,
    .status-pill.needs_evidence,
    .status-pill.qa_watch,
    .status-pill.critical,
    .status-pill.high {
      color: var(--red);
      border-color: #f1a7a7;
      background: #fef2f2;
    }
    .status-pill.waiting,
    .status-pill.medium {
      color: var(--amber);
      border-color: #d6b15e;
      background: #fffbeb;
    }
    .status-pill.low,
    .status-pill.steady {
      color: var(--teal);
      border-color: #8bc7bf;
      background: #e7f5f2;
    }
    .status-pill.verified {
      color: var(--green);
      border-color: #8fd7b3;
      background: #ecfdf3;
    }
    .context-requests {
      padding: 14px 28px 0;
      min-width: 0;
    }
    .context-request-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.86);
      box-shadow: var(--shadow);
      padding: 14px;
      min-width: 0;
    }
    .context-request-title {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
      min-width: 0;
    }
    .context-request-title h2 {
      margin: 0 0 4px;
      font-size: 15px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .context-request-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr));
      gap: 10px;
      min-width: 0;
    }
    .context-request-card {
      min-width: 0;
      border: 1px solid var(--line);
      border-left: 3px solid var(--teal);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .context-request-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }
    .context-request-agent {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .context-request-agent strong {
      min-width: 0;
      font-size: 13px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .context-request-card p {
      margin: 0;
      font-size: 13px;
      line-height: 1.42;
      overflow-wrap: anywhere;
    }
    .context-request-meta {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .context-request-answer-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 9px;
      align-items: end;
      min-width: 0;
      margin-top: 2px;
    }
    .context-request-answer-grid .field {
      min-width: 0;
    }
    .context-request-answer-grid .field.full {
      grid-column: auto;
    }
    .context-request-answer-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
      gap: 9px;
      align-items: end;
      min-width: 0;
    }
    .context-request-answer-actions > * {
      min-width: 0;
    }
    .context-request-answer-grid span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.25;
      margin-bottom: 5px;
      overflow-wrap: anywhere;
    }
    .context-request-answer-grid textarea,
    .context-request-answer-grid input,
    .context-request-answer-grid select {
      width: 100%;
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      padding: 8px 9px;
      font: inherit;
      font-size: 12px;
      line-height: 1.35;
    }
    .context-request-answer-grid textarea {
      min-height: 74px;
      resize: vertical;
    }
    .context-request-save {
      min-width: 0;
    }
    .context-request-save .action-button {
      min-height: 36px;
      width: 100%;
      line-height: 1.2;
      white-space: normal;
    }
    .context-request-output {
      grid-column: 1 / -1;
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--surface-soft);
      color: var(--muted);
      padding: 9px;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .work-intake {
      min-width: 0;
    }
    .work-intake-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.86);
      box-shadow: var(--shadow);
      padding: 16px;
      min-width: 0;
    }
    .work-intake-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 14px;
      min-width: 0;
    }
    .work-intake-head h2 {
      margin: 0;
      font-size: 15px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .work-intake-badges {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
      min-width: 0;
    }
    .work-intake-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }
    .work-intake-fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      min-width: 0;
    }
    .work-intake-field {
      min-width: 0;
    }
    .work-intake-chat {
      min-height: 360px;
      max-height: min(60vh, 660px);
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(239, 244, 247, 0.72), rgba(249, 251, 252, 0.72));
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 12px;
    }
    .work-intake-empty {
      min-height: 180px;
      display: grid;
      place-items: center;
      color: var(--muted);
      text-align: center;
      line-height: 1.45;
      padding: 18px;
    }
    .work-intake-bubble-row {
      display: flex;
      width: 100%;
    }
    .work-intake-bubble-row.user {
      justify-content: flex-end;
    }
    .work-intake-bubble-row.agent {
      justify-content: flex-start;
    }
    .work-intake-bubble {
      width: fit-content;
      max-width: min(680px, 88%);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 9px 10px;
      font-size: 13px;
      line-height: 1.45;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .work-intake-bubble-row.user .work-intake-bubble {
      border-color: #8bc7bf;
      background: #e7f5f2;
    }
    .work-intake-bubble-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-bottom: 5px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
    }
    .work-intake-bubble-text {
      min-width: 0;
    }
    .work-intake-field span {
      display: block;
      margin-bottom: 5px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .work-intake-form textarea {
      min-height: 96px;
      resize: vertical;
      width: 100%;
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      padding: 9px;
      font: inherit;
      font-size: 13px;
      line-height: 1.45;
    }
    .work-intake-audio-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px 10px;
      align-items: center;
      min-width: 0;
    }
    .work-intake-audio-row input[type="file"] {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
      pointer-events: none;
    }
    .work-intake-audio-label {
      justify-self: start;
    }
    .work-intake-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      min-width: 0;
    }
    .work-intake-actions .action-button {
      min-height: 38px;
      min-width: 132px;
      white-space: nowrap;
    }
    .work-intake-output {
      margin-top: 10px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--surface-soft);
      color: var(--muted);
      padding: 9px 10px;
      font-size: 12px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .work-intake-output.success {
      border-color: #8fd7b3;
      background: #ecfdf3;
      color: var(--green);
    }
    .work-intake-output.error {
      border-color: #f1a7a7;
      background: #fef2f2;
      color: var(--red);
    }
    .projects-view {
      width: min(1120px, 100%);
      margin: 0 auto;
      padding: 22px 28px 0;
      min-width: 0;
    }
    .project-section-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
      min-width: 0;
    }
    .project-section-head h2 {
      margin: 0 0 4px;
      font-size: 16px;
      line-height: 1.25;
    }
    .project-section-head .small {
      margin: 0;
      max-width: 680px;
    }
    .project-delete-state {
      min-width: 160px;
      max-width: 360px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
      text-align: right;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .project-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
      gap: 12px;
      min-width: 0;
    }
    .project-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.88);
      box-shadow: var(--shadow);
      padding: 14px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .project-card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }
    .project-card-head h3 {
      margin: 0 0 4px;
      font-size: 15px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .project-card-head .small {
      margin: 0;
    }
    .project-metrics {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      min-width: 0;
    }
    .project-metric {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--surface-soft);
      padding: 8px;
      min-width: 0;
    }
    .project-metric span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .project-metric strong {
      display: block;
      margin-top: 4px;
      color: var(--text);
      font-size: 16px;
      line-height: 1.15;
    }
    .project-card-actions {
      display: flex;
      justify-content: flex-end;
      min-width: 0;
    }
    .danger-button {
      color: var(--red);
      border-color: #f1a7a7;
      background: #fef2f2;
    }
    .employee-command-panel {
      grid-column: 1 / -1;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.82);
      box-shadow: var(--shadow);
      padding: 16px;
      margin-bottom: 14px;
    }
    .employee-command-head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      min-width: 0;
      margin-bottom: 14px;
    }
    .employee-command-head h2 {
      margin: 0 0 4px;
      font-size: 15px;
    }
    .employee-command-head .small {
      margin: 0;
    }
    .employee-metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
      gap: 10px;
      min-width: 0;
    }
    .employee-improvement-panel {
      grid-column: 1 / -1;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.78);
      box-shadow: var(--shadow);
      padding: 14px;
      margin-bottom: 14px;
    }
    .employee-improvement-title {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
      margin-bottom: 12px;
    }
    .employee-improvement-title h2 {
      margin: 0 0 4px;
      font-size: 15px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .employee-improvement-title .small {
      margin: 0;
    }
    .employee-improvement-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
      gap: 10px;
      min-width: 0;
    }
    .employee-improvement-card {
      min-width: 0;
      border: 1px solid var(--line);
      border-left: 3px solid var(--amber);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
      display: grid;
      gap: 8px;
      align-content: start;
    }
    .employee-improvement-card.critical,
    .employee-improvement-card.high {
      border-left-color: var(--red);
    }
    .employee-improvement-card.low {
      border-left-color: var(--teal);
    }
    .employee-improvement-head,
    .employee-improvement-actions,
    .employee-improvement-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .employee-improvement-head {
      justify-content: space-between;
    }
    .employee-improvement-card h3 {
      margin: 0;
      font-size: 13px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .employee-improvement-card p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .employee-improvement-meta {
      color: var(--faint);
      font-size: 11px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .employee-metric,
    .employee-signal {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
    }
    .employee-metric span,
    .employee-signal span,
    .employee-score-row span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.25;
      margin-bottom: 4px;
    }
    .employee-metric strong,
    .employee-signal strong {
      display: block;
      font-size: 18px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .employee-card {
      min-height: 0;
      gap: 11px;
    }
    .employee-card > .small {
      min-height: 54px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .employee-card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }
    .employee-card-head h2 {
      flex: 1 1 160px;
    }
    .employee-score-row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .employee-score-row strong {
      font-size: 12px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .employee-score-track {
      margin-top: -5px;
    }
    .employee-signal-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      min-width: 0;
    }
    .employee-signal strong {
      font-size: 15px;
    }
    .employee-signal.active {
      border-color: #8bc7bf;
      background: #e7f5f2;
    }
    .employee-signal.failed,
    .employee-signal.needs_context {
      border-color: #f1a7a7;
      background: #fef2f2;
    }
    .employee-config .agent-summary-grid {
      grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
      gap: 12px;
    }
    .employee-config .agent-summary-card {
      min-height: 0;
      align-self: start;
    }
    .agent-config-card {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      overflow: hidden;
    }
    .agent-config-card .modal-body {
      min-height: 0;
      overflow: auto;
    }
    .agent-config-card .agent-prompt {
      min-height: 440px;
    }
    .agent-editor-body {
      display: grid;
      grid-template-columns: minmax(190px, 0.34fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .agent-editor-rail {
      position: sticky;
      top: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }
    .agent-editor-rail-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface-soft);
      padding: 12px;
      min-width: 0;
    }
    .agent-editor-rail-title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      margin-bottom: 10px;
    }
    .agent-editor-rail-title span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .agent-editor-rail-title strong {
      font-size: 13px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .agent-editor-score span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
    }
    .agent-editor-rail-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
      min-width: 0;
    }
    .agent-editor-nav {
      display: flex;
      flex-direction: column;
      gap: 7px;
      min-width: 0;
    }
    .agent-editor-nav-button {
      width: 100%;
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 9px 10px;
      cursor: pointer;
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      text-align: left;
    }
    .agent-editor-nav-button:hover {
      border-color: var(--teal);
      background: #f0fdfa;
    }
    .agent-editor-nav-button.active {
      border-color: var(--teal);
      background: #e7f5f2;
      color: var(--teal);
      box-shadow: var(--shadow);
    }
    .agent-editor-nav-button span,
    .agent-editor-nav-button strong {
      min-width: 0;
      overflow-wrap: anywhere;
      line-height: 1.25;
    }
    .agent-editor-nav-button span {
      color: var(--muted);
      font-size: 12px;
    }
    .agent-editor-nav-button strong {
      font-size: 12px;
      text-align: right;
    }
    .agent-editor-main {
      min-width: 0;
    }
    .agent-editor-main .form-grid {
      margin-top: 0;
    }
    .agent-editor-tab-panel {
      display: none;
      grid-column: 1 / -1;
      min-width: 0;
    }
    .agent-editor-tab-panel.active {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      align-items: start;
    }
    .agent-editor-tab-panel > .full {
      grid-column: 1 / -1;
    }
    .agent-editor-section-label {
      scroll-margin-top: 18px;
      padding-top: 0;
      margin-top: 0;
      margin-bottom: 2px;
    }
    .agent-editor-subsection-label {
      border-top: 1px solid var(--line);
      padding-top: 13px;
      margin-top: 8px;
    }
    .agent-editor-section-label h3,
    .agent-editor-subsection-label h3 {
      margin: 0 0 3px;
      font-size: 13px;
      line-height: 1.3;
    }
    .agent-editor-section-label .small,
    .agent-editor-subsection-label .small {
      margin: 0;
    }
    .agent-memory-readiness {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface-soft);
      padding: 12px;
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .agent-memory-readiness strong {
      font-size: 13px;
    }
    .agent-memory-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      min-width: 0;
    }
    .agent-memory-section {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
      min-width: 0;
    }
    .agent-memory-section-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
      min-width: 0;
    }
    .agent-memory-section-head h4 {
      margin: 0 0 3px;
      font-size: 13px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .agent-memory-section-head .small {
      margin: 0;
    }
    .agent-memory-list {
      display: grid;
      gap: 7px;
      min-width: 0;
    }
    .agent-memory-row {
      border-top: 1px solid var(--line);
      padding-top: 8px;
      min-width: 0;
    }
    .agent-memory-row:first-child {
      border-top: 0;
      padding-top: 0;
    }
    .agent-memory-row strong,
    .agent-memory-row p {
      overflow-wrap: anywhere;
    }
    .agent-memory-row strong {
      font-size: 12px;
    }
    .agent-memory-row p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .agent-config-card.is-dirty .agent-save-state {
      color: var(--amber);
    }
    .agent-nested-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 90;
      display: grid;
      place-items: center;
      padding: 18px;
      background: rgba(22, 26, 29, 0.34);
    }
    .agent-nested-modal {
      width: min(720px, 100%);
      max-height: min(760px, calc(100vh - 36px));
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto auto;
      gap: 12px;
      overflow: hidden;
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 18px 42px rgba(16, 24, 40, 0.2);
      padding: 16px;
    }
    .nested-modal-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      min-width: 0;
    }
    .nested-modal-head h3 {
      margin: 0 0 3px;
      font-size: 15px;
      line-height: 1.3;
    }
    .nested-modal-head .small,
    .nested-modal-status {
      margin: 0;
    }
    .mcp-json-modal-textarea {
      min-height: 320px;
      resize: vertical;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .mcp-json-store[hidden] {
      display: none !important;
    }
    .skill-list,
    .mcp-button-list {
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: stretch;
    }
    .skill-capability-card,
    .mcp-capability-card {
      position: relative;
      min-width: 0;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    .skill-capability-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      min-height: 42px;
      padding: 6px 8px 6px 11px;
    }
    .skill-copy,
    .mcp-tool-copy {
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(120px, 0.42fr) minmax(0, 1fr);
      gap: 10px;
      align-items: center;
    }
    .skill-copy strong,
    .skill-description,
    .mcp-tool-name,
    .mcp-tool-description {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .skill-copy strong,
    .mcp-tool-name {
      font-size: 13px;
      font-weight: 800;
    }
    .skill-description,
    .mcp-tool-description {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .mcp-capability-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      min-width: 0;
      min-height: 44px;
      padding: 5px 7px 5px 5px;
    }
    .mcp-capability-toggle {
      min-width: 0;
      width: 100%;
      border: 0;
      border-radius: 7px;
      background: transparent;
      padding: 9px 10px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      text-align: left;
      cursor: pointer;
    }
    .mcp-capability-toggle:hover {
      background: #f0fdfa;
    }
    .mcp-capability-name,
    .mcp-capability-meta {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.25;
    }
    .mcp-capability-name {
      font-size: 13px;
      font-weight: 800;
    }
    .mcp-capability-meta {
      color: var(--muted);
      font-size: 12px;
    }
    .mcp-capability-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .remove-mcp,
    .remove-skill {
      opacity: 0;
      pointer-events: none;
      color: var(--red);
      border-color: transparent;
      background: transparent;
    }
    .mcp-capability-card:hover .remove-mcp,
    .mcp-capability-card:focus-within .remove-mcp,
    .skill-capability-card:hover .remove-skill,
    .skill-capability-card:focus-within .remove-skill {
      opacity: 1;
      pointer-events: auto;
      border-color: #f1a7a7;
      background: #fef2f2;
    }
    @media (hover: none), (pointer: coarse) {
      .remove-mcp,
      .remove-skill {
        opacity: 1;
        pointer-events: auto;
        border-color: #f1a7a7;
        background: #fef2f2;
      }
    }
    .mcp-capability-tools {
      display: none;
      border-top: 1px solid var(--line);
      padding: 8px;
      background: var(--surface-soft);
    }
    .mcp-capability-card.is-open .mcp-capability-tools {
      display: grid;
      gap: 7px;
    }
    .mcp-tool-row {
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      padding: 8px 9px;
      cursor: pointer;
    }
    .mcp-tool-row:hover {
      border-color: var(--teal);
      background: #f0fdfa;
    }
    .mcp-tool-checkbox {
      justify-self: end;
    }
    @media (max-width: 980px) {
      .owner-attention {
        padding: 18px 14px 0;
      }
      .work-intake {
        padding: 14px 14px 0;
      }
      .context-requests {
        padding: 14px 14px 0;
      }
      .context-request-head {
        flex-direction: column;
      }
      .context-request-answer-grid {
        grid-template-columns: 1fr;
      }
      .context-request-save .action-button {
        width: 100%;
      }
      .work-intake-form {
        gap: 10px;
      }
      .work-intake-chat {
        min-height: 300px;
        max-height: none;
      }
      .work-intake-bubble {
        max-width: 94%;
      }
      .work-intake-fields {
        grid-template-columns: 1fr;
      }
      .work-intake-head {
        align-items: flex-start;
        flex-direction: column;
      }
      .work-intake-badges {
        justify-content: flex-start;
      }
      .work-intake-actions .action-button {
        width: 100%;
      }
      .work-intake-actions {
        flex-direction: column;
      }
      .work-intake-audio-row {
        grid-template-columns: 1fr;
      }
      .projects-view {
        padding: 14px 14px 0;
      }
      .project-section-head {
        flex-direction: column;
      }
      .project-delete-state {
        min-width: 0;
        width: 100%;
        max-width: none;
        text-align: left;
      }
      .project-metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .project-card-actions .quiet-button {
        width: 100%;
      }
      .employee-signal-grid {
        grid-template-columns: 1fr;
      }
      .agent-editor-body {
        grid-template-columns: 1fr;
      }
      .agent-config-card .modal-head .small {
        display: none;
      }
      .agent-editor-rail {
        position: static;
      }
      .agent-editor-nav {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
      }
      .agent-editor-tab-panel.active {
        grid-template-columns: 1fr;
      }
      .agent-memory-grid {
        grid-template-columns: 1fr;
      }
      .mcp-capability-head {
        grid-template-columns: 1fr;
      }
      .mcp-capability-actions {
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      .skill-copy,
      .mcp-tool-copy {
        grid-template-columns: 1fr;
        gap: 2px;
      }
      .card-brief {
        grid-template-columns: 1fr;
      }
      .one-one-body {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto;
        overflow: auto;
      }
      .one-one-sidebar {
        border-right: 0;
        border-bottom: 1px solid var(--line);
        overflow: visible;
      }
      .one-one-main {
        overflow: visible;
      }
      .one-one-mode-tabs {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .one-one-form {
        grid-template-columns: 1fr;
      }
    }
    .evidence-layout {
      grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
      align-items: start;
      overflow: hidden;
    }
    .evidence-index {
      position: sticky;
      top: 0;
      align-self: start;
      min-width: 0;
      max-height: calc(100vh - 20px);
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.82);
      box-shadow: var(--shadow);
      padding: 12px;
    }
    .evidence-index-head {
      margin-bottom: 10px;
    }
    .evidence-index-head h2 {
      margin: 0 0 3px;
      font-size: 14px;
    }
    .evidence-index-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .evidence-index-card {
      width: 100%;
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
      cursor: pointer;
      text-align: left;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 7px;
    }
    .evidence-index-card.active,
    .evidence-index-card:hover {
      border-color: #8bc7bf;
      background: #e7f5f2;
    }
    .evidence-index-card strong {
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .evidence-dossier {
      min-width: 0;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .evidence-dossier > .panel,
    .evidence-dossier .trace-list,
    .evidence-dossier .trace-line,
    .evidence-dossier .mono {
      min-width: 0;
      max-width: 100%;
    }
    .evidence-dossier .trace-line {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .evidence-dossier .wide-panel .trace-line {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .evidence-dossier .trace-line span,
    .evidence-dossier .mono {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .evidence-hero {
      display: grid;
      grid-template-columns: minmax(240px, 1fr) minmax(260px, 0.9fr);
      gap: 16px;
      align-items: start;
    }
    .evidence-hero h2 {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      min-width: 0;
      margin: 0 0 6px;
      overflow-wrap: anywhere;
    }
    .evidence-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
      gap: 8px;
    }
    .evidence-metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 9px 10px;
      min-width: 0;
    }
    .evidence-metric span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.25;
      margin-bottom: 4px;
    }
    .evidence-metric strong {
      display: block;
      font-size: 18px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .evidence-review {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .evidence-review-head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
      min-width: 0;
    }
    .evidence-review-head h2 {
      margin-bottom: 4px;
    }
    .evidence-review-head .small {
      margin: 0;
    }
    .evidence-review-grid {
      display: grid;
      grid-template-columns: minmax(220px, 0.9fr) minmax(200px, 1fr);
      gap: 10px;
      min-width: 0;
    }
    .evidence-review-decision,
    .evidence-review-progress {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 11px;
      min-width: 0;
    }
    .evidence-review-decision {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .evidence-review-decision span,
    .evidence-review-progress span {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.25;
    }
    .evidence-review-decision strong {
      flex: 1 1 180px;
      min-width: 0;
      font-size: 14px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .evidence-review-progress > div:first-child {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .evidence-review-progress strong {
      color: var(--teal);
    }
    .evidence-risk-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .evidence-risk-list li {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px;
      align-items: start;
      min-width: 0;
      font-size: 12px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }
    .evidence-timeline {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .evidence-timeline-item {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      gap: 8px;
      min-width: 0;
    }
    .evidence-dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--teal);
      margin-top: 5px;
      box-shadow: 0 0 0 4px #e7f5f2;
    }
    .evidence-timeline-item strong {
      display: block;
      font-size: 13px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .evidence-timeline-item p {
      margin: 2px 0 0;
    }
    .evidence-task-cell {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .evidence-one-one {
      border-color: #8bc7bf;
      background: #e7f5f2;
      color: var(--teal);
      white-space: normal;
    }
    .tab:not([data-tab="Overview"]) .panel,
    .tab:not([data-tab="Overview"]) .readiness-panel,
    .tab:not([data-tab="Overview"]) .employee-command-panel,
    .tab:not([data-tab="Overview"]) .employee-improvement-panel,
    .tab:not([data-tab="Overview"]) .settings-group,
    .tab:not([data-tab="Overview"]) .evidence-index,
    .tab:not([data-tab="Overview"]) .work-intake-panel,
    .tab:not([data-tab="Overview"]) .project-section-head,
    .tab:not([data-tab="Overview"]) .project-card {
      background: rgba(255,255,255,0.88);
      border-color: rgba(91, 107, 122, 0.18);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.045), var(--inner-highlight);
    }
    .employee-card .capability-counts {
      gap: 5px;
      max-height: 54px;
      overflow: hidden;
    }
    .employee-card .capability-count {
      padding: 3px 7px;
      font-size: 11px;
      line-height: 1.2;
    }
    .employee-card .employee-signal {
      padding: 8px;
    }
    .employee-card .agent-card-actions {
      margin-top: 0;
    }
    .run-id-button {
      display: inline;
      max-width: 100%;
      border: 0;
      background: transparent;
      color: var(--teal);
      padding: 0;
      font: inherit;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      text-align: left;
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
      cursor: pointer;
      overflow-wrap: anywhere;
    }
    .run-id-button:hover,
    .run-id-button:focus-visible {
      color: var(--teal);
      outline: none;
    }
    .run-detail-modal {
      width: min(1120px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow: hidden;
    }
    .run-detail-modal .modal-head {
      align-items: flex-start;
      gap: 12px;
    }
    .run-detail-modal .modal-head h2 {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .run-detail-body {
      max-height: min(72vh, 760px);
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      padding-right: 4px;
    }
    .run-detail-turns {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }
    .run-detail-turns > h3 {
      margin: 0;
      font-size: 13px;
      line-height: 1.3;
    }
    .run-detail-chat {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }
    .run-detail-chat > h3 {
      margin: 0;
      font-size: 13px;
      line-height: 1.3;
    }
    .run-detail-chat-turn {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }
    .run-detail-chat-turn + .run-detail-chat-turn {
      border-top: 1px solid var(--line);
      padding-top: 12px;
    }
    .run-detail-chat-turn-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.3;
    }
    .run-detail-chat-turn-head span {
      color: var(--text);
      font-weight: 750;
    }
    .run-detail-chat-turn-head code {
      font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      overflow-wrap: anywhere;
    }
    .run-detail-chat-message {
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr);
      gap: 9px;
      align-items: start;
      min-width: 0;
    }
    .run-detail-chat-message.assistant {
      grid-template-columns: minmax(0, 1fr) 28px;
    }
    .run-detail-chat-message.assistant .run-detail-chat-avatar {
      grid-column: 2;
      grid-row: 1;
      background: #0f766e;
      color: #fff;
    }
    .run-detail-chat-message.assistant .run-detail-chat-bubble {
      grid-column: 1;
      grid-row: 1;
      justify-self: end;
      background: #eef8f5;
      border-color: #8bc7bf;
    }
    .run-detail-chat-avatar {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: #e5e7eb;
      color: var(--text);
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
    }
    .run-detail-chat-bubble {
      width: min(760px, 100%);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      min-width: 0;
      overflow: hidden;
    }
    .run-detail-chat-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      padding: 7px 9px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.3;
    }
    .run-detail-chat-meta span:first-child {
      color: var(--text);
      font-weight: 750;
    }
    .run-detail-chat-meta strong {
      border: 1px solid #8bc7bf;
      border-radius: 999px;
      background: #e7f5f2;
      color: var(--teal);
      padding: 1px 7px;
      font-size: 10px;
      line-height: 1.4;
    }
    .run-detail-chat-bubble pre {
      margin: 0;
      max-height: 460px;
      overflow: auto;
      padding: 10px;
      color: #111827;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .run-detail-chat-event {
      align-self: stretch;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8fafc;
      min-width: 0;
      overflow: hidden;
    }
    .run-detail-chat-event.tool-executed {
      background: #f6fbf9;
      border-color: #b7ded7;
    }
    .run-detail-chat-event-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--line);
      padding: 8px 10px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.3;
    }
    .run-detail-chat-event-head strong {
      color: var(--text);
      font-size: 12px;
    }
    .run-detail-chat-event-head code {
      margin-left: auto;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      padding: 2px 7px;
      color: var(--text);
      font: 10px/1.3 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .run-detail-raw-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-top: 1px solid var(--line);
      padding: 9px;
      background: #f8fafc;
    }
    .run-detail-turn-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      min-width: 0;
      overflow: hidden;
    }
    .run-detail-turn-card.prefix-changed {
      border-color: #dc2626;
      box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.14);
    }
    .run-detail-turn-head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      border-bottom: 1px solid var(--line);
      background: var(--surface-soft);
      padding: 10px 11px;
      min-width: 0;
      cursor: pointer;
      list-style: none;
    }
    .run-detail-turn-head::-webkit-details-marker {
      display: none;
    }
    .run-detail-turn-head h3 {
      margin: 0;
      font-size: 13px;
      line-height: 1.3;
    }
    .run-detail-turn-head span {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .run-detail-turn-card.prefix-changed .run-detail-turn-head {
      background: #fef2f2;
      border-bottom-color: rgba(220, 38, 38, 0.35);
    }
    .run-detail-prefix-alert {
      border: 1px solid rgba(220, 38, 38, 0.35);
      border-radius: 999px;
      background: #fee2e2;
      color: #991b1b;
      padding: 2px 8px;
      font-size: 11px;
      line-height: 1.3;
      white-space: nowrap;
    }
    .run-detail-turn-body {
      display: flex;
      flex-direction: column;
      gap: 9px;
      padding: 10px;
      min-width: 0;
    }
    .run-detail-turn-card:not([open]) > .run-detail-turn-body {
      display: none;
    }
    .run-detail-cache-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      border: 1px solid #8bc7bf;
      border-radius: 8px;
      background: #e7f5f2;
      padding: 9px 10px;
      min-width: 0;
      font-size: 12px;
      line-height: 1.35;
    }
    .run-detail-cache-row span {
      color: var(--muted);
    }
    .run-detail-cache-row strong {
      color: var(--teal);
    }
    .run-detail-cache-row code {
      margin-left: auto;
      max-width: 100%;
      color: var(--text);
      font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      overflow-wrap: anywhere;
    }
    .run-detail-messages {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .run-detail-messages h4 {
      margin: 0;
      font-size: 12px;
      line-height: 1.3;
    }
    .run-detail-message {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.86);
      min-width: 0;
      overflow: hidden;
    }
    .run-detail-message-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-bottom: 1px solid var(--line);
      background: #f8fafc;
      padding: 8px 10px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.3;
    }
    .run-detail-message-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }
    .run-detail-copy-button {
      padding: 5px 8px;
      font-size: 11px;
      line-height: 1.2;
    }
    .run-detail-message pre {
      margin: 0;
      max-height: 420px;
      overflow: auto;
      padding: 10px;
      color: #1f2937;
      font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .run-detail-json {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.8);
      min-width: 0;
      overflow: hidden;
    }
    .run-detail-json summary {
      cursor: pointer;
      padding: 9px 10px;
      color: var(--text);
      font-size: 12px;
      font-weight: 750;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .run-detail-json pre {
      margin: 0;
      max-height: 420px;
      overflow: auto;
      border-top: 1px solid var(--line);
      background: #f8fafc;
      color: #1f2937;
      padding: 10px;
      font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .run-detail-modal {
      width: min(1280px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      background: #fff;
    }
    .run-detail-head {
      align-items: center;
      padding: 14px 16px;
      background: #fff;
    }
    .run-detail-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .run-detail-title-row .initials {
      flex: 0 0 auto;
      width: 32px;
      height: 32px;
      border-radius: 6px;
    }
    .run-detail-title-row h2 {
      margin: 0;
      font-size: 15px;
      line-height: 1.25;
    }
    .run-detail-title-row .small {
      margin: 2px 0 0;
      max-width: 680px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .run-detail-body {
      max-height: none;
      overflow: hidden;
      padding: 0;
      background: #f9fafb;
    }
    .run-detail-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 336px;
      min-height: 0;
      height: min(72vh, 760px);
    }
    .run-detail-main {
      min-width: 0;
      min-height: 0;
      overflow: auto;
      padding: 14px 16px 18px;
      background: #fff;
      border-right: 1px solid var(--line);
    }
    .run-detail-rail {
      min-width: 0;
      overflow: auto;
      padding: 14px;
      background: #f9fafb;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .run-detail-rail section {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
      min-width: 0;
    }
    .run-detail-rail h3,
    .run-detail-section-title h3 {
      margin: 0;
      color: #111827;
      font-size: 12px;
      font-weight: 750;
      line-height: 1.3;
    }
    .run-detail-section-title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--line);
    }
    .run-detail-section-title span {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.3;
    }
    .run-detail-value-row {
      display: grid;
      grid-template-columns: 84px minmax(0, 1fr);
      gap: 8px;
      padding: 7px 0;
      border-bottom: 1px solid #f3f4f6;
      min-width: 0;
      font-size: 12px;
      line-height: 1.35;
    }
    .run-detail-value-row:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    .run-detail-value-row span {
      color: var(--muted);
    }
    .run-detail-value-row strong {
      min-width: 0;
      color: #111827;
      font-weight: 650;
      overflow-wrap: anywhere;
    }
    .run-detail-value-row .mono,
    .run-detail-rounds code,
    .run-detail-events code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      font-weight: 500;
    }
    .run-detail-rounds,
    .run-detail-events {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    .run-detail-rounds li,
    .run-detail-events li {
      display: grid;
      grid-template-columns: minmax(0, 0.78fr) minmax(0, 1fr);
      gap: 8px;
      align-items: start;
      min-width: 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .run-detail-events li {
      grid-template-columns: minmax(72px, 0.42fr) minmax(0, 1fr);
    }
    .run-detail-rounds code,
    .run-detail-events code {
      min-width: 0;
      color: #111827;
      overflow-wrap: anywhere;
      white-space: normal;
    }
    .run-detail-chat {
      gap: 0;
    }
    .run-detail-chat-turn {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 0 16px 28px;
      border-top: 0;
    }
    .run-detail-chat-turn + .run-detail-chat-turn {
      border-top: 1px solid #f3f4f6;
    }
    .run-detail-chat-turn::before {
      content: "";
      position: absolute;
      left: 9px;
      top: 20px;
      bottom: 0;
      width: 1px;
      background: #e5e7eb;
    }
    .run-detail-chat-turn::after {
      content: "";
      position: absolute;
      left: 5px;
      top: 18px;
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: #0d9488;
      box-shadow: 0 0 0 3px #e7f5f2;
    }
    .run-detail-chat-turn-head {
      justify-content: flex-start;
      gap: 8px;
      color: var(--muted);
      font-size: 11px;
    }
    .run-detail-cache-pill {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      color: var(--muted);
      padding: 2px 6px;
      font-size: 11px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .run-detail-cache-pill.hit {
      border-color: #99d8cf;
      background: #ecfdf7;
      color: #0f766e;
    }
    .run-detail-chat-message,
    .run-detail-chat-message.assistant {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      gap: 8px;
      align-items: start;
      max-width: 100%;
    }
    .run-detail-chat-message.assistant .run-detail-chat-avatar {
      grid-column: 1;
      grid-row: 1;
      background: #0d9488;
      color: #fff;
    }
    .run-detail-chat-message.assistant .run-detail-chat-bubble {
      grid-column: 2;
      grid-row: 1;
      justify-self: stretch;
      background: #fff;
      border-color: var(--line);
    }
    .run-detail-chat-avatar {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      font-size: 10px;
    }
    .run-detail-chat-bubble {
      width: 100%;
      border-radius: 8px;
      box-shadow: none;
    }
    .run-detail-chat-meta {
      padding: 7px 9px;
      background: #f9fafb;
    }
    .run-detail-chat-meta strong {
      border-radius: 6px;
      padding: 1px 6px;
    }
    .run-detail-chat-meta strong.is-live::after {
      content: "";
      display: inline-block;
      width: 5px;
      height: 12px;
      margin-left: 5px;
      vertical-align: -2px;
      background: #0d9488;
      animation: run-detail-caret 1s steps(2, start) infinite;
    }
    @keyframes run-detail-caret {
      50% { opacity: 0; }
    }
    .run-detail-chat-bubble pre {
      max-height: 300px;
      padding: 10px 11px;
      background: #fff;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .run-detail-chat-event {
      margin-left: 32px;
      border-radius: 8px;
      background: #fff;
    }
    .run-detail-chat-event.tool-executed {
      background: #fff;
      border-color: #99d8cf;
    }
    .run-detail-chat-event-head {
      padding: 7px 9px;
      background: #f9fafb;
    }
    .run-detail-chat-event-head code {
      margin-left: 0;
      border-radius: 6px;
    }
    .run-detail-tool-summary {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr);
      gap: 8px;
      padding: 8px 9px;
      border-bottom: 1px solid #f3f4f6;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .run-detail-tool-summary code {
      min-width: 0;
      color: #111827;
      font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .run-detail-json {
      border-width: 0;
      border-top: 1px solid #f3f4f6;
      border-radius: 0;
      background: #fff;
    }
    .run-detail-json summary {
      padding: 7px 9px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 650;
    }
    .run-detail-json pre {
      max-height: 260px;
      background: #f9fafb;
    }
    .run-detail-loading {
      padding: 16px;
      background: #fff;
    }
    .run-detail-footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 10px 16px;
      border-top: 1px solid var(--line);
      background: #fff;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .run-detail-footer code {
      margin-left: auto;
      max-width: 100%;
      color: #111827;
      font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      overflow-wrap: anywhere;
    }
    .live-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #0d9488;
      box-shadow: 0 0 0 3px #e7f5f2;
    }
    .working-agents-panel {
      padding: 14px 28px 0;
    }
    .working-agents,
    .working-agents-empty {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.78);
      box-shadow: var(--shadow);
      padding: 13px 14px;
      min-width: 0;
    }
    .working-agents-title,
    .working-agent-head {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }
    .working-agents-title h2,
    .working-agents-empty h2 {
      margin: 0;
      font-size: 14px;
      line-height: 1.3;
    }
    .working-agents-empty p {
      margin: 4px 0 0;
    }
    .working-agent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
      gap: 10px;
      margin-top: 11px;
      min-width: 0;
    }
    .working-agent-card {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 11px;
      width: 100%;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .working-agent-card:hover {
      border-color: var(--orange);
      box-shadow: 0 8px 20px rgba(16, 24, 40, 0.10);
    }
    .working-agent-head {
      align-items: flex-start;
    }
    .working-agent-head > div {
      min-width: 0;
      flex: 1 1 auto;
    }
    .working-agent-head strong,
    .working-agent-head span {
      display: block;
      overflow-wrap: anywhere;
      line-height: 1.25;
    }
    .working-agent-head > div > span {
      margin-top: 2px;
      color: var(--muted);
      font-size: 12px;
    }
    .working-agent-card p {
      margin: 9px 0 5px;
      font-size: 13px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .work-card {
      transition: transform 420ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms ease, border-color 220ms ease;
      will-change: transform;
    }
    .work-card.moving {
      z-index: 7;
      box-shadow: 0 10px 24px rgba(16, 24, 40, 0.14);
    }
    .work-card.entered {
      animation: card-enter 360ms ease-out both;
    }
    @keyframes card-enter {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 980px) {
      .one-one-body {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(260px, 1fr);
      }
      .one-one-sidebar {
        max-height: 34vh;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
      .one-one-mode-tabs {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .one-one-form {
        grid-template-columns: 1fr;
      }
      .working-agents-panel {
        padding: 12px 14px 0;
      }
      .evidence-layout {
        grid-template-columns: 1fr;
      }
      .evidence-index {
        position: static;
        max-height: none;
      }
      .evidence-dossier {
        grid-template-columns: 1fr;
      }
      .evidence-hero {
        grid-template-columns: 1fr;
      }
      .evidence-review-grid,
      .evidence-risk-list li {
        grid-template-columns: 1fr;
      }
      .evidence-task-cell {
        align-items: stretch;
      }
      .evidence-one-one {
        width: 100%;
      }
      .run-detail-modal {
        width: calc(100vw - 18px);
        max-height: calc(100vh - 18px);
      }
      .run-detail-body {
        max-height: calc(100vh - 148px);
      }
      .run-detail-shell {
        grid-template-columns: 1fr;
        height: calc(100vh - 154px);
        overflow: auto;
      }
      .run-detail-main {
        overflow: visible;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
      .run-detail-rail {
        overflow: visible;
      }
      .run-detail-title-row .small {
        white-space: normal;
      }
      .run-detail-chat-event {
        margin-left: 0;
      }
    }
    @media (max-width: 600px) {
      .overview-main-stack > .board {
        gap: 10px;
      }
      .column {
        padding: 10px;
      }
      .column-head {
        margin-bottom: 7px;
      }
      .cards {
        gap: 8px;
      }
      .empty {
        min-height: 38px;
        padding: 8px;
      }
      .work-card {
        padding: 10px;
      }
      .work-card-brief,
      .work-card .agent-row,
      .work-card .steps {
        gap: 4px;
      }
    }
`;
