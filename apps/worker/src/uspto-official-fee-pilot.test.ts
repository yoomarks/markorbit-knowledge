import { describe, expect, it } from "vitest";

import {
  USPTO_OFFICIAL_FEE_PILOT_V1,
  isUsptoOfficialFeePilotSourceUri,
} from "./uspto-official-fee-pilot";

describe("Phase 2 USPTO official fee pilot", () => {
  it("freezes one narrow official operation without hardcoding the fee amount", () => {
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.operation).toEqual({
      operationKey: "US_TRADEMARK_BASE_APPLICATION_SECTION_1_OR_44_PER_CLASS",
      subject: "TRADEMARK_APPLICATION",
      filingBases: ["SECTION_1", "SECTION_44"],
      unit: "PER_CLASS",
    });
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.resolutionPolicy.amountStorage).toBe(
      "SOURCE_CONTENT_ONLY",
    );
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.resolutionPolicy.hardcodedAmountAllowed).toBe(false);
    expect(JSON.stringify(USPTO_OFFICIAL_FEE_PILOT_V1)).not.toContain("350");
  });

  it("requires exact content and chunk lineage for downstream research evidence", () => {
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.lineagePolicy).toEqual({
      versionIdentity: "CONTENT_SHA256",
      requireChunkId: true,
      requireContentSha256: true,
      requireIndexedAt: true,
      requireSourceUri: true,
    });
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.resolutionPolicy.staleEvidenceBehavior).toBe(
      "FAIL_CLOSED",
    );
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.resolutionPolicy.conflictingEvidenceBehavior).toBe(
      "FAIL_CLOSED",
    );
  });

  it("accepts only the frozen canonical fee page as the pilot primary source", () => {
    expect(
      isUsptoOfficialFeePilotSourceUri(
        "https://www.uspto.gov/trademarks/trademark-fee-information",
      ),
    ).toBe(true);
    expect(
      isUsptoOfficialFeePilotSourceUri(
        "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule",
      ),
    ).toBe(false);
    expect(isUsptoOfficialFeePilotSourceUri("https://example.com/trademark-fees")).toBe(false);
  });

  it("keeps the broader fee schedule outside the current collection policy", () => {
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.auditCorroboration.collectionStatus).toBe(
      "OUTSIDE_CURRENT_GOLDEN_SOURCE_POLICY",
    );
    expect(USPTO_OFFICIAL_FEE_PILOT_V1.canonicalSource.collectionBoundary).toBe(
      "https://www.uspto.gov/trademarks*",
    );
  });
});
