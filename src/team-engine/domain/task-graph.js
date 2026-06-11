function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

const TASK_GRAPH_KINDS = new Set(["task_graph"]);

export class TaskGraph {
  constructor(graph) {
    this.graph = graph;
  }

  get tasks() {
    return Array.isArray(this.graph?.tasks) ? this.graph.tasks : [];
  }

  validate() {
    if (!TASK_GRAPH_KINDS.has(this.graph?.kind)) return "Product manager did not return a task_graph artifact";
    if (!Array.isArray(this.graph.tasks)) return "task_graph tasks must be an array";
    if (this.graph.tasks.length === 0) return "task_graph must include at least one task";

    const { referenceIndexes, referenceTokens } = this.referenceMaps();
    const dependencyIndexes = this.graph.tasks.map(() => []);
    for (const [index, task] of this.graph.tasks.entries()) {
      const label = nonEmptyString(task?.title) ? task.title : `task[${index}]`;
      if (!nonEmptyString(task?.title)) return `${label} must include a non-empty title`;
      if (!nonEmptyString(task?.description)) return `${label} must include a non-empty description`;
      if (Object.hasOwn(task, "consumerRole")) {
        return `${label} must not include consumerRole; Engine routing selects workers`;
      }
      if (task.dependencies !== undefined && !Array.isArray(task.dependencies)) {
        return `${label} dependencies must be an array`;
      }
      for (const dependency of task.dependencies || []) {
        if (!referenceTokens.has(dependency)) return `${label} has unknown dependency: ${dependency}`;
        if (referenceTokens.get(dependency) > 1) return `${label} has ambiguous dependency: ${dependency}`;
        const dependencyIndex = referenceIndexes.get(dependency);
        if (dependencyIndex === index) return `${label} has self dependency: ${dependency}`;
        dependencyIndexes[index].push(dependencyIndex);
      }
    }

    if (this.hasDependencyCycle(dependencyIndexes)) return "task_graph contains a dependency cycle";
    return undefined;
  }

  dependencyMapFor(createdTasks) {
    const tokens = new Map();
    for (const [index, graphTask] of this.tasks.entries()) {
      const createdTask = createdTasks[index];
      for (const token of this.tokensFor(graphTask)) {
        if (!tokens.has(token)) tokens.set(token, createdTask.id);
      }
    }
    return tokens;
  }

  referenceMaps() {
    const referenceTokens = new Map();
    const referenceIndexes = new Map();
    for (const [index, task] of this.tasks.entries()) {
      for (const token of this.tokensFor(task)) {
        referenceTokens.set(token, (referenceTokens.get(token) || 0) + 1);
        referenceIndexes.set(token, index);
      }
    }
    return { referenceIndexes, referenceTokens };
  }

  tokensFor(task) {
    return [...new Set([task?.id, task?.title].filter(nonEmptyString))];
  }

  hasDependencyCycle(dependencyIndexes) {
    const visiting = new Set();
    const visited = new Set();
    const visit = (index) => {
      if (visiting.has(index)) return true;
      if (visited.has(index)) return false;
      visiting.add(index);
      for (const dependencyIndex of dependencyIndexes[index]) {
        if (visit(dependencyIndex)) return true;
      }
      visiting.delete(index);
      visited.add(index);
      return false;
    };
    return dependencyIndexes.some((_, index) => visit(index));
  }
}
