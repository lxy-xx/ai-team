import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { agentInitials } from "../../../agent-framework/domain/agent-roster.js";
import { redactSecretText } from "../../../agent-framework/domain/security/redaction.js";
import { dashboardAdminTokenMode, effectiveDashboardAdminToken } from "../dashboard-auth.js";

const CEO_ROLE = "ceo_cto";

const ENGINE_COLUMNS = [
  { id: "intents", title: "INTENTS", accent: "orange" },
  { id: "working", title: "WORKING", accent: "blue" },
  { id: "testing", title: "TESTING", accent: "yellow" },
  { id: "blocked", title: "BLOCKED", accent: "red" },
  { id: "done", title: "DONE", accent: "green" },
  { id: "feedback", title: "FEEDBACK", accent: "purple" }
];

const WORK_TOPIC_KEYWORDS = [
  ["Infra", /api|server|webhook|oauth|deploy|infra|database|db|cron|scheduler|飞书|接口|部署|服务/i],
  ["Agent", /agent|bot|memory|codex|qa|worker|subagent|模型|智能体/i],
  ["CRM", /crm|client|customer|客户|会员|销售|线索/i],
  ["UI", /ui|dashboard|frontend|page|看板|页面|前端|设计/i],
  ["Operations", /ops|operation|operations|monitor|alert|log|report|运维|监控|日志|报告/i]
];
const INTENT_BRIEF_FIELDS = new Set(["outcome", "context", "acceptance", "constraints"]);
const VERIFICATION_ARTIFACT_KINDS = new Set(["verification_report", "turing_verification_report"]);

function taskNumber(task, prefix) {
  const hash = String(task.id || "")
    .split("_")
    .at(-1)
    ?.slice(0, 3)
    .toUpperCase();
  return `${prefix}-${hash || "001"}`;
}

function titleFromText(text) {
  const normalized = String(text || "Untitled work").replace(/\s+/g, " ").trim();
  if (normalized.length <= 74) return normalized;
  return `${normalized.slice(0, 71)}...`;
}

function trimmedText(value) {
  return String(value || "").trim();
}

function intentBrief(intent = {}) {
  const fields = intent.context?.briefFields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return undefined;
  const brief = {};
  for (const field of INTENT_BRIEF_FIELDS) {
    const text = trimmedText(fields[field]);
    if (text) brief[field] = text;
  }
  if (!Object.keys(brief).length) return undefined;
  const quality = Number(intent.context?.briefQuality);
  if (Number.isFinite(quality)) brief.quality = Math.max(0, Math.min(100, Math.round(quality)));
  if (Array.isArray(intent.context?.briefCompletedFields)) {
    brief.completedFields = intent.context.briefCompletedFields.map(trimmedText).filter((field) => INTENT_BRIEF_FIELDS.has(field));
  }
  return brief;
}

function intentTitle(intent = {}) {
  return titleFromText(intent.name || intentBrief(intent)?.outcome || intent.goal || intent.finalSummary);
}

function workTopicFromText(text) {
  const found = WORK_TOPIC_KEYWORDS.find(([, pattern]) => pattern.test(text || ""));
  return found?.[0] || "Agent";
}

function ownerFromRole(role = CEO_ROLE) {
  const name = String(role || CEO_ROLE);
  return {
    name,
    initials: agentInitials(name),
    color: "gray"
  };
}

function configuredOwnerFromRole(role, configuredAgents = []) {
  const fallback = ownerFromRole(role);
  const configured = (configuredAgents || []).find((agent) => agent.role === role);
  const name = configured?.name || fallback.name || role;
  return {
    name,
    initials: configured?.initials || fallback.initials || agentInitials(name),
    color: configured?.color || fallback.color || "gray"
  };
}

function configuredAgentDisplayForRole(role, configuredAgents = []) {
  const agent = configuredOwnerFromRole(role, configuredAgents);
  const configured = (configuredAgents || []).find((item) => item.role === role);
  return {
    role,
    ...agent,
    title: configured?.title || agent.name
  };
}

function configuredAgentDisplayMap(configuredAgents = []) {
  const roles = new Set((configuredAgents || []).map((agent) => agent.role).filter(Boolean));
  return new Map([...roles].map((role) => [role, configuredAgentDisplayForRole(role, configuredAgents)]));
}

function applyConfiguredDisplayToCard(card, displayMap) {
  const owner = displayMap.get(card.ownerRole);
  return {
    ...card,
    owner: owner?.name || card.owner,
    ownerInitials: owner?.initials || card.ownerInitials,
    ownerColor: owner?.color || card.ownerColor,
    involvedAgents: (card.involvedAgents || []).map((agent) => {
      const display = displayMap.get(agent.role);
      return display
        ? {
            ...agent,
            name: display.name,
            initials: display.initials,
            color: display.color,
            title: agent.title || display.title
          }
        : agent;
    })
  };
}

function applyConfiguredDisplayToColumns(columns = [], configuredAgents = []) {
  const displayMap = configuredAgentDisplayMap(configuredAgents);
  return (columns || []).map((column) => ({
    ...column,
    items: (column.items || []).map((item) => applyConfiguredDisplayToCard(item, displayMap))
  }));
}

function applyConfiguredDisplayToWorkingAgents(workingAgents = [], configuredAgents = []) {
  const displayMap = configuredAgentDisplayMap(configuredAgents);
  return (workingAgents || []).map((agent) => {
    const display = displayMap.get(agent.role);
    return display
      ? {
          ...agent,
          name: display.name,
          initials: display.initials,
          color: display.color,
          title: display.title
        }
      : agent;
  });
}

function latestRoleForEntity(runs = [], entityType, entityId) {
  if (!entityId) return undefined;
  return [...(runs || [])]
    .reverse()
    .find((run) => run.agentRole && run.entityId === entityId && (!entityType || run.entityType === entityType))
    ?.agentRole;
}

function feedbackOwnerRole(item = {}) {
  return item.claimedByRole || item.consumerRole || item.producerRole || item.operations?.at?.(-1)?.agentRole || CEO_ROLE;
}

function feedbackCard(item) {
  const status = item.status || "new";
  const ownerRole = feedbackOwnerRole(item);
  const agent = ownerFromRole(ownerRole);
  return {
    id: item.id?.replace(/^fb_/, "FB-").toUpperCase() || "FB-NEW",
    rawId: item.id,
    intentId: item.intentId || item.linkedIntentId,
    title: titleFromText(item.text),
    owner: agent.name,
    ownerRole,
    ownerInitials: agent.initials,
    ownerColor: agent.color,
    involvedAgents: [{ role: ownerRole, ...agent, active: true }],
    category: workTopicFromText(item.text),
    status,
    createdAt: item.createdAt,
    source: item.source?.channel || "customer",
    dot: status === "done" || status === "completed" ? "green" : status === "triaged" ? "blue" : "amber"
  };
}

function sourceLabel(source = {}) {
  return source.channel || source.threadId || source.userId || "cli";
}

function statusDot(status) {
  if (status === "done" || status === "completed" || status === "tested") return "green";
  if (status === "blocked" || status === "failed" || status === "rejected" || status === "timed_out") return "red";
  if (status === "testing" || status === "triaged") return "yellow";
  if (status === "linked_to_task" || status === "working" || status === "in_progress" || status === "running") return "blue";
  return "orange";
}

function engineTaskProgress(task) {
  if (task.status === "done") return 100;
  if (task.status === "blocked") return 66;
  if (task.status === "testing" || task.status === "tested") return 82;
  if (task.status === "working" || task.status === "worked" || task.status === "deploying") return 55;
  return 18;
}

function engineSteps(task) {
  const status = task.status || "waiting";
  return [
    { label: "Queued", done: true },
    { label: "Work", done: ["working", "worked", "testing", "tested", "deploying", "done"].includes(status) },
    { label: "Verify", done: ["tested", "deploying", "done"].includes(status) },
    { label: "Done", done: status === "done" }
  ];
}

function engineOwnerRoleForTask(task) {
  return task.claimedByRole || task.consumerRole || task.producerRole || task.operations?.at?.(-1)?.agentRole || CEO_ROLE;
}

function engineInvolvedAgentsForTask(task, activeRole = engineOwnerRoleForTask(task)) {
  return [...new Set([task.producerRole, task.claimedByRole, task.consumerRole, task.operations?.at?.(-1)?.agentRole].filter(Boolean))].map(
    (role) => ({
      role,
      ...ownerFromRole(role),
      active: role === activeRole && task.status !== "done" && task.status !== "blocked"
    })
  );
}

function taskConsumerRole(task = {}) {
  return task.claimedByRole || task.consumerRole || task.producerRole;
}

function activeRunForTask(readModel = {}, taskId) {
  return (readModel.runs || [])
    .filter((run) => run.entityType === "task" && run.entityId === taskId && ["running", "queued"].includes(run.status))
    .sort((left, right) => String(right.startedAt || right.createdAt || "").localeCompare(String(left.startedAt || left.createdAt || "")))[0];
}

function taskIsUnderVerification(readModel = {}, task = {}) {
  const run = activeRunForTask(readModel, task.id);
  return task.status === "working" && run?.agentRole === "qa";
}

function engineTaskCard(task, readModel, options = {}) {
  const activeRun = activeRunForTask(readModel, task.id);
  const ownerRole = options.ownerRole || activeRun?.agentRole || engineOwnerRoleForTask(task);
  const displayStatus = options.status || task.status;
  const agent = ownerFromRole(ownerRole);
  const artifactCount = task.artifactIds?.length || readModel.artifacts.filter((artifact) => artifact.entityId === task.id).length;
  const runCount = task.runIds?.length || readModel.runs.filter((run) => run.entityId === task.id).length;
  const verificationCount = task.verificationHistory?.length || 0;
  return {
    id: taskNumber(task, "TASK"),
    rawId: task.id,
    entityType: "task",
    intentId: task.intentId,
    projectId: task.projectId,
    projectName: task.projectName,
    title: titleFromText(task.title || task.description),
    subtitle: task.description || task.status,
    producerRole: task.producerRole,
    claimedByRole: task.claimedByRole,
    consumerRole: task.consumerRole,
    reworkRounds: task.reworkRounds || 0,
    verificationCount,
    artifactCount,
    runCount,
    owner: agent.name,
    ownerRole,
    ownerInitials: agent.initials,
    ownerColor: agent.color,
    involvedAgents: engineInvolvedAgentsForTask({ ...task, status: displayStatus }, ownerRole),
    category: workTopicFromText(`${task.title || ""} ${task.description || ""}`),
    status: displayStatus,
    progress: engineTaskProgress({ ...task, status: displayStatus }),
    steps: engineSteps({ ...task, status: displayStatus }),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    source: sourceLabel(readModel.intents.find((intent) => intent.id === task.intentId)?.source),
    dot: statusDot(displayStatus),
    done: displayStatus === "done",
    summary: task.summary || task.error?.message || ""
  };
}

function engineIntentProgress(intent, tasks) {
  const childTasks = tasks.filter((task) => task.intentId === intent.id || intent.taskIds?.includes(task.id));
  if (intent.status === "done") return 100;
  if (intent.status === "blocked") return 66;
  if (!childTasks.length) return intent.status === "new" ? 10 : 25;
  return Math.round(childTasks.reduce((sum, task) => sum + engineTaskProgress(task), 0) / childTasks.length);
}

function engineIntentCard(intent, tasks) {
  const childTasks = tasks.filter((task) => task.intentId === intent.id || intent.taskIds?.includes(task.id));
  const involvedRoles = new Set(childTasks.flatMap((task) => [task.producerRole, task.claimedByRole, task.consumerRole, task.operations?.at?.(-1)?.agentRole]));
  if (!involvedRoles.size) involvedRoles.add(intent.consumerRole || intent.operations?.at?.(-1)?.agentRole || CEO_ROLE);
  const ownerRole = intent.consumerRole || intent.operations?.at?.(-1)?.agentRole || CEO_ROLE;
  const agent = ownerFromRole(ownerRole);
  const brief = intentBrief(intent);
  return {
    id: taskNumber(intent, "INTENT"),
    rawId: intent.id,
    entityType: "intent",
    intentId: intent.id,
    projectId: intent.projectId,
    projectName: intent.projectName,
    title: intentTitle(intent),
    subtitle: intent.status,
    owner: agent.name,
    ownerRole,
    ownerInitials: agent.initials,
    ownerColor: agent.color,
    involvedAgents: [...involvedRoles].filter(Boolean).map((role) => ({ role, ...ownerFromRole(role), active: intent.status !== "done" && intent.status !== "blocked" })),
    category: workTopicFromText(`${brief?.outcome || ""} ${intent.goal || ""}`),
    status: intent.status,
    progress: engineIntentProgress(intent, tasks),
    steps: childTasks.slice(0, 4).map((task) => ({ label: titleFromText(task.title || task.id), done: task.status === "done" })),
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
    source: sourceLabel(intent.source),
    dot: statusDot(intent.status),
    done: intent.status === "done",
    summary: intent.finalSummary || "",
    name: intent.name,
    description: intent.description,
    goal: intent.goal,
    brief
  };
}

function engineFeedbackCard(item, readModel = {}) {
  const card = feedbackCard(item);
  if (card.intentId || !item.linkedTaskId) return card;
  const linkedTask = (readModel.tasks || []).find((task) => task.id === item.linkedTaskId);
  return { ...card, intentId: linkedTask?.intentId };
}

function sanitizeOperations(operations = []) {
  return (operations || []).map((operation) => ({
    at: operation.at,
    agentRole: operation.agentRole,
    action: operation.action,
    fromStatus: operation.fromStatus,
    toStatus: operation.toStatus,
    runId: operation.runId,
    reason: operation.reason
  }));
}

function idList(items = []) {
  return (items || [])
    .map((item) => typeof item === "string" ? item : item?.id)
    .filter(Boolean);
}

function visibleTools(tools = []) {
  return (tools || []).filter((tool) => tool?.implicit !== true);
}

function visibleToolIdsForAgent(agent = {}, hiddenToolIds = new Set()) {
  return (agent.tools || []).filter((toolId) => !hiddenToolIds.has(toolId));
}

function sanitizeAgentConfigSnapshot(snapshot) {
  if (!snapshot) return undefined;
  return {
    role: snapshot.role,
    title: snapshot.title,
    modelProvider: snapshot.modelProvider
      ? {
          providerId: snapshot.modelProvider.providerId,
          model: snapshot.modelProvider.model
        }
      : undefined,
    skills: idList(snapshot.skills),
    mcps: idList(snapshot.mcps),
    tools: (snapshot.tools || []).map((tool) => ({
      id: tool.id,
      category: tool.category,
      risk: tool.risk,
      policy: tool.policy
    }))
  };
}

function sanitizeFindings(findings = []) {
  return (findings || [])
    .map((finding) => {
      if (typeof finding === "string") return finding;
      return [finding?.severity, finding?.message || finding?.summary || finding?.title].filter(Boolean).join(": ");
    })
    .filter(Boolean);
}

function verificationFromHistory(task, entry) {
  return {
    taskId: task.id,
    taskTitle: task.title || task.description,
    artifactId: entry.artifactId,
    runId: entry.runId,
    verdict: entry.verdict,
    findings: sanitizeFindings(entry.findings),
    checkedAt: entry.checkedAt
  };
}

function verificationFromArtifact(task, artifact) {
  if (!VERIFICATION_ARTIFACT_KINDS.has(artifact.kind)) return undefined;
  const data = artifact.data || {};
  return {
    taskId: task.id,
    taskTitle: task.title || task.description,
    artifactId: artifact.id,
    runId: data.runId || artifact.runId,
    verdict: data.verdict,
    findings: sanitizeFindings(data.findings),
    checkedAt: data.checkedAt || artifact.updatedAt || artifact.createdAt
  };
}

function verificationEventsForTask(task, artifacts = []) {
  const history = task.verificationHistory || [];
  if (history.length) return history.map((entry) => verificationFromHistory(task, entry));
  return artifacts
    .filter((artifact) => artifact.entityId === task.id)
    .map((artifact) => verificationFromArtifact(task, artifact))
    .filter(Boolean);
}

const EVIDENCE_DONE_STATUSES = new Set(["done", "completed", "accepted"]);
const EVIDENCE_FAILED_RUN_STATUSES = new Set(["failed", "timed_out"]);
const EVIDENCE_OPEN_FEEDBACK_STATUSES = new Set(["new", "triaged", "linked_to_task", "in_progress", "open"]);
const EVIDENCE_REVIEW_SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, steady: 4 };

function evidenceDone(status) {
  return EVIDENCE_DONE_STATUSES.has(status);
}

function latestVerificationForTask(task, verifications = []) {
  return verifications.filter((verification) => verification.taskId === task.id).at(-1);
}

function evidenceRisk(kind, severity, text, extra = {}) {
  return {
    kind,
    severity,
    text: attentionText(text, 180),
    ...extra
  };
}

function evidenceNextAction(kind, role, extra = {}) {
  return {
    kind,
    role,
    ...extra
  };
}

function evidenceWorstSeverity(risks = []) {
  return risks.reduce((worst, risk) => {
    const currentRank = EVIDENCE_REVIEW_SEVERITY_RANK[risk.severity] ?? EVIDENCE_REVIEW_SEVERITY_RANK.medium;
    const worstRank = EVIDENCE_REVIEW_SEVERITY_RANK[worst] ?? EVIDENCE_REVIEW_SEVERITY_RANK.steady;
    return currentRank < worstRank ? risk.severity : worst;
  }, "steady");
}

function buildEvidenceReview({ intent, tasks = [], runs = [], artifacts = [], feedback = [], verifications = [], operations = [] }) {
  const intentRole = () => intent.consumerRole || latestRoleForEntity(runs, "intent", intent.id) || CEO_ROLE;
  const taskRole = (task) => taskConsumerRole(task) || latestRoleForEntity(runs, "task", task.id) || intentRole();
  const feedbackRole = (item) => feedbackOwnerRole(item) || latestRoleForEntity(runs, "feedback", item.id) || intentRole();
  const openTasks = tasks.filter((task) => !evidenceDone(task.status));
  const doneTasks = tasks.filter((task) => evidenceDone(task.status));
  const blockedTasks = openTasks.filter((task) => task.status === "blocked");
  const failedRuns = runs.filter((run) => EVIDENCE_FAILED_RUN_STATUSES.has(run.status));
  const openFeedback = feedback.filter((item) => EVIDENCE_OPEN_FEEDBACK_STATUSES.has(item.status || "new"));
  const latestRejectedTasks = openTasks.filter((task) => latestVerificationForTask(task, verifications)?.verdict === "reject");
  const verifiedOpenTasks = openTasks.filter((task) => latestVerificationForTask(task, verifications)?.verdict === "pass");
  const reworkTasks = openTasks.filter((task) => Number(task.reworkRounds || 0) > 0);
  const qaRejects = verifications.filter((verification) => verification.verdict === "reject").length;
  const risks = [];

  for (const task of blockedTasks) {
    risks.push(evidenceRisk("blocked_task", "critical", task.title || task.description || task.id, {
      taskId: task.id,
      role: taskConsumerRole(task)
    }));
  }
  for (const run of failedRuns) {
    risks.push(evidenceRisk("failed_run", "high", run.error?.message || run.id, {
      runId: run.id,
      role: run.agentRole
    }));
  }
  for (const task of verifiedOpenTasks) {
    risks.push(evidenceRisk("verified_task_not_closed", "high", task.title || task.description || task.id, {
      taskId: task.id,
      role: taskRole(task)
    }));
  }
  for (const task of latestRejectedTasks) {
    risks.push(evidenceRisk("qa_rework", "high", task.title || task.description || task.id, {
      taskId: task.id,
      role: taskConsumerRole(task)
    }));
  }
  for (const task of reworkTasks.filter((task) => !latestRejectedTasks.some((item) => item.id === task.id))) {
    risks.push(evidenceRisk("rework_history", "medium", task.title || task.description || task.id, {
      taskId: task.id,
      role: taskConsumerRole(task)
    }));
  }
  for (const item of openFeedback) {
    risks.push(evidenceRisk("open_feedback", item.priority === "critical" || item.priority === "high" ? "high" : "medium", item.summary || item.text || item.id, {
      feedbackId: item.id,
      role: feedbackRole(item)
    }));
  }
  if (!tasks.length && !evidenceDone(intent.status)) {
    risks.push(evidenceRisk("missing_task_graph", "medium", intentTitle(intent), { role: intentRole() }));
  }
  if ((evidenceDone(intent.status) || (tasks.length && openTasks.length === 0)) && !artifacts.length) {
    risks.push(evidenceRisk("missing_artifacts", "medium", intentTitle(intent), { role: intentRole() }));
  }
  if (!operations.length) {
    risks.push(evidenceRisk("missing_operations", "low", intentTitle(intent), { role: intentRole() }));
  }

  const taskCompletion = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : evidenceDone(intent.status) ? 100 : 0;
  const worstSeverity = evidenceWorstSeverity(risks);
  const primaryRisk = risks[0];
  let state = "in_progress";
  let nextAction = evidenceNextAction("watch_progress", openTasks[0] ? taskRole(openTasks[0]) : intentRole(), {
    targetTaskId: openTasks[0]?.id
  });

  if (blockedTasks.length) {
    state = "blocked";
    nextAction = evidenceNextAction("unblock_task", taskRole(blockedTasks[0]), {
      targetTaskId: blockedTasks[0].id
    });
  } else if (failedRuns.length) {
    state = "needs_attention";
    nextAction = evidenceNextAction("inspect_failed_run", failedRuns[0].agentRole || intentRole(), {
      targetRunId: failedRuns[0].id
    });
  } else if (verifiedOpenTasks.length) {
    state = "needs_attention";
    nextAction = evidenceNextAction("close_verified_task", taskRole(verifiedOpenTasks[0]), {
      targetTaskId: verifiedOpenTasks[0].id
    });
  } else if (latestRejectedTasks.length || reworkTasks.length) {
    const task = latestRejectedTasks[0] || reworkTasks[0];
    state = "qa_watch";
    nextAction = evidenceNextAction("fix_qa_rework", taskRole(task), {
      targetTaskId: task.id
    });
  } else if (openFeedback.length) {
    state = "needs_attention";
    nextAction = evidenceNextAction("triage_feedback", feedbackRole(openFeedback[0]), {
      targetFeedbackId: openFeedback[0].id
    });
  } else if (!tasks.length && !evidenceDone(intent.status)) {
    state = "waiting";
    nextAction = evidenceNextAction("plan_task_graph", intentRole());
  } else if (evidenceDone(intent.status) || (tasks.length && openTasks.length === 0)) {
    state = risks.some((risk) => ["missing_artifacts", "missing_operations"].includes(risk.kind)) ? "needs_evidence" : "verified";
    nextAction = evidenceNextAction(state === "verified" ? "review_completion" : "attach_evidence", intentRole());
  }

  return {
    state,
    severity: worstSeverity === "steady" ? (state === "verified" ? "steady" : "medium") : worstSeverity,
    progress: taskCompletion,
    nextAction,
    primaryRisk: primaryRisk ? { kind: primaryRisk.kind, severity: primaryRisk.severity, text: primaryRisk.text } : undefined,
    counts: {
      tasks: tasks.length,
      doneTasks: doneTasks.length,
      openTasks: openTasks.length,
      blockedTasks: blockedTasks.length,
      failedRuns: failedRuns.length,
      openFeedback: openFeedback.length,
      qaRejects,
      verifiedOpenTasks: verifiedOpenTasks.length
    },
    risks: risks
      .sort((left, right) =>
        (EVIDENCE_REVIEW_SEVERITY_RANK[left.severity] ?? EVIDENCE_REVIEW_SEVERITY_RANK.medium) -
        (EVIDENCE_REVIEW_SEVERITY_RANK[right.severity] ?? EVIDENCE_REVIEW_SEVERITY_RANK.medium)
      )
      .slice(0, 5)
  };
}

async function engineReadModel(engine) {
  if (typeof engine?.readModel === "function") return engine.readModel();
  if (typeof engine?.store?.readModel === "function") return engine.store.readModel();
  return { projects: [], intents: [], tasks: [], runs: [], artifacts: [], sessions: [], feedback: [] };
}

function sanitizeEngineSnapshot(readModel) {
  return {
    projects: (readModel.projects || []).map((project) => ({
      id: project.id,
      status: project.status,
      name: project.name,
      slug: project.slug,
      workspace: project.workspace,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    })),
    intents: (readModel.intents || []).map((intent) => ({
      id: intent.id,
      status: intent.status,
      projectId: intent.projectId,
      projectName: intent.projectName,
      workspace: intent.workspace,
      name: intent.name,
      description: intent.description,
      goal: intent.goal,
      brief: intentBrief(intent),
      source: intent.source,
      consumerRole: intent.consumerRole,
      taskIds: intent.taskIds || [],
      artifactIds: intent.artifactIds || [],
      runIds: intent.runIds || [],
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
      completedAt: intent.completedAt,
      blockedAt: intent.blockedAt,
      finalSummary: intent.finalSummary,
      blocked: intent.blocked,
      operations: sanitizeOperations(intent.operations)
    })),
    tasks: (readModel.tasks || []).map((task) => ({
      id: task.id,
      intentId: task.intentId,
      projectId: task.projectId,
      projectName: task.projectName,
      workspace: task.workspace,
      title: task.title,
      description: task.description,
      status: task.status,
      producerRole: task.producerRole,
      claimedByRole: task.claimedByRole,
      consumerRole: task.consumerRole,
      dependencies: task.dependencies || [],
      acceptanceCriteria: task.acceptanceCriteria || [],
      reworkRounds: task.reworkRounds || 0,
      verificationHistory: (task.verificationHistory || []).map((entry) => ({
        artifactId: entry.artifactId,
        runId: entry.runId,
        verdict: entry.verdict,
        findings: entry.findings || [],
        checkedAt: entry.checkedAt
      })),
      latestRejectionArtifactId: task.latestRejectionArtifactId,
      artifactIds: task.artifactIds || [],
      runIds: task.runIds || [],
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      blockedAt: task.blockedAt,
      operations: sanitizeOperations(task.operations)
    })),
    runs: (readModel.runs || []).map((run) => ({
      id: run.id,
      entityType: run.entityType,
      entityId: run.entityId,
      projectId: run.projectId,
      projectName: run.projectName,
      workspace: run.workspace,
      agentRole: run.agentRole,
      status: run.status,
      runner: run.runner,
      provider: run.provider,
      model: run.model,
      agentConfigSnapshot: sanitizeAgentConfigSnapshot(run.agentConfigSnapshot),
      artifactIds: run.artifactIds || [],
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      error: run.error ? { message: run.error.message } : undefined
    })),
    artifacts: (readModel.artifacts || []).map((artifact) => ({
      id: artifact.id,
      intentId: artifact.intentId,
      entityType: artifact.entityType,
      entityId: artifact.entityId,
      role: artifact.role,
      kind: artifact.kind,
      status: artifact.status,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt
    })),
    sessions: (readModel.sessions || []).map((session) => ({
      key: session.key,
      activeRunId: session.activeRunId,
      queuedEntityIds: session.queuedEntityIds || [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    })),
    feedback: (readModel.feedback || []).map((feedback) => ({
      id: feedback.id,
      status: feedback.status,
      text: feedback.text,
      summary: feedback.summary,
      priority: feedback.priority,
      intentId: feedback.intentId,
      taskId: feedback.taskId,
      linkedIntentId: feedback.linkedIntentId,
      linkedTaskId: feedback.linkedTaskId,
      triageArtifactId: feedback.triageArtifactId,
      source: feedback.source,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
      operations: sanitizeOperations(feedback.operations)
    }))
  };
}

function latestTimestamp(values = []) {
  return values
    .map((value) => new Date(value || 0).getTime())
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => right - left)[0];
}

function buildProjectCards(readModel = {}) {
  const projects = readModel.projects || [];
  const intents = readModel.intents || [];
  const tasks = readModel.tasks || [];
  const runs = readModel.runs || [];
  const artifacts = readModel.artifacts || [];
  const feedback = readModel.feedback || [];

  return projects
    .map((project) => {
      const projectIntents = intents.filter((intent) => intent.projectId === project.id || intent.projectName === project.name);
      const intentIds = new Set(projectIntents.map((intent) => intent.id));
      const projectTasks = tasks.filter((task) => task.projectId === project.id || intentIds.has(task.intentId));
      const taskIds = new Set(projectTasks.map((task) => task.id));
      const projectRuns = runs.filter((run) => run.projectId === project.id || intentIds.has(run.intentId) || taskIds.has(run.entityId));
      const projectArtifacts = artifacts.filter((artifact) =>
        artifact.projectId === project.id ||
        intentIds.has(artifact.intentId) ||
        intentIds.has(artifact.entityId) ||
        taskIds.has(artifact.entityId)
      );
      const projectFeedback = feedback.filter((item) => item.projectId === project.id || intentIds.has(item.intentId) || taskIds.has(item.linkedTaskId));
      const updatedAt =
        latestTimestamp([
          project.updatedAt,
          project.createdAt,
          ...projectIntents.map((item) => item.updatedAt || item.createdAt),
          ...projectTasks.map((item) => item.updatedAt || item.createdAt),
          ...projectRuns.map((item) => item.updatedAt || item.completedAt || item.startedAt || item.createdAt),
          ...projectArtifacts.map((item) => item.updatedAt || item.createdAt),
          ...projectFeedback.map((item) => item.updatedAt || item.createdAt)
        ]);

      return {
        id: project.id,
        name: project.name || project.slug || project.id,
        slug: project.slug,
        status: project.status || "active",
        createdAt: project.createdAt,
        updatedAt: updatedAt ? new Date(updatedAt).toISOString() : project.updatedAt || project.createdAt,
        counts: {
          intents: projectIntents.length,
          tasks: projectTasks.length,
          runs: projectRuns.length,
          artifacts: projectArtifacts.length,
          feedback: projectFeedback.length
        }
      };
    })
    .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime());
}

function buildEvidenceDossiers(readModel, { includeIntentIds = new Set(), limit = 20 } = {}) {
  const intents = readModel.intents || [];
  const tasks = readModel.tasks || [];
  const runs = readModel.runs || [];
  const artifacts = readModel.artifacts || [];
  const feedback = readModel.feedback || [];
  const sortedDossiers = intents
    .map((intent) => {
      const intentTasks = tasks.filter((task) => task.intentId === intent.id || (intent.taskIds || []).includes(task.id));
      const taskIds = new Set(intentTasks.map((task) => task.id));
      const intentArtifacts = artifacts.filter((artifact) => artifact.intentId === intent.id || taskIds.has(artifact.entityId) || (intent.artifactIds || []).includes(artifact.id));
      const intentRunIds = new Set(intent.runIds || []);
      const intentRuns = runs.filter((run) => run.entityId === intent.id || taskIds.has(run.entityId) || intentRunIds.has(run.id));
      const linkedFeedback = feedback.filter((item) => {
        const linkedIntentId = item.intentId || item.linkedIntentId;
        const linkedTaskId = item.taskId || item.linkedTaskId;
        return linkedIntentId === intent.id || taskIds.has(linkedTaskId);
      });
      const verifications = intentTasks.flatMap((task) => verificationEventsForTask(task, intentArtifacts));
      const operations = [
        ...sanitizeOperations(intent.operations).map((operation) => ({ ...operation, entityType: "intent", entityId: intent.id })),
        ...intentTasks.flatMap((task) => sanitizeOperations(task.operations).map((operation) => ({ ...operation, entityType: "task", entityId: task.id, title: task.title || task.description }))),
        ...linkedFeedback.flatMap((item) => sanitizeOperations(item.operations).map((operation) => ({ ...operation, entityType: "feedback", entityId: item.id })))
      ].sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));
      const review = buildEvidenceReview({
        intent,
        tasks: intentTasks,
        runs: intentRuns,
        artifacts: intentArtifacts,
        feedback: linkedFeedback,
        verifications,
        operations
      });
      const qaRejects = verifications.filter((verification) => verification.verdict === "reject").length;
      const brief = intentBrief(intent);
      return {
        id: intent.id,
        name: intent.name,
        description: intent.description,
        title: intentTitle(intent),
        goal: intent.goal,
        brief,
        status: intent.status,
        ownerRole: intent.consumerRole || CEO_ROLE,
        channel: sourceLabel(intent.source),
        updatedAt: intent.updatedAt || intent.createdAt,
        finalSummary: intent.finalSummary,
        blocked: intent.blocked,
        review,
        metrics: {
          tasks: intentTasks.length,
          runs: intentRuns.length,
          artifacts: intentArtifacts.length,
          feedback: linkedFeedback.length,
          operations: operations.length,
          qaRuns: verifications.length,
          qaRejects
        },
        tasks: intentTasks.map((task) => ({
          id: task.id,
          title: task.title || task.description,
          status: task.status,
          producerRole: task.producerRole,
          claimedByRole: task.claimedByRole,
          consumerRole: task.consumerRole,
          dependencies: task.dependencies || [],
          reworkRounds: task.reworkRounds || 0
        })),
        runs: intentRuns.map((run) => ({
          id: run.id,
          entityType: run.entityType,
          entityId: run.entityId,
          agentRole: run.agentRole,
          status: run.status,
          runner: run.runner,
          provider: run.provider,
          model: run.model,
          agentConfigSnapshot: sanitizeAgentConfigSnapshot(run.agentConfigSnapshot),
          startedAt: run.startedAt || run.createdAt,
          completedAt: run.completedAt,
          artifactIds: run.artifactIds || [],
          error: run.error ? { message: run.error.message } : undefined
        })),
        artifacts: intentArtifacts.map((artifact) => ({
          id: artifact.id,
          entityType: artifact.entityType,
          entityId: artifact.entityId,
          role: artifact.role,
          kind: artifact.kind,
          status: artifact.status,
          createdAt: artifact.createdAt
        })),
        feedback: linkedFeedback.map((item) => ({
          id: item.id,
          status: item.status,
          priority: item.priority,
          text: item.text || item.summary,
          taskId: item.taskId || item.linkedTaskId,
          triageArtifactId: item.triageArtifactId,
          channel: item.source?.channel,
          updatedAt: item.updatedAt || item.createdAt
        })),
        verifications,
        operations
      };
    })
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  const limited = sortedDossiers.slice(0, limit);
  const visibleIds = new Set(limited.map((dossier) => dossier.id));
  for (const dossier of sortedDossiers) {
    if (includeIntentIds.has(dossier.id) && !visibleIds.has(dossier.id)) {
      limited.push(dossier);
      visibleIds.add(dossier.id);
    }
  }
  return limited;
}

function buildEngineColumns(readModel) {
  const intents = readModel.intents || [];
  const tasks = readModel.tasks || [];
  const feedback = readModel.feedback || [];
  const verifyingTasks = new Set(tasks.filter((task) => taskIsUnderVerification(readModel, task)).map((task) => task.id));
  const items = {
    intents: intents
      .filter((intent) => ["new", "routing", "in_progress", "blocked"].includes(intent.status))
      .map((intent) => engineIntentCard(intent, tasks)),
    working: tasks
      .filter((task) => ["waiting", "working", "deploying", "worked", "tested"].includes(task.status) && !verifyingTasks.has(task.id))
      .map((task) => engineTaskCard(task, readModel)),
    testing: tasks
      .filter((task) => task.status === "testing" || verifyingTasks.has(task.id))
      .map((task) => engineTaskCard(task, readModel, verifyingTasks.has(task.id) ? { status: "testing", ownerRole: "qa" } : {})),
    blocked: tasks.filter((task) => task.status === "blocked").map((task) => engineTaskCard(task, readModel)),
    done: [
      ...intents.filter((intent) => intent.status === "done").map((intent) => engineIntentCard(intent, tasks)),
      ...tasks.filter((task) => task.status === "done").map((task) => engineTaskCard(task, readModel))
    ],
    feedback: feedback.map((item) => engineFeedbackCard(item, readModel))
  };

  return ENGINE_COLUMNS.map((column) => ({
    ...column,
    count: items[column.id].length,
    items: items[column.id]
  }));
}

function entityTitleForWork({ run, task, intent }) {
  if (task) return titleFromText(task.title || task.description || task.id);
  if (intent) return intentTitle(intent);
  return titleFromText(run?.entityId || "Current work");
}

function runMatchesLiveEntity(run = {}, { task, intent } = {}) {
  if (run.entityType === "task") return ["working", "testing", "deploying"].includes(task?.status);
  if (run.entityType === "intent") return ["routing", "in_progress"].includes(intent?.status);
  return true;
}

function buildWorkingAgents(readModel) {
  const intents = readModel.intents || [];
  const tasks = readModel.tasks || [];
  const runs = readModel.runs || [];
  const byKey = new Map();
  const put = (item) => {
    const key = `${item.role}:${item.entityType || "work"}:${item.entityId || item.runId || item.workTitle}`;
    if (!byKey.has(key)) byKey.set(key, item);
  };

  for (const run of runs.filter((item) => ["running", "queued"].includes(item.status))) {
    const task = tasks.find((candidate) => candidate.id === run.entityId);
    const intent = intents.find((candidate) => candidate.id === run.entityId || candidate.id === task?.intentId);
    if (!runMatchesLiveEntity(run, { task, intent })) continue;
    const agent = ownerFromRole(run.agentRole);
    put({
      role: run.agentRole,
      ...agent,
      title: agent.name,
      state: run.status,
      runId: run.id,
      entityType: run.entityType,
      entityId: run.entityId,
      intentId: intent?.id || task?.intentId,
      workTitle: entityTitleForWork({ run, task, intent }),
      provider: run.provider,
      model: run.model,
      startedAt: run.startedAt || run.createdAt,
      updatedAt: run.updatedAt
    });
  }

  return [...byKey.values()].sort((left, right) => String(right.startedAt || right.updatedAt || "").localeCompare(String(left.startedAt || left.updatedAt || "")));
}

function buildEngineClients(readModel) {
  const clients = new Map();
  const upsert = (source = {}, latest, timestamp, field) => {
    const key = source.threadId || source.userId || source.channel || "unknown";
    const existing = clients.get(key) || {
      id: key,
      name: source.userName || key,
      channel: source.channel || "cli",
      intents: 0,
      tasks: 0,
      feedback: 0,
      lastSeenAt: timestamp,
      latest
    };
    existing[field] += 1;
    if (timestamp && (!existing.lastSeenAt || timestamp > existing.lastSeenAt)) {
      existing.lastSeenAt = timestamp;
      existing.latest = latest;
    }
    clients.set(key, existing);
  };

  for (const intent of readModel.intents || []) {
    upsert(intent.source, intentBrief(intent)?.outcome || intent.goal, intent.updatedAt || intent.createdAt, "intents");
  }
  for (const item of readModel.feedback || []) {
    upsert(item.source, item.text, item.updatedAt || item.createdAt, "feedback");
  }

  return [...clients.values()].sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))).slice(0, 20);
}

function engineVerificationEvents(readModel) {
  const artifactsByTask = new Map();
  for (const artifact of readModel.artifacts || []) {
    if (!VERIFICATION_ARTIFACT_KINDS.has(artifact.kind)) continue;
    const list = artifactsByTask.get(artifact.entityId) || [];
    list.push(artifact);
    artifactsByTask.set(artifact.entityId, list);
  }

  return (readModel.tasks || []).flatMap((task) => {
    if (Array.isArray(task.verificationHistory) && task.verificationHistory.length) return task.verificationHistory;
    return (artifactsByTask.get(task.id) || []).map((artifact) => artifact.data || {});
  });
}

function buildEngineReports(readModel) {
  const tasks = readModel.tasks || [];
  const verifications = engineVerificationEvents(readModel);
  const qaRejects = verifications.filter((verification) => verification.verdict === "reject").length;
  const failedRuns = (readModel.runs || []).filter((run) => run.status === "failed" || run.status === "timed_out").length;
  return {
    throughput: tasks.filter((task) => task.status === "done").length,
    active: tasks.filter((task) => !["done", "blocked"].includes(task.status)).length,
    failed: tasks.filter((task) => task.status === "blocked").length + failedRuns,
    feedback: (readModel.feedback || []).length,
    qaRuns: verifications.length,
    qaRejects,
    rejectionRate: verifications.length ? Math.round((qaRejects / verifications.length) * 100) : 0
  };
}

function buildEngineAgents(readModel, workingAgents = buildWorkingAgents(readModel), configuredAgents = []) {
  const activeAgentRoles = new Set(workingAgents.map((agent) => agent.role).filter(Boolean));

  const roles = [...new Set([
    ...(configuredAgents || []).map((agent) => agent.role).filter(Boolean),
    ...activeAgentRoles
  ])];
  return roles.map((role) => {
    const agent = configuredOwnerFromRole(role, configuredAgents);
    const configured = (configuredAgents || []).find((item) => item.role === role);
    return {
      role,
      ...agent,
      title: configured?.title || agent.name,
      active: activeAgentRoles.has(role)
    };
  });
}

async function buildKnowledge(memory) {
  if (!memory) return { facts: [], recentEvents: [] };
  const [facts, recentEvents] = await Promise.all([
    memory.getFacts ? memory.getFacts() : {},
    memory.recentEvents ? memory.recentEvents(20) : []
  ]);
  return {
    facts: Object.values(facts || {})
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, 20)
      .map((fact) => ({
        key: fact.key,
        value: fact.value,
        type: fact.type,
        updatedAt: fact.updatedAt,
        taskId: fact.taskId,
        channel: fact.channel
      })),
    recentEvents: [...(recentEvents || [])].reverse().slice(0, 20).map((event) => ({
      id: event.id,
      ts: event.ts,
      type: event.type,
      intentId: event.intentId,
      taskId: event.taskId,
      feedbackId: event.feedbackId,
      channel: event.channel,
      threadId: event.threadId,
      text: event.text,
      summary: event.summary
    }))
  };
}

async function attachAgentWakeRules(agent, routingStore) {
  if (!agent || !routingStore?.get) return agent;
  const routing = await routingStore.get(agent.role);
  return { ...agent, wakeRules: routing.wakeRules };
}

function previewText(value, limit = 260) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3)}...`;
}

function redactDashboardMemoryText(value) {
  return redactSecretText(value)
    .replace(/\/Users\/[^\s)'"`]+/g, "[redacted-path]")
    .replace(/\/home\/[^\s)'"`]+/g, "[redacted-path]");
}

function memoryEntryText(entry = {}) {
  if (entry.text !== undefined) return String(entry.text);
  if (entry.value !== undefined) return typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value);
  return "";
}

function publicAgentMemoryEntry(entry = {}) {
  return {
    key: previewText(redactDashboardMemoryText(entry.key), 80),
    text: previewText(redactDashboardMemoryText(memoryEntryText(entry)), 220)
  };
}

function buildAgentContextReadiness(memory = {}, agent = {}) {
  const factCount = Number(memory.factCount || 0);
  const playbookCount = Number(memory.playbookCount || 0);
  const hasRecentSummary = Boolean(memory.hasRecentSummary);
  const openContextNeedCount = Number(memory.openContextNeedCount || 0);
  const gaps = [];
  if (openContextNeedCount) gaps.push({ id: "open_context_needs", promptKind: "missing_context", count: openContextNeedCount });
  if (!factCount) gaps.push({ id: "fact_memory", promptKind: "memory" });
  if (!playbookCount) gaps.push({ id: "procedure_memory", promptKind: "memory" });
  if (!hasRecentSummary) gaps.push({ id: "recent_summary", promptKind: "missing_context" });
  let score = (factCount ? 40 : 0) + (playbookCount ? 35 : 0) + (hasRecentSummary ? 25 : 0);
  if (openContextNeedCount) score -= Math.min(20, openContextNeedCount * 10);
  if (!trimmedText(agent.modelProvider?.providerId) || !trimmedText(agent.modelProvider?.model)) {
    gaps.push({ id: "provider_model", promptKind: "diagnostics" });
    score -= 10;
  }
  const operationalTools = (Array.isArray(agent.tools) ? agent.tools : []).filter((toolId) => String(toolId) !== "skill");
  if (operationalTools.length === 0) {
    gaps.push({ id: "tool_policy", promptKind: "diagnostics" });
    score -= 10;
  }
  if (!Array.isArray(agent.wakeRules) || agent.wakeRules.length === 0) {
    gaps.push({ id: "wake_rules", promptKind: "diagnostics" });
    score -= 5;
  }
  return {
    status: gaps.length ? "needs_context" : "ready",
    score: Math.max(0, Math.min(100, score)),
    gaps
  };
}

function contextNeedRank(need = {}) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[need.priority] ?? 2;
}

function taskById(readModel = {}, taskId) {
  return (readModel.tasks || []).find((task) => task.id === taskId);
}

function intentById(readModel = {}, intentId) {
  return (readModel.intents || []).find((intent) => intent.id === intentId);
}

function taskIsResolved(readModel = {}, task = {}) {
  if (!task?.id) return false;
  if (task.status === "done") return true;
  const intent = task.intentId ? intentById(readModel, task.intentId) : undefined;
  return intent?.status === "done";
}

function intentIsResolved(readModel = {}, intentId) {
  return intentById(readModel, intentId)?.status === "done";
}

function contextNeedRelatedTaskId(need = {}) {
  return need.relatedTaskId || need.taskId || need.source?.linkedContext?.taskId;
}

function contextNeedRelatedIntentId(need = {}) {
  return need.relatedIntentId || need.intentId || need.source?.linkedContext?.intentId;
}

function contextNeedIsActionable(need = {}, readModel = {}) {
  const taskId = contextNeedRelatedTaskId(need);
  if (taskId) {
    const task = taskById(readModel, taskId);
    if (!task) return false;
    return !taskIsResolved(readModel, task);
  }
  const intentId = contextNeedRelatedIntentId(need);
  if (intentId) {
    const intent = intentById(readModel, intentId);
    if (!intent) return false;
    return !intentIsResolved(readModel, intentId);
  }
  return true;
}

function publicAgentContextNeed(entry = {}) {
  const relatedTaskId = contextNeedRelatedTaskId(entry);
  return Object.fromEntries(Object.entries({
    id: previewText(redactDashboardMemoryText(entry.id), 80),
    status: previewText(redactDashboardMemoryText(entry.status || "open"), 40),
    priority: previewText(redactDashboardMemoryText(entry.priority || "medium"), 40),
    category: previewText(redactDashboardMemoryText(entry.category || "context"), 80),
    question: previewText(redactDashboardMemoryText(entry.question), 260),
    whyItMatters: previewText(redactDashboardMemoryText(entry.whyItMatters), 260),
    suggestedMemoryKind: previewText(redactDashboardMemoryText(entry.suggestedMemoryKind), 60),
    relatedIntentId: previewText(redactDashboardMemoryText(contextNeedRelatedIntentId(entry)), 120),
    relatedTaskId: previewText(redactDashboardMemoryText(relatedTaskId), 120),
    sourceMode: previewText(redactDashboardMemoryText(entry.source?.mode), 80),
    createdAt: previewText(redactDashboardMemoryText(entry.createdAt), 80)
  }).filter(([, value]) => value !== undefined && value !== ""));
}

function buildAgentContextRequests(agents = [], { readModel = {}, limit = 12 } = {}) {
  const requests = (agents || []).flatMap((agent) => {
    const role = previewText(redactDashboardMemoryText(agent.role), 80);
    if (!role) return [];
    return (agent.memory?.contextNeeds || [])
      .filter((need) => contextNeedIsActionable(need, readModel))
      .map((need) => ({
        ...need,
        role,
        agentName: previewText(redactDashboardMemoryText(agent.name || agent.title || role), 80),
        agentTitle: previewText(redactDashboardMemoryText(agent.title || role), 120),
        action: {
          label: "Open one one",
          target: `one_one:${role}`,
          contextNeedId: need.id
        }
      }));
  }).sort((left, right) => contextNeedRank(left) - contextNeedRank(right) || String(right.createdAt || "").localeCompare(String(left.createdAt || "")));

  return {
    total: requests.length,
    items: requests.slice(0, limit)
  };
}

const OWNER_ATTENTION_SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const OWNER_ATTENTION_KIND_RANK = { context_request: 0, blocked: 1, failed_run: 2, qa_loop: 3, readiness: 4, feedback: 5 };

function attentionSeverityRank(severity = "medium") {
  return OWNER_ATTENTION_SEVERITY_RANK[severity] ?? OWNER_ATTENTION_SEVERITY_RANK.medium;
}

function attentionKindRank(kind = "feedback") {
  return OWNER_ATTENTION_KIND_RANK[kind] ?? OWNER_ATTENTION_KIND_RANK.feedback;
}

function attentionText(value, limit = 180) {
  return previewText(redactDashboardMemoryText(value), limit);
}

function taskIntentId(readModel = {}, taskId) {
  return (readModel.tasks || []).find((task) => task.id === taskId)?.intentId;
}

function intentIdForEntity(readModel = {}, entityType, entityId) {
  if (!entityId) return undefined;
  if (entityType === "intent") return entityId;
  if (entityType === "task") return taskIntentId(readModel, entityId);
  return taskIntentId(readModel, entityId) || (readModel.intents || []).find((intent) => intent.id === entityId)?.id;
}

function runEntityIsResolved(readModel = {}, run = {}) {
  if (!run.entityId) return false;
  const task = taskById(readModel, run.entityId);
  if (task) return taskIsResolved(readModel, task);
  if (run.entityType === "intent" || intentById(readModel, run.entityId)) return intentIsResolved(readModel, run.entityId);
  return false;
}

function runTimestamp(run = {}) {
  return run.completedAt || run.failedAt || run.updatedAt || run.startedAt || run.createdAt || "";
}

function hasLaterSuccessfulRun(readModel = {}, run = {}) {
  const timestamp = runTimestamp(run);
  return (readModel.runs || []).some((candidate) =>
    candidate.id !== run.id &&
    candidate.status === "completed" &&
    candidate.entityId === run.entityId &&
    (candidate.entityType || "") === (run.entityType || "") &&
    (candidate.agentRole || "") === (run.agentRole || "") &&
    String(runTimestamp(candidate)).localeCompare(String(timestamp)) >= 0
  );
}

function failedRunNeedsAttention(readModel = {}, run = {}) {
  return ["failed", "timed_out"].includes(run.status) &&
    !runEntityIsResolved(readModel, run) &&
    !hasLaterSuccessfulRun(readModel, run);
}

function feedbackLinkedTask(readModel = {}, item = {}) {
  const taskId = item.taskId || item.linkedTaskId;
  return taskId ? taskById(readModel, taskId) : undefined;
}

function feedbackNeedsAttention(readModel = {}, item = {}) {
  if (["done", "completed", "rejected"].includes(item.status)) return false;
  const linkedTask = feedbackLinkedTask(readModel, item);
  if (linkedTask && taskIsResolved(readModel, linkedTask)) return false;
  const linkedIntentId = item.intentId || item.linkedIntentId || taskIntentId(readModel, item.taskId || item.linkedTaskId);
  if (linkedIntentId && intentIsResolved(readModel, linkedIntentId)) return false;
  return true;
}

function ownerAttentionAction(target, label = "Open evidence") {
  return target ? { label, target } : undefined;
}

function ownerAttentionCounts(items = []) {
  return items.reduce((counts, item) => {
    const severity = item.severity || "medium";
    counts[severity] = (counts[severity] || 0) + 1;
    return counts;
  }, { critical: 0, high: 0, medium: 0, low: 0 });
}

function buildOwnerAttention(readModel = {}, { contextRequests = { items: [] }, readiness = {}, limit = 8 } = {}) {
  const items = [];
  for (const request of contextRequests.items || []) {
    const severity = ["critical", "high", "medium", "low"].includes(request.priority) ? request.priority : "medium";
    items.push({
      id: `context:${request.id}`,
      kind: "context_request",
      severity,
      title: attentionText(request.question, 180),
      reason: attentionText(request.whyItMatters || "Agent is blocked on owner context.", 180),
      meta: attentionText([request.agentName || request.role, request.category, request.relatedTaskId].filter(Boolean).join(" · "), 160),
      role: attentionText(request.role, 80),
      contextNeedId: attentionText(request.id, 80),
      createdAt: request.createdAt,
      action: ownerAttentionAction(`one_one:${request.role}:${request.id}`, "Open one one")
    });
  }

  for (const intent of readModel.intents || []) {
    if (intent.status !== "blocked") continue;
    items.push({
      id: `blocked:${intent.id}`,
      kind: "blocked",
      severity: "critical",
      title: attentionText(intentTitle(intent), 180),
      titleKey: "ownerAttention.blockedIntentTitle",
      reason: attentionText(intent.blocked?.reason || intent.finalSummary || "Intent is blocked.", 220),
      meta: attentionText(intent.id, 120),
      intentId: attentionText(intent.id, 120),
      updatedAt: intent.updatedAt || intent.blockedAt || intent.createdAt,
      action: ownerAttentionAction(`evidence:${intent.id}`)
    });
  }

  for (const task of readModel.tasks || []) {
    if (task.status === "blocked") {
      const intentId = task.intentId;
      items.push({
        id: `blocked:${task.id}`,
        kind: "blocked",
        severity: "critical",
        title: attentionText(task.title || task.description || task.id, 180),
        titleKey: "ownerAttention.blockedTaskTitle",
        reason: attentionText(task.error?.message || task.summary || "Task is blocked.", 220),
        meta: attentionText([task.id, task.claimedByRole || task.consumerRole].filter(Boolean).join(" · "), 140),
        intentId: attentionText(intentId, 120),
        taskId: attentionText(task.id, 120),
        updatedAt: task.updatedAt || task.blockedAt || task.createdAt,
        action: ownerAttentionAction(intentId ? `evidence:${intentId}` : undefined)
      });
    }

    const rejectCount = verificationEventsForTask(task, readModel.artifacts || []).filter((verification) => verification.verdict === "reject").length;
    const reworkRounds = Number(task.reworkRounds || 0);
    if (task.status !== "done" && (rejectCount > 0 || reworkRounds > 0)) {
      items.push({
        id: `qa:${task.id}`,
        kind: "qa_loop",
        severity: reworkRounds > 1 || rejectCount > 1 ? "critical" : "high",
        title: attentionText(task.title || task.description || task.id, 180),
        titleKey: "ownerAttention.qaLoopTitle",
        reason: attentionText(`${rejectCount} verification reject${rejectCount === 1 ? "" : "s"} and ${reworkRounds} rework round${reworkRounds === 1 ? "" : "s"}.`, 180),
        reasonKey: "ownerAttention.qaLoopReason",
        values: { rejectCount, reworkRounds },
        meta: attentionText([task.id, task.claimedByRole || task.consumerRole].filter(Boolean).join(" · "), 140),
        intentId: attentionText(task.intentId, 120),
        taskId: attentionText(task.id, 120),
        updatedAt: task.updatedAt || task.createdAt,
        action: ownerAttentionAction(task.intentId ? `evidence:${task.intentId}` : undefined)
      });
    }
  }

  for (const run of readModel.runs || []) {
    if (!failedRunNeedsAttention(readModel, run)) continue;
    const intentId = intentIdForEntity(readModel, run.entityType, run.entityId);
    items.push({
      id: `run:${run.id}`,
      kind: "failed_run",
      severity: "high",
      title: attentionText(run.agentRole || run.id, 160),
      titleKey: "ownerAttention.failedRunTitle",
      reason: attentionText(run.error?.message || run.status || "Run failed.", 220),
      meta: attentionText([run.id, run.provider || run.runner, run.model].filter(Boolean).join(" · "), 160),
      intentId: attentionText(intentId, 120),
      runId: attentionText(run.id, 120),
      updatedAt: run.updatedAt || run.completedAt || run.startedAt || run.createdAt,
      action: ownerAttentionAction(intentId ? `evidence:${intentId}` : undefined)
    });
  }

  for (const item of readModel.feedback || []) {
    if (!feedbackNeedsAttention(readModel, item)) continue;
    const linkedIntentId = item.intentId || item.linkedIntentId || taskIntentId(readModel, item.taskId || item.linkedTaskId);
    items.push({
      id: `feedback:${item.id}`,
      kind: "feedback",
      severity: item.priority === "critical" || item.priority === "high" ? "high" : "medium",
      title: attentionText(item.summary || item.text || item.id, 180),
      titleKey: "ownerAttention.feedbackTitle",
      reason: attentionText(item.text || item.summary || "Feedback needs triage.", 220),
      meta: attentionText([item.id, item.source?.channel, item.status].filter(Boolean).join(" · "), 160),
      intentId: attentionText(linkedIntentId, 120),
      feedbackId: attentionText(item.id, 120),
      updatedAt: item.updatedAt || item.createdAt,
      action: ownerAttentionAction(linkedIntentId ? `evidence:${linkedIntentId}` : undefined)
    });
  }

  const nonReadyReadiness = (readiness.items || []).find((item) => !["ready", "skipped"].includes(item.status));
  if (readiness.overall && readiness.overall !== "ready" && nonReadyReadiness) {
    items.push({
      id: "readiness:setup",
      kind: "readiness",
      severity: readiness.overall === "failed" || nonReadyReadiness.status === "failed" ? "critical" : "high",
      title: attentionText(nonReadyReadiness.label || "Setup readiness", 160),
      titleKey: "ownerAttention.readinessTitle",
      reason: attentionText(nonReadyReadiness.reason || "Setup is not ready.", 220),
      meta: attentionText(nonReadyReadiness.status || readiness.overall, 120),
      action: ownerAttentionAction("settings:readiness", "Open Settings")
    });
  }

  const sorted = items
    .filter((item) => item.title || item.titleKey)
    .sort((left, right) =>
      attentionSeverityRank(left.severity) - attentionSeverityRank(right.severity) ||
      attentionKindRank(left.kind) - attentionKindRank(right.kind) ||
      String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || ""))
    );

  return {
    status: sorted.length ? "needs_attention" : "steady",
    total: sorted.length,
    counts: ownerAttentionCounts(sorted),
    items: sorted.slice(0, limit)
  };
}

async function readLinesIfExists(file) {
  try {
    return (await fs.readFile(file, "utf8")).split("\n").filter((line) => line.trim());
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readContextNeedsSummary(file, { limit = 8, readModel = {} } = {}) {
  const needs = [];
  let openCount = 0;
  const lines = await readLinesIfExists(file);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.status && parsed.status !== "open") continue;
      if (!contextNeedIsActionable(parsed, readModel)) continue;
      openCount += 1;
      needs.push(publicAgentContextNeed(parsed));
    } catch {
      continue;
    }
  }
  return {
    openCount,
    entries: needs
      .sort((left, right) => contextNeedRank(left) - contextNeedRank(right) || String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
      .slice(0, limit)
  };
}

async function readJsonlMemorySummary(file, limit = 3) {
  const entries = [];
  let count = 0;
  try {
    const lines = readline.createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Infinity
    });
    for await (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      count += 1;
      if (entries.length >= limit) continue;
      try {
        entries.push(publicAgentMemoryEntry(JSON.parse(trimmed)));
      } catch {
        entries.push(publicAgentMemoryEntry({ text: trimmed }));
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { count, entries };
}

async function listMarkdownFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function markdownTitle(content) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
}

function markdownSummary(content) {
  return content.match(/^## Summary\n([\s\S]*?)(?:\n## |\n?$)/m)?.[1]?.trim() || "";
}

async function readOneOneCoachingPreview(eventsDir, limit = 3) {
  const files = (await listMarkdownFiles(eventsDir)).reverse();
  const entries = [];
  for (const fileName of files) {
    if (entries.length >= limit) break;
    const content = await fs.readFile(path.join(eventsDir, fileName), "utf8");
    const title = markdownTitle(content);
    if (!/^one one coaching$/i.test(title)) continue;
    const summary = markdownSummary(content);
    entries.push(`- ${title}: ${previewText(redactDashboardMemoryText(summary), 500)}`);
  }
  return entries.length ? previewText(`# Recent One One Coaching\n\n${entries.join("\n")}`, 900) : "";
}

async function readTextIfExists(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function buildAgentMemorySummary(agent = {}, readModel = {}) {
  if (!agent.agentDir) {
    const memory = { factCount: 0, playbookCount: 0, hasRecentSummary: false, hasCoachingJournal: false, openContextNeedCount: 0, facts: [], playbooks: [], contextNeeds: [], recentSummaryPreview: "", coachingJournalPreview: "" };
    return { ...memory, readiness: buildAgentContextReadiness(memory, agent) };
  }
  try {
    const memoryDir = path.join(agent.agentDir, "memory");
    const [facts, playbooks, contextNeeds, recentSummary, coachingJournal] = await Promise.all([
      readJsonlMemorySummary(path.join(memoryDir, "long-term", "facts.jsonl")),
      readJsonlMemorySummary(path.join(memoryDir, "long-term", "playbooks.jsonl")),
      readContextNeedsSummary(path.join(memoryDir, "episodic", "context-needs.jsonl"), { readModel }),
      readTextIfExists(path.join(memoryDir, "episodic", "recent-summary.md")),
      readOneOneCoachingPreview(path.join(memoryDir, "episodic", "events"))
    ]);
    const memory = {
      factCount: facts.count,
      playbookCount: playbooks.count,
      openContextNeedCount: contextNeeds.openCount,
      hasRecentSummary: Boolean(String(recentSummary || "").trim()),
      hasCoachingJournal: Boolean(String(coachingJournal || "").trim()),
      facts: facts.entries,
      playbooks: playbooks.entries,
      contextNeeds: contextNeeds.entries,
      recentSummaryPreview: previewText(redactDashboardMemoryText(recentSummary)),
      coachingJournalPreview: previewText(redactDashboardMemoryText(coachingJournal))
    };
    return { ...memory, readiness: buildAgentContextReadiness(memory, agent) };
  } catch {
    const memory = { factCount: 0, playbookCount: 0, hasRecentSummary: false, hasCoachingJournal: false, openContextNeedCount: 0, facts: [], playbooks: [], contextNeeds: [], recentSummaryPreview: "", coachingJournalPreview: "", status: "unavailable" };
    return { ...memory, readiness: buildAgentContextReadiness(memory, agent) };
  }
}

async function attachAgentContext(agent, routingStore, readModel = {}, hiddenToolIds = new Set()) {
  const withWakeRules = await attachAgentWakeRules(agent, routingStore);
  const visibleAgent = {
    ...withWakeRules,
    tools: visibleToolIdsForAgent(withWakeRules, hiddenToolIds)
  };
  return { ...visibleAgent, memory: await buildAgentMemorySummary(visibleAgent, readModel) };
}

function buildEmployeeConfigSummary(agents = []) {
  const scores = agents.map((agent) => Number(agent.memory?.readiness?.score || 0));
  const gaps = agents.flatMap((agent) => agent.memory?.readiness?.gaps || []);
  const openContextNeeds = agents.reduce((sum, agent) => sum + Number(agent.memory?.openContextNeedCount || 0), 0);
  const ready = agents.filter((agent) => agent.memory?.readiness?.status === "ready").length;
  const needsContext = agents.filter((agent) => agent.memory?.readiness?.status !== "ready").length;
  const gapCount = (id) => gaps.filter((gap) => gap.id === id).length;

  return {
    status: needsContext || openContextNeeds ? "needs_context" : "ready",
    total: agents.length,
    ready,
    needsContext,
    openContextNeeds,
    averageContextScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
    gaps: {
      providerModel: gapCount("provider_model"),
      toolPolicy: gapCount("tool_policy"),
      wakeRules: gapCount("wake_rules"),
      factMemory: gapCount("fact_memory"),
      procedureMemory: gapCount("procedure_memory"),
      recentSummary: gapCount("recent_summary")
    }
  };
}

const EMPLOYEE_IMPROVEMENT_SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const EMPLOYEE_IMPROVEMENT_KIND_RANK = { context_request: 0, failed_run: 1, qa_loop: 2, config_gap: 3, memory_gap: 4 };
const EMPLOYEE_CONFIG_GAPS = new Set(["provider_model", "tool_policy", "wake_rules"]);

function improvementSeverityRank(severity = "medium") {
  return EMPLOYEE_IMPROVEMENT_SEVERITY_RANK[severity] ?? EMPLOYEE_IMPROVEMENT_SEVERITY_RANK.medium;
}

function improvementKindRank(kind = "memory_gap") {
  return EMPLOYEE_IMPROVEMENT_KIND_RANK[kind] ?? EMPLOYEE_IMPROVEMENT_KIND_RANK.memory_gap;
}

function employeeByRole(agents = []) {
  return new Map((agents || []).map((agent) => [agent.role, agent]));
}

function employeeLabel(agent = {}, role = "") {
  const fallback = ownerFromRole(role || agent.role);
  return {
    role: attentionText(role || agent.role, 80),
    agentName: attentionText(agent.name || agent.title || role || agent.role, 80),
    agentTitle: attentionText(agent.title || role || agent.role, 120),
    agentInitials: attentionText(agent.initials || fallback.initials, 8),
    agentColor: attentionText(agent.color || fallback.color, 40)
  };
}

function employeeImprovementAction(kind, target, label) {
  return target ? { kind, target, label } : undefined;
}

function employeeImprovementCounts(items = []) {
  return items.reduce((counts, item) => {
    const kind = item.kind || "memory_gap";
    const severity = item.severity || "medium";
    counts.byKind[kind] = (counts.byKind[kind] || 0) + 1;
    counts.bySeverity[severity] = (counts.bySeverity[severity] || 0) + 1;
    return counts;
  }, { byKind: {}, bySeverity: { critical: 0, high: 0, medium: 0, low: 0 } });
}

function buildEmployeeImprovementPlan(readModel = {}, { agents = [], contextRequests = { items: [] }, limit = 12 } = {}) {
  const employees = employeeByRole(agents);
  const items = [];
  const seen = new Set();
  const push = (item) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  for (const request of contextRequests.items || []) {
    const agent = employees.get(request.role) || {};
    push({
      id: `context:${request.role}:${request.id}`,
      kind: "context_request",
      severity: ["critical", "high", "medium", "low"].includes(request.priority) ? request.priority : "medium",
      ...employeeLabel(agent, request.role),
      title: attentionText(request.question || "Agent asked for missing context.", 180),
      reason: attentionText(request.whyItMatters || "Answer this before assigning harder work.", 220),
      meta: attentionText([request.category, request.relatedTaskId].filter(Boolean).join(" · "), 140),
      contextNeedId: attentionText(request.id, 80),
      taskId: attentionText(request.relatedTaskId, 120),
      gapId: "open_context_needs",
      promptKey: "employee.improvement.prompt.contextRequest",
      values: {
        question: attentionText(request.question, 220),
        reason: attentionText(request.whyItMatters, 220),
        taskId: attentionText(request.relatedTaskId, 120)
      },
      action: employeeImprovementAction("one_one", `one_one:${request.role}:${request.id}`, "Coach in one one"),
      createdAt: request.createdAt
    });
  }

  for (const run of readModel.runs || []) {
    if (!failedRunNeedsAttention(readModel, run)) continue;
    const role = run.agentRole;
    const agent = employees.get(role) || {};
    const intentId = intentIdForEntity(readModel, run.entityType, run.entityId);
    push({
      id: `run:${run.id}`,
      kind: "failed_run",
      severity: "high",
      ...employeeLabel(agent, role),
      title: attentionText(run.error?.message || run.status || "Run failed.", 180),
      titleKey: "employee.improvement.failedRunTitle",
      reason: attentionText([run.id, run.provider || run.runner, run.model].filter(Boolean).join(" · "), 180),
      meta: attentionText([run.entityType, run.entityId].filter(Boolean).join(" · "), 140),
      intentId: attentionText(intentId, 120),
      runId: attentionText(run.id, 120),
      promptKey: "employee.improvement.prompt.failedRun",
      values: {
        runId: attentionText(run.id, 120),
        error: attentionText(run.error?.message || run.status || "Run failed.", 220)
      },
      action: employeeImprovementAction("evidence", intentId ? `evidence:${intentId}` : undefined, "Open evidence"),
      updatedAt: run.updatedAt || run.completedAt || run.startedAt || run.createdAt
    });
  }

  for (const task of readModel.tasks || []) {
    const rejectCount = verificationEventsForTask(task, readModel.artifacts || []).filter((verification) => verification.verdict === "reject").length;
    const reworkRounds = Number(task.reworkRounds || 0);
    if (task.status === "done" || (!rejectCount && !reworkRounds)) continue;
    const role = task.claimedByRole || task.consumerRole || task.producerRole || latestRoleForEntity(readModel.runs || [], "task", task.id) || CEO_ROLE;
    const agent = employees.get(role) || {};
    push({
      id: `qa:${task.id}`,
      kind: "qa_loop",
      severity: reworkRounds > 1 || rejectCount > 1 ? "critical" : "high",
      ...employeeLabel(agent, role),
      title: attentionText(task.title || task.description || task.id, 180),
      titleKey: "employee.improvement.qaLoopTitle",
      reason: attentionText(`${rejectCount} verification reject${rejectCount === 1 ? "" : "s"} and ${reworkRounds} rework round${reworkRounds === 1 ? "" : "s"}.`, 180),
      reasonKey: "ownerAttention.qaLoopReason",
      values: { rejectCount, reworkRounds, taskId: attentionText(task.id, 120) },
      meta: attentionText([task.id, role].filter(Boolean).join(" · "), 140),
      intentId: attentionText(task.intentId, 120),
      taskId: attentionText(task.id, 120),
      promptKey: "employee.improvement.prompt.qaLoop",
      action: employeeImprovementAction("one_one", `one_one:${role}:qa:${task.id}`, "Coach in one one"),
      updatedAt: task.updatedAt || task.createdAt
    });
  }

  for (const agent of agents || []) {
    const gaps = agent.memory?.readiness?.gaps || [];
    for (const gap of gaps) {
      if (gap.id === "open_context_needs" && Number(agent.memory?.openContextNeedCount || 0)) continue;
      const isConfigGap = EMPLOYEE_CONFIG_GAPS.has(gap.id);
      const severity = gap.id === "provider_model" || gap.id === "tool_policy" ? "high" : "medium";
      push({
        id: `gap:${agent.role}:${gap.id}`,
        kind: isConfigGap ? "config_gap" : "memory_gap",
        severity,
        ...employeeLabel(agent, agent.role),
        titleKey: `oneOne.gap.${gap.id}.label`,
        reasonKey: `oneOne.gap.${gap.id}.reason`,
        meta: attentionText(gap.count ? `${gap.count}` : agent.memory?.readiness?.status || "needs_context", 80),
        gapId: attentionText(gap.id, 80),
        promptKey: `oneOne.gap.${gap.id}.prompt`,
        action: isConfigGap
          ? employeeImprovementAction("edit_agent", `edit_agent:${agent.role}`, "Edit employee")
          : employeeImprovementAction("one_one", `one_one:${agent.role}:gap:${gap.id}`, "Coach in one one")
      });
    }
  }

  const sorted = items
    .filter((item) => item.role && (item.title || item.titleKey))
    .sort((left, right) =>
      improvementSeverityRank(left.severity) - improvementSeverityRank(right.severity) ||
      improvementKindRank(left.kind) - improvementKindRank(right.kind) ||
      String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || ""))
    );
  const visible = sorted.slice(0, limit);
  const affectedEmployees = new Set(sorted.map((item) => item.role).filter(Boolean));

  return {
    status: sorted.length ? "needs_attention" : "ready",
    total: sorted.length,
    affectedEmployees: affectedEmployees.size,
    counts: employeeImprovementCounts(sorted),
    items: visible
  };
}

async function buildAgentConfigs({ agentConfigStore, routingStore, toolRegistry, readModel }) {
  const agents = agentConfigStore?.list ? await agentConfigStore.list() : [];
  const publicTools = toolRegistry?.list ? visibleTools(toolRegistry.list()) : [];
  const hiddenToolIds = new Set((toolRegistry?.list ? toolRegistry.list() : [])
    .filter((tool) => tool?.implicit === true)
    .map((tool) => tool.id));
  const configuredAgents = await Promise.all(agents.map((agent) => attachAgentContext(agent, routingStore, readModel, hiddenToolIds)));
  return {
    agents: configuredAgents,
    summary: buildEmployeeConfigSummary(configuredAgents),
    tools: publicTools
  };
}

function fallbackModelProviders(config = {}) {
  const providerId = config.provider?.id || config.runner?.type;
  return {
    defaultProviderId: providerId && providerId !== "mock" ? providerId : undefined,
    providers: []
  };
}

function isVisibleEnabledProvider(provider = {}) {
  return provider.enabled !== false && provider.internal !== true && provider.type !== "mock" && provider.id !== "mock";
}

function statusFromCheck(check = {}) {
  if (check.status) return check.status;
  if (check.ok === true) return "ready";
  if (check.ok === false) return "failed";
  return "not_checked";
}

function isLocalDashboardMode(config = {}) {
  const host = String(config.host || "").trim().toLowerCase();
  return config.localMode === true || ["localhost", "127.0.0.1", "::1"].includes(host);
}

function isFeishuConnected(channel = {}) {
  const credentials = channel.credentials || {};
  const configured = credentials.appId?.configured && credentials.appSecret?.configured;
  return Boolean(channel.enabled && configured && !["needs_config", "disabled", "failed", "blocked"].includes(channel.status));
}

function buildSetupReadiness({ config = {}, agentConfigs = {}, modelProviders = {}, channels = [] }) {
  const providers = modelProviders.providers || [];
  const defaultProvider = providers.find((provider) => provider.id === modelProviders.defaultProviderId && isVisibleEnabledProvider(provider));
  const configuredAgent = (agentConfigs.agents || []).find((agent) => agent.modelProvider?.providerId && agent.modelProvider?.model);
  const providerCheck = defaultProvider?.health || modelProviders.health?.[defaultProvider?.id];
  const smokeMetadata = agentConfigs.oneOnOneSmoke || config.demoReadiness?.oneOnOneSmoke || (agentConfigs.agents || []).find((agent) => agent.oneOnOneSmoke)?.oneOnOneSmoke;
  const feishu = channels.find((channel) => channel.id === "feishu");
  const localDashboardMode = isLocalDashboardMode(config);
  const adminTokenMode = dashboardAdminTokenMode(config);
  const channelStatus = !feishu || feishu.enabled === false
    ? localDashboardMode ? "skipped" : "needs_setup"
    : isFeishuConnected(feishu)
      ? "ready"
      : feishu.status === "failed" || feishu.status === "blocked"
        ? "failed"
        : "needs_setup";

  const items = [
    {
      id: "admin_access",
      label: "Admin access",
      status: "ready",
      reason: adminTokenMode === "default"
        ? "Dashboard writes can use the default AI-team admin token."
        : "Dashboard writes can use the configured admin token."
    },
    {
      id: "default_provider",
      label: "Default Provider",
      status: defaultProvider ? "ready" : "needs_setup",
      reason: defaultProvider
        ? `${defaultProvider.name || defaultProvider.id} is enabled as the default Provider.`
        : "Choose an enabled non-internal default Provider.",
      action: defaultProvider ? { label: "Check Provider", target: `provider:${defaultProvider.id}` } : undefined
    },
    {
      id: "provider_check",
      label: "Provider check",
      status: providerCheck ? statusFromCheck(providerCheck) : "not_checked",
      reason: providerCheck?.message || "Run a Provider check before the demo.",
      action: defaultProvider ? { label: "Check Provider", target: `provider:${defaultProvider.id}` } : undefined
    },
    {
      id: "agent_binding",
      label: "Agent binding",
      status: configuredAgent ? "ready" : "needs_setup",
      reason: configuredAgent
        ? `${configuredAgent.name || configuredAgent.role} has a Provider and model.`
        : "Assign at least one Agent to a Provider and model."
    },
    {
      id: "one_on_one_smoke",
      label: "one one smoke",
      status: smokeMetadata ? statusFromCheck(smokeMetadata) : "not_checked",
      reason: smokeMetadata?.message || "Run a direct Agent turn before the demo.",
      action: configuredAgent ? { label: "Run smoke test", target: `smoke:${configuredAgent.role}` } : undefined
    },
    {
      id: "channel_readiness",
      label: "Channel readiness",
      status: channelStatus,
      reason: channelStatus === "ready"
        ? "Feishu is connected."
        : channelStatus === "skipped"
          ? "Feishu is disabled for local demo."
          : "Connect Feishu before using channel ingress."
    }
  ];

  const setupStatuses = new Set(["needs_setup", "missing_key", "needs_login", "not_checked"]);
  const overall = items.some((item) => item.status === "failed")
    ? "failed"
    : items.some((item) => setupStatuses.has(item.status))
      ? "needs_setup"
      : "ready";

  return { overall, items };
}

function agentFilterNames(agentConfigs = {}, workingAgents = []) {
  const rosterNames = buildEngineAgents({}, workingAgents, agentConfigs.agents).map((agent) => agent.name);
  const names = [
    ...rosterNames,
    ...(agentConfigs.agents || []).map((agent) => agent.name || agent.title || agent.role),
    ...(workingAgents || []).map((agent) => agent.name)
  ].map((name) => String(name || "").trim()).filter(Boolean);
  return ["All", ...new Set(names)];
}

async function buildEngineDashboardData({ config, channelConfigStore, engine, memory, agentConfigStore, routingStore, toolRegistry, providerConfigStore, codingAgentLauncherStore, readModel: resolvedReadModel }) {
  const rawReadModel = resolvedReadModel || await engineReadModel(engine);
  const readModel = {
    projects: rawReadModel?.projects || [],
    intents: rawReadModel?.intents || [],
    tasks: rawReadModel?.tasks || [],
    runs: rawReadModel?.runs || [],
    artifacts: rawReadModel?.artifacts || [],
    sessions: rawReadModel?.sessions || [],
    feedback: rawReadModel?.feedback || []
  };
  const health = typeof engine?.health === "function" ? await engine.health() : undefined;
  const agentConfigs = await buildAgentConfigs({ agentConfigStore, routingStore, toolRegistry, readModel });
  const rawColumns = buildEngineColumns(readModel);
  const rawWorkingAgents = buildWorkingAgents(readModel);
  const columns = applyConfiguredDisplayToColumns(rawColumns, agentConfigs.agents);
  const workingAgents = applyConfiguredDisplayToWorkingAgents(rawWorkingAgents, agentConfigs.agents);
  const modelProviders = providerConfigStore?.list ? await providerConfigStore.list() : fallbackModelProviders(config);
  const codingAgentLaunchers = codingAgentLauncherStore?.listPublic ? await codingAgentLauncherStore.listPublic() : [];
  const channels = channelConfigStore ? await channelConfigStore.listPublic() : [];
  const boardIntentIds = new Set(columns.flatMap((column) => (column.items || []).map((item) => item.intentId).filter(Boolean)));
  const contextRequests = buildAgentContextRequests(agentConfigs.agents, { readModel });
  const readiness = buildSetupReadiness({ config, agentConfigs, modelProviders, channels });
  const employeeImprovementPlan = buildEmployeeImprovementPlan(readModel, { agents: agentConfigs.agents, contextRequests });

  return {
    ok: true,
    mode: "read_only",
    service: "ai-team-agent",
    generatedAt: new Date().toISOString(),
    nav: ["Overview", "Team", "Evidence", "Intake", "Projects", "Settings"],
    filters: agentFilterNames(agentConfigs, workingAgents),
    engine: {
      snapshot: sanitizeEngineSnapshot(readModel),
      health
    },
    agents: buildEngineAgents(readModel, workingAgents, agentConfigs.agents),
    workingAgents,
    counts: {
      items: columns.reduce((sum, column) => sum + column.count, 0),
      intents: readModel.intents.length,
      tasks: readModel.tasks.length,
      pending: readModel.intents.filter((intent) => intent.status === "new" || intent.status === "routing").length,
      running:
        readModel.intents.filter((intent) => intent.status === "in_progress").length +
        readModel.tasks.filter((task) => ["waiting", "working", "testing", "deploying", "worked", "tested"].includes(task.status)).length,
      completed: readModel.intents.filter((intent) => intent.status === "done").length + readModel.tasks.filter((task) => task.status === "done").length,
      failed: readModel.intents.filter((intent) => intent.status === "blocked").length + readModel.tasks.filter((task) => task.status === "blocked").length,
      feedback: readModel.feedback.length,
      runs: readModel.runs.length
    },
    projects: buildProjectCards(readModel),
    columns,
    clients: buildEngineClients(readModel),
    agentConfigs,
    contextRequests,
    ownerAttention: buildOwnerAttention(readModel, { contextRequests, readiness }),
    employeeImprovementPlan,
    modelProviders,
    codingAgentLaunchers,
    readiness,
    evidence: {
      dossiers: buildEvidenceDossiers(readModel, { includeIntentIds: boardIntentIds }),
      summary: buildEngineReports(readModel)
    },
    knowledge: await buildKnowledge(memory),
    reports: buildEngineReports(readModel),
    channels,
    settings: {
      runner: config.runner.type,
      provider: config.provider?.id || config.runner.type,
      model: config.provider?.model,
      toolPolicy: config.toolPolicy || {},
      workspace: config.workspace,
      projectWorkspaceRoot: config.projectWorkspaceRoot,
      pollIntervalMs: config.pollIntervalMs,
      feedbackScanIntervalMs: config.feedbackScanIntervalMs,
      publicBaseUrl: config.publicBaseUrl,
      adminTokenConfigured: Boolean(effectiveDashboardAdminToken(config)),
      adminTokenMode: dashboardAdminTokenMode(config)
    }
  };
}

export async function buildDashboardData({ config, channelConfigStore, engine, memory, agentConfigStore, routingStore, toolRegistry, providerConfigStore, codingAgentLauncherStore }) {
  const resolvedReadModel = await engineReadModel(engine);
  return buildEngineDashboardData({ config, channelConfigStore, engine, memory, agentConfigStore, routingStore, toolRegistry, providerConfigStore, codingAgentLauncherStore, readModel: resolvedReadModel });
}
