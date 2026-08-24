import { describe, expect, it } from "vitest";
import {
  AI_GROUNDED_EXECUTION_ENVELOPE_OBJECT_TYPE,
  AI_GROUNDED_EXECUTION_PROTOCOL_VERSION,
  AI_GROUNDED_EXECUTION_STATUS,
  isAiGroundedExecutionEnvelopeV1,
  type AiGroundedExecutionEnvelopeV1,
} from "./ai-grounded-execution-v1";

const envelope: AiGroundedExecutionEnvelopeV1 = {
  protocolVersion: AI_GROUNDED_EXECUTION_PROTOCOL_VERSION,
  objectType: AI_GROUNDED_EXECUTION_ENVELOPE_OBJECT_TYPE,
  status: AI_GROUNDED_EXECUTION_STATUS,
  assignmentId: "kas_us_trademark_section_8",
  bindingId: "asb_us_trademark_section_8_official",
  sourcePackId: "asp_us_trademark_section_8_official",
  sourcePackRevision: 1,
  rendererVersion: "1.0.0",
  renderedPromptSha256: "a".repeat(64),
  sourceReceiptsSha256: "b".repeat(64),
  executionInputSha256: "c".repeat(64),
  sourceReceipts: [
    {
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      canonicalUri: "https://www.uspto.gov/trademarks/maintain",
      mediaType: "text/html",
      contentSha256: "d".repeat(64),
      sizeBytes: 1024,
    },
  ],
  preparedAt: "2026-08-24T10:00:00.000Z",
  providerCallAuthorized: false,
  providerCallExecuted: false,
  externalBrowsingAllowed: false,
  legalTruthVerified: false,
  executionAuthorityGranted: false,
};

describe("AiGroundedExecutionEnvelopeV1", () => {
  it("accepts a strict PREPARED no-provider-call envelope", () => {
    expect(isAiGroundedExecutionEnvelopeV1(envelope)).toBe(true);
  });

  it("rejects authority or execution escalation", () => {
    expect(isAiGroundedExecutionEnvelopeV1({ ...envelope, providerCallAuthorized: true })).toBe(
      false,
    );
    expect(isAiGroundedExecutionEnvelopeV1({ ...envelope, providerCallExecuted: true })).toBe(false);
    expect(isAiGroundedExecutionEnvelopeV1({ ...envelope, executionAuthorityGranted: true })).toBe(
      false,
    );
  });

  it("rejects duplicate source or artifact identities", () => {
    expect(
      isAiGroundedExecutionEnvelopeV1({
        ...envelope,
        sourceReceipts: [envelope.sourceReceipts[0], envelope.sourceReceipts[0]],
      }),
    ).toBe(false);
  });

  it("rejects malformed identity, digest, URI and timestamp fields", () => {
    expect(isAiGroundedExecutionEnvelopeV1({ ...envelope, bindingId: "bad" })).toBe(false);
    expect(isAiGroundedExecutionEnvelopeV1({ ...envelope, executionInputSha256: "bad" })).toBe(
      false,
    );
    expect(
      isAiGroundedExecutionEnvelopeV1({
        ...envelope,
        sourceReceipts: [{ ...envelope.sourceReceipts[0], canonicalUri: "file:///tmp/source" }],
      }),
    ).toBe(false);
    expect(isAiGroundedExecutionEnvelopeV1({ ...envelope, preparedAt: "not-a-date" })).toBe(false);
  });
});
