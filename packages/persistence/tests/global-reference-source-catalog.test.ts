import { describe, expect, it } from "vitest";
import {
  GLOBAL_REFERENCE_SOURCES,
  getGlobalReferenceSource,
  listGlobalReferenceSources,
  toReferenceSourceCreateInput,
} from "../src/global-reference-source-catalog";

describe("global reference source catalog", () => {
  it("keeps the curated cross-jurisdiction layer separate and deterministic", () => {
    expect(GLOBAL_REFERENCE_SOURCES).toHaveLength(15);

    const ids = new Set(GLOBAL_REFERENCE_SOURCES.map((source) => source.id));
    const urls = new Set(GLOBAL_REFERENCE_SOURCES.map((source) => source.canonicalUri));

    expect(ids.size).toBe(GLOBAL_REFERENCE_SOURCES.length);
    expect(urls.size).toBe(GLOBAL_REFERENCE_SOURCES.length);
    expect([...urls].every((url) => url.startsWith("https://"))).toBe(true);
  });

  it("uses UN population data as primary and World Population Review as secondary", () => {
    const un = getGlobalReferenceSource("un-world-population-prospects");
    const wpr = getGlobalReferenceSource("world-population-review-countries");

    expect(un?.factEligibility).toBe("PRIMARY");
    expect(wpr?.factEligibility).toBe("SECONDARY");
    expect(wpr?.verification).toEqual({
      policy: "REQUIRED",
      verifyAgainstSourceIds: ["un-world-population-prospects"],
    });
  });

  it("models IPRI as a property-rights signal rather than a general competitiveness index", () => {
    const ipri = getGlobalReferenceSource("international-property-rights-index-countries");

    expect(ipri?.sourceRole).toBe("PROPERTY_RIGHTS_INDEX");
    expect(ipri?.contentDomains).toContain("PROPERTY_RIGHTS");
    expect(ipri?.notes).toContain("not as a general country competitiveness index");
  });

  it("separates Country Index country surveys from its change-signal newsletter", () => {
    const survey = getGlobalReferenceSource("country-index-country-surveys");
    const newsletter = getGlobalReferenceSource("country-index-newsletter");

    expect(survey?.sourceRole).toBe("TM_PRACTICE_GUIDE");
    expect(survey?.factEligibility).toBe("SECONDARY");
    expect(survey?.verification.verifyAgainstJurisdictionOfficialSource).toBe(true);

    expect(newsletter?.sourceRole).toBe("TM_CHANGE_SIGNAL");
    expect(newsletter?.changeSignalEligible).toBe(true);
    expect(newsletter?.factEligibility).toBe("SUPPORTING_ONLY");
    expect(newsletter?.freshnessPolicy).toBe("BIWEEKLY");
    expect(newsletter?.verification.verifyAgainstJurisdictionOfficialSource).toBe(true);
  });

  it("keeps WIPO legal and authority sources in the highest reference tier", () => {
    expect(getGlobalReferenceSource("wipo-country-ip-profiles")?.authorityTier).toBe("A_PLUS");
    expect(getGlobalReferenceSource("wipo-lex")?.authorityTier).toBe("A_PLUS");
    expect(getGlobalReferenceSource("wipo-lex")?.factEligibility).toBe("AUTHORITATIVE_AGGREGATOR");
    expect(getGlobalReferenceSource("wipo-ip-advantage")?.intendedUses).toContain("CASE_LIBRARY");
  });

  it("blocks marketing, benchmark and legacy material from legal fact promotion", () => {
    const legalzoom = getGlobalReferenceSource("legalzoom-trademarks");
    const igerent = getGlobalReferenceSource("igerent-global-trademark-services");
    const legacy = listGlobalReferenceSources({ role: "LEGACY_REFERENCE" });

    expect(legalzoom?.factEligibility).toBe("NONE");
    expect(legalzoom?.contentReusePolicy).toBe("STRUCTURE_AND_TOPIC_ONLY");
    expect(igerent?.factEligibility).toBe("NONE");
    expect(igerent?.contentReusePolicy).toBe("BENCHMARK_ONLY");
    expect(legacy).toHaveLength(2);
    expect(legacy.every((source) => source.authorityTier === "D")).toBe(true);
    expect(legacy.every((source) => source.contentReusePolicy === "LEGACY_CROSSCHECK_ONLY")).toBe(
      true,
    );
  });

  it("adapts curated descriptors into the existing Source Registry instead of a second lifecycle", () => {
    const source = getGlobalReferenceSource("country-index-newsletter");
    expect(source).not.toBeNull();

    const input = toReferenceSourceCreateInput(source!);

    expect(input.slug).toBe("country-index-newsletter");
    expect(input.status).toBe("ACTIVE");
    expect(input.connector).toEqual({ connectorId: "crawl4ai-web", version: "1.0.0" });
    expect(input.extensions?.["x-markorbit-reference-role"]).toBe("TM_CHANGE_SIGNAL");
    expect(input.extensions?.["x-markorbit-reference-verify-official-source"]).toBe(true);
    expect(input.tags).toContain("global-reference-source");
  });
});
