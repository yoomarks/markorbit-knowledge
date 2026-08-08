import { describe, expect, it } from "vitest";
import {
  compareDualAxisAssessments,
  countDualAxisAssessments,
  matchesDualAxisFilters,
  type DualAxisPresentationAssessment,
} from "./source-intelligence-presentation";

function assessment(
  valueScore: number,
  valueBand: DualAxisPresentationAssessment["sourceValuePriority"]["band"],
  maturityStage: DualAxisPresentationAssessment["evidenceMaturity"]["stage"],
  maturityScore: number | null,
): DualAxisPresentationAssessment {
  return {
    sourceValuePriority: { score: valueScore, band: valueBand },
    evidenceMaturity: { score: maturityScore, stage: maturityStage },
  };
}

describe("D2.6 dual-axis operator presentation", () => {
  it("sorts by Source Value first and Evidence Maturity only as a tie-breaker", () => {
    const highUnobserved = assessment(94, "VERY_HIGH", "UNOBSERVED", null);
    const lowerCurrent = assessment(70, "HIGH", "CURRENT_TRACEABLE", 88);
    const highCurrent = assessment(94, "VERY_HIGH", "CURRENT_TRACEABLE", 92);

    expect(compareDualAxisAssessments(highUnobserved, lowerCurrent)).toBeLessThan(0);
    expect(compareDualAxisAssessments(highCurrent, highUnobserved)).toBeLessThan(0);
    expect(compareDualAxisAssessments(null, highUnobserved)).toBeGreaterThan(0);
  });

  it("filters Source Value and Evidence Maturity independently", () => {
    const currentOfficial = assessment(94, "VERY_HIGH", "CURRENT_TRACEABLE", 92);

    expect(matchesDualAxisFilters(currentOfficial, "VERY_HIGH", "CURRENT_TRACEABLE")).toBe(true);
    expect(matchesDualAxisFilters(currentOfficial, "VERY_HIGH", "UNOBSERVED")).toBe(false);
    expect(matchesDualAxisFilters(currentOfficial, "HIGH", "CURRENT_TRACEABLE")).toBe(false);
    expect(matchesDualAxisFilters(null, "UNASSESSED", "ALL")).toBe(true);
    expect(matchesDualAxisFilters(null, "ALL", "UNOBSERVED")).toBe(false);
  });

  it("counts Source Value and Evidence Maturity on separate axes", () => {
    const counts = countDualAxisAssessments([
      assessment(94, "VERY_HIGH", "UNOBSERVED", null),
      assessment(94, "VERY_HIGH", "CURRENT_TRACEABLE", 92),
      assessment(70, "HIGH", "TRACEABLE", 71),
      assessment(59, "MEDIUM", "CAPTURED", 35),
      assessment(40, "LOW", "UNOBSERVED", null),
      null,
    ]);

    expect(counts).toEqual({
      unassessed: 1,
      veryHigh: 2,
      high: 1,
      medium: 1,
      low: 1,
      currentTraceable: 1,
      traceable: 1,
      captured: 1,
      unobserved: 2,
    });
  });
});
