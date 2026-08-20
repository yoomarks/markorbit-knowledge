import { describe, expect, it } from "vitest";
import { validateProductionValidationCoverageLinkedManifest } from "./production-validation-coverage-links";

function manifest(coverageTargetIds: unknown, jurisdiction = "US") {
  return {
    manifestVersion: "1.0",
    waveId: "wave-coverage-links",
    governance: {
      collectionAuthorizationRequired: true,
      discoveryDoesNotActivateSource: true,
      noAutomaticProductionScheduling: true,
      realObservationsOnly: true,
    },
    targets: [
      {
        id: "wave-target",
        jurisdiction,
        authority: "Official Authority",
        canonicalUri: "https://example.com/trademarks",
        sourceClass: "OFFICIAL_AUTHORITY",
        priority: "P0",
        validationState: "PENDING_REAL_RUN",
        coverageTargetIds,
      },
    ],
  };
}

describe("validateProductionValidationCoverageLinkedManifest", () => {
  it("accepts explicit ACTIVE FOUNDATIONAL coverage targets in the same jurisdiction", () => {
    const parsed = validateProductionValidationCoverageLinkedManifest(
      manifest(["us-uspto-trademark-search", "us-uspto-tsdr"]),
    );

    expect(parsed.targets[0]?.coverageTargetIds).toEqual([
      "us-uspto-trademark-search",
      "us-uspto-tsdr",
    ]);
  });

  it("accepts an explicit empty mapping when no structured coverage target is declared", () => {
    const parsed = validateProductionValidationCoverageLinkedManifest(manifest([]));
    expect(parsed.targets[0]?.coverageTargetIds).toEqual([]);
  });

  it("rejects duplicate, unknown, cross-jurisdiction, or non-array mappings", () => {
    expect(() =>
      validateProductionValidationCoverageLinkedManifest(
        manifest(["us-uspto-trademark-search", "us-uspto-trademark-search"]),
      ),
    ).toThrow("must not contain duplicates");
    expect(() =>
      validateProductionValidationCoverageLinkedManifest(manifest(["missing-target"])),
    ).toThrow("unknown target");
    expect(() =>
      validateProductionValidationCoverageLinkedManifest(
        manifest(["eu-euipo-esearch-plus"], "US"),
      ),
    ).toThrow("belongs to EU");
    expect(() => validateProductionValidationCoverageLinkedManifest(manifest(null))).toThrow(
      "must be an array",
    );
  });
});
