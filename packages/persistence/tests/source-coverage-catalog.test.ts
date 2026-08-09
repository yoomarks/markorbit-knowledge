import { describe, expect, it } from "vitest";
import type { SourceDefinition } from "@markorbit/contracts";
import {
  US_SOURCE_COVERAGE_TARGETS,
  evaluateSourceCoverage,
  getSourceCoverageTarget,
  listSourceCoverageTargets,
  summarizeSourceCoverage,
} from "../src/source-coverage-catalog";

describe("source coverage catalog", () => {
  it("ships a unique, explicit US official-source baseline", () => {
    expect(US_SOURCE_COVERAGE_TARGETS).toHaveLength(17);
    expect(new Set(US_SOURCE_COVERAGE_TARGETS.map((item) => item.id)).size).toBe(17);
    expect(new Set(US_SOURCE_COVERAGE_TARGETS.map((item) => item.canonicalUri)).size).toBe(17);

    for (const item of US_SOURCE_COVERAGE_TARGETS) {
      expect(item.jurisdiction).toBe("US");
      expect(item.authorityName).toBe("United States Patent and Trademark Office");
      expect(item.authorityBasis).toBe("EXPLICIT_CURATED");
      expect(item.authorityLevel).toBe("PRIMARY_OFFICIAL");
      expect(item.canonicalUri.startsWith("https://")).toBe(true);
      expect(item.entrypoints.length).toBeGreaterThan(0);
      expect(item.acquisition.expectedArtifactKinds.length).toBeGreaterThan(0);
    }
  });

  it("keeps coverage intent separate from execution authorization", () => {
    const serialized = JSON.stringify(US_SOURCE_COVERAGE_TARGETS);
    expect(serialized).not.toContain('"schedule"');
    expect(serialized).not.toContain('"authorized"');
    expect(serialized).not.toContain('"collectionPlanId"');
    expect(serialized).not.toContain('"scheduler"');
  });

  it("filters and summarizes the version-controlled map", () => {
    const changeSignals = listSourceCoverageTargets({
      jurisdiction: "us",
      coverageTier: "CHANGE_SIGNAL",
    });
    expect(changeSignals).toHaveLength(3);
    expect(changeSignals.every((item) => item.changeSensitivity === "HIGH")).toBe(true);

    const summary = summarizeSourceCoverage(US_SOURCE_COVERAGE_TARGETS);
    expect(summary.total).toBe(17);
    expect(summary.byTier).toEqual({ FOUNDATIONAL: 11, SUPPORTING: 3, CHANGE_SIGNAL: 3 });
    expect(summary.byFamily.EXAMINATION_MANUAL).toBe(2);
    expect(summary.byFamily.POLICY_NOTICES).toBe(2);
  });

  it("returns defensive copies from lookup helpers", () => {
    const first = getSourceCoverageTarget("us-uspto-tmep-current");
    expect(first?.canonicalUri).toBe("https://tmep.uspto.gov/RDMS/TMEP/current");
    if (!first) throw new Error("fixture missing");
    first.entrypoints.push({ uri: "https://example.com/" });
    expect(getSourceCoverageTarget("us-uspto-tmep-current")?.entrypoints).toHaveLength(1);
  });

  it("reports registered coverage without creating or activating Sources", () => {
    const source = {
      id: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      canonicalUri: "https://tmep.uspto.gov/RDMS/TMEP/current/",
      entrypoints: [{ uri: "https://tmep.uspto.gov/RDMS/TMEP/current" }],
    } as SourceDefinition;

    const targets = listSourceCoverageTargets({ family: "EXAMINATION_MANUAL" });
    const status = evaluateSourceCoverage([source], targets);
    expect(status).toEqual([
      {
        targetId: "us-uspto-tmep-current",
        state: "REGISTERED",
        sourceIds: ["src_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
      },
      {
        targetId: "us-uspto-tmep-archives",
        state: "UNREGISTERED",
        sourceIds: [],
      },
    ]);
  });
});
