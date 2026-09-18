import { describe, expect, it } from "vitest";
import {
  CNIPA_BACKFILL_MAX_DAYS,
  planCnipaBackfill,
} from "./cnipa-backfill-plan";

describe("CNIPA bounded backfill planner", () => {
  it("creates one immutable single-day dispatch per date", () => {
    const planned = planCnipaBackfill({
      planId: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      documentKind: "REGISTRATION_EXAMINATION",
      fromDate: "2026-07-01",
      toDate: "2026-07-03",
    });

    expect(planned.map((item) => item.date)).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
    expect(planned[0]).toEqual({
      date: "2026-07-01",
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

  it("is deterministic for safe replay", () => {
    const input = {
      planId: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      documentKind: "OPPOSITION_DECISION" as const,
      fromDate: "2026-07-01",
      toDate: "2026-07-02",
    };
    expect(planCnipaBackfill(input)).toEqual(planCnipaBackfill(input));
  });

  it("accepts the maximum bounded batch", () => {
    expect(
      planCnipaBackfill({
        planId: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        documentKind: "REVIEW_ADJUDICATION",
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
      }),
    ).toHaveLength(CNIPA_BACKFILL_MAX_DAYS);
  });

  it("rejects an unbounded historical batch", () => {
    expect(() =>
      planCnipaBackfill({
        planId: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        documentKind: "REVIEW_ADJUDICATION",
        fromDate: "2026-01-01",
        toDate: "2026-02-01",
      }),
    ).toThrowError(/limited to 31 days/i);
  });

  it("rejects reversed and invalid dates", () => {
    expect(() =>
      planCnipaBackfill({
        planId: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        documentKind: "REVIEW_ADJUDICATION",
        fromDate: "2026-07-03",
        toDate: "2026-07-01",
      }),
    ).toThrowError(/fromDate must be earlier/i);

    expect(() =>
      planCnipaBackfill({
        planId: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        documentKind: "REVIEW_ADJUDICATION",
        fromDate: "2026-02-31",
        toDate: "2026-02-31",
      }),
    ).toThrowError(/YYYY-MM-DD/i);
  });
});
