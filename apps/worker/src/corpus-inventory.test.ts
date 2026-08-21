import { describe, expect, it } from "vitest";

import {
  GOLDEN_CORPORA,
  auditCorpusCoverage,
  type CorpusInventoryCandidate,
} from "./corpus-inventory";

function corpus(id: string) {
  const match = GOLDEN_CORPORA.find((value) => value.id === id);
  if (!match) throw new Error(`Missing golden corpus ${id}`);
  return match;
}

describe("golden corpus inventory", () => {
  it("keeps Country Index paid publications outside the public acceptance scope", () => {
    const definition = corpus("country-index-public-trademark");
    expect(definition.publicScope).toContain("public trademark news and survey updates");
    expect(definition.excludedScope).toContain("paid Trademark Practitioner's Guide");
    expect(definition.excludedScope).toContain("paid Use Requirements publication");
    expect(definition.excludedScope).toContain("paid Licensing publication");
    expect(definition.excludedScope).toContain("paid Renewal Guide publication");
  });

  it("reports knowledge-domain gaps instead of treating one USPTO page as corpus ready", () => {
    const candidates: CorpusInventoryCandidate[] = [
      {
        id: "us-uspto-tmep-current",
        label: "USPTO TMEP Current",
        canonicalUri: "https://tmep.uspto.gov/RDMS/TMEP/current",
      },
      {
        id: "us-uspto-registration-maintenance",
        label: "USPTO Registration Maintenance",
        canonicalUri: "https://www.uspto.gov/trademarks/maintain",
      },
    ];

    const audit = auditCorpusCoverage(corpus("uspto-trademark-public-knowledge"), candidates);

    expect(audit.candidateCount).toBe(2);
    expect(audit.domains.find((value) => value.domainId === "tmep")?.state).toBe("COVERED");
    expect(audit.domains.find((value) => value.domainId === "post-registration")?.state).toBe(
      "COVERED",
    );
    expect(audit.domains.find((value) => value.domainId === "ttab-tbmp")?.state).toBe("GAP");
    expect(audit.coverageRatio).toBeLessThan(1);
  });

  it("does not let candidates from another host satisfy a corpus domain", () => {
    const candidates: CorpusInventoryCandidate[] = [
      {
        id: "third-party-madrid-monitor",
        label: "Madrid Monitor news",
        canonicalUri: "https://example.com/madrid-monitor",
      },
    ];

    const audit = auditCorpusCoverage(corpus("wipo-trademark-madrid-public-knowledge"), candidates);

    expect(audit.candidateCount).toBe(0);
    expect(audit.coveredDomainCount).toBe(0);
    expect(audit.gaps).toContain("madrid-monitor");
  });
});
