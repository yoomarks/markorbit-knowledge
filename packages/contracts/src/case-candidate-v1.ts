export const CASE_CANDIDATE_PROTOCOL_VERSION = "1.0" as const;
export const CASE_CANDIDATE_OBJECT_TYPE = "CASE_CANDIDATE" as const;
export const CASE_CANDIDATE_SOURCE_SYSTEM = "MARKREG" as const;

export const CASE_CANDIDATE_ID_PATTERN =
  "^case-candidate_[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$" as const;
export const MARKREG_FORMAL_MATTER_ID_PATTERN =
  "^formal-matter_[a-zA-Z0-9][a-zA-Z0-9._:-]{2,255}$" as const;
export const CASE_CANDIDATE_SNAPSHOT_SHA256_PATTERN = "^[a-f0-9]{64}$" as const;

export const CASE_CANDIDATE_ACCESS_CLASSIFICATIONS = [
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
] as const;

export type CaseCandidateAccessClassification =
  (typeof CASE_CANDIDATE_ACCESS_CLASSIFICATIONS)[number];

export type CaseCandidateAccessScopeV1 = {
  sourceWorkspaceId: string;
  classification: CaseCandidateAccessClassification;
};

/**
 * A promoted pointer to one exact operational MarkReg Formal Matter snapshot.
 * Knowledge owns the candidate identity and later dossier state, but MarkReg
 * remains the source of record for the operational matter.
 */
export type CaseCandidateV1 = {
  protocolVersion: typeof CASE_CANDIDATE_PROTOCOL_VERSION;
  objectType: typeof CASE_CANDIDATE_OBJECT_TYPE;
  candidateId: string;
  sourceSystem: typeof CASE_CANDIDATE_SOURCE_SYSTEM;
  sourceMatterId: string;
  sourceMatterVersion: number;
  sourceSnapshotSha256: string;
  sourceRetrievalRef: string;
  promotedBy: string;
  promotedAt: string;
  operatorCaseValueNote?: string;
  accessScope: CaseCandidateAccessScopeV1;
  idempotencyKey: string;
};

const CANDIDATE_ID = new RegExp(CASE_CANDIDATE_ID_PATTERN, "u");
const MARKREG_FORMAL_MATTER_ID = new RegExp(MARKREG_FORMAL_MATTER_ID_PATTERN, "u");
const SHA256 = new RegExp(CASE_CANDIDATE_SNAPSHOT_SHA256_PATTERN, "u");
const FORBIDDEN_SEMANTIC_KEYS = new Set([
  "lesson",
  "lessons",
  "recommendation",
  "recommendations",
  "bestPractice",
  "successProbability",
  "legalTruthVerified",
  "truthScore",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function onlyAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

function hasForbiddenSemanticKey(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => FORBIDDEN_SEMANTIC_KEYS.has(key));
}

function isAccessScope(value: unknown): value is CaseCandidateAccessScopeV1 {
  const item = record(value);
  if (!item || !onlyAllowedKeys(item, ["sourceWorkspaceId", "classification"])) return false;
  return (
    nonEmpty(item.sourceWorkspaceId) &&
    CASE_CANDIDATE_ACCESS_CLASSIFICATIONS.includes(
      item.classification as CaseCandidateAccessClassification,
    )
  );
}

export function isCaseCandidateV1(value: unknown): value is CaseCandidateV1 {
  const item = record(value);
  if (
    !item ||
    hasForbiddenSemanticKey(item) ||
    !onlyAllowedKeys(item, [
      "protocolVersion",
      "objectType",
      "candidateId",
      "sourceSystem",
      "sourceMatterId",
      "sourceMatterVersion",
      "sourceSnapshotSha256",
      "sourceRetrievalRef",
      "promotedBy",
      "promotedAt",
      "operatorCaseValueNote",
      "accessScope",
      "idempotencyKey",
    ])
  ) {
    return false;
  }

  return (
    item.protocolVersion === CASE_CANDIDATE_PROTOCOL_VERSION &&
    item.objectType === CASE_CANDIDATE_OBJECT_TYPE &&
    typeof item.candidateId === "string" &&
    CANDIDATE_ID.test(item.candidateId) &&
    item.sourceSystem === CASE_CANDIDATE_SOURCE_SYSTEM &&
    typeof item.sourceMatterId === "string" &&
    MARKREG_FORMAL_MATTER_ID.test(item.sourceMatterId) &&
    typeof item.sourceMatterVersion === "number" &&
    Number.isSafeInteger(item.sourceMatterVersion) &&
    item.sourceMatterVersion >= 1 &&
    typeof item.sourceSnapshotSha256 === "string" &&
    SHA256.test(item.sourceSnapshotSha256) &&
    nonEmpty(item.sourceRetrievalRef) &&
    nonEmpty(item.promotedBy) &&
    timestamp(item.promotedAt) &&
    (item.operatorCaseValueNote === undefined || nonEmpty(item.operatorCaseValueNote)) &&
    isAccessScope(item.accessScope) &&
    nonEmpty(item.idempotencyKey) &&
    item.idempotencyKey.length >= 8 &&
    item.idempotencyKey.length <= 200
  );
}

export function assertCaseCandidateV1(value: unknown): asserts value is CaseCandidateV1 {
  if (!isCaseCandidateV1(value)) throw new TypeError("Invalid CaseCandidateV1");
}

/**
 * Stable natural identity for idempotent intake. Promotion metadata, operator
 * notes and the Knowledge candidate ID are intentionally excluded.
 */
export function caseCandidateSourceIdentityKeyV1(
  value: Pick<
    CaseCandidateV1,
    | "sourceSystem"
    | "sourceMatterId"
    | "sourceMatterVersion"
    | "sourceSnapshotSha256"
    | "accessScope"
  >,
): string {
  return [
    CASE_CANDIDATE_PROTOCOL_VERSION,
    value.sourceSystem,
    value.accessScope.sourceWorkspaceId.trim().toLowerCase(),
    value.sourceMatterId,
    String(value.sourceMatterVersion),
    value.sourceSnapshotSha256,
  ].join("\u001f");
}
