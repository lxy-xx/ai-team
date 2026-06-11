import test from "node:test";
import assert from "node:assert/strict";
import { TaskGraph } from "../src/team-engine/domain/task-graph.js";

function graph(tasks) {
  return {
    kind: "task_graph",
    tasks
  };
}

function validTask(patch = {}) {
  return {
    id: "impl",
    title: "Implement feature",
    description: "Build the requested feature.",
    dependencies: [],
    acceptanceCriteria: [],
    ...patch
  };
}

function validationReason(input) {
  return new TaskGraph(input).validate();
}

test("TaskGraph rejects invalid artifact kind", () => {
  assert.equal(
    validationReason({ kind: "other", tasks: [validTask()] }),
    "Product manager did not return a task_graph artifact"
  );
});

test("TaskGraph accepts task_graph artifacts", () => {
  assert.equal(validationReason({ kind: "task_graph", tasks: [validTask()] }), undefined);
});

test("TaskGraph rejects missing, non-array, and empty tasks", () => {
  assert.equal(validationReason({ kind: "task_graph" }), "task_graph tasks must be an array");
  assert.equal(validationReason({ kind: "task_graph", tasks: "invalid" }), "task_graph tasks must be an array");
  assert.equal(validationReason(graph([])), "task_graph must include at least one task");
});

test("TaskGraph rejects task consumer roles because planners must not assign workers", () => {
  assert.equal(
    validationReason(graph([validTask({ consumerRole: "engineer" })])),
    "Implement feature must not include consumerRole; Engine routing selects workers"
  );
});

test("TaskGraph rejects unknown dependencies", () => {
  assert.equal(
    validationReason(graph([validTask({ dependencies: ["missing"] })])),
    "Implement feature has unknown dependency: missing"
  );
});

test("TaskGraph rejects ambiguous dependencies", () => {
  assert.equal(
    validationReason(
      graph([
        validTask({ id: "impl_a", title: "Shared title" }),
        validTask({ id: "impl_b", title: "Shared title" }),
        validTask({
          id: "ops",
          title: "Deploy feature",
          description: "Deploy the requested feature.",
          dependencies: ["Shared title"]
        })
      ])
    ),
    "Deploy feature has ambiguous dependency: Shared title"
  );
});

test("TaskGraph rejects self dependencies", () => {
  assert.equal(
    validationReason(graph([validTask({ dependencies: ["impl"] })])),
    "Implement feature has self dependency: impl"
  );
});

test("TaskGraph rejects dependency cycles", () => {
  assert.equal(
    validationReason(
      graph([
        validTask({ id: "impl", title: "Implement feature", dependencies: ["reply"] }),
        validTask({
          id: "reply",
          title: "Reply to customer",
          description: "Tell the customer the work is complete.",
          dependencies: ["impl"]
        })
      ])
    ),
    "task_graph contains a dependency cycle"
  );
});

test("TaskGraph resolves graph dependency tokens to created task ids", () => {
  const taskGraph = new TaskGraph(
    graph([
      validTask({ id: "impl", title: "Implement feature" }),
      validTask({
        id: "reply",
        title: "Reply to customer",
        description: "Tell the customer the work is complete.",
        dependencies: ["impl", "Implement feature"]
      })
    ])
  );
  const dependencyMap = taskGraph.dependencyMapFor([{ id: "task_1" }, { id: "task_2" }]);

  assert.equal(dependencyMap.get("impl"), "task_1");
  assert.equal(dependencyMap.get("Implement feature"), "task_1");
  assert.equal(dependencyMap.get("reply"), "task_2");
  assert.equal(dependencyMap.get("Reply to customer"), "task_2");
});
