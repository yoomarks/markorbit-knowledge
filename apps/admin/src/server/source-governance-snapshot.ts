import {
  GLOBAL_REFERENCE_AUTHORITY_TIERS,
  GLOBAL_REFERENCE_CONTENT_REUSE_POLICIES,
  GLOBAL_REFERENCE_FACT_ELIGIBILITY,
  GLOBAL_REFERENCE_INTENDED_USES,
  GLOBAL_REFERENCE_SOURCE_PROTOCOL_VERSION,
  GLOBAL_REFERENCE_SOURCE_ROLES,
  GLOBAL_REFERENCE_VERIFICATION_POLICIES,
  SOURCE_GOVERNANCE_SNAPSHOT_VERSION,
  type GlobalReferenceAuthorityTier,
  type GlobalReferenceContentReusePolicy,
  type GlobalReferenceFactEligibility,
  type GlobalReferenceIntendedUse,
  type GlobalReferenceSourceRole,
  type GlobalReferenceVerificationPolicy,
  type SourceDefinition,
  type SourceGovernanceSnapshotV1,
} from "@markorbit/contracts";
import { RegistryConflictError } from "@markorbit/persistence";

const GLOBAL_REFERENCE_TAG = "global-reference-source";

function fail(source: SourceDefinition, field: string): never {
  throw new RegistryConflictError(
    "GLOBAL_REFERENCE_SOURCE_GOVERNANCE_INVALID",
    `Global reference Source ${source.id} has missing or invalid frozen governance field: ${field}`,
    { sourceId: source.id, field },
  );
}

function stringExtension(source: SourceDefinition, key: `x-${string}`): string {
  const value = source.extensions?.[key];
  if (typeof value !== "string" || !value.trim()) fail(source, key);
  return value;
}

function booleanExtension(source: SourceDefinition, key: `x-${string}`): boolean {
  const value = source.extensions?.[key];
  if (typeof value !== "boolean") fail(source, key);
  return value;
}

function stringArrayExtension(
  source: SourceDefinition,
  key: `x-${string}`,
  options: { required: boolean },
): string[] {
  const value = source.extensions?.[key];
  if (value === undefined && !options.required) return [];
  if (
    !Array.isArray(value) ||
    (options.required && value.length === 0) ||
    !value.every((item) => typeof item === "string" && item.trim().length > 0)
  ) {
    fail(source, key);
  }
  const normalized = (value as string[]).map((item) => item.trim());
  if (new Set(normalized).size !== normalized.length) fail(source, key);
  return normalized;
}

function enumValue<T extends string>(
  source: SourceDefinition,
  key: `x-${string}`,
  allowed: readonly T[],
): T {
  const value = stringExtension(source, key);
  if (!allowed.includes(value as T)) fail(source, key);
  return value as T;
}

/**
 * Freezes governance from the registered SourceDefinition, never from the current
 * catalog declaration. This keeps old acquired evidence bound to the policy snapshot
 * that was registered with its Source instead of silently inheriting future catalog edits.
 */
export function buildSourceGovernanceSnapshotV1(
  source: SourceDefinition,
  expectedWorkspaceId: string,
): SourceGovernanceSnapshotV1 {
  if (source.workspaceId !== expectedWorkspaceId) {
    throw new RegistryConflictError(
      "READY_PACKAGE_SOURCE_WORKSPACE_MISMATCH",
      "ReadyPackage source belongs to a different workspace",
      { sourceId: source.id },
    );
  }

  if (!source.tags.includes(GLOBAL_REFERENCE_TAG)) {
    return {
      snapshotVersion: SOURCE_GOVERNANCE_SNAPSHOT_VERSION,
      kind: "STANDARD_SOURCE",
      sourceId: source.id,
    };
  }

  const referenceProtocolVersion = stringExtension(
    source,
    "x-markorbit-reference-protocol-version",
  );
  if (referenceProtocolVersion !== GLOBAL_REFERENCE_SOURCE_PROTOCOL_VERSION) {
    fail(source, "x-markorbit-reference-protocol-version");
  }
  const intendedUses = stringArrayExtension(source, "x-markorbit-reference-intended-uses", {
    required: true,
  });
  if (
    !intendedUses.every((item) =>
      GLOBAL_REFERENCE_INTENDED_USES.includes(item as GlobalReferenceIntendedUse),
    )
  ) {
    fail(source, "x-markorbit-reference-intended-uses");
  }

  return {
    snapshotVersion: SOURCE_GOVERNANCE_SNAPSHOT_VERSION,
    kind: "GLOBAL_REFERENCE",
    sourceId: source.id,
    referenceProtocolVersion: GLOBAL_REFERENCE_SOURCE_PROTOCOL_VERSION,
    sourceRole: enumValue<GlobalReferenceSourceRole>(
      source,
      "x-markorbit-reference-role",
      GLOBAL_REFERENCE_SOURCE_ROLES,
    ),
    authorityTier: enumValue<GlobalReferenceAuthorityTier>(
      source,
      "x-markorbit-reference-authority-tier",
      GLOBAL_REFERENCE_AUTHORITY_TIERS,
    ),
    intendedUses: intendedUses as GlobalReferenceIntendedUse[],
    factEligibility: enumValue<GlobalReferenceFactEligibility>(
      source,
      "x-markorbit-reference-fact-eligibility",
      GLOBAL_REFERENCE_FACT_ELIGIBILITY,
    ),
    verification: {
      policy: enumValue<GlobalReferenceVerificationPolicy>(
        source,
        "x-markorbit-reference-verification-policy",
        GLOBAL_REFERENCE_VERIFICATION_POLICIES,
      ),
      verifyAgainstSourceIds: stringArrayExtension(
        source,
        "x-markorbit-reference-verification-source-ids",
        { required: false },
      ),
      verifyAgainstJurisdictionOfficialSource: booleanExtension(
        source,
        "x-markorbit-reference-verify-official-source",
      ),
    },
    contentReusePolicy: enumValue<GlobalReferenceContentReusePolicy>(
      source,
      "x-markorbit-reference-content-reuse-policy",
      GLOBAL_REFERENCE_CONTENT_REUSE_POLICIES,
    ),
  };
}
