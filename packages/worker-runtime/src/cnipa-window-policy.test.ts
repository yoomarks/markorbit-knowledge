import { describe, expect, it } from "vitest";
import {
  CNIPA_DEFAULT_HISTORICAL_FLOOR,
  decideCnipaHistoricalWindow,
  planCnipaHistoricalWindow,
  resolveCnipaWeekdayIncrementalWindow,
} from "./cnipa-window-policy";

describe("CNIPA FAST window policy", () => {
  it("keeps the historical floor explicit and configurable by caller", () => {
    expect(CNIPA_DEFAULT_HISTORICAL_FLOOR).toBe("2016-01-01");
    expect(
      planCnipaHistoricalWindow({
        cursorDate: CNIPA_DEFAULT_HISTORICAL_FLOOR,
        throughDate: "2016-03-31",
        windowDays: 30,
      }),
    ).toEqual({
      fromDate: "2016-01-01",
      toDate: "2016-01-30",
      windowDays: 30,
    });
  });

  it("clips a historical window at the requested upper boundary", () => {
    expect(
      planCnipaHistoricalWindow({
        cursorDate: "2016-01-25",
        throughDate: "2016-01-31",
        windowDays: 30,
      }),
    ).toEqual({
      fromDate: "2016-01-25",
      toDate: "2016-01-31",
      windowDays: 30,
    });
  });

  it("keeps sparse and empty historical windows at 30 days", () => {
    expect(
      decideCnipaHistoricalWindow({
        observation: {
          fromDate: "2016-01-01",
          toDate: "2016-01-30",
          requestedWindowDays: 30,
          pageCount: 1,
          uniqueRecordCount: 0,
          reachedSafetyCeiling: false,
        },
      }),
    ).toEqual({ action: "ADVANCE", nextWindowDays: 30 });
  });

  it("downgrades a dense 30-day history window to seven days", () => {
    expect(
      decideCnipaHistoricalWindow({
        observation: {
          fromDate: "2020-01-01",
          toDate: "2020-01-30",
          requestedWindowDays: 30,
          pageCount: 30,
          uniqueRecordCount: 2950,
          reachedSafetyCeiling: false,
        },
      }),
    ).toEqual({ action: "ADVANCE", nextWindowDays: 7 });
  });

  it("downgrades a dense seven-day window to one day", () => {
    expect(
      decideCnipaHistoricalWindow({
        observation: {
          fromDate: "2024-01-01",
          toDate: "2024-01-07",
          requestedWindowDays: 7,
          pageCount: 25,
          uniqueRecordCount: 2450,
          reachedSafetyCeiling: false,
        },
      }),
    ).toEqual({ action: "ADVANCE", nextWindowDays: 1 });
  });

  it("replays the current window smaller when a safety ceiling is reached", () => {
    expect(
      decideCnipaHistoricalWindow({
        observation: {
          fromDate: "2022-01-01",
          toDate: "2022-01-30",
          requestedWindowDays: 30,
          pageCount: 50,
          uniqueRecordCount: 5000,
          reachedSafetyCeiling: true,
        },
      }),
    ).toEqual({ action: "REPLAY_SMALLER", nextWindowDays: 7 });

    expect(
      decideCnipaHistoricalWindow({
        observation: {
          fromDate: "2025-01-01",
          toDate: "2025-01-07",
          requestedWindowDays: 7,
          pageCount: 50,
          uniqueRecordCount: 5000,
          reachedSafetyCeiling: true,
        },
      }),
    ).toEqual({ action: "REPLAY_SMALLER", nextWindowDays: 1 });
  });

  it("fails closed if even a single-day window reaches the hard ceiling", () => {
    expect(
      decideCnipaHistoricalWindow({
        observation: {
          fromDate: "2026-07-01",
          toDate: "2026-07-01",
          requestedWindowDays: 1,
          pageCount: 50,
          uniqueRecordCount: 5000,
          reachedSafetyCeiling: true,
        },
      }),
    ).toEqual({ action: "BLOCKED_AT_DAILY_CEILING", nextWindowDays: 1 });
  });

  it("bundles Friday through Sunday on Monday in Asia/Shanghai", () => {
    expect(
      resolveCnipaWeekdayIncrementalWindow(
        new Date("2026-09-20T16:30:00.000Z"),
        "Asia/Shanghai",
      ),
    ).toEqual({
      fromDate: "2026-09-18",
      toDate: "2026-09-20",
    });
  });

  it("queries only the prior completed day Tuesday through Friday", () => {
    expect(
      resolveCnipaWeekdayIncrementalWindow(
        new Date("2026-09-21T16:30:00.000Z"),
        "Asia/Shanghai",
      ),
    ).toEqual({
      fromDate: "2026-09-21",
      toDate: "2026-09-21",
    });

    expect(
      resolveCnipaWeekdayIncrementalWindow(
        new Date("2026-09-17T16:30:00.000Z"),
        "Asia/Shanghai",
      ),
    ).toEqual({
      fromDate: "2026-09-17",
      toDate: "2026-09-17",
    });
  });

  it("rejects weekend primary runs instead of manufacturing a duplicate window", () => {
    expect(() =>
      resolveCnipaWeekdayIncrementalWindow(
        new Date("2026-09-18T16:30:00.000Z"),
        "Asia/Shanghai",
      ),
    ).toThrowError(/must not run on Saturday or Sunday/i);
  });
});
