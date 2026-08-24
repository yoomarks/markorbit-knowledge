import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFrozenAdkLivePilotPlan } from "./adk-live-pilot-plan";

const CANONICAL_PLAN_URL = new URL(
  "../../../config/adk-live-pilot-us-trademark-3x2.json",
  import.meta.url,
);

function loadCanonicalPlan(): unknown {
  return JSON.parse(readFileSync(CANONICAL_PLAN_URL, "utf8")) as unknown;
}

describe("ADK-06 canonical live 3x2 plan", () => {
  it("freezes the exact approved US trademark assignments and providers", () => {
    const plan = parseFrozenAdkLivePilotPlan(loadCanonicalPlan());

    expect(plan.pilotId).toBe("app_us_trademark_live_acceptance");
    expect(plan.assignmentIds).toEqual([
      "kas_us_trademark_filing",
      "kas_us_trademark_section_8",
      "kas_us_trademark_ttab",
    ]);
    expect(plan.providers).toEqual(["DEEPSEEK", "OPENAI"]);
    expect(plan.approvalRef).toBe("github:yoomarks/markorbit-knowledge#405");
    expect(plan.liveProviderCallsAuthorized).toBe(true);
    expect(plan.boundaries).toEqual({
      compareProviderQuality: false,
      legalTruthVerified: false,
      candidateAutoActivation: false,
    });
  });

  it("contains no runtime/provider credential material", () => {
    const serialized = JSON.stringify(loadCanonicalPlan()).toLowerCase();

    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("credential");
    expect(serialized).not.toContain("leasetoken");
    expect(serialized).not.toContain("workercredential");
  });
});
