export const DEFAULT_AGENT_ROSTER = {
  ceo_cto: { name: "Franklin", initials: "FR", color: "orange" },
  product_manager: { name: "Darwin", initials: "DA", color: "blue" },
  engineer: { name: "Ada", initials: "AD", color: "green" },
  qa: { name: "Turing", initials: "TU", color: "yellow" },
  customer_success: { name: "Bell", initials: "BE", color: "purple" },
  operations: { name: "Ford", initials: "FO", color: "teal" }
};

export function defaultAgentRosterFor(role) {
  return DEFAULT_AGENT_ROSTER[role] || {};
}

export function defaultAgentName(role, fallback = role) {
  return defaultAgentRosterFor(role).name || fallback;
}

export function defaultCeoName() {
  return defaultAgentName("ceo_cto", "CEO");
}

export function agentInitials(name = "") {
  const words = String(name || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "AG";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}
