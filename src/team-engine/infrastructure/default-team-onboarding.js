export const DEFAULT_TEAM_WAKE_RULES = {
  ceo_cto: [
    {
      entityType: "intent",
      status: "in_progress",
      condition: "all_tasks_done",
      afterRunStatus: "done"
    }
  ],
  product_manager: [
    {
      entityType: "intent",
      status: "new",
      afterRunStatus: "in_progress"
    }
  ],
  customer_success: [],
  operations: [
    {
      entityType: "task",
      status: "waiting",
      consumerRole: "operations",
      afterRunStatus: "done"
    }
  ],
  engineer: [
    {
      entityType: "task",
      status: "waiting",
      afterRunStatus: "testing"
    }
  ],
  qa: [
    {
      entityType: "task",
      status: "testing",
      afterRunStatus: "done"
    }
  ]
};

const STALE_DEFAULT_WAKE_RULES = {
  engineer: [
    {
      entityType: "task",
      status: "waiting",
      consumerRole: "engineer",
      afterRunStatus: "testing"
    }
  ]
};

const DEFAULT_TEAM_ROUTING_ONBOARDING_KEY = "defaultTeamRouting";

export async function onboardDefaultTeamRouting({ routingStore, wakeRules = DEFAULT_TEAM_WAKE_RULES, onboardingStateStore } = {}) {
  if (!routingStore?.get || !routingStore?.update) return [];
  if (!onboardingStateStore?.has || !onboardingStateStore?.mark) {
    throw new Error("onboardDefaultTeamRouting requires onboardingStateStore");
  }
  let alreadySeeded = await onboardingStateStore.has(DEFAULT_TEAM_ROUTING_ONBOARDING_KEY);
  if (!alreadySeeded) {
    const existing = await routingStore.list?.() || [];
    if (existing.length) {
      await onboardingStateStore.mark(DEFAULT_TEAM_ROUTING_ONBOARDING_KEY, {
        version: 1,
        inferred: true,
        existingRoles: existing.map((config) => config.role).filter(Boolean)
      });
      alreadySeeded = true;
    }
  }
  const changes = [];
  for (const [priority, [role, rules]] of Object.entries(wakeRules).entries()) {
    const hasConfig = routingStore.has ? await routingStore.has(role) : (await routingStore.get(role)).wakeRules.length > 0;
    const current = hasConfig ? await routingStore.get(role) : undefined;
    const staleRules = STALE_DEFAULT_WAKE_RULES[role];
    const isStaleDefault = hasConfig && Array.isArray(staleRules) && wakeRulesEqual(current?.wakeRules, staleRules);
    if (hasConfig && !isStaleDefault) continue;
    if (!hasConfig && alreadySeeded) continue;
    const next = await routingStore.update(role, cloneWakeRules(rules), { priority });
    changes.push({ role: next.role, action: isStaleDefault ? "upgraded" : "seeded" });
  }
  if (!alreadySeeded) {
    await onboardingStateStore.mark(DEFAULT_TEAM_ROUTING_ONBOARDING_KEY, {
      version: 1,
      seededRoles: changes.filter((change) => change.action === "seeded").map((change) => change.role)
    });
  }
  return changes;
}

function cloneWakeRules(rules = []) {
  return rules.map((rule) => ({ ...rule }));
}

function wakeRulesEqual(left = [], right = []) {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}
