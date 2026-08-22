import { describe, expect, it } from "vitest";
import {
  resolveAcquisitionOutcome,
  sourceGapObservationsFromEvidenceRefs,
} from "./source-gap-accounting";

describe("source gap accounting", () => {
  it("classifies an authoritative 404 as an explainable source gap", () => {
    const observedAt = "2026-08-22T08:38:23.000Z";
    const gaps = sourceGapObservationsFromEvidenceRefs(
      [
        "source-gap:SOURCE_UNAVAILABLE:404:https%3A%2F%2Fmanuals.ipaustralia.gov.au%2Ftrademark%2F1.5",
      ],
      observedAt,
    );

    expect(gaps).toEqual([
      {
        url: "https://manuals.ipaustralia.gov.au/trademark/1.5",
        gapType: "HTTP_404",
        statusCode: 404,
        observedAt,
        evidenceRef:
          "source-gap:SOURCE_UNAVAILABLE:404:https%3A%2F%2Fmanuals.ipaustralia.gov.au%2Ftrademark%2F1.5",
      },
    ]);
  });

  it("treats a fully explained 580 to 578 corpus delta as degraded source evidence", () => {
    const gaps = sourceGapObservationsFromEvidenceRefs(
      [
        "source-gap:SOURCE_UNAVAILABLE:404:https%3A%2F%2Fmanuals.ipaustralia.gov.au%2Ftrademark%2F1.5",
        "source-gap:SOURCE_UNAVAILABLE:404:https%3A%2F%2Fmanuals.ipaustralia.gov.au%2Ftrademark%2F27.2.---legal-submissions",
      ],
      "2026-08-22T08:38:23.000Z",
    );

    expect(resolveAcquisitionOutcome({ discovered: 580, accepted: 578, gaps })).toEqual({
      resolution: "DEGRADED_WITH_SOURCE_GAPS",
      explainableGapCount: 2,
      artifactCoverage: 578 / 580,
    });
  });

  it("fails closed when missing corpus items are not all explained", () => {
    const gaps = sourceGapObservationsFromEvidenceRefs(
      [
        "source-gap:SOURCE_UNAVAILABLE:404:https%3A%2F%2Fmanuals.ipaustralia.gov.au%2Ftrademark%2F1.5",
      ],
      "2026-08-22T08:38:23.000Z",
    );

    expect(resolveAcquisitionOutcome({ discovered: 580, accepted: 578, gaps }).resolution).toBe(
      "FAILED",
    );
  });
});
