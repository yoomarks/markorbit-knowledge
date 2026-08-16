import {
  SOURCE_COVERAGE_PROTOCOL_VERSION,
  type SourceCoverageCatalogState,
  type SourceCoverageChangeSensitivity,
  type SourceCoverageFamily,
  type SourceCoverageTarget,
  type SourceCoverageTier,
} from "@markorbit/contracts";

const VERIFIED_AT = "2026-08-16T00:00:00Z";

type Authority = {
  jurisdiction: string;
  authorityName: string;
  languages: string[];
  verificationEvidenceUri: string;
};

type TargetInput = {
  id: string;
  family: SourceCoverageFamily;
  displayName: string;
  canonicalUri: string;
  entrypoints?: SourceCoverageTarget["entrypoints"];
  coverageTier?: SourceCoverageTier;
  catalogState?: SourceCoverageCatalogState;
  changeSensitivity?: SourceCoverageChangeSensitivity;
  mode?: SourceCoverageTarget["acquisition"]["mode"];
  renderJavascriptHint?: boolean;
  fetchAttachmentsHint?: boolean;
  expectedArtifactKinds?: SourceCoverageTarget["acquisition"]["expectedArtifactKinds"];
  verificationEvidenceUri?: string;
  notes?: string;
};

function target(authority: Authority, input: TargetInput): SourceCoverageTarget {
  return {
    protocolVersion: SOURCE_COVERAGE_PROTOCOL_VERSION,
    objectType: "SOURCE_COVERAGE_TARGET",
    jurisdiction: authority.jurisdiction,
    authorityName: authority.authorityName,
    authorityBasis: "EXPLICIT_CURATED",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    languages: [...authority.languages],
    catalogState: input.catalogState ?? "ACTIVE",
    coverageTier: input.coverageTier ?? "FOUNDATIONAL",
    changeSensitivity: input.changeSensitivity ?? "HIGH",
    verifiedAt: VERIFIED_AT,
    id: input.id,
    family: input.family,
    displayName: input.displayName,
    canonicalUri: input.canonicalUri,
    entrypoints: input.entrypoints ?? [{ uri: input.canonicalUri }],
    acquisition: {
      mode: input.mode ?? "WEB_CRAWL",
      renderJavascriptHint: input.renderJavascriptHint ?? false,
      fetchAttachmentsHint: input.fetchAttachmentsHint ?? false,
      expectedArtifactKinds: input.expectedArtifactKinds ?? ["HTML", "MARKDOWN"],
    },
    verificationEvidenceUri: input.verificationEvidenceUri ?? authority.verificationEvidenceUri,
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

const CNIPA: Authority = {
  jurisdiction: "CN",
  authorityName: "China National Intellectual Property Administration",
  languages: ["zh-CN"],
  verificationEvidenceUri: "https://www.cnipa.gov.cn/",
};

export const CNIPA_SOURCE_COVERAGE_TARGETS = [
  target(CNIPA, {
    id: "cn-cnipa-trademark-portal",
    family: "PORTAL",
    displayName: "CNIPA China Trademark Office Portal",
    canonicalUri: "https://sbj.cnipa.gov.cn/",
    verificationEvidenceUri: "https://www.cnipa.gov.cn/",
  }),
  target(CNIPA, {
    id: "cn-cnipa-trademark-filing-guide",
    family: "FILING",
    displayName: "CNIPA Trademark Registration Application Guide",
    canonicalUri: "https://www.cnipa.gov.cn/art/2020/12/21/art_2488_155734.html",
  }),
  target(CNIPA, {
    id: "cn-cnipa-trademark-search",
    family: "SEARCH",
    displayName: "CNIPA Trademark Search",
    canonicalUri: "https://sbj.cnipa.gov.cn/sbj/sbcx/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.cnipa.gov.cn/",
  }),
  target(CNIPA, {
    id: "cn-cnipa-trademark-fees",
    family: "FEES",
    displayName: "CNIPA Trademark Fees and Payment Guide",
    canonicalUri: "https://sbj.cnipa.gov.cn/sbj/sbsq/sqzn/201912/t20191227_611.html",
    verificationEvidenceUri: "https://sbj.cnipa.gov.cn/sbj/sbsq/sqzn/201912/t20191227_611.html",
  }),
  target(CNIPA, {
    id: "cn-cnipa-trademark-examination-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "CNIPA Trademark Examination and Adjudication Guidelines",
    canonicalUri: "https://www.cnipa.gov.cn/art/2021/11/22/art_74_171575.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
  }),
  target(CNIPA, {
    id: "cn-cnipa-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Trademark Law of the People's Republic of China",
    canonicalUri: "https://www.cnipa.gov.cn/art/2026/6/26/art_95_206942.html",
    verificationEvidenceUri: "https://www.cnipa.gov.cn/art/2026/6/26/art_95_206942.html",
  }),
] satisfies readonly SourceCoverageTarget[];

const JPO: Authority = {
  jurisdiction: "JP",
  authorityName: "Japan Patent Office",
  languages: ["en"],
  verificationEvidenceUri: "https://www.jpo.go.jp/e/system/trademark/gaiyo/trademark.html",
};

export const JPO_SOURCE_COVERAGE_TARGETS = [
  target(JPO, {
    id: "jp-jpo-trademark-procedures",
    family: "PORTAL",
    displayName: "JPO Procedures for Obtaining a Trademark Right",
    canonicalUri: "https://www.jpo.go.jp/e/system/trademark/gaiyo/trademark.html",
  }),
  target(JPO, {
    id: "jp-jpo-trademark-step-by-step",
    family: "FILING",
    displayName: "JPO Step-by-step Guide for Trademark",
    canonicalUri: "https://www.jpo.go.jp/e/system/professionals/step-by-step-trademark.html",
  }),
  target(JPO, {
    id: "jp-jpo-fees",
    family: "FEES",
    displayName: "JPO Schedule of Fees",
    canonicalUri: "https://www.jpo.go.jp/e/system/process/tesuryo/hyou.html",
    verificationEvidenceUri: "https://www.jpo.go.jp/e/system/process/tesuryo/hyou.html",
  }),
  target(JPO, {
    id: "jp-jpo-trademark-examination-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "JPO Examination Guidelines for Trademarks",
    canonicalUri: "https://www.jpo.go.jp/e/system/laws/rule/guideline/trademark/kijun/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.jpo.go.jp/e/system/laws/rule/guideline/trademark/kijun/",
  }),
  target(JPO, {
    id: "jp-jpo-similar-goods-services-guidelines",
    family: "GOODS_SERVICES_ID",
    displayName: "JPO Examination Guidelines for Similar Goods and Services",
    canonicalUri:
      "https://www.jpo.go.jp/e/system/laws/rule/guideline/trademark/ruiji-kijun/ruiji_kijun13-2026.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.jpo.go.jp/e/system/laws/rule/guideline/trademark/ruiji-kijun/ruiji_kijun13-2026.html",
  }),
] satisfies readonly SourceCoverageTarget[];

const MOIP_KR: Authority = {
  jurisdiction: "KR",
  authorityName: "Ministry of Intellectual Property (Republic of Korea)",
  languages: ["en"],
  verificationEvidenceUri: "https://www.kipo.go.kr/en/",
};

export const KOREA_SOURCE_COVERAGE_TARGETS = [
  target(MOIP_KR, {
    id: "kr-moip-trademark-system",
    family: "PORTAL",
    displayName: "Korean Trademark System",
    canonicalUri: "https://www.kipo.go.kr/en/HtmlApp?c=9300010&catmenu=ek04_01_01",
    verificationEvidenceUri: "https://www.kipo.go.kr/en/HtmlApp?c=9300010&catmenu=ek04_01_01",
  }),
  target(MOIP_KR, {
    id: "kr-moip-trademark-application-procedure",
    family: "FILING",
    displayName: "Korean Trademark Application Procedure",
    canonicalUri: "https://www.kipo.go.kr/en/HtmlApp?atmenu=ek04_02_01&c=30103",
    verificationEvidenceUri: "https://www.kipo.go.kr/en/HtmlApp?atmenu=ek04_02_01&c=30103",
  }),
  target(MOIP_KR, {
    id: "kr-moip-trademark-fees",
    family: "FEES",
    displayName: "Korean Trademark Fees and Payments",
    canonicalUri: "https://www.kipo.go.kr/en/HtmlApp?c=93006&catmenu=ek04_04_01",
    verificationEvidenceUri: "https://www.kipo.go.kr/en/HtmlApp?c=93006&catmenu=ek04_04_01",
  }),
  target(MOIP_KR, {
    id: "kr-moip-trademark-laws",
    family: "LEGAL_TEXTS",
    displayName: "Korean Trademark Laws and Regulations",
    canonicalUri: "https://www.kipo.go.kr/en/HtmlApp?c=93007&catmenu=ek04050",
    verificationEvidenceUri: "https://www.kipo.go.kr/en/HtmlApp?c=93007&catmenu=ek04050",
    notes: "English translations are informational; the Korean text remains authoritative.",
  }),
  target(MOIP_KR, {
    id: "kr-moip-trademark-trials-appeals",
    family: "APPEALS_AND_CASELAW",
    displayName: "Korean Trademark Trials and Appeals",
    canonicalUri: "https://www.kipo.go.kr/en/HtmlApp?c=93008",
    verificationEvidenceUri: "https://www.kipo.go.kr/en/HtmlApp?c=93008",
  }),
] satisfies readonly SourceCoverageTarget[];

const UKIPO: Authority = {
  jurisdiction: "GB",
  authorityName: "UK Intellectual Property Office",
  languages: ["en-GB"],
  verificationEvidenceUri: "https://www.gov.uk/how-to-register-a-trade-mark",
};

export const UKIPO_SOURCE_COVERAGE_TARGETS = [
  target(UKIPO, {
    id: "gb-ukipo-register-trademark",
    family: "PORTAL",
    displayName: "UKIPO Register a Trade Mark Guide",
    canonicalUri: "https://www.gov.uk/how-to-register-a-trade-mark",
  }),
  target(UKIPO, {
    id: "gb-ukipo-trademark-filing",
    family: "FILING",
    displayName: "UKIPO Trade Mark Application",
    canonicalUri: "https://www.gov.uk/how-to-register-a-trade-mark/start-your-application",
    verificationEvidenceUri:
      "https://www.gov.uk/how-to-register-a-trade-mark/start-your-application",
  }),
  target(UKIPO, {
    id: "gb-ukipo-trademark-search",
    family: "SEARCH",
    displayName: "UKIPO Search for a Trade Mark",
    canonicalUri: "https://www.gov.uk/search-for-trademark",
    entrypoints: [
      { uri: "https://www.gov.uk/search-for-trademark", label: "Search guidance" },
      { uri: "https://trademarks.ipo.gov.uk/ipo-tmcase/start", label: "Trade mark number search" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.gov.uk/search-for-trademark",
  }),
  target(UKIPO, {
    id: "gb-ukipo-trademark-forms-fees",
    family: "FEES",
    displayName: "UKIPO Trade Mark Forms and Fees",
    canonicalUri:
      "https://www.gov.uk/government/publications/trade-mark-forms-and-fees/trade-mark-forms-and-fees",
    verificationEvidenceUri:
      "https://www.gov.uk/government/publications/trade-mark-forms-and-fees/trade-mark-forms-and-fees",
  }),
  target(UKIPO, {
    id: "gb-ukipo-trademark-timeline",
    family: "FILING",
    displayName: "UKIPO Trade Marks Timeline",
    canonicalUri:
      "https://www.gov.uk/government/publications/process-for-applying-to-register-for-a-trade-mark/trade-marks-timeline",
    changeSensitivity: "NORMAL",
    verificationEvidenceUri:
      "https://www.gov.uk/government/publications/process-for-applying-to-register-for-a-trade-mark/trade-marks-timeline",
  }),
  target(UKIPO, {
    id: "gb-ukipo-trademark-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "UKIPO Trade Marks Journal",
    canonicalUri: "https://www.gov.uk/check-trade-marks-journal",
    entrypoints: [
      { uri: "https://www.gov.uk/check-trade-marks-journal", label: "Journal guidance" },
      { uri: "https://www.ipo.gov.uk/t-tmj.htm", label: "Current journal" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.gov.uk/check-trade-marks-journal",
  }),
] satisfies readonly SourceCoverageTarget[];

const IP_AUSTRALIA: Authority = {
  jurisdiction: "AU",
  authorityName: "IP Australia",
  languages: ["en-AU"],
  verificationEvidenceUri: "https://www.ipaustralia.gov.au/trade-marks",
};

export const IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS = [
  target(IP_AUSTRALIA, {
    id: "au-ipaustralia-trademarks",
    family: "PORTAL",
    displayName: "IP Australia Trade Marks",
    canonicalUri: "https://www.ipaustralia.gov.au/trade-marks",
  }),
  target(IP_AUSTRALIA, {
    id: "au-ipaustralia-trademark-search",
    family: "SEARCH",
    displayName: "Australian Trade Mark Search",
    canonicalUri: "https://search.ipaustralia.gov.au/trademarks/search",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.ipaustralia.gov.au/trade-marks",
  }),
  target(IP_AUSTRALIA, {
    id: "au-ipaustralia-trademark-fees-timeframes",
    family: "FEES",
    displayName: "IP Australia Trade Mark Timeframes and Fees",
    canonicalUri: "https://www.ipaustralia.gov.au/trade-marks/timeframes-and-fees",
    verificationEvidenceUri: "https://www.ipaustralia.gov.au/trade-marks/timeframes-and-fees",
  }),
  target(IP_AUSTRALIA, {
    id: "au-ipaustralia-trademark-filing",
    family: "FILING",
    displayName: "IP Australia How to Apply for a Trade Mark",
    canonicalUri: "https://www.ipaustralia.gov.au/trade-marks/how-to-apply-for-a-trade-mark",
    verificationEvidenceUri:
      "https://www.ipaustralia.gov.au/trade-marks/how-to-apply-for-a-trade-mark",
  }),
  target(IP_AUSTRALIA, {
    id: "au-ipaustralia-trademark-manual",
    family: "EXAMINATION_MANUAL",
    displayName: "Trade Marks Manual of Practice and Procedure",
    canonicalUri: "https://manuals.ipaustralia.gov.au/trademark",
    verificationEvidenceUri: "https://www.ipaustralia.gov.au/trade-marks",
  }),
  target(IP_AUSTRALIA, {
    id: "au-ipaustralia-goods-services-picklist",
    family: "GOODS_SERVICES_ID",
    displayName: "IP Australia Trade Marks Classification Search",
    canonicalUri: "https://tmgns.search.ipaustralia.gov.au/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.ipaustralia.gov.au/trade-marks",
  }),
] satisfies readonly SourceCoverageTarget[];

const IPOS: Authority = {
  jurisdiction: "SG",
  authorityName: "Intellectual Property Office of Singapore",
  languages: ["en-SG"],
  verificationEvidenceUri: "https://www.ipos.gov.sg/about-ip/trade-marks/introduction-trade-marks/",
};

export const IPOS_SOURCE_COVERAGE_TARGETS = [
  target(IPOS, {
    id: "sg-ipos-trademarks",
    family: "PORTAL",
    displayName: "IPOS Introduction to Trade Marks",
    canonicalUri: "https://www.ipos.gov.sg/about-ip/trade-marks/introduction-trade-marks/",
  }),
  target(IPOS, {
    id: "sg-ipos-trademark-registration",
    family: "FILING",
    displayName: "IPOS How to Register Trade Marks",
    canonicalUri: "https://www.ipos.gov.sg/about-ip/trade-marks/how-to-register/",
    verificationEvidenceUri: "https://www.ipos.gov.sg/about-ip/trade-marks/how-to-register/",
  }),
  target(IPOS, {
    id: "sg-ipos-trademark-search",
    family: "SEARCH",
    displayName: "IPOS Digital Hub Trade Mark Search and Enquiry",
    canonicalUri: "https://digitalhub.ipos.gov.sg/FAMN/eservice/IP4SG/MN_AdvancedSearch",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.ipos.gov.sg/about-ip/trade-marks/introduction-trade-marks/",
  }),
  target(IPOS, {
    id: "sg-ipos-trademark-forms-fees",
    family: "FEES",
    displayName: "IPOS Trade Mark Forms and Fees",
    canonicalUri: "https://www.ipos.gov.sg/about-ip/trade-marks/forms-and-fees/",
    verificationEvidenceUri: "https://www.ipos.gov.sg/about-ip/trade-marks/forms-and-fees/",
  }),
  target(IPOS, {
    id: "sg-ipos-trademark-guides-work-manual",
    family: "EXAMINATION_MANUAL",
    displayName: "IPOS Trade Marks Guides and Work Manual",
    canonicalUri: "https://www.ipos.gov.sg/about-ip/trade-marks/tm-guides/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.ipos.gov.sg/about-ip/trade-marks/tm-guides/",
  }),
  target(IPOS, {
    id: "sg-ipos-trademark-circulars-practice-directions",
    family: "POLICY_NOTICES",
    displayName: "IPOS Trade Mark Circulars and Practice Directions",
    canonicalUri: "https://www.ipos.gov.sg/about-ip/trade-marks/circulars-and-practice-directions/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ipos.gov.sg/about-ip/trade-marks/circulars-and-practice-directions/",
  }),
] satisfies readonly SourceCoverageTarget[];

const DPMA: Authority = {
  jurisdiction: "DE",
  authorityName: "German Patent and Trade Mark Office",
  languages: ["de-DE", "en"],
  verificationEvidenceUri: "https://www.dpma.de/english/trade_marks/",
};

export const DPMA_SOURCE_COVERAGE_TARGETS = [
  target(DPMA, {
    id: "de-dpma-trademarks",
    family: "PORTAL",
    displayName: "DPMA Trade Marks",
    canonicalUri: "https://www.dpma.de/english/trade_marks/",
  }),
  target(DPMA, {
    id: "de-dpma-trademark-filing",
    family: "FILING",
    displayName: "DPMA Required Data for Filing a Trade Mark Application",
    canonicalUri:
      "https://www.dpma.de/english/trade_marks/application/required_data_for_filing_an_application/index.html",
    verificationEvidenceUri:
      "https://www.dpma.de/english/trade_marks/application/required_data_for_filing_an_application/index.html",
  }),
  target(DPMA, {
    id: "de-dpma-trademark-search",
    family: "SEARCH",
    displayName: "DPMA Trade Mark Search Guidance",
    canonicalUri: "https://www.dpma.de/english/trade_marks/trade_mark_search/",
    entrypoints: [
      {
        uri: "https://www.dpma.de/english/trade_marks/trade_mark_search/",
        label: "Trade mark search guidance",
      },
      { uri: "https://www.dpma.de/english/search/dpmaregister/", label: "DPMAregister guidance" },
    ],
    verificationEvidenceUri: "https://www.dpma.de/english/search/dpmaregister/",
  }),
  target(DPMA, {
    id: "de-dpma-trademark-fees",
    family: "FEES",
    displayName: "DPMA Trade Mark Fees",
    canonicalUri: "https://www.dpma.de/english/services/fees/trademarks/index.html",
    verificationEvidenceUri: "https://www.dpma.de/english/services/fees/trademarks/index.html",
  }),
  target(DPMA, {
    id: "de-dpma-trademark-law-guidelines",
    family: "LEGAL_TEXTS",
    displayName: "DPMA Trade Mark Law and Guidelines",
    canonicalUri: "https://www.dpma.de/english/our_office/law/index.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.dpma.de/english/our_office/law/index.html",
    notes:
      "The official law page links the Trade Mark Act and Ordinance plus German-language examination and opposition guidelines.",
  }),
  target(DPMA, {
    id: "de-dpma-trademark-forms",
    family: "FILING",
    displayName: "DPMA Trade Mark Forms and Applicant Information",
    canonicalUri: "https://www.dpma.de/english/services/forms/trade_marks/index.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.dpma.de/english/services/forms/trade_marks/index.html",
  }),
  target(DPMA, {
    id: "de-dpma-important-notices",
    family: "POLICY_NOTICES",
    displayName: "DPMA Important Notices",
    canonicalUri:
      "https://www.dpma.de/english/our_office/publications/important_notices/index.html",
    coverageTier: "CHANGE_SIGNAL",
    verificationEvidenceUri:
      "https://www.dpma.de/english/our_office/publications/important_notices/index.html",
  }),
] satisfies readonly SourceCoverageTarget[];

const IP_INDIA: Authority = {
  jurisdiction: "IN",
  authorityName: "Office of the Controller General of Patents, Designs and Trade Marks",
  languages: ["en-IN", "hi-IN"],
  verificationEvidenceUri: "https://ipindia.gov.in/basics-of-trademarks",
};

export const IP_INDIA_SOURCE_COVERAGE_TARGETS = [
  target(IP_INDIA, {
    id: "in-ipindia-trademarks",
    family: "PORTAL",
    displayName: "IP India Basics of Trademarks",
    canonicalUri: "https://ipindia.gov.in/basics-of-trademarks",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-filing-process",
    family: "FILING",
    displayName: "IP India Trade Mark Filing Process",
    canonicalUri: "https://ipindia.gov.in/trade-marks-learn-filing-process-step-by-step",
    verificationEvidenceUri: "https://ipindia.gov.in/trade-marks-learn-filing-process-step-by-step",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-search",
    family: "SEARCH",
    displayName: "IP India Search Existing Trademarks",
    canonicalUri: "https://ipindia.gov.in/trade-marks-before-you-apply-search-existing-trademarks",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://ipindia.gov.in/trade-marks-before-you-apply-search-existing-trademarks",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-forms-fees",
    family: "FEES",
    displayName: "IP India Trade Mark Forms and Official Fees",
    canonicalUri: "https://ipindia.gov.in/pages/trade-marks/learn/forms-and-official-fees",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://ipindia.gov.in/pages/trade-marks/learn/forms-and-official-fees",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-act",
    family: "LEGAL_TEXTS",
    displayName: "IP India Trade Marks Act",
    canonicalUri: "https://ipindia.gov.in/trade-marks-resources-act",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ipindia.gov.in/trade-marks-resources-act",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-rules",
    family: "LEGAL_TEXTS",
    displayName: "IP India Trade Marks Rules",
    canonicalUri: "https://ipindia.gov.in/trade-marks-resources-rules",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ipindia.gov.in/trade-marks-resources-rules",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-manual",
    family: "EXAMINATION_MANUAL",
    displayName: "IP India Trade Marks Practice and Procedure Manual",
    canonicalUri: "https://ipindia.gov.in/trade-marks-resources-manual",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ipindia.gov.in/trade-marks-resources-manual",
    notes:
      "As verified on 2026-08-16, the official page publishes draft Trade Marks Practice and Procedure manual materials.",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-guidelines",
    family: "POLICY_NOTICES",
    displayName: "IP India Trade Mark Guidelines and SOPs",
    canonicalUri: "https://ipindia.gov.in/trade-marks-resources-guidelines",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ipindia.gov.in/trade-marks-resources-guidelines",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "IP India Trade Marks Journal",
    canonicalUri: "https://search.ipindia.gov.in/IPOJournal/Journal/Trademark",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF", "IMAGE"],
    verificationEvidenceUri: "https://search.ipindia.gov.in/IPOJournal/Journal/Trademark",
  }),
] satisfies readonly SourceCoverageTarget[];

const INPI_FR: Authority = {
  jurisdiction: "FR",
  authorityName: "Institut national de la propriété industrielle",
  languages: ["fr-FR"],
  verificationEvidenceUri:
    "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/depot-de-marque",
};

export const INPI_FR_SOURCE_COVERAGE_TARGETS = [
  target(INPI_FR, {
    id: "fr-inpi-trademark-portal",
    family: "PORTAL",
    displayName: "INPI Dépôt de marque",
    canonicalUri: "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/depot-de-marque",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-filing",
    family: "FILING",
    displayName: "INPI Déposer sa marque",
    canonicalUri:
      "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/deposer-sa-marque",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/deposer-sa-marque",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-search",
    family: "SEARCH",
    displayName: "INPI Recherche dans la base Marques",
    canonicalUri:
      "https://www.inpi.fr/ressources/propriete-intellectuelle/rechercher-une-marque-base-marques",
    entrypoints: [
      {
        uri: "https://www.inpi.fr/ressources/propriete-intellectuelle/rechercher-une-marque-base-marques",
        label: "Base Marques guidance",
      },
      {
        uri: "https://data.inpi.fr/recherche_avancee/marques",
        label: "DATA INPI advanced trade mark search",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.inpi.fr/ressources/propriete-intellectuelle/rechercher-une-marque-base-marques",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-fees",
    family: "FEES",
    displayName: "INPI Tarifs des procédures et prestations",
    canonicalUri:
      "https://www.inpi.fr/ressources/propriete-intellectuelle/tarifs-procedures-et-prestations-de-linpi",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.inpi.fr/ressources/propriete-intellectuelle/tarifs-procedures-et-prestations-de-linpi",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-goods-services",
    family: "GOODS_SERVICES_ID",
    displayName: "INPI Choix des produits et services pour une marque",
    canonicalUri:
      "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/choix-produits-et-services-pour-ma-marque",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/choix-produits-et-services-pour-ma-marque",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-directives",
    family: "EXAMINATION_MANUAL",
    displayName: "INPI Directives marques",
    canonicalUri: "https://www.inpi.fr/ressources/propriete-intellectuelle/directives",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.inpi.fr/ressources/propriete-intellectuelle/directives",
    notes:
      "The official directives page publishes current trade mark registration, international registration, renewal, invalidity/revocation and opposition directives.",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-opposition",
    family: "PROCEEDINGS",
    displayName: "INPI Opposition à l'enregistrement d'une marque",
    canonicalUri:
      "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/sopposer-lenregistrement-dune-marque",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/sopposer-lenregistrement-dune-marque",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-bopi",
    family: "OFFICIAL_GAZETTE",
    displayName: "INPI Bulletin officiel de la propriété industrielle - Marques",
    canonicalUri:
      "https://www.inpi.fr/ressources/propriete-intellectuelle/bulletins-officiels-de-pi-bopi",
    entrypoints: [
      {
        uri: "https://www.inpi.fr/ressources/propriete-intellectuelle/bulletins-officiels-de-pi-bopi",
        label: "BOPI guidance",
      },
      {
        uri: "https://data.inpi.fr/recherche_avancee/bopi/marques",
        label: "DATA INPI BOPI Marques search",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF", "JSON"],
    verificationEvidenceUri:
      "https://www.inpi.fr/ressources/propriete-intellectuelle/bulletins-officiels-de-pi-bopi",
  }),
] satisfies readonly SourceCoverageTarget[];

const INPI_BR: Authority = {
  jurisdiction: "BR",
  authorityName: "Instituto Nacional da Propriedade Industrial (Brazil)",
  languages: ["pt-BR"],
  verificationEvidenceUri: "https://www.gov.br/inpi/pt-br/servicos/marcas",
};

export const INPI_BR_SOURCE_COVERAGE_TARGETS = [
  target(INPI_BR, {
    id: "br-inpi-trademarks",
    family: "PORTAL",
    displayName: "Brazil INPI Trademarks",
    canonicalUri: "https://www.gov.br/inpi/pt-br/servicos/marcas",
  }),
  target(INPI_BR, {
    id: "br-inpi-trademark-filing-guide",
    family: "FILING",
    displayName: "Brazil INPI Trademark Filing Guide",
    canonicalUri: "https://www.gov.br/inpi/pt-br/servicos/marcas/guia-basico/guia-basico",
    verificationEvidenceUri:
      "https://www.gov.br/inpi/pt-br/servicos/marcas/guia-basico/guia-basico",
  }),
  target(INPI_BR, {
    id: "br-inpi-trademark-search",
    family: "SEARCH",
    displayName: "Brazil INPI Trademark Search (pePI)",
    canonicalUri: "https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_num_processo.jsp",
    entrypoints: [
      {
        uri: "https://www.gov.br/inpi/pt-br/servicos/marcas/guia-basico/guia-basico",
        label: "Trademark search guidance",
      },
      {
        uri: "https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_num_processo.jsp",
        label: "pePI trademark search",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML"],
    verificationEvidenceUri: "https://busca.inpi.gov.br/pePI/",
  }),
  target(INPI_BR, {
    id: "br-inpi-trademark-costs",
    family: "FEES",
    displayName: "Brazil INPI Trademark Costs and Payment",
    canonicalUri: "https://www.gov.br/inpi/pt-br/servicos/marcas/custos",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gov.br/inpi/pt-br/servicos/marcas/custos",
  }),
  target(INPI_BR, {
    id: "br-inpi-trademark-manual",
    family: "EXAMINATION_MANUAL",
    displayName: "Brazil INPI Trademark Manual",
    canonicalUri: "https://manualdemarcas.inpi.gov.br/projects/manual/wiki/Manual_de_Marcas",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://manualdemarcas.inpi.gov.br/projects/manual/wiki/Manual_de_Marcas",
  }),
  target(INPI_BR, {
    id: "br-inpi-trademark-legislation",
    family: "LEGAL_TEXTS",
    displayName: "Brazil INPI Trademark Legislation",
    canonicalUri: "https://www.gov.br/inpi/pt-br/servicos/marcas/legislacao",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gov.br/inpi/pt-br/servicos/marcas/legislacao",
  }),
  target(INPI_BR, {
    id: "br-inpi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Brazil INPI Trademark Classification",
    canonicalUri: "https://www.gov.br/inpi/pt-br/servicos/marcas/classificacao-marcas",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gov.br/inpi/pt-br/servicos/marcas/classificacao-marcas",
  }),
  target(INPI_BR, {
    id: "br-inpi-trademark-appeals-nullity",
    family: "APPEALS_AND_CASELAW",
    displayName: "Brazil INPI Trademark Appeals and Nullity",
    canonicalUri: "https://www.gov.br/inpi/pt-br/servicos/recursos-e-nulidades",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gov.br/inpi/pt-br/servicos/recursos-e-nulidades",
  }),
  target(INPI_BR, {
    id: "br-inpi-rpi-marks",
    family: "OFFICIAL_GAZETTE",
    displayName: "Brazil INPI Revista da Propriedade Industrial - Marcas",
    canonicalUri: "https://revistas.inpi.gov.br/rpi/",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: false,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF", "XML", "TEXT"],
    verificationEvidenceUri: "https://revistas.inpi.gov.br/rpi/",
    notes:
      "The official RPI publishes the complete weekly industrial property journal and a dedicated Marcas section in downloadable formats.",
  }),
] satisfies readonly SourceCoverageTarget[];

const CIPO: Authority = {
  jurisdiction: "CA",
  authorityName: "Canadian Intellectual Property Office",
  languages: ["en-CA"],
  verificationEvidenceUri:
    "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks",
};

export const CIPO_SOURCE_COVERAGE_TARGETS = [
  target(CIPO, {
    id: "ca-cipo-trademarks",
    family: "PORTAL",
    displayName: "CIPO Trademarks",
    canonicalUri:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks",
  }),
  target(CIPO, {
    id: "ca-cipo-trademarks-guide",
    family: "FILING",
    displayName: "CIPO Trademarks Guide",
    canonicalUri:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/trademarks-guide",
    verificationEvidenceUri:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/trademarks-guide",
  }),
  target(CIPO, {
    id: "ca-cipo-trademark-search",
    family: "SEARCH",
    displayName: "Canadian Trademarks Database Search Guidance",
    canonicalUri:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/basic-search",
    changeSensitivity: "NORMAL",
    verificationEvidenceUri:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/basic-search",
  }),
  target(CIPO, {
    id: "ca-cipo-trademark-fees",
    family: "FEES",
    displayName: "CIPO Fees for Trademarks",
    canonicalUri:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/fees-trademarks",
    verificationEvidenceUri:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/fees-trademarks",
  }),
  target(CIPO, {
    id: "ca-cipo-trademark-online-services",
    family: "FILING",
    displayName: "CIPO Trademark Online Services and Forms",
    canonicalUri:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/online-services-and-forms",
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/online-services-and-forms",
  }),
  target(CIPO, {
    id: "ca-cipo-trademark-opposition",
    family: "PROCEEDINGS",
    displayName: "CIPO Trademark Opposition Proceedings",
    canonicalUri:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks-opposition-board/opposition-proceedings-0",
    verificationEvidenceUri:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks-opposition-board/opposition-proceedings-0",
  }),
] satisfies readonly SourceCoverageTarget[];

export const PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS = [
  ...CNIPA_SOURCE_COVERAGE_TARGETS,
  ...JPO_SOURCE_COVERAGE_TARGETS,
  ...KOREA_SOURCE_COVERAGE_TARGETS,
  ...UKIPO_SOURCE_COVERAGE_TARGETS,
  ...IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,
  ...IPOS_SOURCE_COVERAGE_TARGETS,
  ...DPMA_SOURCE_COVERAGE_TARGETS,
  ...IP_INDIA_SOURCE_COVERAGE_TARGETS,
  ...INPI_FR_SOURCE_COVERAGE_TARGETS,
  ...INPI_BR_SOURCE_COVERAGE_TARGETS,
  ...CIPO_SOURCE_COVERAGE_TARGETS,
] satisfies readonly SourceCoverageTarget[];
