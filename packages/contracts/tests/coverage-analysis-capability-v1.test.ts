import { describe, expect, it } from "vitest";
import {
  COVERAGE_ANALYSIS_CAPABILITY_ID,
  COVERAGE_ANALYSIS_CAPABILITY_VERSION,
  isCoverageAnalysisResponseV1,
} from "../src/coverage-analysis-capability-v1";

function validResponse() {
  return {
    version: COVERAGE_ANALYSIS_CAPABILITY_VERSION,
    capability: COVERAGE_ANALYSIS_CAPABILITY_ID,
    provider: { providerId: "shared-capability-test", model: "test-model" },
    generatedAt: "2026-08-15T03:00:00.000Z",
    status: "ATTENTION" as const,
    summary: "Coverage is established but several curated targets remain missing.",
    strengths: ["Foundational official sources are present."],
    gaps: ["Proceedings coverage is incomplete."],
    recommendedNextSteps: [
      {
        title: "Discover the missing proceedings source",
        reason: "The curated target is currently unregistered.",
        priority: "HIGH" as const,
        category: "PROCEEDINGS",
      },
    ],
  };
}

describe("coverage analysis capability v1", () => {
  it("accepts a provider-neutral response", () => {
    expect(isCoverageAnalysisResponseV1(validResponse())).toBe(true);
  });

  it("rejects an unknown coverage status", () => {
    const response = validResponse() as unknown as Record<string, unknown>;
    response.status = "COMPLETE";
    expect(isCoverageAnalysisResponseV1(response)).toBe(false);
  });

  it("rejects an unsupported action priority", () => {
    const response = validResponse() as unknown as {
      recommendedNextSteps: Array<Record<string, unknown>>;
    };
    response.recommendedNextSteps[0]!.priority = "URGENT";
    expect(isCoverageAnalysisResponseV1(response)).toBe(false);
  });

  it("requires provider identity", () => {
    const response = validResponse() as unknown as { provider: Record<string, unknown> };
    response.provider = {};
    expect(isCoverageAnalysisResponseV1(response)).toBe(false);
  });
});
