import { describe, expect, it } from "vitest";
import {
  applyCnipaDetailAttemptOutcome,
  cnipaDetailCanonicalUri,
  cnipaDetailRetryDelayMs,
  createCnipaDetailEnrichmentItem,
  isCnipaDetailEligible,
  leaseCnipaDetailEnrichmentItem,
  reclaimExpiredCnipaDetailLease,
  releaseCnipaDetailAuthSecurityHold,
} from "./cnipa-detail-enrichment-state";

function baseItem() {
  return createCnipaDetailEnrichmentItem({
    documentKind: "OPPOSITION_DECISION",
    sourceRecordId: "2089022171466878976",
    discoveredAt: "2026-09-18T08:00:00Z",
  });
}

describe("CNIPA DETAIL enrichment state", () => {
  it("derives deterministic DETAIL identity", () => {
    const item = baseItem();
    expect(item.detailCanonicalUri).toBe(
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmyyJudgment/queryInfo?id=2089022171466878976",
    );
    expect(item.lifecycle).toBe("PENDING");
    expect(item.attemptCount).toBe(0);
    expect(cnipaDetailCanonicalUri("REVIEW_ADJUDICATION", "2072268351827644416")).toContain(
      "tmpsJudgment/queryInfo?id=2072268351827644416",
    );
  });

  it("leases only eligible work and rejects stale lease ids", () => {
    const leased = leaseCnipaDetailEnrichmentItem({
      item: baseItem(),
      leaseId: "lease-1",
      now: "2026-09-18T08:01:00Z",
      policy: { leaseMs: 60_000 },
    });
    expect(leased.lifecycle).toBe("LEASED");
    expect(leased.lease?.leaseExpiresAt).toBe("2026-09-18T08:02:00.000Z");
    expect(() =>
      applyCnipaDetailAttemptOutcome({
        item: leased,
        leaseId: "stale",
        outcome: {
          kind: "RETRYABLE",
          observedAt: "2026-09-18T08:01:30Z",
          errorCode: "TEMP",
        },
      }),
    ).toThrow(/lease id/i);
  });

  it("reclaims expired leases without burning an attempt", () => {
    const leased = leaseCnipaDetailEnrichmentItem({
      item: baseItem(),
      leaseId: "lease-1",
      now: "2026-09-18T08:01:00Z",
      policy: { leaseMs: 60_000 },
    });
    const reclaimed = reclaimExpiredCnipaDetailLease(leased, "2026-09-18T08:03:00Z");
    expect(reclaimed.lifecycle).toBe("RETRYABLE");
    expect(reclaimed.attemptCount).toBe(0);
    expect(reclaimed.nextAttemptAt).toBe("2026-09-18T08:03:00.000Z");
  });

  it("uses capped exponential retry scheduling", () => {
    expect(
      cnipaDetailRetryDelayMs(1, {
        retryBaseMs: 1_000,
        retryMaxMs: 4_000,
      }),
    ).toBe(1_000);
    expect(
      cnipaDetailRetryDelayMs(2, {
        retryBaseMs: 1_000,
        retryMaxMs: 4_000,
      }),
    ).toBe(2_000);
    expect(
      cnipaDetailRetryDelayMs(10, {
        retryBaseMs: 1_000,
        retryMaxMs: 4_000,
      }),
    ).toBe(4_000);
  });

  it("pauses on auth/security without burning retry budget", () => {
    const leased = leaseCnipaDetailEnrichmentItem({
      item: baseItem(),
      leaseId: "lease-auth",
      now: "2026-09-18T08:01:00Z",
    });
    const transition = applyCnipaDetailAttemptOutcome({
      item: leased,
      leaseId: "lease-auth",
      outcome: {
        kind: "AUTH_SECURITY_HOLD",
        observedAt: "2026-09-18T08:01:10Z",
        errorCode: "CNIPA_REAUTH_REQUIRED",
        httpStatus: 401,
      },
    });
    expect(transition.laneAction).toBe("PAUSE_AUTH_SECURITY");
    expect(transition.item.lifecycle).toBe("PENDING");
    expect(transition.item.holdReason).toBe("AUTH_SECURITY");
    expect(transition.item.attemptCount).toBe(0);
    expect(isCnipaDetailEligible(transition.item, "2026-09-19T08:00:00Z")).toBe(false);

    const released = releaseCnipaDetailAuthSecurityHold(transition.item);
    expect(released.holdReason).toBeNull();
    expect(isCnipaDetailEligible(released, "2026-09-18T08:02:00Z")).toBe(true);
  });

  it("records retryable attempts and only becomes eligible after backoff", () => {
    const leased = leaseCnipaDetailEnrichmentItem({
      item: baseItem(),
      leaseId: "lease-temp",
      now: "2026-09-18T08:01:00Z",
    });
    const transition = applyCnipaDetailAttemptOutcome({
      item: leased,
      leaseId: "lease-temp",
      policy: { retryBaseMs: 60_000, retryMaxMs: 60_000 },
      outcome: {
        kind: "RETRYABLE",
        observedAt: "2026-09-18T08:01:30Z",
        errorCode: "CNIPA_SOURCE_TEMPORARY_FAILURE",
        businessCode: -107,
      },
    });
    expect(transition.item.lifecycle).toBe("RETRYABLE");
    expect(transition.item.attemptCount).toBe(1);
    expect(transition.item.nextAttemptAt).toBe("2026-09-18T08:02:30.000Z");
    expect(isCnipaDetailEligible(transition.item, "2026-09-18T08:02:00Z")).toBe(false);
    expect(isCnipaDetailEligible(transition.item, "2026-09-18T08:02:30Z")).toBe(true);
  });

  it("records fetched artifact identity and detects same-body dedupe", () => {
    const seeded = {
      ...baseItem(),
      detailSha256: "a".repeat(64),
    };
    const leased = leaseCnipaDetailEnrichmentItem({
      item: seeded,
      leaseId: "lease-ok",
      now: "2026-09-18T08:01:00Z",
    });
    const transition = applyCnipaDetailAttemptOutcome({
      item: leased,
      leaseId: "lease-ok",
      outcome: {
        kind: "FETCHED",
        observedAt: "2026-09-18T08:01:20Z",
        detailArtifactRef: "artifact:detail-1",
        detailSha256: "a".repeat(64),
      },
    });
    expect(transition.item.lifecycle).toBe("FETCHED");
    expect(transition.item.lastSuccessAt).toBe("2026-09-18T08:01:20.000Z");
    expect(transition.item.detailArtifactRef).toBe("artifact:detail-1");
    expect(transition.deduplicated).toBe(true);
  });

  it("requires an explicit permanent-unavailable outcome", () => {
    const leased = leaseCnipaDetailEnrichmentItem({
      item: baseItem(),
      leaseId: "lease-gone",
      now: "2026-09-18T08:01:00Z",
    });
    const transition = applyCnipaDetailAttemptOutcome({
      item: leased,
      leaseId: "lease-gone",
      outcome: {
        kind: "PERMANENTLY_UNAVAILABLE",
        observedAt: "2026-09-18T08:01:20Z",
        errorCode: "CNIPA_SOURCE_REJECTED",
        httpStatus: 404,
      },
    });
    expect(transition.item.lifecycle).toBe("PERMANENTLY_UNAVAILABLE");
    expect(transition.item.attemptCount).toBe(1);
    expect(transition.item.nextAttemptAt).toBeNull();
  });
});
