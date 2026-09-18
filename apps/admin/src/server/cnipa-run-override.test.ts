import { describe, expect, it } from "vitest";
import {
  CNIPA_MANUAL_QUERY_OVERRIDE_KEY,
  parseCnipaManualRunExtensions,
} from "./cnipa-run-override";

const registrationPlanExtensions = {
  "x-markorbit.cnipa-traffic-class": "FAST_LIST",
  "x-markorbit.cnipa-document-kind": "REGISTRATION_EXAMINATION",
};

describe("CNIPA governed historical run override", () => {
  it("keeps ordinary manual dispatch extension-free", () => {
    expect(
      parseCnipaManualRunExtensions({
        rawExtensions: undefined,
        planExtensions: undefined,
        idempotencyKey: null,
      }),
    ).toBeUndefined();
  });

  it("admits a bounded matching DATE_RANGE for a CNIPA FAST plan", () => {
    expect(
      parseCnipaManualRunExtensions({
        rawExtensions: {
          [CNIPA_MANUAL_QUERY_OVERRIDE_KEY]: {
            mode: "DATE_RANGE",
            fromDate: "2016-01-01",
            toDate: "2016-01-30",
            documentKinds: ["REGISTRATION_EXAMINATION"],
          },
        },
        planExtensions: registrationPlanExtensions,
        idempotencyKey: "cnipa-registration-2016-01-01-2016-01-30",
      }),
    ).toEqual({
      [CNIPA_MANUAL_QUERY_OVERRIDE_KEY]: {
        mode: "DATE_RANGE",
        fromDate: "2016-01-01",
        toDate: "2016-01-30",
        documentKinds: ["REGISTRATION_EXAMINATION"],
      },
    });
  });

  it("requires an idempotency key for historical overrides", () => {
    expect(() =>
      parseCnipaManualRunExtensions({
        rawExtensions: {
          [CNIPA_MANUAL_QUERY_OVERRIDE_KEY]: {
            mode: "DATE_RANGE",
            fromDate: "2016-01-01",
            toDate: "2016-01-01",
            documentKinds: ["REGISTRATION_EXAMINATION"],
          },
        },
        planExtensions: registrationPlanExtensions,
        idempotencyKey: null,
      }),
    ).toThrow(/Idempotency-Key/i);
  });

  it("rejects overrides on non-CNIPA or non-FAST plans", () => {
    expect(() =>
      parseCnipaManualRunExtensions({
        rawExtensions: {
          [CNIPA_MANUAL_QUERY_OVERRIDE_KEY]: {
            mode: "DATE_RANGE",
            fromDate: "2016-01-01",
            toDate: "2016-01-01",
            documentKinds: ["REGISTRATION_EXAMINATION"],
          },
        },
        planExtensions: { "x-markorbit.cnipa-document-kind": "REGISTRATION_EXAMINATION" },
        idempotencyKey: "key",
      }),
    ).toThrow(/only allowed for CNIPA FAST LIST plans/i);
  });

  it("rejects arbitrary extension passthrough and unsupported query fields", () => {
    expect(() =>
      parseCnipaManualRunExtensions({
        rawExtensions: {
          "x-markorbit.schedule-slot-at": "2026-01-01T00:00:00Z",
        },
        planExtensions: registrationPlanExtensions,
        idempotencyKey: "key",
      }),
    ).toThrow(/only permits/i);

    expect(() =>
      parseCnipaManualRunExtensions({
        rawExtensions: {
          [CNIPA_MANUAL_QUERY_OVERRIDE_KEY]: {
            mode: "DATE_RANGE",
            fromDate: "2016-01-01",
            toDate: "2016-01-01",
            documentKinds: ["REGISTRATION_EXAMINATION"],
            pageIndex: 99,
          },
        },
        planExtensions: registrationPlanExtensions,
        idempotencyKey: "key",
      }),
    ).toThrow(/unsupported field/i);
  });

  it("rejects windows over 30 calendar days", () => {
    expect(() =>
      parseCnipaManualRunExtensions({
        rawExtensions: {
          [CNIPA_MANUAL_QUERY_OVERRIDE_KEY]: {
            mode: "DATE_RANGE",
            fromDate: "2016-01-01",
            toDate: "2016-01-31",
            documentKinds: ["REGISTRATION_EXAMINATION"],
          },
        },
        planExtensions: registrationPlanExtensions,
        idempotencyKey: "key",
      }),
    ).toThrow(/cannot exceed 30/i);
  });

  it("rejects a document kind that does not match the frozen plan", () => {
    expect(() =>
      parseCnipaManualRunExtensions({
        rawExtensions: {
          [CNIPA_MANUAL_QUERY_OVERRIDE_KEY]: {
            mode: "DATE_RANGE",
            fromDate: "2016-01-01",
            toDate: "2016-01-01",
            documentKinds: ["REVIEW_ADJUDICATION"],
          },
        },
        planExtensions: registrationPlanExtensions,
        idempotencyKey: "key",
      }),
    ).toThrow(/must match the frozen FAST plan kind/i);
  });
});
