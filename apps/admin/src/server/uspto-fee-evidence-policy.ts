import type { OfficialEvidenceAdmissibilityPolicy } from "./official-evidence-admissibility";

export const USPTO_FEE_EVIDENCE_POLICY = {
  schemaVersion: "1.0",
  authorities: [
    {
      role: "NUMERIC_AUTHORITY",
      canonicalUri:
        "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule",
    },
    {
      role: "APPLICABILITY_CONTEXT",
      canonicalUri: "https://www.uspto.gov/trademarks/trademark-fee-information",
    },
  ],
} as const satisfies OfficialEvidenceAdmissibilityPolicy;
