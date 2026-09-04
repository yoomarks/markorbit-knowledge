import type {
  CanonicalDownstreamDocumentV1,
  ReadyPackageV2,
  VaultOriginStagingDocumentV1,
  VaultOriginStagingFinalizationV1,
  VaultOriginStagingVerificationEvidenceV1,
} from "@markorbit/contracts";
import type { ReadyPackageV2DeliveryAuditEvent } from "./ready-package-v2-delivery-audit";
import type { ReadyPackageV2DeliverySubmission } from "./ready-package-v2-delivery-submission";

export const PRODUCER_CORE_RELIABILITY_SCORECARD_VERSION = "1.0" as const;

export const PRODUCER_CORE_RELIABILITY_DELIVERY_STATES = [
  "SAFE_TO_SUBMIT",
  "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST",
  "LOCAL_FINALIZATION_REQUIRED",
  "DELIVERED",
  "CONSUMER_REJECTED",
  "EVIDENCE_INCONSISTENT",
] as const;

export type ProducerCoreReliabilityDeliveryState =
  (typeof PRODUCER_CORE_RELIABILITY_DELIVERY_STATES)[number];

export type ProducerCoreReliabilityWindow = {
  from: string;
  to: string;
};

export type ProducerCoreReliabilityQueryV1 = {
  workspaceId: string;
  window: ProducerCoreReliabilityWindow;
  bindingId?: string;
};

export type ProducerCoreReliabilityRate = {
  numerator: number;
  denominator: number;
  value: number | null;
};

export type ProducerCoreReliabilityLatencyDistribution = {
  sampleSize: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

export type ProducerCoreReliabilityDeliveryEvidence = {
  submission: ReadyPackageV2DeliverySubmission;
  auditEvents: ReadyPackageV2DeliveryAuditEvent[];
};

export type ProducerCoreReliabilityEvidenceV1 = {
  stagingDocuments: VaultOriginStagingDocumentV1[];
  verifications: VaultOriginStagingVerificationEvidenceV1[];
  finalizations: VaultOriginStagingFinalizationV1[];
  canonicalDocuments: CanonicalDownstreamDocumentV1[];
  readyPackages: ReadyPackageV2[];
  deliveries: ProducerCoreReliabilityDeliveryEvidence[];
};

export type ProducerCoreReliabilityDeliveryProjection = {
  submissionId: string;
  readyPackageId: string;
  state: ProducerCoreReliabilityDeliveryState;
  attemptCount: number;
  resultStatus: "RECEIVED" | "ACCEPTED" | "REJECTED" | null;
  preparedAt: string | null;
  resultRecordedAt: string | null;
  finalizedAt: string | null;
  lastAuditRecordedAt: string | null;
  hadOutcomeUnknown: boolean;
  recoveredAfterUnknown: boolean;
};

export type ProducerCoreReliabilityBindingCohort = {
  bindingId: string;
  promoted: number;
  readyPackageCreated: number;
  deliveryPrepared: number;
  deliveryAttempted: number;
  delivered: number;
  consumerRejected: number;
  outcomeUnknown: number;
  promotedToReadyPackageLatency: ProducerCoreReliabilityLatencyDistribution;
};

export type ProducerCoreReliabilityScorecardV1 = {
  version: typeof PRODUCER_CORE_RELIABILITY_SCORECARD_VERSION;
  workspaceId: string;
  window: ProducerCoreReliabilityWindow;
  filters: {
    bindingId: string | null;
  };
  coverage: {
    observed: "CANONICAL_ORIGIN_RETROSPECTIVE";
    imported: "VAULT_STAGING_DOCUMENTS";
    verified: "VAULT_STAGING_VERIFICATIONS";
    finalized: "VAULT_STAGING_FINALIZATIONS";
    promoted: "CANONICAL_DOWNSTREAM_DOCUMENTS";
    readyPackage: "READY_PACKAGE_V2";
    delivery: "APPEND_ONLY_DELIVERY_AUDIT";
    latencyCohortAnchor: "START_EVENT_IN_WINDOW_END_BEFORE_WINDOW_TO";
  };
  funnel: {
    observed: number;
    imported: number;
    verified: number;
    verificationPass: number;
    verificationPassWithWarnings: number;
    verificationFail: number;
    finalized: number;
    finalizationVerified: number;
    finalizationBlocked: number;
    promoted: number;
    readyPackageCreated: number;
    deliveryPrepared: number;
    deliveryResultRecorded: number;
    deliveryFinalized: number;
  };
  progression: {
    verifiedFinalizationToCanonical: ProducerCoreReliabilityRate;
    canonicalPromotionToReadyPackage: ProducerCoreReliabilityRate;
    readyPackageToDeliveryPrepared: ProducerCoreReliabilityRate;
    attemptedDeliveryKnownResult: ProducerCoreReliabilityRate;
    attemptedDeliveryDeliveredSuccess: ProducerCoreReliabilityRate;
  };
  delivery: {
    attemptedCohortSize: number;
    resultStatus: {
      RECEIVED: number;
      ACCEPTED: number;
      REJECTED: number;
      noDurableResult: number;
    };
    state: Record<ProducerCoreReliabilityDeliveryState, number>;
    outcomeUnknown: number;
    reconciliationRequired: number;
    retrying: number;
    resolvedAfterRetry: number;
    recoveredAfterUnknown: number;
  };
  latency: {
    observedToImported: ProducerCoreReliabilityLatencyDistribution;
    importedToVerified: ProducerCoreReliabilityLatencyDistribution;
    verifiedToPromoted: ProducerCoreReliabilityLatencyDistribution;
    promotedToReadyPackage: ProducerCoreReliabilityLatencyDistribution;
    readyPackageToDeliveryPrepared: ProducerCoreReliabilityLatencyDistribution;
    readyPackageToDeliveryResult: ProducerCoreReliabilityLatencyDistribution;
  };
  cohorts: {
    byBinding: ProducerCoreReliabilityBindingCohort[];
  };
  drillThrough: {
    reconciliation: Array<{
      submissionId: string;
      readyPackageId: string;
      state: ProducerCoreReliabilityDeliveryState;
      resultStatus: "RECEIVED" | "ACCEPTED" | "REJECTED" | null;
      attemptCount: number;
      lastAuditRecordedAt: string | null;
    }>;
  };
};

const EMPTY_LATENCY: ProducerCoreReliabilityLatencyDistribution = {
  sampleSize: 0,
  p50Ms: null,
  p95Ms: null,
  maxMs: null,
};

function parseTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateWindow(window: ProducerCoreReliabilityWindow): { from: number; to: number } {
  const from = parseTime(window.from);
  const to = parseTime(window.to);
  if (from === null || to === null || from >= to) {
    throw new Error("Producer/Core reliability window must be valid and satisfy from < to");
  }
  return { from, to };
}

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function inWindow(value: string, window: { from: number; to: number }): boolean {
  const timestamp = parseTime(value);
  return timestamp !== null && timestamp >= window.from && timestamp < window.to;
}

function beforeTo(value: string, window: { to: number }): boolean {
  const timestamp = parseTime(value);
  return timestamp !== null && timestamp < window.to;
}

function durationMs(start: string, end: string): number | null {
  const startMs = parseTime(start);
  const endMs = parseTime(end);
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return endMs - startMs;
}

function nearestRank(sorted: number[], percentile: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index] ?? null;
}

export function summarizeProducerCoreLatency(
  samples: Array<number | null>,
): ProducerCoreReliabilityLatencyDistribution {
  const sorted = samples
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (sorted.length === 0) return { ...EMPTY_LATENCY };
  return {
    sampleSize: sorted.length,
    p50Ms: nearestRank(sorted, 0.5),
    p95Ms: nearestRank(sorted, 0.95),
    maxMs: sorted[sorted.length - 1] ?? null,
  };
}

function rate(numerator: number, denominator: number): ProducerCoreReliabilityRate {
  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

function matchesWorkspace(value: { workspaceId: string }, workspaceId: string): boolean {
  return value.workspaceId === workspaceId;
}

function deliveryStateRecord(): Record<ProducerCoreReliabilityDeliveryState, number> {
  return {
    SAFE_TO_SUBMIT: 0,
    OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST: 0,
    LOCAL_FINALIZATION_REQUIRED: 0,
    DELIVERED: 0,
    CONSUMER_REJECTED: 0,
    EVIDENCE_INCONSISTENT: 0,
  };
}

/**
 * Reconstruct delivery state from append-only audit evidence as of a historical cutoff.
 * Mutable submission result/attempt fields are deliberately not used for outcome classification,
 * so evidence written after the cutoff cannot leak into an earlier scorecard window.
 */
export function projectReadyPackageV2DeliveryAsOf(
  evidence: ProducerCoreReliabilityDeliveryEvidence,
  cutoff: string,
): ProducerCoreReliabilityDeliveryProjection {
  const cutoffMs = parseTime(cutoff);
  if (cutoffMs === null) throw new Error("Delivery projection cutoff must be a valid timestamp");

  const { submission } = evidence;
  const auditEvents = evidence.auditEvents
    .filter((event) => {
      const timestamp = parseTime(event.recordedAt);
      return timestamp !== null && timestamp < cutoffMs;
    })
    .slice()
    .sort((left, right) => left.sequence - right.sequence);

  let inconsistent = false;
  let attemptCount = 0;
  let lastAttemptNumber: number | null = null;
  let priorRecordedAt: number | null = null;
  let preparedAt: string | null = null;
  let resultRecordedAt: string | null = null;
  let finalizedAt: string | null = null;
  let resultStatus: "RECEIVED" | "ACCEPTED" | "REJECTED" | null = null;
  let finalizedStatus: "RECEIVED" | "ACCEPTED" | "REJECTED" | null = null;
  let finalizedAttemptNumber: number | null = null;
  let resultAttemptNumber: number | null = null;
  let lastAuditRecordedAt: string | null = null;
  let finalizedSeen = false;
  const unknownAttempts = new Set<number>();

  for (let index = 0; index < auditEvents.length; index += 1) {
    const event = auditEvents[index]!;
    const recordedAt = parseTime(event.recordedAt);
    if (
      event.sequence !== index + 1 ||
      event.workspaceId !== submission.workspaceId ||
      event.submissionId !== submission.submissionId ||
      event.readyPackageId !== submission.readyPackageId ||
      event.requestSha256 !== submission.requestSha256 ||
      recordedAt === null ||
      (priorRecordedAt !== null && recordedAt < priorRecordedAt)
    ) {
      inconsistent = true;
    }
    priorRecordedAt = recordedAt;
    lastAuditRecordedAt = event.recordedAt;

    if (finalizedSeen) inconsistent = true;

    if (event.type === "PREPARED") {
      if (index !== 0 || preparedAt !== null || event.recordedAt !== submission.createdAt) {
        inconsistent = true;
      }
      preparedAt = event.recordedAt;
      continue;
    }

    if (index === 0 || preparedAt === null) inconsistent = true;

    if (event.type === "TRANSPORT_ATTEMPT_STARTED") {
      const expectedAttempt = attemptCount + 1;
      if (resultRecordedAt !== null || event.attemptNumber !== expectedAttempt) inconsistent = true;
      attemptCount += 1;
      lastAttemptNumber = event.attemptNumber ?? null;
      continue;
    }

    if (event.type === "TRANSPORT_OUTCOME_UNKNOWN") {
      if (
        lastAttemptNumber === null ||
        event.attemptNumber !== lastAttemptNumber ||
        event.attemptNumber !== attemptCount ||
        resultRecordedAt !== null
      ) {
        inconsistent = true;
      }
      if (event.attemptNumber !== undefined) {
        if (unknownAttempts.has(event.attemptNumber)) inconsistent = true;
        unknownAttempts.add(event.attemptNumber);
      }
      continue;
    }

    if (event.type === "TRANSPORT_RESULT_RECORDED") {
      if (
        resultRecordedAt !== null ||
        lastAttemptNumber === null ||
        event.attemptNumber !== lastAttemptNumber ||
        event.attemptNumber !== attemptCount ||
        event.resultStatus === undefined ||
        (event.attemptNumber !== undefined && unknownAttempts.has(event.attemptNumber))
      ) {
        inconsistent = true;
      }
      resultRecordedAt = event.recordedAt;
      resultStatus = event.resultStatus ?? null;
      resultAttemptNumber = event.attemptNumber ?? null;
      continue;
    }

    if (event.type === "FINALIZED") {
      if (
        finalizedSeen ||
        resultRecordedAt === null ||
        event.resultStatus === undefined ||
        event.resultStatus !== resultStatus ||
        event.attemptNumber !== resultAttemptNumber
      ) {
        inconsistent = true;
      }
      finalizedSeen = true;
      finalizedAt = event.recordedAt;
      finalizedStatus = event.resultStatus ?? null;
      finalizedAttemptNumber = event.attemptNumber ?? null;
    }
  }

  if (auditEvents.length > 0) {
    const preparedEvents = auditEvents.filter((event) => event.type === "PREPARED").length;
    if (auditEvents[0]?.type !== "PREPARED" || preparedEvents !== 1) inconsistent = true;
  } else if (beforeTo(submission.createdAt, { to: cutoffMs })) {
    inconsistent = true;
  }

  if (
    finalizedAt !== null &&
    (finalizedStatus !== resultStatus || finalizedAttemptNumber !== resultAttemptNumber)
  ) {
    inconsistent = true;
  }

  const hadOutcomeUnknown = unknownAttempts.size > 0;
  const recoveredAfterUnknown =
    hadOutcomeUnknown &&
    resultAttemptNumber !== null &&
    Array.from(unknownAttempts).some((attempt) => attempt < resultAttemptNumber);

  let state: ProducerCoreReliabilityDeliveryState;
  if (inconsistent) state = "EVIDENCE_INCONSISTENT";
  else if (resultStatus === "REJECTED") state = "CONSUMER_REJECTED";
  else if (finalizedAt !== null) state = "DELIVERED";
  else if (resultRecordedAt !== null) state = "LOCAL_FINALIZATION_REQUIRED";
  else if (attemptCount > 0) state = "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST";
  else state = "SAFE_TO_SUBMIT";

  return {
    submissionId: submission.submissionId,
    readyPackageId: submission.readyPackageId,
    state,
    attemptCount,
    resultStatus,
    preparedAt,
    resultRecordedAt,
    finalizedAt,
    lastAuditRecordedAt,
    hadOutcomeUnknown,
    recoveredAfterUnknown,
  };
}

function bindingForDelivery(
  delivery: ProducerCoreReliabilityDeliveryEvidence,
  readyPackagesById: Map<string, ReadyPackageV2>,
): string | null {
  return (
    readyPackagesById.get(delivery.submission.readyPackageId)?.evidence.origin.binding.bindingId ??
    null
  );
}

function firstTransportAttemptInWindow(
  delivery: ProducerCoreReliabilityDeliveryEvidence,
  window: { from: number; to: number },
): boolean {
  const firstAttempt = delivery.auditEvents
    .filter((event) => event.type === "TRANSPORT_ATTEMPT_STARTED")
    .slice()
    .sort((left, right) => left.sequence - right.sequence)[0];
  return firstAttempt ? inWindow(firstAttempt.recordedAt, window) : false;
}

function buildBindingCohorts(
  canonicalDocuments: CanonicalDownstreamDocumentV1[],
  readyPackages: ReadyPackageV2[],
  deliveries: ProducerCoreReliabilityDeliveryEvidence[],
  projections: Map<string, ProducerCoreReliabilityDeliveryProjection>,
  window: { from: number; to: number },
): ProducerCoreReliabilityBindingCohort[] {
  const bindingIds = new Set<string>();
  for (const document of canonicalDocuments) bindingIds.add(document.origin.binding.bindingId);
  for (const readyPackage of readyPackages)
    bindingIds.add(readyPackage.evidence.origin.binding.bindingId);

  const readyPackagesById = new Map(readyPackages.map((item) => [item.id, item]));
  const packagesByCanonical = new Map<string, ReadyPackageV2>();
  for (const readyPackage of readyPackages) {
    const existing = packagesByCanonical.get(readyPackage.evidence.canonicalDocumentId);
    if (!existing || Date.parse(readyPackage.createdAt) < Date.parse(existing.createdAt)) {
      packagesByCanonical.set(readyPackage.evidence.canonicalDocumentId, readyPackage);
    }
  }

  return Array.from(bindingIds)
    .sort()
    .map((bindingId) => {
      const documents = canonicalDocuments.filter(
        (document) => document.origin.binding.bindingId === bindingId,
      );
      const bindingPackages = readyPackages.filter(
        (readyPackage) => readyPackage.evidence.origin.binding.bindingId === bindingId,
      );
      const bindingDeliveries = deliveries.filter(
        (delivery) => bindingForDelivery(delivery, readyPackagesById) === bindingId,
      );
      const attemptedBindingDeliveries = bindingDeliveries.filter((delivery) =>
        firstTransportAttemptInWindow(delivery, window),
      );
      const promotedToReadySamples = documents
        .filter((document) => inWindow(document.promotedAt, window))
        .map((document) => {
          const readyPackage = packagesByCanonical.get(document.id);
          if (!readyPackage || !beforeTo(readyPackage.createdAt, window)) return null;
          return durationMs(document.promotedAt, readyPackage.createdAt);
        });

      let delivered = 0;
      let consumerRejected = 0;
      let outcomeUnknown = 0;
      for (const delivery of attemptedBindingDeliveries) {
        const projection = projections.get(delivery.submission.submissionId);
        if (!projection) continue;
        if (projection.state === "DELIVERED") delivered += 1;
        if (projection.state === "CONSUMER_REJECTED") consumerRejected += 1;
        if (projection.state === "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST") outcomeUnknown += 1;
      }

      return {
        bindingId,
        promoted: documents.filter((document) => inWindow(document.promotedAt, window)).length,
        readyPackageCreated: bindingPackages.filter((item) => inWindow(item.createdAt, window))
          .length,
        deliveryPrepared: bindingDeliveries.filter((delivery) => {
          const projection = projections.get(delivery.submission.submissionId);
          return projection?.preparedAt ? inWindow(projection.preparedAt, window) : false;
        }).length,
        deliveryAttempted: attemptedBindingDeliveries.length,
        delivered,
        consumerRejected,
        outcomeUnknown,
        promotedToReadyPackageLatency: summarizeProducerCoreLatency(promotedToReadySamples),
      };
    });
}

export function buildProducerCoreReliabilityScorecard(
  query: ProducerCoreReliabilityQueryV1,
  evidence: ProducerCoreReliabilityEvidenceV1,
): ProducerCoreReliabilityScorecardV1 {
  const workspaceId = required(query.workspaceId, "workspaceId");
  const window = validateWindow(query.window);
  const bindingId = query.bindingId?.trim() || null;

  const stagingDocuments = evidence.stagingDocuments.filter(
    (item) =>
      matchesWorkspace(item, workspaceId) &&
      beforeTo(item.importedAt, window) &&
      (!bindingId || item.binding.bindingId === bindingId),
  );
  const stagingById = new Map(stagingDocuments.map((item) => [item.id, item]));
  const verifications = evidence.verifications.filter(
    (item) =>
      matchesWorkspace(item, workspaceId) &&
      beforeTo(item.createdAt, window) &&
      stagingById.has(item.vaultStagingDocumentId),
  );
  const verificationIds = new Set(verifications.map((item) => item.id));
  const finalizations = evidence.finalizations.filter(
    (item) =>
      matchesWorkspace(item, workspaceId) &&
      beforeTo(item.finalizedAt, window) &&
      verificationIds.has(item.verificationId),
  );
  const canonicalDocuments = evidence.canonicalDocuments.filter(
    (item) =>
      matchesWorkspace(item, workspaceId) &&
      beforeTo(item.promotedAt, window) &&
      (!bindingId || item.origin.binding.bindingId === bindingId),
  );
  const readyPackages = evidence.readyPackages.filter(
    (item) =>
      matchesWorkspace(item, workspaceId) &&
      beforeTo(item.createdAt, window) &&
      (!bindingId || item.evidence.origin.binding.bindingId === bindingId),
  );
  const readyPackagesById = new Map(readyPackages.map((item) => [item.id, item]));
  const deliveries = evidence.deliveries.filter(
    (item) =>
      item.submission.workspaceId === workspaceId &&
      beforeTo(item.submission.createdAt, window) &&
      readyPackagesById.has(item.submission.readyPackageId),
  );

  const projections = new Map<string, ProducerCoreReliabilityDeliveryProjection>();
  for (const delivery of deliveries) {
    projections.set(
      delivery.submission.submissionId,
      projectReadyPackageV2DeliveryAsOf(delivery, query.window.to),
    );
  }

  const promotedCanonical = canonicalDocuments.filter((item) => inWindow(item.promotedAt, window));
  const verifiedFinalizations = finalizations.filter(
    (item) => item.state === "VERIFIED" && inWindow(item.finalizedAt, window),
  );
  const canonicalByFinalizationId = new Map(
    canonicalDocuments.map((item) => [item.origin.finalizationId, item]),
  );
  const canonicalFromVerifiedByCutoff = verifiedFinalizations.filter((item) => {
    const canonical = canonicalByFinalizationId.get(item.id);
    return canonical ? beforeTo(canonical.promotedAt, window) : false;
  }).length;

  const packagesByCanonicalId = new Map<string, ReadyPackageV2>();
  for (const readyPackage of readyPackages) {
    const existing = packagesByCanonicalId.get(readyPackage.evidence.canonicalDocumentId);
    if (!existing || Date.parse(readyPackage.createdAt) < Date.parse(existing.createdAt)) {
      packagesByCanonicalId.set(readyPackage.evidence.canonicalDocumentId, readyPackage);
    }
  }
  const readyFromPromotedByCutoff = promotedCanonical.filter((document) => {
    const readyPackage = packagesByCanonicalId.get(document.id);
    return readyPackage ? beforeTo(readyPackage.createdAt, window) : false;
  }).length;

  const readyPackageCohort = readyPackages.filter((item) => inWindow(item.createdAt, window));
  const deliveryByReadyPackageId = new Map(
    deliveries.map((item) => [item.submission.readyPackageId, item]),
  );
  const preparedFromReadyByCutoff = readyPackageCohort.filter((readyPackage) => {
    const delivery = deliveryByReadyPackageId.get(readyPackage.id);
    if (!delivery) return false;
    return projections.get(delivery.submission.submissionId)?.preparedAt !== null;
  }).length;

  const attemptedDeliveries = deliveries.filter((delivery) =>
    firstTransportAttemptInWindow(delivery, window),
  );

  const deliveryStates = deliveryStateRecord();
  const resultStatus = { RECEIVED: 0, ACCEPTED: 0, REJECTED: 0, noDurableResult: 0 };
  let retrying = 0;
  let resolvedAfterRetry = 0;
  let recoveredAfterUnknown = 0;
  for (const delivery of attemptedDeliveries) {
    const projection = projections.get(delivery.submission.submissionId)!;
    deliveryStates[projection.state] += 1;
    if (projection.resultStatus === null) resultStatus.noDurableResult += 1;
    else resultStatus[projection.resultStatus] += 1;
    if (projection.attemptCount > 1) {
      retrying += 1;
      if (projection.resultStatus !== null && projection.state !== "EVIDENCE_INCONSISTENT") {
        resolvedAfterRetry += 1;
      }
    }
    if (projection.recoveredAfterUnknown && projection.state !== "EVIDENCE_INCONSISTENT") {
      recoveredAfterUnknown += 1;
    }
  }

  const knownResultCount = resultStatus.RECEIVED + resultStatus.ACCEPTED + resultStatus.REJECTED;
  const deliveredSuccessCount = deliveryStates.DELIVERED;
  const reconciliationRequired =
    deliveryStates.OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST +
    deliveryStates.LOCAL_FINALIZATION_REQUIRED +
    deliveryStates.EVIDENCE_INCONSISTENT;

  const observedToImported = canonicalDocuments
    .filter(
      (item) =>
        inWindow(item.origin.observedAt, window) && beforeTo(item.origin.importedAt, window),
    )
    .map((item) => durationMs(item.origin.observedAt, item.origin.importedAt));
  const importedToVerified = canonicalDocuments
    .filter(
      (item) =>
        inWindow(item.origin.importedAt, window) && beforeTo(item.origin.verifiedAt, window),
    )
    .map((item) => durationMs(item.origin.importedAt, item.origin.verifiedAt));
  const verifiedToPromoted = canonicalDocuments
    .filter((item) => inWindow(item.origin.verifiedAt, window) && beforeTo(item.promotedAt, window))
    .map((item) => durationMs(item.origin.verifiedAt, item.promotedAt));
  const promotedToReadyPackage = promotedCanonical.map((document) => {
    const readyPackage = packagesByCanonicalId.get(document.id);
    if (!readyPackage || !beforeTo(readyPackage.createdAt, window)) return null;
    return durationMs(document.promotedAt, readyPackage.createdAt);
  });
  const readyPackageToDeliveryPrepared = readyPackageCohort.map((readyPackage) => {
    const delivery = deliveryByReadyPackageId.get(readyPackage.id);
    if (!delivery) return null;
    const projection = projections.get(delivery.submission.submissionId);
    if (!projection?.preparedAt || !beforeTo(projection.preparedAt, window)) return null;
    return durationMs(readyPackage.createdAt, projection.preparedAt);
  });
  const readyPackageToDeliveryResult = readyPackageCohort.map((readyPackage) => {
    const delivery = deliveryByReadyPackageId.get(readyPackage.id);
    if (!delivery) return null;
    const projection = projections.get(delivery.submission.submissionId);
    if (!projection?.resultRecordedAt || !beforeTo(projection.resultRecordedAt, window))
      return null;
    return durationMs(readyPackage.createdAt, projection.resultRecordedAt);
  });

  const deliveryPreparedCount = Array.from(projections.values()).filter(
    (projection) => projection.preparedAt && inWindow(projection.preparedAt, window),
  ).length;
  const deliveryResultCount = Array.from(projections.values()).filter(
    (projection) => projection.resultRecordedAt && inWindow(projection.resultRecordedAt, window),
  ).length;
  const deliveryFinalizedCount = Array.from(projections.values()).filter(
    (projection) => projection.finalizedAt && inWindow(projection.finalizedAt, window),
  ).length;

  const reconciliation = Array.from(projections.values())
    .filter((projection) =>
      [
        "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST",
        "LOCAL_FINALIZATION_REQUIRED",
        "CONSUMER_REJECTED",
        "EVIDENCE_INCONSISTENT",
      ].includes(projection.state),
    )
    .sort((left, right) => left.submissionId.localeCompare(right.submissionId))
    .map((projection) => ({
      submissionId: projection.submissionId,
      readyPackageId: projection.readyPackageId,
      state: projection.state,
      resultStatus: projection.resultStatus,
      attemptCount: projection.attemptCount,
      lastAuditRecordedAt: projection.lastAuditRecordedAt,
    }));

  return {
    version: PRODUCER_CORE_RELIABILITY_SCORECARD_VERSION,
    workspaceId,
    window: { from: query.window.from, to: query.window.to },
    filters: { bindingId },
    coverage: {
      observed: "CANONICAL_ORIGIN_RETROSPECTIVE",
      imported: "VAULT_STAGING_DOCUMENTS",
      verified: "VAULT_STAGING_VERIFICATIONS",
      finalized: "VAULT_STAGING_FINALIZATIONS",
      promoted: "CANONICAL_DOWNSTREAM_DOCUMENTS",
      readyPackage: "READY_PACKAGE_V2",
      delivery: "APPEND_ONLY_DELIVERY_AUDIT",
      latencyCohortAnchor: "START_EVENT_IN_WINDOW_END_BEFORE_WINDOW_TO",
    },
    funnel: {
      observed: canonicalDocuments.filter((item) => inWindow(item.origin.observedAt, window))
        .length,
      imported: stagingDocuments.filter((item) => inWindow(item.importedAt, window)).length,
      verified: verifications.filter((item) => inWindow(item.createdAt, window)).length,
      verificationPass: verifications.filter(
        (item) => item.outcome === "PASS" && inWindow(item.createdAt, window),
      ).length,
      verificationPassWithWarnings: verifications.filter(
        (item) => item.outcome === "PASS_WITH_WARNINGS" && inWindow(item.createdAt, window),
      ).length,
      verificationFail: verifications.filter(
        (item) => item.outcome === "FAIL" && inWindow(item.createdAt, window),
      ).length,
      finalized: finalizations.filter((item) => inWindow(item.finalizedAt, window)).length,
      finalizationVerified: finalizations.filter(
        (item) => item.state === "VERIFIED" && inWindow(item.finalizedAt, window),
      ).length,
      finalizationBlocked: finalizations.filter(
        (item) => item.state === "BLOCKED" && inWindow(item.finalizedAt, window),
      ).length,
      promoted: promotedCanonical.length,
      readyPackageCreated: readyPackageCohort.length,
      deliveryPrepared: deliveryPreparedCount,
      deliveryResultRecorded: deliveryResultCount,
      deliveryFinalized: deliveryFinalizedCount,
    },
    progression: {
      verifiedFinalizationToCanonical: rate(
        canonicalFromVerifiedByCutoff,
        verifiedFinalizations.length,
      ),
      canonicalPromotionToReadyPackage: rate(readyFromPromotedByCutoff, promotedCanonical.length),
      readyPackageToDeliveryPrepared: rate(preparedFromReadyByCutoff, readyPackageCohort.length),
      attemptedDeliveryKnownResult: rate(knownResultCount, attemptedDeliveries.length),
      attemptedDeliveryDeliveredSuccess: rate(deliveredSuccessCount, attemptedDeliveries.length),
    },
    delivery: {
      attemptedCohortSize: attemptedDeliveries.length,
      resultStatus,
      state: deliveryStates,
      outcomeUnknown: deliveryStates.OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST,
      reconciliationRequired,
      retrying,
      resolvedAfterRetry,
      recoveredAfterUnknown,
    },
    latency: {
      observedToImported: summarizeProducerCoreLatency(observedToImported),
      importedToVerified: summarizeProducerCoreLatency(importedToVerified),
      verifiedToPromoted: summarizeProducerCoreLatency(verifiedToPromoted),
      promotedToReadyPackage: summarizeProducerCoreLatency(promotedToReadyPackage),
      readyPackageToDeliveryPrepared: summarizeProducerCoreLatency(readyPackageToDeliveryPrepared),
      readyPackageToDeliveryResult: summarizeProducerCoreLatency(readyPackageToDeliveryResult),
    },
    cohorts: {
      byBinding: buildBindingCohorts(
        canonicalDocuments,
        readyPackages,
        deliveries,
        projections,
        window,
      ),
    },
    drillThrough: { reconciliation },
  };
}
