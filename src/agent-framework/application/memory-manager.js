function section(title, rows) {
  if (!rows.length) return `## ${title}\nNone.`;
  return `## ${title}\n${rows.map((row, index) => `${index + 1}. ${row}`).join("\n")}`;
}

const EMPTY_CONTEXT = Object.freeze({
  semantic: [],
  episodic: [],
  procedural: [],
  combined: []
});

function queryForTask(task = {}) {
  return [
    task.text,
    task.title,
    task.description,
    task.goal,
    task.intent?.goal
  ]
    .filter(Boolean)
    .join("\n");
}

export class MemoryManager {
  constructor({ memory }) {
    this.memory = memory;
  }

  async buildContext({ task, limit = 8 }) {
    if (!this.memory?.searchLayer) return { ...EMPTY_CONTEXT };
    const query = queryForTask(task);
    const [semantic, episodic, procedural] = await Promise.all([
      this.memory.searchLayer("semantic", query, limit),
      this.memory.searchLayer("episodic", query, limit),
      this.memory.searchLayer("procedural", query, limit)
    ]);

    return {
      semantic,
      episodic,
      procedural,
      combined: [...semantic, ...episodic, ...procedural]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
    };
  }

  format(context = EMPTY_CONTEXT) {
    const safe = {
      semantic: context?.semantic || [],
      episodic: context?.episodic || [],
      procedural: context?.procedural || []
    };
    return [
      section(
        "Semantic Memory",
        safe.semantic.map((item) => `[${item.id}] ${item.text}`)
      ),
      section(
        "Episodic Memory",
        safe.episodic.map((item) => `[${item.id}] ${item.text}`)
      ),
      section(
        "Procedural Memory",
        safe.procedural.map((item) => `[${item.id}] ${item.text}`)
      )
    ].join("\n\n");
  }
}
