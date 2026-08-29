import { describe, expect, it } from "vitest";
import {
  assertRepresentativeCanaryArtifactContractSupported,
  assessRepresentativeCanaryArtifacts,
  unsupportedRepresentativeCanaryArtifactKinds,
} from "./representative-live-canary-evidence";

describe("representative live canary artifact evidence", () => {
  it("passes the default HTML + MARKDOWN artifact contract", () => {
    expect(
      assessRepresentativeCanaryArtifacts({
        observedArtifactKinds: ["MARKDOWN", "HTML"],
        expectedArtifactKinds: ["HTML", "MARKDOWN"],
      }),
    ).toEqual({
      pageEvidenceComplete: true,
      targetArtifactContractComplete: true,
      missingPageEvidenceKinds: [],
      missingExpectedArtifactKinds: [],
    });
  });

  it("keeps page evidence complete while exposing a missing structured artifact", () => {
    expect(
      assessRepresentativeCanaryArtifacts({
        observedArtifactKinds: ["HTML", "MARKDOWN"],
        expectedArtifactKinds: ["HTML", "JSON"],
      }),
    ).toEqual({
      pageEvidenceComplete: true,
      targetArtifactContractComplete: false,
      missingPageEvidenceKinds: [],
      missingExpectedArtifactKinds: ["JSON"],
    });
  });

  it("fails page evidence independently from the target contract", () => {
    expect(
      assessRepresentativeCanaryArtifacts({
        observedArtifactKinds: ["HTML"],
        expectedArtifactKinds: ["HTML"],
      }),
    ).toEqual({
      pageEvidenceComplete: false,
      targetArtifactContractComplete: true,
      missingPageEvidenceKinds: ["MARKDOWN"],
      missingExpectedArtifactKinds: [],
    });
  });

  it("fails fast when a WEB canary contract asks Crawl4AI for unsupported artifact kinds", () => {
    expect(
      unsupportedRepresentativeCanaryArtifactKinds(["JSON", "HTML", "IMAGE", "JSON"]),
    ).toEqual(["IMAGE", "JSON"]);
    expect(() =>
      assertRepresentativeCanaryArtifactContractSupported(["HTML", "JSON"]),
    ).toThrow(/cannot produce expected artifact kinds.*JSON/u);
    expect(() =>
      assertRepresentativeCanaryArtifactContractSupported(["HTML", "MARKDOWN"]),
    ).not.toThrow();
  });
});
