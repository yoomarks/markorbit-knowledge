import { describe, expect, it, vi } from "vitest";
import type { ConversionAttempt, ConversionLease } from "@markorbit/contracts";
import { reconcileExpiredConversionLeasesWithDependencies } from "../production-conversion-worker-service";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function lease(id: string, attemptId: string, expiresAt: string): ConversionLease {
  return {
    id,
    workspaceId,
    workerId: "wrk_test",
    conversionAttemptId: attemptId,
    generation: 1,
    expiresAt,
  } as unknown as ConversionLease;
}

function attempt(id: string, status: "CLAIMED" | "STARTED", startedAt?: string): ConversionAttempt {
  return {
    id,
    status,
    ...(startedAt ? { startedAt } : {}),
  } as unknown as ConversionAttempt;
}

describe("expired conversion lease reconciliation", () => {
  it("releases pre-start work and fails started work after lease expiry", () => {
    const expiredClaimed = lease("cvl_claimed", "cva_claimed", "2026-09-11T11:00:00.000Z");
    const expiredStarted = lease("cvl_started", "cva_started", "2026-09-11T11:01:00.000Z");
    const future = lease("cvl_future", "cva_future", "2026-09-11T13:00:00.000Z");
    const expireBeforeStart = vi.fn();
    const reconcileExpiredStartedLease = vi.fn();
    const result = reconcileExpiredConversionLeasesWithDependencies(
      {
        runtime: {
          listLeases: vi.fn(() => ({
            items: [expiredClaimed, expiredStarted, future],
            total: 3,
            limit: 25,
            offset: 0,
          })),
          getAttempt: vi.fn((id: string) => {
            if (id === "cva_claimed") return attempt(id, "CLAIMED");
            if (id === "cva_started") return attempt(id, "STARTED", "2026-09-11T10:59:00.000Z");
            return attempt(id, "CLAIMED");
          }),
          expireBeforeStart,
        },
        transitions: { reconcileExpiredStartedLease },
      },
      workspaceId,
      25,
      new Date("2026-09-11T12:00:00.000Z"),
    );

    expect(result).toEqual({
      status: "COMPLETED",
      workspaceId,
      inspected: 2,
      expiredBeforeStart: 1,
      failedStarted: 1,
      failed: 0,
    });
    expect(expireBeforeStart).toHaveBeenCalledTimes(1);
    expect(expireBeforeStart).toHaveBeenCalledWith(
      "cvl_claimed",
      expect.objectContaining({
        workspaceId,
        workerId: "wrk_test",
        reconciliationCode: "CONVERSION_LEASE_EXPIRED_BEFORE_START",
      }),
    );
    expect(reconcileExpiredStartedLease).toHaveBeenCalledTimes(1);
    expect(reconcileExpiredStartedLease).toHaveBeenCalledWith(
      "cvl_started",
      expect.objectContaining({
        workspaceId,
        reconcilerId: "conversion-worker-claim-reconciler",
      }),
    );
  });

  it("continues reconciling other expired leases when one item fails", () => {
    const first = lease("cvl_one", "cva_one", "2026-09-11T11:00:00.000Z");
    const second = lease("cvl_two", "cva_two", "2026-09-11T11:01:00.000Z");
    const expireBeforeStart = vi.fn((id: string) => {
      if (id === "cvl_one") throw new Error("boom");
      return second;
    });
    const result = reconcileExpiredConversionLeasesWithDependencies(
      {
        runtime: {
          listLeases: vi.fn(() => ({ items: [first, second], total: 2, limit: 25, offset: 0 })),
          getAttempt: vi.fn((id: string) => attempt(id, "CLAIMED")),
          expireBeforeStart,
        },
        transitions: { reconcileExpiredStartedLease: vi.fn() },
      },
      workspaceId,
      25,
      new Date("2026-09-11T12:00:00.000Z"),
    );

    expect(result.failed).toBe(1);
    expect(result.expiredBeforeStart).toBe(1);
    expect(result.inspected).toBe(2);
    expect(expireBeforeStart).toHaveBeenCalledTimes(2);
  });

  it("does not block claims when the lease scan itself fails", () => {
    const result = reconcileExpiredConversionLeasesWithDependencies(
      {
        runtime: {
          listLeases: vi.fn(() => {
            throw new Error("sqlite busy");
          }),
          getAttempt: vi.fn(),
          expireBeforeStart: vi.fn(),
        },
        transitions: { reconcileExpiredStartedLease: vi.fn() },
      },
      workspaceId,
      25,
      new Date("2026-09-11T12:00:00.000Z"),
    );
    expect(result).toMatchObject({
      inspected: 0,
      expiredBeforeStart: 0,
      failedStarted: 0,
      failed: 1,
    });
  });
});
