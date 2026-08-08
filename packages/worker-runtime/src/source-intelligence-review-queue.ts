import { createHash } from "node:crypto";
import {
  SOURCE_INTELLIGENCE_REVIEW_QUEUE_PROTOCOL_VERSION,
  type SourceIntelligenceCrossSourceObservationSummaryV2,
  type SourceIntelligenceObservationFlagV2,
  type SourceIntelligenceObservationReviewQueueV2,
  type SourceIntelligenceObservationReviewRecordV2,
} from "@markorbit/contracts";

function occurrenceIdentity(flag: SourceIntelligenceObservationFlagV2): string {
  return [
    flag.sourceId,
    flag.kind,
    flag.current.assessmentId,
    flag.previous?.assessmentId ?? "none",
  ].join("|");
}

export function sourceIntelligenceObservationReviewKey(
  flag: SourceIntelligenceObservationFlagV2,
): string {
  const digest = createHash("sha256").update(occurrenceIdentity(flag)).digest("hex").slice(0, 32);
  return `sir_${digest}`;
}

function reviewMatchesFlag(
  review: SourceIntelligenceObservationReviewRecordV2,
  flag: SourceIntelligenceObservationFlagV2,
): boolean {
  return (
    review.sourceId === flag.sourceId &&
    review.flagKind === flag.kind &&
    review.currentAssessmentId === flag.current.assessmentId &&
    (review.previousAssessmentId ?? undefined) === (flag.previous?.assessmentId ?? undefined)
  );
}

export function buildSourceIntelligenceObservationReviewQueueV2(
  summary: SourceIntelligenceCrossSourceObservationSummaryV2,
  reviews: SourceIntelligenceObservationReviewRecordV2[],
): SourceIntelligenceObservationReviewQueueV2 {
  const reviewsByKey = new Map(reviews.map((review) => [review.observationKey, review]));
  const items = summary.flags.map((flag) => {
    const observationKey = sourceIntelligenceObservationReviewKey(flag);
    const candidate = reviewsByKey.get(observationKey);
    const review = candidate && reviewMatchesFlag(candidate, flag) ? candidate : null;
    return {
      observationKey,
      sourceId: flag.sourceId,
      status: review?.status ?? "PENDING",
      flag,
      review,
    } as const;
  });

  return {
    protocolVersion: SOURCE_INTELLIGENCE_REVIEW_QUEUE_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_OBSERVATION_REVIEW_QUEUE",
    sourceCount: summary.sourceCount,
    flaggedSourceCount: summary.flaggedSourceCount,
    itemCount: items.length,
    counts: {
      pending: items.filter((item) => item.status === "PENDING").length,
      acknowledged: items.filter((item) => item.status === "ACKNOWLEDGED").length,
      ignored: items.filter((item) => item.status === "IGNORED").length,
    },
    items,
    semantics: {
      input: "CURRENT_CROSS_SOURCE_OBSERVATION_FLAGS",
      reviewScope: "EXACT_OBSERVATION_OCCURRENCE",
      missingReviewDefaultsToPending: true,
      newObservationOccurrenceResetsToPending: true,
      reviewsDoNotMutateObservationEvidence: true,
      reviewsDoNotMutateSourceValue: true,
      reviewsDoNotMutateEvidenceMaturity: true,
    },
    scheduling: {
      policyStatus: "NOT_AUTHORIZED_UNCALIBRATED",
    },
    boundaries: {
      reviewDoesNotAuthorizeAction: true,
      legalTruthVerified: false,
      authorityInferred: false,
      professionalQualityVerified: false,
      crossSourceIdentityResolved: false,
      autoScheduleApplied: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
    },
  };
}
