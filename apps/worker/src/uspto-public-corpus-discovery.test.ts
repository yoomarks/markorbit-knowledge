import { describe, expect, it } from "vitest";

import {
  USPTO_TRADEMARK_CORPUS_SEEDS,
  extractUsptoTrademarkLinks,
  summarizeUsptoDomains,
} from "./uspto-public-corpus-discovery";

describe("USPTO public trademark corpus discovery", () => {
  it("keeps independent knowledge trees as explicit seeds", () => {
    const domains = new Set(USPTO_TRADEMARK_CORPUS_SEEDS.map((seed) => seed.domain));
    for (const required of [
      "FEE",
      "TMEP",
      "TMEP_ARCHIVE",
      "EXAMINATION_GUIDES",
      "POST_REGISTRATION",
      "TTAB_TBMP",
      "MADRID",
      "FAQ",
      "TRAINING_VIDEO",
      "LAWS_POLICY",
    ]) {
      expect(domains.has(required as never)).toBe(true);
    }

    expect(
      USPTO_TRADEMARK_CORPUS_SEEDS.find((seed) => seed.domain === "FEE"),
    ).toEqual({
      domain: "FEE",
      uri: "https://www.uspto.gov/trademarks/trademark-fee-information",
      label: "Trademark fee information",
    });
  });

  it("classifies observed official trademark links by knowledge domain", () => {
    const html = `
      <a href="/trademarks/trademark-fee-information">Trademark fee information</a>
      <a href="/trademarks/guides-and-manuals/tmep-archives">TMEP files and archives</a>
      <a href="/trademarks/guides-and-manuals/trademark-examination-guides">Trademark examination guides</a>
      <a href="/trademarks/maintain/post-registration-faqs">Post-Registration FAQs</a>
      <a href="/trademarks/trademark-trial-and-appeal-board">TTAB</a>
      <a href="/trademarks/laws/madrid-protocol">Madrid Protocol</a>
      <a href="/trademarks/videos">Trademark videos</a>
      <a href="/trademarks/apply/trademark-center-updates-and-training">Trademark Center updates and training</a>
      <a href="/trademarks/laws/rule-making">Rule making</a>
      <a href="https://example.com/trademarks/videos">External</a>
    `;

    const links = extractUsptoTrademarkLinks(html, "https://www.uspto.gov/trademarks");
    const counts = summarizeUsptoDomains(links);

    expect(counts.FEE).toBe(1);
    expect(counts.TMEP_ARCHIVE).toBe(1);
    expect(counts.EXAMINATION_GUIDES).toBe(1);
    expect(counts.POST_REGISTRATION).toBe(1);
    expect(counts.TTAB_TBMP).toBe(1);
    expect(counts.MADRID).toBe(1);
    expect(counts.TRAINING_VIDEO).toBe(1);
    expect(counts.FORMS_SYSTEMS).toBe(1);
    expect(counts.LAWS_POLICY).toBe(1);
    expect(links).toHaveLength(9);
  });

  it("accepts official USPTO subdomains but rejects non-trademark paths", () => {
    const html = `
      <a href="https://tmep.uspto.gov/RDMS/TMEP/current">TMEP current</a>
      <a href="https://www.uspto.gov/patents/basics">Patent basics</a>
    `;
    const links = extractUsptoTrademarkLinks(html, "https://www.uspto.gov/trademarks");
    expect(links).toHaveLength(1);
    expect(links[0]?.domain).toBe("TMEP");
  });
});
