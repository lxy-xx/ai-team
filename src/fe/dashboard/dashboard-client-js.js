import { WORK_CARD_PAPERCLIP_DATA_URI } from "./dashboard-assets.js";
import { renderDashboardI18nBootstrap } from "./dashboard-i18n.js";

export function lastAgentMemoryDraftText(history = []) {
  return [...(Array.isArray(history) ? history : [])]
    .reverse()
    .find((item) => item?.role === "agent" && item.reply && (item.reply.message || item.reply.finalMessage) && item.text)
    ?.text || "";
}

function renderDashboardClientJsLegacy(initialJson) {
  return "    window.__DASHBOARD_DATA__ = " + initialJson + ";\n    const state = { data: window.__DASHBOARD_DATA__, tab: \"Work Board\", filter: \"All\", channelOutput: undefined, registrationPoll: undefined, editingAgentRole: undefined, newAgentDraft: undefined, chatAgentRole: undefined, chatHistory: {}, chatSending: false, editingProviderId: undefined, providerDraft: undefined };\n    const bootParams = new URLSearchParams(window.location.search);\n    const bootToken = bootParams.get(\"token\") || bootParams.get(\"admin_token\");\n    const bootTab = bootParams.get(\"tab\");\n    if (bootTab && (state.data.nav || []).includes(bootTab)) state.tab = bootTab;\n    if (bootToken) {\n      localStorage.setItem(\"aiTeamAdminToken\", bootToken);\n      bootParams.delete(\"token\");\n      bootParams.delete(\"admin_token\");\n      const cleanQuery = bootParams.toString();\n      window.history.replaceState({}, \"\", window.location.pathname + (cleanQuery ? \"?\" + cleanQuery : \"\") + window.location.hash);\n    }\n    const escapeHtml = (value) => String(value ?? \"\")\n      .replaceAll(\"&\", \"&amp;\")\n      .replaceAll(\"<\", \"&lt;\")\n      .replaceAll(\">\", \"&gt;\")\n      .replaceAll('\"', \"&quot;\")\n      .replaceAll(\"'\", \"&#39;\");\n\n    function matchesFilter(item) {\n      if (state.filter === \"All\" || state.filter === \"This week\") return true;\n      return item.owner === state.filter;\n    }\n\n    function byId(id) {\n      return document.getElementById(id);\n    }\n\n    function engineSnapshot() {\n      return state.data.engine?.snapshot || {};\n    }\n\n    function formatDate(value) {\n      if (!value) return \"-\";\n      const date = new Date(value);\n      if (Number.isNaN(date.getTime())) return String(value);\n      return date.toLocaleString();\n    }\n\n    function statusPill(status) {\n      return '<span class=\"status-pill ' + escapeHtml(status || \"unknown\") + '\">' + escapeHtml(status || \"unknown\") + '</span>';\n    }\n\n    function traceLine(cells) {\n      return '<div class=\"trace-line\">' + cells.map((cell, index) =>\n        '<span class=\"' + (index === 0 ? 'label-cell ' : '') + (cell?.mono ? 'mono' : '') + '\">' + escapeHtml(cell?.value ?? cell ?? \"-\") + '</span>'\n      ).join(\"\") + '</div>';\n    }\n\n    function emptyPanel(title, message) {\n      return '<article class=\"panel wide-panel\"><h2>' + escapeHtml(title) + '</h2><p class=\"small\">' + escapeHtml(message) + '</p></article>';\n    }\n\n    function renderNav() {\n      const nav = byId(\"nav\");\n      if (!nav) return;\n      nav.innerHTML = (state.data.nav || []).map((tab) =>\n        '<button class=\"' + (state.tab === tab ? 'active' : '') + '\" data-tab=\"' + escapeHtml(tab) + '\">' + escapeHtml(tab) + '</button>'\n      ).join(\"\");\n      document.querySelectorAll(\"#nav button\").forEach((button) => {\n        button.addEventListener(\"click\", () => {\n          state.tab = button.dataset.tab;\n          document.querySelectorAll(\".tab\").forEach((tab) => tab.classList.toggle(\"active\", tab.dataset.tab === state.tab));\n          render();\n        });\n      });\n    }\n\n    function renderFilters() {\n      const filters = byId(\"filters\");\n      if (!filters) return;\n      filters.innerHTML = (state.data.filters || []).map((filter) =>\n        '<button class=\"chip-button ' + (state.filter === filter ? 'active' : '') + '\" data-filter=\"' + escapeHtml(filter) + '\">' + escapeHtml(filter) + '</button>'\n      ).join(\"\");\n      document.querySelectorAll(\"#filters button\").forEach((button) => {\n        button.addEventListener(\"click\", () => {\n          state.filter = button.dataset.filter;\n          render();\n        });\n      });\n    }\n\n    function card(item, columnAccent) {\n      const accent = item.dot || columnAccent || \"orange\";\n      const steps = (item.steps || []).map((step) =>\n        '<span class=\"step ' + (step.done ? 'done' : '') + '\">' + escapeHtml(step.label) + (step.done ? ' ✓' : '') + '</span>'\n      ).join(\"\");\n      const involvedAgents = (item.involvedAgents || []).map((agent) =>\n        '<span class=\"agent-chip ' + (agent.active ? 'active' : '') + '\"><span class=\"initials ' + escapeHtml(agent.color) + '\">' + escapeHtml(agent.initials) + '</span>' + escapeHtml(agent.name) + '</span>'\n      ).join(\"\");\n      const progress = typeof item.progress === \"number\" ? (\n        '<div class=\"progress-row\"><span class=\"progress-label\">Overall progress</span><span class=\"progress-number\">' + item.progress + '%</span></div>' +\n        '<div class=\"progress-track\"><div class=\"progress-fill\" style=\"width:' + item.progress + '%\"></div></div>'\n      ) : \"\";\n      return '<article class=\"work-card ' + accent + '\" data-owner=\"' + escapeHtml(item.owner) + '\">' +\n        (item.done ? '<div class=\"check\">✓</div>' : '') +\n        '<span class=\"status-dot ' + accent + '\"></span>' +\n        '<div class=\"card-id\">' + escapeHtml(item.id) + '</div>' +\n        '<div class=\"card-title\">' + escapeHtml(item.title) + '</div>' +\n        progress +\n        (steps ? '<div class=\"steps\">' + steps + '</div>' : '') +\n        (involvedAgents ? '<div class=\"agent-row\">' + involvedAgents + '</div>' : '') +\n        '<div class=\"meta-row\"><span class=\"agent\"><span class=\"initials ' + escapeHtml(item.ownerColor) + '\">' + escapeHtml(item.ownerInitials) + '</span>' + escapeHtml(item.owner) + '</span><span class=\"tag ' + escapeHtml(item.category) + '\">' + escapeHtml(item.category) + '</span></div>' +\n      '</article>';\n    }\n\n    function renderBoard() {\n      const board = byId(\"board\");\n      if (!board) return;\n      board.innerHTML = (state.data.columns || []).map((column) => {\n        const visible = (column.items || []).filter(matchesFilter);\n        const cards = visible.length ? visible.map((item) => card(item, column.accent)).join(\"\") : '<div class=\"empty\">No live work</div>';\n        return '<section class=\"column\">' +\n          '<div class=\"column-head\"><span class=\"accent ' + escapeHtml(column.accent) + '\"></span><span>' + escapeHtml(column.title) + '</span><span class=\"count-pill\">' + visible.length + '</span></div>' +\n          '<div class=\"cards\">' + cards + '</div>' +\n        '</section>';\n      }).join(\"\");\n    }\n\n    function panel(title, rows) {\n      return '<article class=\"panel\"><h2>' + escapeHtml(title) + '</h2>' + rows.map(([label, value]) =>\n        '<div class=\"row\"><span>' + escapeHtml(label) + '</span><span>' + escapeHtml(value) + '</span></div>'\n      ).join(\"\") + '</article>';\n    }\n\n    function renderTeam() {\n      const target = byId(\"team\");\n      if (!target) return;\n      const agents = state.data.agents || [];\n      const counts = state.data.counts || {};\n      const health = state.data.engine?.health || {};\n      const healthRows = [\n        [\"Engine\", health.ok === false ? \"not healthy\" : \"available\"],\n        [\"Memory\", health.memory?.ok === false ? \"degraded\" : \"healthy\"],\n        [\"Active runs\", health.activeRuns ?? counts.running ?? 0],\n        [\"Intents\", counts.intents ?? 0],\n        [\"Tasks\", counts.tasks ?? 0],\n        [\"Runs\", counts.runs ?? 0],\n        [\"Feedback\", counts.feedback ?? 0]\n      ];\n      const agentCards = agents.length ? agents.map((agent) => panel(agent.name || agent.role || \"Agent\", [\n        [\"Role\", agent.role || \"-\"],\n        [\"Title\", agent.title || \"-\"],\n        [\"State\", agent.active ? \"active\" : \"idle\"]\n      ])).join(\"\") : emptyPanel(\"Agents\", \"No agent roster is available.\");\n      target.innerHTML = panel(\"Engine Health\", healthRows) + agentCards;\n    }\n\n    function renderAgentConfig() {\n      const target = byId(\"agentConfig\");\n      if (!target) return;\n      const config = state.data.agentConfigs || {};\n      const agents = config.agents || [];\n      const agentCards = agents.map((agent) => {\n        const role = escapeHtml(agent.role);\n        const selectedModel = agentModelProvider(agent);\n        return '<article class=\"agent-summary-card open-agent-editor\" role=\"button\" tabindex=\"0\" data-role=\"' + role + '\">' +\n          '<h2>' + escapeHtml(agent.name || agent.title || agent.role) + ' <span class=\"status-pill configured\">' + role + '</span></h2>' +\n          '<p class=\"small\">' + escapeHtml(agentPromptSummary(agent, agent.title || agent.agentDir || \"\")) + '</p>' +\n          '<div class=\"capability-counts\">' +\n            '<span class=\"capability-count\">Prompt</span>' +\n            '<span class=\"capability-count\">' + (agent.skills || []).length + ' skills</span>' +\n            '<span class=\"capability-count\">' + (agent.mcps || []).length + ' MCP</span>' +\n            '<span class=\"capability-count\">' + (agent.tools || []).length + ' tools</span>' +\n            '<span class=\"capability-count\">' + (agent.wakeRules || []).length + ' wake rules</span>' +\n            '<span class=\"capability-count\">' + escapeHtml(selectedModel.providerId || \"provider\") + ' · ' + escapeHtml(selectedModel.model || \"model\") + '</span>' +\n          '</div>' +\n          '<div class=\"agent-card-actions\">' +\n            '<button class=\"quiet-button one-one-agent\" type=\"button\" data-role=\"' + role + '\">one one</button>' +\n            '<button class=\"quiet-button edit-agent\" type=\"button\" data-role=\"' + role + '\">Edit</button>' +\n          '</div>' +\n        '</article>';\n      }).join(\"\");\n      const addCard = '<button class=\"agent-summary-card add-agent-card open-new-agent-editor\" type=\"button\">' +\n        '<h2>+ Add Agent</h2>' +\n        '<p class=\"small\">创建新的 Agent 文件夹、AGENTS.md、tools、MCP、skills 和 wake rules。</p>' +\n      '</button>';\n      target.innerHTML = '<div class=\"agent-summary-grid\">' + agentCards + addCard + '</div>';\n      renderAgentConfigModal();\n      renderAgentChatModal();\n      wireAgentConfigActions();\n    }\n\n    function agentByRole(role) {\n      if (role === \"__new__\") return state.newAgentDraft;\n      return (state.data.agentConfigs?.agents || []).find((agent) => agent.role === role);\n    }\n\n    function agentPromptSummary(agent, fallback) {\n      const firstPromptLine = String(agent?.prompt || \"\").split(/\\\\n+/).map((line) => line.trim()).find(Boolean);\n      return firstPromptLine || agent?.agentDir || agent?.title || fallback || \"\";\n    }\n\n    function blankAgentDraft() {\n      const provider = defaultVisibleProvider();\n      return {\n        role: \"\",\n        name: \"\",\n        title: \"\",\n        prompt: \"\",\n        skills: [],\n        mcps: [],\n        tools: [\"memory.search\", \"engine.transition\", \"Bash\"],\n        modelProvider: {\n          providerId: provider?.id || \"codex\",\n          model: provider?.defaultModel || provider?.models?.[0]\n        },\n        wakeRules: [\n          {\n            entityType: \"intent\",\n            status: \"new\",\n            afterRunStatus: \"in_progress\"\n          }\n        ]\n      };\n    }\n\n    function modelProviderConfig() {\n      return state.data.modelProviders || state.data.agentConfigs?.modelProviders || {\n        defaultProviderId: state.data.settings?.provider || \"codex\",\n        providers: []\n      };\n    }\n\n    function providerList() {\n      const config = modelProviderConfig();\n      const providers = config.providers || [];\n      const visibleProviders = providers.filter((provider) => provider.id !== \"mock\" && provider.type !== \"mock\" && provider.internal !== true);\n      if (visibleProviders.length) return visibleProviders;\n      return [\n        {\n          id: config.defaultProviderId || state.data.settings?.provider || \"codex\",\n          name: state.data.settings?.provider || \"Codex Subscription\",\n          type: \"codex_app_server\",\n          runner: \"codex_app_server\",\n          authMode: \"subscription\",\n          models: [state.data.settings?.model || \"gpt-5.5\"].filter(Boolean),\n          defaultModel: state.data.settings?.model || \"gpt-5.5\"\n        }\n      ];\n    }\n\n    function providerById(id) {\n      const providers = providerList();\n      return providers.find((provider) => provider.id === id) || providers[0];\n    }\n\n    function defaultVisibleProvider() {\n      const config = modelProviderConfig();\n      return providerById(config.defaultProviderId) || providerList()[0];\n    }\n\n    function agentModelProvider(agent = {}) {\n      const config = modelProviderConfig();\n      const requestedProviderId = agent.modelProvider?.providerId || config.defaultProviderId || providerList()[0]?.id || \"codex\";\n      const provider = providerById(requestedProviderId);\n      return {\n        providerId: provider?.id || requestedProviderId,\n        model: provider?.models?.includes(agent.modelProvider?.model)\n          ? agent.modelProvider.model\n          : provider?.defaultModel || provider?.models?.[0] || \"\"\n      };\n    }\n\n    function optionList(options, selected) {\n      const normalized = [...options];\n      if (selected && !normalized.some((option) => option.value === selected)) {\n        normalized.unshift({ value: selected, label: selected });\n      }\n      return normalized.map((option) =>\n        '<option value=\"' + escapeHtml(option.value) + '\" ' + (option.value === selected ? \"selected\" : \"\") + '>' + escapeHtml(option.label) + '</option>'\n      ).join(\"\");\n    }\n\n    function providerOptions(selected) {\n      return optionList(providerList().map((provider) => ({\n        value: provider.id,\n        label: (provider.name || provider.id) + \" · \" + providerKindLabel(provider)\n      })), selected);\n    }\n\n    function modelOptions(provider, selected) {\n      const models = (provider?.models || []).map((model) => ({ value: model, label: model }));\n      return optionList(models, selected || provider?.defaultModel || models[0]?.value || \"\");\n    }\n\n    const WAKE_STATUS_OPTIONS = {\n      intent: [\"new\", \"routing\", \"in_progress\", \"done\", \"blocked\"],\n      task: [\"waiting\", \"working\", \"testing\", \"done\", \"blocked\"],\n      feedback: [\"new\", \"triaged\", \"linked_to_task\", \"done\", \"rejected\"]\n    };\n\n    function wakeStatusOptions(entityType, selected) {\n      const statuses = WAKE_STATUS_OPTIONS[entityType] || WAKE_STATUS_OPTIONS.intent;\n      return optionList(statuses.map((status) => ({ value: status, label: status })), selected);\n    }\n\n    function wakeRoleOptions(selected) {\n      const roles = [...new Set((state.data.agentConfigs?.agents || []).map((agent) => agent.role).filter(Boolean))];\n      return '<option value=\"\">Any matching task</option>' + optionList(roles.map((role) => ({ value: role, label: role })), selected);\n    }\n\n    function wakeFlowPreview(rule = {}, agent = {}) {\n      const entity = rule.entityType || \"intent\";\n      const status = rule.status || \"new\";\n      const condition = rule.condition ? \" when \" + rule.condition : \"\";\n      const consumer = rule.consumerRole ? \" for \" + rule.consumerRole : \"\";\n      const after = rule.afterRunStatus || \"unchanged\";\n      const agentName = agent.name || agent.role || \"Agent\";\n      return '<span class=\"wake-token\">' + escapeHtml(entity + \":\" + status + consumer + condition) + '</span>' +\n        '<span class=\"wake-arrow\">-></span><span class=\"wake-token\">' + escapeHtml(agentName) + '</span>' +\n        '<span class=\"wake-arrow\">-></span><span class=\"wake-token\">' + escapeHtml(after) + '</span>';\n    }\n\n    function wakeRulePreset(preset, agent = {}) {\n      const role = agent.role || \"\";\n      if (preset === \"intent\") return { entityType: \"intent\", status: \"new\", afterRunStatus: \"in_progress\" };\n      if (preset === \"task\") return { entityType: \"task\", status: \"waiting\", consumerRole: role, afterRunStatus: \"testing\" };\n      if (preset === \"qa\") return { entityType: \"task\", status: \"testing\", afterRunStatus: \"done\" };\n      if (preset === \"finalize\") return { entityType: \"intent\", status: \"in_progress\", condition: \"all_tasks_done\", afterRunStatus: \"done\" };\n      if (preset === \"feedback\") return { entityType: \"feedback\", status: \"new\", afterRunStatus: \"triaged\" };\n      return { entityType: \"intent\", status: \"new\", afterRunStatus: \"in_progress\" };\n    }\n\n    function wakeRuleCard(rule = {}, index = 0, agent = {}) {\n      const entity = rule.entityType || \"intent\";\n      const status = rule.status || (WAKE_STATUS_OPTIONS[entity] || WAKE_STATUS_OPTIONS.intent)[0];\n      const condition = rule.condition || \"\";\n      const after = rule.afterRunStatus || \"\";\n      const enabled = rule.enabled !== false;\n      return '<article class=\"wake-rule-card\" data-wake-index=\"' + index + '\">' +\n        '<div class=\"wake-flow-row\"><div class=\"wake-flow-preview\">' + wakeFlowPreview({ ...rule, entityType: entity, status, condition, afterRunStatus: after }, agent) + '</div><button class=\"quiet-button remove-wake-rule\" type=\"button\">Remove</button></div>' +\n        '<div class=\"wake-rule-fields\">' +\n          '<div class=\"field\"><label>Entity</label><select class=\"wake-entity-type\">' + optionList([{ value: \"intent\", label: \"Intent\" }, { value: \"task\", label: \"Task\" }, { value: \"feedback\", label: \"Feedback\" }], entity) + '</select></div>' +\n          '<div class=\"field\"><label>Status</label><select class=\"wake-status\">' + wakeStatusOptions(entity, status) + '</select></div>' +\n          '<div class=\"field wake-consumer-field\"><label>Task role</label><select class=\"wake-consumer-role\">' + wakeRoleOptions(rule.consumerRole || \"\") + '</select></div>' +\n          '<div class=\"field\"><label>Condition</label><select class=\"wake-condition\">' + optionList([{ value: \"\", label: \"No condition\" }, { value: \"all_tasks_done\", label: \"All tasks done\" }], condition) + '</select></div>' +\n          '<div class=\"field\"><label>After success</label><input class=\"wake-after-status\" value=\"' + escapeHtml(after) + '\" placeholder=\"done\"></div>' +\n          '<div class=\"field checkbox-row\"><input class=\"wake-enabled\" type=\"checkbox\" ' + (enabled ? \"checked\" : \"\") + '><label>Enabled</label></div>' +\n        '</div>' +\n      '</article>';\n    }\n\n    function wakeRuleBuilder(agent) {\n      const rules = agent.wakeRules || [];\n      const cards = rules.length\n        ? rules.map((rule, index) => wakeRuleCard(rule, index, agent)).join(\"\")\n        : '<p class=\"small\">No wake rules yet.</p>';\n      return '<div class=\"wake-rule-builder\">' +\n        '<div class=\"wake-rule-presets\">' +\n          '<button class=\"quiet-button add-wake-rule\" type=\"button\" data-preset=\"intent\">Consume Intent</button>' +\n          '<button class=\"quiet-button add-wake-rule\" type=\"button\" data-preset=\"task\">Assigned Task</button>' +\n          '<button class=\"quiet-button add-wake-rule\" type=\"button\" data-preset=\"qa\">Verification Gate</button>' +\n          '<button class=\"quiet-button add-wake-rule\" type=\"button\" data-preset=\"finalize\">Finalize Intent</button>' +\n          '<button class=\"quiet-button add-wake-rule\" type=\"button\" data-preset=\"feedback\">Feedback</button>' +\n        '</div>' +\n        '<div class=\"wake-rule-list\">' + cards + '</div>' +\n      '</div>';\n    }\n\n    function sampleMcpJson() {\n      return JSON.stringify({ mcpServers: { stitch: { url: \"https://stitch.googleapis.com/mcp\", headers: { \"X-Goog-Api-Key\": \"$\" + \"{STITCH_API_KEY}\" } } } }, null, 2);\n    }\n\n    function skillButton(skill) {\n      const title = skill.path ? ' title=\"' + escapeHtml(skill.path) + '\"' : \"\";\n      return '<button class=\"readonly-skill\" type=\"button\" disabled' + title + '>' + escapeHtml(skill.id) + '</button>';\n    }\n\n    function mcpPanel(mcp, index) {\n      const id = escapeHtml(mcp.id || (\"mcp-\" + index));\n      const open = index === 0 ? \" is-open\" : \"\";\n      const active = index === 0 ? \" active\" : \"\";\n      const json = mcp.configJson || JSON.stringify({ mcpServers: { [mcp.id || \"server\"]: mcp.config || {} } }, null, 2);\n      return '<div class=\"mcp-editor\" data-mcp-id=\"' + id + '\">' +\n        '<button class=\"mcp-json-button' + active + '\" type=\"button\" data-mcp-target=\"' + id + '\">' + id + '</button>' +\n        '<div class=\"mcp-json-panel' + open + '\" data-mcp-panel=\"' + id + '\">' +\n          '<textarea class=\"mcp-json\" spellcheck=\"false\">' + escapeHtml(json) + '</textarea>' +\n        '</div>' +\n      '</div>';\n    }\n\n    function renderAgentConfigModal() {\n      const root = byId(\"agentConfigModalRoot\");\n      if (!root) return;\n      const role = state.editingAgentRole;\n      const agent = role ? agentByRole(role) : undefined;\n      if (!agent) {\n        root.innerHTML = \"\";\n        return;\n      }\n      const isNewAgent = role === \"__new__\";\n      const tools = state.data.agentConfigs?.tools || [];\n      const roleEscaped = escapeHtml(isNewAgent ? \"__new__\" : agent.role);\n      const skills = agent.skills || [];\n      const mcps = agent.mcps || [];\n      const skillButtons = isNewAgent\n        ? '<span class=\"small\">Save the Agent before installing Skills.</span>'\n        : (skills.length ? skills.map(skillButton).join(\"\") : '<span class=\"small\">No local skills installed.</span>');\n      const skillInstaller = isNewAgent\n        ? \"\"\n        : '<div class=\"skill-install-row\"><input class=\"skill-install-command\" placeholder=\"npx skills install code-review\"><button class=\"quiet-button add-skill-command\" type=\"button\">Add Skill</button></div>';\n      const mcpEditors = mcps.length ? mcps.map(mcpPanel).join(\"\") : \"\";\n      const selectedModelProvider = agentModelProvider(agent);\n      const selectedProvider = providerById(selectedModelProvider.providerId);\n      const toolBoxes = tools.map((tool) => {\n        const active = (agent.tools || []).includes(tool.id);\n        const stateClass = active ? \"active\" : \"inactive\";\n        return '<button class=\"tool-toggle ' + stateClass + '\" type=\"button\" data-tool-id=\"' + escapeHtml(tool.id) + '\" aria-pressed=\"' + (active ? \"true\" : \"false\") + '\"><span class=\"tool-name\">' + escapeHtml(tool.id) + ' · ' + escapeHtml(tool.risk) + '</span><span class=\"tool-desc\">' + escapeHtml(tool.descriptionZh || tool.description || \"\") + '</span></button>';\n      }).join(\"\");\n      root.innerHTML = '<div class=\"modal-backdrop\" data-close-agent-editor=\"true\">' +\n        '<section class=\"agent-modal agent-config-card\" data-role=\"' + roleEscaped + '\" data-new-agent=\"' + (isNewAgent ? \"true\" : \"false\") + '\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Edit agent\">' +\n          '<div class=\"modal-head\">' +\n            '<div><h2>' + escapeHtml(isNewAgent ? \"New Agent\" : (agent.name || agent.title || agent.role)) + ' <span class=\"status-pill configured\">' + roleEscaped + '</span></h2><p class=\"small\">' + escapeHtml(agent.agentDir || agentPromptSummary(agent, \"Create a per-agent folder and routing rules.\")) + '</p></div>' +\n            '<button class=\"quiet-button close-agent-editor\" type=\"button\">Close</button>' +\n          '</div>' +\n          '<div class=\"agent-model-header\">' +\n            '<div class=\"agent-model-title\"><span>Model</span><strong>Provider and model for this Agent</strong></div>' +\n            '<div class=\"agent-model-controls\">' +\n              '<div class=\"field\"><label>Provider</label><select class=\"agent-provider-id\">' + providerOptions(selectedModelProvider.providerId) + '</select></div>' +\n              '<div class=\"field\"><label>Model</label><select class=\"agent-model\">' + modelOptions(selectedProvider, selectedModelProvider.model) + '</select></div>' +\n            '</div>' +\n          '</div>' +\n          '<div class=\"modal-body\">' +\n            '<div class=\"form-grid\">' +\n              '<div class=\"field\"><label>Role ID</label><input class=\"agent-role-id\" value=\"' + escapeHtml(agent.role || \"\") + '\" ' + (isNewAgent ? 'placeholder=\"requirements\"' : \"readonly\") + '></div>' +\n              '<div class=\"field\"><label>Name</label><input class=\"agent-name\" value=\"' + escapeHtml(agent.name || \"\") + '\" placeholder=\"Ada\"></div>' +\n              '<div class=\"field\"><label>Title</label><input class=\"agent-title\" value=\"' + escapeHtml(agent.title || \"\") + '\" placeholder=\"Requirements Analyst\"></div>' +\n              '<div class=\"field full\"><label>AGENTS.md</label><textarea class=\"agent-prompt\">' + escapeHtml(agent.prompt || \"\") + '</textarea><p class=\"field-help\">保存后会写入该 Agent 文件夹里的 AGENTS.md。</p></div>' +\n              '<div class=\"field full\"><label>Wake Rules</label>' + wakeRuleBuilder(agent) + '<p class=\"field-help\">配置这个 Agent 消费哪些 Engine 实体状态。引擎只负责扫描和唤醒，具体消费关系由这里声明。</p></div>' +\n              '<div class=\"field full\"><label>Skills</label><div class=\"capability-list skill-list\">' + skillButtons + '</div>' + skillInstaller + '<p class=\"field-help\">保存时会在该 Agent 文件夹内执行受限 npx skills 命令，安装结果进入本地 .agents/skills/；已添加 Skill 不在页面内编辑。</p></div>' +\n              '<div class=\"field full\"><label>MCP</label><div class=\"capability-list mcp-button-list\">' + mcpEditors + '</div><div class=\"mcp-json-panel is-open new-mcp-panel\"><textarea class=\"mcp-json new-mcp-json\" spellcheck=\"false\" placeholder=\"' + escapeHtml(sampleMcpJson()) + '\"></textarea></div><div class=\"actions\"><button class=\"quiet-button add-mcp-json\" type=\"button\">Add MCP JSON</button></div><p class=\"field-help\">MCP 使用标准 mcpServers JSON；每个 server 会保存到独立 .agents/mcp/&lt;name&gt;/mcp.json。</p></div>' +\n              '<div class=\"field full\"><label>Tools</label><div class=\"credential-list\">' + toolBoxes + '</div></div>' +\n            '</div>' +\n            '<p class=\"small agent-save-state\" id=\"agent-save-' + roleEscaped + '\"></p>' +\n          '</div>' +\n          '<div class=\"modal-actions\"><button class=\"quiet-button close-agent-editor\" type=\"button\">Cancel</button><button class=\"action-button primary save-agent\" type=\"button\" data-role=\"' + roleEscaped + '\">Save Agent</button></div>' +\n        '</section>' +\n      '</div>';\n    }\n\n    function chatHistoryFor(role) {\n      return state.chatHistory[role] || [];\n    }\n\n    function setChatHistory(role, history) {\n      state.chatHistory[role] = history.slice(-40);\n    }\n\n    function openAgentChat(role) {\n      state.chatAgentRole = role;\n      renderAgentChatModal();\n      wireAgentConfigActions();\n    }\n\n    function closeAgentChat() {\n      state.chatAgentRole = undefined;\n      state.chatSending = false;\n      renderAgentChatModal();\n    }\n\n    function renderChatMessage(item) {\n      const cls = item.role === \"agent\" ? \"agent\" : \"user\";\n      return '<div class=\"one-one-message ' + cls + '\">' + escapeHtml(item.text || \"\") + '</div>';\n    }\n\n    function renderAgentChatModal() {\n      const root = byId(\"agentChatModalRoot\");\n      if (!root) return;\n      const role = state.chatAgentRole;\n      const agent = role ? agentByRole(role) : undefined;\n      if (!agent) {\n        root.innerHTML = \"\";\n        return;\n      }\n      const history = chatHistoryFor(role);\n      const selected = agentModelProvider(agent);\n      const messages = history.length\n        ? history.map(renderChatMessage).join(\"\")\n        : '<p class=\"small\">直接和这个 Agent 对话。后端会加载它自己的 AGENTS.md、Skills、MCP、Tools 和模型配置。</p>';\n      root.innerHTML = '<div class=\"modal-backdrop chat-backdrop\" data-close-agent-chat=\"true\">' +\n        '<section class=\"agent-modal one-one-modal\" data-role=\"' + escapeHtml(role) + '\" role=\"dialog\" aria-modal=\"true\" aria-label=\"One one chat\">' +\n          '<div class=\"modal-head\">' +\n            '<div><h2>' + escapeHtml(agent.name || agent.title || role) + ' <span class=\"status-pill configured\">one one</span></h2><p class=\"small\">' + escapeHtml(agent.title || role) + '</p></div>' +\n            '<button class=\"quiet-button close-agent-chat\" type=\"button\">Close</button>' +\n          '</div>' +\n          '<div class=\"one-one-body\">' +\n            '<div class=\"one-one-context\">' +\n              '<span class=\"capability-count\">Prompt loaded</span>' +\n              '<span class=\"capability-count\">' + (agent.skills || []).length + ' skills</span>' +\n              '<span class=\"capability-count\">' + (agent.mcps || []).length + ' MCP</span>' +\n              '<span class=\"capability-count\">' + (agent.tools || []).length + ' tools</span>' +\n              '<span class=\"capability-count\">' + escapeHtml(selected.providerId || \"provider\") + ' · ' + escapeHtml(selected.model || \"model\") + '</span>' +\n            '</div>' +\n            '<div class=\"one-one-messages\">' + messages + '</div>' +\n          '</div>' +\n          '<div class=\"one-one-composer\">' +\n            '<textarea class=\"one-one-input\" placeholder=\"Message ' + escapeHtml(agent.name || role) + '\" ' + (state.chatSending ? \"disabled\" : \"\") + '></textarea>' +\n            '<button class=\"action-button primary send-one-one\" type=\"button\" ' + (state.chatSending ? \"disabled\" : \"\") + '>' + (state.chatSending ? \"Sending...\" : \"Send\") + '</button>' +\n          '</div>' +\n        '</section>' +\n      '</div>';\n      const messagesEl = root.querySelector(\".one-one-messages\");\n      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;\n    }\n\n    function renderIntentDetail() {\n      const target = byId(\"intentDetail\");\n      if (!target) return;\n      const snapshot = engineSnapshot();\n      const intents = [...(snapshot.intents || [])].sort((a, b) =>\n        String(b.updatedAt || b.createdAt || \"\").localeCompare(String(a.updatedAt || a.createdAt || \"\"))\n      );\n      const intent = intents[0];\n      if (!intent) {\n        target.innerHTML = emptyPanel(\"Intent Detail\", \"No Engine intents are available.\");\n        return;\n      }\n      const tasks = (snapshot.tasks || []).filter((task) => task.intentId === intent.id || (intent.taskIds || []).includes(task.id));\n      const artifacts = (snapshot.artifacts || []).filter((artifact) => artifact.intentId === intent.id || (intent.artifactIds || []).includes(artifact.id));\n      const operations = [intent, ...tasks].flatMap((entity) =>\n        (entity.operations || []).map((operation) => ({\n          ...operation,\n          entityId: entity.id,\n          entityType: entity.id === intent.id ? \"intent\" : \"task\"\n        }))\n      );\n      const taskRows = tasks.length ? tasks.map((task) => traceLine([\n        { value: task.id, mono: true },\n        task.title || task.description || \"-\",\n        (task.consumerRole || task.producerRole || \"-\") + \" · \" + (task.status || \"-\"),\n        \"deps: \" + ((task.dependencies || []).join(\", \") || \"-\")\n      ])).join(\"\") : '<p class=\"small\">No tasks have been created for this intent.</p>';\n      const artifactRows = artifacts.length ? artifacts.map((artifact) => traceLine([\n        { value: artifact.id, mono: true },\n        artifact.kind || \"-\",\n        artifact.role || artifact.entityType || \"-\",\n        (artifact.status || \"-\") + \" · \" + formatDate(artifact.createdAt)\n      ])).join(\"\") : '<p class=\"small\">No sanitized artifacts are linked to this intent.</p>';\n      const operationRows = operations.length ? operations.map((operation) => traceLine([\n        { value: operation.entityType + \" · \" + operation.entityId, mono: true },\n        operation.agentRole || \"-\",\n        (operation.fromStatus || \"-\") + \" -> \" + (operation.toStatus || \"-\"),\n        formatDate(operation.at)\n      ])).join(\"\") : '<p class=\"small\">No entity operations have been recorded yet.</p>';\n      target.innerHTML =\n        '<article class=\"panel\">' +\n          '<h2>Intent</h2>' +\n          '<div class=\"row\"><span>ID</span><span class=\"mono\">' + escapeHtml(intent.id) + '</span></div>' +\n          '<div class=\"row\"><span>Status</span><span>' + statusPill(intent.status) + '</span></div>' +\n          '<div class=\"row\"><span>Channel</span><span>' + escapeHtml(intent.source?.channel || \"cli\") + '</span></div>' +\n          '<div class=\"row\"><span>Owner</span><span>' + escapeHtml(intent.consumerRole || \"ceo_cto\") + '</span></div>' +\n          '<div class=\"row\"><span>Updated</span><span>' + escapeHtml(formatDate(intent.updatedAt || intent.createdAt)) + '</span></div>' +\n          '<p class=\"small\">' + escapeHtml(intent.goal || intent.finalSummary || \"No goal text\") + '</p>' +\n        '</article>' +\n        '<article class=\"panel\"><h2>Task Graph</h2><div class=\"trace-list\">' + taskRows + '</div></article>' +\n        '<article class=\"panel wide-panel\"><h2>Agent Operations</h2><div class=\"trace-list\">' + operationRows + '</div></article>' +\n        '<article class=\"panel wide-panel\"><h2>Artifacts</h2><div class=\"trace-list\">' + artifactRows + '</div></article>';\n    }\n\n    function renderFeedbackLoop() {\n      const target = byId(\"feedbackLoop\");\n      if (!target) return;\n      const feedback = engineSnapshot().feedback || [];\n      if (!feedback.length) {\n        target.innerHTML = emptyPanel(\"Feedback Loop\", \"No feedback has been captured.\");\n        return;\n      }\n      target.innerHTML = feedback.map((item) => panel(item.id || \"Feedback\", [\n        [\"Status\", item.status || \"new\"],\n        [\"Text\", item.text || item.summary || \"-\"],\n        [\"Intent\", item.intentId || item.linkedIntentId || \"-\"],\n        [\"Task\", item.taskId || item.linkedTaskId || \"-\"],\n        [\"Channel\", item.source?.channel || \"-\"],\n        [\"Updated\", formatDate(item.updatedAt || item.createdAt)]\n      ])).join(\"\");\n    }\n\n    function renderRuns() {\n      const target = byId(\"runs\");\n      if (!target) return;\n      const runs = [...(engineSnapshot().runs || [])].sort((a, b) =>\n        String(b.startedAt || b.createdAt || \"\").localeCompare(String(a.startedAt || a.createdAt || \"\"))\n      );\n      if (!runs.length) {\n        target.innerHTML = emptyPanel(\"Runs\", \"No Engine runs have been recorded.\");\n        return;\n      }\n      target.innerHTML = runs.map((run) => panel(run.id || \"Run\", [\n        [\"Agent\", run.agentRole || \"-\"],\n        [\"Status\", run.status || \"-\"],\n        [\"Entity\", (run.entityType || \"-\") + \" · \" + (run.entityId || \"-\")],\n        [\"Runner\", run.runner || \"-\"],\n        [\"Provider\", run.provider || \"-\"],\n        [\"Model\", run.model || \"-\"],\n        [\"Started\", formatDate(run.startedAt || run.createdAt)],\n        [\"Completed\", formatDate(run.completedAt)],\n        [\"Artifacts\", (run.artifactIds || []).join(\", \") || \"-\"],\n        [\"Error\", run.error?.message || \"-\"]\n      ])).join(\"\");\n    }\n\n    function renderClients() {\n      const target = byId(\"clients\");\n      if (!target) return;\n      const items = (state.data.clients || []).length ? state.data.clients : [{ name: \"No clients yet\", channel: \"-\", tasks: 0, feedback: 0, latest: \"-\" }];\n      target.innerHTML = items.map((client) => panel(client.name, [\n        [\"Channel\", client.channel],\n        [\"Intents\", client.intents ?? \"-\"],\n        [\"Tasks\", client.tasks ?? \"-\"],\n        [\"Feedback\", client.feedback],\n        [\"Latest\", client.latest]\n      ])).join(\"\");\n    }\n\n    function renderKnowledge() {\n      const target = byId(\"knowledge\");\n      if (!target) return;\n      const facts = state.data.knowledge?.facts || [];\n      const events = state.data.knowledge?.recentEvents || [];\n      target.innerHTML =\n        panel(\"Facts\", facts.length ? facts.map((fact) => [fact.key, JSON.stringify(fact.value)]) : [[\"State\", \"No durable facts yet\"]]) +\n        panel(\"Recent Memory\", events.length ? events.map((event) => [event.type, event.summary || event.text || event.taskId || event.id]) : [[\"State\", \"No memory events yet\"]]);\n    }\n\n    function renderReports() {\n      const target = byId(\"reports\");\n      if (!target) return;\n      const report = state.data.reports || {};\n      target.innerHTML =\n        '<article class=\"panel\"><h2>Completed</h2><div class=\"metric\">' + report.throughput + '</div><p class=\"small\">Tasks delivered by the AI team.</p></article>' +\n        '<article class=\"panel\"><h2>Active</h2><div class=\"metric\">' + report.active + '</div><p class=\"small\">Work still moving through the board.</p></article>' +\n        '<article class=\"panel\"><h2>Verification</h2><div class=\"metric\">' + report.rejectionRate + '%</div><p class=\"small\">' + report.qaRejects + ' rejects across ' + report.qaRuns + ' QA runs.</p></article>' +\n        '<article class=\"panel\"><h2>Customer Feedback</h2><div class=\"metric\">' + report.feedback + '</div><p class=\"small\">Items extracted by customer success from conversations.</p></article>';\n    }\n\n    function credentialPills(credentials) {\n      return Object.entries(credentials || {}).map(([name, value]) => {\n        const label = name.replace(/[A-Z]/g, (match) => \" \" + match.toLowerCase());\n        const configured = value && value.configured;\n        const source = value && value.source ? \" · \" + value.source : \"\";\n        return '<span class=\"credential ' + (configured ? 'ok' : '') + '\">' + escapeHtml(label) + ': ' + (configured ? 'set' : 'missing') + escapeHtml(source) + '</span>';\n      }).join(\"\");\n    }\n\n    function providerAccessMode(provider = {}) {\n      if ((provider.authMode || \"subscription\") === \"api_key\") return \"api_key\";\n      return \"subscription\";\n    }\n\n    function providerAccessOptions(selected) {\n      return optionList([\n        { value: \"subscription\", label: \"Subscription\" },\n        { value: \"api_key\", label: \"API Key\" }\n      ], selected || \"api_key\");\n    }\n\n    function providerPreset(provider = {}) {\n      if (provider.provider === \"deepseek\" || provider.id === \"deepseek\" || String(provider.baseUrl || \"\").includes(\"deepseek\")) return \"deepseek\";\n      return \"custom\";\n    }\n\n    function providerPresetOptions(selected) {\n      return optionList([\n        { value: \"deepseek\", label: \"DeepSeek\" },\n        { value: \"custom\", label: \"Custom Base URL\" }\n      ], selected || \"deepseek\");\n    }\n\n    function providerAuthMode(provider) {\n      if ((provider.type || \"codex_app_server\") === \"mock\") return \"none\";\n      return provider.authMode || \"subscription\";\n    }\n\n    function providerKindLabel(provider) {\n      const type = provider.type || \"codex_app_server\";\n      const authMode = providerAuthMode(provider);\n      if (provider.provider === \"deepseek\" || provider.id === \"deepseek\" || String(provider.baseUrl || \"\").includes(\"deepseek\")) return \"DeepSeek\";\n      if (type === \"mock\") return \"Internal\";\n      if (authMode === \"api_key\") return \"API key\";\n      if (authMode === \"subscription\") return \"Subscription\";\n      return \"No auth\";\n    }\n\n    function providerModelChips(provider) {\n      return (provider.models || []).map((model) =>\n        '<button class=\"model-chip remove-model-chip\" type=\"button\" data-model=\"' + escapeHtml(model) + '\">' + escapeHtml(model) + ' x</button>'\n      ).join(\"\");\n    }\n\n    function providerSummaryLine(provider) {\n      const authMode = providerAuthMode(provider);\n      if (authMode === \"subscription\") return \"Subscription login\";\n      if (authMode === \"api_key\" && providerPreset(provider) === \"deepseek\") return \"API Key · DeepSeek preset\";\n      if (authMode === \"api_key\") return \"API Key · Custom Base URL\";\n      return provider.enabled === false ? \"Disabled provider\" : \"Model provider\";\n    }\n\n    function blankProviderDraft() {\n      return {\n        id: \"\",\n        name: \"\",\n        type: \"openai_compatible\",\n        provider: \"deepseek\",\n        authMode: \"api_key\",\n        apiKeyEnv: \"DEEPSEEK_API_KEY\",\n        baseUrl: \"https://api.deepseek.com\",\n        models: [\"deepseek-chat\", \"deepseek-reasoner\"],\n        defaultModel: \"deepseek-chat\",\n        enabled: true\n      };\n    }\n\n    function providerEditorDraft() {\n      if (!state.editingProviderId) return undefined;\n      if (state.editingProviderId === \"__new__\") return state.providerDraft || blankProviderDraft();\n      return providerById(state.editingProviderId);\n    }\n\n    function providerSummaryCard(provider, isDefault) {\n      const access = providerKindLabel(provider);\n      const models = provider.models || (provider.defaultModel ? [provider.defaultModel] : []);\n      return '<article class=\"provider-card open-provider-editor\" role=\"button\" tabindex=\"0\" data-provider-id=\"' + escapeHtml(provider.id || \"\") + '\">' +\n        '<div><h2>' + escapeHtml(provider.name || provider.id || \"Model Provider\") + ' ' + (isDefault ? '<span class=\"status-pill configured\">default</span>' : '') + '</h2>' +\n        '<p class=\"small\">' + escapeHtml(providerSummaryLine(provider)) + '</p></div>' +\n        '<div class=\"provider-card-meta\">' +\n          '<span class=\"capability-count\">' + escapeHtml(access) + '</span>' +\n          '<span class=\"capability-count\">' + escapeHtml(provider.defaultModel || models[0] || \"model\") + '</span>' +\n          '<span class=\"capability-count\">' + models.length + ' models</span>' +\n          '<span class=\"capability-count\">' + (provider.enabled === false ? 'disabled' : 'enabled') + '</span>' +\n        '</div>' +\n      '</article>';\n    }\n\n    function providerEditorModal() {\n      const root = byId(\"providerConfigModalRoot\");\n      if (!root) return;\n      const provider = providerEditorDraft();\n      if (!provider) {\n        root.innerHTML = \"\";\n        return;\n      }\n      const isNew = state.editingProviderId === \"__new__\";\n      const id = provider.id || \"\";\n      const type = provider.type || \"codex_app_server\";\n      const authMode = providerAuthMode({ ...provider, type });\n      const accessMode = providerAccessMode({ ...provider, type, authMode });\n      const preset = providerPreset(provider);\n      const models = provider.models || (provider.defaultModel ? [provider.defaultModel] : []);\n      const defaultModel = provider.defaultModel || models[0] || \"\";\n      const modelOptionsHtml = optionList(models.map((model) => ({ value: model, label: model })), defaultModel);\n      root.innerHTML = '<div class=\"modal-backdrop\" data-close-provider-editor=\"true\">' +\n        '<section class=\"agent-modal provider-editor-card\" data-provider-id=\"' + escapeHtml(id || \"__new_provider__\") + '\" data-new-provider=\"' + (isNew ? \"true\" : \"false\") + '\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Edit model provider\">' +\n        '<div class=\"modal-head\">' +\n          '<div><h2>' + escapeHtml(isNew ? \"New Model Provider\" : (provider.name || provider.id)) + '</h2><p class=\"small\">' + escapeHtml(authMode === \"api_key\" ? \"API Key 模式只保存环境变量名，不保存明文密钥。\" : \"订阅模式使用本机 Codex app-server 登录。\") + '</p></div>' +\n          '<button class=\"quiet-button close-provider-editor\" type=\"button\">Close</button>' +\n        '</div>' +\n        '<div class=\"modal-body\">' +\n        '<div class=\"provider-editor-head\">' +\n          '<div><h2>Model Provider</h2><p class=\"small\">Agent 页面只选择 Provider 和 Model；这里维护 Provider 自身的认证方式和模型列表。</p></div>' +\n          '<span class=\"provider-kind-badge\">' + escapeHtml(providerKindLabel({ ...provider, type, authMode })) + '</span>' +\n        '</div>' +\n        '<div class=\"provider-base-grid\">' +\n          '<div class=\"field\"><label>Name</label><input class=\"provider-name\" value=\"' + escapeHtml(provider.name || \"\") + '\" placeholder=\"DeepSeek\"></div>' +\n          '<div class=\"field\"><label>Access</label><select class=\"provider-access-mode\">' + providerAccessOptions(accessMode) + '</select></div>' +\n          '<div class=\"field checkbox-row\"><input class=\"provider-enabled\" type=\"checkbox\" ' + (provider.enabled === false ? \"\" : \"checked\") + '><label>Enabled</label></div>' +\n        '</div>' +\n        '<section class=\"provider-auth-panel provider-subscription-panel' + (accessMode === \"subscription\" ? \"\" : \" is-hidden\") + '\">' +\n          '<div class=\"provider-panel-title\"><h3>Subscription login</h3><span>使用本机 Codex app-server；Check Provider 会检查 login status。</span></div>' +\n          '<div class=\"provider-panel-grid\">' +\n            '<div class=\"field\"><label>Codex bin</label><input class=\"provider-codex-bin\" value=\"' + escapeHtml(provider.codexBin || \"codex\") + '\" placeholder=\"codex\"></div>' +\n            '<div class=\"field\"><label>Sandbox</label><input class=\"provider-sandbox\" value=\"' + escapeHtml(provider.sandbox || \"workspace-write\") + '\" placeholder=\"workspace-write\"></div>' +\n            '<div class=\"field\"><label>Timeout ms</label><input class=\"provider-timeout\" type=\"number\" min=\"1000\" step=\"1000\" value=\"' + escapeHtml(provider.timeoutMs || 900000) + '\"></div>' +\n            '<div class=\"field full\"><label>Login command</label><input readonly value=\"' + escapeHtml((provider.codexBin || \"codex\") + \" login\") + '\"></div>' +\n          '</div>' +\n        '</section>' +\n        '<section class=\"provider-auth-panel provider-api-key-panel' + (accessMode === \"api_key\" ? \"\" : \" is-hidden\") + '\">' +\n          '<div class=\"provider-panel-title\"><h3>API key</h3><span>粘贴 key 会保存到本地 provider secrets；也可以只填环境变量名。</span></div>' +\n          '<div class=\"provider-panel-grid\">' +\n            '<div class=\"field\"><label>Preset</label><select class=\"provider-preset\">' + providerPresetOptions(preset) + '</select></div>' +\n            '<div class=\"field\"><label>API key</label><input class=\"provider-api-key-secret\" type=\"password\" autocomplete=\"off\" value=\"\" placeholder=\"' + (provider.apiKeyConfigured ? \"saved locally\" : \"sk-...\") + '\"></div>' +\n            '<div class=\"field\"><label>Env fallback</label><input class=\"provider-api-key-env\" value=\"' + escapeHtml(provider.apiKeyEnv || (preset === \"deepseek\" ? \"DEEPSEEK_API_KEY\" : \"OPENAI_API_KEY\")) + '\" placeholder=\"' + escapeHtml(preset === \"deepseek\" ? \"DEEPSEEK_API_KEY\" : \"OPENAI_API_KEY\") + '\"></div>' +\n            '<div class=\"field\"><label>Base URL</label><input class=\"provider-base-url\" value=\"' + escapeHtml(provider.baseUrl || (preset === \"deepseek\" ? \"https://api.deepseek.com\" : \"\")) + '\" placeholder=\"' + escapeHtml(preset === \"deepseek\" ? \"https://api.deepseek.com\" : \"https://api.openai.com/v1\") + '\"></div>' +\n          '</div>' +\n        '</section>' +\n        '<section class=\"provider-model-panel\">' +\n          '<div class=\"provider-panel-title\"><h3>Models</h3><span>Agent 只会从这里选择 Provider 和 Model。</span></div>' +\n          '<div class=\"provider-panel-grid\">' +\n            '<div class=\"field\"><label>Default model</label><select class=\"provider-default-model\">' + modelOptionsHtml + '</select></div>' +\n            '<div class=\"field full\"><label>Available models</label><div class=\"provider-model-list\">' + providerModelChips({ models }) + '</div><div class=\"skill-install-row\"><input class=\"provider-new-model\" placeholder=\"gpt-5.5\"><button class=\"quiet-button add-provider-model\" type=\"button\">Add Model</button></div></div>' +\n          '</div>' +\n        '</section>' +\n        '<div class=\"provider-status-output\"></div>' +\n        '</div>' +\n        '<div class=\"modal-actions\">' +\n          '<button class=\"quiet-button close-provider-editor\" type=\"button\">Cancel</button>' +\n          (isNew ? '' : '<button class=\"action-button make-default-provider\" type=\"button\">Use as Default</button><button class=\"action-button check-provider\" type=\"button\">Check Provider</button>') +\n          '<button class=\"action-button primary save-provider\" type=\"button\">Save Provider</button>' +\n        '</div>' +\n      '</section></div>';\n    }\n\n    function renderProviderSettings() {\n      const config = modelProviderConfig();\n      const cards = providerList().map((provider) => providerSummaryCard(provider, provider.id === config.defaultProviderId)).join(\"\");\n      return '<section class=\"settings-group model-provider-group\">' +\n        '<div class=\"settings-section-head\"><div><h2>Model Providers</h2><p class=\"small\">配置 Agent 可选择的模型 Provider 和模型列表。</p></div><button class=\"action-button primary open-new-provider-editor\" type=\"button\">Add Model Provider</button></div>' +\n        '<div class=\"provider-summary-grid\">' + (cards || '<article class=\"provider-card\"><h2>No Providers</h2><p class=\"small\">Add the first model provider.</p></article>') + '</div>' +\n      '</section>';\n    }\n\n    function valueOrEmpty(value) {\n      return value ? escapeHtml(value) : \"\";\n    }\n\n    function adminTokenPanel() {\n      const adminToken = localStorage.getItem(\"aiTeamAdminToken\") || \"\";\n      return '<article class=\"panel admin-token-panel\"><h2>Admin Token</h2>' +\n        '<div class=\"field\"><label>Browser token</label><input id=\"adminToken\" type=\"password\" autocomplete=\"off\" placeholder=\"Paste token here or open /ai-team/console/dashboard?token=...\" value=\"' + valueOrEmpty(adminToken) + '\"></div>' +\n        '<p class=\"small\">远程打开 Dashboard 时，保存 Agent、Provider、Channel 配置都需要这个 token。这里只存在浏览器 localStorage，不写入服务端。</p>' +\n      '</article>';\n    }\n\n    function renderSettings() {\n      const target = byId(\"settings\");\n      if (!target) return;\n      const settings = state.data.settings || {};\n      const channelCards = (state.data.channels || []).map((channel) => {\n        const isFeishu = channel.id === \"feishu\";\n        return '<article class=\"panel channel-card\">' +\n          '<h2>' + escapeHtml(channel.name) + ' <span class=\"status-pill ' + escapeHtml(channel.status) + '\">' + escapeHtml(channel.status) + '</span></h2>' +\n          '<div class=\"row\"><span>Enabled</span><span>' + (channel.enabled ? 'yes' : 'no') + '</span></div>' +\n        '<div class=\"row\"><span>Event mode</span><span>' + escapeHtml(channel.eventMode || 'webhook') + '</span></div>' +\n        '<div class=\"row\"><span>Ingress</span><span>' + escapeHtml(channel.id === 'feishu' ? 'single websocket adapter' : (channel.callbackUrl || 'local')) + '</span></div>' +\n          (channel.credentials ? '<div class=\"credential-list\">' + credentialPills(channel.credentials) + '</div>' : '') +\n          (isFeishu ? feishuForm(channel, settings) : '') +\n        '</article>';\n      }).join(\"\");\n\n      target.innerHTML = '<article class=\"panel wide-panel settings-section-head\"><div><h2>Runtime</h2><p class=\"small\">服务运行状态、Engine 轮询参数和工作区信息。</p></div></article>' + panel(\"Runtime Snapshot\", [\n        [\"Fallback runner\", settings.runner],\n        [\"Fallback provider\", settings.provider],\n        [\"Fallback model\", settings.model || \"default\"],\n        [\"Provider routing\", \"per-agent selection\"],\n        [\"Tool approval\", settings.toolPolicy?.approvalMode || \"never\"],\n        [\"Tool sandbox\", settings.toolPolicy?.sandbox || \"workspace-write\"],\n        [\"Max auto risk\", settings.toolPolicy?.maxAutoRisk || \"medium\"],\n        [\"Workspace\", settings.workspace],\n        [\"Public base URL\", settings.publicBaseUrl || \"not configured\"],\n        [\"Polling\", settings.pollIntervalMs + \" ms\"],\n        [\"Feedback scan\", settings.feedbackScanIntervalMs + \" ms\"],\n        [\"Admin token\", settings.adminTokenConfigured ? \"configured\" : \"not configured\"]\n      ]) + adminTokenPanel() + renderProviderSettings() + '<section class=\"settings-group channel-group\"><div class=\"settings-section-head\"><div><h2>Channels</h2><p class=\"small\">Feishu 连接配置集中在这里。</p></div></div><div class=\"channel-card-grid\">' + (channelCards || '<article class=\"panel channel-card\"><h2>No Channels</h2><p class=\"small\">Channel adapters will appear here.</p></article>') + '</div></section>';\n\n      providerEditorModal();\n      wireSettingsActions();\n    }\n\n    function feishuForm(channel, settings) {\n      return '<div class=\"form-grid\" data-channel=\"feishu\">' +\n        '<div class=\"field\"><label>Event mode</label><input id=\"feishuEventMode\" value=\"' + valueOrEmpty(channel.eventMode || \"websocket\") + '\" placeholder=\"websocket or webhook\"></div>' +\n        '<div class=\"field checkbox-row\"><input id=\"feishuEnabled\" type=\"checkbox\" ' + (channel.enabled ? 'checked' : '') + '><label for=\"feishuEnabled\">Enabled</label></div>' +\n        '<div class=\"field\"><label>App ID</label><input id=\"feishuAppId\" autocomplete=\"off\" placeholder=\"cli_xxx\"></div>' +\n        '<div class=\"field\"><label>App Secret</label><input id=\"feishuAppSecret\" type=\"password\" autocomplete=\"off\" placeholder=\"leave blank to keep existing\"></div>' +\n        '<div class=\"field\"><label>Allow users</label><input id=\"feishuAllowFrom\" autocomplete=\"off\" placeholder=\"comma-separated open_id, blank = all\" value=\"' + valueOrEmpty(channel.allowFrom || '') + '\"></div>' +\n        '<div class=\"field\"><label>Allow chats</label><input id=\"feishuAllowChat\" autocomplete=\"off\" placeholder=\"comma-separated chat_id, blank = all\" value=\"' + valueOrEmpty(channel.allowChat || '') + '\"></div>' +\n        '<div class=\"field\"><label>Progress style</label><input id=\"feishuProgressStyle\" value=\"' + valueOrEmpty(channel.progressStyle || \"compact\") + '\" placeholder=\"plain, compact, or card\"></div>' +\n        '<div class=\"field\"><label>Done emoji</label><input id=\"feishuDoneEmoji\" value=\"' + valueOrEmpty(channel.doneEmoji || \"Done\") + '\" placeholder=\"Done or none\"></div>' +\n        '<div class=\"field checkbox-row\"><input id=\"feishuThreadIsolation\" type=\"checkbox\" ' + (channel.threadIsolation !== false ? 'checked' : '') + '><label for=\"feishuThreadIsolation\">Thread isolation</label></div>' +\n        '<div class=\"field checkbox-row\"><input id=\"feishuGroupReplyAll\" type=\"checkbox\" ' + (channel.groupReplyAll ? 'checked' : '') + '><label for=\"feishuGroupReplyAll\">Reply all group messages</label></div>' +\n        '<div class=\"field checkbox-row\"><input id=\"feishuCardEnabled\" type=\"checkbox\" ' + (channel.enableFeishuCard ? 'checked' : '') + '><label for=\"feishuCardEnabled\">Interactive cards</label></div>' +\n        '<div class=\"field full\"><label>Feishu setup command</label><input readonly value=\"node src/index.js channels setup feishu --app cli_xxx:secret --enable\"></div>' +\n        '<div class=\"actions field full\"><button class=\"action-button\" id=\"scanFeishu\" type=\"button\">Scan</button><button class=\"action-button primary\" id=\"saveFeishu\" type=\"button\">Save Feishu</button><button class=\"action-button\" id=\"testFeishu\" type=\"button\">Test</button></div>' +\n        '<div class=\"channel-output field full\" id=\"feishuOutput\"></div>' +\n      '</div>';\n    }\n\n    function settingsToken({ required = false } = {}) {\n      const input = document.getElementById(\"adminToken\");\n      const token = input ? input.value.trim() : \"\";\n      if (token) localStorage.setItem(\"aiTeamAdminToken\", token);\n      const host = window.location.hostname;\n      const localHost = host === \"localhost\" || host === \"127.0.0.1\" || host === \"::1\" || host === \"[::1]\";\n      if (required && !localHost) {\n        if (!state.data.settings.adminTokenConfigured) {\n          throw new Error(\"Remote saves require AI_TEAM_ADMIN_TOKEN on the server. Restart with AI_TEAM_ADMIN_TOKEN set, then open /ai-team/console/dashboard?token=YOUR_TOKEN once.\");\n        }\n        if (!token) {\n          throw new Error(\"Admin token required. Paste it into the Admin token field, or open /ai-team/console/dashboard?token=YOUR_TOKEN once to store it in this browser.\");\n        }\n      }\n      return token;\n    }\n\n    function optionalInput(id) {\n      const value = document.getElementById(id)?.value.trim();\n      return value || undefined;\n    }\n\n    function parseSkills(value) {\n      return String(value || \"\").split(\"\\\\n\").map((line) => line.trim()).filter(Boolean).map((line) => {\n        const bracketIndex = line.lastIndexOf(\"[\");\n        const cleanLine = bracketIndex > 0 && line.endsWith(\"]\") ? line.slice(0, bracketIndex).trim() : line;\n        const index = line.indexOf(\":\");\n        if (index === -1) return { id: cleanLine, description: \"\" };\n        return { id: cleanLine.slice(0, index).trim(), description: cleanLine.slice(index + 1).trim() };\n      });\n    }\n\n    function parseMcps(value) {\n      return String(value || \"\").split(\"\\\\n\").map((line) => line.trim()).filter(Boolean).map((line) => {\n        const bracketIndex = line.lastIndexOf(\"[\");\n        const tools = bracketIndex > 0 && line.endsWith(\"]\")\n          ? line.slice(bracketIndex + 1, -1).split(\",\").map((tool) => tool.trim()).filter(Boolean)\n          : undefined;\n        const cleanLine = bracketIndex > 0 && line.endsWith(\"]\") ? line.slice(0, bracketIndex).trim() : line;\n        const index = cleanLine.indexOf(\":\");\n        const mcp = index === -1\n          ? { id: cleanLine, description: \"\" }\n          : { id: cleanLine.slice(0, index).trim(), description: cleanLine.slice(index + 1).trim() };\n        if (tools && tools.length) mcp.tools = tools;\n        return mcp;\n      });\n    }\n\n    function mcpNamesFromJson(jsonText) {\n      const parsed = JSON.parse(jsonText);\n      if (!parsed || !parsed.mcpServers || typeof parsed.mcpServers !== \"object\" || Array.isArray(parsed.mcpServers)) {\n        throw new Error(\"MCP JSON must contain mcpServers\");\n      }\n      return Object.keys(parsed.mcpServers);\n    }\n\n    function collectMcpJsonEditors(scope) {\n      return [...scope.querySelectorAll(\".mcp-editor .mcp-json\")].map((textarea) => ({\n        configJson: textarea.value\n      })).filter((mcp) => mcp.configJson.trim());\n    }\n\n    function collectWakeRules(scope) {\n      return [...scope.querySelectorAll(\".wake-rule-card\")].map((card) => {\n        const entityType = card.querySelector(\".wake-entity-type\")?.value;\n        const rule = {\n          entityType,\n          status: card.querySelector(\".wake-status\")?.value,\n          consumerRole: entityType === \"task\" ? card.querySelector(\".wake-consumer-role\")?.value.trim() : undefined,\n          condition: card.querySelector(\".wake-condition\")?.value,\n          afterRunStatus: card.querySelector(\".wake-after-status\")?.value.trim(),\n          enabled: card.querySelector(\".wake-enabled\")?.checked === false ? false : undefined\n        };\n        return Object.fromEntries(Object.entries(rule).filter(([, value]) => value !== undefined && value !== \"\"));\n      }).filter((rule) => rule.entityType && rule.status);\n    }\n\n    function wakeRuleFromCard(card) {\n      return collectWakeRules({ querySelectorAll: (selector) => selector === \".wake-rule-card\" ? [card] : [] })[0] || {};\n    }\n\n    function refreshWakeCard(card) {\n      const entitySelect = card.querySelector(\".wake-entity-type\");\n      const statusSelect = card.querySelector(\".wake-status\");\n      const consumerField = card.querySelector(\".wake-consumer-field\");\n      const entity = entitySelect?.value || \"intent\";\n      if (statusSelect) statusSelect.innerHTML = wakeStatusOptions(entity, statusSelect.value);\n      if (consumerField) consumerField.style.display = entity === \"task\" ? \"\" : \"none\";\n      const agent = agentByRole(card.closest(\".agent-config-card\")?.dataset.role) || {};\n      const preview = card.querySelector(\".wake-flow-preview\");\n      if (preview) preview.innerHTML = wakeFlowPreview(wakeRuleFromCard(card), agent);\n    }\n\n    function closeAgentEditor() {\n      state.editingAgentRole = undefined;\n      state.newAgentDraft = undefined;\n      renderAgentConfigModal();\n    }\n\n    function openAgentEditor(role) {\n      state.editingAgentRole = role;\n      renderAgentConfigModal();\n      wireAgentConfigActions();\n    }\n\n    function openNewAgentEditor() {\n      state.newAgentDraft = blankAgentDraft();\n      state.editingAgentRole = \"__new__\";\n      renderAgentConfigModal();\n      wireAgentConfigActions();\n    }\n\n    function wireAgentConfigActions() {\n      document.querySelectorAll(\".open-agent-editor\").forEach((button) => {\n        button.onclick = () => openAgentEditor(button.dataset.role);\n        button.onkeydown = (event) => {\n          if (event.key === \"Enter\" || event.key === \" \") {\n            event.preventDefault();\n            openAgentEditor(button.dataset.role);\n          }\n        };\n      });\n      document.querySelectorAll(\".edit-agent\").forEach((button) => {\n        button.onclick = (event) => {\n          event.stopPropagation();\n          openAgentEditor(button.dataset.role);\n        };\n      });\n      document.querySelectorAll(\".one-one-agent\").forEach((button) => {\n        button.onclick = (event) => {\n          event.stopPropagation();\n          openAgentChat(button.dataset.role);\n        };\n      });\n      document.querySelectorAll(\".open-new-agent-editor\").forEach((button) => {\n        button.onclick = () => openNewAgentEditor();\n      });\n      document.querySelectorAll(\".close-agent-editor\").forEach((button) => {\n        button.onclick = () => closeAgentEditor();\n      });\n      document.querySelectorAll(\".close-agent-chat\").forEach((button) => {\n        button.onclick = () => closeAgentChat();\n      });\n      document.querySelectorAll(\".modal-backdrop\").forEach((backdrop) => {\n        backdrop.onclick = (event) => {\n          if (event.target === backdrop && backdrop.dataset.closeAgentChat === \"true\") closeAgentChat();\n          if (event.target === backdrop && backdrop.dataset.closeAgentEditor === \"true\") closeAgentEditor();\n        };\n      });\n      document.querySelectorAll(\".send-one-one\").forEach((button) => {\n        button.onclick = async () => {\n          const modal = button.closest(\".one-one-modal\");\n          const role = modal?.dataset.role;\n          const input = modal?.querySelector(\".one-one-input\");\n          const message = input?.value.trim();\n          if (!role || !message) return;\n          const history = chatHistoryFor(role);\n          setChatHistory(role, history.concat({ role: \"user\", text: message }));\n          state.chatSending = true;\n          renderAgentChatModal();\n          wireAgentConfigActions();\n          try {\n            const result = await postJson(\"/ai-team/api/agents/\" + encodeURIComponent(role) + \"/one-one\", {\n              message,\n              history: chatHistoryFor(role)\n            }, true);\n            const reply = result.reply?.message || result.reply?.finalMessage || \"\";\n            setChatHistory(role, chatHistoryFor(role).concat({ role: \"agent\", text: reply || \"No response.\" }));\n          } catch (error) {\n            setChatHistory(role, chatHistoryFor(role).concat({ role: \"agent\", text: \"Error: \" + error.message }));\n          } finally {\n            state.chatSending = false;\n            renderAgentChatModal();\n            wireAgentConfigActions();\n          }\n        };\n      });\n      document.querySelectorAll(\".one-one-input\").forEach((input) => {\n        input.onkeydown = (event) => {\n          if (event.key === \"Enter\" && !event.shiftKey && !event.isComposing) {\n            event.preventDefault();\n            input.closest(\".one-one-modal\")?.querySelector(\".send-one-one\")?.click();\n          }\n        };\n      });\n      document.querySelectorAll(\".add-skill-command\").forEach((button) => {\n        button.onclick = async () => {\n          const role = button.closest(\".agent-config-card\")?.dataset.role;\n          const input = button.closest(\".field\")?.querySelector(\".skill-install-command\");\n          const command = input?.value.trim();\n          const stateEl = document.getElementById(\"agent-save-\" + role);\n          if (!command) return;\n          try {\n            button.disabled = true;\n            if (stateEl) stateEl.textContent = \"Installing skill...\";\n            const result = await postJson(\"/ai-team/api/agents/config/\" + encodeURIComponent(role) + \"/skills\", { command }, true);\n            if (result.modelProviders) state.data.modelProviders = result.modelProviders;\n            const index = (state.data.agentConfigs?.agents || []).findIndex((agent) => agent.role === role);\n            if (index >= 0) state.data.agentConfigs.agents[index] = result.agent;\n            if (stateEl) stateEl.textContent = \"Skill added\";\n            renderAgentConfigModal();\n            wireAgentConfigActions();\n          } catch (error) {\n            if (stateEl) stateEl.textContent = error.message;\n          } finally {\n            button.disabled = false;\n          }\n        };\n      });\n      document.querySelectorAll(\".mcp-json-button\").forEach((button) => {\n        button.onclick = () => {\n          const target = button.dataset.mcpTarget;\n          const card = button.closest(\".agent-config-card\");\n          card.querySelectorAll(\".mcp-json-button\").forEach((item) => item.classList.toggle(\"active\", item === button));\n          card.querySelectorAll(\".mcp-json-panel\").forEach((panel) => {\n            if (panel.classList.contains(\"new-mcp-panel\")) return;\n            panel.classList.toggle(\"is-open\", panel.dataset.mcpPanel === target);\n          });\n        };\n      });\n      document.querySelectorAll(\".add-mcp-json\").forEach((button) => {\n        button.onclick = () => {\n          const field = button.closest(\".field\");\n          const input = field.querySelector(\".new-mcp-json\");\n          const stateEl = document.querySelector(\".agent-save-state\");\n          try {\n            const names = mcpNamesFromJson(input.value);\n            if (!names.length) throw new Error(\"MCP JSON must include at least one server\");\n            const name = names[0];\n            field.querySelector(\".mcp-button-list\")?.insertAdjacentHTML(\"beforeend\", mcpPanel({ id: name, configJson: input.value }, field.querySelectorAll(\".mcp-editor\").length));\n            input.value = \"\";\n            if (stateEl) stateEl.textContent = \"MCP JSON added. Save Agent to persist.\";\n            wireAgentConfigActions();\n          } catch (error) {\n            if (stateEl) stateEl.textContent = error.message;\n          }\n        };\n      });\n      document.querySelectorAll(\".tool-toggle\").forEach((button) => {\n        button.onclick = () => {\n          const active = !button.classList.contains(\"active\");\n          button.classList.toggle(\"active\", active);\n          button.classList.toggle(\"inactive\", !active);\n          button.setAttribute(\"aria-pressed\", active ? \"true\" : \"false\");\n        };\n      });\n      document.querySelectorAll(\".agent-provider-id\").forEach((select) => {\n        select.onchange = () => {\n          const card = select.closest(\".agent-config-card\");\n          const modelSelect = card?.querySelector(\".agent-model\");\n          const provider = providerById(select.value);\n          if (modelSelect) modelSelect.innerHTML = modelOptions(provider, provider?.defaultModel);\n        };\n      });\n      document.querySelectorAll(\".add-wake-rule\").forEach((button) => {\n        button.onclick = () => {\n          const card = button.closest(\".agent-config-card\");\n          const agent = agentByRole(card?.dataset.role) || {};\n          const list = card?.querySelector(\".wake-rule-list\");\n          if (!list) return;\n          const rule = wakeRulePreset(button.dataset.preset, agent);\n          if (list.querySelector(\".small\")) list.innerHTML = \"\";\n          list.insertAdjacentHTML(\"beforeend\", wakeRuleCard(rule, list.querySelectorAll(\".wake-rule-card\").length, agent));\n          wireAgentConfigActions();\n        };\n      });\n      document.querySelectorAll(\".remove-wake-rule\").forEach((button) => {\n        button.onclick = () => {\n          const list = button.closest(\".wake-rule-list\");\n          button.closest(\".wake-rule-card\")?.remove();\n          if (list && !list.querySelector(\".wake-rule-card\")) list.innerHTML = '<p class=\"small\">No wake rules yet.</p>';\n        };\n      });\n      document.querySelectorAll(\".wake-rule-card\").forEach((card) => {\n        refreshWakeCard(card);\n        card.querySelectorAll(\"select, input\").forEach((input) => {\n          input.onchange = () => refreshWakeCard(card);\n          input.oninput = () => refreshWakeCard(card);\n        });\n      });\n      document.querySelectorAll(\".save-agent\").forEach((button) => {\n        button.onclick = async () => {\n          const role = button.dataset.role;\n          const card = button.closest(\".agent-config-card\") || document.querySelector('.agent-config-card[data-role=\"' + role + '\"]');\n          const stateEl = document.getElementById(\"agent-save-\" + role);\n          try {\n            button.disabled = true;\n            if (stateEl) stateEl.textContent = \"Saving...\";\n            const isNewAgent = card.dataset.newAgent === \"true\";\n            const roleId = card.querySelector(\".agent-role-id\")?.value.trim();\n            const name = card.querySelector(\".agent-name\")?.value.trim();\n            const title = card.querySelector(\".agent-title\")?.value.trim();\n            const prompt = card.querySelector(\".agent-prompt\")?.value || \"\";\n            const mcps = collectMcpJsonEditors(card);\n            const wakeRules = collectWakeRules(card);\n            const modelProvider = {\n              providerId: card.querySelector(\".agent-provider-id\")?.value,\n              model: card.querySelector(\".agent-model\")?.value\n            };\n            const tools = [...card.querySelectorAll(\".tool-toggle.active\")].map((input) => input.dataset.toolId);\n            const body = { role: roleId, name, title, prompt, mcps, tools, wakeRules, modelProvider };\n            const result = isNewAgent\n              ? await postJson(\"/ai-team/api/agents/config\", body, true)\n              : await postJson(\"/ai-team/api/agents/config/\" + encodeURIComponent(role), body, true);\n            if (result.modelProviders) state.data.modelProviders = result.modelProviders;\n            if (stateEl) stateEl.textContent = \"Saved\";\n            const index = (state.data.agentConfigs?.agents || []).findIndex((agent) => agent.role === role);\n            if (index >= 0) state.data.agentConfigs.agents[index] = result.agent;\n            else state.data.agentConfigs.agents.push(result.agent);\n            closeAgentEditor();\n            renderAgentConfig();\n          } catch (error) {\n            if (stateEl) stateEl.textContent = error.message;\n          } finally {\n            button.disabled = false;\n          }\n        };\n      });\n    }\n\n    function showChannelOutput(message) {\n      const output = document.getElementById(\"feishuOutput\");\n      if (!output) return;\n      output.style.display = \"block\";\n      state.channelOutput = message;\n      if (message && message.qrSvg) {\n        output.innerHTML = \"\";\n        const text = document.createElement(\"div\");\n        text.textContent = message.text || \"\";\n        const qrBox = document.createElement(\"div\");\n        qrBox.className = \"qr-box\";\n        const image = document.createElement(\"img\");\n        image.alt = \"Feishu registration QR\";\n        image.src = \"data:image/svg+xml;charset=utf-8,\" + encodeURIComponent(message.qrSvg);\n        qrBox.appendChild(image);\n        const details = document.createElement(\"pre\");\n        details.textContent = JSON.stringify(message.details || {}, null, 2);\n        output.append(text, qrBox, details);\n      } else {\n        output.textContent = typeof message === \"string\" ? message : JSON.stringify(message, null, 2);\n      }\n    }\n\n    async function postJson(path, body = {}, useToken = false) {\n      const headers = { \"content-type\": \"application/json\" };\n      if (useToken) {\n        const token = settingsToken({ required: true });\n        if (token) headers[\"x-ai-team-admin-token\"] = token;\n      }\n      const response = await fetch(path, { method: \"POST\", headers, body: JSON.stringify(body) });\n      const data = await response.json();\n      if (!response.ok) throw new Error(data.error || response.statusText);\n      return data;\n    }\n\n    function providerIdFromName(name) {\n      return String(name || \"\")\n        .trim()\n        .replace(/^@/, \"\")\n        .replace(/[/\\\\\\\\]/g, \"-\")\n        .replace(/[^a-zA-Z0-9._-]/g, \"-\")\n        .replace(/-+/g, \"-\")\n        .replace(/^-|-$/g, \"\")\n        .toLowerCase();\n    }\n\n    function modelsFromProviderCard(card) {\n      return [...card.querySelectorAll(\".remove-model-chip\")].map((chip) => chip.dataset.model).filter(Boolean);\n    }\n\n    function refreshProviderDefaultModel(card) {\n      const select = card.querySelector(\".provider-default-model\");\n      if (!select) return;\n      const selected = select.value;\n      const models = modelsFromProviderCard(card);\n      select.innerHTML = optionList(models.map((model) => ({ value: model, label: model })), selected || models[0]);\n    }\n\n    function collectProviderCard(card) {\n      const isNew = card.dataset.newProvider === \"true\";\n      const name = card.querySelector(\".provider-name\")?.value.trim();\n      if (!name) throw new Error(\"Provider name is required\");\n      let id = isNew ? providerIdFromName(name) : card.dataset.providerId;\n      if (isNew) {\n        const baseId = id || \"provider-\" + Date.now().toString(36);\n        const existingIds = new Set(providerList().map((provider) => provider.id).filter(Boolean));\n        id = baseId;\n        let suffix = 2;\n        while (existingIds.has(id)) {\n          id = baseId + \"-\" + suffix;\n          suffix += 1;\n        }\n      }\n      if (!id) throw new Error(\"Provider name could not generate a stable key\");\n      const accessMode = card.querySelector(\".provider-access-mode\")?.value || \"api_key\";\n      const preset = card.querySelector(\".provider-preset\")?.value || \"deepseek\";\n      const type = accessMode === \"subscription\" ? \"codex_app_server\" : \"openai_compatible\";\n      const models = modelsFromProviderCard(card);\n      const fallbackModels = preset === \"deepseek\" ? [\"deepseek-chat\", \"deepseek-reasoner\"] : models;\n      const selectedModels = models.length ? models : fallbackModels;\n      const defaultModel = card.querySelector(\".provider-default-model\")?.value || selectedModels[0];\n      const authMode = accessMode === \"subscription\" ? \"subscription\" : \"api_key\";\n      const provider = {\n        id,\n        name,\n        type,\n        authMode,\n        provider: accessMode === \"api_key\" && preset === \"deepseek\" ? \"deepseek\" : undefined,\n        models: selectedModels,\n        defaultModel,\n        enabled: card.querySelector(\".provider-enabled\")?.checked !== false\n      };\n      if (type === \"codex_app_server\" && authMode === \"subscription\") {\n        provider.codexBin = card.querySelector(\".provider-codex-bin\")?.value.trim() || \"codex\";\n        provider.sandbox = card.querySelector(\".provider-sandbox\")?.value.trim() || \"workspace-write\";\n        provider.timeoutMs = Number(card.querySelector(\".provider-timeout\")?.value || 900000);\n      }\n      if (authMode === \"api_key\") {\n        const apiKey = card.querySelector(\".provider-api-key-secret\")?.value.trim();\n        if (apiKey) provider.apiKey = apiKey;\n        provider.apiKeyEnv = card.querySelector(\".provider-api-key-env\")?.value.trim() || (preset === \"deepseek\" ? \"DEEPSEEK_API_KEY\" : \"OPENAI_API_KEY\");\n        provider.baseUrl = card.querySelector(\".provider-base-url\")?.value.trim() || (preset === \"deepseek\" ? \"https://api.deepseek.com\" : undefined);\n      }\n      return provider;\n    }\n\n    function showProviderOutput(card, message) {\n      const output = card.querySelector(\".provider-status-output\");\n      if (!output) return;\n      output.classList.add(\"is-open\");\n      output.textContent = typeof message === \"string\" ? message : JSON.stringify(message, null, 2);\n    }\n\n    function refreshProviderAuthFields(card) {\n      if (!card) return;\n      const accessMode = card.querySelector(\".provider-access-mode\")?.value || \"api_key\";\n      const presetSelect = card.querySelector(\".provider-preset\");\n      const preset = presetSelect?.value || \"deepseek\";\n      const type = accessMode === \"subscription\" ? \"codex_app_server\" : \"openai_compatible\";\n      const authMode = accessMode === \"subscription\" ? \"subscription\" : \"api_key\";\n      card.querySelector(\".provider-subscription-panel\")?.classList.toggle(\"is-hidden\", accessMode !== \"subscription\");\n      card.querySelector(\".provider-api-key-panel\")?.classList.toggle(\"is-hidden\", authMode !== \"api_key\");\n      const apiKeyInput = card.querySelector(\".provider-api-key-env\");\n      const baseUrlInput = card.querySelector(\".provider-base-url\");\n      if (apiKeyInput) apiKeyInput.placeholder = preset === \"deepseek\" ? \"DEEPSEEK_API_KEY\" : \"OPENAI_API_KEY\";\n      if (baseUrlInput) baseUrlInput.placeholder = preset === \"deepseek\" ? \"https://api.deepseek.com\" : \"https://api.openai.com/v1\";\n      if (accessMode === \"api_key\" && preset === \"deepseek\") {\n        if (apiKeyInput && (!apiKeyInput.value || apiKeyInput.value === \"OPENAI_API_KEY\")) apiKeyInput.value = \"DEEPSEEK_API_KEY\";\n        if (baseUrlInput && (!baseUrlInput.value || baseUrlInput.value === \"https://api.openai.com/v1\")) baseUrlInput.value = \"https://api.deepseek.com\";\n      }\n      const badge = card.querySelector(\".provider-kind-badge\");\n      if (badge) badge.textContent = providerKindLabel({ type, authMode, provider: accessMode === \"api_key\" && preset === \"deepseek\" ? \"deepseek\" : undefined });\n    }\n\n    function closeProviderEditor() {\n      state.editingProviderId = undefined;\n      state.providerDraft = undefined;\n      providerEditorModal();\n    }\n\n    function openProviderEditor(providerId) {\n      state.editingProviderId = providerId;\n      providerEditorModal();\n      wireSettingsActions();\n    }\n\n    function openNewProviderEditor() {\n      state.providerDraft = blankProviderDraft();\n      state.editingProviderId = \"__new__\";\n      providerEditorModal();\n      wireSettingsActions();\n    }\n\n    function wireSettingsActions() {\n      document.querySelectorAll(\".open-provider-editor\").forEach((card) => {\n        card.onclick = () => openProviderEditor(card.dataset.providerId);\n        card.onkeydown = (event) => {\n          if (event.key === \"Enter\" || event.key === \" \") {\n            event.preventDefault();\n            openProviderEditor(card.dataset.providerId);\n          }\n        };\n      });\n      document.querySelectorAll(\".open-new-provider-editor\").forEach((button) => {\n        button.onclick = () => openNewProviderEditor();\n      });\n      document.querySelectorAll(\".close-provider-editor\").forEach((button) => {\n        button.onclick = () => closeProviderEditor();\n      });\n      document.querySelectorAll(\".modal-backdrop\").forEach((backdrop) => {\n        backdrop.onclick = (event) => {\n          if (event.target === backdrop && backdrop.dataset.closeProviderEditor === \"true\") closeProviderEditor();\n        };\n      });\n      document.querySelectorAll(\".provider-editor-card\").forEach((card) => {\n        refreshProviderAuthFields(card);\n        card.querySelector(\".provider-access-mode\")?.addEventListener(\"change\", () => refreshProviderAuthFields(card));\n        card.querySelector(\".provider-preset\")?.addEventListener(\"change\", () => refreshProviderAuthFields(card));\n      });\n      document.querySelectorAll(\".add-provider-model\").forEach((button) => {\n        button.onclick = () => {\n          const card = button.closest(\".provider-editor-card\");\n          const input = card?.querySelector(\".provider-new-model\");\n          const model = input?.value.trim();\n          if (!card || !model) return;\n          const list = card.querySelector(\".provider-model-list\");\n          if (![...list.querySelectorAll(\".remove-model-chip\")].some((chip) => chip.dataset.model === model)) {\n            list.insertAdjacentHTML(\"beforeend\", providerModelChips({ models: [model] }));\n            const newChip = list.lastElementChild;\n            if (newChip) {\n              newChip.onclick = () => {\n                newChip.remove();\n                refreshProviderDefaultModel(card);\n              };\n            }\n          }\n          input.value = \"\";\n          refreshProviderDefaultModel(card);\n        };\n      });\n      document.querySelectorAll(\".remove-model-chip\").forEach((button) => {\n        button.onclick = () => {\n          const card = button.closest(\".provider-editor-card\");\n          button.remove();\n          refreshProviderDefaultModel(card);\n        };\n      });\n      document.querySelectorAll(\".save-provider\").forEach((button) => {\n        button.onclick = async () => {\n          const card = button.closest(\".provider-editor-card\");\n          try {\n            button.disabled = true;\n            showProviderOutput(card, \"Saving provider...\");\n            const provider = collectProviderCard(card);\n            const result = await postJson(\"/ai-team/api/model-providers\", { provider }, true);\n            state.data.modelProviders = result;\n            showProviderOutput(card, \"Provider saved.\");\n            closeProviderEditor();\n            renderSettings();\n          } catch (error) {\n            showProviderOutput(card, error.message);\n          } finally {\n            button.disabled = false;\n          }\n        };\n      });\n      document.querySelectorAll(\".make-default-provider\").forEach((button) => {\n        button.onclick = async () => {\n          const card = button.closest(\".provider-editor-card\");\n          const providerId = card?.dataset.providerId;\n          if (!providerId) return;\n          try {\n            button.disabled = true;\n            const result = await postJson(\"/ai-team/api/model-providers\", { defaultProviderId: providerId }, true);\n            state.data.modelProviders = result;\n            renderSettings();\n          } catch (error) {\n            showProviderOutput(card, error.message);\n          } finally {\n            button.disabled = false;\n          }\n        };\n      });\n      document.querySelectorAll(\".check-provider\").forEach((button) => {\n        button.onclick = async () => {\n          const card = button.closest(\".provider-editor-card\");\n          const providerId = card?.dataset.providerId;\n          if (!providerId) return;\n          try {\n            button.disabled = true;\n            showProviderOutput(card, \"Checking provider...\");\n            const result = await postJson(\"/ai-team/api/model-providers/\" + encodeURIComponent(providerId) + \"/check\", {}, true);\n            showProviderOutput(card, result);\n          } catch (error) {\n            showProviderOutput(card, error.message);\n          } finally {\n            button.disabled = false;\n          }\n        };\n      });\n      document.getElementById(\"scanFeishu\")?.addEventListener(\"click\", async () => {\n        const button = document.getElementById(\"scanFeishu\");\n        try {\n          if (button) {\n            button.disabled = true;\n            button.textContent = \"Scanning...\";\n          }\n          showChannelOutput(\"Starting Feishu app initialization...\");\n          const result = await postJson(\"/ai-team/api/channels/feishu/scan\", {}, true);\n          showChannelOutput({\n            text: \"Scan this QR in Feishu/Lark to initialize the AI Team Agent app. When authorization completes, App ID and App Secret are stored locally and the channel switches to websocket mode.\",\n            qrSvg: result.registerQrSvg,\n            details: {\n              registrationId: result.registration?.id,\n              status: result.registration?.status,\n              expiresAt: result.registration?.expiresAt,\n              websocketGuide: result.websocketGuide,\n              checklist: result.checklist,\n              env: result.env\n            }\n          });\n          if (result.registration?.id) pollRegistration(result.registration.id);\n          await refresh();\n        } catch (error) {\n          showChannelOutput(error.message);\n        } finally {\n          if (button) {\n            button.disabled = false;\n            button.textContent = \"Scan\";\n          }\n        }\n      });\n\n      document.getElementById(\"saveFeishu\")?.addEventListener(\"click\", async () => {\n        try {\n          const body = {\n            enabled: Boolean(document.getElementById(\"feishuEnabled\")?.checked),\n            eventMode: optionalInput(\"feishuEventMode\") || \"websocket\",\n            appId: optionalInput(\"feishuAppId\"),\n            appSecret: optionalInput(\"feishuAppSecret\"),\n            allowFrom: optionalInput(\"feishuAllowFrom\"),\n            allowChat: optionalInput(\"feishuAllowChat\"),\n            progressStyle: optionalInput(\"feishuProgressStyle\"),\n            doneEmoji: optionalInput(\"feishuDoneEmoji\"),\n            threadIsolation: Boolean(document.getElementById(\"feishuThreadIsolation\")?.checked),\n            groupReplyAll: Boolean(document.getElementById(\"feishuGroupReplyAll\")?.checked),\n            enableFeishuCard: Boolean(document.getElementById(\"feishuCardEnabled\")?.checked)\n          };\n          const result = await postJson(\"/ai-team/api/channels/feishu/config\", body, true);\n          showChannelOutput({ saved: true, channel: result.channel });\n          await refresh();\n        } catch (error) {\n          showChannelOutput(error.message);\n        }\n      });\n\n      document.getElementById(\"testFeishu\")?.addEventListener(\"click\", async () => {\n        try {\n          showChannelOutput(await postJson(\"/ai-team/api/channels/feishu/test\", {}, true));\n          await refresh();\n        } catch (error) {\n          showChannelOutput(error.message);\n        }\n      });\n    }\n\n    function pollRegistration(id) {\n      if (state.registrationPoll) clearInterval(state.registrationPoll);\n      const tick = async () => {\n        try {\n          const response = await fetch(\"/ai-team/api/channels/feishu/registration?id=\" + encodeURIComponent(id));\n          const result = await response.json();\n          const current = state.channelOutput || {};\n          showChannelOutput({\n            ...current,\n            text: result.session.status === \"completed\"\n              ? \"Feishu app initialized. Credentials are stored locally; restart or keep the server running to connect with WSClient.\"\n              : current.text || \"Feishu registration in progress.\",\n            qrSvg: current.qrSvg || result.session.qrSvg,\n            details: {\n              ...(current.details || {}),\n              registrationStatus: result.session.status,\n              appId: result.session.appId,\n              error: result.session.error,\n              channelStatus: result.channel.status,\n              credentials: result.channel.credentials\n            }\n          });\n          if ([\"completed\", \"failed\"].includes(result.session.status)) {\n            clearInterval(state.registrationPoll);\n            state.registrationPoll = undefined;\n            await refresh();\n          }\n        } catch (error) {\n          showChannelOutput(error.message);\n        }\n      };\n      tick();\n      state.registrationPoll = setInterval(tick, 3000);\n    }\n\n    function render() {\n      const active = (state.data.agents || []).filter((agent) => agent.active).length;\n      if (byId(\"activeAgents\")) byId(\"activeAgents\").textContent = active + \" agents active\";\n      if (byId(\"viewTitle\")) byId(\"viewTitle\").textContent = state.tab === \"Work Board\" ? \"All Work\" : state.tab;\n      if (byId(\"itemCount\")) byId(\"itemCount\").textContent = (state.data.counts?.items || 0) + \" items\";\n      document.querySelectorAll(\".tab\").forEach((tab) => tab.classList.toggle(\"active\", tab.dataset.tab === state.tab));\n      renderNav();\n      renderFilters();\n      renderBoard();\n      renderTeam();\n      renderAgentConfig();\n      renderIntentDetail();\n      renderFeedbackLoop();\n      renderRuns();\n      renderClients();\n      renderKnowledge();\n      renderReports();\n      renderSettings();\n      if (state.channelOutput) showChannelOutput(state.channelOutput);\n    }\n\n    async function refresh() {\n      if (state.editingAgentRole || state.chatAgentRole || state.editingProviderId) return;\n      try {\n        const response = await fetch(\"/ai-team/api/dashboard\");\n        if (!response.ok) return;\n        state.data = await response.json();\n        render();\n      } catch {}\n    }\n\n    render();\n    setInterval(refresh, 5000);";
}

export function renderDashboardClientJs(initialJson) {
  let clientJs = renderDashboardClientJsLegacy(initialJson);
  clientJs = clientJs.replace(
    "    function matchesFilter(item)",
    renderDashboardI18nBootstrap() +
      "    const FILTERABLE_WORK_COLUMN_IDS = new Set([\"working\", \"testing\"]);\n\n" +
      "    function columnUsesEmployeeFilter(columnId) {\n" +
      "      return FILTERABLE_WORK_COLUMN_IDS.has(columnId);\n" +
      "    }\n\n" +
      "    function matchesFilter(item, columnId)"
  );
  clientJs = replaceClientBlock(clientJs, "function card(item, columnAccent)", "function panel(title, rows)", WORK_BOARD_JS);
  clientJs = clientJs
    .replace("function renderBoard()", OWNER_ATTENTION_JS + OVERVIEW_READINESS_JS + CONTEXT_REQUESTS_JS + WORKING_AGENTS_JS + WORK_INTAKE_JS + "function renderBoard()")
    .replace("renderBoard();\n      renderTeam();", "renderBoard();\n      renderOwnerAttention();\n      renderOverviewReadiness();\n      renderContextRequests();\n      renderWorkingAgents();\n      renderWorkIntake();\n      renderTeam();");
  clientJs = replaceClientBlock(clientJs, "function renderSettings()", "function settingsToken", PROJECTS_JS + PRODUCT_FEISHU_SETTINGS_JS);
  clientJs = replaceClientBlock(clientJs, "function renderAgentConfig()", "function agentByRole", EMPLOYEE_CONFIG_JS);
  clientJs = replaceClientBlock(clientJs, "function showChannelOutput(message)", "async function postJson", PRODUCT_FEISHU_OUTPUT_JS);
  clientJs = replaceClientBlock(
    clientJs,
    'document.getElementById("scanFeishu")?.addEventListener("click"',
    '      document.getElementById("saveFeishu")?.addEventListener("click"',
    PRODUCT_FEISHU_SCAN_HANDLER_JS
  );
  clientJs = replaceClientBlock(
    clientJs,
    'document.getElementById("saveFeishu")?.addEventListener("click"',
    '      document.getElementById("testFeishu")?.addEventListener("click"',
    PRODUCT_FEISHU_SAVE_HANDLER_JS
  );
  clientJs = replaceClientBlock(clientJs, "function renderChatMessage", "function renderIntentDetail", ONE_ONE_CHAT_METADATA_JS);
  clientJs = replaceClientBlock(clientJs, "function renderIntentDetail", "function credentialPills", EVIDENCE_DOSSIER_JS);
  clientJs = replaceClientBlock(
    clientJs,
    'document.querySelectorAll(".send-one-one").forEach',
    '      document.querySelectorAll(".one-one-input").forEach',
    ONE_ONE_SEND_METADATA_JS
  );
  clientJs = clientJs
    .replace("providerDraft: undefined }", "providerDraft: undefined, editingCodingAgentLauncherId: undefined, codingAgentLauncherDraft: undefined, runDetailOpen: false, runDetail: undefined }")
    .replace('tab: "Work Board"', 'tab: "Overview"')
    .replace(
      'const bootTab = bootParams.get("tab");\n    if (bootTab && (state.data.nav || []).includes(bootTab)) state.tab = bootTab;',
      DASHBOARD_ROUTE_JS
    )
    .replace('state.filter === "All" || state.filter === "This week"', '!columnUsesEmployeeFilter(columnId) || state.filter === "All" || state.tab !== "Overview"')
    .replace("state.tab = button.dataset.tab;", "state.tab = normalizeTab(button.dataset.tab);")
    .replace('state.tab = normalizeTab(button.dataset.tab);\n          document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.tab));\n          render();', 'setDashboardTab(button.dataset.tab);')
    .replace('state.filter = button.dataset.filter;\n          render();', 'setDashboardFilter(button.dataset.filter);')
    .replace('state.tab === "Work Board" ? "All Work" : state.tab', 'state.tab === "Overview" ? "All Work" : state.tab')
    .replace('state.data = await response.json();\n        render();', 'applyDashboardData(await response.json(), { force });')
    .replace('async function refresh() {\n      if (state.editingAgentRole || state.chatAgentRole || state.editingProviderId) return;', 'async function refresh({ force = false } = {}) {\n      if (!force && (state.editingAgentRole || state.chatAgentRole || state.editingProviderId || state.editingCodingAgentLauncherId)) return;');
  clientJs = clientJs
    .replace("    async function refresh({ force = false } = {}) {", REALTIME_DASHBOARD_JS + "    async function refresh({ force = false } = {}) {")
    .replace("    render();\n    setInterval(refresh, 5000);", "    render();\n    if (bootRunId) openRunDetail(bootRunId, { updateRoute: false });\n    syncDashboardRoute({ replace: true });\n    connectDashboardStream();\n    setInterval(refresh, 15000);");
  clientJs = clientJs
    .replace('if (!filters) return;\n      filters.innerHTML', 'if (!filters) return;\n      if (state.tab !== "Overview") { filters.innerHTML = ""; return; }\n      filters.innerHTML');
  clientJs = clientJs
    .replace(
      "'<div class=\"field\"><label>After success</label><input class=\"wake-after-status\" value=\"' + escapeHtml(after) + '\" placeholder=\"done\"></div>' +",
      "'<div class=\"field\"><label>After success</label><select class=\"wake-after-status\">' + wakeStatusOptions(entity, after) + '</select></div>' +"
    )
    .replace(
      '      const statusSelect = card.querySelector(".wake-status");\n      const consumerField = card.querySelector(".wake-consumer-field");',
      '      const statusSelect = card.querySelector(".wake-status");\n      const afterSelect = card.querySelector(".wake-after-status");\n      const consumerField = card.querySelector(".wake-consumer-field");'
    )
    .replace(
      '      if (statusSelect) statusSelect.innerHTML = wakeStatusOptions(entity, statusSelect.value);\n      if (consumerField) consumerField.style.display = entity === "task" ? "" : "none";',
      '      if (statusSelect) statusSelect.innerHTML = wakeStatusOptions(entity, statusSelect.value);\n      if (afterSelect) afterSelect.innerHTML = wakeStatusOptions(entity, afterSelect.value);\n      if (consumerField) consumerField.style.display = entity === "task" ? "" : "none";'
    );
  clientJs = clientJs
    .replace("    function renderAgentConfigModal()", MCP_TOOL_GROUP_JS + AGENT_EDITOR_ASSIST_JS + "    function renderAgentConfigModal()")
    .replace('    function skillButton(skill) {\n      const title = skill.path ? \' title="\' + escapeHtml(skill.path) + \'"\' : "";\n      return \'<button class="readonly-skill" type="button" disabled\' + title + \'>\' + escapeHtml(skill.id) + \'</button>\';\n    }\n\n', SKILL_BUTTON_JS)
    .replace('    function mcpPanel(mcp, index) {\n      const id = escapeHtml(mcp.id || ("mcp-" + index));\n      const open = index === 0 ? " is-open" : "";\n      const active = index === 0 ? " active" : "";\n      const json = mcp.configJson || JSON.stringify({ mcpServers: { [mcp.id || "server"]: mcp.config || {} } }, null, 2);\n      return \'<div class="mcp-editor" data-mcp-id="\' + id + \'">\' +\n        \'<button class="mcp-json-button\' + active + \'" type="button" data-mcp-target="\' + id + \'">\' + id + \'</button>\' +\n        \'<div class="mcp-json-panel\' + open + \'" data-mcp-panel="\' + id + \'">\' +\n          \'<textarea class="mcp-json" spellcheck="false">\' + escapeHtml(json) + \'</textarea>\' +\n        \'</div>\' +\n      \'</div>\';\n    }\n\n', MCP_PANEL_JS)
    .replace('      const mcpEditors = mcps.length ? mcps.map(mcpPanel).join("") : "";\n      const selectedModelProvider', '      const mcpEditors = mcps.length ? mcps.map((mcp, index) => mcpCapabilityCard(mcp, index, agent)).join("") : \'<span class="small">No MCP servers installed.</span>\';\n      const selectedModelProvider')
    .replace('      const skillInstaller = isNewAgent\n        ? ""\n        : \'<div class="skill-install-row"><input class="skill-install-command" placeholder="npx skills install code-review"><button class="quiet-button add-skill-command" type="button">Add Skill</button></div>\';', '      const skillInstaller = isNewAgent\n        ? ""\n        : \'<div class="actions"><button class="quiet-button open-skill-install-modal" type="button">\' + escapeHtml(actionLabel("Add Skill")) + \'</button></div>\';')
    .replace('      const selectedProvider = providerById(selectedModelProvider.providerId);\n      const toolBoxes', '      const selectedProvider = providerById(selectedModelProvider.providerId);\n      const editorRail = agentEditorRail(agent, selectedModelProvider, tools);\n      const toolBoxes')
    .replace('      const toolBoxes = tools.map((tool) => {', '      const mcpToolIds = new Set(mcps.flatMap((mcp) => (mcp.tools || []).map(mcpToolId).filter(Boolean)));\n      const toolBoxes = tools.filter((tool) => !mcpToolIds.has(tool.id)).map((tool) => {')
    .replace('      }).join("");\n      root.innerHTML = \'<div class="modal-backdrop" data-close-agent-editor="true">\'+', '      }).join("");\n      const editorRail = agentEditorRail(agent, selectedModelProvider, tools);\n      root.innerHTML = \'<div class="modal-backdrop" data-close-agent-editor="true">\'+')
    .replace('\'<div class="modal-body">\' +\n            \'<div class="form-grid">\' +', '\'<div class="modal-body agent-editor-body">\' +\n            editorRail +\n            \'<div class="agent-editor-main"><div class="form-grid">\' +')
    .replace('\'<div class="field"><label>Role ID</label><input class="agent-role-id"', 'agentEditorTabPanel("identity", copy("Identity"), copy("Name the employee and define the operating persona.")) +\n              \'<div class="field"><label>\' + escapeHtml(copy("Role ID")) + \'</label><input class="agent-role-id"')
    .replace('\'<div class="field"><label>Name</label><input class="agent-name"', '\'<div class="field"><label>\' + escapeHtml(copy("Name")) + \'</label><input class="agent-name"')
    .replace('\'<div class="field"><label>Title</label><input class="agent-title"', '\'<div class="field"><label>\' + escapeHtml(copy("Title")) + \'</label><input class="agent-title"')
    .replace('\'<div class="field full"><label>\' + escapeHtml(copy("Wake Rules")) + \'</label>\' + wakeRuleBuilder(agent)', 'agentEditorSectionLabel("routing", copy("Routing"), copy("Choose when this employee should enter TeamEngine work.")) +\n              \'<div class="field full"><label>\' + escapeHtml(copy("Wake Rules")) + \'</label>\' + wakeRuleBuilder(agent)')
    .replace('\'<div class="field full"><label>\' + escapeHtml(copy("Skills")) + \'</label><div class="capability-list skill-list">\' + skillButtons', 'agentEditorSectionLabel("skills", copy("Skills"), copy("Reusable playbooks and installed local capabilities.")) +\n              \'<div class="field full"><label>\' + escapeHtml(copy("Skills")) + \'</label><div class="capability-list skill-list">\' + skillButtons')
    .replace('\'<div class="field full"><label>\' + escapeHtml(copy("MCP")) + \'</label><div class="capability-list mcp-button-list">\' + mcpEditors', 'agentEditorSectionLabel("integrations", copy("Integrations"), copy("MCP servers and the tools they expose to this employee.")) +\n              \'<div class="field full"><label>\' + escapeHtml(copy("MCP")) + \'</label><div class="capability-list mcp-button-list">\' + mcpEditors')
    .replace("'<div class=\"field full\"><label>Tools</label><div class=\"credential-list\">' + toolBoxes + '</div>' + mcpToolGroups + '</div>' +", "agentEditorSubsectionLabel(copy(\"Tools\"), copy(\"Allowed audited tools for this employee.\")) +\n              '<div class=\"field full\"><label>' + escapeHtml(copy(\"Tools\")) + '</label><div class=\"credential-list\">' + toolBoxes + '</div></div>' +")
    .replace('            \'</div>\' +\n            \'<p class="small agent-save-state" id="agent-save-\' + roleEscaped + \'"></p>\' +\n          \'</div>\' +', '            \'</section>\' +\n            agentEditorMemoryPanel(agent) +\n            \'</div>\' +\n            \'<p class="small agent-save-state" id="agent-save-\' + roleEscaped + \'"></p>\' +\n            \'</div>\' +\n          \'</div>\' +')
    .replace("'<div class=\"field full\"><label>Tools</label><div class=\"credential-list\">' + toolBoxes + '</div></div>' +", "agentEditorSubsectionLabel(copy(\"Tools\"), copy(\"Allowed audited tools for this employee.\")) +\n              '<div class=\"field full\"><label>' + escapeHtml(copy(\"Tools\")) + '</label><div class=\"credential-list\">' + toolBoxes + '</div></div>' +")
    .replace('      document.querySelectorAll(".tool-toggle").forEach((button) => {', SYNC_MCP_TOOLS_HANDLER_JS + '      document.querySelectorAll(".tool-toggle").forEach((button) => {')
    .replace('          button.setAttribute("aria-pressed", active ? "true" : "false");\n        };\n      });', '          button.setAttribute("aria-pressed", active ? "true" : "false");\n          markAgentEditorDirty(button.closest(".agent-config-card"));\n        };\n      });')
    .replace('          if (modelSelect) modelSelect.innerHTML = modelOptions(provider, provider?.defaultModel);\n        };\n      });', '          if (modelSelect) modelSelect.innerHTML = modelOptions(provider, provider?.defaultModel);\n          markAgentEditorDirty(card);\n        };\n      });')
    .replace('          list.insertAdjacentHTML("beforeend", wakeRuleCard(rule, list.querySelectorAll(".wake-rule-card").length, agent));\n          wireAgentConfigActions();', '          list.insertAdjacentHTML("beforeend", wakeRuleCard(rule, list.querySelectorAll(".wake-rule-card").length, agent));\n          markAgentEditorDirty(card);\n          wireAgentConfigActions();')
    .replace('          if (list && !list.querySelector(".wake-rule-card")) list.innerHTML = \'<p class="small">No wake rules yet.</p>\';\n        };\n      });', '          if (list && !list.querySelector(".wake-rule-card")) list.innerHTML = \'<p class="small">No wake rules yet.</p>\';\n          markAgentEditorDirty(button.closest(".agent-config-card"));\n        };\n      });')
    .replace('      document.querySelectorAll(".save-agent").forEach((button) => {', '      document.querySelectorAll(".agent-config-card").forEach((card) => {\n        card.querySelectorAll("input, textarea, select").forEach((input) => {\n          if (input.dataset.agentDirtyBound === "true") return;\n          input.dataset.agentDirtyBound = "true";\n          input.addEventListener("input", () => markAgentEditorDirty(card));\n          input.addEventListener("change", () => markAgentEditorDirty(card));\n        });\n        if (!card.dataset.agentEditorTab) card.dataset.agentEditorTab = "identity";\n        setAgentEditorTab(card, card.dataset.agentEditorTab);\n      });\n      document.querySelectorAll(".agent-editor-nav-button").forEach((button) => {\n        button.onclick = () => {\n          const card = button.closest(".agent-config-card");\n          setAgentEditorTab(card, button.dataset.editorSection);\n        };\n      });\n      document.querySelectorAll(".save-agent").forEach((button) => {')
    .replace('    function collectMcpJsonEditors(scope) {\n      return [...scope.querySelectorAll(".mcp-editor .mcp-json")].map((textarea) => ({\n        configJson: textarea.value\n      })).filter((mcp) => mcp.configJson.trim());\n    }\n\n    function collectWakeRules', COLLECT_CAPABILITY_JS + '    function collectWakeRules')
    .replace('            const mcps = collectMcpJsonEditors(card);\n            const wakeRules = collectWakeRules(card);', '            const mcps = collectMcpJsonEditors(card);\n            const removeSkills = collectRemovedSkillIds(card);\n            const wakeRules = collectWakeRules(card);')
    .replace('            const tools = [...card.querySelectorAll(".tool-toggle.active")].map((input) => input.dataset.toolId);', '            const tools = [...new Set([...card.querySelectorAll(".tool-toggle.active"), ...card.querySelectorAll(".mcp-tool-checkbox:checked")].map((input) => input.dataset.toolId).filter(Boolean))];')
    .replace('            const body = { role: roleId, name, title, prompt, mcps, tools, wakeRules, modelProvider };', '            const body = { role: roleId, name, title, prompt, mcps, tools, wakeRules, modelProvider };\n            if (removeSkills.length) body.removeSkills = removeSkills;')
    .replace('            const result = isNewAgent\n              ? await postJson("/ai-team/api/agents/config", body, true)\n              : await postJson("/ai-team/api/agents/config/" + encodeURIComponent(role), body, true);\n            if (result.modelProviders) state.data.modelProviders = result.modelProviders;', '            const savedResult = isNewAgent\n              ? await postJson("/ai-team/api/agents/config", body, true)\n              : await postJson("/ai-team/api/agents/config/" + encodeURIComponent(role), body, true);\n            if (stateEl) stateEl.textContent = actionLabel("Syncing tools...");\n            const result = await syncSavedMcpTools(savedResult.agent?.role || roleId, mcps) || savedResult;\n            if (result.modelProviders) state.data.modelProviders = result.modelProviders;')
    .replace('return date.toLocaleString();', 'return date.toLocaleString(localeTag());')
    .replace('escapeHtml(status || "unknown") + \'</span>\';', 'escapeHtml(statusLabel(status || "unknown")) + \'</span>\';')
    .replace("escapeHtml(tab) + '</button>'", "escapeHtml(navLabel(tab)) + '</button>'")
    .replace("escapeHtml(filter) + '</button>'", "escapeHtml(filterLabel(filter)) + '</button>'")
    .replace('<div class=\\\"progress-row\\\"><span class=\\\"progress-label\\\">Overall progress</span>', '<div class=\\\"progress-row\\\"><span class=\\\"progress-label\\\">' + "' + escapeHtml(copy(\"Overall progress\")) + '" + '</span>')
    .replace("'<div class=\\\"empty\\\">No live work</div>'", "'<div class=\\\"empty\\\">' + escapeHtml(copy(\"No live work\")) + '</div>'")
    .replace("      renderReports();\n      renderSettings();", "      renderReports();\n      renderProjects();\n      renderSettings();")
    .replace('active + " agents active"', 'countText("agentsActive", active)')
    .replace('state.tab === "Overview" ? "All Work" : state.tab', 'state.tab === "Overview" ? t("view.allWork") : navLabel(state.tab)')
    .replace('(state.data.counts?.items || 0) + " items"', 'countText("items", currentTabItemCount())')
    .replace("'<span class=\"capability-count\">Prompt</span>' +", "'<span class=\"capability-count\">' + escapeHtml(copy(\"Prompt\")) + '</span>' +")
    .replace("'<span class=\"capability-count\">' + (agent.skills || []).length + ' skills</span>' +", "'<span class=\"capability-count\">' + escapeHtml(countText(\"skills\", (agent.skills || []).length)) + '</span>' +")
    .replace("'<span class=\"capability-count\">' + (agent.mcps || []).length + ' MCP</span>' +", "'<span class=\"capability-count\">' + escapeHtml(countText(\"mcps\", (agent.mcps || []).length)) + '</span>' +")
    .replace("'<span class=\"capability-count\">' + (agent.tools || []).length + ' tools</span>' +", "'<span class=\"capability-count\">' + escapeHtml(countText(\"tools\", (agent.tools || []).length)) + '</span>' +")
    .replace("'<span class=\"capability-count\">' + (agent.wakeRules || []).length + ' wake rules</span>' +", "'<span class=\"capability-count\">' + escapeHtml(countText(\"wakeRules\", (agent.wakeRules || []).length)) + '</span>' +\n            '<span class=\"capability-count\">' + escapeHtml(agentMemoryCountText(agent.memory)) + '</span>' +")
    .replace("escapeHtml(selectedModel.providerId || \"provider\") + ' · ' + escapeHtml(selectedModel.model || \"model\")", "escapeHtml(selectedModel.providerId || copy(\"provider\")) + ' · ' + escapeHtml(selectedModel.model || copy(\"model\"))")
    .replace("return '<article class=\"agent-summary-card open-agent-editor\" role=\"button\" tabindex=\"0\" data-role=\"' + role + '\">' +", "return '<article class=\"agent-summary-card open-agent-editor\" role=\"button\" tabindex=\"0\" aria-label=\"' + escapeHtml(actionLabel(\"Edit\") + ' ' + (agent.name || agent.title || agent.role)) + '\" data-role=\"' + role + '\">' +")
    .replace("'\">one one</button>'", "'\">' + escapeHtml(t(\"oneOne.label\")) + '</button>'")
    .replace("'\">Edit</button>'", "'\">' + escapeHtml(actionLabel(\"Edit\")) + '</button>'")
    .replace("'<h2>+ Add Agent</h2>' +", "'<h2>' + escapeHtml(actionLabel(\"Add Agent\")) + '</h2>' +")
    .replace("'<p class=\"small\">创建新的 Agent 文件夹、AGENTS.md、tools、MCP、skills 和 wake rules。</p>' +", "'<p class=\"small\">' + escapeHtml(copy(\"Create a new employee with persona, Skills, tools, and routing.\")) + '</p>' +")
    .replace("escapeHtml(isNewAgent ? \"New Agent\" : (agent.name || agent.title || agent.role))", "escapeHtml(isNewAgent ? copy(\"New Agent\") : (agent.name || agent.title || agent.role))")
    .replace("agent.agentDir || agentPromptSummary(agent, \"Create a per-agent folder and routing rules.\")", "agentPromptSummary(agent, copy(\"Set up identity, Skills, and routing for this employee.\"))")
    .replace("'<div class=\"agent-model-title\"><span>Model</span><strong>Provider and model for this Agent</strong></div>' +", "'<div class=\"agent-model-title\"><span>' + escapeHtml(copy(\"Model\")) + '</span><strong>' + escapeHtml(copy(\"Model for this employee\")) + '</strong></div>' +")
    .replace("Save the Agent before installing Skills.", "Save the employee before adding Skills.")
    .replace("'<div class=\"field full\"><label>AGENTS.md</label><textarea class=\"agent-prompt\">' + escapeHtml(agent.prompt || \"\") + '</textarea><p class=\"field-help\">保存后会写入该 Agent 文件夹里的 AGENTS.md。</p></div>' +", "'<div class=\"field full\"><label>' + escapeHtml(copy(\"Persona\")) + '</label><textarea class=\"agent-prompt\">' + escapeHtml(agent.prompt || \"\") + '</textarea><p class=\"field-help\">' + escapeHtml(copy(\"Define identity, boundaries, tone, and judgment for this employee.\")) + '</p></div>' +")
    .replace("'<div class=\"field full\"><label>Wake Rules</label>' + wakeRuleBuilder(agent) + '<p class=\"field-help\">配置这个 Agent 消费哪些 Engine 实体状态。引擎只负责扫描和唤醒，具体消费关系由这里声明。</p></div>' +", "'<div class=\"field full\"><label>' + escapeHtml(copy(\"Wake Rules\")) + '</label>' + wakeRuleBuilder(agent) + '<p class=\"field-help\">' + escapeHtml(copy(\"Define when this employee joins work and what state the work should move to after success.\")) + '</p></div>' +")
    .replace("'<div class=\"field full\"><label>Skills</label><div class=\"capability-list skill-list\">' + skillButtons + '</div>' + skillInstaller + '<p class=\"field-help\">保存时会在该 Agent 文件夹内执行受限 npx skills 命令，安装结果进入本地 .agents/skills/；已添加 Skill 不在页面内编辑。</p></div>' +", "'<div class=\"field full\"><label>' + escapeHtml(copy(\"Skills\")) + '</label><div class=\"capability-list skill-list\">' + skillButtons + '</div>' + skillInstaller + '<p class=\"field-help\">' + escapeHtml(copy(\"Give this employee reusable Skills for future direct chats and runtime work.\")) + '</p></div>' +")
    .replace("'<div class=\"field full\"><label>MCP</label><div class=\"capability-list mcp-button-list\">' + mcpEditors + '</div><div class=\"mcp-json-panel is-open new-mcp-panel\"><textarea class=\"mcp-json new-mcp-json\" spellcheck=\"false\" placeholder=\"' + escapeHtml(sampleMcpJson()) + '\"></textarea></div><div class=\"actions\"><button class=\"quiet-button add-mcp-json\" type=\"button\">Add MCP JSON</button></div><p class=\"field-help\">MCP 使用标准 mcpServers JSON；每个 server 会保存到独立 .agents/mcp/&lt;name&gt;/mcp.json。</p></div>' +", "'<div class=\"field full\"><label>' + escapeHtml(copy(\"MCP\")) + '</label><div class=\"capability-list mcp-button-list\">' + mcpEditors + '</div><div class=\"actions\"><button class=\"quiet-button add-mcp-json\" type=\"button\">' + escapeHtml(actionLabel(\"Add MCP\")) + '</button></div><p class=\"field-help\">' + escapeHtml(copy(\"Connect external tools through MCP configuration. Keep secrets in environment variables.\")) + '</p></div>' +")
    .replace("'<div class=\"field full\"><label>' + escapeHtml(copy(\"Wake Rules\")) + '</label>' + wakeRuleBuilder(agent)", "'</section>' +\n              agentEditorTabPanel(\"routing\", copy(\"Routing\"), copy(\"Choose when this employee should enter TeamEngine work.\")) +\n              '<div class=\"field full\"><label>' + escapeHtml(copy(\"Wake Rules\")) + '</label>' + wakeRuleBuilder(agent)")
    .replace("'<div class=\"field full\"><label>' + escapeHtml(copy(\"Skills\")) + '</label><div class=\"capability-list skill-list\">' + skillButtons", "'</section>' +\n              agentEditorTabPanel(\"integrations\", copy(\"Integrations\"), copy(\"Skills, MCP, and tools available to this employee.\")) +\n              agentEditorSubsectionLabel(copy(\"Skills\"), copy(\"Reusable playbooks and installed local capabilities.\")) +\n              '<div class=\"field full\"><label>' + escapeHtml(copy(\"Skills\")) + '</label><div class=\"capability-list skill-list\">' + skillButtons")
    .replace("'<div class=\"field full\"><label>' + escapeHtml(copy(\"MCP\")) + '</label><div class=\"capability-list mcp-button-list\">' + mcpEditors", "agentEditorSubsectionLabel(copy(\"MCP\"), copy(\"MCP servers and the tools they expose to this employee.\")) +\n              '<div class=\"field full\"><label>' + escapeHtml(copy(\"MCP\")) + '</label><div class=\"capability-list mcp-button-list\">' + mcpEditors")
    .replace("'<div class=\"field full\"><label>Tools</label><div class=\"credential-list\">' + toolBoxes + '</div>' + mcpToolGroups + '</div>' +", "agentEditorSubsectionLabel(copy(\"Tools\"), copy(\"Allowed audited tools for this employee.\")) +\n              '<div class=\"field full\"><label>' + escapeHtml(copy(\"Tools\")) + '</label><div class=\"credential-list\">' + toolBoxes + '</div></div>' +")
    .replace("models.length + ' models</span>'", "escapeHtml(countText(\"models\", models.length)) + '</span>'")
    .replace("tool.descriptionZh || tool.description || \"\"", "(state.locale === \"zh\" ? (tool.descriptionZh || tool.description) : (tool.description || tool.descriptionZh)) || \"\"")
    .replace("'<button class=\"quiet-button close-agent-editor\" type=\"button\">Close</button>' +", "'<div class=\"modal-head-actions\">' + languageSwitchHtml() + '<button class=\"quiet-button close-agent-editor\" type=\"button\">' + escapeHtml(actionLabel(\"Close\")) + '</button></div>' +")
    .replace(
      'aria-label="Edit agent">',
      'aria-label="\' + escapeHtml(actionLabel("Edit") + " " + (isNewAgent ? copy("New Agent") : (agent.name || agent.title || agent.role))) + \'">'
    )
    .replace("'<button class=\"quiet-button close-provider-editor\" type=\"button\">Close</button>' +", "'<div class=\"modal-head-actions\">' + languageSwitchHtml() + '<button class=\"quiet-button close-provider-editor\" type=\"button\">' + escapeHtml(actionLabel(\"Close\")) + '</button></div>' +")
    .replace('showProviderOutput(card, "Saving provider...");', 'showProviderOutput(card, copy("Saving provider..."));')
    .replace('showProviderOutput(card, "Provider saved.");', 'showProviderOutput(card, copy("Provider saved."));')
    .replace('showProviderOutput(card, "Checking provider...");', 'showProviderOutput(card, actionLabel("Checking..."));')
    .replace('throw new Error("Provider name is required");', 'throw new Error(copy("Provider name is required"));')
    .replace('throw new Error("Provider name could not generate a stable key");', 'throw new Error(copy("Provider name could not generate a stable key"));')
    .replace('throw new Error("Remote saves require AI_TEAM_ADMIN_TOKEN on the server. Restart with AI_TEAM_ADMIN_TOKEN set, then open /ai-team/console/dashboard?token=YOUR_TOKEN once.");', 'throw new Error(copy("Admin token required for remote saves. Log in again or paste the token in Settings."));')
    .replace('settings.adminTokenConfigured ? "configured" : "not configured"', 'settings.adminTokenMode === "default" ? "default (AI-team)" : (settings.adminTokenConfigured ? "configured" : "not configured")')
    .replace('placeholder="Paste token here or open /ai-team/console/dashboard?token=..."', 'placeholder="Paste token here, or use AI-team if no server token is configured"')
    .replace('        if (!token) {\n          throw new Error("Admin token required. Paste it into the Admin token field, or open /ai-team/console/dashboard?token=YOUR_TOKEN once to store it in this browser.");\n        }\n', '')
    .replace('if (state.channelOutput) showChannelOutput(state.channelOutput);', 'if (state.channelOutput) showChannelOutput(state.channelOutput);\n      renderLanguageSwitch();\n      localizeDom(document.body);');
  clientJs = replaceClientBlock(
    clientJs,
    '      document.querySelectorAll(".add-skill-command").forEach',
    '      document.querySelectorAll(".tool-toggle").forEach',
    NESTED_CAPABILITY_HANDLER_JS + SYNC_MCP_TOOLS_HANDLER_JS
  );
  clientJs = clientJs
    .replaceAll('renderAgentChatModal();\n      wireAgentConfigActions();', 'renderAgentChatModal();\n      wireAgentConfigActions();\n      renderLanguageSwitch();\n      localizeDom(byId("agentChatModalRoot"));')
    .replaceAll('renderAgentChatModal();\n          wireAgentConfigActions();', 'renderAgentChatModal();\n          wireAgentConfigActions();\n          renderLanguageSwitch();\n          localizeDom(byId("agentChatModalRoot"));')
    .replaceAll('renderAgentConfigModal();\n      wireAgentConfigActions();', 'renderAgentConfigModal();\n      wireAgentConfigActions();\n      renderLanguageSwitch();\n      localizeDom(byId("agentConfigModalRoot"));')
    .replaceAll('providerEditorModal();\n      wireSettingsActions();', 'providerEditorModal();\n      wireSettingsActions();\n      renderLanguageSwitch();\n      localizeDom(byId("providerConfigModalRoot"));\n      localizeDom(byId("codingAgentLauncherModalRoot"));');
  clientJs = clientJs.replaceAll("skill-install-row", "inline-install-row");
  return clientJs;
}

function replaceClientBlock(source, startNeedle, endNeedle, replacement) {
  const start = source.indexOf(startNeedle);
  if (start === -1) return source;
  const end = source.indexOf(endNeedle, start);
  if (end === -1) return source;
  return source.slice(0, start) + replacement + source.slice(end);
}

const DASHBOARD_ROUTE_JS = `const bootTab = bootParams.get("tab");
    function normalizeTab(tab) {
      const aliases = { "Work Board": "Overview", Agents: "Team", Employees: "Team", Team: "Team", "Start Work": "Intake", "发起工作": "Intake", Projects: "Projects", "项目": "Projects", "Intent Detail": "Evidence", Runs: "Evidence", Knowledge: "Evidence", "Feedback Loop": "Evidence" };
      const nextTab = aliases[tab] || tab || "Overview";
      return (state.data.nav || []).includes(nextTab) ? nextTab : "Overview";
    }
    const bootFilter = bootParams.get("filter");
    const bootEvidenceId = bootParams.get("evidence") || bootParams.get("intent");
    const bootRunId = bootParams.get("run");
    if (bootTab) state.tab = normalizeTab(bootTab);
    if (bootFilter) state.filter = bootFilter;
    if (bootEvidenceId) {
      state.selectedEvidenceId = bootEvidenceId;
      state.tab = normalizeTab("Evidence");
    }
    if (bootRunId) {
      state.runDetailOpen = true;
      state.runDetail = { id: bootRunId, loading: true };
      state.tab = normalizeTab("Evidence");
    }

    function dashboardRouteParams() {
      const params = new URLSearchParams();
      const tab = normalizeTab(state.tab);
      if (tab !== "Overview") params.set("tab", tab);
      if (tab === "Overview" && state.filter && state.filter !== "All") params.set("filter", state.filter);
      if (tab === "Evidence" && state.selectedEvidenceId) params.set("evidence", state.selectedEvidenceId);
      if (tab === "Evidence" && state.runDetailOpen && state.runDetail?.id) params.set("run", state.runDetail.id);
      return params;
    }

    function syncDashboardRoute({ replace = false } = {}) {
      if (state.suppressRouteSync) return;
      const params = dashboardRouteParams();
      const query = params.toString();
      const next = window.location.pathname + (query ? "?" + query : "") + window.location.hash;
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (next === current) return;
      if (replace) window.history.replaceState({ tab: state.tab }, "", next);
      else window.history.pushState({ tab: state.tab }, "", next);
    }

    function setDashboardTab(tab, { replace = false } = {}) {
      state.tab = normalizeTab(tab);
      if (state.tab !== "Evidence") {
        state.runDetailOpen = false;
        state.runDetail = undefined;
      }
      syncDashboardRoute({ replace });
      render();
    }

    function setDashboardFilter(filter, { replace = false } = {}) {
      state.filter = filter || "All";
      syncDashboardRoute({ replace });
      render();
    }

    function applyDashboardRouteFromLocation() {
      const params = new URLSearchParams(window.location.search);
      const evidenceId = params.get("evidence") || params.get("intent");
      const runId = params.get("run");
      state.suppressRouteSync = true;
      state.tab = normalizeTab(params.get("tab"));
      state.filter = params.get("filter") || "All";
      if (evidenceId) {
        state.selectedEvidenceId = evidenceId;
        state.tab = normalizeTab("Evidence");
      }
      if (runId) {
        state.tab = normalizeTab("Evidence");
        state.suppressRouteSync = false;
        openRunDetail(runId, { updateRoute: false });
        return;
      }
      state.runDetailOpen = false;
      state.runDetail = undefined;
      render();
      state.suppressRouteSync = false;
    }

    window.addEventListener("popstate", applyDashboardRouteFromLocation);`;

const WORK_BOARD_JS = `const WORK_CARD_PAPERCLIP_DATA_URI = ${JSON.stringify(WORK_CARD_PAPERCLIP_DATA_URI)};

    function cardEvidenceId(item = {}) {
      return item.intentId || "";
    }

    function cardKey(item = {}, columnId = "") {
      return String(item.rawId || item.intentId || item.id || columnId);
    }

    function openEvidenceDossier(id) {
      if (!id || !evidenceDossiers().some((dossier) => dossier.id === id)) return;
      state.selectedEvidenceId = id;
      state.tab = normalizeTab("Evidence");
      syncDashboardRoute();
      render();
    }

    function blockedRetryAction(item = {}) {
      const entityType = item.entityType;
      const entityId = item.rawId || item.entityId;
      if (item.status !== "blocked" || !["intent", "task"].includes(entityType) || !entityId) return "";
      return '<span class="work-card-action" role="button" tabindex="0" data-retry-entity-type="' + escapeHtml(entityType) + '" data-retry-entity-id="' + escapeHtml(entityId) + '">' + escapeHtml(actionLabel("Continue work")) + '</span>';
    }

    async function retryBlockedWork(entityType, entityId, trigger) {
      if (!entityType || !entityId || trigger?.getAttribute("aria-disabled") === "true") return;
      const originalText = trigger?.textContent || actionLabel("Continue work");
      try {
        if (trigger) {
          trigger.setAttribute("aria-disabled", "true");
          trigger.textContent = actionLabel("Retrying...");
        }
        await postJson("/ai-team/api/engine/retry-blocked", {
          entityType,
          entityId,
          reason: "dashboard retry blocked work"
        }, true);
        await refresh({ force: true });
      } catch (error) {
        if (trigger) {
          trigger.classList.add("failed");
          trigger.textContent = actionLabel("Retry failed");
          trigger.title = error.message;
          window.setTimeout(() => {
            trigger.classList.remove("failed");
            trigger.textContent = originalText;
            trigger.removeAttribute("title");
          }, 2400);
        }
      } finally {
        trigger?.removeAttribute("aria-disabled");
      }
    }

    function wireBoardCards(board) {
      board.querySelectorAll("[data-retry-entity-type][data-retry-entity-id]").forEach((action) => {
        const run = (event) => {
          event.preventDefault();
          event.stopPropagation();
          retryBlockedWork(action.dataset.retryEntityType, action.dataset.retryEntityId, action);
        };
        action.onclick = run;
        action.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") run(event);
        };
      });
      board.querySelectorAll(".work-card[data-evidence-id]").forEach((button) => {
        const id = button.dataset.evidenceId;
        if (!id) return;
        button.onclick = (event) => {
          if (event.target?.closest?.("[data-retry-entity-type]")) return;
          openEvidenceDossier(id);
        };
      });
    }

    function compactWorkCardText(value, maxLength = 150) {
      const text = String(value ?? "").replace(/\\s+/g, " ").trim();
      if (!text) return "";
      return text.length > maxLength ? text.slice(0, maxLength - 3).trimEnd() + "..." : text;
    }

    function workCardEntityType(item = {}) {
      const entityType = String(item.entityType || "").toLowerCase();
      if (["intent", "task", "feedback"].includes(entityType)) return entityType;
      const key = String(item.rawId || item.id || "").toLowerCase();
      if (key.includes("intent")) return "intent";
      if (key.includes("task")) return "task";
      if (key.includes("feedback")) return "feedback";
      return "work";
    }

    function workCardEntityLabel(entityType) {
      if (entityType === "intent") return copy("Intent");
      if (entityType === "task") return copy("Task");
      if (entityType === "feedback") return copy("Feedback");
      return copy("Work");
    }

    function workCardStepLabel(step = {}) {
      return copy(step.label || "");
    }

    function workCardOverflowAttributes(labels = []) {
      const label = labels.filter(Boolean).join(", ");
      return label ? ' title="' + escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '"' : "";
    }

    function compactWorkCardSteps(steps = []) {
      const list = Array.isArray(steps) ? steps : [];
      const visible = list.slice(0, 3);
      const extraCount = Math.max(0, list.length - visible.length);
      const hiddenLabels = list.slice(visible.length).map(workCardStepLabel).filter(Boolean);
      return extraCount ? [...visible, { label: "+" + extraCount, overflow: true, hiddenLabels }] : visible;
    }

    function compactWorkCardAgents(agents = []) {
      const list = Array.isArray(agents) ? agents : [];
      const visible = list.slice(0, 3);
      const extraCount = Math.max(0, list.length - visible.length);
      return extraCount ? [...visible, { count: extraCount, overflow: true }] : visible;
    }

    function compactWorkCardTitle(item = {}, columnId = "") {
      const feedbackLike = [columnId, item.category, item.status, item.entityType, item.rawId]
        .some((value) => String(value || "").toLowerCase().includes("feedback"));
      const rawTitle = String(item.title ?? "");
      const title = feedbackLike ? rawTitle.replace(/^\\s*Outcome:\\s*/i, "") : rawTitle;
      const cleaned = title
        .replace(/\\s+/g, " ")
        .trim();
      const sentence = cleaned.match(/^(.+?[.!?。！？])(?:\\s|$)/)?.[1] || cleaned;
      return compactWorkCardText(sentence, 118);
    }

    function workCardIsComplete(item = {}, columnId = "") {
      const status = String(item.status || "").toLowerCase();
      const column = String(columnId || "").toLowerCase();
      return Boolean(item.done) || ["done", "completed", "accepted"].includes(status) || ["done", "completed", "accepted"].includes(column);
    }

    function workCardProgress(item = {}) {
      if (typeof item.progress !== "number") return "";
      return '<div class="progress-row"><span class="progress-label">' + escapeHtml(copy("Overall progress")) + '</span><span class="progress-number">' + item.progress + '%</span></div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + item.progress + '%"></div></div>';
    }

    function workCardStepHtml(steps = []) {
      return steps.map((step) => {
        if (step.overflow) return '<span class="step more"' + workCardOverflowAttributes(step.hiddenLabels) + '>' + escapeHtml(step.label) + '</span>';
        return '<span class="step ' + (step.done ? 'done' : '') + '">' + escapeHtml(copy(step.label)) + (step.done ? ' ✓' : '') + '</span>';
      }).join("");
    }

    function workCardAgentHtml(agents = []) {
      return agents.map((agent) => {
        if (agent.overflow) return '<span class="agent-overflow">+' + escapeHtml(agent.count) + '</span>';
        return '<span class="agent-chip ' + (agent.active ? 'active' : '') + '"><span class="initials ' + escapeHtml(agent.color) + '">' + escapeHtml(agent.initials) + '</span>' + escapeHtml(agent.name) + '</span>';
      }).join("");
    }

    function workCardBrief(item = {}) {
      const acceptance = compactWorkCardText(item.brief?.acceptance || item.brief?.outcome || item.brief?.context || "");
      const quality = typeof item.brief?.quality === "number"
        ? '<span class="brief-chip">' + escapeHtml(copy("Brief quality") + " " + item.brief.quality + "%") + '</span>'
        : "";
      const acceptanceLine = acceptance
        ? '<p class="card-brief">' + escapeHtml(acceptance) + '</p>'
        : "";
      return acceptanceLine || quality ? '<div class="work-card-brief">' + acceptanceLine + quality + '</div>' : "";
    }

    function normalizedWorkCardStatus(value) {
      return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    }

    function workCardStatusRepeatsLane(status, columnId = "") {
      const statusKey = normalizedWorkCardStatus(status);
      const columnKey = normalizedWorkCardStatus(columnId);
      if (!statusKey || !columnKey) return false;
      if (statusKey === columnKey) return true;
      const completeStatuses = ["done", "completed", "accepted"];
      return completeStatuses.includes(statusKey) && completeStatuses.includes(columnKey);
    }

    function workCardStatusMeta(item = {}, columnId = "") {
      const entityType = workCardEntityType(item);
      const entity = '<span class="tag entity ' + escapeHtml(entityType) + '">' + escapeHtml(workCardEntityLabel(entityType)) + '</span>';
      const status = item.status && !workCardStatusRepeatsLane(item.status, columnId) ? '<span class="tag status">' + escapeHtml(statusLabel(item.status)) + '</span>' : "";
      const category = item.category ? '<span class="tag category ' + escapeHtml(item.category) + '">' + escapeHtml(item.category) + '</span>' : "";
      return '<div class="work-card-status-meta"><span class="card-id">' + escapeHtml(item.id) + '</span>' + entity + status + category + '</div>';
    }

    function workCardAssociationText(item = {}) {
      const entityType = workCardEntityType(item);
      if (entityType === "intent") return "";
      const parentTitle = compactWorkCardText(item.intentTitle || item.parentTitle || "", 74);
      const projectName = compactWorkCardText(item.projectName || "", 74);
      if (parentTitle) return [parentTitle, projectName && projectName !== parentTitle ? projectName : ""].filter(Boolean).join(" · ");
      if (projectName) return projectName;
      if (entityType !== "task") return "";
      const parts = [];
      const selfId = item.rawId || item.id;
      const fallbackIntentId = item.intentId && item.intentId !== selfId ? compactWorkCardText(item.intentId, 36) : "";
      if (fallbackIntentId) parts.push(fallbackIntentId);
      return parts.filter(Boolean).join(" · ");
    }

    function workCardFooterMeta(item = {}, agents = []) {
      const association = workCardAssociationText(item);
      const agentNames = new Set(agents.filter((agent) => !agent.overflow).map((agent) => agent.name).filter(Boolean));
      const owner = item.owner && !agentNames.has(item.owner)
        ? '<span class="work-card-owner">' + escapeHtml(item.owner) + '</span>'
        : "";
      const associationHtml = association ? '<span class="work-card-association">' + escapeHtml(association) + '</span>' : "";
      return owner || associationHtml ? '<div class="meta-row">' + owner + associationHtml + '</div>' : "";
    }

    function cardClip(accent) {
      return '<span class="card-clip ' + escapeHtml(accent) + '" aria-hidden="true">' +
        '<img class="clip-image" src="' + WORK_CARD_PAPERCLIP_DATA_URI + '" alt="" draggable="false">' +
      '</span>';
    }

    function card(item, columnAccent, columnId = "") {
      const accent = item.dot || columnAccent || "orange";
      const entityType = workCardEntityType(item);
      const evidenceId = cardEvidenceId(item);
      const retryAction = blockedRetryAction(item);
      const disabled = evidenceId || retryAction ? "" : " disabled";
      const isComplete = workCardIsComplete(item, columnId);
      const steps = compactWorkCardSteps(item.steps);
      const involvedAgents = compactWorkCardAgents(item.involvedAgents);
      const progress = workCardProgress(item);
      const stepHtml = workCardStepHtml(steps);
      const involvedAgentsHtml = workCardAgentHtml(involvedAgents);
      return '<button class="work-card ' + accent + ' entity-' + entityType + (isComplete ? ' is-complete' : '') + '" type="button" data-owner="' + escapeHtml(item.owner) + '" data-evidence-id="' + escapeHtml(evidenceId) + '" data-card-key="' + escapeHtml(cardKey(item, columnId)) + '"' + disabled + '>' +
        (isComplete ? '<div class="check">✓</div>' : '') +
        cardClip(accent) +
        '<span class="status-dot ' + accent + '"></span>' +
        workCardStatusMeta(item, columnId) +
        '<div class="card-title">' + escapeHtml(compactWorkCardTitle(item, columnId)) + '</div>' +
        workCardBrief(item) +
        progress +
        (stepHtml ? '<div class="steps">' + stepHtml + '</div>' : '') +
        (involvedAgentsHtml ? '<div class="agent-row">' + involvedAgentsHtml + '</div>' : '') +
        workCardFooterMeta(item, involvedAgents) +
        retryAction +
      '</button>';
    }

    function captureBoardRects(board) {
      const rects = new Map();
      if (!board) return rects;
      board.querySelectorAll(".work-card[data-card-key]").forEach((element) => {
        const rect = element.getBoundingClientRect();
        rects.set(element.dataset.cardKey, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      });
      return rects;
    }

    function animateBoardMoves(board, previousRects) {
      if (!board || !previousRects?.size) return;
      requestAnimationFrame(() => {
        board.querySelectorAll(".work-card[data-card-key]").forEach((element) => {
          const previous = previousRects.get(element.dataset.cardKey);
          if (!previous) {
            element.classList.add("entered");
            window.setTimeout(() => element.classList.remove("entered"), 460);
            return;
          }
          const next = element.getBoundingClientRect();
          const dx = previous.left - next.left;
          const dy = previous.top - next.top;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
          element.classList.add("moving");
          element.style.transition = "none";
          element.style.transform = "translate(" + dx + "px, " + dy + "px)";
          element.getBoundingClientRect();
          element.style.transition = "";
          element.style.transform = "";
          window.setTimeout(() => {
            element.classList.remove("moving");
            element.style.transform = "";
          }, 520);
        });
      });
    }

    function renderBoard() {
      const board = byId("board");
      if (!board) return;
      const previousRects = captureBoardRects(board);
      board.innerHTML = (state.data.columns || []).map((column) => {
        const visible = (column.items || []).filter((item) => matchesFilter(item, column.id));
        const cards = visible.length ? visible.map((item) => card(item, column.accent, column.id)).join("") : '<div class="empty">' + escapeHtml(copy("No live work")) + '</div>';
        return '<section class="column" data-column-id="' + escapeHtml(column.id || column.title || "") + '">' +
          '<div class="column-head"><span class="accent ' + escapeHtml(column.accent) + '"></span><span>' + escapeHtml(copy(column.title)) + '</span><span class="count-pill">' + visible.length + '</span></div>' +
          '<div class="cards">' + cards + '</div>' +
        '</section>';
      }).join("");
      wireBoardCards(board);
      animateBoardMoves(board, previousRects);
    }

    `;

const WORKING_AGENTS_JS = `function workingAgentMeta(agent = {}) {
      return [agent.runId, agent.provider && agent.model ? agent.provider + " / " + agent.model : agent.provider || agent.model]
        .filter(Boolean)
        .join(" · ");
    }

    function workingAgentCard(agent = {}) {
      return '<button class="working-agent-card" type="button" data-working-run-id="' + escapeHtml(agent.runId || "") + '" aria-label="' + escapeHtml(copy("Open live run detail")) + '">' +
        '<div class="working-agent-head"><span class="initials ' + escapeHtml(agent.color) + '">' + escapeHtml(agent.initials || agent.name || agent.role || "?") + '</span><div><strong>' + escapeHtml(agent.name || agent.role || copy("Employee")) + '</strong><span>' + escapeHtml(agent.title || agent.role || "") + '</span></div><span class="status-pill ' + escapeHtml(agent.state || "running") + '">' + escapeHtml(statusLabel(agent.state || "running")) + '</span></div>' +
        '<p>' + escapeHtml(agent.workTitle || copy("Current work")) + '</p>' +
        (workingAgentMeta(agent) ? '<div class="small mono">' + escapeHtml(workingAgentMeta(agent)) + '</div>' : '') +
      '</button>';
    }

    function renderWorkingAgents() {
      const target = byId("workingAgentsPanel");
      if (!target) return;
      const working = state.data.workingAgents || [];
      if (!working.length) {
        target.innerHTML = '<section class="working-agents-empty"><div><h2>' + escapeHtml(copy("Working now")) + '</h2><p class="small">' + escapeHtml(copy("No employees are running right now.")) + '</p></div></section>';
        return;
      }
      target.innerHTML = '<section class="working-agents"><div class="working-agents-title"><h2>' + escapeHtml(copy("Working now")) + '</h2><span class="count-pill">' + working.length + '</span></div><div class="working-agent-grid">' + working.map(workingAgentCard).join("") + '</div></section>';
      target.querySelectorAll("[data-working-run-id]").forEach((button) => {
        button.onclick = () => openRunDetail(button.dataset.workingRunId, { updateRoute: false });
      });
    }

    `;

const REALTIME_DASHBOARD_JS = `function renderDashboardChrome() {
      const active = (state.data.agents || []).filter((agent) => agent.active).length;
      if (byId("activeAgents")) byId("activeAgents").textContent = active + " agents active";
      if (byId("viewTitle")) byId("viewTitle").textContent = state.tab === "Overview" ? "All Work" : state.tab;
      if (byId("itemCount")) byId("itemCount").textContent = (state.data.counts?.items || 0) + " items";
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.tab));
      renderNav();
      renderFilters();
    }

    function renderRealtimeDashboardData({ force = false } = {}) {
      if (force) {
        render();
        return;
      }
      renderDashboardChrome();
      if (state.tab === "Overview") {
      renderBoard();
        renderOwnerAttention();
        renderContextRequests();
        renderWorkingAgents();
        renderWorkIntake();
      }
      if (!state.runDetailOpen) renderRunDetailRoot();
      renderLanguageSwitch();
      localizeDom(document.body);
    }

    function applyDashboardData(nextData, { force = false } = {}) {
      const previousReadinessResult = state.data.readiness?.lastActionResult;
      state.data = nextData || state.data;
      if (previousReadinessResult && state.data.readiness && readinessHasAction(previousReadinessResult.action)) {
        state.data.readiness.lastActionResult = previousReadinessResult;
      }
      state.tab = normalizeTab(state.tab);
      renderRealtimeDashboardData({ force });
      refreshOpenRunDetail();
    }

    function dashboardWebSocketUrl() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return protocol + "//" + window.location.host + "/ai-team/api/dashboard/ws";
    }

    function connectDashboardStream() {
      if (!("WebSocket" in window) || state.dashboardSocketConnecting) return;
      state.dashboardSocketConnecting = true;
      try {
        const socket = new WebSocket(dashboardWebSocketUrl());
        state.dashboardSocket = socket;
        socket.onopen = () => {
          state.dashboardSocketConnecting = false;
        };
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type !== "dashboard:update" || !payload.data) return;
            if (state.editingAgentRole || state.chatAgentRole || state.editingProviderId) return;
            applyDashboardData(payload.data);
          } catch {}
        };
        socket.onclose = () => {
          state.dashboardSocketConnecting = false;
          state.dashboardSocket = undefined;
          window.setTimeout(connectDashboardStream, 2000);
        };
        socket.onerror = () => {
          socket.close();
        };
      } catch {
        state.dashboardSocketConnecting = false;
      }
    }

`;

const OWNER_ATTENTION_JS = `function ownerAttentionItems() {
      return state.data.ownerAttention?.items || [];
    }

    function ownerAttentionReason(item = {}) {
      return item.reasonKey ? t(item.reasonKey, item.values || {}) : item.reason || "";
    }

    function ownerAttentionKindLabel(kind) {
      return t("ownerAttention.kind." + (kind || "signal"));
    }

    function ownerAttentionActionLabel(action = {}) {
      if (action.labelKey) return t(action.labelKey);
      return actionLabel(action.label || "Open evidence");
    }

    function ownerAttentionCountLabel(count) {
      return Number(count) === 1 ? t("ownerAttention.countOne") : t("ownerAttention.count", { count });
    }

    function ownerAttentionTitle(item = {}) {
      if (item.kind === "readiness" && item.titleKey) return t(item.titleKey);
      return item.title || t(item.titleKey || "ownerAttention.item");
    }

    function compactOwnerAttentionSummary(value, maxLength = 118) {
      const cleaned = String(value ?? "")
        .replace(/^\\s*Outcome:\\s*/i, "")
        .replace(/\\s+/g, " ")
        .trim();
      if (!cleaned) return "";
      const sentence = cleaned.match(/^(.+?[.!?。！？])(?:\\s|$)/)?.[1] || cleaned;
      return sentence.length > maxLength ? sentence.slice(0, maxLength - 3).trimEnd() + "..." : sentence;
    }

    function ownerAttentionNormalizedText(value) {
      return compactOwnerAttentionSummary(value, 220).toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, " ").trim();
    }

    function ownerAttentionReasonIsDuplicate(title, reason) {
      const titleText = ownerAttentionNormalizedText(title);
      const reasonText = ownerAttentionNormalizedText(reason);
      if (!titleText || !reasonText) return false;
      if (titleText === reasonText) return true;
      if (Math.min(titleText.length, reasonText.length) < 24) return false;
      return titleText.includes(reasonText) || reasonText.includes(titleText);
    }

    function ownerAttentionPrimaryActionButton(item = {}) {
      const action = item.action || {};
      if (!action.target) return "";
      return '<button class="quiet-button" type="button" data-owner-attention-action="' + escapeHtml(action.target) + '">' + escapeHtml(ownerAttentionActionLabel(action)) + '</button>';
    }

    function ownerFeedbackHandledActionButton(item = {}) {
      if (item.kind !== "feedback" || !item.feedbackId) return "";
      return '<button class="quiet-button" type="button" data-owner-attention-action="feedback_done:' + escapeHtml(item.feedbackId) + '">' + escapeHtml(actionLabel("Mark handled")) + '</button>';
    }

    function ownerAttentionActionButton(item = {}) {
      return ownerAttentionPrimaryActionButton(item) + ownerFeedbackHandledActionButton(item);
    }

    function ownerAttentionCard(item = {}) {
      const severity = item.severity || "medium";
      const displayTitle = compactOwnerAttentionSummary(ownerAttentionTitle(item)) || ownerAttentionKindLabel(item.kind);
      const displayReason = compactOwnerAttentionSummary(ownerAttentionReason(item), 132);
      const reasonIsDuplicate = ownerAttentionReasonIsDuplicate(displayTitle, displayReason);
      return '<article class="owner-attention-card ' + escapeHtml(severity) + '">' +
        '<div class="owner-attention-card-head"><span class="status-pill ' + escapeHtml(severity) + '">' + escapeHtml(statusLabel(severity)) + '</span><span class="capability-count">' + escapeHtml(ownerAttentionKindLabel(item.kind)) + '</span></div>' +
        '<h3>' + escapeHtml(displayTitle) + '</h3>' +
        (reasonIsDuplicate ? "" : (displayReason ? '<p>' + escapeHtml(displayReason) + '</p>' : '')) +
        (item.meta ? '<div class="owner-attention-meta">' + escapeHtml(item.meta) + '</div>' : '') +
        '<div class="owner-attention-card-actions">' + ownerAttentionActionButton(item) + '</div>' +
      '</article>';
    }

    async function markOwnerFeedbackHandled(feedbackId, trigger) {
      if (!feedbackId || trigger?.getAttribute("aria-disabled") === "true") return;
      const originalText = trigger?.textContent || actionLabel("Mark handled");
      try {
        if (trigger) {
          trigger.setAttribute("aria-disabled", "true");
          trigger.textContent = actionLabel("Marking handled...");
        }
        await postJson("/ai-team/api/engine/feedback/" + encodeURIComponent(feedbackId) + "/resolve", {
          reason: "dashboard marked feedback handled"
        }, true);
        await refresh({ force: true });
      } catch (error) {
        if (trigger) {
          trigger.classList.add("failed");
          trigger.textContent = actionLabel("Mark handled failed");
          trigger.title = error.message;
          window.setTimeout(() => {
            trigger.classList.remove("failed");
            trigger.textContent = originalText;
            trigger.removeAttribute("title");
          }, 2400);
        }
      } finally {
        trigger?.removeAttribute("aria-disabled");
      }
    }

    function handleOwnerAttentionAction(target, trigger) {
      const [kind, value, extra] = String(target || "").split(":");
      if (kind === "evidence") {
        openEvidenceDossier(value);
        return;
      }
      if (kind === "one_one") {
        const role = value;
        const needId = extra || "";
        openContextRequestOneOne(role, needId);
        return;
      }
      if (kind === "settings") {
        setDashboardTab("Settings");
        return;
      }
      if (kind === "feedback_done") {
        markOwnerFeedbackHandled(value, trigger);
      }
    }

    function renderOwnerAttention() {
      const target = byId("ownerAttention");
      if (!target) return;
      const attention = state.data.ownerAttention || {};
      const items = ownerAttentionItems();
      const total = attention.total ?? items.length;
      const empty = !items.length;
      target.innerHTML = '<section class="owner-attention-panel ' + (empty ? 'is-empty' : '') + '">' +
        '<div class="owner-attention-head"><div><h2>' + escapeHtml(t("ownerAttention.title")) + '</h2><p class="small">' + escapeHtml(t("ownerAttention.subtitle")) + '</p></div><span class="status-pill ' + escapeHtml(attention.status || "steady") + '">' + escapeHtml(empty ? t("ownerAttention.clear") : ownerAttentionCountLabel(total)) + '</span></div>' +
        (empty ? '<p class="small">' + escapeHtml(t("ownerAttention.empty")) + '</p>' : '<div class="owner-attention-grid">' + items.map(ownerAttentionCard).join("") + '</div>') +
      '</section>';
      target.querySelectorAll("[data-owner-attention-action]").forEach((button) => {
        button.onclick = () => handleOwnerAttentionAction(button.dataset.ownerAttentionAction, button);
      });
    }

    `;

const OVERVIEW_READINESS_JS = `function readinessStatusLabel(status) {
      return statusLabel(status || "unknown");
    }

    function redactReadinessText(value) {
      return String(value ?? "")
        .replace(/("(?:(?:[^"]*(?:secret|token|password|credential|authorization|access[_-]?key|api[_-]?key|private[_-]?key)[^"]*)|key)"\\s*:\\s*)"[^"]*"/gi, '$1"[redacted]"')
        .replace(/\\b((?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTHORIZATION|ACCESS[-_]?KEY|API[-_]?KEY|PRIVATE[-_]?KEY)[A-Z0-9_]*)\\s*=\\s*)[^\\s"']+/gi, "$1[redacted]")
        .replace(/\\b((?:Authorization|X-Api-Key|Api-Key)\\s*:\\s*)(?:[A-Za-z][A-Za-z0-9_-]*\\s+)?[^\\s,;]+/gi, "$1[redacted]")
        .replace(/\\bBearer\\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
        .replace(/\\bsk-[A-Za-z0-9_-]{8,}\\b/g, "[redacted]");
    }

    function sanitizeReadinessResult(value, depth = 0) {
      if (depth > 4) return "[truncated]";
      if (typeof value === "string") return redactReadinessText(value);
      if (Array.isArray(value)) return value.map((item) => sanitizeReadinessResult(item, depth + 1));
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !/(secret|token|password|credential|authorization|access[-_]?key|private[-_]?key|api[-_]?key$|^key$)/i.test(key))
        .map(([key, entry]) => [key, sanitizeReadinessResult(entry, depth + 1)]));
    }

    function readinessHasAction(action) {
      if (!action) return false;
      return (state.data.readiness?.items || []).some((item) => (item.action?.target || item.action?.value) === action);
    }

    function defaultSmokePrompt(role) {
      return t("oneOne.smokePrompt");
    }

    function readinessActionButton(action) {
      const target = action?.target || action?.value;
      if (!target) return "";
      return '<button class="quiet-button" type="button" data-readiness-action="' + escapeHtml(target) + '">' + escapeHtml(actionLabel(action.label || "run")) + '</button>';
    }

    function readinessStatusPill(status) {
      return '<span class="status-pill ' + escapeHtml(status || "unknown") + '">' + escapeHtml(readinessStatusLabel(status)) + '</span>';
    }

    function renderReadinessTarget(targetId) {
      const target = byId(targetId);
      if (!target) return;
      const readiness = state.data.readiness || {};
      const items = readiness.items || [];
      if (!items.length) {
        target.innerHTML = "";
        return;
      }
      const result = readiness.lastActionResult
        ? '<pre class="readiness-result">' + escapeHtml(JSON.stringify(readiness.lastActionResult, null, 2)) + '</pre>'
        : "";
      target.innerHTML = '<section class="readiness-panel">' +
        '<div class="readiness-head"><div><h2>' + escapeHtml(t("readiness.title")) + '</h2><p class="small">' + escapeHtml(t("readiness.subtitle")) + '</p></div>' + readinessStatusPill(readiness.overall || "needs_setup") + '</div>' +
        '<div class="readiness-grid">' + items.map((item) =>
          '<article class="readiness-item ' + escapeHtml(item.status || "unknown") + '">' +
            '<div><h3>' + escapeHtml(readinessText(item, "label") || item.id) + '</h3><p class="small">' + escapeHtml(readinessText(item, "reason") || item.reason || "") + '</p></div>' +
            '<div class="readiness-action-row">' + readinessStatusPill(item.status) + readinessActionButton(item.action) + '</div>' +
          '</article>'
        ).join("") + '</div>' + result +
      '</section>';

      target.querySelectorAll("[data-readiness-action]").forEach((button) => {
        button.onclick = async () => {
          const [kind, value] = String(button.dataset.readinessAction || "").split(":");
          if (!kind || !value) return;
          if (kind === "smoke") {
            openAgentChat(value);
            const input = document.querySelector(".one-one-input");
            if (input) {
              input.value = defaultSmokePrompt(value);
              input.focus();
            }
            return;
          }
          if (kind !== "provider") return;
          try {
            button.disabled = true;
            button.textContent = actionLabel("Checking...");
            const check = await postJson("/ai-team/api/model-providers/" + encodeURIComponent(value) + "/check", {}, true);
            const lastActionResult = sanitizeReadinessResult({
              action: "provider:" + value,
              checkedAt: new Date().toISOString(),
              result: check
            });
            await refresh();
            state.data.readiness = state.data.readiness || {};
            state.data.readiness.lastActionResult = lastActionResult;
            renderOverviewReadiness();
          } catch (error) {
            state.data.readiness.lastActionResult = sanitizeReadinessResult({
              action: "provider:" + value,
              checkedAt: new Date().toISOString(),
              error: error.message
            });
            renderOverviewReadiness();
          } finally {
            button.disabled = false;
          }
        };
      });
    }

    function renderOverviewReadiness() {
      renderReadinessTarget("settingsReadiness");
    }

    `;

const CONTEXT_REQUESTS_JS = `function contextRequests() {
      return state.data.contextRequests?.items || [];
    }

    function contextRequestMeta(request = {}) {
      return [
        request.agentTitle || request.role,
        request.sourceMode,
        request.relatedTaskId ? t("contextRequests.relatedTask") + " " + request.relatedTaskId : ""
      ].filter(Boolean).join(" · ");
    }

    function contextRequestDraftKey(request = {}) {
      return [request.role, request.id].filter(Boolean).join(":");
    }

    function contextRequestDraft(request = {}) {
      state.contextRequestDrafts = state.contextRequestDrafts || {};
      const key = contextRequestDraftKey(request);
      if (!state.contextRequestDrafts[key]) {
        state.contextRequestDrafts[key] = {
          kind: request.suggestedMemoryKind || "fact",
          key: request.category ? "context." + request.category : "",
          value: ""
        };
      }
      return state.contextRequestDrafts[key];
    }

    function setContextRequestDraftField(request = {}, field, value) {
      const key = contextRequestDraftKey(request);
      if (!key) return;
      state.contextRequestDrafts = state.contextRequestDrafts || {};
      state.contextRequestDrafts[key] = { ...contextRequestDraft(request), [field]: value };
    }

    function contextRequestStatus(request = {}) {
      state.contextRequestStatus = state.contextRequestStatus || {};
      return state.contextRequestStatus[contextRequestDraftKey(request)];
    }

    function setContextRequestStatus(request = {}, status) {
      const key = contextRequestDraftKey(request);
      if (!key) return;
      state.contextRequestStatus = state.contextRequestStatus || {};
      if (status) state.contextRequestStatus[key] = status;
      else delete state.contextRequestStatus[key];
    }

    function contextRequestPayload(request = {}) {
      const draft = contextRequestDraft(request);
      return {
        value: String(draft.value || "").trim(),
        key: String(draft.key || "").trim(),
        kind: draft.kind || request.suggestedMemoryKind || "fact",
        contextNeedId: request.id
      };
    }

    function contextRequestOutput(request = {}) {
      const status = contextRequestStatus(request);
      if (!status) return "";
      const errorMessage = status.errorKey ? t(status.errorKey) : status.error;
      const text = status.error
        ? t("contextRequests.errorPrefix", { message: errorMessage })
        : status.saving
          ? t("contextRequests.saving")
          : t("contextRequests.saved");
      return '<pre class="context-request-output">' + escapeHtml(text) + '</pre>';
    }

    function contextRequestAnswerForm(request = {}, index = 0) {
      const draft = contextRequestDraft(request);
      const status = contextRequestStatus(request) || {};
      const disabled = status.saving ? " disabled" : "";
      return '<div class="context-request-answer-grid">' +
        '<label class="field full"><span>' + escapeHtml(t("contextRequests.answerLabel")) + '</span><textarea class="context-request-answer" data-context-request-index="' + index + '" data-context-request-field="value" placeholder="' + escapeHtml(t("contextRequests.answerPlaceholder")) + '"' + disabled + '>' + escapeHtml(draft.value || "") + '</textarea></label>' +
        '<div class="context-request-answer-actions">' +
          '<label class="field"><span>' + escapeHtml(t("contextRequests.memoryKind")) + '</span><select class="context-request-memory-kind" data-context-request-index="' + index + '" data-context-request-field="kind"' + disabled + '>' + optionList([{ value: "fact", label: t("oneOne.memoryFact") }, { value: "preference", label: t("oneOne.memoryPreference") }, { value: "procedure", label: t("oneOne.memoryProcedure") }, { value: "episodic", label: t("oneOne.memoryEpisodic") }], draft.kind || request.suggestedMemoryKind || "fact") + '</select></label>' +
          '<label class="field"><span>' + escapeHtml(t("contextRequests.memoryKey")) + '</span><input class="context-request-memory-key" data-context-request-index="' + index + '" data-context-request-field="key" value="' + escapeHtml(draft.key || "") + '" placeholder="' + escapeHtml(t("oneOne.keyPlaceholder")) + '"' + disabled + '></label>' +
          '<div class="context-request-save"><button class="action-button primary save-context-request-memory" type="button" data-context-request-index="' + index + '"' + disabled + '>' + escapeHtml(status.saving ? t("contextRequests.saving") : t("contextRequests.saveMemory")) + '</button></div>' +
        '</div>' +
        contextRequestOutput(request) +
      '</div>';
    }

    function contextRequestCard(request = {}, index = 0) {
      const role = request.role || "";
      const needId = request.id || request.action?.contextNeedId || "";
      return '<article class="context-request-card">' +
        '<div class="context-request-head">' +
          '<div class="context-request-agent"><span class="status-pill ' + escapeHtml(request.priority || "medium") + '">' + escapeHtml(request.priority || "medium") + '</span><strong>' + escapeHtml(request.agentName || role || "Agent") + '</strong></div>' +
          '<button class="quiet-button" type="button" data-context-request-one-one="' + escapeHtml(role) + '" data-context-need-id="' + escapeHtml(needId) + '">' + escapeHtml(t("contextRequests.openOneOne")) + '</button>' +
        '</div>' +
        '<p>' + escapeHtml(request.question || "") + '</p>' +
        (request.whyItMatters ? '<p class="small">' + escapeHtml(request.whyItMatters) + '</p>' : '') +
        '<div class="context-request-meta">' + escapeHtml(contextRequestMeta(request)) + '</div>' +
        contextRequestAnswerForm(request, index) +
      '</article>';
    }

    function openContextRequestOneOne(role, needId) {
      if (!role) return;
      state.oneOneMode = state.oneOneMode || {};
      state.oneOneMode[role] = "needs";
      setActiveOneOneContextNeedId(role, needId);
      openAgentChat(role);
    }

    function renderContextRequests() {
      const target = byId("contextRequests");
      if (!target) return;
      const requests = contextRequests();
      const total = state.data.contextRequests?.total ?? requests.length;
      if (!requests.length) {
        target.innerHTML = '<section class="context-request-panel is-empty"><div class="context-request-title"><div><h2>' + escapeHtml(t("contextRequests.title")) + '</h2><p class="small">' + escapeHtml(t("contextRequests.subtitle")) + '</p></div><span class="status-pill ready">' + escapeHtml(t("contextRequests.count", { count: 0 })) + '</span></div><p class="small">' + escapeHtml(t("contextRequests.empty")) + '</p></section>';
        return;
      }
      target.innerHTML = '<section class="context-request-panel">' +
        '<div class="context-request-title"><div><h2>' + escapeHtml(t("contextRequests.title")) + '</h2><p class="small">' + escapeHtml(t("contextRequests.subtitle")) + '</p></div><span class="status-pill needs_context">' + escapeHtml(t("contextRequests.count", { count: total })) + '</span></div>' +
        '<div class="context-request-list">' + requests.map(contextRequestCard).join("") + '</div>' +
      '</section>';
      target.querySelectorAll("[data-context-request-field]").forEach((field) => {
        const request = requests[Number(field.dataset.contextRequestIndex || 0)];
        field.oninput = () => setContextRequestDraftField(request, field.dataset.contextRequestField, field.value);
        field.onchange = () => setContextRequestDraftField(request, field.dataset.contextRequestField, field.value);
      });
      target.querySelectorAll("[data-context-request-one-one]").forEach((button) => {
        button.onclick = () => openContextRequestOneOne(button.dataset.contextRequestOneOne, button.dataset.contextNeedId || "");
      });
      target.querySelectorAll(".save-context-request-memory").forEach((button) => {
        button.onclick = async () => {
          const request = requests[Number(button.dataset.contextRequestIndex || 0)];
          if (!request?.role || !request.id) return;
          const payload = contextRequestPayload(request);
          if (!payload.value) {
            setContextRequestStatus(request, { error: true, errorKey: "contextRequests.required" });
            renderContextRequests();
            return;
          }
          setContextRequestStatus(request, { saving: true });
          renderContextRequests();
          try {
            await postJson("/ai-team/api/agents/" + encodeURIComponent(request.role) + "/memory", payload, true);
            setContextRequestStatus(request, { saved: true });
            delete state.contextRequestDrafts?.[contextRequestDraftKey(request)];
            await refresh({ force: true });
          } catch (error) {
            setContextRequestStatus(request, { error: error.message });
          }
          renderContextRequests();
        };
      });
    }

    `;

const MCP_TOOL_GROUP_JS = `    function mcpToolDescription(tool = {}) {
      return (state.locale === "zh" ? (tool.descriptionZh || tool.description) : (tool.description || tool.descriptionZh)) || "";
    }

    function mcpToolId(tool = {}) {
      const name = tool.id || tool.name || "";
      if (!name) return "";
      if (name.includes(".")) return name;
      return tool.serverId ? tool.serverId + "." + name : name;
    }

    function mcpToolRow(tool = {}, agent = {}) {
      const id = mcpToolId(tool);
      const description = mcpToolDescription(tool);
      const active = (agent.tools || []).includes(id);
      return '<label class="mcp-tool-row" title="' + escapeHtml(description || id) + '">' +
        '<span class="mcp-tool-copy"><span class="mcp-tool-name">' + escapeHtml(id) + '</span><span class="mcp-tool-description" title="' + escapeHtml(description) + '">' + escapeHtml(description) + '</span></span>' +
        '<input class="mcp-tool-checkbox" type="checkbox" data-tool-id="' + escapeHtml(id) + '" data-mcp-server="' + escapeHtml(tool.serverId || "") + '" ' + (active ? "checked" : "") + '>' +
      '</label>';
    }

`;

const SKILL_BUTTON_JS = `    function skillCapabilityCard(skill = {}, index = 0) {
      const id = skill.id || skill.name || ("skill-" + index);
      const description = skill.description || skill.summary || "";
      const hover = description || skill.path || id;
      const path = skill.path || "";
      return '<div class="skill-capability-card" data-skill-id="' + escapeHtml(id) + '" data-skill-description="' + escapeHtml(description) + '" data-skill-path="' + escapeHtml(path) + '">' +
        '<span class="skill-copy" title="' + escapeHtml(hover) + '"><strong>' + escapeHtml(id) + '</strong><span class="skill-description" title="' + escapeHtml(description) + '">' + escapeHtml(description) + '</span></span>' +
        '<button class="quiet-button remove-skill" type="button" aria-label="' + escapeHtml(actionLabel("Remove Skill")) + '">x</button>' +
      '</div>';
    }

    function skillButton(skill, index) {
      return skillCapabilityCard(skill, index);
    }

`;

const MCP_PANEL_JS = `    function mcpCapabilityCard(mcp = {}, index = 0, agent = {}) {
      const rawId = mcp.id || ("mcp-" + index);
      const id = escapeHtml(rawId);
      const json = mcp.configJson || JSON.stringify({ mcpServers: { [rawId || "server"]: mcp.config || {} } }, null, 2);
      const tools = mcp.tools || [];
      const toolsHtml = tools.length
        ? tools.map((tool) => mcpToolRow({ ...tool, serverId: tool.serverId || rawId }, agent)).join("")
        : '<p class="small mcp-tool-empty">' + escapeHtml(copy("No tools declared by this MCP yet.")) + '</p>';
      return '<section class="mcp-editor mcp-capability-card" data-mcp-id="' + id + '">' +
        '<div class="mcp-capability-head">' +
          '<button class="mcp-capability-toggle" type="button" aria-expanded="false">' +
            '<span class="mcp-capability-name">' + id + '</span>' +
            '<span class="mcp-capability-meta">' + escapeHtml(countText("tools", tools.length)) + '</span>' +
          '</button>' +
          '<div class="mcp-capability-actions">' +
            '<button class="quiet-button sync-mcp-tools" type="button" data-mcp-id="' + id + '">' + escapeHtml(actionLabel("Sync tools")) + '</button>' +
            '<button class="quiet-button edit-mcp" type="button" aria-label="' + escapeHtml(actionLabel("Edit MCP")) + '">' + escapeHtml(actionLabel("Edit MCP")) + '</button>' +
            '<button class="quiet-button remove-mcp" type="button" aria-label="' + escapeHtml(actionLabel("Remove MCP")) + '">x</button>' +
          '</div>' +
        '</div>' +
        '<div class="mcp-capability-tools">' + toolsHtml + '</div>' +
        '<textarea class="mcp-json mcp-json-store" hidden spellcheck="false">' + escapeHtml(json) + '</textarea>' +
      '</section>';
    }

    function mcpPanel(mcp, index) {
      return mcpCapabilityCard(mcp, index, agentByRole(state.editingAgentRole) || {});
    }

`;

const COLLECT_CAPABILITY_JS = `    function collectMcpJsonEditors(scope) {
      return [...scope.querySelectorAll(".mcp-editor .mcp-json")].map((textarea) => ({
        configJson: mcpEditableConfigJson(textarea.value)
      })).filter((mcp) => mcp.configJson.trim());
    }

    function parseMcpJsonObject(jsonText) {
      const parsed = JSON.parse(jsonText);
      if (!parsed || !parsed.mcpServers || typeof parsed.mcpServers !== "object" || Array.isArray(parsed.mcpServers)) {
        throw new Error("MCP config must contain mcpServers");
      }
      return parsed;
    }

    function mcpConfigClone(config) {
      return JSON.parse(JSON.stringify(config));
    }

    function stripMcpToolsForEditor(config) {
      const clone = mcpConfigClone(config);
      for (const server of Object.values(clone.mcpServers || {})) {
        if (server && typeof server === "object" && !Array.isArray(server)) {
          delete server.tools;
          delete server.availableTools;
        }
      }
      return clone;
    }

    function mcpEditableConfigJson(jsonText) {
      const raw = String(jsonText || "").trim();
      if (!raw) return "";
      try {
        return JSON.stringify(stripMcpToolsForEditor(parseMcpJsonObject(raw)), null, 2);
      } catch {
        return jsonText;
      }
    }

    function mergeMcpEditorJson(editorJson, existingJson = "") {
      const edited = parseMcpJsonObject(editorJson);
      return JSON.stringify(stripMcpToolsForEditor(edited), null, 2);
    }

    function mcpIdsFromEditorConfigs(mcps = []) {
      return [...new Set(mcps.flatMap((mcp) => mcpNamesFromJson(mcp.configJson)).filter(Boolean))];
    }

    async function syncSavedMcpTools(role, mcps = []) {
      const ids = mcpIdsFromEditorConfigs(mcps);
      let latest;
      for (const mcpId of ids) {
        latest = await postJson("/ai-team/api/agents/config/" + encodeURIComponent(role) + "/mcps/" + encodeURIComponent(mcpId) + "/tools/sync", {}, true);
      }
      return latest;
    }

    function nestedModalStatus(modal, message) {
      const output = modal?.querySelector(".nested-modal-status");
      if (output) output.textContent = message || "";
    }

    function closeAgentNestedModal(node) {
      const card = node?.closest?.(".agent-config-card") || node;
      card?.querySelector?.(".agent-nested-modal-backdrop")?.remove();
    }

    function agentNestedModal(card, content) {
      closeAgentNestedModal(card);
      card.insertAdjacentHTML("beforeend", '<div class="agent-nested-modal-backdrop" data-close-nested-modal="true">' + content + '</div>');
    }

    function openMcpJsonModal(button, mode = "create") {
      const card = button.closest(".agent-config-card");
      if (!card) return;
      const mcpCard = mode === "edit" ? button.closest(".mcp-capability-card") : undefined;
      const targetIndex = mcpCard ? [...card.querySelectorAll(".mcp-capability-card")].indexOf(mcpCard) : -1;
      const store = mcpCard?.querySelector(".mcp-json-store");
      const existingJson = store?.value || "";
      const title = mode === "edit" ? actionLabel("Edit MCP") : actionLabel("Add MCP");
      const saveLabel = mode === "edit" ? actionLabel("Save MCP") : actionLabel("Add MCP");
      const value = mode === "edit" ? mcpEditableConfigJson(existingJson) : "";
      agentNestedModal(card, '<section class="agent-nested-modal mcp-json-modal" role="dialog" aria-modal="true" data-mode="' + escapeHtml(mode) + '" data-target-index="' + targetIndex + '">' +
        '<div class="nested-modal-head"><div><h3>' + escapeHtml(title) + '</h3><p class="small">' + escapeHtml(copy("MCP configuration")) + '</p></div><button class="quiet-button close-nested-agent-modal" type="button">' + escapeHtml(actionLabel("Close")) + '</button></div>' +
        '<textarea class="mcp-json-modal-textarea" spellcheck="false" placeholder="' + escapeHtml(sampleMcpJson()) + '">' + escapeHtml(value) + '</textarea>' +
        '<p class="small nested-modal-status"></p>' +
        '<div class="actions"><button class="quiet-button close-nested-agent-modal" type="button">' + escapeHtml(actionLabel("Cancel")) + '</button><button class="action-button primary save-mcp-json-modal" type="button">' + escapeHtml(saveLabel) + '</button></div>' +
      '</section>');
      wireAgentConfigActions();
      card.querySelector(".mcp-json-modal-textarea")?.focus();
    }

    function openSkillInstallModal(button) {
      const card = button.closest(".agent-config-card");
      if (!card) return;
      agentNestedModal(card, '<section class="agent-nested-modal skill-install-modal" role="dialog" aria-modal="true">' +
        '<div class="nested-modal-head"><div><h3>' + escapeHtml(actionLabel("Add Skill")) + '</h3><p class="small">' + escapeHtml(copy("Skill install command")) + '</p></div><button class="quiet-button close-nested-agent-modal" type="button">' + escapeHtml(actionLabel("Close")) + '</button></div>' +
        '<div class="field full"><label>' + escapeHtml(copy("Skill install command")) + '</label><input class="skill-install-command" placeholder="npx skills install code-review"></div>' +
        '<p class="small nested-modal-status"></p>' +
        '<div class="actions"><button class="quiet-button close-nested-agent-modal" type="button">' + escapeHtml(actionLabel("Cancel")) + '</button><button class="action-button primary save-skill-install-modal" type="button">' + escapeHtml(actionLabel("Install Skill")) + '</button></div>' +
      '</section>');
      wireAgentConfigActions();
      card.querySelector(".skill-install-command")?.focus();
    }

    function collectRemovedSkillIds(scope) {
      try {
        return JSON.parse(scope.dataset.removedSkillIds || "[]").map(String).filter(Boolean);
      } catch {
        return [];
      }
    }

`;

const AGENT_EDITOR_ASSIST_JS = `    function agentEditorSectionLabel(title, detail) {
      return '<div class="agent-editor-section-label full">' +
        '<div><h3>' + escapeHtml(title) + '</h3><p class="small">' + escapeHtml(detail) + '</p></div>' +
      '</div>';
    }

    function agentEditorTabPanel(id, title, detail) {
      const active = id === "identity";
      return '<section class="agent-editor-tab-panel full ' + (active ? "active" : "") + '" data-editor-section="' + escapeHtml(id) + '" id="agent-editor-' + escapeHtml(id) + '" role="tabpanel">' +
        agentEditorSectionLabel(title, detail);
    }

    function agentEditorSubsectionLabel(title, detail) {
      return '<div class="agent-editor-subsection-label full">' +
        '<div><h3>' + escapeHtml(title) + '</h3><p class="small">' + escapeHtml(detail) + '</p></div>' +
      '</div>';
    }

    function agentEditorMemoryRows(items = [], emptyText) {
      if (!items.length) return '<p class="small">' + escapeHtml(emptyText) + '</p>';
      return '<div class="agent-memory-list">' + items.slice(0, 5).map((item) => {
        const title = item.key || item.category || item.title || item.priority || copy("Memory");
        const text = item.text || item.question || item.summary || item.whyItMatters || "";
        const meta = [item.priority, item.sourceMode, item.relatedTaskId, item.createdAt].filter(Boolean).join(" · ");
        return '<article class="agent-memory-row">' +
          '<div><strong>' + escapeHtml(title) + '</strong>' +
          (text ? '<p>' + escapeHtml(text) + '</p>' : '') +
          (meta ? '<p class="small">' + escapeHtml(meta) + '</p>' : '') +
          '</div>' +
        '</article>';
      }).join("") + '</div>';
    }

    function agentEditorMemorySection(kind, title, detail, count, body) {
      return '<section class="agent-memory-section ' + escapeHtml(kind) + '">' +
        '<div class="agent-memory-section-head"><div><h4>' + escapeHtml(title) + '</h4><p class="small">' + escapeHtml(detail) + '</p></div><span class="capability-count">' + escapeHtml(String(count || 0)) + '</span></div>' +
        body +
      '</section>';
    }

    function agentEditorMemoryPanel(agent = {}) {
      const memory = agent.memory || {};
      const facts = memory.facts || [];
      const playbooks = memory.playbooks || [];
      const contextNeeds = memory.contextNeeds || [];
      const episodic = [
        memory.recentSummaryPreview ? { key: copy("Recent summary"), text: memory.recentSummaryPreview } : undefined,
        memory.coachingJournalPreview ? { key: copy("Coaching journal"), text: memory.coachingJournalPreview } : undefined
      ].filter(Boolean);
      const readiness = memory.readiness || {};
      const score = Math.max(0, Math.min(100, Number(readiness.score || 0)));
      return agentEditorTabPanel("memory", copy("Memory"), copy("Inspect durable facts, reusable procedures, episodic context, and unresolved context needs.")) +
        '<div class="agent-memory-readiness full">' +
          '<div><strong>' + escapeHtml(statusLabel(readiness.status || "unknown")) + '</strong><p class="small">' + escapeHtml(t("employee.contextScore", { score })) + '</p></div>' +
          '<div class="progress-track"><div class="progress-fill" style="width:' + score + '%"></div></div>' +
        '</div>' +
        '<div class="agent-memory-grid full">' +
          agentEditorMemorySection("semantic", copy("Semantic facts"), copy("Stable facts this employee should treat as true."), memory.factCount || facts.length, agentEditorMemoryRows(facts, copy("No semantic facts yet."))) +
          agentEditorMemorySection("procedural", copy("Procedural playbooks"), copy("Repeatable ways this employee should work."), memory.playbookCount || playbooks.length, agentEditorMemoryRows(playbooks, copy("No procedural playbooks yet."))) +
          agentEditorMemorySection("episodic", copy("Episodic context"), copy("Recent sessions, coaching, and summarized events."), episodic.length + (memory.hasRecentSummary ? 1 : 0), agentEditorMemoryRows(episodic, copy("No episodic summary yet."))) +
          agentEditorMemorySection("context-needs", copy("Open context needs"), copy("Questions this employee needs answered before harder work."), memory.openContextNeedCount || contextNeeds.length, agentEditorMemoryRows(contextNeeds, copy("No open context needs."))) +
        '</div>' +
      '</section>';
    }

    function setAgentEditorTab(card, section = "identity") {
      if (!card) return;
      const known = new Set(["identity", "routing", "integrations", "memory"]);
      const next = known.has(section) ? section : "identity";
      card.dataset.agentEditorTab = next;
      card.querySelectorAll(".agent-editor-tab-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.editorSection === next);
      });
      card.querySelectorAll(".agent-editor-nav-button").forEach((button) => {
        const active = button.dataset.editorSection === next;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
    }

    function agentEditorNavButton(target, label, value) {
      const active = target === "identity";
      return '<button class="agent-editor-nav-button ' + (active ? "active" : "") + '" type="button" role="tab" aria-selected="' + (active ? "true" : "false") + '" data-editor-section="' + escapeHtml(target) + '">' +
        '<span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong>' +
      '</button>';
    }

    function agentEditorRail(agent = {}, selectedModelProvider = {}, tools = []) {
      const readiness = employeeReadiness(agent);
      const score = Math.max(0, Math.min(100, Number(readiness.score || 0)));
      const enabled = new Set(agent.tools || []);
      const enabledTools = tools.filter((tool) => enabled.has(tool.id));
      const elevated = enabledTools.filter((tool) => ["medium", "high", "critical"].includes(String(tool.risk || "").toLowerCase())).length;
      const model = (selectedModelProvider.providerId || copy("provider")) + " · " + (selectedModelProvider.model || copy("model"));
      const integrationSummary = [
        countText("skills", (agent.skills || []).length),
        countText("mcps", (agent.mcps || []).length),
        countText("tools", enabledTools.length)
      ].join(" · ");
      const nav = [
        ["identity", copy("Identity"), agent.role || "-"],
        ["routing", copy("Routing"), countText("wakeRules", (agent.wakeRules || []).length)],
        ["integrations", copy("Integrations"), integrationSummary],
        ["memory", copy("Memory"), agentMemoryCountText(agent.memory)]
      ];
      return '<aside class="agent-editor-rail">' +
        '<div class="agent-editor-rail-card">' +
          '<div class="agent-editor-rail-title"><span>' + escapeHtml(copy("Configuration map")) + '</span><strong>' + escapeHtml(statusLabel(readiness.status || "ready")) + '</strong></div>' +
          '<div class="agent-editor-score"><span>' + escapeHtml(t("employee.contextScore", { score })) + '</span><div class="progress-track"><div class="progress-fill" style="width:' + score + '%"></div></div></div>' +
          '<div class="agent-editor-rail-meta">' +
            '<span class="capability-count">' + escapeHtml(model) + '</span>' +
            '<span class="capability-count">' + escapeHtml(t("employee.editor.elevatedTools", { count: elevated })) + '</span>' +
          '</div>' +
        '</div>' +
        '<nav class="agent-editor-nav" role="tablist" aria-label="' + escapeHtml(copy("Configuration map")) + '">' + nav.map((item) => agentEditorNavButton(item[0], item[1], item[2])).join("") + '</nav>' +
      '</aside>';
    }

    function markAgentEditorDirty(card) {
      if (!card) return;
      card.classList.add("is-dirty");
      const role = card.dataset.role;
      const stateEl = role ? document.getElementById("agent-save-" + role) : card.querySelector(".agent-save-state");
      if (stateEl) stateEl.textContent = copy("Unsaved changes");
    }

`;

const NESTED_CAPABILITY_HANDLER_JS = `      document.querySelectorAll(".open-skill-install-modal").forEach((button) => {
        button.onclick = () => openSkillInstallModal(button);
      });
      document.querySelectorAll(".close-nested-agent-modal").forEach((button) => {
        button.onclick = () => closeAgentNestedModal(button);
      });
      document.querySelectorAll(".agent-nested-modal-backdrop").forEach((backdrop) => {
        backdrop.onclick = (event) => {
          if (event.target === backdrop) closeAgentNestedModal(backdrop);
        };
      });
      document.querySelectorAll(".save-skill-install-modal").forEach((button) => {
        button.onclick = async () => {
          const card = button.closest(".agent-config-card");
          const modal = button.closest(".skill-install-modal");
          const role = card?.dataset.role;
          const input = modal?.querySelector(".skill-install-command");
          const command = input?.value.trim();
          const stateEl = document.getElementById("agent-save-" + role);
          if (!role || !command) return;
          try {
            button.disabled = true;
            nestedModalStatus(modal, copy("Installing skill..."));
            if (stateEl) stateEl.textContent = copy("Installing skill...");
            const result = await postJson("/ai-team/api/agents/config/" + encodeURIComponent(role) + "/skills", { command }, true);
            if (result.modelProviders) state.data.modelProviders = result.modelProviders;
            const index = (state.data.agentConfigs?.agents || []).findIndex((agent) => agent.role === role);
            if (index >= 0) state.data.agentConfigs.agents[index] = result.agent;
            if (stateEl) stateEl.textContent = copy("Skill added");
            closeAgentNestedModal(button);
            renderAgentConfigModal();
            wireAgentConfigActions();
          } catch (error) {
            nestedModalStatus(modal, error.message);
            if (stateEl) stateEl.textContent = error.message;
          } finally {
            button.disabled = false;
          }
        };
      });
      document.querySelectorAll(".add-mcp-json").forEach((button) => {
        button.onclick = () => openMcpJsonModal(button, "create");
      });
      document.querySelectorAll(".save-mcp-json-modal").forEach((button) => {
        button.onclick = () => {
          const card = button.closest(".agent-config-card");
          const modal = button.closest(".mcp-json-modal");
          const textarea = modal?.querySelector(".mcp-json-modal-textarea");
          if (!card || !modal || !textarea) return;
          const mode = modal.dataset.mode || "create";
          const targetIndex = Number(modal.dataset.targetIndex || -1);
          const target = targetIndex >= 0 ? card.querySelectorAll(".mcp-capability-card")[targetIndex] : undefined;
          const existingJson = target?.querySelector(".mcp-json-store")?.value || "";
          try {
            const fullJson = mergeMcpEditorJson(textarea.value, existingJson);
            const names = mcpNamesFromJson(fullJson);
            if (!names.length) throw new Error("MCP config must include at least one server");
            const name = names[0];
            if (mode === "edit" && target) {
              const store = target.querySelector(".mcp-json-store");
              if (store) store.value = fullJson;
              target.dataset.mcpId = name;
              const nameEl = target.querySelector(".mcp-capability-name");
              if (nameEl) nameEl.textContent = name;
              const syncButton = target.querySelector(".sync-mcp-tools");
              if (syncButton) syncButton.dataset.mcpId = name;
            } else {
              const list = card.querySelector(".mcp-button-list");
              const empty = list?.querySelector(".small");
              if (empty && !list.querySelector(".mcp-editor")) empty.remove();
              list?.insertAdjacentHTML("beforeend", mcpPanel({ id: name, configJson: fullJson }, list.querySelectorAll(".mcp-editor").length));
            }
            markAgentEditorDirty(card);
            closeAgentNestedModal(button);
            wireAgentConfigActions();
          } catch (error) {
            nestedModalStatus(modal, error.message);
          }
        };
      });
`;

const SYNC_MCP_TOOLS_HANDLER_JS = `      document.querySelectorAll(".sync-mcp-tools").forEach((button) => {
        button.onclick = async () => {
          const card = button.closest(".agent-config-card");
          const role = card?.dataset.role;
          const mcpId = button.dataset.mcpId;
          const stateEl = document.getElementById("agent-save-" + role);
          if (!role || !mcpId || role === "__new__") return;
          try {
            button.disabled = true;
            if (stateEl) stateEl.textContent = actionLabel("Syncing tools...");
            const result = await postJson("/ai-team/api/agents/config/" + encodeURIComponent(role) + "/mcps/" + encodeURIComponent(mcpId) + "/tools/sync", {}, true);
            if (result.modelProviders) state.data.modelProviders = result.modelProviders;
            const index = (state.data.agentConfigs?.agents || []).findIndex((agent) => agent.role === role);
            if (index >= 0) state.data.agentConfigs.agents[index] = result.agent;
            if (stateEl) stateEl.textContent = actionLabel("Tools synced");
            renderAgentConfigModal();
            wireAgentConfigActions();
          } catch (error) {
            if (stateEl) stateEl.textContent = error.message;
          } finally {
            button.disabled = false;
          }
        };
      });
      document.querySelectorAll(".mcp-capability-toggle").forEach((button) => {
        button.onclick = () => {
          const card = button.closest(".mcp-capability-card");
          if (!card) return;
          const open = !card.classList.contains("is-open");
          card.classList.toggle("is-open", open);
          button.setAttribute("aria-expanded", open ? "true" : "false");
        };
      });
      document.querySelectorAll(".edit-mcp").forEach((button) => {
        button.onclick = (event) => {
          event.stopPropagation();
          openMcpJsonModal(button, "edit");
        };
      });
      document.querySelectorAll(".remove-mcp").forEach((button) => {
        button.onclick = (event) => {
          event.stopPropagation();
          if (!window.confirm(copy("Remove this MCP?"))) return;
          const editor = button.closest(".agent-config-card");
          button.closest(".mcp-capability-card")?.remove();
          markAgentEditorDirty(editor);
        };
      });
      document.querySelectorAll(".remove-skill").forEach((button) => {
        button.onclick = (event) => {
          event.stopPropagation();
          if (!window.confirm(copy("Remove this Skill?"))) return;
          const editor = button.closest(".agent-config-card");
          const skill = button.closest(".skill-capability-card");
          const skillId = skill?.dataset.skillId;
          if (editor && skillId) {
            const removed = new Set(collectRemovedSkillIds(editor));
            removed.add(skillId);
            editor.dataset.removedSkillIds = JSON.stringify([...removed]);
          }
          skill?.remove();
          markAgentEditorDirty(editor);
        };
      });
      document.querySelectorAll(".mcp-tool-checkbox").forEach((input) => {
        input.onchange = () => markAgentEditorDirty(input.closest(".agent-config-card"));
      });
`;

const EMPLOYEE_CONFIG_JS = `function employeeConfigSummary(agents = []) {
      const fallback = state.data.agentConfigs?.summary;
      if (fallback) return fallback;
      const ready = agents.filter((agent) => oneOneMemoryReadiness(agent.role).status === "ready").length;
      const scores = agents.map((agent) => Number(oneOneMemoryReadiness(agent.role).score || 0));
      const openContextNeeds = agents.reduce((sum, agent) => sum + Number(agent.memory?.openContextNeedCount || 0), 0);
      return {
        status: ready === agents.length ? "ready" : "needs_context",
        total: agents.length,
        ready,
        needsContext: agents.length - ready,
        openContextNeeds,
        averageContextScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
        gaps: {}
      };
    }

    function employeeTouchesTask(task = {}, role = "") {
      return task.producerRole === role || task.claimedByRole === role || task.consumerRole === role;
    }

    function employeeActiveWorkCount(role) {
      const activeStatuses = new Set(["waiting", "working", "testing", "deploying", "worked", "tested"]);
      return (engineSnapshot().tasks || []).filter((task) => activeStatuses.has(task.status) && employeeTouchesTask(task, role)).length;
    }

    function employeeFailedRunCount(role) {
      return (engineSnapshot().runs || []).filter((run) => run.agentRole === role && ["failed", "timed_out"].includes(run.status)).length;
    }

    function employeeReadiness(agent = {}) {
      return agent.memory?.readiness || oneOneMemoryReadiness(agent.role);
    }

    function employeeStatus(agent = {}) {
      const role = agent.role || "";
      const readiness = employeeReadiness(agent);
      if (employeeFailedRunCount(role)) return "failed";
      if (readiness.status && readiness.status !== "ready") return readiness.status;
      if (employeeActiveWorkCount(role)) return "active";
      return "ready";
    }

    function employeeNextAction(agent = {}) {
      const readiness = employeeReadiness(agent);
      const gaps = readiness.gaps || [];
      const openNeeds = Number(agent.memory?.openContextNeedCount || 0);
      if (employeeFailedRunCount(agent.role)) return t("employee.action.inspectFailure");
      if (openNeeds || gaps.some((gap) => gap.id === "open_context_needs")) return t("employee.action.resolveContext");
      if (gaps.some((gap) => ["provider_model", "tool_policy", "wake_rules"].includes(gap.id))) return t("employee.action.fixConfig");
      if (gaps.length) return t("employee.action.coachMemory");
      return t("employee.action.ready");
    }

    function employeeMetric(label, value) {
      return '<div class="employee-metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
    }

    function employeeCommandPanel(agents = []) {
      const summary = employeeConfigSummary(agents);
      return '<section class="employee-command-panel">' +
        '<div class="employee-command-head"><div><h2>' + escapeHtml(t("employee.title")) + '</h2><p class="small">' + escapeHtml(t("employee.subtitle")) + '</p></div><span class="status-pill ' + escapeHtml(summary.status || "ready") + '">' + escapeHtml(statusLabel(summary.status || "ready")) + '</span></div>' +
        '<div class="employee-metric-grid">' +
          employeeMetric(t("employee.metric.ready"), (summary.ready || 0) + "/" + (summary.total || agents.length || 0)) +
          employeeMetric(t("employee.metric.needsContext"), summary.needsContext || 0) +
          employeeMetric(t("employee.metric.averageContext"), (summary.averageContextScore || 0) + "%") +
          employeeMetric(t("employee.metric.openNeeds"), summary.openContextNeeds || 0) +
        '</div>' +
      '</section>';
    }

    function employeeImprovementPlan() {
      return state.data.employeeImprovementPlan || { status: "ready", total: 0, affectedEmployees: 0, items: [] };
    }

    function employeeImprovementTitle(item = {}) {
      return item.titleKey ? t(item.titleKey, item.values || {}) : item.title || t("employee.improvement.item");
    }

    function employeeImprovementReason(item = {}) {
      return item.reasonKey ? t(item.reasonKey, item.values || {}) : item.reason || "";
    }

    function employeeImprovementKindLabel(kind) {
      return t("employee.improvement.kind." + (kind || "memory_gap"));
    }

    function employeeImprovementActionLabel(action = {}) {
      if (!action.label) return t("employee.improvement.action.open");
      return actionLabel(action.label);
    }

    function employeeImprovementPrompt(item = {}) {
      if (item.promptKey) return t(item.promptKey, item.values || {});
      return t("employee.improvement.prompt.default", {
        title: employeeImprovementTitle(item),
        reason: employeeImprovementReason(item)
      });
    }

    function employeeImprovementActionButton(item = {}, index = 0) {
      const action = item.action || {};
      if (!action.target) return "";
      return '<button class="quiet-button employee-improvement-action" type="button" data-employee-improvement-index="' + index + '">' + escapeHtml(employeeImprovementActionLabel(action)) + '</button>';
    }

    function employeeImprovementCard(item = {}, index = 0) {
      const reason = employeeImprovementReason(item);
      return '<article class="employee-improvement-card ' + escapeHtml(item.severity || "medium") + '">' +
        '<div class="employee-improvement-head"><span class="status-pill ' + escapeHtml(item.severity || "medium") + '">' + escapeHtml(statusLabel(item.severity || "medium")) + '</span><span class="capability-count">' + escapeHtml(employeeImprovementKindLabel(item.kind)) + '</span></div>' +
        '<h3>' + escapeHtml(employeeImprovementTitle(item)) + '</h3>' +
        (reason ? '<p>' + escapeHtml(reason) + '</p>' : '') +
        '<div class="employee-improvement-meta"><span class="agent"><span class="initials ' + escapeHtml(item.agentColor || "orange") + '">' + escapeHtml(item.agentInitials || String(item.agentName || item.role || "AI").slice(0, 2).toUpperCase()) + '</span>' + escapeHtml(item.agentName || item.role || "-") + '</span>' + (item.meta ? '<span>' + escapeHtml(item.meta) + '</span>' : '') + '</div>' +
        '<div class="employee-improvement-actions">' + employeeImprovementActionButton(item, index) + '</div>' +
      '</article>';
    }

    function employeeImprovementQueue() {
      const plan = employeeImprovementPlan();
      const items = plan.items || [];
      const count = plan.total ?? items.length;
      return '<section class="employee-improvement-panel ' + (items.length ? "" : "is-empty") + '">' +
        '<div class="employee-improvement-title"><div><h2>' + escapeHtml(t("employee.improvement.title")) + '</h2><p class="small">' + escapeHtml(t("employee.improvement.subtitle")) + '</p></div><span class="status-pill ' + escapeHtml(plan.status || "ready") + '">' + escapeHtml(t("employee.improvement.count", { count })) + '</span></div>' +
        (items.length ? '<div class="employee-improvement-list">' + items.map(employeeImprovementCard).join("") + '</div>' : '<p class="small">' + escapeHtml(t("employee.improvement.empty")) + '</p>') +
      '</section>';
    }

    function openEmployeeImprovementAction(item = {}) {
      const action = item.action || {};
      const [kind, value] = String(action.target || "").split(":");
      if (kind === "evidence") {
        openEvidenceDossier(value);
        return;
      }
      if (kind === "edit_agent" || kind === "agent_config") {
        openAgentEditor(value);
        return;
      }
      if (kind !== "one_one") return;
      const role = item.role || value;
      if (!role) return;
      state.oneOneMode = state.oneOneMode || {};
      state.oneOneMode[role] = "chat";
      setActiveOneOneContextNeedId(role, item.contextNeedId || "");
      setOneOneComposerMode(role, item.kind === "memory_gap" ? "memory_plan" : "context_audit");
      setOneOneLinkedContext(role, {
        employeeImprovementId: item.id,
        kind: item.kind,
        intentId: item.intentId,
        taskId: item.taskId,
        runId: item.runId,
        contextNeedId: item.contextNeedId,
        gapId: item.gapId
      });
      openAgentChat(role);
      const modal = document.querySelector('.one-one-modal[data-role="' + CSS.escape(role) + '"]');
      const input = modal?.querySelector(".one-one-input");
      if (input) {
        input.value = employeeImprovementPrompt(item);
        input.focus();
      }
    }

    function wireEmployeeImprovementQueue() {
      const items = employeeImprovementPlan().items || [];
      document.querySelectorAll(".employee-improvement-action").forEach((button) => {
        button.onclick = (event) => {
          event.stopPropagation();
          openEmployeeImprovementAction(items[Number(button.dataset.employeeImprovementIndex || 0)]);
        };
      });
    }

    function employeeSignal(label, value, className = "") {
      return '<div class="employee-signal ' + escapeHtml(className) + '"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
    }

    function employeePromptPreview(agent = {}) {
      const text = agentPromptSummary(agent, agent.title || agent.agentDir || "");
      return text.length > 180 ? text.slice(0, 177) + "..." : text;
    }

    function employeeModelLabel(agent = {}, selectedModel = {}) {
      return agent.modelProvider?.providerId && agent.modelProvider?.model
        ? (selectedModel.providerId || copy("provider")) + " · " + (selectedModel.model || copy("model"))
        : t("employee.model.unassigned");
    }

    function employeeCard(agent = {}) {
      const role = escapeHtml(agent.role);
      const selectedModel = agentModelProvider(agent);
      const readiness = employeeReadiness(agent);
      const score = Math.max(0, Math.min(100, Number(readiness.score || 0)));
      const activeWork = employeeActiveWorkCount(agent.role);
      const failedRuns = employeeFailedRunCount(agent.role);
      const status = employeeStatus(agent);
      return '<article class="agent-summary-card employee-card open-agent-editor" role="button" tabindex="0" aria-label="' + escapeHtml(actionLabel("Edit") + " " + (agent.name || agent.title || agent.role)) + '" data-role="' + role + '">' +
        '<div class="employee-card-head"><h2>' + escapeHtml(agent.name || agent.title || agent.role) + ' <span class="status-pill configured">' + role + '</span></h2><span class="status-pill ' + escapeHtml(status) + '">' + escapeHtml(statusLabel(status)) + '</span></div>' +
        '<p class="small">' + escapeHtml(employeePromptPreview(agent)) + '</p>' +
        '<div class="employee-score-row"><span>' + escapeHtml(t("employee.contextScore", { score })) + '</span><strong>' + escapeHtml(employeeNextAction(agent)) + '</strong></div>' +
        '<div class="progress-track employee-score-track"><div class="progress-fill" style="width:' + score + '%"></div></div>' +
        '<div class="employee-signal-grid">' +
          employeeSignal(t("employee.signal.activeWork"), activeWork, activeWork ? "active" : "") +
          employeeSignal(t("employee.signal.failedRuns"), failedRuns, failedRuns ? "failed" : "") +
          employeeSignal(t("employee.signal.openNeeds"), agent.memory?.openContextNeedCount || 0, agent.memory?.openContextNeedCount ? "needs_context" : "") +
        '</div>' +
        '<div class="capability-counts">' +
          '<span class="capability-count">' + escapeHtml(copy("Prompt")) + '</span>' +
          '<span class="capability-count">' + escapeHtml(countText("skills", (agent.skills || []).length)) + '</span>' +
          '<span class="capability-count">' + escapeHtml(countText("mcps", (agent.mcps || []).length)) + '</span>' +
          '<span class="capability-count">' + escapeHtml(countText("tools", (agent.tools || []).length)) + '</span>' +
          '<span class="capability-count">' + escapeHtml(countText("wakeRules", (agent.wakeRules || []).length)) + '</span>' +
          '<span class="capability-count">' + escapeHtml(agentMemoryCountText(agent.memory)) + '</span>' +
          '<span class="capability-count">' + escapeHtml(employeeModelLabel(agent, selectedModel)) + '</span>' +
        '</div>' +
        '<div class="agent-card-actions">' +
          '<button class="quiet-button one-one-agent" type="button" data-role="' + role + '">' + escapeHtml(t("oneOne.label")) + '</button>' +
          '<button class="quiet-button edit-agent" type="button" data-role="' + role + '">' + escapeHtml(actionLabel("Edit")) + '</button>' +
        '</div>' +
      '</article>';
    }

    function renderAgentConfig() {
      const target = byId("agentConfig");
      if (!target) return;
      const config = state.data.agentConfigs || {};
      const agents = config.agents || [];
      const agentCards = agents.map(employeeCard).join("");
      const addCard = '<button class="agent-summary-card add-agent-card open-new-agent-editor" type="button">' +
        '<h2>' + escapeHtml(actionLabel("Add Agent")) + '</h2>' +
        '<p class="small">' + escapeHtml(copy("Create a new employee with persona, Skills, tools, and routing.")) + '</p>' +
      '</button>';
      target.innerHTML = employeeCommandPanel(agents) + employeeImprovementQueue() + '<div class="agent-summary-grid">' + agentCards + addCard + '</div>';
      wireEmployeeImprovementQueue();
      renderAgentConfigModal();
      renderAgentChatModal();
      wireAgentConfigActions();
    }

    `;

const WORK_INTAKE_JS = `function workIntakeMessage() {
      const status = state.workIntakeStatus;
      if (!status) return "";
      return '<div class="work-intake-output ' + escapeHtml(status.type || "idle") + '">' + escapeHtml(status.message || "") + '</div>';
    }

    function workIntakeDraft() {
      if (typeof state.workIntakeDraft === "string") {
        return { text: state.workIntakeDraft };
      }
      const draft = state.workIntakeDraft || {};
      if (draft.text !== undefined || draft.audioName !== undefined) return draft;
      const legacy = [draft.outcome, draft.context, draft.acceptance, draft.constraints].filter(Boolean).join("\\n\\n");
      return legacy ? { text: legacy } : {};
    }

    function workIntakeText(draft = workIntakeDraft()) {
      return String(draft.text || "").trim();
    }

    function setWorkIntakeText(value) {
      state.workIntakeDraft = { ...workIntakeDraft(), text: value };
    }

    function workIntakeRequiredReady(draft = workIntakeDraft()) {
      return Boolean(workIntakeText(draft) || draft.audioName);
    }

    function workIntakeBriefFields(draft = workIntakeDraft()) {
      return { text: workIntakeText(draft), audioName: draft.audioName };
    }

    function completedWorkIntakeFields(draft = workIntakeDraft()) {
      return workIntakeRequiredReady(draft) ? ["text"] : [];
    }

    function clearWorkIntakeTransientError() {
      if (!state.workIntakeStatus || state.workIntakeStatus.type === "running") return;
      state.workIntakeStatus = undefined;
      document.querySelector(".work-intake-output")?.remove();
    }

    function formatWorkIntakeBrief(draft = workIntakeDraft()) {
      return workIntakeText(draft);
    }

    function defaultCeoChannel() {
      return state.defaultCeoChannel || {};
    }

    function workIntakeMessages() {
      return defaultCeoChannel().messages || [];
    }

    function renderWorkIntakeBubble(item = {}) {
      const role = item.role === "agent" ? "agent" : "user";
      const label = role === "agent" ? "CEO" : copy("You");
      const meta = item.intentId ? '<span class="status-pill configured">' + escapeHtml(item.intentId) + '</span>' : "";
      return '<div class="work-intake-bubble-row ' + role + '">' +
        '<div class="work-intake-bubble">' +
          '<div class="work-intake-bubble-meta"><span>' + escapeHtml(label) + '</span>' + meta + '</div>' +
          '<div class="work-intake-bubble-text">' + escapeHtml(item.text || "") + '</div>' +
        '</div>' +
      '</div>';
    }

    function renderWorkIntakeMessages() {
      const messages = workIntakeMessages();
      if (!messages.length) {
        return '<div class="work-intake-empty">' + escapeHtml(copy("Start a default-channel conversation with CEO. When the discussion becomes work, CEO can create the Intent.")) + '</div>';
      }
      return messages.map(renderWorkIntakeBubble).join("");
    }

    function workIntakeHasFocusedControl() {
      const active = document.activeElement;
      return Boolean(active?.closest?.("#workIntake") && ["TEXTAREA", "INPUT", "SELECT"].includes(active.tagName));
    }

    function workIntakeChannelLabel(channel = defaultCeoChannel()) {
      if (channel.channel === "feishu") return copy("Feishu personal");
      return copy("Dashboard channel");
    }

    function workIntakeContextLabel(channel = defaultCeoChannel()) {
      const threadId = String(channel.threadId || "").trim();
      if (!threadId || threadId === channel.channel || threadId === "dashboard") return copy("Default context");
      return threadId;
    }

    function renderWorkIntakeBadges(channel = defaultCeoChannel()) {
      return '<span class="status-pill">' + escapeHtml(workIntakeChannelLabel(channel)) + '</span><span class="status-pill">' + escapeHtml(workIntakeContextLabel(channel)) + '</span>';
    }

    function refreshWorkIntakeMessages() {
      const messagesEl = byId("workIntakeMessages");
      if (messagesEl) {
        messagesEl.innerHTML = renderWorkIntakeMessages();
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
      const badges = document.querySelector("#workIntake .work-intake-badges");
      if (badges) badges.innerHTML = renderWorkIntakeBadges();
    }

    async function loadDefaultCeoChannel(force = false) {
      if (state.defaultCeoChannelLoading) return;
      if (!force && state.defaultCeoChannel) return;
      state.defaultCeoChannelLoading = true;
      try {
        const response = await fetch("/ai-team/api/dashboard/default-channel");
        if (response.ok) state.defaultCeoChannel = await response.json();
      } catch (error) {
        state.workIntakeStatus = { type: "error", message: error.message };
      } finally {
        state.defaultCeoChannelLoading = false;
        state.defaultCeoChannel = state.defaultCeoChannel || { messages: [] };
        renderWorkIntake();
      }
    }

    function readAudioFile(file) {
      return new Promise((resolve, reject) => {
        if (!file) return resolve(undefined);
        const reader = new FileReader();
        reader.onload = () => resolve({
          name: file.name,
          mimeType: file.type,
          size: file.size,
          dataUrl: String(reader.result || "")
        });
        reader.onerror = () => reject(reader.error || new Error(copy("Audio upload failed.")));
        reader.readAsDataURL(file);
      });
    }

    function renderWorkIntake() {
      const target = byId("workIntake");
      if (!target) return;
      const draft = workIntakeDraft();
      if (!state.defaultCeoChannel && !state.defaultCeoChannelLoading) loadDefaultCeoChannel();
      const channel = defaultCeoChannel();
      if (target.childElementCount && workIntakeHasFocusedControl()) {
        refreshWorkIntakeMessages();
        return;
      }
      target.innerHTML = '<section class="work-intake-panel">' +
        '<div class="work-intake-head"><div><h2>' + escapeHtml(copy("CEO Conversation")) + '</h2><p class="small">' + escapeHtml(copy("Synced with the default Channel context.")) + '</p></div><div class="work-intake-badges">' + renderWorkIntakeBadges(channel) + '</div></div>' +
        '<div class="work-intake-chat" id="workIntakeMessages">' + renderWorkIntakeMessages() + '</div>' +
        '<div class="work-intake-form">' +
          '<label class="field full work-intake-field"><span>' + escapeHtml(copy("Message CEO")) + '</span><textarea id="workIntakeText" rows="4" placeholder="' + escapeHtml(copy("Talk with CEO, or add notes for an audio upload.")) + '">' + escapeHtml(draft.text || "") + '</textarea></label>' +
          '<div class="work-intake-audio-row">' +
            '<label class="quiet-button work-intake-audio-label" for="workIntakeAudio">' + escapeHtml(copy("Upload audio")) + '</label>' +
            '<input id="workIntakeAudio" type="file" accept="audio/*">' +
            '<span class="small" id="workIntakeAudioName">' + escapeHtml(draft.audioName || copy("No audio selected.")) + '</span>' +
          '</div>' +
          '<div class="work-intake-actions"><button class="quiet-button" id="resetWorkIntakeContext" type="button">' + escapeHtml(copy("Reset context")) + '</button><button class="action-button primary" id="submitWorkIntake" type="button">' + escapeHtml(copy("Send to CEO")) + '</button></div>' +
        '</div>' +
        workIntakeMessage() +
      '</section>';
      const messagesEl = byId("workIntakeMessages");
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      const input = byId("workIntakeText");
      if (input) input.oninput = () => {
        setWorkIntakeText(input.value);
        clearWorkIntakeTransientError();
      };
      const audioInput = byId("workIntakeAudio");
      if (audioInput) audioInput.onchange = () => {
        const file = audioInput.files?.[0];
        state.workIntakeAudioFile = file;
        state.workIntakeDraft = { ...workIntakeDraft(), audioName: file?.name || "" };
        clearWorkIntakeTransientError();
        renderWorkIntake();
      };
      const resetButton = byId("resetWorkIntakeContext");
      if (resetButton) resetButton.onclick = async () => {
        try {
          resetButton.disabled = true;
          state.workIntakeStatus = { type: "running", message: copy("Resetting context...") };
          const result = await postJson("/ai-team/api/dashboard/default-channel/reset", {}, true);
          state.defaultCeoChannel = result;
          state.workIntakeDraft = {};
          state.workIntakeAudioFile = undefined;
          state.workIntakeStatus = { type: "success", message: copy("Dynamic CEO chat context reset.") };
          renderWorkIntake();
        } catch (error) {
          state.workIntakeStatus = { type: "error", message: error.message };
          renderWorkIntake();
        }
      };
      const button = byId("submitWorkIntake");
      if (!button) return;
      button.onclick = async () => {
        const draft = workIntakeDraft();
        const text = formatWorkIntakeBrief(draft);
        const audioFile = state.workIntakeAudioFile || byId("workIntakeAudio")?.files?.[0];
        if (!workIntakeRequiredReady(draft)) {
          state.workIntakeStatus = { type: "error", message: copy("Write a message or upload audio first.") };
          renderWorkIntake();
          localizeDom(target);
          return;
        }
        try {
          button.disabled = true;
          button.textContent = actionLabel("Sending...");
          state.workIntakeStatus = { type: "running", message: copy("Sending to CEO...") };
          const audio = await readAudioFile(audioFile);
          const result = await postJson("/ai-team/api/dashboard/default-channel/messages", {
            text,
            audio,
            metadata: {
              surface: "dashboard_intake_chat",
              briefFields: workIntakeBriefFields(draft),
              briefCompletedFields: completedWorkIntakeFields(draft)
            }
          }, true);
          state.workIntakeDraft = {};
          state.workIntakeAudioFile = undefined;
          state.defaultCeoChannel = result;
          state.workIntakeStatus = {
            type: "success",
            message: result.intent?.id ? copy("Intent created.") + " " + result.intent.id : copy("CEO replied.")
          };
          await refresh();
          renderWorkIntake();
          localizeDom(target);
        } catch (error) {
          state.workIntakeStatus = { type: "error", message: error.message };
          renderWorkIntake();
          localizeDom(target);
        } finally {
          if (button.isConnected) button.disabled = false;
        }
      };
    }

    `;

const ONE_ONE_CHAT_METADATA_JS = `${lastAgentMemoryDraftText.toString()}

    function renderChatMessage(item) {
      const cls = item.role === "agent" ? "agent" : "user";
      const metadata = item.role === "agent" ? renderOneOneReplyMetadata(item.reply) : "";
      return '<div class="one-one-message ' + cls + '"><div>' + escapeHtml(item.text || "") + '</div>' + metadata + '</div>';
    }

    function oneOneModeFor(role) {
      state.oneOneMode = state.oneOneMode || {};
      return state.oneOneMode[role] || "chat";
    }

    function memoryStatusFor(role) {
      state.oneOneMemoryStatus = state.oneOneMemoryStatus || {};
      return state.oneOneMemoryStatus[role];
    }

    function lastOneOneReply(role) {
      return [...chatHistoryFor(role)].reverse().find((item) => item.reply)?.reply || {};
    }

    function lastAgentMessage(role) {
      return lastAgentMemoryDraftText(chatHistoryFor(role));
    }

    function oneOneComposerMode(role) {
      state.oneOneDraftMode = state.oneOneDraftMode || {};
      return state.oneOneDraftMode[role] || "chat";
    }

    function setOneOneComposerMode(role, mode = "chat") {
      state.oneOneDraftMode = state.oneOneDraftMode || {};
      state.oneOneDraftMode[role] = mode || "chat";
    }

    function oneOneLinkedContext(role) {
      state.oneOneLinkedContext = state.oneOneLinkedContext || {};
      return state.oneOneLinkedContext[role] || {};
    }

    function setOneOneLinkedContext(role, linkedContext = {}) {
      state.oneOneLinkedContext = state.oneOneLinkedContext || {};
      state.oneOneLinkedContext[role] = linkedContext || {};
    }

    function dashboardAgentMemory(role) {
      return agentByRole(role)?.memory || {};
    }

    function agentMemoryCountText(memory = {}) {
      const facts = Number(memory.factCount || 0);
      const playbooks = Number(memory.playbookCount || 0);
      const openNeeds = Number(memory.openContextNeedCount || 0);
      const recent = memory.hasRecentSummary ? " · " + t("oneOne.recentMemory") : "";
      const needs = openNeeds ? " · " + t("oneOne.openNeeds", { count: openNeeds }) : "";
      return t("oneOne.memoryBrief", { facts, playbooks }) + recent + needs;
    }

    function hasMemorySummary(memory = {}) {
      return Boolean(memory.factCount || memory.playbookCount || memory.hasRecentSummary || memory.openContextNeedCount);
    }

    function oneOneOperationalGaps(role) {
      const agent = agentByRole(role) || {};
      const gaps = [];
      if (!agent.modelProvider?.providerId || !agent.modelProvider?.model) gaps.push({ id: "provider_model", promptKind: "diagnostics" });
      const operationalTools = (agent.tools || []).filter((toolId) => String(toolId) !== "skill");
      if (!operationalTools.length) gaps.push({ id: "tool_policy", promptKind: "diagnostics" });
      if (!(agent.wakeRules || []).length) gaps.push({ id: "wake_rules", promptKind: "diagnostics" });
      return gaps;
    }

    function oneOneMemoryReadiness(role) {
      const memory = dashboardAgentMemory(role);
      if (memory.readiness) return memory.readiness;
      const gaps = [];
      if (memory.openContextNeedCount) gaps.push({ id: "open_context_needs", promptKind: "missing_context" });
      if (!memory.factCount) gaps.push({ id: "fact_memory", promptKind: "memory" });
      if (!memory.playbookCount) gaps.push({ id: "procedure_memory", promptKind: "memory" });
      if (!memory.hasRecentSummary) gaps.push({ id: "recent_summary", promptKind: "missing_context" });
      gaps.push(...oneOneOperationalGaps(role));
      let score = (memory.factCount ? 40 : 0) + (memory.playbookCount ? 35 : 0) + (memory.hasRecentSummary ? 25 : 0);
      if (memory.openContextNeedCount) score -= Math.min(20, Number(memory.openContextNeedCount || 0) * 10);
      if (gaps.some((gap) => gap.id === "provider_model")) score -= 10;
      if (gaps.some((gap) => gap.id === "tool_policy")) score -= 10;
      if (gaps.some((gap) => gap.id === "wake_rules")) score -= 5;
      return {
        status: gaps.length ? "needs_context" : "ready",
        score: Math.max(0, Math.min(100, score)),
        gaps
      };
    }

    function oneOneGapText(gap = {}, field) {
      return maybeT("oneOne.gap." + gap.id + "." + field, gap[field] || "");
    }

    function oneOneGapPrompt(gapId) {
      return maybeT("oneOne.gap." + gapId + ".prompt", t("oneOne.askMissingContextPrompt"));
    }

    function oneOneContextReadiness(role, withActions = false) {
      const readiness = oneOneMemoryReadiness(role);
      const gaps = readiness.gaps || [];
      const head = '<div class="one-one-readiness-head">' +
        '<span class="status-pill ' + escapeHtml(readiness.status || "needs_context") + '">' + escapeHtml(statusLabel(readiness.status || "needs_context")) + '</span>' +
        '<span class="capability-count">' + escapeHtml(t("oneOne.contextScore", { score: readiness.score || 0 })) + '</span>' +
      '</div>';
      if (!gaps.length) return head + '<p class="small">' + escapeHtml(t("oneOne.contextReady")) + '</p>';
      return head + '<div class="one-one-gap-list">' + gaps.map((gap) =>
        '<article class="one-one-gap-card">' +
          '<div><strong>' + escapeHtml(oneOneGapText(gap, "label")) + '</strong><p class="small">' + escapeHtml(oneOneGapText(gap, "reason")) + '</p></div>' +
          (withActions ? '<button class="quiet-button one-one-gap-action" type="button" data-one-one-gap="' + escapeHtml(gap.id) + '">' + escapeHtml(t("oneOne.askThisGap")) + '</button>' : "") +
        '</article>'
      ).join("") + '</div>';
    }

    function renderOneOneReplyMetadata(reply = {}) {
      const chips = [];
      const count = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
      if (reply.directAgentTurn) chips.push('<span class="capability-count">' + escapeHtml(t("oneOne.directTurn")) + '</span>');
      if (reply.mode && reply.mode !== "chat") chips.push('<span class="capability-count">' + escapeHtml(t("oneOne.structuredCoaching")) + '</span>');
      if ((reply.contextNeeds || []).length) chips.push('<span class="capability-count">' + escapeHtml(t("oneOne.structuredNeeds", { count: reply.contextNeeds.length })) + '</span>');
      if ((reply.memorySuggestions || []).length) chips.push('<span class="capability-count">' + escapeHtml(t("oneOne.memorySuggestions", { count: reply.memorySuggestions.length })) + '</span>');
      if (reply.coachingRecord?.id) chips.push('<span class="capability-count">' + escapeHtml(t("oneOne.coachingRecorded")) + '</span>');
      const selection = reply.providerSelection || {};
      const providerId = selection.providerId || reply.provider;
      const model = selection.model || reply.model;
      if (providerId || model) chips.push('<span class="capability-count">' + escapeHtml(providerId || copy("provider")) + ' · ' + escapeHtml(model || copy("model")) + '</span>');
      if (reply.capabilities) {
        const capabilities = reply.capabilities || {};
        chips.push('<span class="capability-count">' + escapeHtml(countText("skills", count(capabilities.skillCount))) + '</span>');
        chips.push('<span class="capability-count">' + escapeHtml(countText("mcps", count(capabilities.mcpCount))) + '</span>');
        chips.push('<span class="capability-count">' + escapeHtml(countText("tools", count(capabilities.toolCount))) + '</span>');
      }
      if (reply.agentMemory?.factCount || reply.agentMemory?.playbookCount) {
        chips.push('<span class="capability-count">' + escapeHtml(t("oneOne.memoryLoaded")) + '</span>');
      }
      return chips.length ? '<div class="one-one-context">' + chips.join("") + '</div>' : "";
    }

    function oneOneStructuredNeeds(role) {
      return lastOneOneReply(role).contextNeeds || [];
    }

    function oneOneContextNeedsBacklog(role) {
      const memory = dashboardAgentMemory(role);
      return memory.contextNeeds || [];
    }

    function activeOneOneContextNeedId(role) {
      state.oneOneActiveContextNeed = state.oneOneActiveContextNeed || {};
      return state.oneOneActiveContextNeed[role] || "";
    }

    function setActiveOneOneContextNeedId(role, needId) {
      if (!role) return;
      state.oneOneActiveContextNeed = state.oneOneActiveContextNeed || {};
      if (needId) state.oneOneActiveContextNeed[role] = needId;
      else delete state.oneOneActiveContextNeed[role];
    }

    function oneOneMemorySuggestions(role) {
      return lastOneOneReply(role).memorySuggestions || [];
    }

    function renderOneOneNeedCards(needs = [], emptyKey = "oneOne.noStructuredNeeds", buttonClass = "use-need-as-memory", dataName = "data-need-index", lifecycleActions = false) {
      if (!needs.length) return '<p class="small">' + escapeHtml(t(emptyKey)) + '</p>';
      return '<div class="one-one-need-list">' + needs.map((need, index) =>
        '<article class="one-one-need-card">' +
          '<div class="one-one-need-head"><span class="status-pill ' + escapeHtml(need.priority || "medium") + '">' + escapeHtml(need.priority || "medium") + '</span><strong>' + escapeHtml(need.category || "context") + '</strong></div>' +
          '<p>' + escapeHtml(need.question || "") + '</p>' +
          (need.whyItMatters ? '<p class="small">' + escapeHtml(need.whyItMatters) + '</p>' : '') +
          '<div class="one-one-need-actions">' +
            '<button class="quiet-button ' + buttonClass + '" type="button" ' + dataName + '="' + index + '">' + escapeHtml(t("oneOne.useNeedAsMemory")) + '</button>' +
            (lifecycleActions && need.id ? '<button class="quiet-button resolve-context-need" type="button" data-context-need-id="' + escapeHtml(need.id) + '">' + escapeHtml(t("oneOne.markAnswered")) + '</button><button class="quiet-button dismiss-context-need" type="button" data-context-need-id="' + escapeHtml(need.id) + '">' + escapeHtml(t("oneOne.dismissNeed")) + '</button>' : '') +
          '</div>' +
        '</article>'
      ).join("") + '</div>';
    }

    function renderOneOneStructuredNeeds(role) {
      return renderOneOneNeedCards(oneOneStructuredNeeds(role), "oneOne.noStructuredNeeds");
    }

    function renderOneOneContextNeedsBacklog(role) {
      return renderOneOneNeedCards(oneOneContextNeedsBacklog(role), "oneOne.noContextNeedsBacklog", "use-context-need-as-memory", "data-context-need-index", true);
    }

    function renderOneOneMemorySuggestions(role) {
      const suggestions = oneOneMemorySuggestions(role);
      if (!suggestions.length) return '<p class="small">' + escapeHtml(t("oneOne.noMemorySuggestions")) + '</p>';
      return '<div class="one-one-need-list">' + suggestions.map((item, index) =>
        '<article class="one-one-need-card">' +
          '<div class="one-one-need-head"><span class="status-pill configured">' + escapeHtml(item.kind || "fact") + '</span><strong>' + escapeHtml(item.key || t("oneOne.memorySuggestion")) + '</strong></div>' +
          '<p>' + escapeHtml(item.text || "") + '</p>' +
          (item.reason ? '<p class="small">' + escapeHtml(item.reason) + '</p>' : '') +
          '<button class="quiet-button use-memory-suggestion" type="button" data-memory-suggestion-index="' + index + '">' + escapeHtml(t("oneOne.useMemorySuggestion")) + '</button>' +
        '</article>'
      ).join("") + '</div>';
    }

    function oneOnePromptText(kind) {
      if (kind === "missing_context") return t("oneOne.askMissingContextPrompt");
      if (kind === "blockers") return t("oneOne.askBlockersPrompt");
      if (kind === "memory") return t("oneOne.askMemoryPrompt");
      return "";
    }

    function oneOneModeTabs(active) {
      const tabs = [
        ["chat", t("oneOne.chatTab")],
        ["needs", t("oneOne.needsTab")],
        ["memory", t("oneOne.memoryTab")],
        ["diagnostics", t("oneOne.diagnosticsTab")]
      ];
      return '<div class="one-one-mode-tabs" role="tablist">' + tabs.map(([mode, label]) =>
        '<button class="one-one-mode-tab ' + (active === mode ? 'active' : '') + '" type="button" data-one-one-mode="' + mode + '">' + escapeHtml(label) + '</button>'
      ).join("") + '</div>';
    }

    function oneOneChipList(items = []) {
      const values = items.filter(Boolean);
      return values.length
        ? '<div class="one-one-chip-list">' + values.map((item) => '<span class="capability-count">' + escapeHtml(item) + '</span>').join("") + '</div>'
        : '<p class="small">-</p>';
    }

    function oneOneMemorySummary(role) {
      const replyMemory = lastOneOneReply(role).agentMemory || {};
      const memory = hasMemorySummary(replyMemory) ? replyMemory : dashboardAgentMemory(role);
      const savedMemory = memoryStatusFor(role)?.result?.memory;
      const chips = [];
      if (memory.factCount) chips.push(memory.factCount + " " + t("oneOne.memoryFact"));
      if (memory.playbookCount) chips.push(memory.playbookCount + " " + t("oneOne.memoryProcedure"));
      if (memory.hasRecentSummary) chips.push(t("oneOne.memoryLoaded"));
      [...(memory.facts || []), ...(memory.playbooks || [])].slice(0, 3).forEach((item) => {
        const label = item.key || item.text;
        if (label) chips.push(label);
      });
      if (!chips.length && savedMemory?.promoted) {
        chips.push(t("oneOne.memoryLoaded"));
        chips.push(savedMemory.promoted.key || savedMemory.promoted.kind || savedMemory.kind);
      }
      if (!chips.length && savedMemory?.event) chips.push(t("oneOne.memoryEpisodic"));
      return chips.length ? oneOneChipList(chips) : '<p class="small">' + escapeHtml(t("oneOne.noAgentMemory")) + '</p>';
    }

    function oneOneCoachingJournal(role) {
      const replyMemory = lastOneOneReply(role).agentMemory || {};
      const memory = replyMemory.coachingJournalPreview ? replyMemory : dashboardAgentMemory(role);
      const preview = String(memory.coachingJournalPreview || "").trim();
      if (!preview) return '<p class="small">' + escapeHtml(t("oneOne.noCoachingJournal")) + '</p>';
      return '<pre class="one-one-coaching-journal">' + escapeHtml(preview) + '</pre>';
    }

    function oneOneMemoryOutput(role) {
      const status = memoryStatusFor(role);
      if (!status) return "";
      const text = status.error
        ? t("oneOne.memoryErrorPrefix", { message: status.error })
        : status.saving
          ? t("oneOne.memorySaving")
          : t("oneOne.memorySaved") + "\\n" + JSON.stringify(status.result || {}, null, 2);
      return '<pre class="one-one-memory-output is-open">' + escapeHtml(text) + '</pre>';
    }

    function oneOneDiagnostics(agent, selected) {
      const wakeRules = (agent.wakeRules || []).map((rule) => (rule.entityType || "entity") + ":" + (rule.status || "status") + (rule.consumerRole ? " -> " + rule.consumerRole : ""));
      return '<div class="one-one-diagnostics">' +
        '<section class="one-one-diagnostic-group"><h3>' + escapeHtml(t("oneOne.rolePrompt")) + '</h3><p class="small">' + escapeHtml(agentPromptSummary(agent, agent.title || agent.role || "")) + '</p></section>' +
        '<section class="one-one-diagnostic-group"><h3>' + escapeHtml(t("oneOne.providerModel")) + '</h3>' + oneOneChipList([selected.providerId, selected.model]) + '</section>' +
        '<section class="one-one-diagnostic-group"><h3>' + escapeHtml(t("oneOne.capabilities")) + '</h3>' + oneOneChipList([countText("skills", (agent.skills || []).length), countText("mcps", (agent.mcps || []).length), countText("tools", (agent.tools || []).length)]) + '</section>' +
        '<section class="one-one-diagnostic-group"><h3>' + escapeHtml(t("oneOne.wakeRules")) + '</h3>' + oneOneChipList(wakeRules) + '</section>' +
      '</div>';
    }

    function renderAgentChatModal() {
      const root = byId("agentChatModalRoot");
      if (!root) return;
      const role = state.chatAgentRole;
      const agent = role ? agentByRole(role) : undefined;
      if (!agent) {
        root.innerHTML = "";
        return;
      }
      const history = chatHistoryFor(role);
      const selected = agentModelProvider(agent);
      const activeMode = oneOneModeFor(role);
      const activeNeedId = activeOneOneContextNeedId(role);
      const messages = history.length
        ? history.map(renderChatMessage).join("")
        : '<p class="small">' + escapeHtml(t("oneOne.intro")) + '</p>';
      root.innerHTML = '<div class="modal-backdrop chat-backdrop" data-close-agent-chat="true">' +
        '<section class="agent-modal one-one-modal" data-role="' + escapeHtml(role) + '" role="dialog" aria-modal="true" aria-label="' + escapeHtml(t("oneOne.aria")) + '">' +
          '<div class="modal-head">' +
            '<div><h2>' + escapeHtml(agent.name || agent.title || role) + ' <span class="status-pill configured">' + escapeHtml(t("oneOne.label")) + '</span></h2><p class="small">' + escapeHtml(agent.title || role) + '</p></div>' +
            '<div class="modal-head-actions">' + languageSwitchHtml() + '<button class="quiet-button close-agent-chat" type="button">' + escapeHtml(actionLabel("Close")) + '</button></div>' +
          '</div>' +
          '<div class="one-one-body">' +
            '<aside class="one-one-sidebar">' +
              '<div class="one-one-side-block"><h3 class="one-one-section-title">' + escapeHtml(t("oneOne.contextReadiness")) + '</h3>' + oneOneContextReadiness(role) + '</div>' +
              '<div class="one-one-side-block"><h3 class="one-one-section-title">' + escapeHtml(t("oneOne.contextNeedsBacklog")) + '</h3>' + renderOneOneContextNeedsBacklog(role) + '</div>' +
              '<div class="one-one-side-block"><h3 class="one-one-section-title">' + escapeHtml(t("oneOne.memoryLoaded")) + '</h3>' + oneOneMemorySummary(role) + '</div>' +
              '<div class="one-one-side-block"><h3 class="one-one-section-title">' + escapeHtml(t("oneOne.coachingJournal")) + '</h3>' + oneOneCoachingJournal(role) + '</div>' +
              '<div class="one-one-side-block"><h3 class="one-one-section-title">' + escapeHtml(t("oneOne.capabilities")) + '</h3><div class="one-one-context">' +
                '<span class="capability-count">' + escapeHtml(t("oneOne.promptLoaded")) + '</span>' +
                '<span class="capability-count">' + escapeHtml(countText("skills", (agent.skills || []).length)) + '</span>' +
                '<span class="capability-count">' + escapeHtml(countText("mcps", (agent.mcps || []).length)) + '</span>' +
                '<span class="capability-count">' + escapeHtml(countText("tools", (agent.tools || []).length)) + '</span>' +
                '<span class="capability-count">' + escapeHtml(selected.providerId || copy("provider")) + ' · ' + escapeHtml(selected.model || copy("model")) + '</span>' +
              '</div></div>' +
            '</aside>' +
            '<div class="one-one-main">' +
              oneOneModeTabs(activeMode) +
              '<section class="one-one-pane" ' + (activeMode === "chat" ? "" : "hidden") + '><div class="one-one-messages">' + messages + '</div></section>' +
              '<section class="one-one-pane" ' + (activeMode === "needs" ? "" : "hidden") + '><h3 class="one-one-section-title">' + escapeHtml(t("oneOne.needsTab")) + '</h3><p class="small">' + escapeHtml(t("oneOne.needsIntro")) + '</p>' + oneOneContextReadiness(role, true) + '<div class="one-one-prompt-grid">' +
                '<button class="quiet-button one-one-prompt" type="button" data-one-one-prompt="missing_context" data-one-one-mode-request="context_audit">' + escapeHtml(t("oneOne.auditContext")) + '</button>' +
                '<button class="quiet-button one-one-prompt" type="button" data-one-one-prompt="blockers" data-one-one-mode-request="context_audit">' + escapeHtml(t("oneOne.askBlockers")) + '</button>' +
                '<button class="quiet-button one-one-prompt" type="button" data-one-one-prompt="memory" data-one-one-mode-request="memory_plan">' + escapeHtml(t("oneOne.askMemory")) + '</button>' +
              '</div><h3 class="one-one-section-title">' + escapeHtml(t("oneOne.contextNeedsBacklog")) + '</h3>' + renderOneOneContextNeedsBacklog(role) + '<h3 class="one-one-section-title">' + escapeHtml(t("oneOne.structuredNeedsHeading")) + '</h3>' + renderOneOneStructuredNeeds(role) + '</section>' +
              '<section class="one-one-pane" ' + (activeMode === "memory" ? "" : "hidden") + '><h3 class="one-one-section-title">' + escapeHtml(t("oneOne.memoryTab")) + '</h3><p class="small">' + escapeHtml(t("oneOne.memoryIntro")) + '</p><h3 class="one-one-section-title">' + escapeHtml(t("oneOne.memorySuggestionsHeading")) + '</h3>' + renderOneOneMemorySuggestions(role) + '<div class="one-one-form">' +
                '<div class="field"><label>' + escapeHtml(t("oneOne.memoryKind")) + '</label><select class="one-one-memory-kind">' + optionList([{ value: "fact", label: t("oneOne.memoryFact") }, { value: "preference", label: t("oneOne.memoryPreference") }, { value: "procedure", label: t("oneOne.memoryProcedure") }, { value: "episodic", label: t("oneOne.memoryEpisodic") }], "fact") + '</select></div>' +
                '<div class="field"><label>' + escapeHtml(t("oneOne.memoryKey")) + '</label><input class="one-one-memory-key" placeholder="' + escapeHtml(t("oneOne.keyPlaceholder")) + '"></div>' +
                '<div class="field full"><label>' + escapeHtml(t("oneOne.memoryText")) + '</label><textarea class="one-one-memory-value" placeholder="' + escapeHtml(t("oneOne.memoryPlaceholder")) + '"></textarea></div>' +
                '<div class="actions field full"><button class="quiet-button use-last-reply-memory" type="button">' + escapeHtml(t("oneOne.useLastReply")) + '</button><button class="action-button primary save-one-one-memory" type="button">' + escapeHtml(t(activeNeedId ? "oneOne.saveMemoryAndClose" : "oneOne.saveMemory")) + '</button></div>' +
                oneOneMemoryOutput(role) +
              '</div></section>' +
              '<section class="one-one-pane" ' + (activeMode === "diagnostics" ? "" : "hidden") + '><h3 class="one-one-section-title">' + escapeHtml(t("oneOne.diagnosticsTab")) + '</h3><p class="small">' + escapeHtml(t("oneOne.diagnosticsIntro")) + '</p>' + oneOneDiagnostics(agent, selected) + '</section>' +
            '</div>' +
          '</div>' +
          '<div class="one-one-composer">' +
            '<textarea class="one-one-input" placeholder="' + escapeHtml(t("oneOne.placeholder", { name: agent.name || role })) + '" ' + (state.chatSending ? "disabled" : "") + '></textarea>' +
            '<button class="action-button primary send-one-one" type="button" ' + (state.chatSending ? "disabled" : "") + '>' + escapeHtml(state.chatSending ? actionLabel("Sending...") : actionLabel("Send")) + '</button>' +
          '</div>' +
        '</section>' +
      '</div>';
      const messagesEl = root.querySelector(".one-one-messages");
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    `;

const ONE_ONE_SEND_METADATA_JS = `document.querySelectorAll(".send-one-one").forEach((button) => {
        button.onclick = async () => {
          const modal = button.closest(".one-one-modal");
          const role = modal?.dataset.role;
          const input = modal?.querySelector(".one-one-input");
          const message = input?.value.trim();
          if (!role || !message) return;
          const history = chatHistoryFor(role);
          setChatHistory(role, history.concat({ role: "user", text: message }));
          state.chatSending = true;
          renderAgentChatModal();
          wireAgentConfigActions();
          try {
            const result = await postJson("/ai-team/api/agents/" + encodeURIComponent(role) + "/one-one", {
              message,
              mode: oneOneComposerMode(role),
              linkedContext: oneOneLinkedContext(role),
              history: chatHistoryFor(role)
            }, true);
            const reply = result.reply || {};
            const replyText = reply.message || reply.finalMessage || "";
            setChatHistory(role, chatHistoryFor(role).concat({ role: "agent", text: replyText || t("oneOne.noResponse"), reply }));
            setOneOneComposerMode(role, "chat");
            setOneOneLinkedContext(role, {});
          } catch (error) {
            setChatHistory(role, chatHistoryFor(role).concat({ role: "agent", text: t("oneOne.errorPrefix", { message: error.message }) }));
          } finally {
            state.chatSending = false;
            renderAgentChatModal();
            wireAgentConfigActions();
          }
        };
      });
      document.querySelectorAll(".one-one-mode-tab").forEach((button) => {
        button.onclick = () => {
          const modal = button.closest(".one-one-modal");
          const role = modal?.dataset.role;
          if (!role) return;
          state.oneOneMode = state.oneOneMode || {};
          state.oneOneMode[role] = button.dataset.oneOneMode || "chat";
          renderAgentChatModal();
          wireAgentConfigActions();
        };
      });
      document.querySelectorAll(".one-one-prompt").forEach((button) => {
        button.onclick = () => {
          const modal = button.closest(".one-one-modal");
          const role = modal?.dataset.role;
          if (!role) return;
          state.oneOneMode = state.oneOneMode || {};
          state.oneOneMode[role] = "chat";
          setOneOneComposerMode(role, button.dataset.oneOneModeRequest || "chat");
          renderAgentChatModal();
          wireAgentConfigActions();
          const input = document.querySelector(".one-one-input");
          if (input) {
            input.value = oneOnePromptText(button.dataset.oneOnePrompt);
            input.focus();
          }
        };
      });
      document.querySelectorAll(".one-one-gap-action").forEach((button) => {
        button.onclick = () => {
          const modal = button.closest(".one-one-modal");
          const role = modal?.dataset.role;
          if (!role) return;
          state.oneOneMode = state.oneOneMode || {};
          state.oneOneMode[role] = "chat";
          setOneOneComposerMode(role, "context_audit");
          renderAgentChatModal();
          wireAgentConfigActions();
          const input = document.querySelector(".one-one-input");
          if (input) {
            input.value = oneOneGapPrompt(button.dataset.oneOneGap);
            input.focus();
          }
        };
      });
      function fillOneOneNeedMemory(role, need, contextNeedId = "") {
        if (!role || !need) return;
        state.oneOneMode = state.oneOneMode || {};
        state.oneOneMode[role] = "memory";
        setActiveOneOneContextNeedId(role, contextNeedId);
        renderAgentChatModal();
        wireAgentConfigActions();
        const nextModal = document.querySelector('.one-one-modal[data-role="' + CSS.escape(role) + '"]');
        const kind = nextModal?.querySelector(".one-one-memory-kind");
        const value = nextModal?.querySelector(".one-one-memory-value");
        const key = nextModal?.querySelector(".one-one-memory-key");
        if (kind) kind.value = need.suggestedMemoryKind || "fact";
        if (key) key.value = need.category ? "context." + need.category : "";
        if (value) {
          value.value = [need.question, need.whyItMatters].filter(Boolean).join("\\n");
          value.focus();
        }
      }
      document.querySelectorAll(".use-last-reply-memory").forEach((button) => {
        button.onclick = () => {
          const modal = button.closest(".one-one-modal");
          const role = modal?.dataset.role;
          const value = role ? lastAgentMessage(role) : "";
          const input = modal?.querySelector(".one-one-memory-value");
          if (input && value) {
            input.value = value;
            input.focus();
          }
        };
      });
      document.querySelectorAll(".use-need-as-memory").forEach((button) => {
        button.onclick = () => {
          const modal = button.closest(".one-one-modal");
          const role = modal?.dataset.role;
          const need = role ? oneOneStructuredNeeds(role)[Number(button.dataset.needIndex || 0)] : undefined;
          if (!modal || !need) return;
          fillOneOneNeedMemory(role, need);
        };
      });
      document.querySelectorAll(".use-context-need-as-memory").forEach((button) => {
        button.onclick = () => {
          const modal = button.closest(".one-one-modal");
          const role = modal?.dataset.role;
          const need = role ? oneOneContextNeedsBacklog(role)[Number(button.dataset.contextNeedIndex || 0)] : undefined;
          if (!modal || !need) return;
          fillOneOneNeedMemory(role, need, need.id);
        };
      });
      async function resolveOneOneContextNeed(role, needId, status, resolutionType) {
        if (!role || !needId) return;
        state.oneOneMemoryStatus = state.oneOneMemoryStatus || {};
        state.oneOneMemoryStatus[role] = { saving: true };
        try {
          const result = await postJson("/ai-team/api/agents/" + encodeURIComponent(role) + "/context-needs/" + encodeURIComponent(needId) + "/resolve", {
            status,
            resolutionType,
            resolution: status === "dismissed" ? t("oneOne.dismissNeed") : t("oneOne.markAnswered")
          }, true);
          if (activeOneOneContextNeedId(role) === needId) setActiveOneOneContextNeedId(role, "");
          state.oneOneMemoryStatus[role] = { result };
          await refresh({ force: true });
        } catch (error) {
          state.oneOneMemoryStatus[role] = { error: error.message };
        }
        renderAgentChatModal();
        wireAgentConfigActions();
      }
      document.querySelectorAll(".resolve-context-need").forEach((button) => {
        button.onclick = () => {
          const modal = button.closest(".one-one-modal");
          resolveOneOneContextNeed(modal?.dataset.role, button.dataset.contextNeedId, "resolved", "answer");
        };
      });
      document.querySelectorAll(".dismiss-context-need").forEach((button) => {
        button.onclick = () => {
          const modal = button.closest(".one-one-modal");
          resolveOneOneContextNeed(modal?.dataset.role, button.dataset.contextNeedId, "dismissed", "dismissed");
        };
      });
      document.querySelectorAll(".use-memory-suggestion").forEach((button) => {
        button.onclick = () => {
          const modal = button.closest(".one-one-modal");
          const role = modal?.dataset.role;
          const suggestion = role ? oneOneMemorySuggestions(role)[Number(button.dataset.memorySuggestionIndex || 0)] : undefined;
          if (!modal || !suggestion) return;
          const kind = modal.querySelector(".one-one-memory-kind");
          const value = modal.querySelector(".one-one-memory-value");
          const key = modal.querySelector(".one-one-memory-key");
          if (kind) kind.value = suggestion.kind || "fact";
          if (key) key.value = suggestion.key || "";
          if (value) {
            value.value = suggestion.text || "";
            value.focus();
          }
        };
      });
      document.querySelectorAll(".save-one-one-memory").forEach((button) => {
        button.onclick = async () => {
          const modal = button.closest(".one-one-modal");
          const role = modal?.dataset.role;
          const value = modal?.querySelector(".one-one-memory-value")?.value.trim();
          const key = modal?.querySelector(".one-one-memory-key")?.value.trim();
          const kind = modal?.querySelector(".one-one-memory-kind")?.value || "fact";
          const output = modal?.querySelector(".one-one-memory-output");
          if (!role) return;
          if (!value) {
            if (output) {
              output.classList.add("is-open");
              output.textContent = t("oneOne.memoryRequired");
            }
            return;
          }
          try {
            button.disabled = true;
            if (output) {
              output.classList.add("is-open");
              output.textContent = t("oneOne.memorySaving");
            }
            const result = await postJson("/ai-team/api/agents/" + encodeURIComponent(role) + "/memory", { value, key, kind, contextNeedId: activeOneOneContextNeedId(role) }, true);
            setActiveOneOneContextNeedId(role, "");
            state.oneOneMemoryStatus = state.oneOneMemoryStatus || {};
            state.oneOneMemoryStatus[role] = { result: result.result || result };
            await refresh({ force: true });
            renderAgentChatModal();
            wireAgentConfigActions();
          } catch (error) {
            state.oneOneMemoryStatus = state.oneOneMemoryStatus || {};
            state.oneOneMemoryStatus[role] = { error: error.message };
            renderAgentChatModal();
            wireAgentConfigActions();
          } finally {
            button.disabled = false;
          }
        };
      });
`;

const EVIDENCE_DOSSIER_JS = `function evidenceDossiers() {
      return state.data.evidence?.dossiers || [];
    }

    function currentTabItemCount() {
      if (state.tab === "Evidence") return evidenceDossiers().length;
      if (state.tab === "Team") return state.data.agentConfigs?.agents?.length || state.data.agents?.length || 0;
      if (state.tab === "Intake") return 0;
      if (state.tab === "Projects") return (state.data.projects || []).length;
      if (state.tab === "Settings") return (state.data.modelProviders?.providers || []).length + (state.data.channels || []).length;
      return state.data.counts?.items || 0;
    }

    function evidenceMetric(label, value) {
      return '<div class="evidence-metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value ?? 0) + '</strong></div>';
    }

    function evidenceReviewClass(review = {}) {
      return review.severity || review.state || "medium";
    }

    function evidenceReviewStateLabel(state) {
      return t("evidence.review.state." + (state || "in_progress"));
    }

    function evidenceReviewActionLabel(action = {}) {
      return t("evidence.review.action." + (action.kind || "watch_progress"), {
        taskId: action.targetTaskId || "-",
        runId: action.targetRunId || "-",
        feedbackId: action.targetFeedbackId || "-"
      });
    }

    function evidenceRiskLabel(risk = {}) {
      return t("evidence.review.risk." + (risk.kind || "unknown"), {
        text: risk.text || "-",
        taskId: risk.taskId || "-",
        runId: risk.runId || "-",
        feedbackId: risk.feedbackId || "-"
      });
    }

    function evidenceReviewPrompt(dossier = {}, review = {}) {
      const action = evidenceReviewActionLabel(review.nextAction || {});
      const risks = (review.risks || []).map(evidenceRiskLabel).join("; ") || "-";
      return t("oneOne.evidenceReviewPrompt", {
        intent: dossier.brief?.outcome || dossier.goal || dossier.title || dossier.id || "-",
        state: evidenceReviewStateLabel(review.state),
        action,
        risks
      });
    }

    function evidenceReviewAskButton(dossier = {}, review = {}) {
      const action = review.nextAction || {};
      if (!action.role) return "";
      return '<button class="quiet-button evidence-one-one" type="button" data-evidence-one-one="' + escapeHtml(action.role) + '" data-evidence-intent="' + escapeHtml(dossier.id || "") + '" data-evidence-task="' + escapeHtml(action.targetTaskId || "") + '" data-evidence-prompt="' + escapeHtml(evidenceReviewPrompt(dossier, review)) + '">' + escapeHtml(actionLabel("Ask Agent")) + '</button>';
    }

    function evidenceReviewPanel(dossier = {}) {
      const review = dossier.review || {};
      const counts = review.counts || {};
      const risks = review.risks || [];
      const rawProgress = Number(review.progress || 0);
      const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;
      const riskRows = risks.length ? risks.map((risk) =>
        '<li><span class="status-pill ' + escapeHtml(risk.severity || "medium") + '">' + escapeHtml(statusLabel(risk.severity || "medium")) + '</span><span>' + escapeHtml(evidenceRiskLabel(risk)) + '</span></li>'
      ).join("") : '<li><span class="status-pill steady">' + escapeHtml(statusLabel("steady")) + '</span><span>' + escapeHtml(t("evidence.review.noRisks")) + '</span></li>';
      return '<article class="panel wide-panel evidence-review">' +
        '<div class="evidence-review-head">' +
          '<div><h2>' + escapeHtml(copy("Evidence Review")) + '</h2><p class="small">' + escapeHtml(t("evidence.review.summary", { done: counts.doneTasks || 0, total: counts.tasks || 0, qaRejects: counts.qaRejects || 0, openFeedback: counts.openFeedback || 0 })) + '</p></div>' +
          '<span class="status-pill ' + escapeHtml(evidenceReviewClass(review)) + '">' + escapeHtml(evidenceReviewStateLabel(review.state)) + '</span>' +
        '</div>' +
        '<div class="evidence-review-grid">' +
          '<div class="evidence-review-decision"><span>' + escapeHtml(copy("Next action")) + '</span><strong>' + escapeHtml(evidenceReviewActionLabel(review.nextAction || {})) + '</strong>' + evidenceReviewAskButton(dossier, review) + '</div>' +
          '<div class="evidence-review-progress"><div><span>' + escapeHtml(copy("Task completion")) + '</span><strong>' + escapeHtml(progress + "%") + '</strong></div><div class="progress-track"><div class="progress-fill" style="width:' + progress + '%"></div></div></div>' +
        '</div>' +
        '<ul class="evidence-risk-list">' + riskRows + '</ul>' +
      '</article>';
    }

    function selectedEvidenceDossier() {
      const dossiers = evidenceDossiers();
      if (!dossiers.length) return undefined;
      if (!state.selectedEvidenceId || !dossiers.some((dossier) => dossier.id === state.selectedEvidenceId)) {
        state.selectedEvidenceId = dossiers[0].id;
      }
      return dossiers.find((dossier) => dossier.id === state.selectedEvidenceId) || dossiers[0];
    }

    function evidenceDossierCard(dossier) {
      const metrics = dossier.metrics || {};
      const review = dossier.review || {};
      return '<button class="evidence-index-card ' + (state.selectedEvidenceId === dossier.id ? 'active' : '') + '" type="button" data-evidence-id="' + escapeHtml(dossier.id) + '">' +
        '<span class="status-pill ' + escapeHtml(evidenceReviewClass(review)) + '">' + escapeHtml(evidenceReviewStateLabel(review.state)) + '</span>' +
        '<strong>' + escapeHtml(dossier.title || dossier.goal || dossier.id) + '</strong>' +
        '<span class="small">' + escapeHtml((dossier.channel || "-") + " · " + formatDate(dossier.updatedAt)) + '</span>' +
        '<span class="small">' + escapeHtml(metrics.tasks || 0) + ' ' + escapeHtml(copy("tasks")) + ' · ' + escapeHtml(metrics.runs || 0) + ' ' + escapeHtml(copy("runs")) + ' · ' + escapeHtml(metrics.feedback || 0) + ' ' + escapeHtml(copy("feedback")) + '</span>' +
      '</button>';
    }

    function evidenceTimeline(operations = []) {
      if (!operations.length) return '<p class="small">' + escapeHtml(copy("No entity operations have been recorded yet.")) + '</p>';
      return '<div class="evidence-timeline">' + operations.map((operation) =>
        '<div class="evidence-timeline-item">' +
          '<span class="evidence-dot"></span>' +
          '<div><strong>' + escapeHtml(evidenceStatusText(operation.fromStatus) + " -> " + evidenceStatusText(operation.toStatus)) + '</strong>' +
          '<p class="small">' + escapeHtml(evidenceEntityLabel(operation.entityType) + " · " + (operation.entityId || "-")) + '</p>' +
          '<p class="small">' + escapeHtml(evidenceRoleLabel(operation.agentRole) + " · " + formatDate(operation.at)) + '</p>' +
          (operation.reason ? '<p class="small">' + escapeHtml(operation.reason) + '</p>' : '') +
        '</div></div>'
      ).join("") + '</div>';
    }

    function evidenceTraceRows(items, emptyText, mapper) {
      return items.length ? items.map((item) => traceLine(mapper(item))).join("") : '<p class="small">' + escapeHtml(copy(emptyText)) + '</p>';
    }

    function evidenceRunRows(runs = []) {
      if (!runs.length) return '<p class="small">' + escapeHtml(copy("No Engine runs have been recorded.")) + '</p>';
      return runs.map((run) =>
        '<div class="trace-line">' +
          '<span class="label-cell mono"><button class="run-id-button" type="button" data-run-detail-id="' + escapeHtml(run.id || "") + '">' + escapeHtml(run.id || "-") + '</button></span>' +
          '<span>' + escapeHtml(evidenceRoleLabel(run.agentRole)) + '</span>' +
          '<span>' + escapeHtml(evidenceStatusText(run.status) + " · " + ([run.provider || run.runner, run.model].filter(Boolean).join(" / ") || "-")) + '</span>' +
          '<span>' + escapeHtml(run.error?.message || runCapabilitySummary(run.agentConfigSnapshot) || formatDate(run.completedAt || run.startedAt)) + '</span>' +
        '</div>'
      ).join("");
    }

    function runDetailJsonBlock(label, value, open = false) {
      if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return "";
      const printable = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      return '<details class="run-detail-json" ' + (open ? "open" : "") + '><summary>' + escapeHtml(label) + '</summary><pre>' + escapeHtml(printable) + '</pre></details>';
    }

    function runDetailText(value) {
      if (value === undefined || value === null) return "";
      if (typeof value === "string") return value;
      if (typeof value.content === "string") return value.content;
      return JSON.stringify(value, null, 2);
    }

    async function writeClipboardText(text) {
      const clipboard = window.navigator?.clipboard;
      if (clipboard?.writeText) {
        try {
          await clipboard.writeText(text);
          return;
        } catch {
          // Fall back for embedded browsers that expose clipboard but deny writeText.
        }
      }
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.focus();
      field.select();
      field.setSelectionRange(0, field.value.length);
      try {
        if (!document.execCommand("copy")) throw new Error("copy command unavailable");
      } finally {
        field.remove();
      }
    }

    async function copyRunDetailMessageBlock(button) {
      const content = button?.closest(".run-detail-message")?.querySelector("pre")?.textContent || "";
      const originalText = button?.textContent || actionLabel("Copy block");
      try {
        if (button) {
          button.disabled = true;
          button.textContent = actionLabel("Copied");
        }
        await writeClipboardText(content);
      } catch (error) {
        if (button) {
          button.textContent = actionLabel("Copy failed");
          button.title = error.message;
        }
      } finally {
        window.setTimeout(() => {
          if (!button) return;
          button.disabled = false;
          button.textContent = originalText;
          button.removeAttribute("title");
        }, 1400);
      }
    }

    async function copyRunDetailId(button) {
      const runId = state.runDetail?.run?.id || state.runDetail?.id || "";
      const originalText = button?.textContent || actionLabel("Copy Run ID");
      if (!runId) return;
      try {
        button.disabled = true;
        button.textContent = actionLabel("Copied");
        await writeClipboardText(runId);
      } catch (error) {
        button.textContent = actionLabel("Copy failed");
        button.title = error.message;
      } finally {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = originalText;
          button.removeAttribute("title");
        }, 1400);
      }
    }

    function runDetailMessageBlocks(messages = []) {
      if (!Array.isArray(messages) || !messages.length) return '<p class="small">' + escapeHtml(copy("No context messages were recorded for this turn.")) + '</p>';
      return '<section class="run-detail-messages"><h4>' + escapeHtml(copy("Context messages")) + '</h4>' + messages.map((message, index) =>
        '<article class="run-detail-message">' +
          '<div class="run-detail-message-head"><div class="run-detail-message-meta"><span>' + escapeHtml(message.role || "user") + '</span><span>' + escapeHtml(message.source || ("message " + (index + 1))) + '</span></div><button class="quiet-button run-detail-copy-button" type="button" data-run-detail-copy>' + escapeHtml(actionLabel("Copy block")) + '</button></div>' +
          '<pre>' + escapeHtml(runDetailText(message.content)) + '</pre>' +
        '</article>'
      ).join("") + '</section>';
    }

    function runDetailPrefixCacheBlock(prefixCache = {}) {
      if (!prefixCache || typeof prefixCache !== "object") return "";
      const cached = Number(prefixCache.cachedInputTokens || 0);
      const input = prefixCache.inputTokens ?? "-";
      const verdict = cached > 0 ? copy("Prefix cache observed") : copy("No prefix cache observed");
      return '<div class="run-detail-cache-row">' +
        '<span>' + escapeHtml(copy("Prefix cache")) + '</span>' +
        '<strong>' + escapeHtml(verdict) + '</strong>' +
        '<code>' + escapeHtml(cached + " / " + input + " cached input tokens") + '</code>' +
      '</div>';
    }

    function runDetailPrefixCachePill(prefixCache = {}) {
      const cached = Number(prefixCache?.cachedInputTokens || 0);
      const input = prefixCache?.inputTokens ?? "-";
      const state = cached > 0 ? copy("Prefix cache observed") : copy("No prefix cache observed");
      return '<span class="run-detail-cache-pill ' + (cached > 0 ? "hit" : "miss") + '">' + escapeHtml(state) + ' · ' + escapeHtml(cached + "/" + input) + '</span>';
    }

    function runDetailShortId(value = "") {
      const text = String(value || "");
      if (text.length <= 22) return text || "-";
      return text.slice(0, 14) + "..." + text.slice(-6);
    }

    function runDetailElapsed(run = {}) {
      const start = new Date(run.startedAt || run.createdAt || "");
      const end = new Date(run.completedAt || Date.now());
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";
      const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
      const minutes = Math.floor(seconds / 60);
      const rest = seconds % 60;
      return String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
    }

    function runDetailValueRow(label, value, mono = false) {
      return '<div class="run-detail-value-row"><span>' + escapeHtml(label) + '</span><strong class="' + (mono ? "mono" : "") + '">' + escapeHtml(value || "-") + '</strong></div>';
    }

    function runDetailToolSummary(value) {
      if (value === undefined || value === null || value === "") return "-";
      const text = typeof value === "string" ? value : JSON.stringify(value);
      return text.length > 168 ? text.slice(0, 168) + "..." : text;
    }

    function runDetailContextText(messages = []) {
      return (Array.isArray(messages) ? messages : [])
        .map((message) => [message.role || "user", runDetailText(message.content)].join("\\n"))
        .join("\\n\\n---\\n\\n");
    }

    function runDetailTurns(detail = {}) {
      const trace = detail.trace || {};
      const fallbackTurns = (trace.modelCalls || []).map((call, index) => ({
        round: call.round ?? index,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        request: {
          messages: call.submittedMessages,
          tools: call.submittedTools,
          messageCount: call.messageCount,
          toolCount: call.toolCount
        },
        response: {
          message: call.message,
          raw: call.raw
        },
        streamText: call.streamText,
        streamEvents: call.streamEvents || [],
        toolCalls: call.toolCalls || [],
        errors: index === (trace.modelCalls || []).length - 1 ? (trace.errors || []) : []
      }));
      return detail.llmTurns?.length ? detail.llmTurns : fallbackTurns;
    }

    function toolNameForConversation(tool = {}) {
      return tool.name || tool.toolName || tool.function?.name || tool.call?.name || copy("Tool execution");
    }

    function toolInputForConversation(tool = {}) {
      return tool.input ?? tool.arguments ?? tool.params ?? tool.function?.arguments ?? tool.call?.arguments;
    }

    function toolOutputForConversation(tool = {}) {
      return tool.output ?? tool.result ?? tool.response ?? tool.error;
    }

    function runDetailConversationTool(tool = {}, kind = "requested") {
      const name = toolNameForConversation(tool);
      const label = kind === "executed" ? copy("Tool result") : copy("Tool call");
      const status = tool.status || (tool.error ? "failed" : kind === "executed" ? "completed" : "requested");
      const input = toolInputForConversation(tool);
      const output = toolOutputForConversation(tool);
      const duration = tool.durationMs || tool.elapsedMs || tool.ms;
      return '<article class="run-detail-chat-event tool-' + escapeHtml(kind) + '">' +
        '<div class="run-detail-chat-event-head"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(name) + '</strong><code>' + escapeHtml(status) + '</code>' + (duration ? '<code>' + escapeHtml(duration + "ms") + '</code>' : "") + '</div>' +
        '<div class="run-detail-tool-summary"><span>' + escapeHtml(kind === "executed" ? copy("Output") : copy("Input")) + '</span><code>' + escapeHtml(runDetailToolSummary(kind === "executed" ? output : input)) + '</code></div>' +
        runDetailJsonBlock(copy("Input"), input, false) +
        (kind === "executed" ? runDetailJsonBlock(copy("Output"), output, false) : "") +
      '</article>';
    }

    function runDetailConversationMessage(role, content, meta = "", options = {}) {
      const rawText = runDetailText(content || "");
      const text = options.compact ? compactRunDetailPrompt(rawText, meta) : rawText;
      if (!text) return "";
      const normalizedRole = role || "assistant";
      return '<article class="run-detail-chat-message ' + escapeHtml(normalizedRole) + '">' +
        '<div class="run-detail-chat-avatar">' + escapeHtml(normalizedRole.slice(0, 1).toUpperCase()) + '</div>' +
        '<div class="run-detail-chat-bubble">' +
          '<div class="run-detail-chat-meta"><span>' + escapeHtml(normalizedRole) + '</span>' + (meta ? '<span>' + escapeHtml(meta) + '</span>' : '') + (options.streaming ? '<strong class="is-live">' + escapeHtml(copy("Streaming")) + '</strong>' : '') + '</div>' +
          '<pre>' + escapeHtml(text) + '</pre>' +
        '</div>' +
      '</article>';
    }

    function compactRunDetailPrompt(text = "", source = "") {
      const value = String(text || "");
      if (!value) return "";
      if (value.length <= 1200 && source !== "prompt bundle") return value;
      const headings = value.split("\\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("## "))
        .map((line) => line.replace(/^## +/, ""))
        .slice(0, 8);
      const summary = headings.length
        ? copy("Prompt bundle") + ": " + headings.join(" / ")
        : value.slice(0, 520).trim();
      return summary + "\\n\\n" + copy("Full prompt is available in raw turn detail.");
    }

    function runDetailConversationRows(detail = {}) {
      const trace = detail.trace || {};
      const turns = runDetailTurns(detail);
      if (!turns.length) return '<p class="small">' + escapeHtml(copy("No LLM turns were recorded for this run.")) + '</p>';
      return '<section class="run-detail-chat"><div class="run-detail-section-title"><h3>' + escapeHtml(copy("Agent conversation")) + '</h3><span>' + escapeHtml(turns.length + " " + copy("LLM Turns")) + '</span></div>' + turns.map((turn, index) => {
        const context = turn.context || {};
        const request = turn.request || {};
        const response = turn.response || {};
        const contextMessages = context.messages || request.messages || request.rawMessages || [];
        const responsePayload = response.actual || response.message || response.text || turn.streamText;
        const executedTools = (trace.toolCalls || []).filter((tool) =>
          (turn.toolCalls || []).some((call) => call.id === tool.id || call.toolId === tool.toolId || call.name === tool.name)
        );
        const latestPrompt = [...(Array.isArray(contextMessages) ? contextMessages : [])]
          .reverse()
          .find((message) => ["user", "tool"].includes(message?.role));
        return '<section class="run-detail-chat-turn" data-turn="' + escapeHtml((turn.round ?? index) + 1) + '">' +
          '<div class="run-detail-chat-turn-head"><span>' + escapeHtml(copy("LLM Turn")) + ' ' + escapeHtml((turn.round ?? index) + 1) + '</span><code>' + escapeHtml([formatDate(turn.startedAt), formatDate(turn.endedAt)].filter((value) => value && value !== "-").join(" -> ") || "-") + '</code>' + runDetailPrefixCachePill(context.prefixCache) + '</div>' +
          runDetailConversationMessage(latestPrompt?.role || "user", latestPrompt?.content, latestPrompt?.source || copy("Latest prompt"), { compact: true }) +
          (turn.toolCalls || []).map((tool) => runDetailConversationTool(tool, "requested")).join("") +
          executedTools.map((tool) => runDetailConversationTool(tool, "executed")).join("") +
          runDetailConversationMessage("assistant", responsePayload, response.usage ? copy("Model reply") : "", { streaming: Boolean(turn.streamText && !response.actual && !response.message && !response.text) }) +
          runDetailJsonBlock(copy("Errors"), turn.errors, false) +
          '<details class="run-detail-json"><summary>' + escapeHtml(copy("Raw turn detail")) + '</summary><div class="run-detail-raw-stack">' +
            runDetailMessageBlocks(contextMessages) +
            runDetailJsonBlock(copy("Context tools"), context.tools || request.tools || request.rawTools, false) +
            runDetailJsonBlock(copy("Model output"), responsePayload, false) +
            runDetailJsonBlock(copy("Turn tool calls"), turn.toolCalls, false) +
            runDetailJsonBlock(copy("Tool execution"), executedTools, false) +
          '</div></details>' +
        '</section>';
      }).join("") + '</section>';
    }

    function runDetailSideRail(detail = {}) {
      const run = detail.run || { id: detail.id };
      const trace = detail.trace || {};
      const turns = runDetailTurns(detail);
      const latestPrefix = [...turns].reverse().map((turn) => turn.context?.prefixCache).find(Boolean);
      const rounds = turns.length
        ? turns.map((turn, index) => '<li><span>' + escapeHtml(copy("LLM Turn") + " " + ((turn.round ?? index) + 1)) + '</span><code>' + escapeHtml([turn.request?.messageCount ?? turn.request?.messages?.length, turn.toolCalls?.length || 0].filter((value) => value !== undefined).join(" msg / ") || "-") + '</code></li>').join("")
        : '<li><span>' + escapeHtml(copy("No LLM turns were recorded for this run.")) + '</span></li>';
      const events = [
        ...(trace.modelCalls || []).slice(-3).map((call, index) => ({ label: copy("Model output"), value: call.message || call.streamText || ("round " + (call.round ?? index + 1)) })),
        ...(trace.toolCalls || []).slice(-3).map((tool) => ({ label: copy("Tool execution"), value: toolNameForConversation(tool) + " · " + (tool.status || "completed") }))
      ].slice(-5);
      return '<aside class="run-detail-rail">' +
        '<section><h3>' + escapeHtml(copy("Run metadata")) + '</h3>' +
          runDetailValueRow(copy("Status"), run.status || detail.status) +
          runDetailValueRow(copy("Agent"), evidenceRoleLabel(run.agentRole)) +
          runDetailValueRow(copy("Entity"), [run.entityType, run.entityId].filter(Boolean).join(" / "), true) +
          runDetailValueRow(copy("Provider"), [run.provider || run.runner, run.model].filter(Boolean).join(" / ")) +
          runDetailValueRow(copy("Elapsed"), runDetailElapsed(run)) +
        '</section>' +
        '<section><h3>' + escapeHtml(copy("IDs")) + '</h3>' +
          runDetailValueRow("Run", runDetailShortId(run.id), true) +
          runDetailValueRow("Session", runDetailShortId(run.sessionId || run.sessionKey), true) +
          runDetailValueRow("Trace", runDetailShortId(run.agentTraceId || trace.id || detail.traceId), true) +
        '</section>' +
        '<section><h3>' + escapeHtml(copy("Context")) + '</h3>' + runDetailPrefixCachePill(latestPrefix) + '</section>' +
        '<section><h3>' + escapeHtml(copy("Model output")) + '</h3><ul class="run-detail-rounds">' + rounds + '</ul></section>' +
        '<section><h3>' + escapeHtml(copy("Latest events")) + '</h3>' + (events.length ? '<ul class="run-detail-events">' + events.map((event) => '<li><span>' + escapeHtml(event.label) + '</span><code>' + escapeHtml(runDetailToolSummary(event.value)) + '</code></li>').join("") + '</ul>' : '<p class="small">' + escapeHtml(copy("No Engine runs have been recorded.")) + '</p>') + '</section>' +
      '</aside>';
    }

    function runDetailTurnRows(detail = {}) {
      const trace = detail.trace || {};
      const turns = runDetailTurns(detail);
      if (!turns.length) return '<p class="small">' + escapeHtml(copy("No LLM turns were recorded for this run.")) + '</p>';
      const turnContextTexts = turns.map((turn) => {
        const context = turn.context || {};
        const request = turn.request || {};
        return runDetailContextText(context.messages || request.messages || request.rawMessages);
      });
      return turns.map((turn, index) => {
        const context = turn.context || {};
        const request = turn.request || {};
        const response = turn.response || {};
        const contextMessages = context.messages || request.messages || request.rawMessages;
        const contextTools = context.tools || request.tools || request.rawTools;
        const responsePayload = response.actual || response.message || response.text || turn.streamText;
        const executedTools = (trace.toolCalls || []).filter((tool) =>
          (turn.toolCalls || []).some((call) => call.id === tool.id || call.toolId === tool.toolId || call.name === tool.name)
        );
        const previousText = turnContextTexts[index - 1] || "";
        const currentText = turnContextTexts[index] || "";
        const prefixChanged = index > 0 && previousText && currentText && !currentText.startsWith(previousText);
        const open = index === turns.length - 1 ? " open" : "";
        const prefixBadge = prefixChanged ? '<strong class="run-detail-prefix-alert">' + escapeHtml(copy("Prefix changed")) + '</strong>' : "";
        return '<details class="run-detail-turn-card ' + (prefixChanged ? "prefix-changed" : "") + '"' + open + '>' +
          '<summary class="run-detail-turn-head"><h3>' + escapeHtml(copy("LLM Turn")) + ' ' + escapeHtml((turn.round ?? index) + 1) + '</h3><span>' + escapeHtml([formatDate(turn.startedAt), formatDate(turn.endedAt)].filter((value) => value && value !== "-").join(" -> ") || "-") + '</span>' + prefixBadge + '</summary>' +
          '<div class="run-detail-turn-body">' +
            runDetailPrefixCacheBlock(context.prefixCache) +
            runDetailMessageBlocks(contextMessages) +
            runDetailJsonBlock(copy("Context tools"), contextTools, false) +
            runDetailJsonBlock(copy("Model output"), responsePayload, true) +
            runDetailJsonBlock(copy("Turn tool calls"), turn.toolCalls, false) +
            runDetailJsonBlock(copy("Tool execution"), executedTools, true) +
            runDetailJsonBlock(copy("Errors"), turn.errors, false) +
          '</div>' +
        '</details>';
      }).join("");
    }

    function renderRunDetailModal() {
      if (!state.runDetailOpen) return "";
      const detail = state.runDetail || {};
      const run = detail.run || { id: detail.id };
      const body = detail.loading
        ? '<div class="run-detail-loading"><p class="small">' + escapeHtml(copy("Loading run detail...")) + '</p></div>'
        : detail.error
          ? '<div class="run-detail-loading"><p class="small">' + escapeHtml(detail.error) + '</p></div>'
          : '<div class="run-detail-shell"><div class="run-detail-main">' + runDetailConversationRows(detail) + '</div>' + runDetailSideRail(detail) + '</div>';
      const title = detail.task?.title || detail.entity?.title || detail.intent?.goal || run.title || run.entityId || "-";
      return '<div class="modal-backdrop run-detail-modal-backdrop" data-close-run-detail="true">' +
        '<section class="agent-modal run-detail-modal" role="dialog" aria-modal="true">' +
          '<div class="modal-head run-detail-head"><div class="run-detail-title-row"><span class="initials teal">' + escapeHtml((evidenceRoleLabel(run.agentRole) || "A").slice(0, 2).toUpperCase()) + '</span><div><h2>' + escapeHtml(evidenceRoleLabel(run.agentRole) || copy("Agent")) + ' <span class="status-pill ' + escapeHtml(run.status || "unknown") + '">' + escapeHtml(run.status || "unknown") + '</span></h2><p class="small">' + escapeHtml([copy("Run Detail"), title].filter(Boolean).join(" · ")) + '</p></div></div><div class="modal-head-actions"><button class="quiet-button" type="button" data-run-detail-copy-id>' + escapeHtml(actionLabel("Copy Run ID")) + '</button><button class="quiet-button" type="button" data-run-detail-raw>' + escapeHtml(actionLabel("Open Raw Trace")) + '</button><button class="quiet-button" type="button" data-close-run-detail="true">' + escapeHtml(actionLabel("Close")) + '</button></div></div>' +
          '<div class="modal-body run-detail-body">' + body + '</div>' +
          '<footer class="run-detail-footer"><span class="live-dot"></span><span>' + escapeHtml(copy("Live refresh")) + '</span><span>' + escapeHtml(copy("Last updated")) + ': ' + escapeHtml(formatDate(new Date().toISOString())) + '</span><code>' + escapeHtml(runDetailShortId(run.id || detail.id)) + '</code></footer>' +
        '</section>' +
      '</div>';
    }

    function captureRunDetailScroll(root = document) {
      const main = root.querySelector(".run-detail-main");
      const rail = root.querySelector(".run-detail-rail");
      const shell = root.querySelector(".run-detail-shell");
      return {
        mainTop: main?.scrollTop || 0,
        mainLeft: main?.scrollLeft || 0,
        railTop: rail?.scrollTop || 0,
        railLeft: rail?.scrollLeft || 0,
        shellTop: shell?.scrollTop || 0,
        shellLeft: shell?.scrollLeft || 0
      };
    }

    function restoreRunDetailScroll(root = document, scroll = {}) {
      window.requestAnimationFrame(() => {
        const main = root.querySelector(".run-detail-main");
        const rail = root.querySelector(".run-detail-rail");
        const shell = root.querySelector(".run-detail-shell");
        if (main) {
          main.scrollTop = scroll.mainTop || 0;
          main.scrollLeft = scroll.mainLeft || 0;
        }
        if (rail) {
          rail.scrollTop = scroll.railTop || 0;
          rail.scrollLeft = scroll.railLeft || 0;
        }
        if (shell) {
          shell.scrollTop = scroll.shellTop || 0;
          shell.scrollLeft = scroll.shellLeft || 0;
        }
      });
    }

    function wireRunDetailModal(root = document) {
      root.querySelectorAll("[data-close-run-detail]").forEach((button) => {
        button.onclick = (event) => {
          if (button.classList.contains("run-detail-modal-backdrop") && event.target !== button) return;
          closeRunDetail();
        };
      });
      root.querySelectorAll("[data-run-detail-copy]").forEach((button) => {
        button.onclick = () => copyRunDetailMessageBlock(button);
      });
      root.querySelectorAll("[data-run-detail-copy-id]").forEach((button) => {
        button.onclick = () => copyRunDetailId(button);
      });
      root.querySelectorAll("[data-run-detail-raw]").forEach((button) => {
        button.onclick = () => root.querySelector(".run-detail-raw-stack")?.closest("details")?.setAttribute("open", "");
      });
    }

    function renderRunDetailRoot(options = {}) {
      const root = byId("runDetailModalRoot");
      if (!root) return;
      const scroll = options.preserveScroll ? captureRunDetailScroll(root) : undefined;
      root.innerHTML = renderRunDetailModal();
      wireRunDetailModal(root);
      if (scroll) restoreRunDetailScroll(root, scroll);
    }

    async function refreshOpenRunDetail() {
      if (!state.runDetailOpen || !state.runDetail?.id || state.runDetailRefreshing) return;
      state.runDetailRefreshing = true;
      const runId = state.runDetail.id;
      try {
        const headers = {};
        const token = settingsToken({ required: true });
        if (token) headers["x-ai-team-admin-token"] = token;
        const response = await fetch("/ai-team/api/engine/runs/" + encodeURIComponent(runId) + "/detail", { headers });
        const detail = await response.json();
        if (!response.ok) throw new Error(detail.error || response.statusText);
        state.runDetail = detail;
      } catch (error) {
        state.runDetail = { id: runId, error: error.message };
      } finally {
        state.runDetailRefreshing = false;
      }
      renderRunDetailRoot({ preserveScroll: true });
    }

    async function openRunDetail(runId, { updateRoute = true } = {}) {
      if (!runId) return;
      state.runDetailOpen = true;
      state.runDetail = { id: runId, loading: true };
      if (updateRoute) syncDashboardRoute();
      renderRunDetailRoot();
      try {
        const headers = {};
        const token = settingsToken({ required: true });
        if (token) headers["x-ai-team-admin-token"] = token;
        const response = await fetch("/ai-team/api/engine/runs/" + encodeURIComponent(runId) + "/detail", { headers });
        const detail = await response.json();
        if (!response.ok) throw new Error(detail.error || response.statusText);
        state.runDetail = detail;
      } catch (error) {
        state.runDetail = { id: runId, error: error.message };
      }
      renderRunDetailRoot();
    }

    function closeRunDetail({ updateRoute = true } = {}) {
      state.runDetailOpen = false;
      state.runDetail = undefined;
      if (updateRoute) syncDashboardRoute();
      renderRunDetailRoot();
    }

    function evidenceRoleLabel(role) {
      if (!role) return "-";
      const agent = (state.data.agents || []).find((item) => item.role === role)
        || (state.data.agentConfigs?.agents || []).find((item) => item.role === role);
      return agent?.name || copy(role);
    }

    function evidenceEntityLabel(entityType) {
      if (entityType === "intent") return copy("Intent");
      if (entityType === "task") return copy("Task");
      if (entityType === "feedback") return copy("Feedback");
      return entityType ? copy(entityType) : "-";
    }

    function evidenceStatusText(status) {
      return status ? statusLabel(status) : "-";
    }

    function evidenceDependencies(dependencies = []) {
      return copy("Dependencies") + ": " + ((dependencies || []).join(", ") || "-");
    }

    function evidenceBriefValue(label, value) {
      if (value === undefined || value === null || value === "") return "";
      return '<div class="evidence-brief-row"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
    }

    function evidenceBriefSection(dossier = {}) {
      const brief = dossier.brief || {};
      const rows = [
        evidenceBriefValue(copy("Outcome"), brief.outcome),
        evidenceBriefValue(copy("Context"), brief.context),
        evidenceBriefValue(copy("Acceptance criteria"), brief.acceptance),
        evidenceBriefValue(copy("Constraints and risks"), brief.constraints),
        evidenceBriefValue(copy("Brief quality"), typeof brief.quality === "number" ? brief.quality + "%" : "")
      ].join("");
      if (!rows) return "";
      return '<article class="panel wide-panel evidence-brief"><h2>' + escapeHtml(copy("Intake Brief")) + '</h2><div class="evidence-brief-grid">' + rows + '</div></article>';
    }

    function evidenceTaskAgentRole(task = {}) {
      return task.claimedByRole || task.consumerRole || task.producerRole || "";
    }

    function evidenceTaskContextPrompt(dossier = {}, task = {}) {
      return t("oneOne.evidenceContextPrompt", {
        intent: dossier.brief?.outcome || dossier.goal || dossier.title || dossier.id || "-",
        task: task.title || task.id || "-",
        taskId: task.id || "-",
        status: evidenceStatusText(task.status)
      });
    }

    function evidenceTaskAskButton(dossier, task) {
      const role = evidenceTaskAgentRole(task);
      if (!role) return "";
      return '<button class="quiet-button evidence-one-one" type="button" data-evidence-one-one="' + escapeHtml(role) + '" data-evidence-intent="' + escapeHtml(dossier.id || "") + '" data-evidence-task="' + escapeHtml(task.id || "") + '" data-evidence-prompt="' + escapeHtml(evidenceTaskContextPrompt(dossier, task)) + '">' + escapeHtml(actionLabel("Ask Agent")) + '</button>';
    }

    function evidenceTaskRows(dossier) {
      const tasks = dossier.tasks || [];
      if (!tasks.length) return '<p class="small">' + escapeHtml(copy("No tasks have been created for this intent.")) + '</p>';
      return tasks.map((task) =>
        '<div class="trace-line evidence-task-line">' +
          '<span class="label-cell mono">' + escapeHtml(task.id || "-") + '</span>' +
          '<span>' + escapeHtml(task.title || "-") + '</span>' +
          '<span>' + escapeHtml(evidenceRoleLabel(evidenceTaskAgentRole(task)) + " · " + evidenceStatusText(task.status)) + '</span>' +
          '<span class="evidence-task-cell"><span>' + escapeHtml(evidenceDependencies(task.dependencies)) + '</span>' + evidenceTaskAskButton(dossier, task) + '</span>' +
        '</div>'
      ).join("");
    }

    function openEvidenceOneOne(role, prompt, linkedContext = {}) {
      if (!role) return;
      state.oneOneMode = state.oneOneMode || {};
      state.oneOneMode[role] = "chat";
      setOneOneComposerMode(role, "context_audit");
      setOneOneLinkedContext(role, linkedContext);
      openAgentChat(role);
      const input = document.querySelector(".one-one-input");
      if (input) {
        input.value = prompt || "";
        input.focus();
      }
    }

    function runCapabilitySummary(snapshot) {
      if (!snapshot) return "";
      return (snapshot.skills || []).length + " " + copy("skills") + " · " + (snapshot.tools || []).length + " " + copy("tools");
    }

    function renderIntentDetail() {
      const target = byId("intentDetail");
      if (!target) return;
      target.classList.add("evidence-layout");
      const dossiers = evidenceDossiers();
      const dossier = selectedEvidenceDossier();
      if (!dossier) {
        target.innerHTML = emptyPanel(copy("Evidence Dossier"), copy("No Engine intents are available."));
        return;
      }
      const metrics = dossier.metrics || {};
      const verificationLabel = (metrics.qaRejects || 0) + " / " + (metrics.qaRuns || 0);
      const heroSummary = dossier.brief?.context || dossier.finalSummary || dossier.goal || "";
      const taskRows = evidenceTaskRows(dossier);
      const runRows = evidenceRunRows(dossier.runs || []);
      const verificationRows = evidenceTraceRows(dossier.verifications || [], "No verification has been recorded.", (verification) => [
        { value: verification.taskId, mono: true },
        evidenceStatusText(verification.verdict),
        verification.artifactId || verification.runId || "-",
        (verification.findings || []).join("; ") || formatDate(verification.checkedAt)
      ]);
      const artifactRows = evidenceTraceRows(dossier.artifacts || [], "No sanitized artifacts are linked to this intent.", (artifact) => [
        { value: artifact.id, mono: true },
        artifact.kind || "-",
        artifact.role ? evidenceRoleLabel(artifact.role) : evidenceEntityLabel(artifact.entityType),
        evidenceStatusText(artifact.status) + " · " + formatDate(artifact.createdAt)
      ]);
      const feedbackRows = evidenceTraceRows(dossier.feedback || [], "No feedback has been captured.", (item) => [
        { value: item.id, mono: true },
        evidenceStatusText(item.status || "new"),
        item.text || "-",
        (item.channel || "-") + " · " + formatDate(item.updatedAt)
      ]);
      target.innerHTML =
        '<aside class="evidence-index">' +
          '<div class="evidence-index-head"><h2>' + escapeHtml(copy("Evidence Dossier")) + '</h2><p class="small">' + escapeHtml(copy("Work audit trail")) + '</p></div>' +
          '<div class="evidence-index-list">' + dossiers.map(evidenceDossierCard).join("") + '</div>' +
        '</aside>' +
        '<section class="evidence-dossier">' +
          '<article class="panel wide-panel evidence-hero">' +
            '<div><h2>' + escapeHtml(dossier.title || dossier.goal || dossier.id) + ' ' + statusPill(dossier.status) + ' <span class="status-pill ' + escapeHtml(evidenceReviewClass(dossier.review || {})) + '">' + escapeHtml(evidenceReviewStateLabel(dossier.review?.state)) + '</span></h2><p class="small">' + escapeHtml(heroSummary) + '</p></div>' +
            '<div class="evidence-metrics">' +
              evidenceMetric(copy("Tasks"), metrics.tasks || 0) +
              evidenceMetric(copy("Runs"), metrics.runs || 0) +
              evidenceMetric(copy("Verification rejects"), verificationLabel) +
              evidenceMetric(copy("Feedback"), metrics.feedback || 0) +
              evidenceMetric(copy("Operations"), metrics.operations || 0) +
            '</div>' +
          '</article>' +
          evidenceReviewPanel(dossier) +
          evidenceBriefSection(dossier) +
          '<article class="panel wide-panel"><h2>' + escapeHtml(copy("Lifecycle Timeline")) + '</h2>' + evidenceTimeline(dossier.operations || []) + '</article>' +
          '<article class="panel"><h2>' + escapeHtml(copy("Task Graph")) + '</h2><div class="trace-list">' + taskRows + '</div></article>' +
          '<article class="panel"><h2>' + escapeHtml(copy("Runs")) + '</h2><div class="trace-list">' + runRows + '</div></article>' +
          '<article class="panel"><h2>' + escapeHtml(copy("Verification")) + '</h2><div class="trace-list">' + verificationRows + '</div></article>' +
          '<article class="panel"><h2>' + escapeHtml(copy("Feedback Loop")) + '</h2><div class="trace-list">' + feedbackRows + '</div></article>' +
          '<article class="panel wide-panel"><h2>' + escapeHtml(copy("Artifacts")) + '</h2><div class="trace-list">' + artifactRows + '</div></article>' +
        '</section>' +
        "";
      target.querySelectorAll("[data-evidence-id]").forEach((button) => {
        button.onclick = () => {
          state.selectedEvidenceId = button.dataset.evidenceId;
          syncDashboardRoute();
          renderIntentDetail();
          localizeDom(target);
        };
      });
      target.querySelectorAll("[data-evidence-one-one]").forEach((button) => {
        button.onclick = () => openEvidenceOneOne(button.dataset.evidenceOneOne, button.dataset.evidencePrompt || "", {
          intentId: button.dataset.evidenceIntent,
          taskId: button.dataset.evidenceTask
        });
      });
      target.querySelectorAll("[data-run-detail-id]").forEach((button) => {
        button.onclick = () => openRunDetail(button.dataset.runDetailId);
      });
      renderRunDetailRoot();
    }

    function renderFeedbackLoop() {
      const target = byId("feedbackLoop");
      if (target) target.innerHTML = "";
    }

    function renderRuns() {
      const target = byId("runs");
      if (target) target.innerHTML = "";
    }

    function renderClients() {
      const target = byId("clients");
      if (target) target.innerHTML = "";
    }

    function renderKnowledge() {
      const target = byId("knowledge");
      if (target) target.innerHTML = "";
    }

    function renderReports() {
      const target = byId("reports");
      if (target) target.innerHTML = "";
    }

    `;

const PROJECTS_JS = `function renderProjects() {
      const target = byId("projects");
      if (!target) return;
      const projects = state.data.projects || [];
      const cards = projects.length
        ? '<div class="project-card-grid">' + projects.map(projectCard).join("") + '</div>'
        : '<article class="panel wide-panel"><h2>' + escapeHtml(copy("Projects")) + '</h2><p class="small">' + escapeHtml(copy("No projects yet.")) + '</p></article>';
      target.innerHTML = '<section class="project-section-head"><div><h2>' + escapeHtml(copy("Projects")) + '</h2><p class="small">' + escapeHtml(copy("Project records bind Engine work to business workspaces. Deleting a project removes its Engine records and managed project directory.")) + '</p></div><div class="project-delete-state" id="projectDeleteState"></div></section>' + cards;
      wireProjectActions();
    }

    function projectCard(project = {}) {
      const counts = project.counts || {};
      const metrics = [
        ["Intents", counts.intents || 0],
        ["Tasks", counts.tasks || 0],
        ["Runs", counts.runs || 0],
        ["Artifacts", counts.artifacts || 0],
        ["Feedback", counts.feedback || 0]
      ].map(([label, value]) =>
        '<div class="project-metric"><span>' + escapeHtml(copy(label)) + '</span><strong>' + escapeHtml(value) + '</strong></div>'
      ).join("");
      return '<article class="project-card" data-project-id="' + escapeHtml(project.id) + '">' +
        '<div class="project-card-head"><div><h3>' + escapeHtml(project.name || project.slug || project.id) + '</h3><p class="small">' + escapeHtml(copy("Updated")) + ' ' + escapeHtml(formatDate(project.updatedAt || project.createdAt)) + '</p></div>' + statusPill(project.status || "active") + '</div>' +
        '<div class="project-metrics">' + metrics + '</div>' +
        '<div class="project-card-actions"><button class="quiet-button danger-button" type="button" data-delete-project="' + escapeHtml(project.id) + '">' + escapeHtml(actionLabel("Delete project")) + '</button></div>' +
      '</article>';
    }

    function showProjectDeleteState(message) {
      const target = byId("projectDeleteState");
      if (target) target.textContent = typeof message === "string" ? message : JSON.stringify(message, null, 2);
    }

    async function deleteProject(projectId) {
      const project = (state.data.projects || []).find((item) => item.id === projectId);
      const name = project?.name || projectId;
      if (!window.confirm(copy("Delete this project?") + "\\n" + name)) return;
      const headers = { "content-type": "application/json" };
      const token = settingsToken({ required: true });
      if (token) headers["x-ai-team-admin-token"] = token;
      showProjectDeleteState(copy("Deleting..."));
      const response = await fetch("/ai-team/api/engine/projects/" + encodeURIComponent(projectId), {
        method: "DELETE",
        headers,
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || response.statusText);
      state.data.projects = (state.data.projects || []).filter((item) => item.id !== projectId);
      await refresh({ force: true });
      setDashboardTab("Projects", { replace: true });
      showProjectDeleteState(copy("Project deleted."));
    }

    function wireProjectActions() {
      document.querySelectorAll("[data-delete-project]").forEach((button) => {
        button.onclick = async () => {
          try {
            button.disabled = true;
            await deleteProject(button.dataset.deleteProject);
          } catch (error) {
            showProjectDeleteState(error.message);
          } finally {
            button.disabled = false;
          }
        };
      });
    }

    `;

const PRODUCT_FEISHU_SETTINGS_JS = `function renderSettings() {
      const target = byId("settings");
      if (!target) return;
      const settings = state.data.settings || {};
      const rawChannels = state.data.channels || [];
      const feishuChannel = rawChannels.find((channel) => channel.id === "feishu") || {
        id: "feishu",
        name: "Feishu",
        status: "needs_config",
        enabled: false,
        eventMode: "websocket",
        credentials: {}
      };
      const channelCards = feishuChannelCard(feishuChannel, settings);

      target.innerHTML = '<article class="panel wide-panel settings-section-head"><div><h2>Runtime</h2><p class="small">服务运行状态、Engine 轮询参数和工作区信息。</p></div></article>' + panel("Runtime Snapshot", [
        ["Fallback runner", settings.runner],
        ["Fallback provider", settings.provider],
        ["Fallback model", settings.model || "default"],
        ["Provider routing", "per-agent selection"],
        ["Tool approval", settings.toolPolicy?.approvalMode || "never"],
        ["Tool sandbox", settings.toolPolicy?.sandbox || "workspace-write"],
        ["Max auto risk", settings.toolPolicy?.maxAutoRisk || "medium"],
        ["Control workspace", settings.workspace],
        ["Project workspaces", settings.projectWorkspaceRoot],
        ["Public base URL", settings.publicBaseUrl || "not configured"],
        ["Polling", settings.pollIntervalMs + " ms"],
        ["Feedback scan", settings.feedbackScanIntervalMs + " ms"],
        ["Admin token", settings.adminTokenConfigured ? "configured" : "not configured"]
       ]) + adminTokenPanel() + renderProviderSettings() + renderCodingAgentLaunchers() + '<section class="settings-group channel-group"><div class="settings-section-head"><div><h2>Channels</h2><p class="small">Feishu 长连接配置集中在这里。</p></div></div><div class="channel-card-grid">' + channelCards + '</div></section>';

      providerEditorModal();
      codingAgentLauncherModal();
      wireSettingsActions();
    }

    function codingAgentLauncher() {
      const saved = (state.data.codingAgentLaunchers || [])[0];
      return saved ? { ...saved, saved: true } : { ...blankCodingAgentLauncherDraft(), saved: false };
    }

    function codingAgentLauncherCard(launcher = {}) {
      const timeout = launcher.timeoutMs ? launcher.timeoutMs + " ms" : copy("Default timeout");
      const status = launcher.saved ? copy("Configured") : copy("Not configured");
      const statusClass = launcher.saved ? "configured" : "needs_config";
      return '<article class="provider-card coding-agent-card open-coding-agent-editor" role="button" tabindex="0">' +
        '<div class="provider-card-title-row"><h2>' + escapeHtml(copy("Coding Agent launcher")) + '</h2><span class="status-pill ' + statusClass + '">' + escapeHtml(status) + '</span></div>' +
        '<p class="small">' + escapeHtml(launcher.saved ? copy("Command template used by coding_agent.start.") : copy("Save this launcher before coding_agent.start can delegate work.")) + '</p>' +
        '<div class="provider-card-meta">' +
          '<span class="capability-count">' + escapeHtml(timeout) + '</span>' +
        '</div>' +
        '<p class="small mono">' + escapeHtml(launcher.commandTemplate || copy("Command missing")) + '</p>' +
      '</article>';
    }

    function renderCodingAgentLaunchers() {
      return '<section class="settings-group coding-agent-launcher-group"><div class="settings-section-head"><div><h2>' + escapeHtml(copy("Coding Agent launcher")) + '</h2><p class="small">' + escapeHtml(copy("Shared audited command template for coding_agent.* tools.")) + '</p></div><button class="quiet-button open-coding-agent-editor" type="button">' + escapeHtml(actionLabel("Edit")) + '</button></div><div class="provider-summary-grid">' + codingAgentLauncherCard(codingAgentLauncher()) + '</div></section>';
    }

    function blankCodingAgentLauncherDraft() {
      return {
        commandTemplate: "codex exec --cd {{workspace}} {{prompt}}",
        timeoutMs: 900000
      };
    }

    function codingAgentLauncherEditorModal() {
      const root = byId("codingAgentLauncherModalRoot");
      if (!root) return;
      if (!state.editingCodingAgentLauncherId) {
        root.innerHTML = "";
        return;
      }
      const launcher = state.codingAgentLauncherDraft || codingAgentLauncher();
      if (!launcher) {
        root.innerHTML = "";
        return;
      }
      root.innerHTML = '<div class="modal-backdrop" data-close-coding-agent-editor="true">' +
        '<article class="agent-modal provider-editor-card coding-agent-editor-card">' +
          '<div class="modal-head"><div><h2>' + escapeHtml(copy("Coding Agent launcher")) + '</h2><p class="small">' + escapeHtml(copy("Command template used by coding_agent.start.")) + '</p></div><div class="modal-head-actions"><button class="quiet-button close-coding-agent-editor" type="button">' + escapeHtml(actionLabel("Close")) + '</button></div></div>' +
          '<div class="modal-body"><div class="form-grid">' +
            '<div class="field"><label>' + escapeHtml(copy("Timeout ms")) + '</label><input class="launcher-timeout" type="number" min="1" value="' + escapeHtml(launcher.timeoutMs || 900000) + '"></div>' +
            '<div class="field full"><label>' + escapeHtml(copy("Command template")) + '</label><textarea class="launcher-command-template mono" spellcheck="false" placeholder="codex exec --cd {{workspace}} {{prompt}}">' + escapeHtml(launcher.commandTemplate || "") + '</textarea><p class="field-help">' + escapeHtml(copy("Keep these template variables:")) + ' <code>{{workspace}}</code>, <code>{{prompt}}</code></p></div>' +
            '<div class="provider-status-output"></div>' +
          '</div></div>' +
          '<div class="modal-actions"><button class="quiet-button close-coding-agent-editor" type="button">' + escapeHtml(actionLabel("Cancel")) + '</button><button class="action-button primary save-coding-agent-launcher" type="button">' + escapeHtml(copy("Save")) + '</button></div>' +
        '</article>' +
      '</div>';
      wireCodingAgentLauncherEditorActions();
    }

    function collectCodingAgentLauncherCard(card) {
      const commandTemplate = String(card.querySelector(".launcher-command-template")?.value || "").trim();
      if (!commandTemplate) throw new Error(copy("Command template is required"));
      const timeoutMs = Number(card.querySelector(".launcher-timeout")?.value || 900000);
      return {
        commandTemplate,
        timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 900000
      };
    }

    function showCodingAgentLauncherOutput(card, message) {
      const output = card?.querySelector(".provider-status-output");
      if (!output) return;
      output.classList.add("is-open");
      output.textContent = typeof message === "string" ? message : JSON.stringify(message, null, 2);
    }

    function closeCodingAgentLauncherEditor() {
      state.editingCodingAgentLauncherId = undefined;
      state.codingAgentLauncherDraft = undefined;
      codingAgentLauncherEditorModal();
    }

    function openCodingAgentLauncherEditor(id) {
      state.editingCodingAgentLauncherId = id || "default";
      state.codingAgentLauncherDraft = { ...codingAgentLauncher() };
      codingAgentLauncherEditorModal();
      localizeDom(byId("codingAgentLauncherModalRoot"));
    }

    function wireCodingAgentLauncherEditorActions() {
      document.querySelectorAll(".close-coding-agent-editor").forEach((button) => {
        button.onclick = () => closeCodingAgentLauncherEditor();
      });
      document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
        backdrop.onclick = (event) => {
          if (event.target === backdrop && backdrop.dataset.closeCodingAgentEditor === "true") closeCodingAgentLauncherEditor();
        };
      });
      document.querySelectorAll(".save-coding-agent-launcher").forEach((button) => {
        button.onclick = async () => {
          const card = button.closest(".coding-agent-editor-card");
          try {
            button.disabled = true;
            showCodingAgentLauncherOutput(card, copy("Saving launcher..."));
            const launcher = collectCodingAgentLauncherCard(card);
            const result = await postJson("/ai-team/api/coding-agent-launchers", { launcher }, true);
            state.data.codingAgentLaunchers = result;
            closeCodingAgentLauncherEditor();
            renderSettings();
          } catch (error) {
            showCodingAgentLauncherOutput(card, error.message || error);
          } finally {
            button.disabled = false;
          }
        };
      });
    }

    function codingAgentLauncherModal() {
      document.querySelectorAll(".open-coding-agent-editor").forEach((card) => {
        card.onclick = () => openCodingAgentLauncherEditor("default");
        card.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openCodingAgentLauncherEditor("default");
          }
        };
      });
      codingAgentLauncherEditorModal();
    }

    function feishuConnected(channel) {
      const credentials = channel.credentials || {};
      return Boolean(channel.enabled && credentials.appId?.configured && credentials.appSecret?.configured && !["needs_config", "disabled", "failed"].includes(channel.status));
    }

    function feishuConnectionLabel(channel) {
      if (feishuConnected(channel)) return "Connected";
      if (channel.status === "failed" || channel.status === "blocked") return "Connection issue";
      return "Not connected";
    }

    function feishuCredentialLabel(channel) {
      const credentials = channel.credentials || {};
      return credentials.appId?.configured && credentials.appSecret?.configured ? "Configured" : "Not configured";
    }

    function feishuReadyLabel(ready) {
      return ready ? "Ready" : "After connection";
    }

    function feishuChannelCard(channel, settings) {
      const connected = feishuConnected(channel);
      const statusText = feishuConnectionLabel(channel);
      const statusClass = connected ? "ready" : (channel.status || "needs_config");
      return '<article class="panel channel-card feishu-channel-card">' +
        '<h2>Feishu <span class="status-pill ' + escapeHtml(statusClass) + '">' + escapeHtml(statusText) + '</span></h2>' +
        '<p class="small">Connect Feishu with QR authorization. After authorization, AI Team saves the credentials locally and starts the WebSocket long connection for inbound messages and replies.</p>' +
        '<div class="row"><span>Connection</span><span>Long Connection/WebSocket</span></div>' +
        '<div class="row"><span>Receive messages</span><span>' + feishuReadyLabel(connected && channel.enabled !== false) + '</span></div>' +
        '<div class="row"><span>Reply messages</span><span>' + feishuReadyLabel(connected) + '</span></div>' +
        '<div class="row"><span>Last scan/update</span><span>' + escapeHtml(formatDate(channel.lastScanAt || channel.updatedAt || channel.savedAt)) + '</span></div>' +
        '<div class="row"><span>Credentials</span><span>' + escapeHtml(feishuCredentialLabel(channel)) + '</span></div>' +
        feishuForm(channel, settings, connected) +
      '</article>';
    }

    function feishuForm(channel, settings, connected = false) {
      const accessMode = (channel.allowFrom || channel.allowChat) ? "restricted" : "open";
      return '<div class="form-grid" data-channel="feishu">' +
        '<div class="actions field full"><button class="action-button primary" id="scanFeishu" type="button" data-connected="' + (connected ? 'true' : 'false') + '">' + (connected ? 'Reconnect' : 'Connect Feishu') + '</button>' + (connected ? '<button class="action-button" id="testFeishu" type="button">Test connection</button>' : '') + '</div>' +
        '<div class="field full"><h3>Feishu behavior settings</h3><p class="small">These settings apply after Feishu is connected.</p></div>' +
        '<div class="field checkbox-row"><input id="feishuEnabled" type="checkbox" ' + (channel.enabled ? 'checked' : '') + '><label for="feishuEnabled">Receive messages</label></div>' +
        '<div class="field full"><label>Access control</label><select id="feishuAccessMode">' + optionList([{ value: "open", label: "Anyone who can message the bot" }, { value: "restricted", label: "Only listed Feishu IDs" }], accessMode) + '</select><p class="field-help">Use restricted mode when this bot should only accept specific Feishu users or chats.</p></div>' +
        '<div class="field full feishu-allowlist-panel" ' + (accessMode === "restricted" ? '' : 'hidden') + '><h3>Restricted allowlist</h3><p class="field-help">Enter Feishu identifiers only. Use one ID per line or comma-separated values.</p></div>' +
        '<div class="field feishu-allowlist-panel" ' + (accessMode === "restricted" ? '' : 'hidden') + '><label>User open IDs</label><textarea id="feishuAllowFrom" autocomplete="off" placeholder="ou_xxx">' + valueOrEmpty(channel.allowFrom || '') + '</textarea></div>' +
        '<div class="field feishu-allowlist-panel" ' + (accessMode === "restricted" ? '' : 'hidden') + '><label>Chat IDs</label><textarea id="feishuAllowChat" autocomplete="off" placeholder="oc_xxx">' + valueOrEmpty(channel.allowChat || '') + '</textarea></div>' +
        '<div class="field"><label>Group messages</label><select id="feishuGroupPolicy">' + optionList([{ value: "mention", label: "Mention-only" }, { value: "all", label: "Every group message" }], channel.groupReplyAll ? "all" : "mention") + '</select></div>' +
        '<div class="field checkbox-row"><input id="feishuThreadIsolation" type="checkbox" ' + (channel.threadIsolation !== false ? 'checked' : '') + '><label for="feishuThreadIsolation">Thread isolation</label></div>' +
        '<div class="actions field full"><button class="action-button primary" id="saveFeishu" type="button">Save Feishu</button></div>' +
        '<details class="field full feishu-advanced"><summary>Advanced manual binding</summary><div class="form-grid">' +
          '<div class="field"><label>App ID</label><input id="feishuAppId" autocomplete="off" placeholder="cli_xxx"></div>' +
          '<div class="field"><label>App Secret</label><input id="feishuAppSecret" type="password" autocomplete="off" placeholder="leave blank to keep existing"></div>' +
          '<div class="field full"><label>Feishu setup command</label><input readonly value="node src/index.js channels setup feishu --app cli_xxx:secret --enable"></div>' +
        '</div></details>' +
        '<div class="channel-output field full" id="feishuOutput"></div>' +
      '</div>';
    }

    function refreshFeishuAccessPanel() {
      const accessMode = document.getElementById("feishuAccessMode")?.value || "open";
      document.querySelectorAll(".feishu-allowlist-panel").forEach((panel) => {
        panel.hidden = accessMode !== "restricted";
      });
    }

    `;

const PRODUCT_FEISHU_OUTPUT_JS = `function showChannelOutput(message) {
      const output = document.getElementById("feishuOutput");
      if (!output) return;
      output.style.display = "block";
      state.channelOutput = message;
      if (message && message.qrSvg) {
        output.innerHTML = "";
        const text = document.createElement("div");
        text.textContent = copy(message.text || "Waiting for Feishu authorization...");
        const qrBox = document.createElement("div");
        qrBox.className = "qr-box";
        const image = document.createElement("img");
        image.alt = copy("Feishu registration QR");
        image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(message.qrSvg);
        qrBox.appendChild(image);
        output.append(text, qrBox);
        if (message.details && Object.keys(message.details).length) {
          const details = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = copy("Technical details");
          const pre = document.createElement("pre");
          pre.textContent = JSON.stringify(message.details, null, 2);
          details.append(summary, pre);
          output.append(details);
        }
      } else if (message && typeof message === "object") {
        output.textContent = message.text ? copy(message.text) : (message.saved ? copy("Feishu settings saved.") : JSON.stringify(message, null, 2));
      } else {
        output.textContent = String(message || "");
      }
    }

    `;

const PRODUCT_FEISHU_SCAN_HANDLER_JS = `refreshFeishuAccessPanel();
      document.getElementById("feishuAccessMode")?.addEventListener("change", refreshFeishuAccessPanel);
      document.getElementById("scanFeishu")?.addEventListener("click", async () => {
        const button = document.getElementById("scanFeishu");
        try {
          if (button) {
            button.disabled = true;
            button.textContent = actionLabel("Connecting...");
          }
          showChannelOutput(copy("Waiting for Feishu authorization..."));
          const result = await postJson("/ai-team/api/channels/feishu/scan", {}, true);
          showChannelOutput({
            text: copy("Open Feishu/Lark and scan the QR code. After authorization, AI Team saves the credentials and starts the WebSocket long connection."),
            qrSvg: result.registerQrSvg,
            details: {
              registrationId: result.registration?.id,
              status: result.registration?.status,
              expiresAt: result.registration?.expiresAt,
              websocketGuide: result.websocketGuide,
              checklist: result.checklist,
              env: result.env
            }
          });
          if (result.registration?.id) pollRegistration(result.registration.id);
          await refresh();
        } catch (error) {
          showChannelOutput(error.message);
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = button.dataset.connected === "true" ? actionLabel("Reconnect") : actionLabel("Connect Feishu");
          }
        }
      });

`;

const PRODUCT_FEISHU_SAVE_HANDLER_JS = `document.getElementById("saveFeishu")?.addEventListener("click", async () => {
        try {
          const accessMode = document.getElementById("feishuAccessMode")?.value || "open";
          const body = {
            enabled: Boolean(document.getElementById("feishuEnabled")?.checked),
            eventMode: "websocket",
            appId: optionalInput("feishuAppId"),
            appSecret: optionalInput("feishuAppSecret"),
            allowFrom: accessMode === "restricted" ? optionalInput("feishuAllowFrom") : "",
            allowChat: accessMode === "restricted" ? optionalInput("feishuAllowChat") : "",
            threadIsolation: Boolean(document.getElementById("feishuThreadIsolation")?.checked),
            groupReplyAll: document.getElementById("feishuGroupPolicy")?.value === "all"
          };
          const result = await postJson("/ai-team/api/channels/feishu/config", body, true);
          showChannelOutput({ saved: true, channel: result.channel });
          await refresh();
        } catch (error) {
          showChannelOutput(error.message);
        }
      });

`;
