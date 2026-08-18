import {
  GLOBAL_REFERENCE_AUTHORITY_TIERS,
  GLOBAL_REFERENCE_CONTENT_REUSE_POLICIES,
  GLOBAL_REFERENCE_FACT_ELIGIBILITY,
  GLOBAL_REFERENCE_INTENDED_USES,
  GLOBAL_REFERENCE_SOURCE_PROTOCOL_VERSION,
  GLOBAL_REFERENCE_SOURCE_ROLES,
  GLOBAL_REFERENCE_VERIFICATION_POLICIES,
  type GlobalReferenceAuthorityTier,
  type GlobalReferenceContentReusePolicy,
  type GlobalReferenceFactEligibility,
  type GlobalReferenceIntendedUse,
  type GlobalReferenceSourceRole,
  type GlobalReferenceVerificationPolicy,
} from "./global-reference-source-v1";
import {
  assertReadyPackageContentExportV1,
  type ReadyPackageContentExportV1,
} from "./ready-package-content-export-v1";

export const READY_PACKAGE_CONTENT_EXPORT_V1_1_VERSION = "1.1" as const;
export const SOURCE_GOVERNANCE_SNAPSHOT_VERSION = "1.0" as const;

export type StandardSourceGovernanceSnapshotV1 = {
  snapshotVersion: typeof SOURCE_GOVERNANCE_SNAPSHOT_VERSION;
  kind: "STANDARD_SOURCE";
  sourceId: string;
};

export type GlobalReferenceSourceGovernanceSnapshotV1 = {
  snapshotVersion: typeof SOURCE_GOVERNANCE_SNAPSHOT_VERSION;
  kind: "GLOBAL_REFERENCE";
  sourceId: string;
  referenceProtocolVersion: typeof GLOBAL_REFERENCE_SOURCE_PROTOCOL_VERSION;
  sourceRole: GlobalReferenceSourceRole;
  authorityTier: GlobalReferenceAuthorityTier;
  intendedUses: GlobalReferenceIntendedUse[];
  factEligibility: GlobalReferenceFactEligibility;
  verification: {
    policy: GlobalReferenceVerificationPolicy;
    verifyAgainstSourceIds: string[];
    verifyAgainstJurisdictionOfficialSource: boolean;
  };
  contentReusePolicy: GlobalReferenceContentReusePolicy;
};

export type SourceGovernanceSnapshotV1 =
  | StandardSourceGovernanceSnapshotV1
  | GlobalReferenceSourceGovernanceSnapshotV1;

export type ReadyPackageContentExportV1_1 = Omit<ReadyPackageContentExportV1, "contractVersion"> & {
  contractVersion: typeof READY_PACKAGE_CONTENT_EXPORT_V1_1_VERSION;
  sourceGovernance: SourceGovernanceSnapshotV1;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function nonEmptyStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function uniqueStrings(value: string[]): boolean {
  return new Set(value).size === value.length;
}

export function isSourceGovernanceSnapshotV1(value: unknown): value is SourceGovernanceSnapshotV1 {
  if (!isRecord(value) || value.snapshotVersion !== SOURCE_GOVERNANCE_SNAPSHOT_VERSION) return false;
  if (value.kind === "STANDARD_SOURCE") {
    return (
      exactKeys(value, ["snapshotVersion", "kind", "sourceId"]) &&
      typeof value.sourceId === "string" &&
      value.sourceId.trim().length > 0
    );
  }
  if (
    value.kind !== "GLOBAL_REFERENCE" ||
    !exactKeys(value, [
      "snapshotVersion",
      "kind",
      "sourceId",
      "referenceProtocolVersion",
      "sourceRole",
      "authorityTier",
      "intendedUses",
      "factEligibility",
      "verification",
      "contentReusePolicy",
    ]) ||
    typeof value.sourceId !== "string" ||
    !value.sourceId.trim() ||
    value.referenceProtocolVersion !== GLOBAL_REFERENCE_SOURCE_PROTOCOL_VERSION ||
    typeof value.sourceRole !== "string" ||
    !GLOBAL_REFERENCE_SOURCE_ROLES.includes(value.sourceRole as GlobalReferenceSourceRole) ||
    typeof value.authorityTier !== "string" ||
    !GLOBAL_REFERENCE_AUTHORITY_TIERS.includes(
      value.authorityTier as GlobalReferenceAuthorityTier,
    ) ||
    !nonEmptyStrings(value.intendedUses) ||
    !uniqueStrings(value.intendedUses) ||
    !value.intendedUses.every((item) =>
      GLOBAL_REFERENCE_INTENDED_USES.includes(item as GlobalReferenceIntendedUse),
    ) ||
    typeof value.factEligibility !== "string" ||
    !GLOBAL_REFERENCE_FACT_ELIGIBILITY.includes(
      value.factEligibility as GlobalReferenceFactEligibility,
    ) ||
    !isRecord(value.verification) ||
    !exactKeys(value.verification, [
      "policy",
      "verifyAgainstSourceIds",
      "verifyAgainstJurisdictionOfficialSource",
    ]) ||
    typeof value.verification.policy !== "string" ||
    !GLOBAL_REFERENCE_VERIFICATION_POLICIES.includes(
      value.verification.policy as GlobalReferenceVerificationPolicy,
    ) ||
    !Array.isArray(value.verification.verifyAgainstSourceIds) ||
    !value.verification.verifyAgainstSourceIds.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    ) ||
    !uniqueStrings(value.verification.verifyAgainstSourceIds as string[]) ||
    typeof value.verification.verifyAgainstJurisdictionOfficialSource !== "boolean" ||
    typeof value.contentReusePolicy !== "string" ||
    !GLOBAL_REFERENCE_CONTENT_REUSE_POLICIES.includes(
      value.contentReusePolicy as GlobalReferenceContentReusePolicy,
    )
  ) {
    return false;
  }
  return true;
}

function asLegacyV1(value: ReadyPackageContentExportV1_1): ReadyPackageContentExportV1 {
  return {
    contractVersion: "1.0",
    objectType: value.objectType,
    readyPackageId: value.readyPackageId,
    knowledgeWorkspaceId: value.knowledgeWorkspaceId,
    readyPackageDigest: value.readyPackageDigest,
    provenance: value.provenance,
    rawArtifact: value.rawArtifact,
    stagingDocument: value.stagingDocument,
  };
}

export function isReadyPackageContentExportV1_1(
  value: unknown,
): value is ReadyPackageContentExportV1_1 {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "contractVersion",
      "objectType",
      "readyPackageId",
      "knowledgeWorkspaceId",
      "readyPackageDigest",
      "provenance",
      "rawArtifact",
      "stagingDocument",
      "sourceGovernance",
    ]) ||
    value.contractVersion !== READY_PACKAGE_CONTENT_EXPORT_V1_1_VERSION ||
    !isSourceGovernanceSnapshotV1(value.sourceGovernance)
  ) {
    return false;
  }
  try {
    assertReadyPackageContentExportV1({ ...value, contractVersion: "1.0", sourceGovernance: undefined });
  } catch {
    const legacy = { ...value } as Record<string, unknown>;
    delete legacy.sourceGovernance;
    legacy.contractVersion = "1.0";
    try {
      assertReadyPackageContentExportV1(legacy);
    } catch {
      return false;
    }
  }
  const provenance = value.provenance as Record<string, unknown>;
  return provenance.sourceId === value.sourceGovernance.sourceId;
}

export function assertReadyPackageContentExportV1_1(
  value: unknown,
): asserts value is ReadyPackageContentExportV1_1 {
  if (!isReadyPackageContentExportV1_1(value)) {
    throw new TypeError("Invalid ReadyPackageContentExportV1_1");
  }
}

export function serializeReadyPackageContentExportV1_1(value: ReadyPackageContentExportV1_1): string {
  assertReadyPackageContentExportV1_1(value);
  const legacy = asLegacyV1(value);
  return JSON.stringify({
    contractVersion: READY_PACKAGE_CONTENT_EXPORT_V1_1_VERSION,
    objectType: legacy.objectType,
    readyPackageId: legacy.readyPackageId,
    knowledgeWorkspaceId: legacy.knowledgeWorkspaceId,
    readyPackageDigest: legacy.readyPackageDigest,
    provenance: legacy.provenance,
    rawArtifact: legacy.rawArtifact,
    stagingDocument: legacy.stagingDocument,
    sourceGovernance:
      value.sourceGovernance.kind === "STANDARD_SOURCE"
        ? {
            snapshotVersion: SOURCE_GOVERNANCE_SNAPSHOT_VERSION,
            kind: "STANDARD_SOURCE",
            sourceId: value.sourceGovernance.sourceId,
          }
        : {
            snapshotVersion: SOURCE_GOVERNANCE_SNAPSHOT_VERSION,
            kind: "GLOBAL_REFERENCE",
            sourceId: value.sourceGovernance.sourceId,
            referenceProtocolVersion: value.sourceGovernance.referenceProtocolVersion,
            sourceRole: value.sourceGovernance.sourceRole,
            authorityTier: value.sourceGovernance.authorityTier,
            intendedUses: [...value.sourceGovernance.intendedUses],
            factEligibility: value.sourceGovernance.factEligibility,
            verification: {
              policy: value.sourceGovernance.verification.policy,
              verifyAgainstSourceIds: [...value.sourceGovernance.verification.verifyAgainstSourceIds],
              verifyAgainstJurisdictionOfficialSource:
                value.sourceGovernance.verification.verifyAgainstJurisdictionOfficialSource,
            },
            contentReusePolicy: value.sourceGovernance.contentReusePolicy,
          },
  } satisfies ReadyPackageContentExportV1_1);
}
