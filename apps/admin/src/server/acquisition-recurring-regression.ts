import type { AcquisitionRunEvidence, SourceFingerprint } from "@markorbit/contracts";

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
  version: "ACQUISITION_RECURRING_REGRESSION_V1";
  sourceId: string;
  baselineRunId: string;
  currentRunId: string;
  state: AcquisitionRegressionState;
  reasonCodes: string[];
  deltas: {
    coverageRatio: number | null;
    accepted: number;
    duplicateRatio: number;
    failures: number;
    digestChanges: number;
  };
  evidenceRefs: string[];
  boundaries: {
    autoPromotionApplied: false;
    collectionAuthorityGranted: false;
    legalTruthVerified: false;
  };
};

const COVERAGE_DROP_THRESHOLD = 0.05;
const DUPLICATE_RATIO_INCREASE_THRESHOLD = 0.05;

function duplicateRatio(evidence: AcquisitionRunEvidence): number {
  const denominator = evidence.counts.accepted + evidence.counts.duplicates;
  return denominator === 0 ? 0 : evidence.counts.duplicates / denominator;
}

function failureCount(evidence: AcquisitionRunEvidence): number {
  return evidence.failureSignatures.reduce((total, failure) => total + failure.count, 0);
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
  const baselineRunId = baseline?.runId ?? "MISSING";
  const currentRunId = current?.runId ?? "MISSING";

  const result = (
    state: AcquisitionRegressionState,
    reasonCodes: string[],
  ): AcquisitionRecurringRegressionResultV1 => ({
    version: "ACQUISITION_RECURRING_REGRESSION_V1",
    sourceId,
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
      duplicateRatio: baseline && current ? duplicateRatio(current) - duplicateRatio(baseline) : 0,
      failures: baseline && current ? failureCount(current) - failureCount(baseline) : 0,
      digestChanges:
        (current?.changeDetection.digestChanges ?? 0) -
        (baseline?.changeDetection.digestChanges ?? 0),
    },
    evidenceRefs:
      baseline && current
        ? evidenceRefs(baseline, current, baselineFingerprint, currentFingerprint)
        : [],
    boundaries: {
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
      legalTruthVerified: false,
    },
  });

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
  if (
    current.outcome !== baseline.outcome ||
    duplicateDelta >= DUPLICATE_RATIO_INCREASE_THRESHOLD ||
    failuresDelta > 0
  ) {
    const reasons = [
      ...(current.outcome !== baseline.outcome ? ["OUTCOME_CHANGED"] : []),
      ...(duplicateDelta >= DUPLICATE_RATIO_INCREASE_THRESHOLD
        ? ["DUPLICATE_RATIO_INCREASE_GTE_5_POINTS"]
        : []),
      ...(failuresDelta > 0 ? ["FAILURE_COUNT_INCREASED"] : []),
    ];
    return result("PLAYBOOK_BEHAVIOR_DRIFT", reasons);
  }

  if (current.changeDetection.digestChanges !== baseline.changeDetection.digestChanges) {
    return result("EXPECTED_CHANGE", ["CONTENT_DIGEST_CHANGE_WITHOUT_ACQUISITION_REGRESSION"]);
  }

  return result("UNCHANGED", ["OBJECTIVE_ACQUISITION_SIGNALS_STABLE"]);
}
