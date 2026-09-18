import { describe, expect, it } from "vitest";
import type { Job } from "@markorbit/contracts";
import {
  CNIPA_QUERY_OVERRIDE_EXTENSION_KEY,
  CNIPA_QUERY_TEMPLATE_EXTENSION_KEY,
  SCHEDULE_SLOT_EXTENSION_KEY,
  resolveCnipaExecutionQuery,
} from "./cnipa-execution-query";

function job(overrides: Partial<Job> = {}): Job {
  return {
    planSnapshot: {
      schedule: { mode: "CRON", expression: "0 3 * * *", timezone: "Asia/Shanghai" },
    },
    sourceSnapshot: { connectorConfig: {} },
    ...overrides,
  } as unknown as Job;
}

describe("CNIPA execution query materialization", () => {
  it("resolves the previous local calendar day from an immutable schedule slot", () => {
    const input = job({
      extensions: {
        [SCHEDULE_SLOT_EXTENSION_KEY]: "2026-09-17T16:30:00.000Z",
      },
      planSnapshot: {
        schedule: { mode: "CRON", expression: "30 0 * * *", timezone: "Asia/Shanghai" },
        extensions: {
          [CNIPA_QUERY_TEMPLATE_EXTENSION_KEY]: {
            mode: "SCHEDULE_SLOT_DATE_RANGE",
            documentKinds: ["REGISTRATION_EXAMINATION"],
            fromDayOffset: -1,
            toDayOffset: -1,
          },
        },
      } as Job["planSnapshot"],
    });

    expect(resolveCnipaExecutionQuery(input, undefined)).toEqual({
      mode: "DATE_RANGE",
      fromDate: "2026-09-17",
      toDate: "2026-09-17",
      documentKinds: ["REGISTRATION_EXAMINATION"],
    });
  });

  it("supports bounded multi-day reconciliation windows", () => {
    const input = job({
      extensions: {
        [SCHEDULE_SLOT_EXTENSION_KEY]: "2026-09-18T03:00:00.000Z",
      },
      planSnapshot: {
        schedule: { mode: "INTERVAL", intervalSeconds: 86400 },
        extensions: {
          [CNIPA_QUERY_TEMPLATE_EXTENSION_KEY]: {
            mode: "SCHEDULE_SLOT_DATE_RANGE",
            timezone: "Asia/Shanghai",
            documentKinds: ["OPPOSITION_DECISION"],
            fromDayOffset: -3,
            toDayOffset: -1,
          },
        },
      } as Job["planSnapshot"],
    });

    expect(resolveCnipaExecutionQuery(input, undefined)).toEqual({
      mode: "DATE_RANGE",
      fromDate: "2026-09-15",
      toDate: "2026-09-17",
      documentKinds: ["OPPOSITION_DECISION"],
    });
  });

  it("gives an explicit job query override precedence over plan template and static source query", () => {
    const input = job({
      extensions: {
        [SCHEDULE_SLOT_EXTENSION_KEY]: "2026-09-18T03:00:00.000Z",
        [CNIPA_QUERY_OVERRIDE_EXTENSION_KEY]: {
          mode: "DATE_RANGE",
          fromDate: "2025-01-02",
          toDate: "2025-01-02",
          documentKinds: ["REVIEW_ADJUDICATION"],
        },
      },
      planSnapshot: {
        schedule: { mode: "CRON", expression: "0 3 * * *", timezone: "Asia/Shanghai" },
        extensions: {
          [CNIPA_QUERY_TEMPLATE_EXTENSION_KEY]: {
            mode: "SCHEDULE_SLOT_DATE_RANGE",
            documentKinds: ["REGISTRATION_EXAMINATION"],
            fromDayOffset: -1,
            toDayOffset: -1,
          },
        },
      } as Job["planSnapshot"],
    });

    expect(
      resolveCnipaExecutionQuery(input, {
        mode: "REGISTRATION_NUMBER",
        registrationNumber: "12345678",
      }),
    ).toEqual({
      mode: "DATE_RANGE",
      fromDate: "2025-01-02",
      toDate: "2025-01-02",
      documentKinds: ["REVIEW_ADJUDICATION"],
    });
  });

  it("falls back to the static source query when no execution materialization is configured", () => {
    expect(
      resolveCnipaExecutionQuery(job(), {
        mode: "REGISTRATION_NUMBER",
        registrationNumber: "12345678",
        documentKinds: ["REGISTRATION_EXAMINATION"],
      }),
    ).toEqual({
      mode: "REGISTRATION_NUMBER",
      registrationNumber: "12345678",
      documentKinds: ["REGISTRATION_EXAMINATION"],
    });
  });

  it("fails closed when a schedule template has no immutable schedule slot", () => {
    const input = job({
      planSnapshot: {
        schedule: { mode: "CRON", expression: "0 3 * * *", timezone: "Asia/Shanghai" },
        extensions: {
          [CNIPA_QUERY_TEMPLATE_EXTENSION_KEY]: {
            mode: "SCHEDULE_SLOT_DATE_RANGE",
            documentKinds: ["REGISTRATION_EXAMINATION"],
          },
        },
      } as Job["planSnapshot"],
    });

    expect(() => resolveCnipaExecutionQuery(input, undefined)).toThrowError(
      /requires x-markorbit\.schedule-slot-at/i,
    );
  });

  it("fails closed on future or ambiguous automatic date windows", () => {
    const input = job({
      extensions: {
        [SCHEDULE_SLOT_EXTENSION_KEY]: "2026-09-18T03:00:00.000Z",
      },
      planSnapshot: {
        schedule: { mode: "CRON", expression: "0 3 * * *", timezone: "Asia/Shanghai" },
        extensions: {
          [CNIPA_QUERY_TEMPLATE_EXTENSION_KEY]: {
            mode: "SCHEDULE_SLOT_DATE_RANGE",
            documentKinds: ["REGISTRATION_EXAMINATION"],
            fromDayOffset: -1,
            toDayOffset: 1,
          },
        },
      } as Job["planSnapshot"],
    });

    expect(() => resolveCnipaExecutionQuery(input, undefined)).toThrowError(
      /toDayOffset must be between -31 and 0/i,
    );
  });

  it("requires exactly one document library in an automatic template", () => {
    const input = job({
      extensions: {
        [SCHEDULE_SLOT_EXTENSION_KEY]: "2026-09-18T03:00:00.000Z",
      },
      planSnapshot: {
        schedule: { mode: "CRON", expression: "0 3 * * *", timezone: "Asia/Shanghai" },
        extensions: {
          [CNIPA_QUERY_TEMPLATE_EXTENSION_KEY]: {
            mode: "SCHEDULE_SLOT_DATE_RANGE",
            documentKinds: ["REGISTRATION_EXAMINATION", "OPPOSITION_DECISION"],
          },
        },
      } as Job["planSnapshot"],
    });

    expect(() => resolveCnipaExecutionQuery(input, undefined)).toThrowError(
      /exactly one CNIPA document kind/i,
    );
  });
});
