import { describe, expect, it } from "vitest";
import {
  CIPO_SOURCE_COVERAGE_TARGETS,
  CNIPA_SOURCE_COVERAGE_TARGETS,
  DPMA_SOURCE_COVERAGE_TARGETS,
  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,
  IP_INDIA_SOURCE_COVERAGE_TARGETS,
  INPI_FR_SOURCE_COVERAGE_TARGETS,
  IPOS_SOURCE_COVERAGE_TARGETS,
  JPO_SOURCE_COVERAGE_TARGETS,
  KOREA_SOURCE_COVERAGE_TARGETS,
  PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,
  UKIPO_SOURCE_COVERAGE_TARGETS,
} from "../src/priority-national-source-coverage";
import { listSourceCoverageTargets } from "../src/source-coverage-catalog";

const authoritySets = [
  ["CN", CNIPA_SOURCE_COVERAGE_TARGETS, ["cnipa.gov.cn"]],
  ["JP", JPO_SOURCE_COVERAGE_TARGETS, ["jpo.go.jp"]],
  ["KR", KOREA_SOURCE_COVERAGE_TARGETS, ["kipo.go.kr"]],
  ["GB", UKIPO_SOURCE_COVERAGE_TARGETS, ["gov.uk", "ipo.gov.uk"]],
  ["AU", IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS, ["ipaustralia.gov.au"]],
  ["SG", IPOS_SOURCE_COVERAGE_TARGETS, ["ipos.gov.sg"]],
  ["DE", DPMA_SOURCE_COVERAGE_TARGETS, ["dpma.de"]],
  ["IN", IP_INDIA_SOURCE_COVERAGE_TARGETS, ["ipindia.gov.in"]],
  ["FR", INPI_FR_SOURCE_COVERAGE_TARGETS, ["inpi.fr"]],
  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],
] as const;

function officialHost(uri: string, suffixes: readonly string[]): boolean {
  const hostname = new URL(uri).hostname.toLowerCase();
  return suffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

describe("priority national trademark source coverage", () => {
  it("ships explicit, official, unique coverage for ten priority national offices", () => {
    expect(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS).toHaveLength(64);
    expect(new Set(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.id)).size).toBe(64);
    expect(
      new Set(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.canonicalUri)).size,
    ).toBe(64);

    for (const [jurisdiction, targets, officialSuffixes] of authoritySets) {
      expect(targets.length).toBeGreaterThanOrEqual(5);
      for (const item of targets) {
        expect(item.jurisdiction).toBe(jurisdiction);
        expect(item.authorityBasis).toBe("EXPLICIT_CURATED");
        expect(item.authorityLevel).toBe("PRIMARY_OFFICIAL");
        expect(item.category).toBe("OFFICIAL_AUTHORITY");
        expect(item.catalogState).toBe("ACTIVE");
        expect(item.entrypoints.length).toBeGreaterThan(0);
        expect(item.acquisition.expectedArtifactKinds.length).toBeGreaterThan(0);
        expect(officialHost(item.canonicalUri, officialSuffixes)).toBe(true);
        expect(officialHost(item.verificationEvidenceUri, officialSuffixes)).toBe(true);
      }
    }
  });

  it("covers filing, fees and high-value guidance without granting collection authority", () => {
    for (const [, targets] of authoritySets) {
      expect(targets.some((item) => item.family === "FILING")).toBe(true);
      expect(targets.some((item) => item.family === "FEES")).toBe(true);
      expect(
        targets.some((item) =>
          [
            "EXAMINATION_MANUAL",
            "LEGAL_TEXTS",
            "PROCEEDINGS",
            "GOODS_SERVICES_ID",
            "OFFICIAL_GAZETTE",
          ].includes(item.family),
        ),
      ).toBe(true);
    }

    const serialized = JSON.stringify(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS);
    expect(serialized).not.toContain('"schedule"');
    expect(serialized).not.toContain('"authorized"');
    expect(serialized).not.toContain('"collectionPlanId"');
  });

  it("uses the current Korean ministry identity while retaining the official kipo.go.kr surface", () => {
    expect(
      KOREA_SOURCE_COVERAGE_TARGETS.every(
        (item) => item.authorityName === "Ministry of Intellectual Property (Republic of Korea)",
      ),
    ).toBe(true);
    expect(
      KOREA_SOURCE_COVERAGE_TARGETS.every((item) =>
        officialHost(item.canonicalUri, ["kipo.go.kr"]),
      ),
    ).toBe(true);
  });

  it("integrates all priority jurisdictions into the version-controlled catalog", () => {
    for (const [jurisdiction, targets] of authoritySets) {
      const catalogTargets = listSourceCoverageTargets({ jurisdiction });
      expect(catalogTargets.map((item) => item.id).sort()).toEqual(
        targets.map((item) => item.id).sort(),
      );
    }
  });
});
