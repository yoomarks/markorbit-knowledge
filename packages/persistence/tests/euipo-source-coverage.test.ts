import { describe, expect, it } from "vitest";
import type { SourceDefinition } from "@markorbit/contracts";
import {
  EUIPO_SOURCE_COVERAGE_TARGETS,
  evaluateSourceCoverage,
  getSourceCoverageTarget,
  listSourceCoverageTargets,
  summarizeSourceCoverage,
} from "../src/source-coverage-catalog";

describe("EUIPO source coverage catalog", () => {
  it("ships a unique curated EUIPO trademark baseline", () => {
    expect(EUIPO_SOURCE_COVERAGE_TARGETS).toHaveLength(11);
    expect(new Set(EUIPO_SOURCE_COVERAGE_TARGETS.map((item) => item.id)).size).toBe(11);
    expect(new Set(EUIPO_SOURCE_COVERAGE_TARGETS.map((item) => item.canonicalUri)).size).toBe(11);

    for (const item of EUIPO_SOURCE_COVERAGE_TARGETS) {
      expect(item.jurisdiction).toBe("EU");
      expect(item.authorityName).toBe("European Union Intellectual Property Office");
      expect(item.authorityBasis).toBe("EXPLICIT_CURATED");
      expect(item.authorityLevel).toBe("PRIMARY_OFFICIAL");
      expect(item.canonicalUri.startsWith("https://")).toBe(true);
      expect(item.entrypoints.length).toBeGreaterThan(0);
      expect(item.acquisition.expectedArtifactKinds.length).toBeGreaterThan(0);
    }
  });

  it("keeps EUIPO coverage intent separate from execution authorization", () => {
    const serialized = JSON.stringify(EUIPO_SOURCE_COVERAGE_TARGETS);
    expect(serialized).not.toContain('"schedule"');
    expect(serialized).not.toContain('"authorized"');
    expect(serialized).not.toContain('"collectionPlanId"');
    expect(serialized).not.toContain('"scheduler"');
  });

  it("filters and summarizes EUIPO independently", () => {
    const targets = listSourceCoverageTargets({ jurisdiction: "eu" });
    expect(targets).toHaveLength(11);
    expect(targets.every((item) => item.jurisdiction === "EU")).toBe(true);

    const summary = summarizeSourceCoverage(targets);
    expect(summary.total).toBe(11);
    expect(summary.byTier).toEqual({ FOUNDATIONAL: 10, SUPPORTING: 0, CHANGE_SIGNAL: 1 });
    expect(summary.byFamily.PROCEEDINGS).toBe(1);
    expect(summary.byFamily.APPEALS_AND_CASELAW).toBe(1);
    expect(summary.byFamily.LEGAL_TEXTS).toBe(1);
  });

  it("uses neutral global proceeding and legal source families", () => {
    expect(getSourceCoverageTarget("eu-euipo-opposition")?.family).toBe("PROCEEDINGS");
    expect(getSourceCoverageTarget("eu-euipo-boards-of-appeal-decisions")?.family).toBe(
      "APPEALS_AND_CASELAW",
    );
    expect(getSourceCoverageTarget("eu-euipo-law")?.family).toBe("LEGAL_TEXTS");
  });

  it("exposes current EUIPO eSearch and case-law entrypoints", () => {
    expect(getSourceCoverageTarget("eu-euipo-esearch-plus")?.canonicalUri).toBe(
      "https://euipo.europa.eu/eSearch/",
    );
    expect(
      getSourceCoverageTarget("eu-euipo-boards-of-appeal-decisions")?.entrypoints,
    ).toContainEqual({
      uri: "https://www.euipo.europa.eu/en/law/recent-case-law",
      label: "Recent case law",
    });
  });

  it("evaluates EUIPO registration using the shared URI-based registry contract", () => {
    const source = {
      id: "src_01ARZ3NDEKTSV4RRFFQ69G5FEU",
      canonicalUri: "https://euipo.europa.eu/eSearch/",
      entrypoints: [{ uri: "https://www.euipo.europa.eu/en/search-ip" }],
    } as SourceDefinition;
    const targets = listSourceCoverageTargets({ jurisdiction: "EU", family: "SEARCH" });
    expect(evaluateSourceCoverage([source], targets)).toEqual([
      {
        targetId: "eu-euipo-esearch-plus",
        state: "REGISTERED",
        sourceIds: ["src_01ARZ3NDEKTSV4RRFFQ69G5FEU"],
      },
    ]);
  });
});
