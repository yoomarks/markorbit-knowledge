export type CorpusArchetype =
  | "INDUSTRY_AGGREGATOR"
  | "SINGLE_JURISDICTION_KNOWLEDGE_SYSTEM"
  | "CROSS_JURISDICTION_INTEGRATION_SYSTEM";

export type CorpusDomainDefinition = {
  id: string;
  label: string;
  matchAny: string[];
};

export type CorpusDefinition = {
  id: string;
  displayName: string;
  archetype: CorpusArchetype;
  publicScope: string[];
  excludedScope: string[];
  discoveryHosts: string[];
  domains: CorpusDomainDefinition[];
};

export type CorpusInventoryCandidate = {
  id: string;
  label: string;
  canonicalUri?: string;
  entrypoints?: string[];
  tags?: string[];
};

export type CorpusDomainAudit = {
  domainId: string;
  label: string;
  state: "COVERED" | "GAP";
  candidateIds: string[];
};

export type CorpusCoverageAudit = {
  corpusId: string;
  displayName: string;
  candidateCount: number;
  coveredDomainCount: number;
  domainCount: number;
  coverageRatio: number;
  domains: CorpusDomainAudit[];
  gaps: string[];
};

export const GOLDEN_CORPORA: readonly CorpusDefinition[] = [
  {
    id: "country-index-public-trademark",
    displayName: "Country Index Public Trademark Corpus",
    archetype: "INDUSTRY_AGGREGATOR",
    publicScope: [
      "public jurisdiction and country trademark information",
      "public trademark news and survey updates",
      "public revision and source metadata",
    ],
    excludedScope: [
      "paid Trademark Practitioner's Guide",
      "paid Use Requirements publication",
      "paid Licensing publication",
      "paid Renewal Guide publication",
      "subscriber-only or otherwise access-controlled material",
    ],
    discoveryHosts: ["country-index.com", "www.country-index.com"],
    domains: [
      {
        id: "jurisdiction-basics",
        label: "Public jurisdiction and country basics",
        matchAny: ["country index", "country-index", "jurisdiction", "country information"],
      },
      {
        id: "news-updates",
        label: "Public trademark news and updates",
        matchAny: ["country index news", "country-index news", "survey update", "news"],
      },
    ],
  },
  {
    id: "uspto-trademark-public-knowledge",
    displayName: "USPTO Trademark Public Knowledge Corpus",
    archetype: "SINGLE_JURISDICTION_KNOWLEDGE_SYSTEM",
    publicScope: [
      "public trademark manuals, guides, FAQs and operational guidance",
      "public filing, examination, registration and post-registration materials",
      "public TTAB practice materials, Madrid materials, forms and systems guidance",
      "public videos, training, news, alerts, policy and rule-change materials",
      "current and historical public versions where the USPTO publishes them",
    ],
    excludedScope: ["non-public internal USPTO material"],
    discoveryHosts: ["uspto.gov", "www.uspto.gov", "tmep.uspto.gov"],
    domains: [
      { id: "filing", label: "Filing and application basics", matchAny: ["filing", "apply", "application"] },
      { id: "examination", label: "Examination and Office Action guidance", matchAny: ["examination", "office action", "examining"] },
      { id: "tmep", label: "TMEP current and published history", matchAny: ["tmep", "trademark manual of examining procedure"] },
      { id: "examination-guides", label: "Examination Guides", matchAny: ["examination guide", "exam guide"] },
      { id: "registration", label: "Registration guidance", matchAny: ["registration", "register"] },
      { id: "post-registration", label: "Post-registration and maintenance", matchAny: ["post-registration", "registration maintenance", "section 8", "section 9", "section 71"] },
      { id: "ttab-tbmp", label: "TTAB and TBMP practice materials", matchAny: ["ttab", "tbmp", "trial and appeal board"] },
      { id: "madrid", label: "Madrid Protocol materials", matchAny: ["madrid", "66(a)", "section 66"] },
      { id: "ownership-assignments", label: "Ownership and assignments", matchAny: ["assignment", "ownership", "assignments"] },
      { id: "forms-systems", label: "Forms and systems guidance", matchAny: ["trademark center", "teas", "form", "forms"] },
      { id: "faqs", label: "Trademark FAQs", matchAny: ["faq", "frequently asked"] },
      { id: "training-video", label: "Videos, webinars and training", matchAny: ["video", "webinar", "training"] },
      { id: "news-policy", label: "News, alerts, policy and rule changes", matchAny: ["news", "alert", "policy", "rule change", "federal register"] },
    ],
  },
  {
    id: "wipo-trademark-madrid-public-knowledge",
    displayName: "WIPO Trademark & Madrid Public Knowledge Corpus",
    archetype: "CROSS_JURISDICTION_INTEGRATION_SYSTEM",
    publicScope: [
      "public Madrid System procedures, legal texts, member information and declarations",
      "public fees, forms, classifications, search/status systems, guides and help materials",
      "public trademark and Madrid news and updates",
    ],
    excludedScope: ["non-public WIPO internal material"],
    discoveryHosts: ["wipo.int", "www.wipo.int"],
    domains: [
      { id: "madrid-procedure", label: "Madrid System procedures", matchAny: ["madrid system", "madrid procedure", "madrid"] },
      { id: "legal-texts", label: "Madrid legal texts and rules", matchAny: ["legal text", "regulations", "madrid protocol"] },
      { id: "members", label: "Members, profiles and declarations", matchAny: ["member profile", "contracting party", "declaration"] },
      { id: "fees", label: "Madrid fees", matchAny: ["fee", "fees", "fee calculator"] },
      { id: "forms", label: "Madrid forms", matchAny: ["form", "forms", "mm2"] },
      { id: "nice", label: "Nice Classification", matchAny: ["nice classification", "nice"] },
      { id: "vienna", label: "Vienna Classification", matchAny: ["vienna classification", "vienna"] },
      { id: "global-brand-database", label: "Global Brand Database", matchAny: ["global brand database", "brand database"] },
      { id: "madrid-monitor", label: "Madrid Monitor", matchAny: ["madrid monitor"] },
      { id: "guides-help", label: "Guides and help resources", matchAny: ["guide", "help", "how to"] },
      { id: "news-updates", label: "News and updates", matchAny: ["news", "update", "updates"] },
    ],
  },
] as const;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function searchable(candidate: CorpusInventoryCandidate): string {
  return [
    candidate.id,
    candidate.label,
    candidate.canonicalUri ?? "",
    ...(candidate.entrypoints ?? []),
    ...(candidate.tags ?? []),
  ]
    .join("\n")
    .toLowerCase();
}

function hostMatches(candidate: CorpusInventoryCandidate, hosts: readonly string[]): boolean {
  const uris = [candidate.canonicalUri, ...(candidate.entrypoints ?? [])].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (uris.length === 0) return false;
  return uris.some((raw) => {
    try {
      const hostname = new URL(raw).hostname.toLowerCase();
      return hosts.some(
        (host) => hostname === normalize(host) || hostname.endsWith(`.${normalize(host)}`),
      );
    } catch {
      return false;
    }
  });
}

export function auditCorpusCoverage(
  definition: CorpusDefinition,
  candidates: readonly CorpusInventoryCandidate[],
): CorpusCoverageAudit {
  const scoped = candidates.filter((candidate) => hostMatches(candidate, definition.discoveryHosts));
  const domains: CorpusDomainAudit[] = definition.domains.map((domain) => {
    const matches = scoped.filter((candidate) => {
      const haystack = searchable(candidate);
      return domain.matchAny.some((term) => haystack.includes(normalize(term)));
    });
    return {
      domainId: domain.id,
      label: domain.label,
      state: matches.length > 0 ? "COVERED" : "GAP",
      candidateIds: matches.map((candidate) => candidate.id).sort(),
    };
  });
  const coveredDomainCount = domains.filter((domain) => domain.state === "COVERED").length;
  return {
    corpusId: definition.id,
    displayName: definition.displayName,
    candidateCount: scoped.length,
    coveredDomainCount,
    domainCount: domains.length,
    coverageRatio:
      definition.domains.length === 0 ? 1 : coveredDomainCount / definition.domains.length,
    domains,
    gaps: domains.filter((domain) => domain.state === "GAP").map((domain) => domain.domainId),
  };
}

export function auditGoldenCorpora(
  candidates: readonly CorpusInventoryCandidate[],
): CorpusCoverageAudit[] {
  return GOLDEN_CORPORA.map((definition) => auditCorpusCoverage(definition, candidates));
}
