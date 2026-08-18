import { describe, expect, it } from "vitest";
import type { SourceDefinition } from "@markorbit/contracts";
import {
  WIPO_SOURCE_COVERAGE_TARGETS,
  evaluateSourceCoverage,
  getSourceCoverageTarget,
  listSourceCoverageTargets,
  summarizeSourceCoverage,
} from "../src/source-coverage-catalog";

describe("WIPO source coverage catalog", () => {
  it("ships a unique curated WIPO trademark baseline", () => {
    expect(WIPO_SOURCE_COVERAGE_TARGETS).toHaveLength(11);
    expect(new Set(WIPO_SOURCE_COVERAGE_TARGETS.map((item) => item.id)).size).toBe(11);
    expect(new Set(WIPO_SOURCE_COVERAGE_TARGETS.map((item) => item.canonicalUri)).size).toBe(11);

    for (const item of WIPO_SOURCE_COVERAGE_TARGETS) {
      expect(item.jurisdiction).toBe("WO");
      expect(item.authorityName).toBe("World Intellectual Property Organization");
      expect(item.authorityBasis).toBe("EXPLICIT_CURATED");
      expect(item.authorityLevel).toBe("PRIMARY_OFFICIAL");
      expect(item.canonicalUri.startsWith("https://")).toBe(true);
      expect(item.entrypoints.length).toBeGreaterThan(0);
      expect(item.acquisition.expectedArtifactKinds.length).toBeGreaterThan(0);
    }
  });

  it("keeps WIPO coverage intent separate from collection authorization", () => {
    const serialized = JSON.stringify(WIPO_SOURCE_COVERAGE_TARGETS);
    expect(serialized).not.toContain('"schedule"');
    expect(serialized).not.toContain('"collectionPlanId"');
    expect(serialized).not.toContain('"scheduler"');
  });

  it("filters and summarizes WIPO independently from the US map", () => {
    const targets = listSourceCoverageTargets({ jurisdiction: "wo" });
    expect(targets).toHaveLength(11);
    expect(targets.every((item) => item.jurisdiction === "WO")).toBe(true);

    const summary = summarizeSourceCoverage(targets);
    expect(summary.total).toBe(11);
    expect(summary.byTier).toEqual({ FOUNDATIONAL: 8, SUPPORTING: 2, CHANGE_SIGNAL: 1 });
    expect(summary.byFamily.STATUS_AND_DOCUMENTS).toBe(1);
    expect(summary.byFamily.OFFICIAL_GAZETTE).toBe(1);
    expect(summary.byFamily.POLICY_NOTICES).toBe(2);
    expect(summary.byFamily.APPEALS_AND_CASELAW).toBe(1);
  });

  it("exposes current WIPO legal-text and Madrid Monitor targets", () => {
    expect(getSourceCoverageTarget("wo-wipo-madrid-legal-texts")?.canonicalUri).toBe(
      "https://www.wipo.int/en/web/madrid-system/legal_texts/index",
    );
    expect(getSourceCoverageTarget("wo-wipo-madrid-monitor")?.entrypoints).toContainEqual({
      uri: "https://www3.wipo.int/madrid/monitor/en/",
      label: "Legacy Madrid Monitor",
    });
  });

  it("adds official WIPO UDRP decisions as supporting case-law coverage", () => {
    const decisions = getSourceCoverageTarget("wo-wipo-udrp-decisions");

    expect(decisions?.family).toBe("APPEALS_AND_CASELAW");
    expect(decisions?.coverageTier).toBe("SUPPORTING");
    expect(decisions?.changeSensitivity).toBe("HIGH");
    expect(decisions?.canonicalUri).toBe(
      "https://www.wipo.int/en/web/amc/domain-name-disputes/decisions",
    );
    expect(decisions?.entrypoints).toContainEqual({
      uri: "https://www.wipo.int/en/web/amc/domain-name-disputes/search/index",
      label: "Search WIPO cases and panel decisions",
    });
  });

  it("evaluates WIPO registration using the same URI-based registry contract", () => {
    const source = {
      id: "src_01ARZ3NDEKTSV4RRFFQ69G5FWO",
      canonicalUri: "https://www.wipo.int/en/web/madrid-system/fees/sched/",
      entrypoints: [{ uri: "https://madrid.wipo.int/feecalcapp/" }],
    } as SourceDefinition;
    const targets = listSourceCoverageTargets({ jurisdiction: "WO", family: "FEES" });
    expect(evaluateSourceCoverage([source], targets)).toEqual([
      {
        targetId: "wo-wipo-madrid-fees",
        state: "REGISTERED",
        sourceIds: ["src_01ARZ3NDEKTSV4RRFFQ69G5FWO"],
      },
    ]);
  });
});
