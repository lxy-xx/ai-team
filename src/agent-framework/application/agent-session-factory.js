import { ContextBlock, estimateTokens } from "../domain/context/context-block.js";
import { ContextBudget } from "../domain/context/context-budget.js";

export { estimateTokens };

function block(input) {
  return ContextBlock.from(input);
}

function formatLongTermFacts(facts = []) {
  if (!facts.length) return "No selected long-term memory.";
  return facts.map((fact) => `- ${fact.key || fact.id}: ${fact.text || JSON.stringify(fact.value)}`).join("\n");
}

function formatOpenContextNeeds(needs = []) {
  if (!needs.length) return "No open Agent context needs.";
  return needs.map((need) => {
    const head = `[${need.priority || "medium"}] ${need.category || "context"}: ${need.question || ""}`;
    const details = [
      need.whyItMatters ? `why: ${need.whyItMatters}` : "",
      need.suggestedMemoryKind ? `suggested memory: ${need.suggestedMemoryKind}` : "",
      need.relatedTaskId ? `related task: ${need.relatedTaskId}` : ""
    ].filter(Boolean);
    return details.length ? `- ${head}\n  ${details.join("\n  ")}` : `- ${head}`;
  }).join("\n");
}

function compactLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatSkillsMetadata(skills = []) {
  const entries = (Array.isArray(skills) ? skills : [])
    .map((skill) => {
      const name = compactLine(skill?.name || skill?.id);
      if (!name) return undefined;
      const description = compactLine(skill?.description) || "No description provided.";
      return `- ${name}: ${description}`;
    })
    .filter(Boolean);
  if (!entries.length) return "";
  return ["Installed Skills", ...entries].join("\n");
}

function mergeAdjacentMessages(messages = []) {
  const merged = [];
  for (const message of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) {
      last.content = [last.content, message.content].filter(Boolean).join("\n\n");
      continue;
    }
    merged.push({ ...message });
  }
  return merged;
}

export class AgentSessionFactory {
  build({ profile = {}, inputText, longTermFacts = [], openContextNeeds = [], recentSummary = "", toolProtocolText = "", workspace = "" }) {
    return [
      block({
        id: "runtime.system",
        type: "runtime_instructions",
        role: "system",
        priority: 100,
        cacheClass: "stable",
        compressible: false,
        droppable: false,
        content: [
          "You are running inside the AI Team Agent Framework.",
          "Use the current assignment as the only semantic task input.",
          "Use tools only through the provided tool call interface.",
          workspace ? "" : undefined,
          workspace ? "## Workspace" : undefined,
          workspace ? `Current workspace: ${workspace}` : undefined,
          workspace ? "Use Bash from this workspace by default for file inspection, edits, tests, logs, and local commands." : undefined,
          workspace ? "Do not claim a file changed, a command ran, or a test passed unless Bash or tool evidence supports it." : undefined
        ].filter((line) => line !== undefined).join("\n")
      }),
      block({
        id: "agent.agents_md",
        type: "agent_prompt",
        role: "system",
        priority: 98,
        cacheClass: "stable",
        compressible: false,
        droppable: false,
        content: profile.prompt || ""
      }),
      formatSkillsMetadata(profile.skills) ? block({
        id: "skills.metadata",
        type: "skills_metadata",
        role: "system",
        priority: 96,
        cacheClass: "stable",
        compressible: false,
        droppable: false,
        content: formatSkillsMetadata(profile.skills)
      }) : undefined,
      block({
        id: "memory.long_term.selected",
        type: "long_term_memory",
        role: "system",
        priority: 88,
        cacheClass: "dynamic",
        compressible: false,
        droppable: false,
        content: formatLongTermFacts(longTermFacts)
      }),
      block({
        id: "memory.context_needs.open",
        type: "context_needs",
        role: "system",
        priority: 86,
        cacheClass: "dynamic",
        compressible: false,
        droppable: false,
        content: formatOpenContextNeeds(openContextNeeds)
      }),
      block({
        id: "memory.episodic.recent_summary",
        type: "episodic_summary",
        role: "system",
        priority: 44,
        cacheClass: "dynamic",
        compressible: true,
        droppable: true,
        content: recentSummary || ""
      }),
      toolProtocolText ? block({
        id: "tool.protocol",
        type: "tool_protocol",
        role: "system",
        priority: 94,
        cacheClass: "stable",
        compressible: false,
        droppable: false,
        content: toolProtocolText
      }) : undefined,
      block({
        id: "assignment.current",
        type: "assignment",
        role: "user",
        priority: 100,
        cacheClass: "dynamic",
        compressible: false,
        droppable: false,
        content: inputText
      })
    ].filter(Boolean);
  }

  applyBudget(blocks = [], limits = {}) {
    return new ContextBudget(limits).apply(blocks);
  }

  messagesFor(blocks = [], { includeStable = true } = {}) {
    const messages = blocks
      .filter((item) => item.retained !== false)
      .filter((item) => includeStable || item.cacheClass !== "stable")
      .filter((item) => item.content.trim())
      .map((item) => ({
        role: item.role,
        content: [`## ${item.id}`, item.content].join("\n")
      }));
    return mergeAdjacentMessages(messages);
  }

  metadataFor(blocks = []) {
    return blocks.map(({ content, ...item }) => ({
      ...item,
      contentPreview: content.slice(0, 500)
    }));
  }
}
