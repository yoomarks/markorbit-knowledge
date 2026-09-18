import {
  CNIPA_CANDIDATE_ENDPOINTS,
  CnipaAcquisitionError,
  type CnipaDocumentKind,
} from "./cnipa-trademark-judgment";

export const CNIPA_DETAIL_ENRICHMENT_STATE_VERSION = "cnipa-detail-enrichment-v1" as const;

export type CnipaDetailLifecycle =
  "PENDING" | "LEASED" | "FETCHED" | "RETRYABLE" | "PERMANENTLY_UNAVAILABLE";

export type CnipaDetailHoldReason = "AUTH_SECURITY" | null;

export type CnipaDetailLease = {
  leaseId: string;
  leasedAt: string;
  leaseExpiresAt: string;
};

export type CnipaDetailEnrichmentItemV1 = {
  schemaVersion: typeof CNIPA_DETAIL_ENRICHMENT_STATE_VERSION;
  documentKind: CnipaDocumentKind;
  sourceRecordId: string;
  detailCanonicalUri: string;
  discoveredAt: string;
  lifecycle: CnipaDetailLifecycle;
  holdReason: CnipaDetailHoldReason;
  lease: CnipaDetailLease | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  lastHttpStatus: number | null;
  lastBusinessCode: number | null;
  lastSuccessAt: string | null;
  detailArtifactRef: string | null;
  detailSha256: string | null;
};

export type CnipaDetailRetryPolicy = {
  leaseMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
};

export const DEFAULT_CNIPA_DETAIL_RETRY_POLICY: CnipaDetailRetryPolicy = Object.freeze({
  leaseMs: 10 * 60_000,
  retryBaseMs: 5 * 60_000,
  retryMaxMs: 24 * 60 * 60_000,
});

export type CnipaDetailAttemptOutcome =
  | {
      kind: "FETCHED";
      observedAt: string;
      detailArtifactRef: string;
      detailSha256: string;
    }
  | {
      kind: "RETRYABLE";
      observedAt: string;
      errorCode: string;
      httpStatus?: number;
      businessCode?: number;
    }
  | {
      kind: "PERMANENTLY_UNAVAILABLE";
      observedAt: string;
      errorCode: string;
      httpStatus?: number;
      businessCode?: number;
    }
  | {
      kind: "AUTH_SECURITY_HOLD";
      observedAt: string;
      errorCode: string;
      httpStatus?: number;
    };

export type CnipaDetailAttemptTransition = {
  item: CnipaDetailEnrichmentItemV1;
  laneAction: "CONTINUE" | "PAUSE_AUTH_SECURITY";
  deduplicated: boolean;
};

function nonEmpty(value: string, label: string): string {
  const resolved = value.trim();
  if (!resolved) {
    throw new CnipaAcquisitionError("CNIPA_QUERY_INVALID", `${label} is required`, false);
  }
  return resolved;
}

function iso(value: string, label: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      `${label} must be an ISO timestamp`,
      false,
    );
  }
  return parsed.toISOString();
}

function nonNegativeInteger(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      `${label} must be a non-negative integer`,
      false,
    );
  }
  return resolved;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      `${label} must be a positive integer`,
      false,
    );
  }
  return value;
}

export function cnipaDetailCanonicalUri(
  documentKind: CnipaDocumentKind,
  sourceRecordId: string,
): string {
  const url = new URL(
    CNIPA_CANDIDATE_ENDPOINTS[documentKind].detailPath,
    "https://pub.sbj.cnipa.gov.cn",
  );
  url.searchParams.set("id", nonEmpty(sourceRecordId, "sourceRecordId"));
  return url.toString();
}

export function createCnipaDetailEnrichmentItem(input: {
  documentKind: CnipaDocumentKind;
  sourceRecordId: string;
  discoveredAt: string;
  detailCanonicalUri?: string;
}): CnipaDetailEnrichmentItemV1 {
  const sourceRecordId = nonEmpty(input.sourceRecordId, "sourceRecordId");
  const expectedUri = cnipaDetailCanonicalUri(input.documentKind, sourceRecordId);
  if (input.detailCanonicalUri && input.detailCanonicalUri !== expectedUri) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      "DETAIL canonical URI does not match document kind/source record identity",
      false,
    );
  }
  return {
    schemaVersion: CNIPA_DETAIL_ENRICHMENT_STATE_VERSION,
    documentKind: input.documentKind,
    sourceRecordId,
    detailCanonicalUri: expectedUri,
    discoveredAt: iso(input.discoveredAt, "discoveredAt"),
    lifecycle: "PENDING",
    holdReason: null,
    lease: null,
    attemptCount: 0,
    lastAttemptAt: null,
    nextAttemptAt: null,
    lastErrorCode: null,
    lastHttpStatus: null,
    lastBusinessCode: null,
    lastSuccessAt: null,
    detailArtifactRef: null,
    detailSha256: null,
  };
}

export function isCnipaDetailEligible(item: CnipaDetailEnrichmentItemV1, now: string): boolean {
  if (item.holdReason !== null) return false;
  if (item.lifecycle !== "PENDING" && item.lifecycle !== "RETRYABLE") return false;
  const at = iso(now, "now");
  return item.nextAttemptAt === null || item.nextAttemptAt <= at;
}

export function leaseCnipaDetailEnrichmentItem(input: {
  item: CnipaDetailEnrichmentItemV1;
  leaseId: string;
  now: string;
  policy?: Partial<CnipaDetailRetryPolicy>;
}): CnipaDetailEnrichmentItemV1 {
  const policy = resolvedPolicy(input.policy);
  const now = iso(input.now, "now");
  if (!isCnipaDetailEligible(input.item, now)) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      "CNIPA DETAIL item is not eligible for lease",
      false,
    );
  }
  return {
    ...input.item,
    lifecycle: "LEASED",
    lease: {
      leaseId: nonEmpty(input.leaseId, "leaseId"),
      leasedAt: now,
      leaseExpiresAt: new Date(Date.parse(now) + policy.leaseMs).toISOString(),
    },
  };
}

export function reclaimExpiredCnipaDetailLease(
  item: CnipaDetailEnrichmentItemV1,
  now: string,
): CnipaDetailEnrichmentItemV1 {
  if (item.lifecycle !== "LEASED" || !item.lease) return item;
  const at = iso(now, "now");
  if (item.lease.leaseExpiresAt > at) return item;
  return {
    ...item,
    lifecycle: "RETRYABLE",
    lease: null,
    nextAttemptAt: at,
    lastErrorCode: "CNIPA_DETAIL_LEASE_EXPIRED",
  };
}

export function releaseCnipaDetailAuthSecurityHold(
  item: CnipaDetailEnrichmentItemV1,
): CnipaDetailEnrichmentItemV1 {
  if (item.holdReason !== "AUTH_SECURITY") return item;
  return {
    ...item,
    holdReason: null,
    lifecycle: item.lifecycle === "PENDING" ? "PENDING" : "RETRYABLE",
    nextAttemptAt: null,
  };
}

function resolvedPolicy(
  override: Partial<CnipaDetailRetryPolicy> | undefined,
): CnipaDetailRetryPolicy {
  const leaseMs = positiveInteger(
    override?.leaseMs ?? DEFAULT_CNIPA_DETAIL_RETRY_POLICY.leaseMs,
    "leaseMs",
  );
  const retryBaseMs = positiveInteger(
    override?.retryBaseMs ?? DEFAULT_CNIPA_DETAIL_RETRY_POLICY.retryBaseMs,
    "retryBaseMs",
  );
  const retryMaxMs = positiveInteger(
    override?.retryMaxMs ?? DEFAULT_CNIPA_DETAIL_RETRY_POLICY.retryMaxMs,
    "retryMaxMs",
  );
  if (retryMaxMs < retryBaseMs) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      "retryMaxMs must be greater than or equal to retryBaseMs",
      false,
    );
  }
  return { leaseMs, retryBaseMs, retryMaxMs };
}

export function cnipaDetailRetryDelayMs(
  attemptCount: number,
  policy: Partial<CnipaDetailRetryPolicy> = {},
): number {
  const attempts = nonNegativeInteger(attemptCount, 0, "attemptCount");
  const resolved = resolvedPolicy(policy);
  if (attempts === 0) return resolved.retryBaseMs;
  return Math.min(resolved.retryBaseMs * 2 ** (attempts - 1), resolved.retryMaxMs);
}

function assertedLease(item: CnipaDetailEnrichmentItemV1, leaseId: string): CnipaDetailLease {
  if (item.lifecycle !== "LEASED" || !item.lease) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      "CNIPA DETAIL attempt requires an active lease",
      false,
    );
  }
  if (item.lease.leaseId !== nonEmpty(leaseId, "leaseId")) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      "CNIPA DETAIL lease id does not match the active lease",
      false,
    );
  }
  return item.lease;
}

function outcomeMetadata(outcome: CnipaDetailAttemptOutcome) {
  return {
    lastErrorCode: outcome.kind === "FETCHED" ? null : outcome.errorCode,
    lastHttpStatus: outcome.kind === "FETCHED" ? null : (outcome.httpStatus ?? null),
    lastBusinessCode:
      outcome.kind === "FETCHED" || outcome.kind === "AUTH_SECURITY_HOLD"
        ? null
        : (outcome.businessCode ?? null),
  };
}

export function applyCnipaDetailAttemptOutcome(input: {
  item: CnipaDetailEnrichmentItemV1;
  leaseId: string;
  outcome: CnipaDetailAttemptOutcome;
  policy?: Partial<CnipaDetailRetryPolicy>;
}): CnipaDetailAttemptTransition {
  assertedLease(input.item, input.leaseId);
  const observedAt = iso(input.outcome.observedAt, "observedAt");

  if (input.outcome.kind === "AUTH_SECURITY_HOLD") {
    return {
      item: {
        ...input.item,
        lifecycle: "PENDING",
        holdReason: "AUTH_SECURITY",
        lease: null,
        lastAttemptAt: observedAt,
        nextAttemptAt: null,
        ...outcomeMetadata(input.outcome),
      },
      laneAction: "PAUSE_AUTH_SECURITY",
      deduplicated: false,
    };
  }

  const attemptCount = input.item.attemptCount + 1;
  if (input.outcome.kind === "FETCHED") {
    const sha256 = nonEmpty(input.outcome.detailSha256, "detailSha256");
    const artifactRef = nonEmpty(input.outcome.detailArtifactRef, "detailArtifactRef");
    return {
      item: {
        ...input.item,
        lifecycle: "FETCHED",
        holdReason: null,
        lease: null,
        attemptCount,
        lastAttemptAt: observedAt,
        nextAttemptAt: null,
        ...outcomeMetadata(input.outcome),
        lastSuccessAt: observedAt,
        detailArtifactRef: artifactRef,
        detailSha256: sha256,
      },
      laneAction: "CONTINUE",
      deduplicated: input.item.detailSha256 === sha256,
    };
  }

  if (input.outcome.kind === "PERMANENTLY_UNAVAILABLE") {
    return {
      item: {
        ...input.item,
        lifecycle: "PERMANENTLY_UNAVAILABLE",
        holdReason: null,
        lease: null,
        attemptCount,
        lastAttemptAt: observedAt,
        nextAttemptAt: null,
        ...outcomeMetadata(input.outcome),
      },
      laneAction: "CONTINUE",
      deduplicated: false,
    };
  }

  const delay = cnipaDetailRetryDelayMs(attemptCount, input.policy);
  return {
    item: {
      ...input.item,
      lifecycle: "RETRYABLE",
      holdReason: null,
      lease: null,
      attemptCount,
      lastAttemptAt: observedAt,
      nextAttemptAt: new Date(Date.parse(observedAt) + delay).toISOString(),
      ...outcomeMetadata(input.outcome),
    },
    laneAction: "CONTINUE",
    deduplicated: false,
  };
}
