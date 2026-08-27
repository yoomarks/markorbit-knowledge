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
  canonicalSource: {
    domain: "FEE",
    uri: "https://www.uspto.gov/trademarks/trademark-fee-information",
    collectionBoundary: "https://www.uspto.gov/trademarks*",
    requiredSemanticAnchors: [
      "Base application filing fee",
      "Section 1",
      "Section 44",
      "per class",
    ],
  },
  auditCorroboration: {
    uri: "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule",
    collectionStatus: "OUTSIDE_CURRENT_GOLDEN_SOURCE_POLICY",
    purpose: "AUTHORITY_CROSS_CHECK_ONLY",
  },
  lineagePolicy: {
    versionIdentity: "CONTENT_SHA256",
    requireChunkId: true,
    requireContentSha256: true,
    requireIndexedAt: true,
    requireSourceUri: true,
  },
  resolutionPolicy: {
    amountStorage: "SOURCE_CONTENT_ONLY",
    hardcodedAmountAllowed: false,
    staleEvidenceBehavior: "FAIL_CLOSED",
    conflictingEvidenceBehavior: "FAIL_CLOSED",
    missingLineageBehavior: "FAIL_CLOSED",
  },
} as const;

export type UsptoOfficialFeePilotV1 = typeof USPTO_OFFICIAL_FEE_PILOT_V1;

export function isUsptoOfficialFeePilotSourceUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === "www.uspto.gov" &&
    parsed.pathname === "/trademarks/trademark-fee-information"
  );
}
