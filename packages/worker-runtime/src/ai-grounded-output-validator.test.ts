import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AI_GROUNDED_OUTPUT_VALIDATION_RECEIPT_OBJECT_TYPE,
  AI_GROUNDED_VALIDATION_PROTOCOL_VERSION,
  isAiGroundedOutputValidationReceiptV1,
} from "@markorbit/contracts";
import {
  AI_SOURCE_PACK_INSUFFICIENT_PREFIX,
  AiGroundedOutputValidationError,
  validateAiGroundedProviderOutputV1,
} from "./ai-grounded-output-validator";
import type { AiGroundedProviderInputV1 } from "./ai-source-pack-renderer";

const SOURCE_ONE = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_TWO = "src_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const UNKNOWN_SOURCE = "src_01ARZ3NDEKTSV4RRFFQ69G5FAX";
const PROMPT = "Governed prompt with frozen official source evidence.";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const providerInput: AiGroundedProviderInputV1 = {
  assignmentId: "kas_us_trademark_section_8",
  bindingId: "asb_us_trademark_section_8_official",
  sourcePackId: "asp_us_trademark_section_8_official",
  sourcePackRevision: 1,
  renderedPrompt: PROMPT,
  renderedPromptSha256: sha256(PROMPT),
  sources: [
    {
      sourceId: SOURCE_ONE,
      artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      canonicalUri: "https://www.uspto.gov/section-8",
      mediaType: "text/html",
      contentSha256: "0".repeat(64),
      sizeBytes: 100,
    },
    {
      sourceId: SOURCE_TWO,
      artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      canonicalUri: "https://tmep.uspto.gov/current",
      mediaType: "text/markdown",
      contentSha256: "1".repeat(64),
      sizeBytes: 200,
    },
  ],
  legalTruthVerified: false,
  executionAuthorityGranted: false,
};

async function expectValidationError(
  action: () => unknown,
  code: string,
): Promise<AiGroundedOutputValidationError> {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AiGroundedOutputValidationError);
    expect((error as AiGroundedOutputValidationError).code).toBe(code);
    return error as AiGroundedOutputValidationError;
  }
  throw new Error(`Expected ${code}`);
}

describe("ADK-11 grounded-output validator", () => {
  it("accepts exact bound source citations and emits deterministic provenance receipt", () => {
    const output = [
      `The maintenance requirement is described by the official guidance. [source:${SOURCE_ONE}]`,
      `The manual supplies additional procedural context. [source:${SOURCE_TWO}]`,
      `The same source may be cited again. [source:${SOURCE_ONE}]`,
    ].join("\n");

    const first = validateAiGroundedProviderOutputV1({ providerInput, output });
    const second = validateAiGroundedProviderOutputV1({ providerInput, output });

    expect(second).toEqual(first);
    expect(first.protocolVersion).toBe(AI_GROUNDED_VALIDATION_PROTOCOL_VERSION);
    expect(first.objectType).toBe(AI_GROUNDED_OUTPUT_VALIDATION_RECEIPT_OBJECT_TYPE);
    expect(isAiGroundedOutputValidationReceiptV1(first)).toBe(true);
    expect(first.status).toBe("VALID_GROUNDED");
    expect(first.citationCount).toBe(3);
    expect(first.citedSourceIds).toEqual([SOURCE_ONE, SOURCE_TWO]);
    expect(first.unreferencedSourceIds).toEqual([]);
    expect(first.outputSha256).toBe(sha256(output));
    expect(first.legalTruthVerified).toBe(false);
    expect(first.semanticClaimCoverageVerified).toBe(false);
  });

  it("accepts explicit insufficiency with a non-empty reason when no citation can support a conclusion", () => {
    const output = `${AI_SOURCE_PACK_INSUFFICIENT_PREFIX} the bound sources do not state the requested exception.`;
    const receipt = validateAiGroundedProviderOutputV1({ providerInput, output });

    expect(isAiGroundedOutputValidationReceiptV1(receipt)).toBe(true);
    expect(receipt.status).toBe("VALID_INSUFFICIENT");
    expect(receipt.citationCount).toBe(0);
    expect(receipt.citedSourceIds).toEqual([]);
    expect(receipt.unreferencedSourceIds).toEqual([SOURCE_ONE, SOURCE_TWO]);
    expect(receipt.insufficiencyDeclared).toBe(true);
  });

  it("rejects uncited substantive output and empty insufficiency declarations", async () => {
    await expectValidationError(
      () =>
        validateAiGroundedProviderOutputV1({ providerInput, output: "This is an uncited answer." }),
      "AI_GROUNDED_OUTPUT_CITATION_REQUIRED",
    );
    await expectValidationError(
      () =>
        validateAiGroundedProviderOutputV1({
          providerInput,
          output: AI_SOURCE_PACK_INSUFFICIENT_PREFIX,
        }),
      "AI_GROUNDED_OUTPUT_CITATION_REQUIRED",
    );
  });

  it("rejects malformed and unknown source tokens", async () => {
    await expectValidationError(
      () =>
        validateAiGroundedProviderOutputV1({
          providerInput,
          output: `Bad token [source:${SOURCE_ONE}`,
        }),
      "AI_GROUNDED_OUTPUT_CITATION_MALFORMED",
    );
    await expectValidationError(
      () =>
        validateAiGroundedProviderOutputV1({
          providerInput,
          output: `Unknown evidence [source:${UNKNOWN_SOURCE}]`,
        }),
      "AI_GROUNDED_OUTPUT_UNKNOWN_SOURCE",
    );
  });

  it("rejects tampered rendered-prompt identity before evaluating provider output", async () => {
    await expectValidationError(
      () =>
        validateAiGroundedProviderOutputV1({
          providerInput: { ...providerInput, renderedPrompt: `${PROMPT} tampered` },
          output: `Claim. [source:${SOURCE_ONE}]`,
        }),
      "AI_GROUNDED_INPUT_PROMPT_DIGEST_MISMATCH",
    );
  });

  it("rejects duplicate source identities in provider input", async () => {
    await expectValidationError(
      () =>
        validateAiGroundedProviderOutputV1({
          providerInput: {
            ...providerInput,
            sources: [providerInput.sources[0], providerInput.sources[0]],
          },
          output: `Claim. [source:${SOURCE_ONE}]`,
        }),
      "AI_GROUNDED_INPUT_SOURCE_ID_DUPLICATE",
    );
  });
});
