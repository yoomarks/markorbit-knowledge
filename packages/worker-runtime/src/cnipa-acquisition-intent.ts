import {
  CnipaAcquisitionError,
  type CnipaTrademarkJudgmentQuery,
} from "./cnipa-trademark-judgment";

export const CNIPA_ACQUISITION_INTENT_POLICY_REVISION = "2026-09-02" as const;

export type CnipaAcquisitionIntent =
  | "DATE_RECENCY_DISCOVERY"
  | "REGISTRATION_NUMBER_TARGETED";

export type CnipaAcquisitionIntentPolicy = {
  acquisitionIntent: CnipaAcquisitionIntent;
  compatibleQueryMode: "DATE_RANGE" | "REGISTRATION_NUMBER";
  productPurpose:
    | "LATEST_SIGNAL_DISCOVERY"
    | "KNOWN_MARK_EVIDENCE_FOLLOW_UP";
  coverageScope: "RECENCY_WINDOW" | "TARGET_OBJECT";
  currentCoverageCeiling: "PARTIAL" | "UNKNOWN";
  populationCompleteClaimAllowed: false;
  sourceTruthAuthority: "CNIPA_EVIDENCE_ONLY";
  notes: readonly string[];
};

export const CNIPA_ACQUISITION_INTENT_POLICIES: Readonly<
  Record<CnipaAcquisitionIntent, CnipaAcquisitionIntentPolicy>
> = Object.freeze({
  DATE_RECENCY_DISCOVERY: Object.freeze({
    acquisitionIntent: "DATE_RECENCY_DISCOVERY",
    compatibleQueryMode: "DATE_RANGE",
    productPurpose: "LATEST_SIGNAL_DISCOVERY",
    coverageScope: "RECENCY_WINDOW",
    currentCoverageCeiling: "PARTIAL",
    populationCompleteClaimAllowed: false,
    sourceTruthAuthority: "CNIPA_EVIDENCE_ONLY",
    notes: Object.freeze([
      "Use date windows for fresh decision/customer-development/content signals, not full-history mirroring.",
      "Manual authenticated UI evidence shows a 100-visible-result / 10-page ceiling, including single-day windows that can still saturate at 100.",
      "A saturated date window must never be represented as complete population coverage.",
    ]),
  }),
  REGISTRATION_NUMBER_TARGETED: Object.freeze({
    acquisitionIntent: "REGISTRATION_NUMBER_TARGETED",
    compatibleQueryMode: "REGISTRATION_NUMBER",
    productPurpose: "KNOWN_MARK_EVIDENCE_FOLLOW_UP",
    coverageScope: "TARGET_OBJECT",
    currentCoverageCeiling: "UNKNOWN",
    populationCompleteClaimAllowed: false,
    sourceTruthAuthority: "CNIPA_EVIDENCE_ONLY",
    notes: Object.freeze([
      "Use an explicitly known registration/application number to refresh evidence for a specific mark.",
      "Do not enumerate number ranges or infer a legal outcome from an upstream risk/intelligence signal.",
      "Upstream intelligence may request an evidence check; only admitted CNIPA source evidence may establish the observed decision fact.",
    ]),
  }),
});

function invalidIntent(message: string): never {
  throw new CnipaAcquisitionError("CNIPA_QUERY_INVALID", message, false);
}

export function expectedCnipaAcquisitionIntent(
  query: CnipaTrademarkJudgmentQuery,
): CnipaAcquisitionIntent | null {
  if (query.mode === "DATE_RANGE") return "DATE_RECENCY_DISCOVERY";
  if (query.mode === "REGISTRATION_NUMBER") return "REGISTRATION_NUMBER_TARGETED";
  return null;
}

export function assertCnipaAcquisitionIntent(
  query: CnipaTrademarkJudgmentQuery,
  acquisitionIntent: CnipaAcquisitionIntent,
): CnipaAcquisitionIntentPolicy {
  const expected = expectedCnipaAcquisitionIntent(query);
  if (expected === null) {
    return invalidIntent(
      `CNIPA query mode ${query.mode} has no accepted acquisition intent in policy revision ${CNIPA_ACQUISITION_INTENT_POLICY_REVISION}`,
    );
  }
  if (acquisitionIntent !== expected) {
    return invalidIntent(
      `CNIPA acquisition intent ${acquisitionIntent} is incompatible with query mode ${query.mode}; expected ${expected}`,
    );
  }
  return CNIPA_ACQUISITION_INTENT_POLICIES[acquisitionIntent];
}

export function assertCnipaIntentCoverageClaim(
  acquisitionIntent: CnipaAcquisitionIntent,
  coverageStatus: "COMPLETE" | "PARTIAL" | "UNKNOWN",
): void {
  const policy = CNIPA_ACQUISITION_INTENT_POLICIES[acquisitionIntent];
  if (acquisitionIntent === "DATE_RECENCY_DISCOVERY" && coverageStatus === "COMPLETE") {
    throw new CnipaAcquisitionError(
      "CNIPA_COVERAGE_UNKNOWN",
      "DATE_RECENCY_DISCOVERY cannot claim COMPLETE coverage under the observed 100-visible-result source window",
      false,
    );
  }
  if (coverageStatus === "COMPLETE" && !policy.populationCompleteClaimAllowed) {
    throw new CnipaAcquisitionError(
      "CNIPA_COVERAGE_UNKNOWN",
      `${acquisitionIntent} cannot be used to claim complete CNIPA population coverage`,
      false,
    );
  }
}
