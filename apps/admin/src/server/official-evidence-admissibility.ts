export type OfficialEvidenceRole = "NUMERIC_AUTHORITY" | "APPLICABILITY_CONTEXT";

export type OfficialEvidenceTemporalStatus = "CURRENT" | "STALE" | "UNRESOLVED";
export type OfficialEvidenceConflictStatus = "NONE" | "UNRESOLVED";
export type OfficialEvidenceSupersessionStatus = "CURRENT" | "SUPERSEDED" | "UNRESOLVED";

export type OfficialEvidenceItem = {
  role: OfficialEvidenceRole;
  sourceUri: string;
  documentId: string;
  documentContentSha256: string;
  chunkId: string;
  chunkContentSha256: string;
  indexedAt: string;
  effectiveAt: string | null;
  expiresAt: string | null;
  supersedesDocumentId: string | null;
  temporalStatus: OfficialEvidenceTemporalStatus;
  conflictStatus: OfficialEvidenceConflictStatus;
  supersessionStatus: OfficialEvidenceSupersessionStatus;
};

export type OfficialEvidenceAuthorityRequirement = {
  role: OfficialEvidenceRole;
  canonicalUri: string;
};

export type OfficialEvidenceAdmissibilityPolicy = {
  schemaVersion: "1.0";
  authorities: readonly OfficialEvidenceAuthorityRequirement[];
};

export type OfficialEvidenceFailClosedReason =
  | "MISSING_REQUIRED_AUTHORITY"
  | "DUPLICATE_AUTHORITY_ROLE"
  | "SOURCE_IDENTITY_MISMATCH"
  | "INCOMPLETE_LINEAGE"
  | "INVALID_LINEAGE_HASH"
  | "INVALID_INDEXED_AT"
  | "MISSING_EFFECTIVE_AT"
  | "INVALID_EFFECTIVE_AT"
  | "INVALID_EXPIRES_AT"
  | "TEMPORAL_STATUS_UNRESOLVED"
  | "STALE_EVIDENCE"
  | "UNRESOLVED_CONFLICT"
  | "SUPERSESSION_STATUS_UNRESOLVED"
  | "SUPERSEDED_EVIDENCE";

export type OfficialEvidenceAdmissibilityResult =
  | {
      status: "ADMISSIBLE";
      evidence: readonly OfficialEvidenceItem[];
      reasons: readonly [];
    }
  | {
      status: "FAIL_CLOSED";
      evidence: readonly OfficialEvidenceItem[];
      reasons: readonly OfficialEvidenceFailClosedReason[];
    };

const SHA256 = /^[a-f0-9]{64}$/;

function isNonEmptyTrimmed(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

function isValidDateTime(value: string): boolean {
  return isNonEmptyTrimmed(value) && !Number.isNaN(Date.parse(value));
}

function hasCompleteLineage(item: OfficialEvidenceItem): boolean {
  return (
    isNonEmptyTrimmed(item.documentId) &&
    isNonEmptyTrimmed(item.chunkId) &&
    isNonEmptyTrimmed(item.documentContentSha256) &&
    isNonEmptyTrimmed(item.chunkContentSha256)
  );
}

function addReason(
  reasons: OfficialEvidenceFailClosedReason[],
  reason: OfficialEvidenceFailClosedReason,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

/**
 * Evaluates whether official-source evidence is safe to admit into a downstream
 * research package. This gate intentionally does not interpret legal meaning,
 * parse fee amounts, or promote evidence to legal truth.
 */
export function evaluateOfficialEvidenceAdmissibility(
  policy: OfficialEvidenceAdmissibilityPolicy,
  evidence: readonly OfficialEvidenceItem[],
): OfficialEvidenceAdmissibilityResult {
  const reasons: OfficialEvidenceFailClosedReason[] = [];

  for (const requirement of policy.authorities) {
    const matches = evidence.filter((item) => item.role === requirement.role);
    if (matches.length === 0) {
      addReason(reasons, "MISSING_REQUIRED_AUTHORITY");
      continue;
    }
    if (matches.length > 1) addReason(reasons, "DUPLICATE_AUTHORITY_ROLE");

    for (const item of matches) {
      if (item.sourceUri !== requirement.canonicalUri) {
        addReason(reasons, "SOURCE_IDENTITY_MISMATCH");
      }
    }
  }

  for (const item of evidence) {
    const knownRole = policy.authorities.some((requirement) => requirement.role === item.role);
    if (!knownRole) addReason(reasons, "SOURCE_IDENTITY_MISMATCH");

    if (!hasCompleteLineage(item)) addReason(reasons, "INCOMPLETE_LINEAGE");
    if (!SHA256.test(item.documentContentSha256) || !SHA256.test(item.chunkContentSha256)) {
      addReason(reasons, "INVALID_LINEAGE_HASH");
    }
    if (!isValidDateTime(item.indexedAt)) addReason(reasons, "INVALID_INDEXED_AT");

    if (item.effectiveAt === null) {
      addReason(reasons, "MISSING_EFFECTIVE_AT");
    } else if (!isValidDateTime(item.effectiveAt)) {
      addReason(reasons, "INVALID_EFFECTIVE_AT");
    }
    if (item.expiresAt !== null && !isValidDateTime(item.expiresAt)) {
      addReason(reasons, "INVALID_EXPIRES_AT");
    }

    if (item.temporalStatus === "UNRESOLVED") {
      addReason(reasons, "TEMPORAL_STATUS_UNRESOLVED");
    } else if (item.temporalStatus === "STALE") {
      addReason(reasons, "STALE_EVIDENCE");
    }

    if (item.conflictStatus === "UNRESOLVED") addReason(reasons, "UNRESOLVED_CONFLICT");

    if (item.supersessionStatus === "UNRESOLVED") {
      addReason(reasons, "SUPERSESSION_STATUS_UNRESOLVED");
    } else if (item.supersessionStatus === "SUPERSEDED") {
      addReason(reasons, "SUPERSEDED_EVIDENCE");
    }
  }

  if (reasons.length > 0) {
    return { status: "FAIL_CLOSED", evidence, reasons };
  }
  return { status: "ADMISSIBLE", evidence, reasons: [] };
}
