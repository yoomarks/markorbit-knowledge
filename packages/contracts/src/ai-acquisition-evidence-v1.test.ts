import { describe, expect, it } from "vitest";
import {
  AI_ACQUISITION_EVIDENCE_OBJECT_TYPE,
  AI_ACQUISITION_EVIDENCE_PROTOCOL_VERSION,
  isAiAcquisitionEvidenceV1,
  type AiAcquisitionEvidenceV1,
} from "./ai-acquisition-evidence-v1";

const evidence: AiAcquisitionEvidenceV1 = {
  protocolVersion: AI_ACQUISITION_EVIDENCE_PROTOCOL_VERSION,
  objectType: AI_ACQUISITION_EVIDENCE_OBJECT_TYPE,
  evidenceId: `aie_${"a".repeat(32)}`,
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  requestId: "brain-request-001",
  authorizationRef: "core:ai-acquisition:approval-001",
  executionInputSha256: "b".repeat(64),
  provider: "OPENAI",
  model: "gpt-test",
  requestedAt: "2026-09-16T08:00:00.000Z",
  completedAt: "2026-09-16T08:00:01.000Z",
  rawResponseSha256: "c".repeat(64),
  rawResponseSizeBytes: 1024,
  rawResponseMediaType: "application/json",
  rawResponseContentAddressedRef: `cas:sha256:${"c".repeat(64)}`,
  providerRequestId: "provider-request-001",
  provenance: {
    sourceKind: "SYNTHETIC_AI",
    exactProviderResponsePreserved: true,
    legalTruthVerified: false,
    semanticMeaningAssigned: false,
    providerQualityRanked: false,
    candidateAutoActivationAuthorized: false,
    downstreamExecutionAuthorityGranted: false,
  },
};

describe("AiAcquisitionEvidenceV1", () => {
  it("accepts bounded provider evidence without cognitive meaning", () => {
    expect(isAiAcquisitionEvidenceV1(evidence)).toBe(true);
  });

  it("rejects provider expansion outside the frozen Evidence Plane set", () => {
    expect(isAiAcquisitionEvidenceV1({ ...evidence, provider: "KIMI" })).toBe(false);
  });

  it("rejects semantic, truth, ranking or downstream authority escalation", () => {
    for (const key of [
      "legalTruthVerified",
      "semanticMeaningAssigned",
      "providerQualityRanked",
      "candidateAutoActivationAuthorized",
      "downstreamExecutionAuthorityGranted",
    ] as const) {
      expect(
        isAiAcquisitionEvidenceV1({
          ...evidence,
          provenance: { ...evidence.provenance, [key]: true },
        }),
      ).toBe(false);
    }
  });

  it("rejects cognitive fields even when evidence fields remain valid", () => {
    expect(
      isAiAcquisitionEvidenceV1({
        ...evidence,
        prompt: "decide what the law means",
      }),
    ).toBe(false);
    expect(
      isAiAcquisitionEvidenceV1({
        ...evidence,
        instructionSetId: "kis_research_strategy",
      }),
    ).toBe(false);
    expect(
      isAiAcquisitionEvidenceV1({
        ...evidence,
        distilledContent: "a legal conclusion",
      }),
    ).toBe(false);
  });

  it("rejects broken raw-response identity and impossible timing", () => {
    expect(
      isAiAcquisitionEvidenceV1({ ...evidence, rawResponseContentAddressedRef: "cas:bad" }),
    ).toBe(false);
    expect(
      isAiAcquisitionEvidenceV1({
        ...evidence,
        completedAt: "2026-09-16T07:59:59.000Z",
      }),
    ).toBe(false);
  });
});
