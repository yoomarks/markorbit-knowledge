export const USPTO_OFFICIAL_FEE_PILOT_V1 = {
  schemaVersion: "1.0",
  pilotId: "phase2-uspto-base-application-fee",
  jurisdiction: "US",
  authority: {
    owner: "United States Patent and Trademark Office",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
  },
  operation: {
    operationKey: "US_TRADEMARK_BASE_APPLICATION_SECTION_1_OR_44_PER_CLASS",
    subject: "TRADEMARK_APPLICATION",
    filingBases: ["SECTION_1", "SECTION_44"],
    unit: "PER_CLASS",
  },
  sourceSet: {
    primaryNumeric: {
      role: "PRIMARY_NUMERIC",
      domain: "FEE",
      uri: "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule",
      requiredSemanticAnchors: ["Base application, per class", "7017", "2.6(a)(1)(iii)"],
    },
    secondaryApplicabilityContext: {
      role: "SECONDARY_APPLICABILITY_CONTEXT",
      domain: "FEE",
      uri: "https://www.uspto.gov/trademarks/trademark-fee-information",
      requiredSemanticAnchors: [
        "Base application filing fee",
        "Section 1",
        "Section 44",
        "per class",
      ],
    },
  },
  lineagePolicy: {
    versionIdentity: "CONTENT_SHA256",
    requireChunkId: true,
    requireContentSha256: true,
    requireIndexedAt: true,
    requireSourceUri: true,
    requireExplicitVersionState: true,
  },
  resolutionPolicy: {
    amountStorage: "SOURCE_CONTENT_ONLY",
    hardcodedAmountAllowed: false,
    staleEvidenceBehavior: "FAIL_CLOSED",
    conflictingEvidenceBehavior: "FAIL_CLOSED",
    missingLineageBehavior: "FAIL_CLOSED",
    unresolvedTemporalStateBehavior: "FAIL_CLOSED",
  },
} as const;

export type UsptoOfficialFeePilotV1 = typeof USPTO_OFFICIAL_FEE_PILOT_V1;
export type UsptoOfficialFeeSourceRole = "PRIMARY_NUMERIC" | "SECONDARY_APPLICABILITY_CONTEXT";
export type UsptoOfficialFeeSourceVersionState = "CURRENT_CANONICAL" | "SUPERSEDED" | "UNKNOWN";

export interface UsptoOfficialFeeEvidenceObservationV1 {
  role: UsptoOfficialFeeSourceRole;
  sourceUri: string;
  documentContentSha256: string;
  chunkId: string;
  chunkContentSha256: string;
  indexedAt: string;
  versionState: UsptoOfficialFeeSourceVersionState;
}

export type UsptoOfficialFeeEvidenceReadinessReason =
  | "MISSING_PRIMARY"
  | "MISSING_SECONDARY"
  | "MISSING_LINEAGE"
  | "OUT_OF_SCOPE_SOURCE"
  | "ROLE_SOURCE_MISMATCH"
  | "STALE_SOURCE_VERSION"
  | "TEMPORAL_STATE_UNRESOLVED"
  | "CONFLICTING_SOURCE_VERSION";

export type UsptoOfficialFeeEvidenceReadinessV1 =
  | {
      status: "READY_FOR_BRAIN_RESEARCH";
      primary: Readonly<UsptoOfficialFeeEvidenceObservationV1>;
      secondary: Readonly<UsptoOfficialFeeEvidenceObservationV1>;
    }
  | {
      status: "FAIL_CLOSED";
      reasons: readonly UsptoOfficialFeeEvidenceReadinessReason[];
    };

const SHA256 = /^[a-f0-9]{64}$/;

function canonicalUri(uri: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.uspto.gov") return undefined;
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString().replace(/\/$/, "");
}

export function getUsptoOfficialFeePilotSourceRole(
  uri: string,
): UsptoOfficialFeeSourceRole | undefined {
  const normalized = canonicalUri(uri);
  if (!normalized) return undefined;
  if (normalized === USPTO_OFFICIAL_FEE_PILOT_V1.sourceSet.primaryNumeric.uri) {
    return "PRIMARY_NUMERIC";
  }
  if (normalized === USPTO_OFFICIAL_FEE_PILOT_V1.sourceSet.secondaryApplicabilityContext.uri) {
    return "SECONDARY_APPLICABILITY_CONTEXT";
  }
  return undefined;
}

export function isUsptoOfficialFeePilotSourceUri(uri: string): boolean {
  return getUsptoOfficialFeePilotSourceRole(uri) !== undefined;
}

function hasCompleteLineage(observation: UsptoOfficialFeeEvidenceObservationV1): boolean {
  return (
    SHA256.test(observation.documentContentSha256) &&
    observation.chunkId.trim().length > 0 &&
    SHA256.test(observation.chunkContentSha256) &&
    !Number.isNaN(Date.parse(observation.indexedAt))
  );
}

function uniqueReasons(
  reasons: readonly UsptoOfficialFeeEvidenceReadinessReason[],
): UsptoOfficialFeeEvidenceReadinessReason[] {
  return [...new Set(reasons)].sort();
}

export function assessUsptoOfficialFeeEvidenceSetV1(
  observations: readonly Readonly<UsptoOfficialFeeEvidenceObservationV1>[],
): UsptoOfficialFeeEvidenceReadinessV1 {
  const reasons: UsptoOfficialFeeEvidenceReadinessReason[] = [];
  const byRole = new Map<UsptoOfficialFeeSourceRole, UsptoOfficialFeeEvidenceObservationV1[]>();

  for (const observation of observations) {
    const expectedRole = getUsptoOfficialFeePilotSourceRole(observation.sourceUri);
    if (!expectedRole) {
      reasons.push("OUT_OF_SCOPE_SOURCE");
      continue;
    }
    if (expectedRole !== observation.role) reasons.push("ROLE_SOURCE_MISMATCH");
    if (!hasCompleteLineage(observation)) reasons.push("MISSING_LINEAGE");
    if (observation.versionState === "SUPERSEDED") reasons.push("STALE_SOURCE_VERSION");
    if (observation.versionState === "UNKNOWN") reasons.push("TEMPORAL_STATE_UNRESOLVED");

    const roleObservations = byRole.get(observation.role) ?? [];
    roleObservations.push({ ...observation });
    byRole.set(observation.role, roleObservations);
  }

  const primary = byRole.get("PRIMARY_NUMERIC") ?? [];
  const secondary = byRole.get("SECONDARY_APPLICABILITY_CONTEXT") ?? [];
  if (!primary.length) reasons.push("MISSING_PRIMARY");
  if (!secondary.length) reasons.push("MISSING_SECONDARY");

  for (const roleObservations of [primary, secondary]) {
    const current = roleObservations.filter(
      (observation) => observation.versionState === "CURRENT_CANONICAL",
    );
    const identities = new Set(current.map((observation) => observation.documentContentSha256));
    if (identities.size > 1) reasons.push("CONFLICTING_SOURCE_VERSION");
  }

  if (reasons.length) {
    return { status: "FAIL_CLOSED", reasons: uniqueReasons(reasons) };
  }

  if (primary.length !== 1 || secondary.length !== 1) {
    return { status: "FAIL_CLOSED", reasons: ["CONFLICTING_SOURCE_VERSION"] };
  }

  return {
    status: "READY_FOR_BRAIN_RESEARCH",
    primary: { ...primary[0]! },
    secondary: { ...secondary[0]! },
  };
}
