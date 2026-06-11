export class CliChannel {
  constructor({ logger }) {
    this.name = "cli";
    this.logger = logger;
  }

  async sendReply(task, message) {
    this.logger.info({ taskId: task.id, message }, "cli reply");
    console.log(message);
    return { sent: true, channel: "cli", transport: "stdout" };
  }
}
