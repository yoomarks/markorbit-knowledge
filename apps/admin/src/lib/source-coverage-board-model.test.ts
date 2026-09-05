import { describe, expect, it } from "vitest";
import {
  deriveSourceCoverageBoundary,
  latestEvidenceTimestamp,
} from "./source-coverage-board-model";

const completeInput = {
  registrationState: "REGISTERED" as const,
  sourceStatuses: ["ACTIVE"],
  supplyState: "READY" as const,
  gaps: [],
  acquisitionArtifactCount: 3,
  observedArtifactKinds: ["HTML", "MARKDOWN"],
  expectedArtifactKinds: ["HTML", "MARKDOWN"],
  knownLimitation: false,
};

describe("Source Coverage Board evidence boundary", () => {
  it("marks COMPLETE only when the known supply path is fully evidenced", () => {
    expect(deriveSourceCoverageBoundary(completeInput)).toEqual({
      status: "COMPLETE",
      reasons: [],
      missingExpectedArtifactKinds: [],
    });
  });

  it("keeps unregistered targets UNKNOWN instead of treating catalog presence as coverage", () => {
    expect(
      deriveSourceCoverageBoundary({
        ...completeInput,
        registrationState: "UNREGISTERED",
        sourceStatuses: [],
        acquisitionArtifactCount: 0,
      }).status,
    ).toBe("UNKNOWN");
  });

  it("keeps registered targets without durable acquisition evidence UNKNOWN", () => {
    expect(
      deriveSourceCoverageBoundary({ ...completeInput, acquisitionArtifactCount: 0 }).status,
    ).toBe("UNKNOWN");
  });

  it("marks known incomplete supply PARTIAL and preserves objective gap reasons", () => {
    const result = deriveSourceCoverageBoundary({
      ...completeInput,
      supplyState: "DEGRADED",
      gaps: ["STALE_ACQUISITION", "NO_RETRIEVAL_DOCUMENT"],
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.reasons).toEqual(
      expect.arrayContaining(["SUPPLY_DEGRADED", "STALE_ACQUISITION", "NO_RETRIEVAL_DOCUMENT"]),
    );
  });

  it("does not upgrade missing expected artifact kinds or explicit limitations", () => {
    const result = deriveSourceCoverageBoundary({
      ...completeInput,
      observedArtifactKinds: ["HTML"],
      knownLimitation: true,
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.missingExpectedArtifactKinds).toEqual(["MARKDOWN"]);
    expect(result.reasons).toEqual(
      expect.arrayContaining(["EXPECTED_ARTIFACT_KIND_MISSING:MARKDOWN", "KNOWN_LIMITATION"]),
    );
  });

  it("selects the latest durable check timestamp without inventing one", () => {
    expect(latestEvidenceTimestamp(null, "2026-09-01T10:00:00Z", "2026-09-02T09:00:00Z")).toBe(
      "2026-09-02T09:00:00Z",
    );
    expect(latestEvidenceTimestamp(null, undefined)).toBeNull();
  });
});
