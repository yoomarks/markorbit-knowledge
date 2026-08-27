import { describe, expect, it } from "vitest";

import {
  USPTO_OFFICIAL_FEE_PILOT_V1,
  assessUsptoOfficialFeeEvidenceSetV1,
  getUsptoOfficialFeePilotSourceRole,
  isUsptoOfficialFeePilotSourceUri,
  type UsptoOfficialFeeEvidenceObservationV1,
} from "./uspto-official-fee-pilot";

const PRIMARY_URI =
  "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule";
const SECONDARY_URI = "https://www.uspto.gov/trademarks/trademark-fee-information";
const sha = (character: string) => character.repeat(64);

function observation(
  role: UsptoOfficialFeeEvidenceObservationV1["role"],
  sourceUri: string,
  documentContentSha256: string,
  overrides: Partial<UsptoOfficialFeeEvidenceObservationV1> = {},
): UsptoOfficialFeeEvidenceObservationV1 {
  return {
    role,
    sourceUri,
    documentContentSha256,
    chunkId: `chunk-${role.toLowerCase()}`,
    chunkContentSha256: sha(role === "PRIMARY_NUMERIC" ? "c" : "d"),
    indexedAt: "2026-08-28T00:00:00.000Z",
    versionState: "CURRENT_CANONICAL",
    ...overrides,
  };
}

const primary = () => observation("PRIMARY_NUMERIC", PRIMARY_URI, sha("a"));
const secondary = () => observation("SECONDARY_APPLICABILITY_CONTEXT", SECONDARY_URI, sha("b"));

describe("Phase 2 USPTO official fee pilot", () => {
  it("freezes the two-source authority set without hardcoding the fee amount", () => {
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.operation).toEqual({
      operationKey: "US_TRADEMARK_BASE_APPLICATION_SECTION_1_OR_44_PER_CLASS",
      subject: "TRADEMARK_APPLICATION",
      filingBases: ["SECTION_1", "SECTION_44"],
      unit: "PER_CLASS",
    });
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.sourceSet.primaryNumeric).toMatchObject({
      role: "PRIMARY_NUMERIC",
      uri: PRIMARY_URI,
    });
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.sourceSet.secondaryApplicabilityContext).toMatchObject({
      role: "SECONDARY_APPLICABILITY_CONTEXT",
      uri: SECONDARY_URI,
    });
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.resolutionPolicy.amountStorage).toBe("SOURCE_CONTENT_ONLY");
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.resolutionPolicy.hardcodedAmountAllowed).toBe(false);
    expect(JSON.stringify(USPTO_OFFICIAL_FEE_PILOT_V1)).not.toContain("350");
  });

  it("accepts only the two frozen exact source URIs and maps their roles deterministically", () => {
    expect(getUsptoOfficialFeePilotSourceRole(PRIMARY_URI)).toBe("PRIMARY_NUMERIC");
    expect(getUsptoOfficialFeePilotSourceRole(`${PRIMARY_URI}?ignored=1#fragment`)).toBe(
      "PRIMARY_NUMERIC",
    );
    expect(getUsptoOfficialFeePilotSourceRole(SECONDARY_URI)).toBe(
      "SECONDARY_APPLICABILITY_CONTEXT",
    );
    expect(isUsptoOfficialFeePilotSourceUri(PRIMARY_URI)).toBe(true);
    expect(isUsptoOfficialFeePilotSourceUri(SECONDARY_URI)).toBe(true);
    expect(isUsptoOfficialFeePilotSourceUri("https://example.com/trademark-fees")).toBe(false);
  });

  it("marks one exact current primary plus one exact current secondary ready for Brain research", () => {
    expect(assessUsptoOfficialFeeEvidenceSetV1([primary(), secondary()])).toMatchObject({
      status: "READY_FOR_BRAIN_RESEARCH",
      primary: { role: "PRIMARY_NUMERIC", sourceUri: PRIMARY_URI },
      secondary: { role: "SECONDARY_APPLICABILITY_CONTEXT", sourceUri: SECONDARY_URI },
    });
  });

  it.each([
    ["missing primary", [secondary()], ["MISSING_PRIMARY"]],
    ["missing secondary", [primary()], ["MISSING_SECONDARY"]],
    [
      "missing lineage",
      [
        primary(),
        observation("SECONDARY_APPLICABILITY_CONTEXT", SECONDARY_URI, sha("b"), {
          chunkId: "",
        }),
      ],
      ["MISSING_LINEAGE"],
    ],
    [
      "out of scope source",
      [
        primary(),
        secondary(),
        observation("SECONDARY_APPLICABILITY_CONTEXT", "https://example.com/fee", sha("e")),
      ],
      ["OUT_OF_SCOPE_SOURCE"],
    ],
    [
      "role/source mismatch",
      [primary(), observation("PRIMARY_NUMERIC", SECONDARY_URI, sha("b"))],
      ["MISSING_SECONDARY", "ROLE_SOURCE_MISMATCH"],
    ],
    [
      "superseded source",
      [
        primary(),
        observation("SECONDARY_APPLICABILITY_CONTEXT", SECONDARY_URI, sha("b"), {
          versionState: "SUPERSEDED",
        }),
      ],
      ["STALE_SOURCE_VERSION"],
    ],
    [
      "unknown temporal state",
      [
        observation("PRIMARY_NUMERIC", PRIMARY_URI, sha("a"), { versionState: "UNKNOWN" }),
        secondary(),
      ],
      ["TEMPORAL_STATE_UNRESOLVED"],
    ],
  ] as const)("fails closed for %s", (_label, observations, reasons) => {
    expect(assessUsptoOfficialFeeEvidenceSetV1(observations)).toEqual({
      status: "FAIL_CLOSED",
      reasons: [...reasons].sort(),
    });
  });

  it("fails closed when multiple different source versions claim to be current for one role", () => {
    const conflictingPrimary = observation("PRIMARY_NUMERIC", PRIMARY_URI, sha("f"), {
      chunkContentSha256: sha("e"),
    });
    expect(
      assessUsptoOfficialFeeEvidenceSetV1([primary(), conflictingPrimary, secondary()]),
    ).toEqual({
      status: "FAIL_CLOSED",
      reasons: ["CONFLICTING_SOURCE_VERSION"],
    });
  });

  it("proves source replacement semantics without letting a superseded version remain ready", () => {
    const oldPrimary = observation("PRIMARY_NUMERIC", PRIMARY_URI, sha("a"), {
      versionState: "SUPERSEDED",
    });
    const newPrimary = observation("PRIMARY_NUMERIC", PRIMARY_URI, sha("f"), {
      chunkContentSha256: sha("e"),
    });

    expect(assessUsptoOfficialFeeEvidenceSetV1([oldPrimary, secondary()])).toEqual({
      status: "FAIL_CLOSED",
      reasons: ["STALE_SOURCE_VERSION"],
    });
    expect(assessUsptoOfficialFeeEvidenceSetV1([newPrimary, secondary()]).status).toBe(
      "READY_FOR_BRAIN_RESEARCH",
    );
  });
});
