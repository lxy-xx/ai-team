import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_AGENT_ROSTER } from "../domain/agent-roster.js";
import { getRole } from "../domain/roles.js";
import { ensureDir } from "../../platform/json-file.js";

export const DEFAULT_AGENT_PROFILE_TOOLS = {
  ceo_cto: ["skill", "memory.search", "memory.write", "engine.projects", "engine.create_intent", "engine.transition", "engine.retry_blocked", "Bash", "scheduler.inspect", "channel.reply"],
  product_manager: ["skill", "memory.search", "engine.transition", "Bash", "channel.reply"],
  engineer: ["skill", "memory.search", "memory.write", "engine.transition", "Bash", "coding_agent.start", "coding_agent.status", "coding_agent.wait", "coding_agent.cancel"],
  qa: ["skill", "memory.search", "engine.transition", "Bash"],
  customer_success: ["skill", "memory.search", "engine.transition", "channel.reply"],
  operations: ["skill", "memory.search", "memory.write", "engine.projects", "engine.transition", "engine.retry_blocked", "scheduler.inspect", "Bash"]
};

const CODING_AGENT_DELEGATION_SKILL = {
  id: "coding-agent-delegation",
  description: "Delegate every code or configuration change to Coding Agents from an explicit project workspace.",
  content: [
    "# coding-agent-delegation",
    "",
    "Use this skill whenever Ada needs code, configuration, script, document, or runtime config changes.",
    "",
    "## Hard Boundary",
    "",
    "- Ada coordinates engineering work but must not directly edit files or configuration.",
    "- Any write-like action must be performed by a configured Coding Agent.",
    "- Ada may inspect files, search code, read diffs, run tests, check status, and summarize results.",
    "- Ada must not use shell redirection, `sed -i`, editor commands, one-off write scripts, or direct file mutation as a shortcut.",
    "- This skill requires an explicit project workspace. Do not launch a Coding Agent from the AI Team control repository or the current process cwd unless that path is explicitly the assignment workspace.",
    "",
    "## Available Coding Agents",
    "",
    "- `implementer`: makes scoped code/config changes and runs focused verification.",
    "- `spec-reviewer`: checks whether a completed change satisfies the task, constraints, and acceptance criteria.",
    "- `code-quality-reviewer`: reviews maintainability, regressions, ownership boundaries, and test gaps.",
    "- `verification-runner`: runs targeted test/build/browser checks and reports evidence without expanding scope.",
    "",
    "These are prompt roles for configured Coding Agents. Choose the role explicitly in the prompt.",
    "",
    "## Invocation",
    "",
    "Before launch, identify the absolute project workspace from the TeamEngine assignment. If no workspace is present, ask for or retrieve the correct workspace first; do not guess from `pwd`, process cwd, or the AI Team control repository.",
    "",
    "Launch Coding Agents with `coding_agent.start` and include the same workspace path in the Coding Agent prompt:",
    "",
    "```text",
    "Workspace: /absolute/project/workspace",
    "You are an implementer Coding Agent. Scope: ... Constraints: ... Acceptance: ... Verification: ...",
    "```",
    "",
    "For Coding Agent launches that may run long or run in parallel:",
    "",
    "- use `coding_agent.start` with `workspace` set to the explicit project workspace and the full assignment as `prompt`;",
    "- do not pass a short `timeoutMs` to `coding_agent.start` as a waiting strategy; use `coding_agent.wait` when Ada needs results;",
    "- keep every returned job id and map it to the delegated scope;",
    "- use `coding_agent.status` to inspect running jobs and default tail logs without flooding context;",
    "- use `coding_agent.wait` with one or more job ids before final review;",
    "- use `logMode=full`, `cursor`, or `fromLine/toLine` only when the tail is not enough to diagnose or review;",
    "- use `coding_agent.cancel` only for an explicit job id, or for `state=running` when intentionally cancelling all running delegated jobs for this role.",
    "",
    "A good Coding Agent prompt is self-contained and includes:",
    "",
    "- the exact workspace path the Coding Agent must work in;",
    "- exact objective and files/modules likely involved;",
    "- what the agent may change and what it must not touch;",
    "- whether it may run tests or browser checks;",
    "- expected final report format: changed files, verification, risks.",
    "",
    "## Parallelism",
    "",
    "- Ada may dispatch up to 8 Coding Agents concurrently when tasks are independent.",
    "- Give each concurrent agent a non-overlapping file/module scope.",
    "- If agents would edit the same files, depend on each other, or share mutable state, run them sequentially.",
    "- After agents finish, Ada must review their diffs before accepting the work.",
    "",
    "## Completion",
    "",
    "Ada owns final integration judgment: inspect `git diff`, run the necessary verification, request rework through another Coding Agent when needed, and only then report the implementation result."
  ].join("\n")
};

const TASK_GRAPH_CONTRACT_SKILL = {
  id: "task-graph-contract",
  description: "Generate Engine-consumable task_graph artifacts without routing hints or worker names.",
  content: [
    "# task-graph-contract",
    "",
    "Use this skill whenever a product manager consumes a new Engine intent and needs to create the task graph.",
    "",
    "## Contract",
    "",
    "- Return one top-level JSON object with `kind: \"task_graph\"`.",
    "- Do not wrap the graph inside `agent_output`, `message`, `data`, or another envelope.",
    "- `tasks` must be a non-empty array.",
    "- Each task must include `id`, `title`, `description`, `dependencies`, and `acceptanceCriteria`.",
    "- `dependencies` contains only task IDs from the same graph.",
    "- `acceptanceCriteria` should be concrete checks, not vague intentions.",
    "- Do not include worker names, Agent roles, `consumerRole`, `assignee`, `owner`, `requiredCapabilities`, or routing hints. Engine routing selects workers from the task entity.",
    "- Do not create standalone QA tasks. QA is woken by the Engine when an implementation task enters `testing`.",
    "",
    "## Task Shape",
    "",
    "Prefer small implementation tasks that can finish independently and leave a useful artifact. Split by deliverable or dependency, not by employee.",
    "",
    "Good task IDs are stable local slugs, for example `build_game_shell` or `wire_score_state`.",
    "",
    "## Example",
    "",
    "```json",
    "{",
    "  \"kind\": \"task_graph\",",
    "  \"tasks\": [",
    "    {",
    "      \"id\": \"build_static_game_shell\",",
    "      \"title\": \"搭建贪吃蛇网页项目骨架\",",
    "      \"description\": \"创建可直接在浏览器打开的 HTML/CSS/JS 页面，包含游戏画布、分数区域、开始和重置控制。\",",
    "      \"dependencies\": [],",
    "      \"acceptanceCriteria\": [",
    "        \"页面可以独立打开并看到游戏区域\",",
    "        \"开始和重置控件在桌面与移动视口下可用\"",
    "      ]",
    "    },",
    "    {",
    "      \"id\": \"implement_snake_loop\",",
    "      \"title\": \"实现贪吃蛇核心循环\",",
    "      \"description\": \"实现蛇移动、食物生成、碰撞判定、得分更新和游戏结束状态。\",",
    "      \"dependencies\": [\"build_static_game_shell\"],",
    "      \"acceptanceCriteria\": [",
    "        \"方向键或等效控件可以改变蛇的方向\",",
    "        \"吃到食物后分数增加且蛇身变长\",",
    "        \"撞墙或撞到自身后进入游戏结束状态\"",
    "      ]",
    "    }",
    "  ]",
    "}",
    "```"
  ].join("\n")
};

const BLOCKER_DIAGNOSIS_SKILL = {
  id: "blocker-diagnosis",
  description: "Diagnose blocked Engine work from read-only ai-team repo evidence before replying to users.",
  content: [
    "# blocker-diagnosis",
    "",
    "Use this skill when CEO/CTO is asked why an intent is blocked, whether continuing is safe, or what should happen next after a blocked run.",
    "",
    "## Boundary",
    "",
    "- Diagnose from evidence before replying. Do not guess from a dashboard label alone.",
    "- Read only. Do not edit files, retry work, mutate Engine state, or change configuration unless the user explicitly asks for that separate action.",
    "- Only inspect the ai-team control repository and its Engine/runtime records.",
    "- If the repository path cannot be found, say that path discovery failed and explain which evidence was unavailable.",
    "",
    "## Locate The Control Repository",
    "",
    "The ai-team repo path can differ by deployment. Locate it dynamically:",
    "",
    "1. Prefer the current working directory when it has `package.json`, `src/index.js`, and `data/engine`.",
    "2. Else check `AI_TEAM_CONTROL_WORKSPACE` if set and it has the same markers.",
    "3. Else check `AI_TEAM_WORKSPACE` if set and it has the same markers.",
    "4. Else walk upward from the current working directory until you find those markers.",
    "5. If none are found, use only the Engine/project facts already present in the assignment and state that local repo evidence was unavailable.",
    "",
    "Treat a matching `package.json` name of `ai-team-agent` as strong confirmation, but rely on the marker files above so renamed deployments still work.",
    "",
    "## Evidence Checklist",
    "",
    "Inspect the smallest set needed to explain the real blocker:",
    "",
    "- `data/engine/intents/<intentId>.json` for current status, blocked reason, and linked entities.",
    "- `data/engine/tasks/*.json` filtered by intent/project when the blocker is task-related.",
    "- `data/engine/runs/<runId>.json` for agent role, status, snapshot, provider/model, submitted output, and trace/session IDs.",
    "- `data/engine/artifacts/<intentId|taskId>/<artifactId>.json` for produced artifact kind and payload.",
    "- The referenced trace/session under `agent-workspace/agents/<Agent>/` when run evidence is not enough.",
    "- Source files only when explaining a validation rule or system contract, for example the task graph validator.",
    "",
    "## Reply Shape",
    "",
    "Tell the user:",
    "",
    "- the specific blocker cause in plain language;",
    "- the evidence that proves it, including entity/run/artifact IDs when helpful;",
    "- whether clicking continue/retry is likely to help as-is;",
    "- the smallest configuration or workflow correction needed next.",
    "",
    "Example diagnosis: the product manager returned a top-level `agent_output` artifact with a nested `task_graph`, but Engine requires the artifact itself to be `kind: \"task_graph\"`; retrying without correcting the product manager output contract is likely to block the same way again."
  ].join("\n")
};

export const DEFAULT_AGENT_PROFILE_OUTPUTS = {
  product_manager: {
    artifactKind: "task_graph",
    contract: [
      'Required JSON shape: { "kind": "task_graph", "tasks": [...] }.',
      'Each task must include: "id", "title", "description", "dependencies", and "acceptanceCriteria".',
      "Do not include worker names, Agent roles, consumerRole, assignee, owner, requiredCapabilities, or routing hints; Engine routing selects workers from the task entity.",
      'Do not create standalone QA tasks; QA is woken by the Engine when an implementation task enters "testing".'
    ]
  },
  engineer: {
    artifactKind: "implementation_report",
    transcriptPrefix: "Implementation completed.\n",
    contract: [
      'Required JSON shape: { "kind": "implementation_report", "taskId": "...", "summary": "...", "changedFiles": [...], "verification": [...] }.',
      'When reworking a QA rejection, include "addressedRejectionArtifactId" when available.'
    ]
  },
  qa: {
    artifactKind: "verification_report",
    verdictPattern: "^\\s*VERDICT:\\s*(pass|reject)\\b",
    verdictPatternFlags: "im",
    contract: [
      'Required JSON shape: { "kind": "verification_report", "taskId": "...", "verdict": "pass"|"reject", "findings": [...], "checks": [...], "message": "..." }.',
      'The verdict must be a top-level field; do not put VERDICT only inside message.',
      'Use verdict "reject" only for actionable gaps that require the same task to be reworked.'
    ]
  },
  customer_success: {
    artifactKind: "customer_reply",
    contract: [
      'Required JSON shape: { "kind": "customer_reply", "taskId": "...", "message": "...", "unresolvedRisks": [...] }.'
    ]
  },
  operations: {
    artifactKind: "operations_runbook_note",
    contract: [
      'Required JSON shape: { "kind": "operations_runbook_note", "taskId": "...", "message": "...", "checks": [...] }.'
    ]
  },
  ceo_cto: {
    artifactKind: "final_aggregation",
    contract: [
      'Required JSON shape: { "kind": "final_aggregation", "message": "...", "sourceArtifactIds": [...] }.',
      'The "message" field is the final user-facing summary.'
    ]
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const DEFAULT_AGENT_PROFILES = Object.entries(DEFAULT_AGENT_ROSTER).map(([role, roster]) => {
  const roleDefaults = getRole(role);
  return {
    role,
    name: roster.name,
    title: roleDefaults.title,
    prompt: roleDefaults.prompt,
    tools: DEFAULT_AGENT_PROFILE_TOOLS[role] || [],
    output: DEFAULT_AGENT_PROFILE_OUTPUTS[role] || {}
  };
});

export function defaultAgentProfileForRole(role) {
  const profile = DEFAULT_AGENT_PROFILES.find((candidate) => candidate.role === role);
  return profile ? clone(profile) : undefined;
}

const DEFAULT_AGENT_ONBOARDING_KEY = "defaultAgentProfiles";

const DEFAULT_AGENT_PROFILE_SKILLS = {
  ceo_cto: [BLOCKER_DIAGNOSIS_SKILL],
  product_manager: [TASK_GRAPH_CONTRACT_SKILL],
  engineer: [CODING_AGENT_DELEGATION_SKILL]
};

function defaultProfileSkills(profile = {}) {
  return DEFAULT_AGENT_PROFILE_SKILLS[profile.role] || [];
}

function skillMarkdown(skill) {
  return [
    "---",
    `name: ${skill.id}`,
    `description: ${skill.description}`,
    "---",
    "",
    skill.content
  ].join("\n");
}

async function seedDefaultProfileSkills(agentConfigStore, profile = {}) {
  const skills = defaultProfileSkills(profile);
  if (!skills.length || !agentConfigStore?.pathsFor) return;
  const paths = agentConfigStore.pathsFor(profile.role, profile);
  await ensureDir(paths.skillsDir);
  for (const skill of skills) {
    const skillDir = path.join(paths.skillsDir, skill.id);
    try {
      await fs.access(path.join(skillDir, "SKILL.md"));
      continue;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await ensureDir(skillDir);
    await fs.writeFile(path.join(skillDir, "SKILL.md"), `${skillMarkdown(skill)}\n`, "utf8");
  }
}

export async function onboardDefaultAgentProfiles({ agentConfigStore, profiles = DEFAULT_AGENT_PROFILES, onboardingStateStore } = {}) {
  if (!agentConfigStore) throw new Error("onboardDefaultAgentProfiles requires agentConfigStore");
  if (!onboardingStateStore?.has || !onboardingStateStore?.mark) {
    throw new Error("onboardDefaultAgentProfiles requires onboardingStateStore");
  }
  const alreadySeeded = await onboardingStateStore?.has?.(DEFAULT_AGENT_ONBOARDING_KEY);
  if (!alreadySeeded) {
    const existing = await agentConfigStore.list?.() || [];
    if (existing.length) {
      await onboardingStateStore.mark(DEFAULT_AGENT_ONBOARDING_KEY, {
        version: 1,
        inferred: true,
        existingRoles: existing.map((agent) => agent.role).filter(Boolean)
      });
    } else {
      const legacyConfigs = await agentConfigStore.readLegacyConfigs?.() || {};
      const seededRoles = [];
      for (const profile of profiles) {
        if (!profile?.role) continue;
        if (await agentConfigStore.hasRole(profile.role)) continue;
        await agentConfigStore.ensureRoleDirectory(profile.role, legacyConfigs[profile.role], profile);
        await seedDefaultProfileSkills(agentConfigStore, profile);
        seededRoles.push(profile.role);
      }
      await onboardingStateStore.mark(DEFAULT_AGENT_ONBOARDING_KEY, {
        version: 1,
        seededRoles
      });
    }
  }
  await agentConfigStore.loadRoleDirectoryIndex?.();
  await agentConfigStore.applyToolOverrides?.();
  return agentConfigStore.list?.();
}
