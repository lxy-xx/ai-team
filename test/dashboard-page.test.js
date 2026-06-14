import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { lastAgentMemoryDraftText } from "../src/fe/dashboard/dashboard-client-js.js";
import { WORK_CARD_PAPERCLIP_DATA_URI } from "../src/fe/dashboard/dashboard-assets.js";
import { DASHBOARD_I18N } from "../src/fe/dashboard/dashboard-i18n.js";
import { renderDashboardLoginPage, renderDashboardPage } from "../src/fe/dashboard/dashboard-page.js";
import { renderArchitecturePage } from "../src/fe/architecture/architecture-page.js";

const removedUiField = "miss" + "ion";
const removedCardClipFunction = "card" + "ClipSvg";
const removedCardClipSelector = ".card" + "-clip";
const removedInlineClipSvg = '<svg class="' + "clip-" + 'svg"';
const removedClipMain = "clip-" + "main";
const removedClipHighlight = "clip-" + "highlight";
const removedClipShadow = "clip-" + "shadow";
const removedClipMetal = "--clip-" + "metal";
const removedClipDark = "--clip-" + "dark";

function baseDashboardData() {
  return {
    nav: ["Overview", "Team", "Evidence", "Intake", "Projects", "Settings"],
    filters: ["All", "Franklin", "Darwin", "Ada", "Turing"],
    counts: { items: 0 },
    columns: [],
    agents: [],
    engine: { snapshot: {}, health: {} },
    projects: [
      {
        id: "project_demo",
        name: "AI Team Dashboard",
        slug: "ai-team-dashboard",
        status: "active",
        counts: { intents: 1, tasks: 1, runs: 1, artifacts: 1, feedback: 0 },
        updatedAt: "2026-05-20T01:00:00.000Z"
      }
    ],
    agentConfigs: {
      agents: [
        {
          role: "engineer",
          name: "Ada",
          title: "Coding Engineer",
          prompt: "Build carefully.",
          skills: [{ id: "patching", description: "修改代码并说明影响。", path: "/tmp/Ada/.agents/skills/patching/SKILL.md" }],
          mcps: [
            {
              id: "github",
              tools: [
                {
                  id: "github.search_issues",
                  name: "search_issues",
                  serverId: "github",
                  risk: "medium",
                  description: "Search GitHub issues."
                }
              ],
              configJson: JSON.stringify({
                mcpServers: {
                  github: {
                    url: "https://example.com/mcp",
                    tools: [{ name: "search_issues", description: "Search GitHub issues." }]
                  }
                }
              }, null, 2)
            }
          ],
          tools: ["Bash", "github.search_issues"],
          modelProvider: { providerId: "codex", model: "gpt-5.5" },
          memory: {
            factCount: 2,
            playbookCount: 1,
            hasRecentSummary: true,
            hasCoachingJournal: true,
            openContextNeedCount: 1,
            recentSummaryPreview: "# Recent Agent Events\n\n- One one coaching: User taught Ada to ask for missing context before execution.",
            coachingJournalPreview: "# Recent One One Coaching\n\n- One one coaching: User taught Ada to ask for missing context before execution.",
            contextNeeds: [{
              id: "need_1",
              status: "open",
              priority: "high",
              category: "acceptance",
              question: "Which examples define done?",
              whyItMatters: "Prevents rework.",
              suggestedMemoryKind: "fact",
              relatedTaskId: "task_demo",
              sourceMode: "context_audit"
            }],
            facts: [{ key: "repo.boundary", text: "TeamEngine owns lifecycle transitions." }],
            playbooks: [{ key: "qa.loop", text: "Ask QA to verify rejected tasks." }]
          },
          wakeRules: [{ entityType: "task", status: "waiting", consumerRole: "engineer", afterRunStatus: "testing" }]
        }
      ],
      tools: [
        {
          id: "Bash",
          risk: "high",
          description: "Run Bash commands.",
          descriptionZh: "运行 Bash 命令。"
        }
      ]
    },
    contextRequests: {
      total: 1,
      items: [
        {
          id: "need_1",
          role: "engineer",
          agentName: "Ada",
          agentTitle: "Coding Engineer",
          status: "open",
          priority: "high",
          category: "acceptance",
          question: "Which examples define done?",
          whyItMatters: "Prevents rework.",
          suggestedMemoryKind: "fact",
          relatedTaskId: "task_demo",
          sourceMode: "context_audit",
          action: { label: "Open one one", target: "one_one:engineer", contextNeedId: "need_1" }
        }
      ]
    },
    ownerAttention: {
      status: "needs_attention",
      total: 2,
      counts: { critical: 0, high: 2, medium: 0, low: 0 },
      items: [
        {
          id: "context:need_1",
          kind: "context_request",
          severity: "high",
          title: "Which examples define done?",
          reason: "Prevents rework.",
          meta: "Ada · acceptance",
          role: "engineer",
          contextNeedId: "need_1",
          action: { label: "Open one one", target: "one_one:engineer:need_1" }
        },
        {
          id: "qa:task_demo",
          kind: "qa_loop",
          severity: "high",
          title: "QA rework loop",
          reason: "1 QA reject and 1 rework round.",
          meta: "task_demo",
          intentId: "intent_demo",
          action: { label: "Open evidence", target: "evidence:intent_demo" }
        }
      ]
    },
    employeeImprovementPlan: {
      status: "needs_attention",
      total: 2,
      affectedEmployees: 1,
      counts: {
        byKind: { context_request: 1, qa_loop: 1 },
        bySeverity: { critical: 0, high: 2, medium: 0, low: 0 }
      },
      items: [
        {
          id: "context:engineer:need_1",
          kind: "context_request",
          severity: "high",
          role: "engineer",
          agentName: "Ada",
          agentTitle: "Coding Engineer",
          title: "Which examples define done?",
          reason: "Prevents rework.",
          meta: "acceptance · task_demo",
          contextNeedId: "need_1",
          taskId: "task_demo",
          gapId: "open_context_needs",
          promptKey: "employee.improvement.prompt.contextRequest",
          values: { question: "Which examples define done?", reason: "Prevents rework.", taskId: "task_demo" },
          action: { kind: "one_one", target: "one_one:engineer:need_1", label: "Coach in one one" }
        },
        {
          id: "qa:task_demo",
          kind: "qa_loop",
          severity: "high",
          role: "engineer",
          agentName: "Ada",
          agentTitle: "Coding Engineer",
          titleKey: "employee.improvement.qaLoopTitle",
          reasonKey: "ownerAttention.qaLoopReason",
          values: { rejectCount: 1, reworkRounds: 1, taskId: "task_demo" },
          meta: "task_demo · engineer",
          intentId: "intent_demo",
          taskId: "task_demo",
          promptKey: "employee.improvement.prompt.qaLoop",
          action: { kind: "one_one", target: "one_one:engineer:qa:task_demo", label: "Coach in one one" }
        }
      ]
    },
    modelProviders: {
      defaultProviderId: "codex",
      providers: [
        { id: "codex", name: "Codex Subscription", type: "codex_app_server", authMode: "subscription", codexBin: "codex", models: ["gpt-5.5"], defaultModel: "gpt-5.5" },
        { id: "deepseek", name: "DeepSeek", type: "openai_compatible", provider: "deepseek", authMode: "api_key", apiKeyEnv: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com", models: ["deepseek-chat", "deepseek-reasoner"], defaultModel: "deepseek-chat" }
      ]
    },
    codingAgentLaunchers: [{
      commandTemplate: "codex exec --cd {{workspace}} {{prompt}}",
      timeoutMs: 900000
    }],
    knowledge: { facts: [], recentEvents: [] },
    reports: {},
    channels: [],
    settings: { toolPolicy: {}, pollIntervalMs: 5000, feedbackScanIntervalMs: 14_400_000 }
  };
}

function readinessDashboardData() {
  const data = baseDashboardData();
  data.readiness = {
    overall: "needs_setup",
    items: [
      { id: "admin_access", label: "Admin access", status: "ready", reason: "Local or token-protected writes are available." },
      { id: "default_provider", label: "Default Provider", status: "ready", reason: "Codex Subscription is the default Provider.", action: { label: "Check Provider", target: "provider:codex" } },
      { id: "provider_check", label: "Provider check", status: "not_checked", reason: "Run a Provider check before the demo.", action: { label: "Check Provider", target: "provider:codex" } },
      { id: "agent_binding", label: "Agent binding", status: "ready", reason: "At least one Agent has a Provider and model." },
      { id: "one_on_one_smoke", label: "one one smoke", status: "not_checked", reason: "Run a short direct Agent turn.", action: { label: "Run smoke test", target: "smoke:engineer" } },
      { id: "channel_readiness", label: "Channel readiness", status: "skipped", reason: "Feishu is disabled for local demo." }
    ]
  };
  return data;
}

test("dashboard shell uses simplified IA sections", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /id="languageSwitch"/);
  assert.match(html, /data-locale-option="zh"/);
  assert.match(html, /data-locale-option="en"/);
  assert.match(html, /data-tab="Overview"/);
  assert.match(html, /data-tab="Team"/);
  assert.match(html, /data-tab="Evidence"/);
  assert.match(html, /data-tab="Projects"/);
  assert.match(html, /data-tab="Intake"/);
  assert.match(html, /data-tab="Settings"/);
  assert.match(html, /id="projects"/);
  assert.match(html, /id="workIntake"/);
  assert.match(html, /id="ownerAttention"/);
  assert.match(html, /id="contextRequests"/);
  assert.match(html, /id="board"/);
  assert.doesNotMatch(html, /id="overviewReadiness"/);
  assert.match(html, /<div class="overview-layout"><div class="overview-main-stack"><div class="owner-attention-row">[\s\S]*id="ownerAttention"[\s\S]*<div class="board" id="board"><\/div><\/div><aside class="overview-employee-rail"><div class="working-agents-panel" id="workingAgentsPanel"><\/div><div class="context-requests" id="contextRequests"><\/div><\/aside><\/div>/);
  assert.match(html, /--sidebar-width:\s*248px/);
  assert.match(html, /\.overview-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(280px,\s*320px\)/s);
  assert.match(html, /\.overview-layout\s*\{[^}]*align-items:\s*stretch;[^}]*min-height:\s*calc\(100vh - 56px\);/s);
  assert.match(html, /\.overview-main-stack\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
  assert.match(html, /\.owner-attention-row \.owner-attention-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(260px,\s*100%\),\s*1fr\)\);/s);
  assert.doesNotMatch(html, /\.owner-attention-row \.owner-attention-grid\s*\{[^}]*grid-auto-flow:\s*column/s);
  assert.match(html, /\.overview-employee-rail\s*\{[^}]*grid-template-rows:\s*auto auto/s);
  assert.match(html, /\.overview-employee-rail\s*\{[^}]*align-self:\s*stretch;[^}]*min-height:\s*calc\(100vh - 100px\);/s);
  assert.match(html, /\.overview-employee-rail\s*\{[^}]*background:\s*linear-gradient\(180deg,\s*rgba\(239,\s*244,\s*247,\s*0\.72\),\s*rgba\(249,\s*251,\s*252,\s*0\.5\)\);/s);
  assert.match(html, /\.overview-employee-rail\s*\{[^}]*border-left:\s*1px solid rgba\(91,\s*107,\s*122,\s*0\.22\);/s);
  assert.match(html, /\.overview-employee-rail \.working-agents,\s*\.overview-employee-rail \.working-agents-empty,\s*\.overview-employee-rail \.context-request-panel\s*\{[^}]*background:\s*rgba\(255,255,255,0\.78\);/s);
  assert.match(html, /\.overview-employee-rail \.context-request-panel\s*\{[^}]*max-height:\s*min\(520px,\s*calc\(100vh - 184px\)\);/s);
  assert.match(html, /\.overview-main-stack > \.board\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(210px,\s*100%\),\s*1fr\)\);/s);
  assert.doesNotMatch(html, /overview-workspace/);
  assert.doesNotMatch(html, /overview-command-band/);
  assert.match(html, /\.topbar\s*\{[^}]*position:\s*fixed/s);
  assert.match(html, /@media \(max-width:\s*980px\)[\s\S]*main,\s*\.subbar\s*\{[^}]*margin-left:\s*0;/);
  assert.match(html, /@media \(max-width:\s*980px\)[\s\S]*\.overview-layout\s*\{[^}]*align-items:\s*start;[^}]*min-height:\s*0;/);
  assert.match(html, /@media \(max-width:\s*980px\)[\s\S]*\.overview-employee-rail\s*\{[^}]*border-left:\s*0;[^}]*border-top:\s*1px solid rgba\(91,\s*107,\s*122,\s*0\.2\);/);
  assert.match(html, /@media \(max-width:\s*600px\)[\s\S]*\.nav\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(html, /@media \(max-width:\s*600px\)[\s\S]*\.overview-main-stack\s*\{[^}]*display:\s*contents;/);
  assert.match(html, /@media \(max-width:\s*600px\)[\s\S]*\.overview-employee-rail\s*\{[^}]*order:\s*2;/);
  assert.match(html, /@media \(max-width:\s*600px\)[\s\S]*\.overview-main-stack > \.board\s*\{[^}]*order:\s*3;/);
  assert.match(html, /\.tab:not\(\[data-tab="Overview"\]\)\s*\{[^}]*background:\s*linear-gradient\(180deg,\s*rgba\(247,\s*250,\s*252,\s*0\.82\),\s*rgba\(243,\s*246,\s*248,\s*0\.96\)\);/s);
  assert.match(html, /--blue:\s*#0f766e;/);
  assert.match(html, /\.action-button\.primary\s*\{[^}]*background:\s*linear-gradient\(135deg,\s*#0f766e,\s*#0b6f68\);/s);
  assert.match(html, /\.tab\[data-tab="Team"\] > \.panel-grid,[\s\S]*\.tab\[data-tab="Projects"\]\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*margin:\s*0;[^}]*padding:\s*20px 24px 30px;/s);
  assert.match(html, /\.employee-card > \.small\s*\{[^}]*-webkit-line-clamp:\s*3;/s);
  assert.match(html, /\.evidence-dossier \.trace-line\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s);
  assert.match(html, /\.evidence-index\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*max-height:\s*calc\(100vh - 20px\);/s);
  assert.match(html, /id="settingsReadiness"/);
  assert.match(html, /class="panel-grid employee-config" id="agentConfig"/);
  assert.match(html, /id="agentConfig"/);
  assert.doesNotMatch(html, /id="team"/);
  assert.match(html, /id="intentDetail"/);
  assert.doesNotMatch(html, /<div class="panel-grid" id="runs"><\/div>/);
  assert.doesNotMatch(html, /<div class="panel-grid" id="knowledge"><\/div>/);
  assert.doesNotMatch(html, /<div class="panel-grid" id="feedbackLoop"><\/div>/);
  assert.doesNotMatch(html, /data-tab="Work Board"/);
  assert.doesNotMatch(html, /data-tab="Agents"/);
  assert.doesNotMatch(html, /data-tab="Project Detail"/);
  assert.doesNotMatch(html, /data-tab="Intent Detail"/);
  assert.doesNotMatch(html, /data-tab="Feedback Loop"/);
  assert.doesNotMatch(html, /data-tab="Runs"/);
  assert.doesNotMatch(html, /data-tab="Clients"/);
  assert.doesNotMatch(html, /data-tab="Reports"/);
  assert.doesNotMatch(html, /data-tab="Knowledge"/);
  assert.doesNotMatch(html, /href="\/architecture"/);
});

test("dashboard Projects tab renders project cards without workspace paths and supports deletion", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /function renderProjects/);
  assert.match(html, /project-card-grid/);
  assert.match(html, /project-card/);
  assert.match(html, /data-delete-project/);
  assert.match(html, /\/api\/engine\/projects\/"\s*\+\s*encodeURIComponent\(projectId\)/);
  assert.match(html, /method: "DELETE"/);
  assert.match(html, /AI Team Dashboard/);
  assert.doesNotMatch(html, /\/tmp\/ai-team-projects/);
});

test("dashboard and architecture pages use copyright-safe local typography", () => {
  const dashboardHtml = renderDashboardPage(baseDashboardData());
  const architectureHtml = renderArchitecturePage();
  const combinedHtml = dashboardHtml + architectureHtml;

  assert.doesNotMatch(combinedHtml, /fonts\.googleapis\.com/);
  assert.doesNotMatch(combinedHtml, /fonts\.gstatic\.com/);
  assert.doesNotMatch(combinedHtml, /\b(?:Inter|Geist|Instrument Serif)\b/);
  assert.match(combinedHtml, /system-ui/);
  assert.match(combinedHtml, /ui-monospace/);
});

test("dashboard Settings renders setup readiness panel", () => {
  const html = renderDashboardPage(readinessDashboardData());

  assert.match(html, /Setup Readiness/);
  assert.match(html, /readiness-panel/);
  assert.match(html, /Default Provider/);
  assert.match(html, /Run smoke test/);
  assert.match(html, /Check Provider/);
  assert.match(html, /data-readiness-action/);
  assert.match(html, /provider:codex/);
  assert.match(html, /smoke:engineer/);
  assert.match(html, /\/ai-team\/api\/agents\/"\s*\+\s*encodeURIComponent\(value\)\s*\+\s*"\/one-one-smoke/);
  assert.match(html, /const lastActionResult = sanitizeReadinessResult/);
  assert.match(html, /await refresh\(\);\n\s*state\.data\.readiness = state\.data\.readiness \|\| \{\};\n\s*state\.data\.readiness\.lastActionResult = lastActionResult/);
  assert.match(html, /const previousReadinessResult = state\.data\.readiness\?\.lastActionResult/);
  assert.match(html, /readinessHasAction\(previousReadinessResult\.action\)/);
  assert.match(html, /function readinessHasAction/);
  assert.match(html, /function redactReadinessText/);
  assert.match(html, /authorization/);
  assert.match(html, /ACCESS\[-_\]\?KEY/);
  assert.match(html, /Authorization\|X-Api-Key\|Api-Key/);
  assert.match(html, /Bearer \[redacted\]/);
});

test("dashboard Overview does not render a standalone setup readiness panel", () => {
  const html = renderDashboardPage(readinessDashboardData());

  assert.doesNotMatch(html, /function shouldShowReadinessTarget/);
  assert.doesNotMatch(html, /renderReadinessTarget\("overviewReadiness"\)/);
  assert.match(html, /renderReadinessTarget\("settingsReadiness"\)/);
});

test("dashboard Overview renders owner attention command layer", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /function renderOwnerAttention/);
  assert.match(html, /state\.data\.ownerAttention\?\.items/);
  assert.match(html, /ownerAttention\.title/);
  assert.match(html, /owner-attention-panel/);
  assert.match(html, /owner-attention-card/);
  assert.match(html, /data-owner-attention-action/);
  assert.match(html, /feedback_done:/);
  assert.match(html, /function markOwnerFeedbackHandled/);
  assert.match(html, /\/ai-team\/api\/engine\/feedback\/"\s*\+\s*encodeURIComponent\(feedbackId\)\s*\+\s*"\/resolve/);
  assert.match(html, /openContextRequestOneOne\(role, needId\)/);
  assert.match(html, /openEvidenceDossier\(value\)/);
  assert.match(html, /setDashboardTab\("Settings"\)/);
  assert.equal(DASHBOARD_I18N.en["ownerAttention.title"], "Owner attention");
  assert.equal(DASHBOARD_I18N.zh["ownerAttention.title"], "负责人注意力");
  assert.equal(DASHBOARD_I18N.en["ownerAttention.countOne"], "1 signal");
  assert.equal(DASHBOARD_I18N.en["action.Mark handled"], "Mark handled");
  assert.equal(DASHBOARD_I18N.zh["action.Mark handled"], "标记已处理");
  assert.equal(DASHBOARD_I18N.en["status.needs_attention"], "Needs attention");
  assert.equal(DASHBOARD_I18N.zh["status.high"], "高");
});

test("dashboard Overview owner attention cards compact duplicate raw feedback text", () => {
  const html = renderDashboardPage(baseDashboardData());
  const ownerSource = sourceBetween(html, "function ownerAttentionItems", "async function markOwnerFeedbackHandled");

  assert.match(ownerSource, /function compactOwnerAttentionSummary/);
  assert.match(ownerSource, /function ownerAttentionReasonIsDuplicate/);
  assert.match(ownerSource, /Outcome:/);
  assert.match(ownerSource, /const displayTitle = compactOwnerAttentionSummary\(ownerAttentionTitle\(item\)/);
  assert.match(ownerSource, /const reasonIsDuplicate = ownerAttentionReasonIsDuplicate\(displayTitle, displayReason\)/);
  assert.match(ownerSource, /reasonIsDuplicate \? "" :/);
});

test("dashboard Overview renders Agent context request queue", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /function renderContextRequests/);
  assert.match(html, /function contextRequests/);
  assert.match(html, /state\.data\.contextRequests\?\.items/);
  assert.match(html, /contextRequests\.title/);
  assert.match(html, /contextRequests\.subtitle/);
  assert.match(html, /data-context-request-one-one/);
  assert.match(html, /function openContextRequestOneOne/);
  assert.match(html, /setActiveOneOneContextNeedId\(role, needId\)/);
  assert.match(html, /state\.oneOneMode\[role\] = "needs"/);
  assert.match(html, /openAgentChat\(role\)/);
  assert.match(html, /function contextRequestDraftKey/);
  assert.match(html, /function contextRequestPayload/);
  assert.match(html, /function contextRequestStatus/);
  assert.match(html, /context-request-answer/);
  assert.match(html, /context-request-memory-kind/);
  assert.match(html, /context-request-memory-key/);
  assert.match(html, /save-context-request-memory/);
  assert.match(html, /state\.contextRequestStatus/);
  assert.match(html, /\/api\/agents\/" \+ encodeURIComponent\(request\.role\) \+ "\/memory/);
  assert.match(html, /contextNeedId: request\.id/);
  assert.match(html, /await refresh\(\{ force: true \}\)/);
  assert.match(html, /renderContextRequests\(\)/);
  assert.match(html, /context-request-card/);
  assert.match(html, /context-request-agent/);
  assert.match(html, /"\.context-request-panel"/);
  assert.match(html, /\.context-request-list\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(360px,\s*100%\),\s*1fr\)\);/s);
  assert.match(html, /\.context-request-answer-grid\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(html, /\.context-request-answer-actions\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(150px,\s*100%\),\s*1fr\)\);/s);
  assert.match(html, /\.context-request-answer-actions > \*\s*\{[^}]*min-width:\s*0;/s);
  assert.match(html, /\.context-request-save \.action-button\s*\{[^}]*white-space:\s*normal;/s);
  assert.match(html, /errorKey: "contextRequests\.required"/);
  assert.doesNotMatch(html, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(128px,\s*0\.18fr\)\s+minmax\(150px,\s*0\.24fr\)\s+auto/);
  assert.equal(DASHBOARD_I18N.en["contextRequests.title"], "Employee context requests");
  assert.equal(DASHBOARD_I18N.zh["contextRequests.title"], "员工上下文请求");
  assert.equal(DASHBOARD_I18N.en["contextRequests.openOneOne"], "Open one one");
  assert.equal(DASHBOARD_I18N.zh["contextRequests.openOneOne"], "打开 one one");
  assert.equal(DASHBOARD_I18N.en["contextRequests.answerLabel"], "Answer");
  assert.equal(DASHBOARD_I18N.zh["contextRequests.saveMemory"], "保存为记忆");
});

test("dashboard renders default CEO channel chat intake as a separate tab", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /<section class="tab" data-tab="Intake"><div class="work-intake" id="workIntake"><\/div><\/section>/);
  assert.match(html, /function renderWorkIntake/);
  assert.match(html, /function loadDefaultCeoChannel/);
  assert.match(html, /function renderWorkIntakeBubble/);
  assert.match(html, /function workIntakeHasFocusedControl/);
  assert.match(html, /function refreshWorkIntakeMessages/);
  assert.match(html, /function readAudioFile/);
  assert.match(html, /function clearWorkIntakeTransientError/);
  assert.match(html, /function setWorkIntakeText/);
  assert.match(html, /workIntakeText/);
  assert.match(html, /CEO Conversation/);
  assert.match(html, /Synced with the default Channel context/);
  assert.match(html, /\/api\/dashboard\/default-channel/);
  assert.match(html, /\/api\/dashboard\/default-channel\/messages/);
  assert.match(html, /\/api\/dashboard\/default-channel\/reset/);
  assert.match(html, /workIntakeAudio/);
  assert.match(html, /copy\("Write a message or upload audio first\."\)/);
  assert.match(html, /clearWorkIntakeTransientError\(\)/);
  assert.match(html, /workIntakeStatus/);
  assert.match(html, /renderWorkIntake\(\)/);
  assert.doesNotMatch(html, /workIntakeAcceptance/);
  assert.doesNotMatch(html, /work-intake-quality/);
  assert.doesNotMatch(html, /acceptanceCriteria: workIntakeArrayField/);
});

test("dashboard Settings puts setup readiness before runtime details", () => {
  const html = renderDashboardPage(readinessDashboardData());

  assert.match(html, /<section class="tab" data-tab="Settings"><div class="overview-readiness settings-readiness" id="settingsReadiness"><\/div><div class="panel-grid" id="settings">/);
  assert.match(html, /renderReadinessTarget\("settingsReadiness"\)/);
});

test("dashboard client maps old tab aliases to simplified IA", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /tab:\s*"Overview"/);
  assert.match(html, /function normalizeTab/);
  assert.match(html, /"Work Board":\s*"Overview"/);
  assert.match(html, /Agents:\s*"Team"/);
  assert.match(html, /Employees:\s*"Team"/);
  assert.match(html, /"Start Work":\s*"Intake"/);
  assert.match(html, /"Intent Detail":\s*"Evidence"/);
  assert.match(html, /Runs:\s*"Evidence"/);
  assert.match(html, /Knowledge:\s*"Evidence"/);
  assert.match(html, /"Feedback Loop":\s*"Evidence"/);
  assert.match(html, /state\.tab === "Overview" \? t\("view\.allWork"\) : navLabel\(state\.tab\)/);
  assert.doesNotMatch(html, /state\.filter === "All" \|\| state\.filter === "This week"/);
});

test("dashboard client keeps navigation state in the URL for browser back", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /function syncDashboardRoute/);
  assert.match(html, /function applyDashboardRouteFromLocation/);
  assert.match(html, /window\.addEventListener\("popstate"/);
  assert.match(html, /history\.pushState/);
  assert.match(html, /history\.replaceState/);
  assert.match(html, /setDashboardTab\(button\.dataset\.tab\)/);
  assert.match(html, /setDashboardFilter\(button\.dataset\.filter\)/);
  assert.match(html, /const bootEvidenceId = bootParams\.get\("evidence"\) \|\| bootParams\.get\("intent"\)/);
  assert.match(html, /const bootRunId = bootParams\.get\("run"\)/);
  assert.match(html, /openRunDetail\(bootRunId, \{ updateRoute: false \}\)/);
});

test("dashboard realtime updates do not rerender Evidence run detail", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /function renderDashboardChrome/);
  assert.match(html, /function renderRealtimeDashboardData/);
  assert.match(html, /if \(force\) \{\s*render\(\);\s*return;\s*\}/);
  assert.match(html, /if \(state\.tab === "Overview"\)/);
  assert.match(html, /renderBoard\(\);\s*renderOwnerAttention\(\);\s*renderContextRequests\(\);\s*renderWorkingAgents\(\);\s*renderWorkIntake\(\);/);
  assert.match(html, /applyDashboardData\(await response\.json\(\), \{ force \}\)/);
});

test("dashboard employee filter only scopes active work lanes", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /const FILTERABLE_WORK_COLUMN_IDS = new Set\(\["working", "testing"\]\)/);
  assert.match(html, /function columnUsesEmployeeFilter/);
  assert.match(html, /matchesFilter\(item, column\.id\)/);
  assert.doesNotMatch(html, /const visible = \(column\.items \|\| \[\]\)\.filter\(matchesFilter\)/);
});

test("dashboard login page asks only for the admin token and hides dashboard data", () => {
  const html = renderDashboardLoginPage({ next: "/ai-team/console/dashboard?tab=Settings", error: "Invalid token" });

  assert.match(html, /AI Team Dashboard Login/);
  assert.match(html, /name="token"/);
  assert.match(html, /type="password"/);
  assert.match(html, /name="next" value="\/ai-team\/console\/dashboard\?tab=Settings"/);
  assert.match(html, /action="\/ai-team\/console\/dashboard\/login"/);
  assert.match(html, /Invalid token/);
  assert.doesNotMatch(html, /__DASHBOARD_DATA__/);
  assert.doesNotMatch(html, /Team Engine/);
});

test("dashboard rendered pages use ai-team console and API paths", () => {
  const dashboardHtml = renderDashboardPage(baseDashboardData());
  const loginHtml = renderDashboardLoginPage({ tokenMode: "default" });
  const architectureHtml = renderArchitecturePage();

  assert.match(dashboardHtml, /\/ai-team\/api\/dashboard\/ws/);
  assert.match(dashboardHtml, /postJson\("\/ai-team\/api\/engine\/retry-blocked"/);
  assert.match(dashboardHtml, /fetch\("\/ai-team\/api\/dashboard"/);
  assert.match(dashboardHtml, /postJson\("\/ai-team\/api\/channels\/feishu\/scan"/);
  assert.doesNotMatch(dashboardHtml, /"\/api\//);

  assert.match(loginHtml, /action="\/ai-team\/console\/dashboard\/login"/);
  assert.match(loginHtml, /name="next" value="\/ai-team\/console\/dashboard"/);
  assert.match(architectureHtml, /href="\/ai-team\/console\/dashboard"/);
  assert.match(architectureHtml, /Route: \/ai-team\/console\/architecture/);
});

test("dashboard login page explains the default token when the server token is unset", () => {
  const html = renderDashboardLoginPage({ tokenMode: "default" });

  assert.match(html, /default token: AI-team/);
  assert.doesNotMatch(html, /AI_TEAM_ADMIN_TOKEN is not configured/);
});

test("dashboard client includes bilingual i18n and instant language switching", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /const DASHBOARD_I18N/);
  assert.match(html, /"nav\.Overview":"Overview"/);
  assert.match(html, /"nav\.Team":"Employees"/);
  assert.match(html, /"nav\.Projects":"Projects"/);
  assert.match(html, /"nav\.Intake":"Start Work"/);
  assert.match(html, /"nav\.Overview":"总览"/);
  assert.match(html, /"nav\.Team":"员工"/);
  assert.match(html, /"nav\.Projects":"项目"/);
  assert.match(html, /"nav\.Intake":"发起工作"/);
  assert.match(html, /function renderLanguageSwitch/);
  assert.match(html, /localStorage\.setItem\("aiTeamLocale", nextLocale\)/);
  assert.match(html, /function renderForLocaleSwitch/);
  assert.match(html, /snapshotTransientForms/);
  assert.match(html, /document\.documentElement\.lang = localeTag\(\)/);
  assert.match(html, /navLabel\(tab\)/);
  assert.match(html, /filterLabel\(filter\)/);
  assert.match(html, /statusLabel\(status \|\| "unknown"\)/);
  assert.equal(DASHBOARD_I18N.en["copy.Coding Agent launcher"], "Coding Agent launcher");
  assert.equal(DASHBOARD_I18N.zh["copy.Coding Agent launcher"], "Coding Agent 启动器");
  assert.equal(DASHBOARD_I18N.en["copy.Not configured"], "Not configured");
  assert.equal(DASHBOARD_I18N.zh["copy.Not configured"], "未配置");
  assert.equal(DASHBOARD_I18N.en["copy.Command template"], "Command template");
  assert.equal(DASHBOARD_I18N.zh["copy.Command template"], "命令模板");
});

test("dashboard client renders Evidence as audit dossiers", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /Evidence Dossier/);
  assert.match(html, /Work audit trail/);
  assert.match(html, /Lifecycle Timeline/);
  assert.match(html, /Verification/);
  assert.doesNotMatch(html, /QA Verification/);
  assert.match(html, /data-evidence-id/);
  assert.match(html, /state\.data\.evidence\?\.dossiers/);
  assert.match(html, /function evidenceDossiers/);
  assert.match(html, /function evidenceReviewPanel/);
  assert.match(html, /evidence\.review\.state\.qa_watch/);
  assert.match(html, /oneOne\.evidenceReviewPrompt/);
  assert.match(html, /function evidenceBriefSection/);
  assert.match(html, /copy\("Intake Brief"\)/);
  assert.match(html, /copy\("Evidence Review"\)/);
  assert.match(html, /function currentTabItemCount/);
  assert.match(html, /countText\("items", currentTabItemCount\(\)\)/);
  assert.match(html, /function evidenceTimeline/);
  assert.match(html, /copy\("Dependencies"\)/);
  assert.match(html, /evidenceStatusText\(task\.status\)/);
  assert.doesNotMatch(html, /"deps: "/);
});

test("dashboard Evidence can open run detail traces from run ids", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /function openRunDetail/);
  assert.match(html, /function runDetailConversationRows/);
  assert.match(html, /copy\("Agent conversation"\)/);
  assert.match(html, /copy\("Tool call"\)/);
  assert.match(html, /copy\("Tool result"\)/);
  assert.match(html, /copy\("Raw turn detail"\)/);
  assert.match(html, /function runDetailTurnRows/);
  assert.match(html, /Context messages/);
  assert.match(html, /Prefix cache/);
  assert.match(html, /Prefix changed/);
  assert.match(html, /Model output/);
  assert.match(html, /contextMessages = context\.messages/);
  assert.match(html, /turnContextTexts/);
  assert.match(html, /currentText\.startsWith\(previousText\)/);
  assert.match(html, /index === turns\.length - 1 \? " open" : ""/);
  assert.match(html, /run-detail-prefix-alert/);
  assert.match(html, /\.run-detail-turn-card:not\(\[open\]\) > \.run-detail-turn-body/);
  assert.match(html, /data-run-detail-copy/);
  assert.match(html, /function copyRunDetailMessageBlock/);
  assert.match(html, /window\.navigator\?\.clipboard/);
  assert.match(html, /clipboard\?\.writeText/);
  assert.match(html, /await clipboard\.writeText\(text\)/);
  assert.match(html, /document\.execCommand\("copy"\)/);
  assert.match(html, /field\.setSelectionRange\(0, field\.value\.length\)/);
  assert.match(html, /closest\("\.run-detail-message"\)/);
  assert.match(html, /\/api\/engine\/runs\/"\s*\+\s*encodeURIComponent\(runId\)\s*\+\s*"\/detail/);
  assert.match(html, /data-run-detail-id/);
  assert.match(html, /run-detail-modal/);
  assert.equal(DASHBOARD_I18N.en["action.Copy block"], "Copy block");
  assert.equal(DASHBOARD_I18N.zh["action.Copy block"], "复制块");
  assert.equal(DASHBOARD_I18N.zh["copy.Prefix changed"], "Prefix 变化");
  assert.equal(DASHBOARD_I18N.en["copy.Agent conversation"], "Agent conversation");
  assert.equal(DASHBOARD_I18N.zh["copy.Agent conversation"], "Agent 对话");
  assert.doesNotMatch(html, /runDetailJsonBlock\("Context blocks"/);
  assert.doesNotMatch(html, /runDetailJsonBlock\("Artifacts"/);
  assert.doesNotMatch(html, /runDetailJsonBlock\("Session"/);
});

test("dashboard work cards deep-link into Evidence dossiers", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /function openEvidenceDossier/);
  assert.match(html, /data-evidence-id/);
  assert.match(html, /state\.selectedEvidenceId = id/);
  assert.match(html, /state\.tab = normalizeTab\("Evidence"\)/);
  assert.match(html, /button class="work-card/);
  assert.match(html, /function workCardBrief/);
  assert.match(html, /item\.brief\?\.acceptance/);
});

test("dashboard work cards render compact operations cards", () => {
  const html = renderDashboardPage(baseDashboardData());
  const workCardSource = sourceBetween(html, "function compactWorkCardSteps", "function captureBoardRects");

  assert.match(workCardSource, /function compactWorkCardSteps/);
  assert.match(workCardSource, /const visible = list\.slice\(0, 3\)/);
  assert.match(workCardSource, /function compactWorkCardAgents/);
  assert.match(workCardSource, /const visible = list\.slice\(0, 3\)/);
  assert.match(workCardSource, /function workCardIsComplete/);
  assert.match(workCardSource, /const isComplete = workCardIsComplete\(item, columnId\)/);
  assert.match(workCardSource, /function compactWorkCardTitle/);
  assert.match(workCardSource, /rawTitle\.replace\([\s\S]*Outcome:/);
  assert.match(workCardSource, /'<div class="card-title">' \+ escapeHtml\(compactWorkCardTitle\(item, columnId\)\) \+ '<\/div>'/);
  assert.match(workCardSource, /const steps = compactWorkCardSteps\(item\.steps\)/);
  assert.match(workCardSource, /const involvedAgents = compactWorkCardAgents\(item\.involvedAgents\)/);
  assert.match(workCardSource, /const progress = workCardProgress\(item\)/);
  assert.match(workCardSource, /class="card-clip/);
  assert.match(workCardSource, /function cardClip\(accent\)/);
  assert.match(workCardSource, /WORK_CARD_PAPERCLIP_DATA_URI/);
  assert.match(workCardSource, /<img class="clip-image" src="/);
  assert.doesNotMatch(workCardSource, literalPattern(removedCardClipFunction));
  assert.doesNotMatch(workCardSource, literalPattern(removedInlineClipSvg));
  assert.doesNotMatch(workCardSource, literalPattern(removedClipMain));
  assert.doesNotMatch(workCardSource, /class="card-pin/);
  assert.match(workCardSource, /class="status-dot/);
  assert.match(workCardSource, /class="work-card-status-meta/);
  assert.match(workCardSource, /class="agent-overflow"/);
  assert.doesNotMatch(workCardSource, /isComplete \? \[\] : compactWorkCardSteps/);
  assert.doesNotMatch(workCardSource, /isComplete \? \[\] : compactWorkCardAgents/);
  assert.doesNotMatch(workCardSource, /isComplete \? "" : workCardProgress/);
  assert.doesNotMatch(workCardSource, /workCardDoneNote/);
  assert.doesNotMatch(workCardSource, /\(item\.steps \|\| \[\]\)\.map/);
  assert.doesNotMatch(workCardSource, /\(item\.involvedAgents \|\| \[\]\)\.map/);
});

test("dashboard complete work cards keep classic progress steps and agents", () => {
  const html = renderDashboardPage(baseDashboardData());
  const workCardSource = sourceBetween(html, "function compactWorkCardSteps", "function captureBoardRects");

  assert.match(workCardSource, /isComplete \? '<div class="check">✓<\/div>' : ''/);
  assert.match(workCardSource, /const progress = workCardProgress\(item\)/);
  assert.match(workCardSource, /const steps = compactWorkCardSteps\(item\.steps\)/);
  assert.match(workCardSource, /const involvedAgents = compactWorkCardAgents\(item\.involvedAgents\)/);
  assert.doesNotMatch(workCardSource, /workCardCompleteReceipt/);
  assert.doesNotMatch(workCardSource, /work-card-complete-receipt/);
  assert.doesNotMatch(workCardSource, /compactCompleteWorkCard/);
  assert.doesNotMatch(workCardSource, /workCardCompactAgentHtml/);
  assert.doesNotMatch(workCardSource, /agent-row compact/);
  assert.doesNotMatch(workCardSource, /agent-chip compact/);
  assert.doesNotMatch(workCardSource, /const progress = isComplete \? ""/);
  assert.doesNotMatch(workCardSource, /const steps = isComplete \? \[\]/);
  assert.doesNotMatch(workCardSource, /const involvedAgents = isComplete \? \[\]/);
  assert.doesNotMatch(html, /\.work-card-complete-receipt\s*\{/);
  assert.doesNotMatch(html, /\.receipt-summary\s*\{/);
  assert.doesNotMatch(html, /\.work-card \.agent-chip\.compact\s*\{/);

  const data = baseDashboardData();
  data.columns = [
    {
      id: "done",
      title: "DONE",
      accent: "green",
      items: [
        {
          id: "TASK-CLASSIC",
          rawId: "task_complete_classic",
          entityType: "task",
          title: "Keep completed card detail",
          status: "done",
          category: "UI",
          progress: 100,
          owner: "Ada",
          involvedAgents: [
            { name: "Ada", initials: "AD", color: "blue", active: true },
            { name: "Turing", initials: "TU", color: "green" }
          ],
          steps: [
            { label: "Plan", done: true },
            { label: "Build", done: true },
            { label: "Verify", done: true },
            { label: "Ship", done: true }
          ]
        }
      ]
    }
  ];
  const cardHtml = boardCardHtml(renderOverviewBoardHtml(data), "task_complete_classic");

  assert.match(cardHtml, /class="work-card [^"]*is-complete/);
  assert.match(cardHtml, paperclipImagePattern("green"));
  assert.doesNotMatch(cardHtml, literalPattern(removedInlineClipSvg));
  assert.doesNotMatch(cardHtml, literalPattern(removedClipMain));
  assert.doesNotMatch(cardHtml, /card-pin/);
  assert.match(cardHtml, /<div class="progress-row">/);
  assert.match(cardHtml, /<span class="progress-number">100%<\/span>/);
  assert.match(cardHtml, /<span class="step done">Plan ✓<\/span>/);
  assert.match(cardHtml, /<span class="step more" title="Ship" aria-label="Ship">\+1<\/span>/);
  assert.match(cardHtml, /<span class="agent-chip active"><span class="initials blue">AD<\/span>Ada<\/span>/);
  assert.match(cardHtml, /<span class="agent-chip "><span class="initials green">TU<\/span>Turing<\/span>/);
  assert.doesNotMatch(cardHtml, /work-card-complete-receipt/);
  assert.doesNotMatch(cardHtml, /agent-row compact/);
  assert.doesNotMatch(cardHtml, /agent-chip compact/);
});

test("dashboard work cards render entity metadata without repeating intent self context", () => {
  const data = baseDashboardData();
  data.columns = [
    {
      id: "intents",
      title: "INTENTS",
      accent: "orange",
      items: [
        {
          id: "INTENT-001",
          rawId: "intent_ship",
          entityType: "intent",
          intentId: "intent_ship",
          title: "Ship overview cards",
          status: "new",
          category: "UI",
          projectName: "AI Team Dashboard",
          owner: "Darwin",
          involvedAgents: []
        }
      ]
    },
    {
      id: "done",
      title: "DONE",
      accent: "green",
      items: [
        {
          id: "TASK-001",
          rawId: "task_done",
          entityType: "task",
          intentId: "intent_ship",
          intentTitle: "Ship overview cards",
          title: "Implement overview cards",
          status: "done",
          category: "UI",
          projectName: "AI Team Dashboard",
          owner: "Ada",
          involvedAgents: []
        },
        {
          id: "TASK-002",
          rawId: "task_project_only",
          entityType: "task",
          intentId: "intent_project_only",
          title: "Document project-only footer",
          status: "done",
          category: "UI",
          projectName: "Project-only Dashboard",
          owner: "Ada",
          involvedAgents: []
        }
      ]
    }
  ];

  const boardHtml = renderOverviewBoardHtml(data);
  const intentCard = boardCardHtml(boardHtml, "intent_ship");
  const taskCard = boardCardHtml(boardHtml, "task_done");
  const projectOnlyTaskCard = boardCardHtml(boardHtml, "task_project_only");

  assert.match(intentCard, /class="work-card [^"]*entity-intent/);
  assert.match(intentCard, paperclipImagePattern("orange"));
  assert.doesNotMatch(intentCard, literalPattern(removedInlineClipSvg));
  assert.doesNotMatch(intentCard, literalPattern(removedClipMain));
  assert.doesNotMatch(intentCard, /card-pin/);
  assert.match(intentCard, /<span class="tag entity intent">Intent<\/span>/);
  assert.doesNotMatch(intentCard, /work-card-association/);
  assert.doesNotMatch(intentCard, /AI Team Dashboard/);

  assert.match(taskCard, /class="work-card [^"]*entity-task[^"]*is-complete/);
  assert.match(taskCard, paperclipImagePattern("green"));
  assert.doesNotMatch(taskCard, literalPattern(removedInlineClipSvg));
  assert.doesNotMatch(taskCard, literalPattern(removedClipMain));
  assert.doesNotMatch(taskCard, /card-pin/);
  assert.match(taskCard, /<span class="tag entity task">Task<\/span>/);
  assert.doesNotMatch(taskCard, /<span class="tag status">Done<\/span>/);
  assert.match(taskCard, /class="work-card-association">Ship overview cards · AI Team Dashboard<\/span>/);

  assert.match(projectOnlyTaskCard, /class="work-card-association">Project-only Dashboard<\/span>/);
  assert.doesNotMatch(projectOnlyTaskCard, /work-card-association">[^<]*intent_project_only/);
});

test("dashboard feedback cards avoid raw intent id association fallback", () => {
  const data = baseDashboardData();
  data.columns = [
    {
      id: "feedback",
      title: "FEEDBACK",
      accent: "amber",
      items: [
        {
          id: "FEEDBACK-001",
          rawId: "feedback_raw_only",
          entityType: "feedback",
          intentId: "intent_raw_only",
          title: "Raw-only feedback",
          status: "new",
          category: "CRM",
          owner: "Bell",
          involvedAgents: []
        },
        {
          id: "FEEDBACK-002",
          rawId: "feedback_project",
          entityType: "feedback",
          intentId: "intent_project",
          title: "Project feedback",
          status: "new",
          category: "CRM",
          projectName: "Readable Project",
          owner: "Bell",
          involvedAgents: []
        },
        {
          id: "FEEDBACK-003",
          rawId: "feedback_intent_title",
          entityType: "feedback",
          intentId: "intent_title",
          intentTitle: "Readable parent intent",
          title: "Intent title feedback",
          status: "new",
          category: "CRM",
          projectName: "Readable Project",
          owner: "Bell",
          involvedAgents: []
        }
      ]
    }
  ];

  const boardHtml = renderOverviewBoardHtml(data);
  const rawOnlyCard = boardCardHtml(boardHtml, "feedback_raw_only");
  const projectCard = boardCardHtml(boardHtml, "feedback_project");
  const intentTitleCard = boardCardHtml(boardHtml, "feedback_intent_title");

  assert.doesNotMatch(rawOnlyCard, /work-card-association/);
  assert.doesNotMatch(rawOnlyCard, /work-card-association">[^<]*intent_raw_only/);
  assert.match(projectCard, /class="work-card-association">Readable Project<\/span>/);
  assert.match(intentTitleCard, /class="work-card-association">Readable parent intent · Readable Project<\/span>/);
});

test("dashboard work card collapsed step chip exposes hidden labels", () => {
  const data = baseDashboardData();
  data.columns = [
    {
      id: "working",
      title: "WORKING",
      accent: "blue",
      items: [
        {
          id: "TASK-002",
          rawId: "task_steps",
          entityType: "task",
          intentId: "intent_ship",
          title: "Expose step overflow",
          status: "working",
          category: "UI",
          owner: "Ada",
          involvedAgents: [],
          steps: [
            { label: "Brief" },
            { label: "Build" },
            { label: "Verify" },
            { label: "Document hover" },
            { label: "Ship keyboard label" }
          ]
        }
      ]
    }
  ];

  const cardHtml = boardCardHtml(renderOverviewBoardHtml(data), "task_steps");

  assert.match(cardHtml, /<span class="step more" title="Document hover, Ship keyboard label" aria-label="Document hover, Ship keyboard label">\+2<\/span>/);
});

test("dashboard work card paperclip data URI matches baked PNG asset", () => {
  const prefix = "data:image/png;base64,";
  assert.ok(WORK_CARD_PAPERCLIP_DATA_URI.startsWith(prefix));

  const decodedAsset = Buffer.from(WORK_CARD_PAPERCLIP_DATA_URI.slice(prefix.length), "base64");
  const pngAsset = readFileSync(new URL("../src/fe/dashboard/assets/work-card-paperclip.png", import.meta.url));

  assert.deepEqual(decodedAsset, pngAsset);
});

test("dashboard work cards use restored classic card surface", () => {
  const html = renderDashboardPage(baseDashboardData());
  const workCardStyle = sourceBetween(html, "    .work-card {\n      width: 100%;", "    .work-card:hover,");

  assert.match(workCardStyle, /display:\s*block;/);
  assert.match(workCardStyle, /position:\s*relative;/);
  assert.match(workCardStyle, /min-height:\s*86px;/);
  assert.match(workCardStyle, /overflow:\s*visible;/);
  assert.match(workCardStyle, /background:\s*radial-gradient\(/);
  assert.match(workCardStyle, /radial-gradient\(circle at 18px 16px,\s*rgba\(15,\s*23,\s*42,\s*0\.018\)/);
  assert.match(workCardStyle, /repeating-linear-gradient\(112deg,\s*rgba\(15,\s*23,\s*42,\s*0\.006\)\s*0 1px,\s*transparent 1px 13px\)/);
  assertNoOrthogonalPaperGrid(workCardStyle);
  assert.match(workCardStyle, /linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.97\),\s*rgba\(253,\s*254,\s*253,\s*0\.93\)\);/s);
  assert.match(workCardStyle, /background-size:\s*17px 19px,\s*23px 29px,\s*auto,\s*auto;/);
  assert.doesNotMatch(workCardStyle, /background:\s*rgba\(255,255,255,0\.82\);/);
  assert.match(workCardStyle, /border:\s*1px solid var\(--line\);/);
  assert.doesNotMatch(workCardStyle, /border-left:\s*3px/);
  assert.match(workCardStyle, /border-radius:\s*8px;/);
  assert.match(workCardStyle, /box-shadow:\s*var\(--shadow\);/);
  const workCardHoverStyle = sourceBetween(html, "    .work-card:hover,\n    .work-card:focus-visible {", "    .work-card:disabled {");
  assert.match(workCardHoverStyle, /border-top-color:\s*#8bc7bf;/);
  assert.match(workCardHoverStyle, /background:\s*radial-gradient\(/);
  assert.match(workCardHoverStyle, /repeating-linear-gradient\(112deg,\s*rgba\(15,\s*23,\s*42,\s*0\.006\)\s*0 1px,\s*transparent 1px 13px\)/);
  assertNoOrthogonalPaperGrid(workCardHoverStyle);
  assert.match(workCardHoverStyle, /linear-gradient\(180deg,\s*rgba\(249,\s*254,\s*252,\s*0\.96\),\s*rgba\(241,\s*253,\s*250,\s*0\.86\)\);/s);
  const disabledHoverStyle = sourceBetween(html, "    .work-card:disabled:hover {", "    .card-clip {");
  assert.match(disabledHoverStyle, /border-color:\s*var\(--line\);/);
  assert.match(disabledHoverStyle, /background:\s*radial-gradient\(/);
  assert.match(disabledHoverStyle, /repeating-linear-gradient\(112deg,\s*rgba\(15,\s*23,\s*42,\s*0\.006\)\s*0 1px,\s*transparent 1px 13px\)/);
  assertNoOrthogonalPaperGrid(disabledHoverStyle);
  const fallbackWorkCardStyle = sourceBetween(html, "    .work-card {\n      position: relative;\n      background:", "    .work-card:hover,\n    .work-card:focus-visible {");
  assert.match(fallbackWorkCardStyle, /radial-gradient\(circle at 18px 16px,\s*rgba\(15,\s*23,\s*42,\s*0\.018\)/);
  assert.match(fallbackWorkCardStyle, /repeating-linear-gradient\(112deg,\s*rgba\(15,\s*23,\s*42,\s*0\.006\)\s*0 1px,\s*transparent 1px 13px\)/);
  assertNoOrthogonalPaperGrid(fallbackWorkCardStyle);
  assert.doesNotMatch(html, /\.card-pin\b/);
  assert.match(html, /const WORK_CARD_PAPERCLIP_DATA_URI = "data:image\/png;base64,/);
  assert.match(html, /'<img class="clip-image" src="' \+ WORK_CARD_PAPERCLIP_DATA_URI/);
  assert.doesNotMatch(html, literalPattern("function " + removedCardClipFunction));
  assert.doesNotMatch(html, literalPattern(removedInlineClipSvg));
  assert.doesNotMatch(html, literalPattern(removedClipMain));
  assert.doesNotMatch(html, /card-pin/);
  const cardClipRules = html.match(/\.card-clip\s*\{[^}]*\}/g) || [];
  assert.equal(cardClipRules.length, 2);
  for (const cardClipRule of cardClipRules) {
    assertRuleIncludes(cardClipRule, [
      "position: absolute;",
      "top: -4px;",
      "left: -2px;",
      "width: 13px;",
      "height: 32px;",
      "transform: rotate(-7deg);",
      "transform-origin: 50% 12px;",
      "pointer-events: none;",
      "opacity: 0.96;",
      "z-index: 2;",
      "filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.12));"
    ]);
  }
  const cardClipImageRules = html.match(/\.card-clip img\s*\{[^}]*\}/g) || [];
  assert.equal(cardClipImageRules.length, 2);
  for (const cardClipImageRule of cardClipImageRules) {
    assertRuleIncludes(cardClipImageRule, [
      "position: relative;",
      "z-index: 1;",
      "display: block;",
      "width: 100%;",
      "height: 100%;",
      "object-fit: contain;",
      "user-select: none;"
    ]);
  }
  const cardClipAfterSelector = ".card-clip" + "::after";
  const cardClipAfterRulePattern = new RegExp(
    cardClipAfterSelector.replace(".", "\\.") + "\\s*\\{[^}]*\\}",
    "g"
  );
  const cardClipAfterRules = html.match(cardClipAfterRulePattern) || [];
  assert.equal(cardClipAfterRules.length, 0);
  assert.equal(html.includes(cardClipAfterSelector), false);
  assert.doesNotMatch(html, literalPattern(removedCardClipSelector + " svg"));
  assert.doesNotMatch(html, literalPattern(removedCardClipSelector + " ." + removedClipMain));
  assert.doesNotMatch(html, literalPattern(removedCardClipSelector + " ." + removedClipHighlight));
  assert.doesNotMatch(html, literalPattern(removedCardClipSelector + " ." + removedClipShadow));
  assert.doesNotMatch(html, /\.card-clip::before/);
  assert.doesNotMatch(html, literalPattern(removedClipMetal));
  assert.doesNotMatch(html, literalPattern(removedClipDark));
  assert.match(html, /\.status-dot\s*\{[^}]*position:\s*absolute;[^}]*top:\s*14px;[^}]*right:\s*14px;/s);
  assert.match(html, /\.check\s*\{[^}]*position:\s*absolute;[^}]*top:\s*9px;[^}]*right:\s*32px;/s);
  assert.ok(
    cssRules(html, ".work-card-status-meta").some((rule) =>
      !rule.includes("padding-left:") && rule.includes("padding-right: 18px;")
    )
  );
  assert.ok(
    cssRules(html, ".work-card .card-title").some((rule) =>
      !rule.includes("padding-left:") && rule.includes("padding-right: 18px;")
    )
  );
  assert.ok(cssRules(html, ".card-id").every((rule) => !rule.includes("padding-left:")));
  assert.ok(cssRules(html, ".card-title").every((rule) => !rule.includes("padding-left:")));
  assert.doesNotMatch(html, /\.work-card\s*\{[^}]*border-left:\s*3px/s);
  assert.ok(
    cssRules(html, ".work-card .card-title").some((rule) =>
      rule.includes("padding-right: 18px;") &&
      rule.includes("font-size: 14px;") &&
      rule.includes("font-weight: 700;")
    )
  );
  assert.ok(
    cssRules(html, ".card-title").some((rule) =>
      rule.includes("font-size: 14px;") &&
      rule.includes("font-weight: 700;")
    )
  );
  assert.match(html, /\.tag\.entity\s*\{[^}]*letter-spacing:\s*0;/s);
  assert.match(html, /\.tag\.entity\.intent\s*\{[^}]*background:\s*transparent;/s);
  assert.match(html, /\.tag\.entity\.task\s*\{[^}]*background:\s*transparent;/s);
  assert.match(html, /\.work-card \.progress-row\s*\{[^}]*margin-top:\s*12px;/s);
  assert.match(html, /\.work-card \.progress-track\s*\{[^}]*margin-top:\s*5px;/s);
  assert.match(html, /\.work-card \.steps\s*\{[^}]*margin-top:\s*9px;/s);
  assert.match(html, /\.work-card \.agent-row\s*\{[^}]*margin-top:\s*10px;[^}]*gap:\s*5px;/s);
  assert.match(html, /\.work-card \.meta-row\s*\{[^}]*width:\s*100%;[^}]*margin-top:\s*12px;[^}]*min-height:\s*20px;[^}]*overflow:\s*hidden;/s);
  assert.match(html, /\.work-card-association\s*\{[^}]*flex:\s*1 1 auto;/s);
  assert.doesNotMatch(html, /\.work-card\.is-complete\s*\{[^}]*gap:/s);
  assert.doesNotMatch(html, /\.work-card\.is-complete\s*\{[^}]*padding-block:/s);
  assert.doesNotMatch(html, /\.work-card\.is-complete\s*\{[^}]*min-height:\s*112px/s);
  assert.doesNotMatch(html, /\.work-card-complete-receipt/);
  assert.doesNotMatch(html, /\.receipt-/);
  assert.doesNotMatch(html, /\.work-card \.agent-chip\.compact/);
  assert.doesNotMatch(html, /\.work-card \.agent-row\.compact/);
  assert.match(html, /\.work-card\.entity-intent\s*\{[^}]*border-color:[^}]*background:/s);
  assert.doesNotMatch(html, /\.work-card\.entity-task\s*\{/);
  assert.doesNotMatch(html, /\.work-card\.entity-intent::before/);
  assert.doesNotMatch(html, /\.work-card\.entity-task::before/);
  assert.doesNotMatch(html, /\.work-card\.entity-intent \.card-title/);
  assert.doesNotMatch(html, /\.work-card\.entity-task \.card-title/);
  assert.doesNotMatch(html, /inset 0 4px 0 rgba\(183, 121, 31/);
  assert.doesNotMatch(html, /\.work-card\.entity-feedback\s*\{/);
});

test("dashboard Evidence opens one one with task context", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /function evidenceTaskContextPrompt/);
  assert.match(html, /data-evidence-one-one/);
  assert.match(html, /data-evidence-prompt/);
  assert.match(html, /function openEvidenceOneOne/);
  assert.match(html, /oneOne\.evidenceContextPrompt/);
  assert.match(html, /actionLabel\("Ask Agent"\)/);
  assert.equal(DASHBOARD_I18N.en["oneOne.evidenceContextPrompt"].includes("\n\nIntent:"), true);
  assert.equal(DASHBOARD_I18N.en["oneOne.evidenceContextPrompt"].includes("\\n"), false);
  assert.equal(DASHBOARD_I18N.zh["oneOne.evidenceContextPrompt"].includes("\n\n意图："), true);
  assert.equal(DASHBOARD_I18N.zh["oneOne.evidenceContextPrompt"].includes("\\n"), false);
});

function sourceBetween(html, startNeedle, endNeedle) {
  const start = html.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source start: ${startNeedle}`);
  const end = html.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing source end: ${endNeedle}`);
  return html.slice(start, end);
}

function literalPattern(value) {
  return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

function cssRules(html, selector) {
  const escapedSelector = literalPattern(selector).source;
  return html.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, "g")) || [];
}

function hasOrthogonalPaperGrid(source) {
  return /repeating-linear-gradient\(0deg/.test(source) && /repeating-linear-gradient\(90deg/.test(source);
}

function assertNoOrthogonalPaperGrid(source) {
  assert.doesNotMatch(source, /repeating-linear-gradient\(0deg/);
  assert.doesNotMatch(source, /repeating-linear-gradient\(90deg/);
  assert.equal(hasOrthogonalPaperGrid(source), false);
}

function assertRuleIncludes(rule, expectedFragments) {
  for (const fragment of expectedFragments) {
    assert.ok(rule.includes(fragment), `expected CSS rule to include ${fragment}`);
  }
}

function paperclipImagePattern(accent) {
  return new RegExp('<span class="card-clip ' + accent + '" aria-hidden="true"><img class="clip-image" src="data:image/png;base64,[A-Za-z0-9+/=]+" alt="" draggable="false"></span>');
}

function fakeDashboardElement() {
  return {
    innerHTML: "",
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
  };
}

function renderOverviewBoardHtml(data) {
  const html = renderDashboardPage(data);
  const script = sourceBetween(html, "<script>\n", "\n  </script>").slice("<script>\n".length);
  const board = fakeDashboardElement();
  const document = {
    body: fakeDashboardElement(),
    documentElement: fakeDashboardElement(),
    title: "",
    getElementById(id) {
      return id === "board" ? board : null;
    },
    querySelectorAll() {
      return [];
    },
    createTreeWalker() {
      return { nextNode() { return false; }, currentNode: null };
    }
  };
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const sandbox = {
    URLSearchParams,
    NodeFilter: { SHOW_TEXT: 4 },
    navigator: { language: "en-US" },
    localStorage: storage,
    document,
    window: {
      location: { search: "", pathname: "/ai-team/console/dashboard", hash: "", host: "localhost", protocol: "http:" },
      history: { replaceState() {}, pushState() {} },
      addEventListener() {},
      setTimeout() {},
      clearTimeout() {},
      confirm() { return false; },
      navigator: { language: "en-US" },
      localStorage: storage
    },
    requestAnimationFrame(callback) { callback(); },
    setInterval() { return 0; },
    clearInterval() {},
    setTimeout() {},
    clearTimeout() {},
    fetch() {
      return Promise.resolve({ ok: false, json: async () => ({}) });
    }
  };

  vm.runInNewContext(script, sandbox, { timeout: 1000 });
  return board.innerHTML;
}

function boardCardHtml(boardHtml, cardKey) {
  const marker = 'data-card-key="' + cardKey + '"';
  const markerIndex = boardHtml.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing card: ${cardKey}`);
  const start = boardHtml.lastIndexOf("<button", markerIndex);
  const end = boardHtml.indexOf("</button>", markerIndex);
  assert.notEqual(start, -1, `missing card start: ${cardKey}`);
  assert.notEqual(end, -1, `missing card end: ${cardKey}`);
  return boardHtml.slice(start, end + "</button>".length);
}

function feishuFormSource(html) {
  return sourceBetween(html, "function feishuForm", "function optionalInput");
}

function feishuDefaultCardSource(html) {
  const source = sourceBetween(html, "function feishuChannelCard", "function settingsToken");
  const advancedStart = source.indexOf("<details");
  return advancedStart === -1 ? source : source.slice(0, advancedStart);
}

function feishuAdvancedSource(html) {
  const source = feishuFormSource(html);
  return sourceBetween(source, "<details", "</details>");
}

test("dashboard Agents tab renders summary cards and modal capability builders", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /agent-summary-card/);
  assert.match(html, /employee-command-panel/);
  assert.match(html, /employee-improvement-panel/);
  assert.match(html, /employee-improvement-card/);
  assert.match(html, /function employeeImprovementPlan/);
  assert.match(html, /function employeeImprovementQueue/);
  assert.match(html, /function openEmployeeImprovementAction/);
  assert.match(html, /employee\.improvement\.title/);
  assert.match(html, /employee\.improvement\.prompt\.contextRequest/);
  assert.match(html, /employee-improvement-action/);
  assert.match(html, /setOneOneLinkedContext\(role, \{/);
  assert.match(html, /employeeImprovementId: item\.id/);
  assert.match(html, /setActiveOneOneContextNeedId\(role, item\.contextNeedId \|\| ""\)/);
  assert.match(html, /openEvidenceDossier\(value\)/);
  assert.match(html, /openAgentEditor\(value\)/);
  assert.match(html, /function employeeConfigSummary/);
  assert.match(html, /function employeeActiveWorkCount/);
  assert.match(html, /function employeeModelLabel/);
  assert.match(html, /employee\.title/);
  assert.match(html, /one-one-agent/);
  assert.match(html, /t\("oneOne\.label"\)/);
  assert.match(html, /agentChatModalRoot/);
  assert.match(html, /renderAgentChatModal/);
  assert.match(html, /one-one-input/);
  assert.match(html, /one-one-mode-tab/);
  assert.match(html, /oneOne\.needsTab/);
  assert.match(html, /oneOne\.memoryTab/);
  assert.match(html, /oneOne\.diagnosticsTab/);
  assert.match(html, /one-one-prompt/);
  assert.match(html, /oneOne\.contextReadiness/);
  assert.match(html, /oneOne\.contextScore/);
  assert.match(html, /oneOne\.gap\.fact_memory\.label/);
  assert.match(html, /one-one-gap-action/);
  assert.match(html, /one-one-memory-kind/);
  assert.match(html, /use-last-reply-memory/);
  assert.match(html, /function lastAgentMessage/);
  assert.match(html, /oneOne\.useLastReply/);
  assert.match(html, /oneOne\.auditContext/);
  assert.match(html, /oneOne\.structuredNeeds/);
  assert.match(html, /oneOne\.memorySuggestions/);
  assert.match(html, /oneOne\.coachingJournal/);
  assert.match(html, /oneOne\.noCoachingJournal/);
  assert.match(html, /oneOne\.contextNeedsBacklog/);
  assert.match(html, /oneOne\.noContextNeedsBacklog/);
  assert.match(html, /oneOne\.openNeeds/);
  assert.match(html, /oneOne\.saveMemoryAndClose/);
  assert.match(html, /oneOne\.markAnswered/);
  assert.match(html, /oneOne\.dismissNeed/);
  assert.match(html, /function oneOneStructuredNeeds/);
  assert.match(html, /function oneOneContextNeedsBacklog/);
  assert.match(html, /function activeOneOneContextNeedId/);
  assert.match(html, /function oneOneMemorySuggestions/);
  assert.match(html, /function oneOneCoachingJournal/);
  assert.match(html, /one-one-need-card/);
  assert.match(html, /one-one-coaching-journal/);
  assert.match(html, /use-need-as-memory/);
  assert.match(html, /use-context-need-as-memory/);
  assert.match(html, /resolve-context-need/);
  assert.match(html, /dismiss-context-need/);
  assert.match(html, /contextNeedId: activeOneOneContextNeedId\(role\)/);
  assert.match(html, /\/api\/agents\/" \+ encodeURIComponent\(role\) \+ "\/context-needs\//);
  assert.match(html, /use-memory-suggestion/);
  assert.match(html, /mode: oneOneComposerMode\(role\)/);
  assert.match(html, /setOneOneLinkedContext\(role, \{\}\)/);
  assert.match(html, /save-one-one-memory/);
  assert.match(html, /one-one-diagnostics/);
  assert.match(html, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(html, /event\.isComposing/);
  assert.match(html, /\/api\/agents\/" \+ encodeURIComponent\(role\) \+ "\/one-one/);
  assert.match(html, /\/api\/agents\/" \+ encodeURIComponent\(role\) \+ "\/memory/);
  assert.match(html, /async function refresh\(\{ force = false \} = \{\}\)/);
  assert.match(html, /if \(!force && \(state\.editingAgentRole \|\| state\.chatAgentRole \|\| state\.editingProviderId \|\| state\.editingCodingAgentLauncherId\)\) return/);
  assert.match(html, /await refresh\(\{ force: true \}\);/);
  assert.match(html, /Direct employee turn/);
  assert.match(html, /Employee memory loaded/);
  assert.match(html, /reply\.capabilities/);
  assert.match(html, /reply\.agentMemory/);
  assert.match(html, /capability-count/);
  assert.match(html, /add-agent-card/);
  assert.match(html, /open-new-agent-editor/);
  assert.match(html, /agentConfigModalRoot/);
  assert.match(html, /openAgentEditor/);
  assert.doesNotMatch(html, new RegExp("agent-" + removedUiField));
  assert.doesNotMatch(html, new RegExp("<label>" + removedUiField.replace(/^./, (char) => char.toUpperCase()) + "<\\/label>"));
  assert.match(html, /wake-rule-builder/);
  assert.match(html, /wake-rule-card/);
  assert.match(html, /wake-flow-preview/);
  assert.match(html, /add-wake-rule/);
  assert.match(html, /collectWakeRules/);
  assert.match(html, /agent-model-header/);
  assert.match(html, /Model for this employee/);
  assert.match(html, /Persona/);
  assert.match(html, /Define identity, boundaries, tone, and judgment for this employee/);
  assert.match(html, /\.agent-config-card \.agent-prompt\s*\{[^}]*min-height: 440px/s);
  assert.match(html, /Create a new employee with persona, Skills, tools, and routing/);
  assert.doesNotMatch(html, /AGENTS\.md/);
  assert.doesNotMatch(html, /保存后会写入/);
  assert.doesNotMatch(html, /Provider and model for this Agent/);
  assert.match(html, /agent-provider-id/);
  assert.match(html, /agent-model/);
  assert.match(html, /function agentEditorRail/);
  assert.match(html, /function markAgentEditorDirty/);
  assert.match(html, /agent-editor-body/);
  assert.match(html, /agent-editor-rail/);
  assert.match(html, /agent-editor-nav-button/);
  assert.match(html, /function setAgentEditorTab/);
  assert.match(html, /agent-editor-tab-panel/);
  assert.match(html, /data-editor-section/);
  assert.match(html, /agent-editor-section-label/);
  assert.match(html, /agentEditorTabPanel\("identity"/);
  assert.match(html, /agentEditorTabPanel\("routing"/);
  assert.match(html, /agentEditorTabPanel\("integrations"/);
  assert.match(html, /agentEditorTabPanel\("memory"/);
  assert.match(html, /function agentEditorMemoryPanel/);
  assert.match(html, /agentEditorMemorySection\("semantic"/);
  assert.match(html, /agentEditorMemorySection\("procedural"/);
  assert.match(html, /agentEditorMemorySection\("episodic"/);
  assert.match(html, /agentEditorMemorySection\("context-needs"/);
  assert.match(html, /agentEditorSubsectionLabel\(copy\("Skills"\)/);
  assert.match(html, /agentEditorSubsectionLabel\(copy\("MCP"\)/);
  assert.match(html, /agentEditorSubsectionLabel\(copy\("Tools"\)/);
  assert.match(html, /\["identity", copy\("Identity"\)/);
  assert.match(html, /\["routing", copy\("Routing"\)/);
  assert.match(html, /\["integrations", copy\("Integrations"\)/);
  assert.match(html, /\["memory", copy\("Memory"\)/);
  assert.doesNotMatch(html, /\["skills", copy\("Skills"\)/);
  assert.doesNotMatch(html, /\["tools", copy\("Tool policy"\)/);
  assert.doesNotMatch(html, /scrollIntoView/);
  assert.match(html, /Configuration map/);
  assert.match(html, /Unsaved changes/);
  assert.match(html, /Model Providers/);
  assert.match(html, /model-provider-group/);
  assert.match(html, /provider-card/);
  assert.match(html, /provider-summary-grid/);
  assert.match(html, /open-provider-editor/);
  assert.match(html, /open-new-provider-editor/);
  assert.match(html, /providerConfigModalRoot/);
  assert.match(html, /provider-editor-card/);
  assert.match(html, /provider-access-mode/);
  assert.match(html, /provider-base-grid/);
  assert.match(html, /provider-subscription-panel/);
  assert.match(html, /Login command/);
  assert.match(html, /login status/);
  assert.match(html, /provider-api-key-panel/);
  assert.match(html, /provider-preset/);
  assert.match(html, /providerPresetOptions/);
  assert.match(html, /provider-api-key-secret/);
  assert.match(html, /Env fallback/);
  assert.match(html, /provider-api-key-env/);
  assert.match(html, /provider-base-url/);
  assert.match(html, /refreshProviderAuthFields/);
  assert.doesNotMatch(html, /<label>Provider ID<\/label>/);
  assert.doesNotMatch(html, /provider-type/);
  assert.doesNotMatch(html, /provider-auth-mode/);
  assert.match(html, /Codex Subscription/);
  assert.match(html, /DeepSeek/);
  assert.doesNotMatch(html, /Mock Provider/);
  assert.match(html, /Custom Base URL/);
  assert.match(html, /API Key · DeepSeek preset/);
  assert.match(html, /DEEPSEEK_API_KEY/);
  assert.match(html, /deepseek-chat/);
  assert.match(html, /Check Provider/);
  assert.match(html, /Runtime Snapshot/);
  assert.match(html, /Fallback runner/);
  assert.match(html, /Provider routing/);
  assert.match(html, /admin-token-panel/);
  assert.match(html, /Admin token required for remote saves/);
  assert.doesNotMatch(html, /Remote saves require AI_TEAM_ADMIN_TOKEN/);
  assert.match(html, /Channels/);
  assert.match(html, /channel-group/);
  assert.match(html, /channel-card-grid/);
  assert.match(html, /Feishu 长连接配置集中在这里/);
  assert.match(html, /Connect Feishu/);
  assert.match(html, /Advanced manual binding/);
  assert.doesNotMatch(html, /CLI setup/);
  assert.doesNotMatch(html, /feishu-cli bin/);
  assert.doesNotMatch(html, /feishu cli bin/);
  assert.doesNotMatch(html, /不属于 Model Provider/);
  assert.doesNotMatch(html, /不是模型 Provider 配置/);
  assert.match(html, /\/api\/model-providers/);
  assert.match(html, /POST", headers, body: JSON\.stringify\(body\)/);
  assert.match(html, /open-skill-install-modal/);
  assert.match(html, /agent-nested-modal/);
  assert.match(html, /skill-install-modal/);
  assert.match(html, /skill-install-command/);
  assert.match(html, /save-skill-install-modal/);
  assert.match(html, /action-button primary save-skill-install-modal/);
  assert.doesNotMatch(html, /skill-install-row/);
  assert.match(html, /function mcpCapabilityCard/);
  assert.match(html, /delete server\.tools/);
  assert.match(html, /delete server\.availableTools/);
  assert.match(html, /function syncSavedMcpTools/);
  assert.match(html, /function openMcpJsonModal/);
  assert.match(html, /function mcpEditableConfigJson/);
  assert.match(html, /function mergeMcpEditorJson/);
  assert.match(html, /mcp-capability-card/);
  assert.match(html, /mcp-capability-toggle/);
  assert.match(html, /mcp-capability-tools/);
  assert.match(html, /mcp-tool-row/);
  assert.match(html, /mcp-tool-checkbox/);
  assert.match(html, /mcp-tool-description" title="/);
  assert.match(html, /edit-mcp/);
  assert.match(html, /remove-mcp/);
  assert.match(html, /window\.confirm\(copy\("Remove this MCP\?"\)\)/);
  assert.match(html, /function skillCapabilityCard/);
  assert.match(html, /skill-capability-card/);
  assert.match(html, /skill-description" title="/);
  assert.match(html, /remove-skill/);
  assert.match(html, /function collectRemovedSkillIds/);
  assert.match(html, /removedSkillIds/);
  assert.match(html, /body\.removeSkills = removeSkills/);
  assert.doesNotMatch(html, /const skills = collectSkillCards/);
  assert.match(html, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(html, /mcp-json/);
  assert.match(html, /mcpServers/);
  assert.match(html, /mcp-json-store/);
  assert.match(html, /mcp-json-modal-textarea/);
  assert.match(html, /save-mcp-json-modal/);
  assert.match(html, /action-button primary save-mcp-json-modal/);
  assert.match(html, /actionLabel\("Add MCP"\)/);
  assert.match(html, /actionLabel\("Save MCP"\)/);
  assert.doesNotMatch(html, /primary-button/);
  assert.doesNotMatch(html, /actionLabel\("Add MCP JSON"\)/);
  assert.doesNotMatch(html, /actionLabel\("Save MCP JSON"\)/);
  assert.match(html, /openMcpJsonModal\(button, "create"\)/);
  assert.match(html, /openMcpJsonModal\(button, "edit"\)/);
  assert.match(html, /configJson: mcpEditableConfigJson\(textarea\.value\)/);
  assert.match(html, /syncSavedMcpTools\(savedResult\.agent\?\.role \|\| roleId, mcps\)/);
  assert.doesNotMatch(html, /tools: mcpToolsFromJson\(name, fullJson\)/);
  assert.match(html, /placeholder="' \+ escapeHtml\(sampleMcpJson\(\)\) \+ '"/);
  assert.match(html, /placeholder="npx skills install code-review"/);
  assert.doesNotMatch(html, /new-mcp-panel/);
  assert.doesNotMatch(html, /mcp-edit-panel/);
  assert.doesNotMatch(html, /class="mcp-json new-mcp-json"/);
  assert.doesNotMatch(html, /panel\?\.classList\.toggle\("is-open"\)/);
  assert.match(html, /stateClass = active \? "active" : "inactive"/);
  assert.match(html, /class="tool-toggle ' \+ stateClass \+ '"/);
  assert.doesNotMatch(html, /agentMcpToolGroups/);
  assert.doesNotMatch(html, /mcp-tool-group/);
  assert.doesNotMatch(html, /mcp-tool-toggle/);
  assert.match(html, /No tools declared by this MCP yet/);
  assert.match(html, /sync-mcp-tools/);
  assert.match(html, /Sync tools/);
  assert.match(html, /\/mcps\/" \+ encodeURIComponent\(mcpId\) \+ "\/tools\/sync/);
  assert.match(html, /aria-pressed/);
  assert.match(html, /text-decoration: line-through/);
  assert.ok(html.includes('querySelectorAll(".tool-toggle.active")'));
  assert.ok(html.includes('querySelectorAll(".mcp-tool-checkbox:checked")'));
  assert.match(html, /运行 Bash 命令/);
  assert.match(html, /state\.editingAgentRole \|\| state\.chatAgentRole \|\| state\.editingProviderId/);
  assert.equal(DASHBOARD_I18N.en["employee.improvement.title"], "Improvement queue");
  assert.equal(DASHBOARD_I18N.zh["employee.improvement.title"], "员工改进队列");
  assert.equal(DASHBOARD_I18N.en["employee.model.unassigned"], "Provider not assigned");
  assert.equal(DASHBOARD_I18N.zh["employee.model.unassigned"], "未绑定模型通道");
  assert.equal(DASHBOARD_I18N.en["copy.Configuration map"], "Configuration map");
  assert.equal(DASHBOARD_I18N.zh["copy.Configuration map"], "配置地图");
  assert.equal(DASHBOARD_I18N.en["copy.Unsaved changes"], "Unsaved changes");
  assert.equal(DASHBOARD_I18N.zh["copy.Unsaved changes"], "有未保存修改");
  assert.equal(DASHBOARD_I18N.en["count.skills"], "{count} skills");
  assert.equal(DASHBOARD_I18N.zh["count.skills"], "{count} 个 Skill");
  assert.equal(DASHBOARD_I18N.en["action.Add Skill"], "Add Skill");
  assert.equal(DASHBOARD_I18N.zh["action.Add Skill"], "添加 Skill");
  assert.equal(DASHBOARD_I18N.en["action.Install Skill"], "Install Skill");
  assert.equal(DASHBOARD_I18N.zh["action.Install Skill"], "安装 Skill");
  assert.equal(DASHBOARD_I18N.en["action.Add MCP"], "Add MCP");
  assert.equal(DASHBOARD_I18N.zh["action.Add MCP"], "添加 MCP");
  assert.equal(DASHBOARD_I18N.en["action.Save MCP"], "Save MCP");
  assert.equal(DASHBOARD_I18N.zh["action.Save MCP"], "保存 MCP");
  assert.equal(DASHBOARD_I18N.en["action.Add MCP JSON"], undefined);
  assert.equal(DASHBOARD_I18N.zh["action.Add MCP JSON"], undefined);
  assert.equal(DASHBOARD_I18N.en["action.Save MCP JSON"], undefined);
  assert.equal(DASHBOARD_I18N.zh["action.Save MCP JSON"], undefined);
  assert.equal(DASHBOARD_I18N.en["action.Edit MCP"], "Edit");
  assert.equal(DASHBOARD_I18N.zh["action.Edit MCP"], "编辑");
  assert.equal(DASHBOARD_I18N.en["action.Remove MCP"], "Remove");
  assert.equal(DASHBOARD_I18N.zh["action.Remove MCP"], "删除");
  assert.equal(DASHBOARD_I18N.en["action.Remove Skill"], "Remove");
  assert.equal(DASHBOARD_I18N.zh["action.Remove Skill"], "删除");
  assert.equal(DASHBOARD_I18N.en["copy.Remove this MCP?"], "Remove this MCP?");
  assert.equal(DASHBOARD_I18N.zh["copy.Remove this MCP?"], "确认删除这个 MCP？");
  assert.equal(DASHBOARD_I18N.en["copy.Remove this Skill?"], "Remove this Skill?");
  assert.equal(DASHBOARD_I18N.zh["copy.Remove this Skill?"], "确认删除这个 Skill？");
  assert.equal(DASHBOARD_I18N.en["copy.Skills"], "Skills");
  assert.equal(DASHBOARD_I18N.zh["copy.Skills"], "Skill");
  assert.equal(DASHBOARD_I18N.en["action.Coach in one one"], "Coach in one one");
  assert.equal(DASHBOARD_I18N.zh["action.Edit employee"], "编辑员工");

  const accessOptions = html.slice(html.indexOf("function providerAccessOptions"), html.indexOf("function providerPreset"));
  assert.match(accessOptions, /Subscription/);
  assert.match(accessOptions, /API Key/);
  assert.doesNotMatch(accessOptions, /DeepSeek/);
});

test("dashboard Overview renders realtime working employees and animated board moves", () => {
  const data = baseDashboardData();
  data.workingAgents = [
    {
      role: "engineer",
      name: "Ada",
      title: "Coding Engineer",
      initials: "AD",
      color: "green",
      state: "running",
      workTitle: "Wire WebSocket board updates",
      runId: "run_active",
      provider: "deepseek",
      model: "deepseek-v4-pro"
    }
  ];
  data.columns = [
    {
      id: "intents",
      title: "INTENTS",
      accent: "orange",
      items: [
        {
          id: "INTENT-001",
          rawId: "intent_1",
          entityType: "intent",
          intentId: "intent_1",
          title: "Ship live board",
          status: "blocked",
          owner: "Darwin",
          ownerInitials: "DA",
          ownerColor: "blue",
          category: "UI",
          dot: "orange",
          involvedAgents: []
        }
      ]
    }
  ];

  const html = renderDashboardPage(data);

  assert.match(html, /id="workingAgentsPanel"/);
  assert.match(html, /id="runDetailModalRoot"/);
  assert.match(html, /function renderWorkingAgents/);
  assert.match(html, /state\.data\.workingAgents/);
  assert.match(html, /data-working-run-id/);
  assert.match(html, /openRunDetail\(button\.dataset\.workingRunId, \{ updateRoute: false \}\)/);
  assert.match(html, /function refreshOpenRunDetail/);
  assert.match(html, /renderRunDetailRoot/);
  assert.match(html, /copy\("Tool execution"\)/);
  assert.match(html, /new WebSocket\(dashboardWebSocketUrl\(\)\)/);
  assert.match(html, /\/api\/dashboard\/ws/);
  assert.match(html, /function animateBoardMoves/);
  assert.match(html, /data-card-key/);
  assert.match(html, /function retryBlockedWork/);
  assert.match(html, /\/api\/engine\/retry-blocked/);
  assert.match(html, /data-retry-entity-type/);
  assert.match(html, /data-retry-entity-id/);
  assert.match(html, /\.work-card\.moving/);
  assert.match(html, /\.work-card-action/);
  assert.match(html, /@keyframes card-enter/);
  assert.equal(DASHBOARD_I18N.en["action.Continue work"], "Continue work");
  assert.equal(DASHBOARD_I18N.zh["action.Continue work"], "继续推进");
  assert.equal(DASHBOARD_I18N.en["copy.Tool execution"], "Tool execution");
  assert.equal(DASHBOARD_I18N.zh["copy.Tool execution"], "工具执行");
});

test("dashboard Agents layout includes narrow viewport overflow guards", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /\.agent-summary-card\s*\{[^}]*min-width:\s*0;/s);
  assert.match(html, /\.agent-summary-card h2\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(html, /\.capability-count\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(html, /\.status-pill\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(html, /\.modal-head\s*>\s*div\s*\{[^}]*min-width:\s*0;/s);
  assert.match(html, /\.modal-actions\s*\{[^}]*flex-wrap:\s*wrap;/s);
  assert.match(html, /@media \(max-width: 980px\)\s*\{[\s\S]*\.one-one-body\s*\{[^}]*grid-template-rows:\s*auto auto;[\s\S]*\.one-one-sidebar\s*\{[^}]*overflow:\s*visible;/s);
  assert.match(html, /@media \(max-width: 600px\)\s*\{[^}]*\.agent-card-actions \.quiet-button,\s*\.modal-actions \.quiet-button,\s*\.modal-actions \.action-button\s*\{[^}]*flex:\s*1 1 100%;/s);
});

test("one one memory draft uses the latest real Agent reply", () => {
  const history = [
    { role: "agent", text: "Older procedure.", reply: { message: "Older procedure." } },
    { role: "user", text: "What should I teach you?" },
    { role: "agent", text: "Latest durable procedure.", reply: { finalMessage: "Latest durable procedure." } },
    { role: "agent", text: "Error: model provider timed out" }
  ];

  assert.equal(lastAgentMemoryDraftText(history), "Latest durable procedure.");
  assert.equal(lastAgentMemoryDraftText([{ role: "agent", text: "No response." }]), "");
  assert.equal(lastAgentMemoryDraftText(null), "");
});

test("dashboard Agents surface context readiness from Agent memory", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /function agentMemoryCountText/);
  assert.match(html, /dashboardAgentMemory\(role\)/);
  assert.match(html, /oneOne\.memoryBrief/);
  assert.match(html, /oneOne\.recentMemory/);
  assert.match(html, /oneOne\.gap\.provider_model\.label/);
  assert.match(html, /oneOne\.gap\.tool_policy\.label/);
  assert.match(html, /oneOne\.gap\.wake_rules\.label/);
  assert.match(html, /agent\.memory/);
  assert.match(html, /memory\.facts \|\| \[\]/);
  assert.match(html, /memory\.playbooks \|\| \[\]/);
  assert.match(html, /memory\.coachingJournalPreview/);
  assert.match(html, /memory\.contextNeeds \|\| \[\]/);
  assert.match(html, /memory\.openContextNeedCount/);
  assert.match(html, /oneOneMemorySummary\(role\)/);
  assert.equal(DASHBOARD_I18N.en["oneOne.coachingJournal"], "Coaching journal");
  assert.equal(DASHBOARD_I18N.zh["oneOne.coachingJournal"], "辅导记录");
  assert.equal(DASHBOARD_I18N.en["oneOne.contextNeedsBacklog"], "Context needs backlog");
  assert.equal(DASHBOARD_I18N.zh["oneOne.contextNeedsBacklog"], "上下文需求清单");
  assert.equal(DASHBOARD_I18N.en["oneOne.saveMemoryAndClose"], "Save memory and close need");
  assert.equal(DASHBOARD_I18N.zh["oneOne.saveMemoryAndClose"], "保存记忆并关闭需求");
  assert.equal(DASHBOARD_I18N.en["oneOne.dismissNeed"], "Dismiss");
  assert.equal(DASHBOARD_I18N.zh["oneOne.markAnswered"], "标记已回答");
});

test("dashboard Settings Channels presents a productized Feishu connection card by default", () => {
  const html = renderDashboardPage(baseDashboardData());
  const defaultCard = feishuDefaultCardSource(html);

  assert.match(defaultCard, /Feishu/);
  assert.match(defaultCard, /Connect Feishu/);
  assert.match(defaultCard, /Long Connection\/WebSocket/);
  assert.match(defaultCard, /Receive messages/);
  assert.match(defaultCard, /Reply messages/);
  assert.match(defaultCard, /Credentials/);
  assert.match(defaultCard, /scanFeishu/);
  assert.match(html, /\/api\/channels\/feishu\/scan/);
  assert.doesNotMatch(defaultCard, /<label>App ID<\/label>/);
  assert.doesNotMatch(defaultCard, /<label>App Secret<\/label>/);
  assert.doesNotMatch(defaultCard, /Event mode/);
  assert.doesNotMatch(defaultCard, /feishuEventMode/);
  assert.doesNotMatch(defaultCard, /Feishu tool helper/);
  assert.doesNotMatch(defaultCard, /feishu-cli/);
  assert.doesNotMatch(defaultCard, /public base url/i);
  assert.doesNotMatch(defaultCard, /callback/i);
});

test("dashboard Settings renders the global Coding Agent launcher as a productized card", () => {
  const html = renderDashboardPage(baseDashboardData());
  const source = sourceBetween(html, "function codingAgentLauncher", "function feishuConnected");

  assert.match(source, /provider-summary-grid/);
  assert.match(source, /coding-agent-card/);
  assert.match(source, /open-coding-agent-editor/);
  assert.match(source, /saved: true/);
  assert.match(source, /saved: false/);
  assert.match(source, /needs_config/);
  assert.match(source, /codingAgentLauncherEditorModal/);
  assert.match(source, /!state\.editingCodingAgentLauncherId/);
  assert.match(source, /launcher-command-template/);
  assert.match(source, /Keep these template variables:/);
  assert.match(source, /<code>{{workspace}}<\/code>, <code>{{prompt}}<\/code>/);
  assert.doesNotMatch(source, /launcher-args/);
  assert.doesNotMatch(source, /launcher-env-summary/);
  assert.doesNotMatch(source, /languageSwitchHtml\(\)/);
  assert.doesNotMatch(source, /open-new-coding-agent-editor/);
  assert.doesNotMatch(source, /id="launcherCommand"/);
  assert.doesNotMatch(source, /raw\.split/);
});

test("dashboard Settings Channels presents productized Feishu behavior settings", () => {
  const html = renderDashboardPage(baseDashboardData());
  const defaultCard = feishuDefaultCardSource(html);

  assert.match(defaultCard, /Feishu behavior settings/);
  assert.match(defaultCard, /Access control/);
  assert.match(defaultCard, /Anyone who can message the bot/);
  assert.match(defaultCard, /Only listed Feishu IDs/);
  assert.match(defaultCard, /Restricted allowlist/);
  assert.match(defaultCard, /User open IDs/);
  assert.match(defaultCard, /Chat IDs/);
  assert.match(defaultCard, /Feishu identifiers/);
  assert.match(defaultCard, /Group messages/);
  assert.match(defaultCard, /Mention-only/);
  assert.match(defaultCard, /Every group message/);
  assert.match(defaultCard, /Thread isolation/);
  assert.match(defaultCard, /Save Feishu/);
  assert.doesNotMatch(defaultCard, /Bot display name/);
  assert.doesNotMatch(defaultCard, /Allow users/);
  assert.doesNotMatch(defaultCard, /Allow chats/);
  assert.doesNotMatch(defaultCard, /Progress style/);
  assert.doesNotMatch(defaultCard, /Done marker/);
  assert.doesNotMatch(defaultCard, /Interactive cards/);
  assert.doesNotMatch(defaultCard, /feishuBotName/);
  assert.doesNotMatch(defaultCard, /feishuProgressStyle/);
  assert.doesNotMatch(defaultCard, /feishuDoneEmoji/);
  assert.doesNotMatch(defaultCard, /feishuCardEnabled/);
});

test("dashboard Settings Channels hides Feishu allowlist panels with CSS when hidden", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.match(html, /\.field\s*\{[^}]*display:\s*flex;/s);
  assert.match(html, /\.feishu-allowlist-panel\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/s);
});

test("dashboard Settings Channels keeps Feishu manual binding in an advanced disclosure", () => {
  const html = renderDashboardPage(baseDashboardData());
  const advanced = feishuAdvancedSource(html);

  assert.match(advanced, /Advanced manual binding/);
  assert.match(advanced, /<label>App ID<\/label>/);
  assert.match(advanced, /<label>App Secret<\/label>/);
  assert.match(advanced, /Feishu setup command/);
  assert.doesNotMatch(advanced, /Feishu tool helper/);
  assert.doesNotMatch(advanced, /feishu-cli/);
  assert.doesNotMatch(advanced, /Restricted allowlist/);
  assert.doesNotMatch(advanced, /User open IDs/);
  assert.doesNotMatch(advanced, /Chat IDs/);
  assert.doesNotMatch(advanced, /Allow users/);
  assert.doesNotMatch(advanced, /Allow chats/);
  assert.doesNotMatch(advanced, /public base url/i);
  assert.doesNotMatch(advanced, /callback/i);
  assert.doesNotMatch(advanced, /Event mode/);
});

test("dashboard Feishu save payload follows access control mode", () => {
  const html = renderDashboardPage(baseDashboardData());
  const source = sourceBetween(html, 'document.getElementById("saveFeishu")?.addEventListener("click"', 'document.getElementById("testFeishu")?.addEventListener("click"');

  assert.match(source, /feishuAccessMode/);
  assert.match(source, /accessMode === "restricted"/);
  assert.match(source, /allowFrom: accessMode === "restricted" \? optionalInput\("feishuAllowFrom"\) : ""/);
  assert.match(source, /allowChat: accessMode === "restricted" \? optionalInput\("feishuAllowChat"\) : ""/);
  assert.doesNotMatch(source, /botName:\s*optionalInput\("feishuBotName"\)/);
  assert.doesNotMatch(source, /progressStyle:\s*optionalInput\("feishuProgressStyle"\)/);
  assert.doesNotMatch(source, /doneEmoji:\s*optionalInput\("feishuDoneEmoji"\)/);
  assert.doesNotMatch(source, /enableFeishuCard:/);
});

test("dashboard Settings Channels omits Feishu public base URL field", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.doesNotMatch(html, /<label>Public base URL<\/label>/);
  assert.doesNotMatch(html, /feishuPublicBaseUrl/);
});

test("dashboard Feishu scan details omit webhook callback candidates", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.doesNotMatch(html, /callbackCandidatesForWebhookMode/);
});

test("dashboard Feishu save payload omits publicBaseUrl", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.doesNotMatch(html, /publicBaseUrl:\s*optionalInput\("feishuPublicBaseUrl"\)/);
});

test("dashboard Feishu websocket UI omits IPv6 callback placeholders and webhook callback paths", () => {
  const html = renderDashboardPage(baseDashboardData());

  assert.doesNotMatch(html, /ipv6/i);
  assert.doesNotMatch(html, /\/webhooks\/feishu/);
});
