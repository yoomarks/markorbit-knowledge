import { describe, expect, it } from "vitest";
import type { SourceDefinition } from "@markorbit/contracts";
import {
  OAPI_CI_SOURCE_COVERAGE_TARGETS,
  OAPI_CM_SOURCE_COVERAGE_TARGETS,
  OAPI_SN_SOURCE_COVERAGE_TARGETS,
  PRIORITY_REGIONAL_SOURCE_COVERAGE_TARGETS,
} from "../src/priority-regional-source-coverage";
import { evaluateSourceCoverage, listSourceCoverageTargets } from "../src/source-coverage-catalog";
import { getPriorityTrademarkJurisdiction } from "../src/priority-trademark-jurisdictions";

const authoritySets = [
  ["CI", OAPI_CI_SOURCE_COVERAGE_TARGETS],
  ["CM", OAPI_CM_SOURCE_COVERAGE_TARGETS],
  ["SN", OAPI_SN_SOURCE_COVERAGE_TARGETS],
] as const;

function officialOapiHost(uri: string): boolean {
  const hostname = new URL(uri).hostname.toLowerCase();
  return hostname === "oapi.int" || hostname.endsWith(".oapi.int");
}

describe("priority regional trademark source coverage", () => {
  it("models three OAPI jurisdictions with eighteen unique targets over six shared sources", () => {
    expect(PRIORITY_REGIONAL_SOURCE_COVERAGE_TARGETS).toHaveLength(18);
    expect(new Set(PRIORITY_REGIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.id)).size).toBe(18);
    expect(
      new Set(PRIORITY_REGIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.canonicalUri)).size,
    ).toBe(6);

    const sharedUris = OAPI_CI_SOURCE_COVERAGE_TARGETS.map((item) => item.canonicalUri).sort();
    for (const [jurisdiction, targets] of authoritySets) {
      expect(targets).toHaveLength(6);
      expect(targets.map((item) => item.canonicalUri).sort()).toEqual(sharedUris);
      expect(getPriorityTrademarkJurisdiction(jurisdiction)?.authorityModel).toBe("REGIONAL");
      for (const item of targets) {
        expect(item.jurisdiction).toBe(jurisdiction);
        expect(item.authorityName).toBe("African Intellectual Property Organization (OAPI)");
        expect(item.authorityBasis).toBe("EXPLICIT_CURATED");
        expect(item.authorityLevel).toBe("PRIMARY_OFFICIAL");
        expect(item.category).toBe("OFFICIAL_AUTHORITY");
        expect(item.catalogState).toBe("ACTIVE");
        expect(item.coverageTier).toBe("FOUNDATIONAL");
        expect(officialOapiHost(item.canonicalUri)).toBe(true);
        expect(officialOapiHost(item.verificationEvidenceUri)).toBe(true);
      }
    }
  });

  it("covers the regional filing search fees and legal framework without creating execution authority", () => {
    for (const [, targets] of authoritySets) {
      expect(targets.some((item) => item.family === "FILING")).toBe(true);
      expect(targets.some((item) => item.family === "SEARCH")).toBe(true);
      expect(targets.some((item) => item.family === "FEES")).toBe(true);
      expect(targets.some((item) => item.family === "LEGAL_TEXTS")).toBe(true);
      expect(targets.some((item) => item.family === "EXAMINATION_MANUAL")).toBe(true);
    }

    const serialized = JSON.stringify(PRIORITY_REGIONAL_SOURCE_COVERAGE_TARGETS);
    expect(serialized).not.toContain('"schedule"');
    expect(serialized).not.toContain('"authorized"');
    expect(serialized).not.toContain('"collectionPlanId"');
  });

  it("registers one physical OAPI source against the same filing target in all three jurisdictions", () => {
    const source = {
      id: "src_01OAPI_SHARED_TRADEMARK_SOURCE",
      canonicalUri: "https://oapi.int/proteger-la-pi/marque/",
      entrypoints: [{ uri: "https://oapi.int/proteger-la-pi/marque/" }],
    } as SourceDefinition;
    const filingTargets = PRIORITY_REGIONAL_SOURCE_COVERAGE_TARGETS.filter(
      (item) => item.family === "FILING",
    );

    expect(evaluateSourceCoverage([source], filingTargets)).toEqual(
      filingTargets.map((item) => ({
        targetId: item.id,
        state: "REGISTERED",
        sourceIds: [source.id],
      })),
    );
  });

  it("integrates every regional jurisdiction into the version-controlled catalog", () => {
    for (const [jurisdiction, targets] of authoritySets) {
      expect(
        listSourceCoverageTargets({ jurisdiction })
          .map((item) => item.id)
          .sort(),
      ).toEqual(targets.map((item) => item.id).sort());
    }
  });
});
