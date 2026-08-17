export const FOUNDATIONAL_ADVANCED_JURISDICTIONS = ["US", "WO", "EU"] as const;
export type FoundationalAdvancedJurisdiction =
  (typeof FOUNDATIONAL_ADVANCED_JURISDICTIONS)[number];

export const FOUNDATIONAL_FULL_OPERATOR_JURISDICTIONS = ["US", "WO"] as const;
export type FoundationalFullOperatorJurisdiction =
  (typeof FOUNDATIONAL_FULL_OPERATOR_JURISDICTIONS)[number];

export type FoundationalAdvancedCapability =
  | "READINESS_DIAGNOSTICS"
  | "RELEVANCE_AUDIT"
  | "SUPPLY_HEALTH"
  | "COMPATIBILITY_REPROBE"
  | "COLLECTION_OPERATOR"
  | "CONVERSION_RECOVERY"
  | "VERIFIED_CANONICAL_REINDEX"
  | "RETRIEVAL_QUALITY_REMEDIATION";

const FULL_CAPABILITIES: readonly FoundationalAdvancedCapability[] = [
  "READINESS_DIAGNOSTICS",
  "RELEVANCE_AUDIT",
  "SUPPLY_HEALTH",
  "COMPATIBILITY_REPROBE",
  "COLLECTION_OPERATOR",
  "CONVERSION_RECOVERY",
  "VERIFIED_CANONICAL_REINDEX",
  "RETRIEVAL_QUALITY_REMEDIATION",
];

// EU FOUNDATIONAL readiness is already business-visible and the underlying read paths are generic,
// but mutation/re-probe operator paths have not yet been promoted through an EU-specific live run.
// Keep Advanced EU deliberately read-only until that proof exists.
const EU_CAPABILITIES: readonly FoundationalAdvancedCapability[] = [
  "READINESS_DIAGNOSTICS",
  "RELEVANCE_AUDIT",
  "SUPPLY_HEALTH",
];

export function foundationalAdvancedCapabilities(
  jurisdiction: FoundationalAdvancedJurisdiction,
): readonly FoundationalAdvancedCapability[] {
  return jurisdiction === "EU" ? EU_CAPABILITIES : FULL_CAPABILITIES;
}

export function hasFoundationalAdvancedCapability(
  jurisdiction: FoundationalAdvancedJurisdiction,
  capability: FoundationalAdvancedCapability,
): boolean {
  return foundationalAdvancedCapabilities(jurisdiction).includes(capability);
}

export function asFullOperatorJurisdiction(
  jurisdiction: FoundationalAdvancedJurisdiction,
): FoundationalFullOperatorJurisdiction | null {
  return jurisdiction === "US" || jurisdiction === "WO" ? jurisdiction : null;
}
