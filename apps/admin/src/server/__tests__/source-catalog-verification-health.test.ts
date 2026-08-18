import type { SourceCoverageTarget } from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import { buildSourceCatalogVerificationHealth } from "../source-catalog-verification-health";

function target(input: {
  id: string;
  jurisdiction: string;
  verifiedAt: string;
  evidence?: string;
}): SourceCoverageTarget {
  return {
    protocolVersion: "1.0",
    objectType: "SOURCE_COVERAGE_TARGET",
    id: input.id,
    jurisdiction: input.jurisdiction,
    authorityName: `${input.jurisdiction} Fixture Office`,
    authorityBasis: "EXPLICIT_CURATED",
    family: "PORTAL",
    displayName: input.id,
    canonicalUri: `https://example.test/${input.id}`,
    entrypoints: [{ uri: `https://example.test/${input.id}` }],
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    languages: ["en"],
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML"],
    },
    verifiedAt: input.verifiedAt,
    verificationEvidenceUri: input.evidence ?? `https://example.test/${input.id}`,
  };
}

describe("buildSourceCatalogVerificationHealth", () => {
  const observedAt = new Date("2026-08-18T12:00:00.000Z");

  it("turns stale and invalid catalog metadata into a bounded maintenance queue", () => {
    const health = buildSourceCatalogVerificationHealth(
      [
        target({ id: "fresh", jurisdiction: "US", verifiedAt: "2026-08-01T12:00:00.000Z" }),
        target({ id: "boundary", jurisdiction: "JP", verifiedAt: "2026-07-19T12:00:00.000Z" }),
        target({ id: "stale-older", jurisdiction: "GB", verifiedAt: "2026-05-01T00:00:00.000Z" }),
        target({ id: "stale-newer", jurisdiction: "GB", verifiedAt: "2026-06-01T00:00:00.000Z" }),
        target({ id: "future", jurisdiction: "CN", verifiedAt: "2026-08-19T00:00:00.000Z" }),
      ],
      { observedAt, maxAgeDays: 30, queueLimit: 2 },
    );

    expect(health).toMatchObject({
      total: 5,
      fresh: 2,
      stale: 2,
      invalid: 1,
      freshnessPercent: 40,
      staleJurisdictionCount: 1,
      invalidJurisdictionCount: 1,
    });
    expect(health.debtQueue.map((item) => item.targetId)).toEqual(["future", "stale-older"]);
    expect(health.debtQueue[0]).toMatchObject({ state: "INVALID", ageDays: null });
    expect(health.debtQueue[1]).toMatchObject({ state: "STALE", jurisdiction: "GB" });
  });

  it("keeps integrity debt separate from freshness debt", () => {
    const duplicate = target({
      id: "duplicate",
      jurisdiction: "US",
      verifiedAt: "2026-08-01T00:00:00.000Z",
      evidence: "",
    });
    const health = buildSourceCatalogVerificationHealth([duplicate, { ...duplicate }], {
      observedAt,
      maxAgeDays: 30,
    });

    expect(health.fresh).toBe(2);
    expect(health.stale).toBe(0);
    expect(health.invalid).toBe(0);
    expect(health.duplicateTargetCount).toBe(1);
    expect(health.missingEvidenceTargetCount).toBe(2);
    expect(health.debtQueue).toEqual([]);
  });

  it("allows an empty queue while preserving aggregate debt counts", () => {
    const health = buildSourceCatalogVerificationHealth(
      [target({ id: "stale", jurisdiction: "CA", verifiedAt: "2025-01-01T00:00:00.000Z" })],
      { observedAt, maxAgeDays: 30, queueLimit: 0 },
    );

    expect(health.stale).toBe(1);
    expect(health.staleJurisdictionCount).toBe(1);
    expect(health.debtQueue).toEqual([]);
  });

  it("rejects an unbounded queue request", () => {
    expect(() =>
      buildSourceCatalogVerificationHealth([], {
        observedAt,
        queueLimit: 101,
      }),
    ).toThrow("queueLimit must be an integer from 0 to 100");
  });
});
