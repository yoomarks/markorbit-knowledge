import type { AcquisitionStrategyReevaluationRequest } from "./acquisition-strategy-governance-v1";

export const ACQUISITION_RECURRING_REGRESSION_VERSION =
  "ACQUISITION_RECURRING_REGRESSION_V1" as const;

export const ACQUISITION_REGRESSION_STATES = [
  "UNCHANGED",
  "EXPECTED_CHANGE",
  "COVERAGE_DEGRADED",
  "SOURCE_IDENTITY_DRIFT",
  "PLAYBOOK_BEHAVIOR_DRIFT",
  "INSUFFICIENT_EVIDENCE",
] as const;

export type AcquisitionRegressionState = (typeof ACQUISITION_REGRESSION_STATES)[number];

export type AcquisitionRecurringRegressionResultV1 = {
  version: typeof ACQUISITION_RECURRING_REGRESSION_VERSION;
  sourceId: string;
  playbookId: string;
  playbookRevision: number;
  baselineRunId: string;
  baselineFinishedAt: string;
  currentRunId: string;
  currentFinishedAt: string;
  state: AcquisitionRegressionState;
  reasonCodes: string[];
  deltas: {
    coverageRatio: number | null;
    accepted: number;
    duplicateRatio: number;
    failures: number;
    httpErrorRatio: number;
    digestChanges: number;
  };
  evidenceRefs: string[];
  reevaluationRequest: AcquisitionStrategyReevaluationRequest | null;
  boundaries: {
    autoPromotionApplied: false;
    collectionAuthorityGranted: false;
    legalTruthVerified: false;
  };
};

function validDateTime(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function isAcquisitionRecurringRegressionResult(
  value: unknown,
): value is AcquisitionRecurringRegressionResultV1 {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AcquisitionRecurringRegressionResultV1>;
  return (
    item.version === ACQUISITION_RECURRING_REGRESSION_VERSION &&
    typeof item.sourceId === "string" &&
    item.sourceId.length > 0 &&
    typeof item.playbookId === "string" &&
    item.playbookId.length > 0 &&
    Number.isInteger(item.playbookRevision) &&
    Number(item.playbookRevision) > 0 &&
    typeof item.baselineRunId === "string" &&
    item.baselineRunId.length > 0 &&
    validDateTime(item.baselineFinishedAt) &&
    typeof item.currentRunId === "string" &&
    item.currentRunId.length > 0 &&
    validDateTime(item.currentFinishedAt) &&
    ACQUISITION_REGRESSION_STATES.includes(item.state as AcquisitionRegressionState) &&
    Array.isArray(item.reasonCodes) &&
    item.reasonCodes.every((reason) => typeof reason === "string" && reason.length > 0) &&
    Boolean(item.deltas) &&
    (item.deltas?.coverageRatio === null || typeof item.deltas?.coverageRatio === "number") &&
    typeof item.deltas?.accepted === "number" &&
    typeof item.deltas?.duplicateRatio === "number" &&
    typeof item.deltas?.failures === "number" &&
    typeof item.deltas?.httpErrorRatio === "number" &&
    typeof item.deltas?.digestChanges === "number" &&
    Array.isArray(item.evidenceRefs) &&
    item.evidenceRefs.every((ref) => typeof ref === "string" && ref.length > 0) &&
    (item.reevaluationRequest === null ||
      item.reevaluationRequest?.objectType === "ACQUISITION_STRATEGY_REEVALUATION_REQUEST") &&
    item.boundaries?.autoPromotionApplied === false &&
    item.boundaries?.collectionAuthorityGranted === false &&
    item.boundaries?.legalTruthVerified === false
  );
}
