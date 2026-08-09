import {
  SOURCE_INTELLIGENCE_REVIEW_HEALTH_PROTOCOL_VERSION,
  type SourceIntelligenceObservationFlagKind,
  type SourceIntelligenceObservationFlagV2,
  type SourceIntelligenceObservationHistoryV2,
  type SourceIntelligenceObservationReviewEventV2,
  type SourceIntelligenceObservationReviewQueueItemV2,
  type SourceIntelligenceObservationReviewQueueV2,
  type SourceIntelligenceReviewHealthRecurrenceV2,
  type SourceIntelligenceReviewQueueOperationalHealthV2,
} from "@markorbit/contracts";
import { buildSourceIntelligenceCrossSourceObservationSummaryV2 } from "./source-intelligence-cross-source-observation";
import { sourceIntelligenceObservationReviewKey } from "./source-intelligence-review-queue";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RECURRENCE_LIMIT = 20;
const ATTENTION_LIMIT = 25;
const RECENT_EVENT_LIMIT = 50;

function ageHours(observedAt: string, generatedAt: string): number {
  const delta = Date.parse(generatedAt) - Date.parse(observedAt);
  if (!Number.isFinite(delta)) return 0;
  return Math.round((Math.max(0, delta) / HOUR_MS) * 10) / 10;
}

function historicalFlags(histories: SourceIntelligenceObservationHistoryV2[]) {
  const byKey = new Map<string, SourceIntelligenceObservationFlagV2>();
  for (const history of histories) {
    for (let index = 0; index < history.observations.length; index += 1) {
      const summary = buildSourceIntelligenceCrossSourceObservationSummaryV2([
        {
          sourceId: history.sourceId,
          observations: history.observations.slice(0, index + 1),
          transitions: history.transitions.slice(0, index),
        },
      ]);
      for (const flag of summary.flags) {
        byKey.set(sourceIntelligenceObservationReviewKey(flag), flag);
      }
    }
  }
  return [...byKey.entries()].map(([observationKey, flag]) => ({ observationKey, flag }));
}

function recurrenceKey(sourceId: string, kind: SourceIntelligenceObservationFlagKind): string {
  return `${sourceId}|${kind}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : sorted[middle];
  return value === undefined ? null : Math.round(value * 10) / 10;
}

function compareAttention(
  left: SourceIntelligenceObservationReviewQueueItemV2 & {
    pendingAgeHours: number;
    occurrenceCount: number;
  },
  right: SourceIntelligenceObservationReviewQueueItemV2 & {
    pendingAgeHours: number;
    occurrenceCount: number;
  },
): number {
  if (left.flag.severity !== right.flag.severity) {
    return left.flag.severity === "ATTENTION" ? -1 : 1;
  }
  if (left.pendingAgeHours !== right.pendingAgeHours) {
    return right.pendingAgeHours - left.pendingAgeHours;
  }
  if (left.occurrenceCount !== right.occurrenceCount) {
    return right.occurrenceCount - left.occurrenceCount;
  }
  const sourceDelta = left.sourceId.localeCompare(right.sourceId);
  return sourceDelta !== 0 ? sourceDelta : left.flag.kind.localeCompare(right.flag.kind);
}

export function buildSourceIntelligenceReviewQueueOperationalHealthV2(input: {
  queue: SourceIntelligenceObservationReviewQueueV2;
  histories: SourceIntelligenceObservationHistoryV2[];
  reviewEvents: SourceIntelligenceObservationReviewEventV2[];
  generatedAt: string;
}): SourceIntelligenceReviewQueueOperationalHealthV2 {
  const occurrences = historicalFlags(input.histories);
  const occurrencesByKey = new Map(occurrences.map((entry) => [entry.observationKey, entry.flag]));
  const recurrenceMap = new Map<
    string,
    { sourceId: string; flagKind: SourceIntelligenceObservationFlagKind; dates: string[] }
  >();
  for (const { flag } of occurrences) {
    const key = recurrenceKey(flag.sourceId, flag.kind);
    const entry = recurrenceMap.get(key) ?? {
      sourceId: flag.sourceId,
      flagKind: flag.kind,
      dates: [],
    };
    entry.dates.push(flag.observedAt);
    recurrenceMap.set(key, entry);
  }

  const recurrenceRows: SourceIntelligenceReviewHealthRecurrenceV2[] = [...recurrenceMap.values()]
    .map((entry) => ({
      sourceId: entry.sourceId,
      flagKind: entry.flagKind,
      occurrenceCount: entry.dates.length,
      latestObservedAt: [...entry.dates].sort(
        (left, right) => Date.parse(right) - Date.parse(left),
      )[0]!,
    }))
    .filter((entry) => entry.occurrenceCount >= 2)
    .sort((left, right) => {
      if (left.occurrenceCount !== right.occurrenceCount) {
        return right.occurrenceCount - left.occurrenceCount;
      }
      const timeDelta = Date.parse(right.latestObservedAt) - Date.parse(left.latestObservedAt);
      if (timeDelta !== 0) return timeDelta;
      const sourceDelta = left.sourceId.localeCompare(right.sourceId);
      return sourceDelta !== 0 ? sourceDelta : left.flagKind.localeCompare(right.flagKind);
    });

  const pendingItems = input.queue.items.filter((item) => item.status === "PENDING");
  const pendingWithAge = pendingItems.map((item) => ({
    ...item,
    pendingAgeHours: ageHours(item.flag.observedAt, input.generatedAt),
    occurrenceCount:
      recurrenceMap.get(recurrenceKey(item.sourceId, item.flag.kind))?.dates.length ?? 1,
  }));
  const oldestPending = [...pendingWithAge].sort(
    (left, right) => Date.parse(left.flag.observedAt) - Date.parse(right.flag.observedAt),
  )[0];

  const ageBuckets = {
    under24Hours: 0,
    from24To72Hours: 0,
    from72HoursTo7Days: 0,
    atLeast7Days: 0,
  };
  for (const item of pendingItems) {
    const ageMs = Math.max(0, Date.parse(input.generatedAt) - Date.parse(item.flag.observedAt));
    if (ageMs < DAY_MS) ageBuckets.under24Hours += 1;
    else if (ageMs < 3 * DAY_MS) ageBuckets.from24To72Hours += 1;
    else if (ageMs < 7 * DAY_MS) ageBuckets.from72HoursTo7Days += 1;
    else ageBuckets.atLeast7Days += 1;
  }

  const events = [...input.reviewEvents].sort((left, right) => {
    const timeDelta = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    return timeDelta !== 0 ? timeDelta : right.eventId.localeCompare(left.eventId);
  });
  const firstEventByObservation = new Map<string, SourceIntelligenceObservationReviewEventV2>();
  for (const event of [...events].reverse()) {
    if (!firstEventByObservation.has(event.observationKey)) {
      firstEventByObservation.set(event.observationKey, event);
    }
  }
  const firstTouchLatencies = [...firstEventByObservation.entries()].flatMap(
    ([observationKey, event]) => {
      const flag = occurrencesByKey.get(observationKey);
      if (!flag) return [];
      return [ageHours(flag.observedAt, event.occurredAt)];
    },
  );

  const attention = pendingWithAge
    .sort(compareAttention)
    .slice(0, ATTENTION_LIMIT)
    .map((item) => ({
      observationKey: item.observationKey,
      sourceId: item.sourceId,
      flagKind: item.flag.kind,
      severity: item.flag.severity,
      observedAt: item.flag.observedAt,
      pendingAgeHours: item.pendingAgeHours,
      occurrenceCount: item.occurrenceCount,
    }));

  const sourceIds = [...new Set(input.histories.map((history) => history.sourceId))];
  const sources = sourceIds
    .map((sourceId) => {
      const current = input.queue.items.filter((item) => item.sourceId === sourceId);
      const sourcePending = pendingWithAge.filter((item) => item.sourceId === sourceId);
      const sourceOccurrences = occurrences.filter((entry) => entry.flag.sourceId === sourceId);
      const sourceRecurrences = recurrenceRows.filter((entry) => entry.sourceId === sourceId);
      const sourceEvents = events.filter((event) => event.sourceId === sourceId);
      return {
        sourceId,
        currentQueueItemCount: current.length,
        pendingCount: current.filter((item) => item.status === "PENDING").length,
        acknowledgedCount: current.filter((item) => item.status === "ACKNOWLEDGED").length,
        ignoredCount: current.filter((item) => item.status === "IGNORED").length,
        oldestPendingAgeHours:
          sourcePending.length === 0
            ? null
            : Math.max(...sourcePending.map((item) => item.pendingAgeHours)),
        historicalOccurrenceCount: sourceOccurrences.length,
        recurringFlagKindCount: sourceRecurrences.length,
        reviewEventCount: sourceEvents.length,
        lastReviewAt: sourceEvents[0]?.occurredAt ?? null,
      };
    })
    .sort((left, right) => {
      if (left.pendingCount !== right.pendingCount) return right.pendingCount - left.pendingCount;
      if ((left.oldestPendingAgeHours ?? -1) !== (right.oldestPendingAgeHours ?? -1)) {
        return (right.oldestPendingAgeHours ?? -1) - (left.oldestPendingAgeHours ?? -1);
      }
      return left.sourceId.localeCompare(right.sourceId);
    });

  return {
    protocolVersion: SOURCE_INTELLIGENCE_REVIEW_HEALTH_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_REVIEW_QUEUE_OPERATIONAL_HEALTH",
    generatedAt: input.generatedAt,
    sourceCount: input.queue.sourceCount,
    currentQueueItemCount: input.queue.itemCount,
    currentCounts: { ...input.queue.counts },
    backlog: {
      oldestPendingObservedAt: oldestPending?.flag.observedAt ?? null,
      oldestPendingAgeHours: oldestPending?.pendingAgeHours ?? null,
      ageBuckets,
    },
    recurrence: {
      historicalOccurrenceCount: occurrences.length,
      recurringSourceFlagPairCount: recurrenceRows.length,
      maxOccurrenceCount:
        recurrenceRows.length === 0
          ? 0
          : Math.max(...recurrenceRows.map((entry) => entry.occurrenceCount)),
      top: recurrenceRows.slice(0, RECURRENCE_LIMIT),
    },
    reviewActivity: {
      eventCount: events.length,
      acknowledgedEvents: events.filter(
        (event) => event.action === "DISPOSITION_CHANGED" && event.status === "ACKNOWLEDGED",
      ).length,
      ignoredEvents: events.filter(
        (event) => event.action === "DISPOSITION_CHANGED" && event.status === "IGNORED",
      ).length,
      reopenedToPendingEvents: events.filter(
        (event) => event.action === "DISPOSITION_CHANGED" && event.status === "PENDING",
      ).length,
      noteUpdateEvents: events.filter((event) => event.action === "NOTE_UPDATED").length,
      snapshotBackfillEvents: events.filter((event) => event.action === "SNAPSHOT_BACKFILL").length,
      medianFirstTouchLatencyHours: median(firstTouchLatencies),
    },
    attention,
    sources,
    recentReviewEvents: events.slice(0, RECENT_EVENT_LIMIT),
    semantics: {
      currentQueueInput: "CURRENT_D2_9_REVIEW_QUEUE",
      recurrenceInput: "DISTINCT_EVIDENCE_STATE_HISTORY",
      reviewHistoryInput: "PERSISTED_REVIEW_EVENTS",
      pendingAgeIsOperatorBacklogAgeNotEvidenceFreshness: true,
      attentionOrderIsDescriptiveNotSchedulerPriority: true,
      recurrenceDoesNotImplyTruthOrQuality: true,
      reviewEventsDoNotMutateObservationEvidence: true,
    },
    scheduling: {
      policyStatus: "NOT_AUTHORIZED_UNCALIBRATED",
    },
    boundaries: {
      healthDoesNotAuthorizeAction: true,
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
