import { describe, expect, it, vi } from "vitest";
import {
  evaluateRepresentativeSupplyPromotionGate,
  runRepresentativeSupplyPromotionWave,
} from "../src/representative-supply-promotion";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function healthFetch(input: {
  state?: "PASS" | "DEGRADED" | "BLOCKED" | "UNOBSERVED";
  freshness?: "FRESH" | "STALE" | "UNOBSERVED";
  registered?: boolean;
}) {
  return vi.fn(async (request: string | URL | Request) => {
    const url = new URL(
      typeof request === "string" ? request : request instanceof URL ? request : request.url,
    );
    const targetId = url.searchParams.get("targetId") ?? "missing-target";
    return jsonResponse({
      items: [
        {
          targetId,
          registrationState: input.registered === false ? "UNREGISTERED" : "REGISTERED",
          sourceIds: input.registered === false ? [] : [`source-${targetId}`],
          compatibility: {
            state: input.state ?? "PASS",
            freshness: input.freshness ?? "FRESH",
            observedAt: "2026-08-18T00:00:00.000Z",
          },
        },
      ],
    });
  }) as typeof fetch;
}

describe("representative supply promotion", () => {
  it("requires registered source plus fresh PASS compatibility", () => {
    expect(
      evaluateRepresentativeSupplyPromotionGate({
        targetId: "target-1",
        jurisdiction: "CN",
        registrationState: "REGISTERED",
        sourceIds: ["source-1"],
        compatibility: { state: "PASS", freshness: "FRESH", observedAt: "2026-08-18T00:00:00Z" },
      }),
    ).toMatchObject({ eligibility: "ELIGIBLE", blockers: [] });

    expect(
      evaluateRepresentativeSupplyPromotionGate({
        targetId: "target-1",
        jurisdiction: "CN",
        registrationState: "REGISTERED",
        sourceIds: ["source-1"],
        compatibility: { state: "PASS", freshness: "STALE", observedAt: "2026-08-15T00:00:00Z" },
      }),
    ).toMatchObject({ eligibility: "BLOCKED", blockers: ["COMPATIBILITY_STALE"] });

    expect(
      evaluateRepresentativeSupplyPromotionGate({
        targetId: "target-1",
        jurisdiction: "CN",
        registrationState: "UNREGISTERED",
        sourceIds: [],
        compatibility: { state: "BLOCKED", freshness: "FRESH", observedAt: "2026-08-18T00:00:00Z" },
      }).blockers,
    ).toEqual(["SOURCE_UNREGISTERED", "SOURCE_ID_MISSING", "COMPATIBILITY_BLOCKED"]);
  });

  it("plans the full representative wave without creating CollectionRuns or receipts", async () => {
    const dispatchTarget = vi.fn();
    const recordReceipt = vi.fn();
    const run = await runRepresentativeSupplyPromotionWave({
      baseUrl: "http://127.0.0.1:3000/",
      workspaceId: "workspace-1",
      apply: false,
      fetchImpl: healthFetch({}),
      dispatchTarget,
      recordReceipt,
    });

    expect(run.mode).toBe("PLAN");
    expect(run.selectedJurisdictions).toEqual([
      "CN",
      "US",
      "IN",
      "JP",
      "KR",
      "GB",
      "CA",
      "AU",
      "BR",
      "AE",
      "EU",
      "CI",
    ]);
    expect(run.summary).toEqual({ eligible: 12, blocked: 0, dispatched: 0, failed: 0 });
    expect(dispatchTarget).not.toHaveBeenCalled();
    expect(recordReceipt).not.toHaveBeenCalled();
  });

  it("requires explicit jurisdiction selection before apply", async () => {
    await expect(
      runRepresentativeSupplyPromotionWave({
        baseUrl: "http://127.0.0.1:3000",
        workspaceId: "workspace-1",
        apply: true,
        fetchImpl: healthFetch({}),
        dispatchTarget: vi.fn(),
        recordReceipt: vi.fn(),
      }),
    ).rejects.toThrow("--apply requires at least one explicit representative jurisdiction");
  });

  it("dispatches one selected target and persists its durable receipt", async () => {
    const dispatchTarget = vi.fn(
      async ({ targetId, jurisdiction }: { targetId: string; jurisdiction: string }) => ({
        targetId,
        sourceId: `source-${targetId}`,
        planId: `plan-${targetId}`,
        runId: `run-${jurisdiction}`,
      }),
    );
    const recordReceipt = vi.fn(async () => "receipt-cn");
    const run = await runRepresentativeSupplyPromotionWave({
      baseUrl: "https://knowledge.example.com/",
      workspaceId: "workspace-1",
      apply: true,
      jurisdictions: ["CN"],
      fetchImpl: healthFetch({}),
      dispatchTarget,
      recordReceipt,
    });

    expect(run.selectedJurisdictions).toEqual(["CN"]);
    expect(run.summary).toEqual({ eligible: 0, blocked: 0, dispatched: 1, failed: 0 });
    expect(run.entries[0]).toMatchObject({
      jurisdiction: "CN",
      state: "DISPATCHED",
      receiptId: "receipt-cn",
    });
    expect(dispatchTarget).toHaveBeenCalledTimes(1);
    expect(recordReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ jurisdiction: "CN", collectionRunId: "run-CN" }),
    );
  });

  it("does not call a blocked target's dispatch or receipt path", async () => {
    const dispatchTarget = vi.fn();
    const recordReceipt = vi.fn();
    const run = await runRepresentativeSupplyPromotionWave({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: "workspace-1",
      apply: true,
      jurisdictions: ["JP"],
      fetchImpl: healthFetch({ freshness: "STALE" }),
      dispatchTarget,
      recordReceipt,
    });

    expect(run.summary).toEqual({ eligible: 0, blocked: 1, dispatched: 0, failed: 0 });
    expect(run.entries[0]?.gate.blockers).toContain("COMPATIBILITY_STALE");
    expect(dispatchTarget).not.toHaveBeenCalled();
    expect(recordReceipt).not.toHaveBeenCalled();
  });

  it("surfaces receipt persistence failure while preserving the dispatched run for retry", async () => {
    const dispatchTarget = vi.fn(async () => ({
      targetId: "cn-target",
      sourceId: "source-cn",
      planId: "plan-cn",
      runId: "run-cn",
    }));
    const run = await runRepresentativeSupplyPromotionWave({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: "workspace-1",
      apply: true,
      jurisdictions: ["CN"],
      fetchImpl: healthFetch({}),
      dispatchTarget,
      recordReceipt: vi.fn(async () => {
        throw new Error("receipt unavailable");
      }),
    });

    expect(run.summary.failed).toBe(1);
    expect(run.entries[0]).toMatchObject({
      state: "FAILED",
      run: { runId: "run-cn" },
      receiptId: null,
      error: "receipt unavailable",
    });
  });
});
