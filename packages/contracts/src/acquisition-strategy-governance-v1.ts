import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  ACQUISITION_PROMOTION_STAGES,
  type AcquisitionLessonType,
  type AcquisitionPromotionStage,
} from "./acquisition-intelligence-v1";

export const ACQUISITION_REEVALUATION_STATUSES = ["PENDING", "RESOLVED"] as const;
export type AcquisitionReevaluationStatus = (typeof ACQUISITION_REEVALUATION_STATUSES)[number];

export type AcquisitionStrategyGovernanceActor = {
  actorType: "HUMAN" | "SYSTEM";
  actorId: string;
};

export type AcquisitionStrategyCandidateTransition = {
  protocolVersion: typeof ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION;
  objectType: "ACQUISITION_STRATEGY_CANDIDATE_TRANSITION";
  id: string;
  candidateId: string;
  playbookId: string;
  proposedRevision: number;
  fromStage: AcquisitionPromotionStage;
  toStage: AcquisitionPromotionStage;
  transitionedAt: string;
  actor: AcquisitionStrategyGovernanceActor;
  evidenceRefs: string[];
  rationale: string;
  boundaries: {
    autoPromotionApplied: false;
    collectionAuthorityGranted: false;
  };
};

export type AcquisitionStrategyReevaluationRequest = {
  protocolVersion: typeof ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION;
  objectType: "ACQUISITION_STRATEGY_REEVALUATION_REQUEST";
  id: string;
  runId: string;
  sourceId: string;
  playbookId: string;
  playbookRevision: number;
  requestedAt: string;
  status: AcquisitionReevaluationStatus;
  lessonTypes: AcquisitionLessonType[];
  reasonCodes: string[];
  fallbackPlaybookIds: string[];
  evidenceRefs: string[];
  boundaries: {
    autoDispatchApplied: false;
    autoPromotionApplied: false;
    collectionAuthorityGranted: false;
  };
};

export function nextAcquisitionPromotionStage(
  stage: AcquisitionPromotionStage,
): AcquisitionPromotionStage | null {
  const index = ACQUISITION_PROMOTION_STAGES.indexOf(stage);
  if (index < 0 || index >= ACQUISITION_PROMOTION_STAGES.length - 1) return null;
  return ACQUISITION_PROMOTION_STAGES[index + 1] ?? null;
}

export function isAllowedAcquisitionPromotionTransition(
  fromStage: AcquisitionPromotionStage,
  toStage: AcquisitionPromotionStage,
): boolean {
  return nextAcquisitionPromotionStage(fromStage) === toStage;
}
