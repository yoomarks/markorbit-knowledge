import { describe, expect, it } from "vitest";
import {
  WIPO_TRADEMARK_CORPUS_SEEDS,
  extractWipoTrademarkLinks,
  summarizeWipoDomains,
} from "./wipo-public-corpus-discovery";

describe("WIPO public trademark corpus discovery", () => {
  it("keeps declarations, Vienna, and find-and-monitor as explicit independent seeds", () => {
    expect(
      WIPO_TRADEMARK_CORPUS_SEEDS.some((seed) => seed.domain === "DECLARATIONS"),
    ).toBe(true);
    expect(WIPO_TRADEMARK_CORPUS_SEEDS.some((seed) => seed.domain === "VIENNA")).toBe(true);
    expect(
      WIPO_TRADEMARK_CORPUS_SEEDS.some((seed) => seed.domain === "FIND_MONITOR"),
    ).toBe(true);
  });

  it("classifies cross-subdomain WIPO trademark knowledge without admitting external sites", () => {
    const html = `
      <a href="/en/web/madrid-system/members/declarations">Declarations and notifications</a>
      <a href="https://madrid.wipo.int/feecalcapp/">Fee calculator</a>
      <a href="https://branddb.wipo.int/en/">Global Brand Database</a>
      <a href="https://nclpub.wipo.int/enfr/">Nice Classification</a>
      <a href="/en/web/classification-vienna">Vienna Classification</a>
      <a href="https://example.com/madrid">External Madrid page</a>
    `;
    const links = extractWipoTrademarkLinks(html, "https://www.wipo.int/en/web/madrid-system/");
    const counts = summarizeWipoDomains(links);

    expect(links).toHaveLength(5);
    expect(counts.DECLARATIONS).toBe(1);
    expect(counts.FEES).toBe(1);
    expect(counts.GLOBAL_BRAND_DATABASE).toBe(1);
    expect(counts.NICE).toBe(1);
    expect(counts.VIENNA).toBe(1);
  });

  it("does not let the Madrid root stand in for the cross-system corpus", () => {
    const links = extractWipoTrademarkLinks(
      '<a href="/en/web/madrid-system/">Madrid System</a>',
      "https://www.wipo.int/",
    );
    const counts = summarizeWipoDomains(links);
    expect(counts.MADRID_SYSTEM).toBe(1);
    expect(counts.DECLARATIONS).toBe(0);
    expect(counts.MEMBER_PROFILES).toBe(0);
    expect(counts.GLOBAL_BRAND_DATABASE).toBe(0);
    expect(counts.NICE).toBe(0);
    expect(counts.VIENNA).toBe(0);
  });
});
