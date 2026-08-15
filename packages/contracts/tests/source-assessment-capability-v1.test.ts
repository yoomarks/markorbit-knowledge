import { describe, expect, it } from "vitest";
import {
  SOURCE_ASSESSMENT_CAPABILITY_ID,
  SOURCE_ASSESSMENT_CAPABILITY_VERSION,
  isSourceAssessmentResponseV1,
} from "../src/source-assessment-capability-v1";

describe("source assessment capability v1", () => {
  it("accepts a bounded advisory response", () => {
    expect(
      isSourceAssessmentResponseV1({
        version: SOURCE_ASSESSMENT_CAPABILITY_VERSION,
        capability: SOURCE_ASSESSMENT_CAPABILITY_ID,
        provider: { providerId: "fixture", model: "fixture-model" },
        generatedAt: "2026-08-15T00:00:00.000Z",
        sourceValue: {
          score: 92,
          priority: "VERY_HIGH",
          confidence: "HIGH",
          summary: "Primary official source with broad acquisition value.",
          reason: "The source is authoritative and covers multiple durable public materials.",
          valuePoints: ["Primary official material", "Broad public coverage"],
          cautionPoints: ["Semantic assessment is advisory"],
        },
        boundaries: {
          legalTruthVerified: false,
          professionalQualityVerified: false,
          grantsCollectionAuthority: false,
        },
      }),
    ).toBe(true);
  });

  it("rejects authority-granting or out-of-range responses", () => {
    expect(
      isSourceAssessmentResponseV1({
        version: SOURCE_ASSESSMENT_CAPABILITY_VERSION,
        capability: SOURCE_ASSESSMENT_CAPABILITY_ID,
        provider: { providerId: "fixture" },
        generatedAt: "2026-08-15T00:00:00.000Z",
        sourceValue: {
          score: 120,
          priority: "VERY_HIGH",
          confidence: "HIGH",
          summary: "Invalid",
          reason: "Invalid",
          valuePoints: [],
        },
        boundaries: {
          legalTruthVerified: false,
          professionalQualityVerified: false,
          grantsCollectionAuthority: true,
        },
      }),
    ).toBe(false);
  });
});
