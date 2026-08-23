import { describe, expect, it } from "vitest";
import {
  isAiAssignmentCandidatePromotionV1,
  type AiAssignmentCandidatePromotionV1,
} from "./ai-assignment-candidate-promotion-v1";

const promotion = (): AiAssignmentCandidatePromotionV1 => ({
  protocolVersion: "1.0",
  objectType: "AI_ASSIGNMENT_CANDIDATE_PROMOTION",
  promotionId: "kap_us_trademark_specimen_follow_up",
  candidateId: "kac_us_trademark_specimen_follow_up",
  approvalRef: "approval/adk-09/specimen-follow-up",
  approvedBy: "knowledge-operator",
  targetAssignmentId: "kas_us_trademark_specimen_follow_up",
  libraryId: "kal_us_trademark_core",
  baseLibraryRevision: 1,
  resultingLibraryRevision: 2,
  workflow: "SPECIMEN",
  tags: ["specimen", "evidence"],
  graphId: "kag_us_trademark_specimen",
  baseGraphRevision: 1,
  resultingGraphRevision: 2,
  status: "PROMOTED",
  boundaries: {
    automaticApproval: false,
    executionAuthorityGranted: false,
    legalTruthVerified: false,
  },
  promotedAt: "2026-08-24T01:00:00.000Z",
});

describe("AiAssignmentCandidatePromotionV1", () => {
  it("accepts an explicit governed promotion receipt", () => {
    expect(isAiAssignmentCandidatePromotionV1(promotion())).toBe(true);
  });

  it("requires consecutive resulting revisions", () => {
    expect(
      isAiAssignmentCandidatePromotionV1({
        ...promotion(),
        resultingGraphRevision: 3,
      }),
    ).toBe(false);
    expect(
      isAiAssignmentCandidatePromotionV1({
        ...promotion(),
        resultingLibraryRevision: 3,
      }),
    ).toBe(false);
  });

  it("rejects automatic approval and downstream authority escalation", () => {
    expect(
      isAiAssignmentCandidatePromotionV1({
        ...promotion(),
        boundaries: {
          ...promotion().boundaries,
          automaticApproval: true,
        },
      }),
    ).toBe(false);
    expect(
      isAiAssignmentCandidatePromotionV1({
        ...promotion(),
        boundaries: {
          ...promotion().boundaries,
          executionAuthorityGranted: true,
        },
      }),
    ).toBe(false);
  });

  it("requires an approval reference, operator identity and governed workflow tags", () => {
    expect(isAiAssignmentCandidatePromotionV1({ ...promotion(), approvalRef: "" })).toBe(false);
    expect(isAiAssignmentCandidatePromotionV1({ ...promotion(), approvedBy: "" })).toBe(false);
    expect(isAiAssignmentCandidatePromotionV1({ ...promotion(), workflow: "specimen" })).toBe(
      false,
    );
    expect(isAiAssignmentCandidatePromotionV1({ ...promotion(), tags: [] })).toBe(false);
  });
});
