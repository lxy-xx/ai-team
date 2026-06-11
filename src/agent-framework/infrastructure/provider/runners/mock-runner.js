export class MockSubagentRunner {
  async run(input = {}) {
    const role = input.role || input.agentName || "agent";
    const taskId = input.task?.id || input.intent?.id;
    const finalMessage = taskId
      ? `Mock provider response for ${role} on ${taskId}.`
      : `Mock provider response for ${role}.`;
    return {
      finalMessage,
      structuredOutput: {},
      stdout: "",
      stderr: "",
      durationMs: 0
    };
  }
}
