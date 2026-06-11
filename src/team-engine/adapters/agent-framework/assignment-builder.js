function textPreview(value, limit = 1000) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)} [truncated ${text.length - limit} chars]` : text;
}

function compactArray(values = [], limit = 8) {
  return (Array.isArray(values) ? values : []).slice(0, limit).map((item) => {
    if (typeof item === "string") return textPreview(item, 500);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, typeof value === "string" ? textPreview(value, 500) : value]));
  });
}

function summarizeIntent(intent = {}) {
  return Object.fromEntries(Object.entries({
    id: intent.id,
    status: intent.status,
    projectId: intent.projectId || intent.context?.projectId,
    projectName: intent.projectName || intent.context?.projectName,
    goal: textPreview(intent.goal || intent.text || intent.description, 1800),
    priority: intent.priority,
    constraints: compactArray(intent.constraints, 8),
    acceptanceCriteria: compactArray(intent.acceptanceCriteria, 8),
    source: intent.source ? {
      channel: intent.source.channel,
      threadId: intent.source.threadId,
      userId: intent.source.userId
    } : undefined
  }).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length)));
}

function summarizeTask(task = {}) {
  if (!task) return undefined;
  return Object.fromEntries(Object.entries({
    id: task.id,
    status: task.status,
    title: textPreview(task.title, 500),
    description: textPreview(task.description || task.text, 1800),
    consumerRole: task.consumerRole,
    projectId: task.projectId,
    projectName: task.projectName,
    dependencies: compactArray(task.dependencies, 20),
    acceptanceCriteria: compactArray(task.acceptanceCriteria, 8),
    blocker: task.blocker ? textPreview(task.blocker.reason || task.blocker.message || JSON.stringify(task.blocker), 1000) : undefined
  }).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length)));
}

function summarizeArtifactData(data = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { preview: textPreview(data, 1200) };
  return Object.fromEntries(Object.entries({
    kind: data.kind,
    taskId: data.taskId,
    verdict: data.verdict,
    summary: textPreview(data.summary || data.message || data.finalMessage, 1800),
    changedFiles: compactArray(data.changedFiles, 20),
    verification: compactArray(data.verification, 8),
    findings: compactArray(data.findings, 8),
    checks: compactArray(data.checks, 8),
    sourceArtifactIds: compactArray(data.sourceArtifactIds, 20),
    tasks: Array.isArray(data.tasks)
      ? data.tasks.slice(0, 12).map((task) => summarizeTask(task))
      : undefined,
    dataKeys: Object.keys(data).slice(0, 30),
    payload: "payload omitted; request artifact details through an audited tool if exact contents are needed"
  }).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length)));
}

function summarizeArtifact(artifact = {}) {
  return Object.fromEntries(Object.entries({
    id: artifact.id,
    kind: artifact.kind || artifact.data?.kind,
    role: artifact.role,
    taskId: artifact.taskId || artifact.entityId || artifact.data?.taskId,
    createdAt: artifact.createdAt,
    data: summarizeArtifactData(artifact.data)
  }).filter(([, value]) => value !== undefined));
}

export class AssignmentBuilder {
  buildAgentRuntimeAssignment({ role, intent, task, entity, entityType, previousArtifacts = [], run, profile }) {
    return [
      "You are executing one TeamEngine assignment.",
      "",
      "## Current assignment",
      `Role: ${role}`,
      `Agent role: ${role}`,
      `Engine entity type: ${entityType}`,
      `Engine entity id: ${entity?.id || ""}`,
      `Engine run id: ${run?.id || ""}`,
      task ? `Task id: ${task.id}` : undefined,
      `Intent id: ${intent?.id || ""}`,
      intent?.projectName || task?.projectName ? `Project: ${task?.projectName || intent?.projectName}` : undefined,
      task?.workspace || intent?.workspace || intent?.context?.workspace ? `Workspace: ${task?.workspace || intent?.workspace || intent?.context?.workspace}` : undefined,
      "",
      "## Expected final output",
      this.outputContractFor(role, profile),
      "",
      "## Intent",
      JSON.stringify(summarizeIntent(intent), null, 2),
      task ? "\n## Task" : undefined,
      task ? JSON.stringify(summarizeTask(task), null, 2) : undefined,
      "",
      "## Previous Engine Artifacts",
      JSON.stringify((Array.isArray(previousArtifacts) ? previousArtifacts : []).map(summarizeArtifact), null, 2)
    ]
      .filter((line) => line !== undefined)
      .join("\n");
  }

  buildStaticPrompt({ role, intent, task, turn, backendBoundary }) {
    const roleConfig = turn?.profile || {};
    return [
      roleConfig.prompt,
      "",
      this.outputContractFor(role, roleConfig),
      backendBoundary ? "\n" + backendBoundary : undefined,
      "",
      "## Intent",
      JSON.stringify(summarizeIntent(intent), null, 2),
      task ? "\n## Task" : undefined,
      task ? JSON.stringify(summarizeTask(task), null, 2) : undefined
    ]
      .filter((line) => line !== undefined)
      .join("\n");
  }

  buildRuntimePrompt({ previousArtifacts, turn }) {
    const memoryText = turn?.memoryText || "";
    const sessionText = turn?.sessionText || "";
    const fallbackContext = !memoryText && !sessionText ? turn?.context || "" : "";
    return [
      "## Previous Artifacts",
      JSON.stringify((Array.isArray(previousArtifacts) ? previousArtifacts : []).map(summarizeArtifact), null, 2),
      memoryText ? "\n" + memoryText : undefined,
      sessionText ? "\n" + sessionText : undefined,
      fallbackContext ? "\n" + fallbackContext : undefined
    ]
      .filter((line) => line !== undefined)
      .join("\n");
  }

  outputContractFor(role, profile = {}) {
    const configuredContract = Array.isArray(profile?.output?.contract)
      ? profile.output.contract.map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    return [
      "You are executing one Engine assignment.",
      "Return exactly one JSON object as the entire assistant message. Do not return Markdown, prose, bullet lists, or multiple JSON objects.",
      'Every response object must include a string "kind" field. Put human-readable text in fields such as "summary" or "message".',
      ...(configuredContract.length ? configuredContract : ['Required JSON shape: { "kind": "agent_output", "message": "..." }.'])
    ].join("\n");
  }

  hostContextForRun({ run, entityType, entityId, intent, task }) {
    return Object.fromEntries(Object.entries({
      engineRunId: run?.id,
      engineEntityType: entityType,
      engineEntityId: entityId,
      intentId: intent?.id,
      taskId: task?.id,
      projectId: task?.projectId || intent?.projectId || intent?.context?.projectId,
      projectName: task?.projectName || intent?.projectName || intent?.context?.projectName,
      workspace: task?.workspace || intent?.workspace || intent?.context?.workspace
    })
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]));
  }

  agentConfigSnapshot(turn = {}) {
    const profile = turn.profile || {};
    return {
      role: turn.role || turn.agentId,
      title: profile.title,
      prompt: profile.prompt,
      modelProvider: profile.modelProvider,
      output: profile.output,
      skills: profile.skills || [],
      mcps: profile.mcps || [],
      tools: (turn.tools || []).map((tool) => ({
        id: tool.id,
        category: tool.category,
        risk: tool.risk,
        policy: tool.policy
      }))
    };
  }

  summarizeTurnForEnvelope(turn = {}) {
    return {
      agentId: turn.agentId,
      sessionId: turn.sessionId,
      toolIds: (turn.tools || []).map((tool) => tool.id),
      hasMemoryContext: Boolean(
        turn.memoryContext &&
        ((turn.memoryContext.semantic || []).length ||
          (turn.memoryContext.episodic || []).length ||
          (turn.memoryContext.procedural || []).length)
      )
    };
  }
}
