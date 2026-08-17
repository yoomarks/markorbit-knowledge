export const FOUNDATIONAL_ADVANCED_JURISDICTIONS = [
  "US",
  "WO",
  "EU",
  "CN",
  "IN",
  "JP",
  "KR",
  "GB",
  "CA",
  "AU",
  "BR",
  "AE",
  "CI",
] as const;
export type FoundationalAdvancedJurisdiction = (typeof FOUNDATIONAL_ADVANCED_JURISDICTIONS)[number];

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

const READ_ONLY_CAPABILITIES: readonly FoundationalAdvancedCapability[] = [
  "READINESS_DIAGNOSTICS",
  "RELEVANCE_AUDIT",
  "SUPPLY_HEALTH",
];

const FULL_CAPABILITIES: readonly FoundationalAdvancedCapability[] = [
  ...READ_ONLY_CAPABILITIES,
  "COMPATIBILITY_REPROBE",
  "COLLECTION_OPERATOR",
  "CONVERSION_RECOVERY",
  "VERIFIED_CANONICAL_REINDEX",
  "RETRIEVAL_QUALITY_REMEDIATION",
];

// EU compatibility re-probe is independently promoted by the live EU proof. Other content mutation
// paths remain withheld until they earn their own jurisdiction-specific promotion evidence.
const EU_CAPABILITIES: readonly FoundationalAdvancedCapability[] = [
  ...READ_ONLY_CAPABILITIES,
  "COMPATIBILITY_REPROBE",
];

export function foundationalAdvancedCapabilities(
  jurisdiction: FoundationalAdvancedJurisdiction,
): readonly FoundationalAdvancedCapability[] {
  if (jurisdiction === "US" || jurisdiction === "WO") return FULL_CAPABILITIES;
  if (jurisdiction === "EU") return EU_CAPABILITIES;
  return READ_ONLY_CAPABILITIES;
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
