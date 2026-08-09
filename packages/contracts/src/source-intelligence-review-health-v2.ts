import type { SourceIntelligenceObservationFlagKind } from "./source-intelligence-cross-source-observation-v2";
import type { SourceIntelligenceObservationReviewStatus } from "./source-intelligence-review-queue-v2";

export const SOURCE_INTELLIGENCE_REVIEW_HEALTH_PROTOCOL_VERSION = "2.0" as const;

export type SourceIntelligenceObservationReviewEventAction =
  "SNAPSHOT_BACKFILL" | "DISPOSITION_CHANGED" | "NOTE_UPDATED" | "REVIEW_TOUCHED";

export type SourceIntelligenceObservationReviewEventV2 = {
  eventId: string;
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  action: SourceIntelligenceObservationReviewEventAction;
  previousStatus: SourceIntelligenceObservationReviewStatus;
  status: SourceIntelligenceObservationReviewStatus;
  reviewer: string;
  note?: string;
  occurredAt: string;
};

export type SourceIntelligenceReviewHealthAgeBucketsV2 = {
  under24Hours: number;
  from24To72Hours: number;
  from72HoursTo7Days: number;
  atLeast7Days: number;
};

export type SourceIntelligenceReviewHealthAttentionItemV2 = {
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  severity: "INFO" | "ATTENTION";
  observedAt: string;
  pendingAgeHours: number;
  occurrenceCount: number;
};

export type SourceIntelligenceReviewHealthRecurrenceV2 = {
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  occurrenceCount: number;
  latestObservedAt: string;
};

export type SourceIntelligenceReviewSourceHealthV2 = {
  sourceId: string;
  currentQueueItemCount: number;
  pendingCount: number;
  acknowledgedCount: number;
  ignoredCount: number;
  oldestPendingAgeHours: number | null;
  historicalOccurrenceCount: number;
  recurringFlagKindCount: number;
  reviewEventCount: number;
  lastReviewAt: string | null;
};

export type SourceIntelligenceReviewQueueOperationalHealthV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_REVIEW_HEALTH_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_REVIEW_QUEUE_OPERATIONAL_HEALTH";
  generatedAt: string;
  sourceCount: number;
  currentQueueItemCount: number;
  currentCounts: {
    pending: number;
    acknowledged: number;
    ignored: number;
  };
  backlog: {
    oldestPendingObservedAt: string | null;
    oldestPendingAgeHours: number | null;
    ageBuckets: SourceIntelligenceReviewHealthAgeBucketsV2;
  };
  recurrence: {
    historicalOccurrenceCount: number;
    recurringSourceFlagPairCount: number;
    maxOccurrenceCount: number;
    top: SourceIntelligenceReviewHealthRecurrenceV2[];
  };
  reviewActivity: {
    eventCount: number;
    acknowledgedEvents: number;
    ignoredEvents: number;
    reopenedToPendingEvents: number;
    noteUpdateEvents: number;
    snapshotBackfillEvents: number;
    medianFirstTouchLatencyHours: number | null;
  };
  attention: SourceIntelligenceReviewHealthAttentionItemV2[];
  sources: SourceIntelligenceReviewSourceHealthV2[];
  recentReviewEvents: SourceIntelligenceObservationReviewEventV2[];
  semantics: {
    currentQueueInput: "CURRENT_D2_9_REVIEW_QUEUE";
    recurrenceInput: "DISTINCT_EVIDENCE_STATE_HISTORY";
    reviewHistoryInput: "PERSISTED_REVIEW_EVENTS";
    pendingAgeIsOperatorBacklogAgeNotEvidenceFreshness: true;
    attentionOrderIsDescriptiveNotSchedulerPriority: true;
    recurrenceDoesNotImplyTruthOrQuality: true;
    reviewEventsDoNotMutateObservationEvidence: true;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  boundaries: {
    healthDoesNotAuthorizeAction: true;
    legalTruthVerified: false;
    authorityInferred: false;
    professionalQualityVerified: false;
    crossSourceIdentityResolved: false;
    autoScheduleApplied: false;
    grantsCollectionAuthority: false;
    grantsMgsnQualification: false;
  };
};
