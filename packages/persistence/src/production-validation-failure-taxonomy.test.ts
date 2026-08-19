import type { SourceCompatibilityObservation } from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import { classifyProductionValidationFailure } from "./production-validation-failure-taxonomy";

function observation(
  state: "PASS" | "DEGRADED" | "BLOCKED",
  errorCode?: string,
): SourceCompatibilityObservation {
  return {
    protocolVersion: "1.0",
    objectType: "SOURCE_COMPATIBILITY_OBSERVATION",
    id: `obs-${state}-${errorCode ?? "none"}`,
    targetId: "target-a",
    jurisdiction: "US",
    state,
    observedAt: "2026-08-19T06:00:00.000Z",
    primaryUri: "https://example.com",
    renderJavascript: false,
    ...(errorCode ? { errorCode, errorMessage: errorCode } : {}),
  } as SourceCompatibilityObservation;
}

describe("classifyProductionValidationFailure", () => {
  it("keeps unobserved targets unknown and records a passing primary path as no adapter required", () => {
    expect(classifyProductionValidationFailure(undefined)).toEqual({
      class: "NONE",
      observed: false,
      sourceErrorCode: null,
      sourceErrorMessage: null,
      adapterRequired: null,
    });
    expect(classifyProductionValidationFailure(observation("PASS"))).toMatchObject({
      class: "NONE",
      observed: true,
      adapterRequired: false,
    });
  });

  it.each([
    ["CANARY_ADAPTER_REQUIRED", "ADAPTER_REQUIRED", true],
    ["CANARY_AUTHORITY_BASELINE_FAILED", "AUTHORITY_BLOCKED", null],
    ["CANARY_EVIDENCE_INCOMPLETE", "EVIDENCE_INCOMPLETE", null],
    ["CANARY_RUNNER_FAILED", "RUNNER_FAILURE", null],
    ["CRAWL4AI_NETWORK_ERROR", "ACQUISITION_FAILURE", null],
  ] as const)("classifies %s without guessing hidden causes", (errorCode, expectedClass, adapterRequired) => {
    expect(classifyProductionValidationFailure(observation("BLOCKED", errorCode))).toMatchObject({
      class: expectedClass,
      observed: true,
      sourceErrorCode: errorCode,
      adapterRequired,
    });
  });
});
