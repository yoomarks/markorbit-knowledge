import { describe, expect, it, vi } from "vitest";
import type { CnipaDetailQueueRecord } from "@markorbit/persistence/cnipa-detail-enrichment-queue";
import type { CnipaAuthenticatedSessionExecutorFactory } from "@markorbit/worker-runtime/cnipa-artifact-acquirer";
import type { GovernedCnipaDetailQueuePort } from "./cnipa-detail-governed-queue";
import type { ProcessNextCnipaDetailResult } from "./cnipa-detail-worker";
import { runGovernedCnipaDetail } from "./cnipa-detail-governed-run";

function record(sourceRecordId: string): CnipaDetailQueueRecord {
  return {
    protocolVersion: "1.0",
    objectType: "CNIPA_DETAIL_ENRICHMENT_QUEUE_ITEM",
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    documentKind: "OPPOSITION_DECISION",
    sourceRecordId,
    detailCanonicalUri:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmyyJudgment/queryInfo?id=" +
      sourceRecordId,
    firstListArtifactRef: "artifact:list:first",
    lastListArtifactRef: "artifact:list:last",
    discoveredAt: "2026-09-18T09:00:00.000Z",
    lastObservedAt: "2026-09-18T09:00:00.000Z",
    observationCount: 1,
    lifecycle: "FETCHED",
    holdReason: null,
    leaseId: null,
    leasedAt: null,
    leaseExpiresAt: null,
    attemptCount: 1,
    lastAttemptAt: "2026-09-18T10:00:00.000Z",
    nextAttemptAt: null,
    lastErrorCode: null,
    lastHttpStatus: null,
    lastBusinessCode: null,
    lastSuccessAt: "2026-09-18T10:00:00.000Z",
    detailArtifactRef: "artifact:detail",
    detailSha256: "a".repeat(64),
    createdAt: "2026-09-18T09:00:00.000Z",
    updatedAt: "2026-09-18T10:00:00.000Z",
  };
}

function outcome(
  sourceRecordId: string,
  value: ProcessNextCnipaDetailResult["outcome"] = "FETCHED",
  pauseLane = false,
): ProcessNextCnipaDetailResult {
  return {
    record: record(sourceRecordId),
    pauseLane,
    outcome: value,
  };
}

function queue(
  decision: ReturnType<GovernedCnipaDetailQueuePort["lastClaimDecision"]> = {
    status: "EMPTY",
    record: null,
    budgetWindowKey: "window-1",
    requestCount: 0,
    nextEligibleAt: null,
  },
): GovernedCnipaDetailQueuePort {
  return {
    claimNext: vi.fn(),
    persistAttemptTransition: vi.fn(),
    lastClaimDecision: () => decision,
  };
}

const sessionFactory = {} as CnipaAuthenticatedSessionExecutorFactory;
const rawArtifactSink = vi.fn();

describe("governed CNIPA DETAIL run loop", () => {
  it("hard-stops at maxRequestsPerRun and never starts an extra iteration", async () => {
    const processOne = vi.fn(async ({ queueLeaseId }: { queueLeaseId: string }) =>
      outcome(queueLeaseId),
    );
    const result = await runGovernedCnipaDetail({
      queue: queue(),
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      sessionFactory,
      rawArtifactSink,
      maxRequestsPerRun: 2,
      queueLeaseIdFactory: (ordinal) => `lease-${ordinal}`,
      processOne: processOne as never,
    });

    expect(result).toEqual({
      processedCount: 2,
      outcomes: ["FETCHED", "FETCHED"],
      stopReason: "RUN_CAP_REACHED",
    });
    expect(processOne).toHaveBeenCalledTimes(2);
  });

  it("stops immediately when governed pacing blocks the next request", async () => {
    const governedQueue = queue({
      status: "PACING_BLOCKED",
      record: null,
      budgetWindowKey: "window-1",
      requestCount: 1,
      nextEligibleAt: "2026-09-18T10:02:00.000Z",
    });
    const processOne = vi
      .fn()
      .mockResolvedValueOnce(outcome("record-1"))
      .mockResolvedValueOnce(null);

    const result = await runGovernedCnipaDetail({
      queue: governedQueue,
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      sessionFactory,
      rawArtifactSink,
      maxRequestsPerRun: 10,
      queueLeaseIdFactory: (ordinal) => `lease-${ordinal}`,
      processOne,
    });

    expect(result).toEqual({
      processedCount: 1,
      outcomes: ["FETCHED"],
      stopReason: "PACING_BLOCKED",
    });
    expect(processOne).toHaveBeenCalledTimes(2);
  });

  it("distinguishes durable budget exhaustion from an empty queue", async () => {
    const budgetQueue = queue({
      status: "BUDGET_EXHAUSTED",
      record: null,
      budgetWindowKey: "window-1",
      requestCount: 5,
      nextEligibleAt: null,
    });
    const emptyQueue = queue();
    const processOne = vi.fn(async () => null);

    const budget = await runGovernedCnipaDetail({
      queue: budgetQueue,
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      sessionFactory,
      rawArtifactSink,
      maxRequestsPerRun: 10,
      queueLeaseIdFactory: () => "lease-budget",
      processOne,
    });
    const empty = await runGovernedCnipaDetail({
      queue: emptyQueue,
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      sessionFactory,
      rawArtifactSink,
      maxRequestsPerRun: 10,
      queueLeaseIdFactory: () => "lease-empty",
      processOne,
    });

    expect(budget.stopReason).toBe("BUDGET_EXHAUSTED");
    expect(empty.stopReason).toBe("EMPTY");
  });

  it("stops the entire run immediately on auth/security pause", async () => {
    const processOne = vi.fn(async () => outcome("record-auth", "AUTH_SECURITY_HOLD", true));

    const result = await runGovernedCnipaDetail({
      queue: queue(),
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      sessionFactory,
      rawArtifactSink,
      maxRequestsPerRun: 10,
      queueLeaseIdFactory: () => "lease-auth",
      processOne,
    });

    expect(result).toEqual({
      processedCount: 1,
      outcomes: ["AUTH_SECURITY_HOLD"],
      stopReason: "AUTH_SECURITY_HOLD",
    });
    expect(processOne).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid per-run cap before any work starts", async () => {
    const processOne = vi.fn();
    await expect(
      runGovernedCnipaDetail({
        queue: queue(),
        workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        sessionFactory,
        rawArtifactSink,
        maxRequestsPerRun: 0,
        queueLeaseIdFactory: () => "lease",
        processOne,
      }),
    ).rejects.toThrow(/maxRequestsPerRun/i);
    expect(processOne).not.toHaveBeenCalled();
  });
});
