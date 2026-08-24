import { describe, expect, it } from "vitest";
import {
  AI_GROUNDED_PREPARED_EVIDENCE_OBJECT_TYPE,
  AI_GROUNDED_PREPARED_EVIDENCE_PROTOCOL_VERSION,
  isAiGroundedPreparedExecutionEvidenceV1,
  type AiGroundedPreparedExecutionEvidenceV1,
} from "./ai-grounded-prepared-evidence-v1";

const evidence: AiGroundedPreparedExecutionEvidenceV1 = {
  protocolVersion: AI_GROUNDED_PREPARED_EVIDENCE_PROTOCOL_VERSION,
  objectType: AI_GROUNDED_PREPARED_EVIDENCE_OBJECT_TYPE,
  executionInputSha256: "a".repeat(64),
  assignmentId: "kas_us_trademark_section_8",
  bindingId: "asb_us_trademark_section_8_official",
  sourcePackId: "asp_us_trademark_section_8_official",
  sourcePackRevision: 1,
  rendererVersion: "1.0.0",
  renderedPromptSha256: "b".repeat(64),
  sourceReceiptsSha256: "c".repeat(64),
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
  promptArtifact: {
    artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAW",
    contentSha256: "b".repeat(64),
    sizeBytes: 4096,
    canonicalUri: `ai+markorbit://grounded-executions/${"a".repeat(64)}/prompt`,
    sourceUri: `ai+markorbit://grounded-executions/${"a".repeat(64)}/rendered-prompt`,
  },
  canonicalPreparedAt: "2026-08-24T10:00:00.000Z",
  persistedAt: "2026-08-24T10:01:00.000Z",
  providerCallAuthorized: false,
  providerCallExecuted: false,
  externalBrowsingAllowed: false,
  legalTruthVerified: false,
  executionAuthorityGranted: false,
};

describe("AiGroundedPreparedExecutionEvidenceV1", () => {
  it("accepts immutable no-provider PREPARED evidence", () => {
    expect(isAiGroundedPreparedExecutionEvidenceV1(evidence)).toBe(true);
  });

  it("rejects authority escalation and malformed prompt artifact identity", () => {
    expect(
      isAiGroundedPreparedExecutionEvidenceV1({
        ...evidence,
        providerCallExecuted: true,
      }),
    ).toBe(false);
    expect(
      isAiGroundedPreparedExecutionEvidenceV1({
        ...evidence,
        promptArtifact: { ...evidence.promptArtifact, artifactId: "art_invalid" },
      }),
    ).toBe(false);
  });

  it("rejects duplicate source or artifact identities", () => {
    expect(
      isAiGroundedPreparedExecutionEvidenceV1({
        ...evidence,
        sourceReceipts: [evidence.sourceReceipts[0], evidence.sourceReceipts[0]],
      }),
    ).toBe(false);
  });
});
