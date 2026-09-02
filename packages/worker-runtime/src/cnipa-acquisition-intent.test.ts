import { describe, expect, it } from "vitest";
import {
  CNIPA_ACQUISITION_INTENT_POLICIES,
  assertCnipaAcquisitionIntent,
  assertCnipaIntentCoverageClaim,
  expectedCnipaAcquisitionIntent,
} from "./cnipa-acquisition-intent";
import { parseCnipaTrademarkJudgmentQuery } from "./cnipa-trademark-judgment";

describe("CNIPA acquisition intent policy", () => {
  it("binds registration-number queries to targeted evidence follow-up", () => {
    const query = parseCnipaTrademarkJudgmentQuery({
      mode: "REGISTRATION_NUMBER",
      registrationNumber: "12345678",
    });

    expect(expectedCnipaAcquisitionIntent(query)).toBe("REGISTRATION_NUMBER_TARGETED");
    expect(assertCnipaAcquisitionIntent(query, "REGISTRATION_NUMBER_TARGETED")).toMatchObject({
      compatibleQueryMode: "REGISTRATION_NUMBER",
      productPurpose: "KNOWN_MARK_EVIDENCE_FOLLOW_UP",
      coverageScope: "TARGET_OBJECT",
      currentCoverageCeiling: "UNKNOWN",
      populationCompleteClaimAllowed: false,
      sourceTruthAuthority: "CNIPA_EVIDENCE_ONLY",
    });
  });

  it("binds date-range queries to partial recency discovery", () => {
    const query = parseCnipaTrademarkJudgmentQuery({
      mode: "DATE_RANGE",
      fromDate: "2026-06-15",
      toDate: "2026-06-15",
    });

    expect(expectedCnipaAcquisitionIntent(query)).toBe("DATE_RECENCY_DISCOVERY");
    expect(assertCnipaAcquisitionIntent(query, "DATE_RECENCY_DISCOVERY")).toMatchObject({
      compatibleQueryMode: "DATE_RANGE",
      productPurpose: "LATEST_SIGNAL_DISCOVERY",
      coverageScope: "RECENCY_WINDOW",
      currentCoverageCeiling: "PARTIAL",
      populationCompleteClaimAllowed: false,
      sourceTruthAuthority: "CNIPA_EVIDENCE_ONLY",
    });
    expect(CNIPA_ACQUISITION_INTENT_POLICIES.DATE_RECENCY_DISCOVERY.notes.join(" ")).toContain(
      "100-visible-result",
    );
  });

  it("fails closed when a product intent is paired with the wrong query mode", () => {
    const registrationQuery = parseCnipaTrademarkJudgmentQuery({
      mode: "REGISTRATION_NUMBER",
      registrationNumber: "12345678",
    });
    const dateQuery = parseCnipaTrademarkJudgmentQuery({
      mode: "DATE_RANGE",
      fromDate: "2026-06-15",
      toDate: "2026-06-15",
    });

    expect(() => assertCnipaAcquisitionIntent(registrationQuery, "DATE_RECENCY_DISCOVERY")).toThrow(
      /incompatible with query mode REGISTRATION_NUMBER/,
    );
    expect(() =>
      assertCnipaAcquisitionIntent(dateQuery, "REGISTRATION_NUMBER_TARGETED"),
    ).toThrow(/incompatible with query mode DATE_RANGE/);
  });

  it("does not invent a production acquisition intent for party-name queries", () => {
    const query = parseCnipaTrademarkJudgmentQuery({
      mode: "PARTY_NAME",
      partyName: "某某科技有限公司",
    });

    expect(expectedCnipaAcquisitionIntent(query)).toBeNull();
    expect(() => assertCnipaAcquisitionIntent(query, "DATE_RECENCY_DISCOVERY")).toThrow(
      /has no accepted acquisition intent/,
    );
  });

  it("forbids COMPLETE coverage claims under the current intent policy", () => {
    expect(() => assertCnipaIntentCoverageClaim("DATE_RECENCY_DISCOVERY", "COMPLETE")).toThrow(
      /100-visible-result source window/,
    );
    expect(() =>
      assertCnipaIntentCoverageClaim("REGISTRATION_NUMBER_TARGETED", "COMPLETE"),
    ).toThrow(/complete CNIPA population coverage/);

    expect(() => assertCnipaIntentCoverageClaim("DATE_RECENCY_DISCOVERY", "PARTIAL")).not.toThrow();
    expect(() =>
      assertCnipaIntentCoverageClaim("REGISTRATION_NUMBER_TARGETED", "UNKNOWN"),
    ).not.toThrow();
  });
});
