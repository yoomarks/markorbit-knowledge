import type {
  SourceIntelligenceAssessmentV2,
  SourceIntelligenceObservationHistoryV2,
  SourceIntelligenceObservationPointV2,
  SourceIntelligenceObservationTransitionV2,
} from "@markorbit/contracts";
import { SOURCE_INTELLIGENCE_OBSERVATION_HISTORY_PROTOCOL_VERSION } from "@markorbit/contracts";

function nullableDelta(from: number | null, to: number | null): number | null {
  return from === null || to === null ? null : to - from;
}

function point(assessment: SourceIntelligenceAssessmentV2): SourceIntelligenceObservationPointV2 {
  return {
    assessmentId: assessment.id,
    legacyAssessmentId: assessment.compatibility.legacyAssessmentId,
    assessedAt: assessment.assessedAt,
    inputFingerprint: assessment.inputFingerprint,
    evaluatorVersion: assessment.evaluator.version,
    sourceValue: {
      score: assessment.sourceValuePriority.score,
      band: assessment.sourceValuePriority.band,
    },
    evidenceMaturity: {
      score: assessment.evidenceMaturity.score,
      stage: assessment.evidenceMaturity.stage,
    },
    observedAcquisitionCost: {
      score: assessment.decisionContext.observedAcquisitionCost.score,
      confidence: assessment.decisionContext.observedAcquisitionCost.confidence,
    },
  };
}

function transition(
  from: SourceIntelligenceObservationPointV2,
  to: SourceIntelligenceObservationPointV2,
): SourceIntelligenceObservationTransitionV2 {
  return {
    fromAssessmentId: from.assessmentId,
    toAssessmentId: to.assessmentId,
    fromAssessedAt: from.assessedAt,
    toAssessedAt: to.assessedAt,
    sourceValue: {
      fromScore: from.sourceValue.score,
      toScore: to.sourceValue.score,
      scoreDelta: to.sourceValue.score - from.sourceValue.score,
      fromBand: from.sourceValue.band,
      toBand: to.sourceValue.band,
      changed:
        from.sourceValue.score !== to.sourceValue.score ||
        from.sourceValue.band !== to.sourceValue.band,
    },
    evidenceMaturity: {
      fromScore: from.evidenceMaturity.score,
      toScore: to.evidenceMaturity.score,
      scoreDelta: nullableDelta(from.evidenceMaturity.score, to.evidenceMaturity.score),
      fromStage: from.evidenceMaturity.stage,
      toStage: to.evidenceMaturity.stage,
      changed:
        from.evidenceMaturity.score !== to.evidenceMaturity.score ||
        from.evidenceMaturity.stage !== to.evidenceMaturity.stage,
    },
    observedAcquisitionCost: {
      fromScore: from.observedAcquisitionCost.score,
      toScore: to.observedAcquisitionCost.score,
      scoreDelta: nullableDelta(
        from.observedAcquisitionCost.score,
        to.observedAcquisitionCost.score,
      ),
      changed: from.observedAcquisitionCost.score !== to.observedAcquisitionCost.score,
    },
  };
}

export function buildSourceIntelligenceObservationHistoryV2(
  sourceId: string,
  assessments: SourceIntelligenceAssessmentV2[],
): SourceIntelligenceObservationHistoryV2 {
  const observations = assessments
    .filter((assessment) => assessment.sourceId === sourceId)
    .sort((left, right) => {
      const timeDelta = Date.parse(left.assessedAt) - Date.parse(right.assessedAt);
      return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id);
    })
    .map(point);
  const transitions = observations.slice(1).map((current, index) => {
    const previous = observations[index];
    if (!previous) throw new Error("Observation transition requires a previous point");
    return transition(previous, current);
  });

  return {
    protocolVersion: SOURCE_INTELLIGENCE_OBSERVATION_HISTORY_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_OBSERVATION_HISTORY",
    sourceId,
    observations,
    transitions,
    semantics: {
      ordering: "OLDEST_TO_NEWEST",
      observationUnit: "DISTINCT_EVIDENCE_STATE",
      sameFingerprintReassessmentsCollapsed: true,
      sourceValueAndEvidenceMaturityIndependent: true,
      acquisitionCostSeparate: true,
    },
    scheduling: {
      policyStatus: "NOT_AUTHORIZED_UNCALIBRATED",
    },
    boundaries: {
      legalTruthVerified: false,
      authorityInferred: false,
      professionalQualityVerified: false,
      identityVerified: false,
      autoScheduleApplied: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
    },
  };
}
