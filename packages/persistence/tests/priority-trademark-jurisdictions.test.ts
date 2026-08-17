import { describe, expect, it } from "vitest";
import {
  PRIORITY_TRADEMARK_JURISDICTIONS,
  PRIORITY_TRADEMARK_JURISDICTION_LIMIT,
  getPriorityTrademarkJurisdiction,
  listPriorityTrademarkJurisdictions,
} from "../src/priority-trademark-jurisdictions";
import { listSourceCoverageTargets } from "../src/source-coverage-catalog";

describe("priority trademark jurisdictions", () => {
  it("locks the first milestone to exactly 120 unique jurisdictions", () => {
    expect(PRIORITY_TRADEMARK_JURISDICTIONS).toHaveLength(PRIORITY_TRADEMARK_JURISDICTION_LIMIT);
    expect(new Set(PRIORITY_TRADEMARK_JURISDICTIONS.map((item) => item.jurisdiction)).size).toBe(
      PRIORITY_TRADEMARK_JURISDICTION_LIMIT,
    );
    expect(new Set(PRIORITY_TRADEMARK_JURISDICTIONS.map((item) => item.rank)).size).toBe(
      PRIORITY_TRADEMARK_JURISDICTION_LIMIT,
    );
    expect(PRIORITY_TRADEMARK_JURISDICTIONS[0]?.rank).toBe(1);
    expect(PRIORITY_TRADEMARK_JURISDICTIONS.at(-1)?.rank).toBe(
      PRIORITY_TRADEMARK_JURISDICTION_LIMIT,
    );
  });

  it("uses four stable implementation bands of thirty jurisdictions each", () => {
    for (const priorityBand of ["P0", "P1", "P2", "P3"] as const) {
      expect(listPriorityTrademarkJurisdictions({ priorityBand })).toHaveLength(30);
    }
  });

  it("keeps current curated coverage inside the 120 and identifies the remaining gap", () => {
    const curated = listPriorityTrademarkJurisdictions({ coverageState: "CURATED" });
    const target = listPriorityTrademarkJurisdictions({ coverageState: "TARGET" });

    expect(curated).toHaveLength(101);
    expect(target).toHaveLength(19);
    expect(curated.length + target.length).toBe(PRIORITY_TRADEMARK_JURISDICTION_LIMIT);

    for (const item of curated) {
      expect(listSourceCoverageTargets({ jurisdiction: item.jurisdiction }).length).toBeGreaterThan(
        0,
      );
    }
  });

  it("normalizes lookup codes and models regional trademark authorities explicitly", () => {
    expect(getPriorityTrademarkJurisdiction(" ru ")?.displayName).toBe("Russian Federation");
    expect(getPriorityTrademarkJurisdiction("nl")?.authorityModel).toBe("REGIONAL");
    expect(getPriorityTrademarkJurisdiction("ci")?.authorityModel).toBe("REGIONAL");
    expect(getPriorityTrademarkJurisdiction("xx")).toBeUndefined();
  });

  it("does not let out-of-scope jurisdictions leak into the first milestone", () => {
    const jurisdictions = new Set(
      PRIORITY_TRADEMARK_JURISDICTIONS.map((item) => item.jurisdiction),
    );

    for (const item of listPriorityTrademarkJurisdictions({ coverageState: "TARGET" })) {
      expect(jurisdictions.has(item.jurisdiction)).toBe(true);
    }
    expect(jurisdictions.size).toBe(PRIORITY_TRADEMARK_JURISDICTION_LIMIT);
  });
});
