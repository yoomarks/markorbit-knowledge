import { describe, expect, it } from "vitest";
import {
  AI_GROUNDED_OUTPUT_VALIDATION_RECEIPT_OBJECT_TYPE,
  AI_GROUNDED_VALIDATION_PROTOCOL_VERSION,
  isAiGroundedOutputValidationReceiptV1,
  type AiGroundedOutputValidationReceiptV1,
} from "./ai-grounded-validation-v1";

const SOURCE_ONE = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_TWO = "src_01ARZ3NDEKTSV4RRFFQ69G5FAW";

function receipt(): AiGroundedOutputValidationReceiptV1 {
  return {
    protocolVersion: AI_GROUNDED_VALIDATION_PROTOCOL_VERSION,
    objectType: AI_GROUNDED_OUTPUT_VALIDATION_RECEIPT_OBJECT_TYPE,
    status: "VALID_GROUNDED",
    assignmentId: "kas_us_trademark_section_8",
    bindingId: "asb_us_trademark_section_8_official",
    sourcePackId: "asp_us_trademark_section_8_official",
    sourcePackRevision: 1,
    renderedPromptSha256: "a".repeat(64),
    outputSha256: "b".repeat(64),
    citationCount: 2,
    citedSourceIds: [SOURCE_ONE],
    unreferencedSourceIds: [SOURCE_TWO],
    insufficiencyDeclared: false,
    legalTruthVerified: false,
    semanticClaimCoverageVerified: false,
  };
}

describe("AiGroundedOutputValidationReceiptV1", () => {
  it("accepts a structurally valid grounded receipt", () => {
    expect(isAiGroundedOutputValidationReceiptV1(receipt())).toBe(true);
  });

  it("accepts explicit source-pack insufficiency without citations", () => {
    expect(
      isAiGroundedOutputValidationReceiptV1({
        ...receipt(),
        status: "VALID_INSUFFICIENT",
        citationCount: 0,
        citedSourceIds: [],
        unreferencedSourceIds: [SOURCE_ONE, SOURCE_TWO],
        insufficiencyDeclared: true,
      }),
    ).toBe(true);
  });

  it("rejects overlapping or malformed source identities", () => {
    expect(
      isAiGroundedOutputValidationReceiptV1({
        ...receipt(),
        unreferencedSourceIds: [SOURCE_ONE, SOURCE_TWO],
      }),
    ).toBe(false);
    expect(
      isAiGroundedOutputValidationReceiptV1({
        ...receipt(),
        citedSourceIds: ["src_not_a_ulid"],
      }),
    ).toBe(false);
  });

  it("rejects inconsistent status/citation semantics and authority escalation", () => {
    expect(
      isAiGroundedOutputValidationReceiptV1({
        ...receipt(),
        status: "VALID_GROUNDED",
        citationCount: 0,
        citedSourceIds: [],
      }),
    ).toBe(false);
    expect(
      isAiGroundedOutputValidationReceiptV1({
        ...receipt(),
        status: "VALID_INSUFFICIENT",
        insufficiencyDeclared: false,
      }),
    ).toBe(false);
    expect(
      isAiGroundedOutputValidationReceiptV1({
        ...receipt(),
        legalTruthVerified: true,
      }),
    ).toBe(false);
  });
});
