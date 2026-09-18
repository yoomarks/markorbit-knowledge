import { describe, expect, it, vi } from "vitest";
import type { CollectionPlanRegistryRecord } from "@markorbit/persistence/collection-plans";
import type { ExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import { dispatchCnipaBackfill } from "./cnipa-backfill";

function plan(connectorId = "cnipa-authenticated-worker"): CollectionPlanRegistryRecord {
  return {
    plan: {
      id: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      extensions: {
        "x-markorbit.cnipa-query-template": {
          mode: "SCHEDULE_SLOT_DATE_RANGE",
          documentKinds: ["REGISTRATION_EXAMINATION"],
          fromDayOffset: -1,
          toDayOffset: -1,
          timezone: "Asia/Shanghai",
        },
      },
    },
    source: {
      connector: { connectorId, version: "0.5.0" },
    },
  } as CollectionPlanRegistryRecord;
}

describe("CNIPA backfill dispatch service", () => {
  it("dispatches one deterministic manual Run per date", () => {
    let index = 0;
    const dispatchManual = vi.fn((input) => ({
      record: {
        run: { id: `run-${++index}` },
        jobs: [],
      },
      replayed: false,
    }));
    const summary = dispatchCnipaBackfill(
      {
        plan: plan(),
        fromDate: "2026-07-01",
        toDate: "2026-07-03",
        requestedBy: { actorType: "LOCAL_ADMIN", actorId: "user-1" },
      },
      { dispatchManual } as unknown as Pick<ExecutionLedgerRepository, "dispatchManual">,
    );

    expect(summary).toMatchObject({
      documentKind: "REGISTRATION_EXAMINATION",
      requested: 3,
      created: 3,
      replayed: 0,
    });
    expect(dispatchManual).toHaveBeenCalledTimes(3);
    expect(dispatchManual.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey:
        "cnipa-backfill:pln_01ARZ3NDEKTSV4RRFFQ69G5FAV:REGISTRATION_EXAMINATION:2026-07-01",
      extensions: {
        "x-markorbit.cnipa-query": {
          mode: "DATE_RANGE",
          fromDate: "2026-07-01",
          toDate: "2026-07-01",
          documentKinds: ["REGISTRATION_EXAMINATION"],
        },
      },
    });
  });

  it("reports idempotent replays without creating a different query", () => {
    const dispatchManual = vi.fn((input) => ({
      record: { run: { id: "run-existing" }, jobs: [] },
      replayed: true,
    }));
    const summary = dispatchCnipaBackfill(
      {
        plan: plan(),
        fromDate: "2026-07-01",
        toDate: "2026-07-01",
        requestedBy: { actorType: "LOCAL_ADMIN", actorId: "user-1" },
      },
      { dispatchManual } as unknown as Pick<ExecutionLedgerRepository, "dispatchManual">,
    );
    expect(summary).toMatchObject({ requested: 1, created: 0, replayed: 1 });
  });

  it("rejects non-CNIPA plans before dispatch", () => {
    const dispatchManual = vi.fn();
    expect(() =>
      dispatchCnipaBackfill(
        {
          plan: plan("crawl4ai-web"),
          fromDate: "2026-07-01",
          toDate: "2026-07-01",
          requestedBy: { actorType: "LOCAL_ADMIN", actorId: "user-1" },
        },
        { dispatchManual } as unknown as Pick<ExecutionLedgerRepository, "dispatchManual">,
      ),
    ).toThrowError(/must use cnipa-authenticated-worker/i);
    expect(dispatchManual).not.toHaveBeenCalled();
  });
});
