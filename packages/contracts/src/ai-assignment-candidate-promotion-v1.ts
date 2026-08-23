export const AI_ASSIGNMENT_CANDIDATE_PROMOTION_PROTOCOL_VERSION = "1.0" as const;
export const AI_ASSIGNMENT_CANDIDATE_PROMOTION_OBJECT_TYPE =
  "AI_ASSIGNMENT_CANDIDATE_PROMOTION" as const;

export type AiAssignmentCandidatePromotionV1 = {
  protocolVersion: typeof AI_ASSIGNMENT_CANDIDATE_PROMOTION_PROTOCOL_VERSION;
  objectType: typeof AI_ASSIGNMENT_CANDIDATE_PROMOTION_OBJECT_TYPE;
  promotionId: string;
  candidateId: string;
  approvalRef: string;
  approvedBy: string;
  targetAssignmentId: string;
  libraryId: string;
  baseLibraryRevision: number;
  resultingLibraryRevision: number;
  workflow: string;
  tags: readonly string[];
  graphId: string;
  baseGraphRevision: number;
  resultingGraphRevision: number;
  status: "PROMOTED";
  boundaries: {
    automaticApproval: false;
    executionAuthorityGranted: false;
    legalTruthVerified: false;
  };
  promotedAt: string;
};

const ID = /^[a-z][a-z0-9_]{2,127}$/u;
const WORKFLOW = /^[A-Z][A-Z0-9_]{1,63}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function isAiAssignmentCandidatePromotionV1(
  value: unknown,
): value is AiAssignmentCandidatePromotionV1 {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "protocolVersion",
      "objectType",
      "promotionId",
      "candidateId",
      "approvalRef",
      "approvedBy",
      "targetAssignmentId",
      "libraryId",
      "baseLibraryRevision",
      "resultingLibraryRevision",
      "workflow",
      "tags",
      "graphId",
      "baseGraphRevision",
      "resultingGraphRevision",
      "status",
      "boundaries",
      "promotedAt",
    ])
  ) {
    return false;
  }

  const boundaries = record(item.boundaries);
  return Boolean(
    item.protocolVersion === AI_ASSIGNMENT_CANDIDATE_PROMOTION_PROTOCOL_VERSION &&
    item.objectType === AI_ASSIGNMENT_CANDIDATE_PROMOTION_OBJECT_TYPE &&
    typeof item.promotionId === "string" &&
    item.promotionId.startsWith("kap_") &&
    ID.test(item.promotionId) &&
    typeof item.candidateId === "string" &&
    item.candidateId.startsWith("kac_") &&
    ID.test(item.candidateId) &&
    nonEmpty(item.approvalRef) &&
    nonEmpty(item.approvedBy) &&
    typeof item.targetAssignmentId === "string" &&
    item.targetAssignmentId.startsWith("kas_") &&
    ID.test(item.targetAssignmentId) &&
    typeof item.libraryId === "string" &&
    item.libraryId.startsWith("kal_") &&
    ID.test(item.libraryId) &&
    Number.isSafeInteger(item.baseLibraryRevision) &&
    (item.baseLibraryRevision as number) > 0 &&
    item.resultingLibraryRevision === (item.baseLibraryRevision as number) + 1 &&
    typeof item.workflow === "string" &&
    WORKFLOW.test(item.workflow) &&
    Array.isArray(item.tags) &&
    item.tags.length > 0 &&
    item.tags.every(nonEmpty) &&
    new Set(item.tags as string[]).size === item.tags.length &&
    typeof item.graphId === "string" &&
    item.graphId.startsWith("kag_") &&
    ID.test(item.graphId) &&
    Number.isSafeInteger(item.baseGraphRevision) &&
    (item.baseGraphRevision as number) > 0 &&
    item.resultingGraphRevision === (item.baseGraphRevision as number) + 1 &&
    item.status === "PROMOTED" &&
    boundaries &&
    exactKeys(boundaries, [
      "automaticApproval",
      "executionAuthorityGranted",
      "legalTruthVerified",
    ]) &&
    boundaries.automaticApproval === false &&
    boundaries.executionAuthorityGranted === false &&
    boundaries.legalTruthVerified === false &&
    timestamp(item.promotedAt),
  );
}

export function assertAiAssignmentCandidatePromotionV1(
  value: unknown,
): asserts value is AiAssignmentCandidatePromotionV1 {
  if (!isAiAssignmentCandidatePromotionV1(value)) {
    throw new TypeError("Invalid AiAssignmentCandidatePromotionV1");
  }
}
