export const CASE_CANDIDATE_INTAKE_PROTOCOL_VERSION = "1.0" as const;
export const CASE_CANDIDATE_INTAKE_OBJECT_TYPE = "CASE_CANDIDATE_INTAKE" as const;

export const CASE_CANDIDATE_COLLECTION_STATES = [
  "PENDING",
  "WAITING_SOURCE",
  "COLLECTED",
] as const;
export type CaseCandidateCollectionState = (typeof CASE_CANDIDATE_COLLECTION_STATES)[number];

export type CaseCandidateSourceUnavailableV1 = {
  code: string;
  message: string;
  observedAt: string;
  retryable: true;
};

/**
 * Durable Knowledge-side intake state for a promoted Case Candidate.
 * PENDING means collection work has been durably queued, not completed.
 * WAITING_SOURCE preserves the candidate when its source is temporarily unavailable.
 * COLLECTED points at an immutable Knowledge evidence snapshot; MarkReg remains
 * the operational system of record.
 */
export type CaseCandidateIntakeV1 = {
  protocolVersion: typeof CASE_CANDIDATE_INTAKE_PROTOCOL_VERSION;
  objectType: typeof CASE_CANDIDATE_INTAKE_OBJECT_TYPE;
  candidateId: string;
  sourceIdentitySha256: string;
  collectionState: CaseCandidateCollectionState;
  acceptedAt: string;
  updatedAt: string;
  sourceUnavailable?: CaseCandidateSourceUnavailableV1;
  collectionRef?: string;
  collectedAt?: string;
};

const SHA256 = /^[a-f0-9]{64}$/u;

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

function sourceUnavailable(value: unknown): value is CaseCandidateSourceUnavailableV1 {
  const item = record(value);
  if (!item) return false;
  return (
    Object.keys(item).every((key) =>
      ["code", "message", "observedAt", "retryable"].includes(key),
    ) &&
    nonEmpty(item.code) &&
    nonEmpty(item.message) &&
    timestamp(item.observedAt) &&
    item.retryable === true
  );
}

export function isCaseCandidateIntakeV1(value: unknown): value is CaseCandidateIntakeV1 {
  const item = record(value);
  if (!item) return false;
  if (
    !Object.keys(item).every((key) =>
      [
        "protocolVersion",
        "objectType",
        "candidateId",
        "sourceIdentitySha256",
        "collectionState",
        "acceptedAt",
        "updatedAt",
        "sourceUnavailable",
        "collectionRef",
        "collectedAt",
      ].includes(key),
    )
  ) {
    return false;
  }

  if (
    item.protocolVersion !== CASE_CANDIDATE_INTAKE_PROTOCOL_VERSION ||
    item.objectType !== CASE_CANDIDATE_INTAKE_OBJECT_TYPE ||
    !nonEmpty(item.candidateId) ||
    typeof item.sourceIdentitySha256 !== "string" ||
    !SHA256.test(item.sourceIdentitySha256) ||
    !CASE_CANDIDATE_COLLECTION_STATES.includes(
      item.collectionState as CaseCandidateCollectionState,
    ) ||
    !timestamp(item.acceptedAt) ||
    !timestamp(item.updatedAt)
  ) {
    return false;
  }

  if (item.collectionState === "WAITING_SOURCE") {
    return (
      sourceUnavailable(item.sourceUnavailable) &&
      item.collectionRef === undefined &&
      item.collectedAt === undefined
    );
  }

  if (item.collectionState === "COLLECTED") {
    return (
      item.sourceUnavailable === undefined &&
      nonEmpty(item.collectionRef) &&
      timestamp(item.collectedAt)
    );
  }

  return (
    item.sourceUnavailable === undefined &&
    item.collectionRef === undefined &&
    item.collectedAt === undefined
  );
}

export function assertCaseCandidateIntakeV1(
  value: unknown,
): asserts value is CaseCandidateIntakeV1 {
  if (!isCaseCandidateIntakeV1(value)) throw new TypeError("Invalid CaseCandidateIntakeV1");
}
