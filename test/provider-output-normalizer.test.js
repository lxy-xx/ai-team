import test from "node:test";
import assert from "node:assert/strict";
import {
  ProviderOutputNormalizer,
  artifactKindFor
} from "../src/team-engine/adapters/agent-framework/provider-output-normalizer.js";
import { defaultAgentProfileForRole } from "../src/agent-framework/infrastructure/default-agent-onboarding.js";

test("ProviderOutputNormalizer preserves structured output and explicit final message", () => {
  const normalizer = new ProviderOutputNormalizer();
  const structured = { kind: "custom_report", summary: "Done" };

  const result = normalizer.normalize("engineer", {
    finalMessage: "Implementation complete",
    structuredOutput: structured
  });

  assert.equal(result.finalMessage, "Implementation complete");
  assert.equal(result.structured, structured);
  assert.equal(normalizer.artifactKindFor("engineer", result.structured), "custom_report");
});

test("ProviderOutputNormalizer parses structured JSON returned as final text", () => {
  const normalizer = new ProviderOutputNormalizer();

  const result = normalizer.normalize("qa", {
    finalMessage: '```json\n{ "kind": "turing_verification_report", "verdict": "pass" }\n```'
  });

  assert.equal(result.structured.kind, "turing_verification_report");
  assert.equal(result.structured.verdict, "pass");
  assert.match(result.finalMessage, /turing_verification_report/);
});

test("ProviderOutputNormalizer keeps explicit structured artifact kinds", () => {
  const normalizer = new ProviderOutputNormalizer();

  const result = normalizer.normalize("engineer", {
    finalMessage: '```json\n{ "kind": "implementation_report", "summary": "Done" }\n```'
  });

  assert.equal(result.structured.kind, "implementation_report");
  assert.equal(normalizer.artifactKindFor("engineer", result.structured), "implementation_report");
});

test("ProviderOutputNormalizer parses structured JSON fenced after prose", () => {
  const normalizer = new ProviderOutputNormalizer();

  const result = normalizer.normalize("qa", {
    finalMessage: '所有检查均已通过。\n\nVERDICT: pass\n\n```json\n{ "kind": "turing_verification_report", "verdict": "pass", "findings": [] }\n```'
  });

  assert.equal(result.structured.kind, "turing_verification_report");
  assert.equal(result.structured.verdict, "pass");
  assert.deepEqual(result.structured.findings, []);
});

test("ProviderOutputNormalizer extracts QA verdict from VERDICT text fallback", () => {
  const normalizer = new ProviderOutputNormalizer();

  const result = normalizer.normalize("qa", {
    finalMessage: "VERDICT: pass\n\n检查覆盖：index.html 存在且无外部依赖。"
  }, defaultAgentProfileForRole("qa"));

  assert.equal(result.structured.kind, "verification_report");
  assert.equal(result.structured.verdict, "pass");
  assert.deepEqual(result.structured.findings, []);
  assert.match(result.structured.message, /index\.html/);
});

test("ProviderOutputNormalizer enriches QA structured message with VERDICT text", () => {
  const normalizer = new ProviderOutputNormalizer();

  const result = normalizer.normalize("qa", {
    finalMessage: "VERDICT: reject\n\n缺少移动端验证。",
    structuredOutput: {
      kind: "turing_verification_report",
      message: "VERDICT: reject\n\n缺少移动端验证。"
    }
  }, defaultAgentProfileForRole("qa"));

  assert.equal(result.structured.verdict, "reject");
  assert.deepEqual(result.structured.checks, []);
});

test("ProviderOutputNormalizer falls back to stdout text with role artifact kind", () => {
  const normalizer = new ProviderOutputNormalizer();

  const result = normalizer.normalize("operations", { stdout: "Runbook note" }, defaultAgentProfileForRole("operations"));

  assert.equal(result.finalMessage, "Runbook note");
  assert.deepEqual(result.structured, {
    kind: "operations_runbook_note",
    message: "Runbook note"
  });
  assert.equal(artifactKindFor("unknown_role"), "agent_output");
  assert.equal(artifactKindFor("engineer", undefined, defaultAgentProfileForRole("engineer")), "implementation_report");
  assert.equal(artifactKindFor("customer_success", undefined, defaultAgentProfileForRole("customer_success")), "customer_reply");
});

test("ProviderOutputNormalizer rejects empty provider output", () => {
  const normalizer = new ProviderOutputNormalizer();

  assert.throws(
    () => normalizer.normalize("engineer", { finalMessage: "   ", structuredOutput: {} }),
    /provider returned empty output/
  );
});

test("ProviderOutputNormalizer summarizes transcript with engineer prefix", () => {
  const normalizer = new ProviderOutputNormalizer();

  assert.equal(
    normalizer.transcriptSummaryFor("engineer", "Changed files"),
    "Changed files"
  );
  assert.equal(
    normalizer.transcriptSummaryFor("engineer", "Changed files", defaultAgentProfileForRole("engineer")),
    "Implementation completed.\nChanged files"
  );
  assert.equal(normalizer.transcriptSummaryFor("qa", "Passed"), "Passed");
});
