import { defaultAgentName, defaultCeoName } from "../../../agent-framework/domain/agent-roster.js";

const DEFAULT_GOAL = "处理用户请求";
const CEO_NAME = defaultCeoName();
const PRODUCT_MANAGER_NAME = defaultAgentName("product_manager");
const ENGINEER_NAME = defaultAgentName("engineer");
const QA_NAME = defaultAgentName("qa");
const CEO_IDENTITY_REPLY = `我是 ${CEO_NAME}，AI Team 的 CEO/CTO 入口。`;

export function defaultTeamMockRoleOutput(input = {}) {
  const { role, intent, task } = input;
  const previousArtifacts = Array.isArray(input.previousArtifacts) ? input.previousArtifacts : [];

  if (role === "product_manager") return productManagerOutput({ intent });
  if (role === "engineer") return engineerOutput({ task, previousArtifacts });
  if (role === "qa") return qaOutput({ task });
  if (role === "customer_success") return customerSuccessOutput({ intent, task });
  if (role === "operations") return operationsOutput({ task });
  if (role === "ceo_cto") return ceoOutput({ intent, previousArtifacts });

  return {
    finalMessage: `[mock:${role}] 已完成模拟处理。`,
    structured: {
      kind: "mock_role_output",
      role,
      taskId: task?.id,
      intentId: intent?.id
    }
  };
}

function productManagerOutput({ intent }) {
  const goal = intent?.goal || DEFAULT_GOAL;
  if (isIdentityQuestion(goal)) {
    return {
      finalMessage: `${PRODUCT_MANAGER_NAME} 已识别为身份问答，只需要一次面向用户的简洁回复。`,
      structured: {
        kind: "task_graph",
        productSpec: {
          intentId: intent?.id,
          title: "回复用户询问名称",
          goal,
          userStories: [
            {
              actor: "用户",
              need: "想知道正在对话的是谁",
              outcome: "收到清楚、自然、不过度包装的身份回答"
            }
          ],
          acceptanceCriteria: [
            "用中文直接回答身份。",
            `必须回答：${CEO_IDENTITY_REPLY}`,
            "不得使用 AI Team Agent 作为名称。",
            "不得输出内部状态、PM 验收或 QA 结果。"
          ]
        },
        tasks: [
          {
            id: "customer_success_identity_reply",
            title: "回复用户询问名称",
            description: "用中文直接说明当前对话入口的名称和身份，范围仅限身份问答。",
            dependencies: [],
            acceptanceCriteria: [
              "回复为一句自然中文。",
              `明确回答：${CEO_IDENTITY_REPLY}`,
              "不出现 AI Team Agent。",
              "不附带内部交付报告。"
            ]
          }
        ]
      }
    };
  }
  const acceptanceCriteria = intent?.acceptanceCriteria?.length
    ? intent.acceptanceCriteria
    : ["核心流程可用", "测试通过"];
  const tasks = [
    {
      id: "implementation",
      title: "实现客户反馈驱动的小功能",
      description: `根据产品规格实现：${goal}`,
      dependencies: [],
      acceptanceCriteria
    },
    {
      id: "customer_reply",
      title: "准备客户回复",
      description: "用中文向用户说明交付内容和验证结果。",
      dependencies: ["implementation"],
      acceptanceCriteria: ["回复清晰、面向用户、包含测试状态"]
    },
    {
      id: "operations_note",
      title: "记录运行与交付说明",
      description: "沉淀本次交付的运行说明、验证命令和风险提示。",
      dependencies: ["implementation"],
      acceptanceCriteria: ["运行说明可复用", "验证命令清晰"]
    }
  ];

  return {
    finalMessage: `${PRODUCT_MANAGER_NAME} 已拆解产品规格、工程任务、客户回复任务和运营记录任务。`,
    structured: {
      kind: "task_graph",
      productSpec: {
        intentId: intent?.id,
        title: goal,
        goal,
        userStories: [
          {
            actor: "客户",
            need: "希望反馈能转化为可验证的小功能",
            outcome: "功能完成后能收到清楚的交付说明"
          }
        ],
        acceptanceCriteria
      },
      tasks
    }
  };
}

function engineerOutput({ task, previousArtifacts }) {
  const rejection = [...previousArtifacts]
    .reverse()
    .find((artifact) => ["verification_report", "turing_verification_report"].includes(artifact?.kind) && artifact?.data?.verdict === "reject");

  return {
    finalMessage: `${ENGINEER_NAME} 已完成模拟实现，并准备好测试命令。`,
    structured: {
      kind: "implementation_report",
      taskId: task?.id,
      summary: `已实现任务：${task?.title || task?.text || "模拟工程任务"}`,
      changedFiles: ["src/team-engine/mock-feature.js", "test/mock-feature.test.js"],
      addressedRejectionArtifactId: rejection?.id,
      verificationCommand: "npm test"
    }
  };
}

function qaOutput({ task }) {
  const rejectRounds = Number(task?.context?.forceQaRejectRounds || task?.forceQaRejectRounds || 0);
  const explicitRound = numericRound(task?.reworkRounds) ?? numericRound(task?.qaRound) ?? numericRound(task?.reworkRound);
  const reworkRounds = explicitRound ?? 0;
  const canForceReject = explicitRound !== undefined;
  const shouldReject = canForceReject && reworkRounds < rejectRounds;
  const verdict = shouldReject ? "reject" : "pass";

  return {
    finalMessage: shouldReject
      ? `VERDICT: reject\n${QA_NAME} 发现模拟验收问题，需要返工。`
      : `VERDICT: pass\n${QA_NAME} 验证通过。`,
    structured: {
      kind: "verification_report",
      taskId: task?.id,
      verdict,
      findings: shouldReject
        ? ["模拟配置要求 QA 在当前返工轮次拒绝。"]
        : ["模拟检查通过，未发现阻塞问题。"],
      checks: [
        { name: "acceptance_criteria", status: shouldReject ? "failed" : "passed" },
        { name: "npm_test", status: shouldReject ? "blocked" : "passed", command: "npm test" }
      ]
    }
  };
}

function numericRound(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const round = Number(value);
  return Number.isFinite(round) ? round : undefined;
}

function customerSuccessOutput({ intent, task }) {
  const message = isIdentityQuestion(intent?.goal || task?.description || task?.title)
    ? CEO_IDENTITY_REPLY
    : `你好，已根据你的需求「${intent?.goal || task?.title || DEFAULT_GOAL}」完成模拟交付，并确认测试结果可追踪。`;

  return {
    finalMessage: message,
    structured: {
      kind: "customer_reply",
      taskId: task?.id,
      message
    }
  };
}

function operationsOutput({ task }) {
  return {
    finalMessage: "Operations 已记录模拟运行说明。",
    structured: {
      kind: "operations_runbook_note",
      taskId: task?.id,
      note: "保持 npm test 作为交付前验证命令，并记录失败原因。"
    }
  };
}

function ceoOutput({ intent, previousArtifacts }) {
  const replyArtifact = [...previousArtifacts]
    .reverse()
    .find((artifact) => artifact?.kind === "customer_reply" && artifact?.data?.message);
  const message = replyArtifact?.data?.message || `已完成对「${intent?.goal || DEFAULT_GOAL}」的模拟汇总。`;

  return {
    finalMessage: message,
    structured: {
      kind: "final_aggregation",
      intentId: intent?.id,
      message,
      sourceArtifactId: replyArtifact?.id
    }
  };
}

function isIdentityQuestion(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  return [
    "你叫什么",
    "你叫啥",
    "你是谁",
    "你是什么",
    "叫什么名字",
    "what is your name",
    "who are you"
  ].some((needle) => text.includes(needle));
}
