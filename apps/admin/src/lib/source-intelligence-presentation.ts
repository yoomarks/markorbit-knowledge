import type { EvidenceMaturityStage, SourceValuePriorityBand } from "@markorbit/contracts";

export type SourceValueFilter = "ALL" | "UNASSESSED" | SourceValuePriorityBand;
export type EvidenceMaturityFilter = "ALL" | EvidenceMaturityStage;

export type DualAxisPresentationAssessment = {
  sourceValuePriority: {
    score: number;
    band: SourceValuePriorityBand;
  };
  evidenceMaturity: {
    score: number | null;
    stage: EvidenceMaturityStage;
  };
};

export type DualAxisCounts = {
  unassessed: number;
  veryHigh: number;
  high: number;
  medium: number;
  low: number;
  currentTraceable: number;
  traceable: number;
  captured: number;
  unobserved: number;
};

const MATURITY_RANK: Record<EvidenceMaturityStage, number> = {
  UNOBSERVED: 0,
  CAPTURED: 1,
  TRACEABLE: 2,
  CURRENT_TRACEABLE: 3,
};

export function compareDualAxisAssessments(
  left: DualAxisPresentationAssessment | null,
  right: DualAxisPresentationAssessment | null,
): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  const valueDelta = right.sourceValuePriority.score - left.sourceValuePriority.score;
  if (valueDelta !== 0) return valueDelta;

  const maturityDelta =
    MATURITY_RANK[right.evidenceMaturity.stage] - MATURITY_RANK[left.evidenceMaturity.stage];
  if (maturityDelta !== 0) return maturityDelta;

  return (right.evidenceMaturity.score ?? -1) - (left.evidenceMaturity.score ?? -1);
}

export function matchesDualAxisFilters(
  assessment: DualAxisPresentationAssessment | null,
  sourceValueFilter: SourceValueFilter,
  evidenceMaturityFilter: EvidenceMaturityFilter,
): boolean {
  if (sourceValueFilter === "UNASSESSED") return assessment === null;
  if (!assessment) {
    return sourceValueFilter === "ALL" && evidenceMaturityFilter === "ALL";
  }
  if (sourceValueFilter !== "ALL" && assessment.sourceValuePriority.band !== sourceValueFilter) {
    return false;
  }
  if (
    evidenceMaturityFilter !== "ALL" &&
    assessment.evidenceMaturity.stage !== evidenceMaturityFilter
  ) {
    return false;
  }
  return true;
}

export function countDualAxisAssessments(
  assessments: Array<DualAxisPresentationAssessment | null>,
): DualAxisCounts {
  const result: DualAxisCounts = {
    unassessed: 0,
    veryHigh: 0,
    high: 0,
    medium: 0,
    low: 0,
    currentTraceable: 0,
    traceable: 0,
    captured: 0,
    unobserved: 0,
  };

  for (const assessment of assessments) {
    if (!assessment) {
      result.unassessed += 1;
      continue;
    }

    if (assessment.sourceValuePriority.band === "VERY_HIGH") result.veryHigh += 1;
    else if (assessment.sourceValuePriority.band === "HIGH") result.high += 1;
    else if (assessment.sourceValuePriority.band === "MEDIUM") result.medium += 1;
    else result.low += 1;

    if (assessment.evidenceMaturity.stage === "CURRENT_TRACEABLE") result.currentTraceable += 1;
    else if (assessment.evidenceMaturity.stage === "TRACEABLE") result.traceable += 1;
    else if (assessment.evidenceMaturity.stage === "CAPTURED") result.captured += 1;
    else result.unobserved += 1;
  }

  return result;
}
