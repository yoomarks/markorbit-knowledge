import type {
  SourceIntelligenceObservationFlagKind,
  SourceIntelligenceObservationFlagV2,
} from "./source-intelligence-cross-source-observation-v2";

export const SOURCE_INTELLIGENCE_REVIEW_QUEUE_PROTOCOL_VERSION = "2.0" as const;

export type SourceIntelligenceObservationReviewStatus = "PENDING" | "ACKNOWLEDGED" | "IGNORED";

export type SourceIntelligenceObservationReviewRecordV2 = {
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  currentAssessmentId: string;
  previousAssessmentId?: string;
  status: SourceIntelligenceObservationReviewStatus;
  reviewer: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type SourceIntelligenceObservationReviewQueueItemV2 = {
  observationKey: string;
  sourceId: string;
  status: SourceIntelligenceObservationReviewStatus;
  flag: SourceIntelligenceObservationFlagV2;
  review: SourceIntelligenceObservationReviewRecordV2 | null;
};

export type SourceIntelligenceObservationReviewQueueV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_REVIEW_QUEUE_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_OBSERVATION_REVIEW_QUEUE";
  sourceCount: number;
  flaggedSourceCount: number;
  itemCount: number;
  counts: {
    pending: number;
    acknowledged: number;
    ignored: number;
  };
  items: SourceIntelligenceObservationReviewQueueItemV2[];
  semantics: {
    input: "CURRENT_CROSS_SOURCE_OBSERVATION_FLAGS";
    reviewScope: "EXACT_OBSERVATION_OCCURRENCE";
    missingReviewDefaultsToPending: true;
    newObservationOccurrenceResetsToPending: true;
    reviewsDoNotMutateObservationEvidence: true;
    reviewsDoNotMutateSourceValue: true;
    reviewsDoNotMutateEvidenceMaturity: true;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  boundaries: {
    reviewDoesNotAuthorizeAction: true;
    legalTruthVerified: false;
    authorityInferred: false;
    professionalQualityVerified: false;
    crossSourceIdentityResolved: false;
    autoScheduleApplied: false;
    grantsCollectionAuthority: false;
    grantsMgsnQualification: false;
  };
};
