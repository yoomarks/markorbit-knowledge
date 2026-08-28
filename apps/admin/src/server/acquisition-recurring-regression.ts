import {
  ACQUISITION_RECURRING_REGRESSION_VERSION,
  type AcquisitionRecurringRegressionResultV1,
  type AcquisitionRegressionState,
  type AcquisitionRunEvidence,
  type AcquisitionStrategyReevaluationRequest,
  type SourceFingerprint,
} from "@markorbit/contracts";

const COVERAGE_DROP_THRESHOLD = 0.05;
const DUPLICATE_RATIO_INCREASE_THRESHOLD = 0.05;
const HTTP_ERROR_RATIO_INCREASE_THRESHOLD = 0.05;

function duplicateRatio(evidence: AcquisitionRunEvidence): number {
  const denominator = evidence.counts.accepted + evidence.counts.duplicates;
  return denominator === 0 ? 0 : evidence.counts.duplicates / denominator;
}

function failureCount(evidence: AcquisitionRunEvidence): number {
  return evidence.failureSignatures.reduce((total, failure) => total + failure.count, 0);
}

function httpErrorRatio(evidence: AcquisitionRunEvidence): number {
  const entries = Object.entries(evidence.httpStatusCounts);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return 0;
  const errors = entries.reduce((sum, [status, count]) => {
    const code = Number.parseInt(status, 10);
    return Number.isInteger(code) && code >= 400 ? sum + count : sum;
  }, 0);
  return errors / total;
}

function fingerprintIdentity(fingerprint: SourceFingerprint): string {
  return JSON.stringify({
    architecture: fingerprint.architecture,
    discoverySurfaces: [...fingerprint.discoverySurfaces].sort(),
    renderRequirement: fingerprint.renderRequirement,
    localeStructure: fingerprint.localeStructure,
    supportsHttpValidators: fingerprint.supportsHttpValidators,
    attachmentKinds: [...fingerprint.attachmentKinds].sort(),
  });
}

function evidenceRefs(
  baseline: AcquisitionRunEvidence,
  current: AcquisitionRunEvidence,
  baselineFingerprint?: SourceFingerprint,
  currentFingerprint?: SourceFingerprint,
): string[] {
  return [
    ...baseline.evidenceRefs,
    ...current.evidenceRefs,
    ...(baselineFingerprint?.evidenceRefs ?? []),
    ...(currentFingerprint?.evidenceRefs ?? []),
    `acquisition-run:${baseline.runId}`,
    `acquisition-run:${current.runId}`,
  ]
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort();
}

function reevaluationRequest(
  state: AcquisitionRegressionState,
  reasonCodes: readonly string[],
  current: AcquisitionRunEvidence,
  refs: readonly string[],
): AcquisitionStrategyReevaluationRequest | null {
  if (
    state !== "COVERAGE_DEGRADED" &&
    state !== "SOURCE_IDENTITY_DRIFT" &&
    state !== "PLAYBOOK_BEHAVIOR_DRIFT"
  ) {
    return null;
  }

  return {
    protocolVersion: "1.0",
    objectType: "ACQUISITION_STRATEGY_REEVALUATION_REQUEST",
    id: `recurring-regression:${current.runId}:${state}`,
    runId: current.runId,
    sourceId: current.sourceId,
    playbookId: current.playbookId,
    playbookRevision: current.playbookRevision,
    requestedAt: current.finishedAt,
    status: "PENDING",
    lessonTypes: state === "COVERAGE_DEGRADED" ? ["COVERAGE_REGRESSION"] : [],
    reasonCodes: [...reasonCodes].sort(),
    fallbackPlaybookIds: [],
    evidenceRefs: [...refs],
    boundaries: {
      autoDispatchApplied: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
  };
}

export function evaluateAcquisitionRecurringRegression(input: {
  baseline?: AcquisitionRunEvidence | null;
  current?: AcquisitionRunEvidence | null;
  baselineFingerprint?: SourceFingerprint | null;
  currentFingerprint?: SourceFingerprint | null;
}): AcquisitionRecurringRegressionResultV1 {
  const baseline = input.baseline;
  const current = input.current;
  const baselineFingerprint = input.baselineFingerprint ?? undefined;
  const currentFingerprint = input.currentFingerprint ?? undefined;

  const sourceId = current?.sourceId ?? baseline?.sourceId ?? "UNKNOWN";
  const playbookId = current?.playbookId ?? baseline?.playbookId ?? "UNKNOWN";
  const playbookRevision = current?.playbookRevision ?? baseline?.playbookRevision ?? 1;
  const baselineRunId = baseline?.runId ?? "MISSING";
  const currentRunId = current?.runId ?? "MISSING";

  const result = (
    state: AcquisitionRegressionState,
    reasonCodes: string[],
  ): AcquisitionRecurringRegressionResultV1 => {
    const refs =
      baseline && current
        ? evidenceRefs(baseline, current, baselineFingerprint, currentFingerprint)
        : [];
    return {
      version: ACQUISITION_RECURRING_REGRESSION_VERSION,
      sourceId,
      playbookId,
      playbookRevision,
      baselineRunId,
      currentRunId,
      state,
      reasonCodes: [...reasonCodes].sort(),
      deltas: {
        coverageRatio:
          baseline?.coverage.ratio === null ||
          baseline?.coverage.ratio === undefined ||
          current?.coverage.ratio === null ||
          current?.coverage.ratio === undefined
            ? null
            : current.coverage.ratio - baseline.coverage.ratio,
        accepted: (current?.counts.accepted ?? 0) - (baseline?.counts.accepted ?? 0),
        duplicateRatio:
          baseline && current ? duplicateRatio(current) - duplicateRatio(baseline) : 0,
        failures: baseline && current ? failureCount(current) - failureCount(baseline) : 0,
        httpErrorRatio:
          baseline && current ? httpErrorRatio(current) - httpErrorRatio(baseline) : 0,
        digestChanges:
          (current?.changeDetection.digestChanges ?? 0) -
          (baseline?.changeDetection.digestChanges ?? 0),
      },
      evidenceRefs: refs,
      reevaluationRequest: current ? reevaluationRequest(state, reasonCodes, current, refs) : null,
      boundaries: {
        autoPromotionApplied: false,
        collectionAuthorityGranted: false,
        legalTruthVerified: false,
      },
    };
  };

  if (!baseline || !current || !baselineFingerprint || !currentFingerprint) {
    return result("INSUFFICIENT_EVIDENCE", ["BASELINE_OR_CURRENT_EVIDENCE_MISSING"]);
  }
  if (
    baseline.sourceId !== current.sourceId ||
    baselineFingerprint.sourceId !== baseline.sourceId ||
    currentFingerprint.sourceId !== current.sourceId
  ) {
    return result("INSUFFICIENT_EVIDENCE", ["SOURCE_IDENTITY_INCOMPATIBLE"]);
  }
  if (baseline.playbookId !== current.playbookId) {
    return result("INSUFFICIENT_EVIDENCE", ["PLAYBOOK_ID_INCOMPATIBLE"]);
  }
  if (fingerprintIdentity(baselineFingerprint) !== fingerprintIdentity(currentFingerprint)) {
    return result("SOURCE_IDENTITY_DRIFT", ["STRUCTURAL_FINGERPRINT_CHANGED"]);
  }
  if (baseline.playbookRevision !== current.playbookRevision) {
    return result("PLAYBOOK_BEHAVIOR_DRIFT", ["PLAYBOOK_REVISION_CHANGED"]);
  }

  const coverageDelta =
    baseline.coverage.ratio === null || current.coverage.ratio === null
      ? null
      : current.coverage.ratio - baseline.coverage.ratio;
  if (coverageDelta !== null && coverageDelta <= -COVERAGE_DROP_THRESHOLD) {
    return result("COVERAGE_DEGRADED", ["COVERAGE_DROP_GTE_5_POINTS"]);
  }

  const duplicateDelta = duplicateRatio(current) - duplicateRatio(baseline);
  const failuresDelta = failureCount(current) - failureCount(baseline);
  const httpErrorDelta = httpErrorRatio(current) - httpErrorRatio(baseline);
  if (
    current.outcome !== baseline.outcome ||
    duplicateDelta >= DUPLICATE_RATIO_INCREASE_THRESHOLD ||
    failuresDelta > 0 ||
    httpErrorDelta >= HTTP_ERROR_RATIO_INCREASE_THRESHOLD
  ) {
    const reasons = [
      ...(current.outcome !== baseline.outcome ? ["OUTCOME_CHANGED"] : []),
      ...(duplicateDelta >= DUPLICATE_RATIO_INCREASE_THRESHOLD
        ? ["DUPLICATE_RATIO_INCREASE_GTE_5_POINTS"]
        : []),
      ...(failuresDelta > 0 ? ["FAILURE_COUNT_INCREASED"] : []),
      ...(httpErrorDelta >= HTTP_ERROR_RATIO_INCREASE_THRESHOLD
        ? ["HTTP_ERROR_RATIO_INCREASE_GTE_5_POINTS"]
        : []),
    ];
    return result("PLAYBOOK_BEHAVIOR_DRIFT", reasons);
  }

  if (current.changeDetection.digestChanges !== baseline.changeDetection.digestChanges) {
    return result("EXPECTED_CHANGE", ["CONTENT_DIGEST_CHANGE_WITHOUT_ACQUISITION_REGRESSION"]);
  }

  return result("UNCHANGED", ["OBJECTIVE_ACQUISITION_SIGNALS_STABLE"]);
}
