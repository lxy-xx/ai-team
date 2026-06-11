function outputConfig(profile = {}) {
  return profile?.output && typeof profile.output === "object" ? profile.output : {};
}

export function artifactKindFor(role, structured, profile = {}) {
  return structured?.kind || outputConfig(profile).artifactKind || "agent_output";
}

export class ProviderOutputNormalizer {
  normalize(role, output, profile = {}) {
    const rawStructured = output?.structuredOutput ?? output?.structured;
    if (isMeaningfulObject(rawStructured)) {
      const finalMessage =
        nonEmptyString(output?.finalMessage) ||
        nonEmptyString(output?.stdout) ||
        this.structuredMessageFor(rawStructured);
      return { finalMessage, structured: this.enrichStructuredFromFinalMessage(role, rawStructured, finalMessage, profile) };
    }
    const finalMessageFromModel = nonEmptyString(output?.finalMessage);
    const parsedStructured = this.parseStructuredFinalMessage(finalMessageFromModel);
    if (isMeaningfulObject(parsedStructured)) {
      return {
        finalMessage: finalMessageFromModel,
        structured: parsedStructured
      };
    }

    const finalMessage = finalMessageFromModel || nonEmptyString(output?.stdout) || "";
    if (finalMessage) {
      const qaVerdict = this.qaVerdictFromFinalMessage(role, finalMessage, profile);
      if (qaVerdict) {
        return {
          finalMessage,
          structured: {
            kind: this.artifactKindFor(role, undefined, profile),
            verdict: qaVerdict,
            findings: [],
            checks: [],
            message: finalMessage
          }
        };
      }
      return {
        finalMessage,
        structured: {
          kind: this.artifactKindFor(role, undefined, profile),
          message: finalMessage
        }
      };
    }
    throw new Error("provider returned empty output");
  }

  artifactKindFor(role, structured, profile = {}) {
    return artifactKindFor(role, structured, profile);
  }

  modelText(output) {
    if (typeof output?.finalMessage === "string" && output.finalMessage.trim()) return output.finalMessage.trim();
    if (typeof output?.stdout === "string" && output.stdout.trim()) return output.stdout.trim();
    const structured = output?.structuredOutput ?? output?.structured;
    if (structured && typeof structured === "object") {
      if (typeof structured.summary === "string" && structured.summary.trim()) return structured.summary.trim();
      if (typeof structured.message === "string" && structured.message.trim()) return structured.message.trim();
      return JSON.stringify(structured);
    }
    return "";
  }

  enrichStructuredFromFinalMessage(role, structured, finalMessage, profile = {}) {
    if (structured?.verdict) return structured;
    const qaVerdict = this.qaVerdictFromFinalMessage(role, finalMessage, profile);
    if (!qaVerdict) return structured;
    return {
      ...structured,
      verdict: qaVerdict,
      findings: Array.isArray(structured.findings) ? structured.findings : [],
      checks: Array.isArray(structured.checks) ? structured.checks : []
    };
  }

  qaVerdictFromFinalMessage(role, finalMessage, profile = {}) {
    const pattern = outputConfig(profile).verdictPattern;
    if (!pattern) return undefined;
    let regex;
    try {
      regex = new RegExp(pattern, outputConfig(profile).verdictPatternFlags || undefined);
    } catch {
      return undefined;
    }
    const match = String(finalMessage || "").match(regex);
    return match?.[1]?.toLowerCase();
  }

  transcriptSummaryFor(role, finalMessage, profile = {}) {
    const prefix = outputConfig(profile).transcriptPrefix || "";
    return `${prefix}${finalMessage}`.slice(0, 2000);
  }

  parseStructuredFinalMessage(message) {
    if (!message) return undefined;
    for (const candidate of this.structuredJsonCandidates(message)) {
      try {
        const parsed = JSON.parse(candidate);
        if (isMeaningfulObject(parsed)) return parsed;
      } catch {
        // Try the next candidate; model replies often include prose plus a JSON block.
      }
    }
    return undefined;
  }

  structuredJsonCandidates(message) {
    const text = String(message || "").trim();
    if (!text) return [];
    const candidates = [];
    const fenced = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    const wholeCandidate = (fenced ? fenced[1] : text).trim();
    if (wholeCandidate.startsWith("{") && wholeCandidate.endsWith("}")) candidates.push(wholeCandidate);
    const fencedBlocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/gi)];
    for (const match of fencedBlocks) {
      const candidate = String(match[1] || "").trim();
      if (candidate.startsWith("{") && candidate.endsWith("}") && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
    return candidates;
  }

  structuredMessageFor(structured) {
    return `Structured output: ${structured.kind || "agent_output"}`;
  }
}

function nonEmptyString(value) {
  if (typeof value !== "string") return undefined;
  return value.trim() ? value : undefined;
}

function isMeaningfulObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}
