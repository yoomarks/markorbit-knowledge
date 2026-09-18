import { describe, expect, it } from "vitest";
import {
  applyCnipaCoverageObservation,
  createCnipaHistoricalBackfillState,
  planNextCnipaBackfillWindow,
  type CnipaCoverageManifestForBackfill,
} from "./cnipa-historical-backfill";

function manifest(
  overrides: Partial<CnipaCoverageManifestForBackfill> = {},
): CnipaCoverageManifestForBackfill {
  return {
    schemaVersion: "cnipa-collection-coverage-v1",
    documentKind: "REGISTRATION_EXAMINATION",
    query: {
      mode: "DATE_RANGE",
      fromDate: "2016-01-01",
      toDate: "2016-01-30",
      documentKinds: ["REGISTRATION_EXAMINATION"],
    },
    rawListPageCount: 1,
    uniqueSourceRecordCount: 10,
    stopReason: "NATURAL_SHORT_OR_EMPTY_PAGE",
    safetyCeilingReached: false,
    duplicateFullPageDetected: false,
    completeByObservedPaging: true,
    ...overrides,
  };
}

function state() {
  return createCnipaHistoricalBackfillState({
    sourceId: "src_registration",
    planId: "pln_registration",
    documentKind: "REGISTRATION_EXAMINATION",
    throughDate: "2016-03-31",
  });
}

describe("CNIPA durable historical backfill state machine", () => {
  it("plans deterministic 30-day windows from the 2016 floor", () => {
    expect(planNextCnipaBackfillWindow(state())).toEqual({
      fromDate: "2016-01-01",
      toDate: "2016-01-30",
      windowDays: 30,
      idempotencyKey: "cnipa-backfill-v1-registration_examination-2016-01-01-2016-01-30-30",
    });
  });

  it("accepts natural coverage and advances the durable cursor", () => {
    const initial = state();
    initial.pendingWindow = planNextCnipaBackfillWindow(initial);
    const next = applyCnipaCoverageObservation({
      state: initial,
      runId: "run_accepted",
      artifactId: "art_coverage",
      artifactSha256: "a".repeat(64),
      manifest: manifest(),
    });

    expect(next.cursorDate).toBe("2016-01-31");
    expect(next.lastAcceptedWindow).toMatchObject({
      fromDate: "2016-01-01",
      toDate: "2016-01-30",
      runId: "run_accepted",
    });
    expect(next.pendingWindow).toBeNull();
    expect(next.lastObservation).toEqual({
      runId: "run_accepted",
      pageCount: 1,
      uniqueRecordCount: 10,
      stopReason: "NATURAL_SHORT_OR_EMPTY_PAGE",
      safetyCeilingReached: false,
      completeByObservedPaging: true,
    });
    expect(next.completionState).toBe("ACTIVE");
  });

  it("replays a safety-ceiling window at seven days without advancing", () => {
    const initial = state();
    initial.pendingWindow = planNextCnipaBackfillWindow(initial);
    const next = applyCnipaCoverageObservation({
      state: initial,
      runId: "run_ceiling",
      artifactId: "art_coverage",
      artifactSha256: "b".repeat(64),
      manifest: manifest({
        rawListPageCount: 50,
        uniqueSourceRecordCount: 5000,
        stopReason: "SAFETY_CEILING",
        safetyCeilingReached: true,
        completeByObservedPaging: false,
      }),
    });

    expect(next.cursorDate).toBe("2016-01-01");
    expect(next.currentWindowDays).toBe(7);
    expect(next.replayRequired).toBe(true);
    expect(next.pendingWindow).toBeNull();
    expect(planNextCnipaBackfillWindow(next)).toMatchObject({
      fromDate: "2016-01-01",
      toDate: "2016-01-07",
      windowDays: 7,
    });
  });

  it("blocks repeated full-page anomalies instead of claiming completion", () => {
    const initial = state();
    initial.pendingWindow = planNextCnipaBackfillWindow(initial);
    const next = applyCnipaCoverageObservation({
      state: initial,
      runId: "run_duplicate",
      artifactId: "art_coverage",
      artifactSha256: "c".repeat(64),
      manifest: manifest({
        rawListPageCount: 2,
        uniqueSourceRecordCount: 100,
        stopReason: "FULL_PAGE_ZERO_NEW_IDS",
        duplicateFullPageDetected: true,
        completeByObservedPaging: false,
      }),
    });

    expect(next.completionState).toBe("BLOCKED");
    expect(next.blockReason).toBe("DUPLICATE_FULL_PAGE_ANOMALY");
    expect(next.cursorDate).toBe("2016-01-01");
  });

  it("blocks a one-day safety ceiling", () => {
    const initial = state();
    initial.currentWindowDays = 1;
    initial.pendingWindow = planNextCnipaBackfillWindow(initial);
    const next = applyCnipaCoverageObservation({
      state: initial,
      runId: "run_daily_ceiling",
      artifactId: "art_coverage",
      artifactSha256: "d".repeat(64),
      manifest: manifest({
        query: {
          mode: "DATE_RANGE",
          fromDate: "2016-01-01",
          toDate: "2016-01-01",
          documentKinds: ["REGISTRATION_EXAMINATION"],
        },
        rawListPageCount: 50,
        uniqueSourceRecordCount: 5000,
        stopReason: "SAFETY_CEILING",
        safetyCeilingReached: true,
        completeByObservedPaging: false,
      }),
    });

    expect(next.completionState).toBe("BLOCKED");
    expect(next.blockReason).toBe("BLOCKED_AT_DAILY_CEILING");
  });

  it("rejects a coverage artifact for the wrong window", () => {
    const initial = state();
    initial.pendingWindow = planNextCnipaBackfillWindow(initial);
    expect(() =>
      applyCnipaCoverageObservation({
        state: initial,
        runId: "run_wrong",
        artifactId: "art_wrong",
        artifactSha256: "e".repeat(64),
        manifest: manifest({
          query: {
            mode: "DATE_RANGE",
            fromDate: "2016-02-01",
            toDate: "2016-02-28",
            documentKinds: ["REGISTRATION_EXAMINATION"],
          },
        }),
      }),
    ).toThrow(/does not match/i);
  });

  it("marks the source complete after accepting the final clipped window", () => {
    const initial = createCnipaHistoricalBackfillState({
      sourceId: "src_registration",
      planId: "pln_registration",
      documentKind: "REGISTRATION_EXAMINATION",
      throughDate: "2016-01-05",
    });
    initial.pendingWindow = planNextCnipaBackfillWindow(initial);
    const next = applyCnipaCoverageObservation({
      state: initial,
      runId: "run_final",
      artifactId: "art_final",
      artifactSha256: "f".repeat(64),
      manifest: manifest({
        query: {
          mode: "DATE_RANGE",
          fromDate: "2016-01-01",
          toDate: "2016-01-05",
          documentKinds: ["REGISTRATION_EXAMINATION"],
        },
      }),
    });
    expect(next.completionState).toBe("COMPLETE");
    expect(next.cursorDate).toBe("2016-01-06");
  });
});
