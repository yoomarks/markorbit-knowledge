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

const IMPI_MX: Authority = {
  jurisdiction: "MX",
  authorityName: "Instituto Mexicano de la Propiedad Industrial",
  languages: ["es-MX"],
  verificationEvidenceUri: "https://www.gob.mx/impi/documentos/registro-de-marcas",
};

export const IMPI_MX_SOURCE_COVERAGE_TARGETS = [
  target(IMPI_MX, {
    id: "mx-impi-trademarks",
    family: "PORTAL",
    displayName: "Mexico IMPI Trademarks",
    canonicalUri:
      "https://www.gob.mx/impi/acciones-y-programas/servicios-que-ofrece-el-impi-marcas",
    verificationEvidenceUri: "https://www.gob.mx/impi/documentos/registro-de-marcas",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-filing",
    family: "FILING",
    displayName: "Mexico IMPI Trademark Filing",
    canonicalUri: "https://www.gob.mx/impi/documentos/registro-de-marcas",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gob.mx/impi/documentos/registro-de-marcas",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-search",
    family: "SEARCH",
    displayName: "Mexico IMPI Trademark Search MARCia",
    canonicalUri: "https://marcia.impi.gob.mx/marcas/search/quick",
    entrypoints: [
      { uri: "https://marcia.impi.gob.mx/marcas/search/quick", label: "MARCia quick search" },
      {
        uri: "https://www.gob.mx/impi/documentos/registro-de-marcas",
        label: "IMPI trademark guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "IMAGE"],
    verificationEvidenceUri: "https://www.gob.mx/impi/documentos/registro-de-marcas",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-fees",
    family: "FEES",
    displayName: "Mexico IMPI Trademark Fees",
    canonicalUri:
      "https://www.gob.mx/impi/acciones-y-programas/servicios-que-ofrece-el-impi-tarifas-215115",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.gob.mx/impi/acciones-y-programas/servicios-que-ofrece-el-impi-tarifas-215115",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-forms",
    family: "FILING",
    displayName: "Mexico IMPI Trademark Forms",
    canonicalUri:
      "https://www.gob.mx/impi/acciones-y-programas/servicios-que-ofrece-el-impi-formatos",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.gob.mx/impi/acciones-y-programas/servicios-que-ofrece-el-impi-formatos",
  }),
  target(IMPI_MX, {
    id: "mx-impi-legal-framework",
    family: "LEGAL_TEXTS",
    displayName: "Mexico IMPI Industrial Property Legal Framework",
    canonicalUri: "https://www.gob.mx/impi/documentos/marco-juridico-nacional-274326",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gob.mx/impi/documentos/marco-juridico-nacional-274326",
    notes:
      "The official IMPI legal framework hub tracks current legislation and regulations; it states that the Diario Oficial de la Federación remains the legally authoritative publication.",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Mexico IMPI Trademark Classification ClasNiza",
    canonicalUri: "https://clasniza.impi.gob.mx/buscador",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://clasniza.impi.gob.mx/",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Mexico IMPI Gaceta de la Propiedad Industrial",
    canonicalUri: "https://siga.impi.gob.mx/inicio",
    entrypoints: [
      { uri: "https://siga.impi.gob.mx/inicio", label: "SIGA 2.0" },
      {
        uri: "https://www.gob.mx/impi/acciones-y-programas/gaceta-de-la-propiedad-industrial",
        label: "Official Gaceta guidance",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.gob.mx/impi/acciones-y-programas/gaceta-de-la-propiedad-industrial",
  }),
] satisfies readonly SourceCoverageTarget[];

const IPONZ_NZ: Authority = {
  jurisdiction: "NZ",
  authorityName: "Intellectual Property Office of New Zealand",
  languages: ["en-NZ"],
  verificationEvidenceUri: "https://www.iponz.govt.nz/get-ip/trade-marks/",
};

export const IPONZ_NZ_SOURCE_COVERAGE_TARGETS = [
  target(IPONZ_NZ, {
    id: "nz-iponz-trademarks",
    family: "PORTAL",
    displayName: "IPONZ Trade Marks",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-filing",
    family: "FILING",
    displayName: "IPONZ Apply for a Trade Mark",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/apply/",
    verificationEvidenceUri: "https://www.iponz.govt.nz/get-ip/trade-marks/apply/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-search",
    family: "SEARCH",
    displayName: "IPONZ Search for Existing Trade Marks",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/search/",
    entrypoints: [
      {
        uri: "https://www.iponz.govt.nz/get-ip/trade-marks/search/",
        label: "Trade mark search guidance",
      },
      { uri: "https://app.iponz.govt.nz/app/TradeMarkCheck", label: "Trade Mark Check" },
      {
        uri: "https://app.iponz.govt.nz/app/Extra/Default.aspx?directAccess=true&fcoOp=EXTRA__Default&op=EXTRA_tm_qbe",
        label: "Trade Mark Case Search",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "IMAGE"],
    verificationEvidenceUri: "https://www.iponz.govt.nz/get-ip/trade-marks/search/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-fees",
    family: "FEES",
    displayName: "IPONZ Trade Mark Fees",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/fees/",
    verificationEvidenceUri: "https://www.iponz.govt.nz/get-ip/trade-marks/fees/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-practice-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "IPONZ Trade Mark Practice Guidelines",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/practice-guidelines/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.iponz.govt.nz/get-ip/trade-marks/practice-guidelines/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "IPONZ Classification and Specification Guidelines",
    canonicalUri:
      "https://www.iponz.govt.nz/get-ip/trade-marks/practice-guidelines/current/classification-and-specification/",
    verificationEvidenceUri:
      "https://www.iponz.govt.nz/get-ip/trade-marks/practice-guidelines/current/classification-and-specification/",
    notes:
      "The current guideline states that New Zealand uses the 13th Edition of the Nice Classification, effective from 1 January 2026.",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-hearings",
    family: "PROCEEDINGS",
    displayName: "IPONZ Trade Mark Hearings",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/hearings/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.iponz.govt.nz/get-ip/trade-marks/hearings/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "IPONZ The Journal",
    canonicalUri: "https://www.iponz.govt.nz/about-iponz/the-journal/",
    entrypoints: [
      { uri: "https://www.iponz.govt.nz/about-iponz/the-journal/", label: "Journal guidance" },
      {
        uri: "https://app.iponz.govt.nz/app/Extra/Default.aspx?fcoOp=EXTRA__Default&op=EXTRA_Activity_qbe",
        label: "Online Journal search",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.iponz.govt.nz/about-iponz/the-journal/",
  }),
] satisfies readonly SourceCoverageTarget[];

const OEPM_ES: Authority = {
  jurisdiction: "ES",
  authorityName: "Oficina Española de Patentes y Marcas",
  languages: ["es-ES"],
  verificationEvidenceUri: "https://www.oepm.es/es/marcas-y-nombres-comerciales",
};

export const OEPM_ES_SOURCE_COVERAGE_TARGETS = [
  target(OEPM_ES, {
    id: "es-oepm-trademarks",
    family: "PORTAL",
    displayName: "OEPM Marcas y nombres comerciales",
    canonicalUri: "https://www.oepm.es/es/marcas-y-nombres-comerciales",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-filing",
    family: "FILING",
    displayName: "OEPM Solicitud de marca",
    canonicalUri:
      "https://www.oepm.es/es/herramientas/Formularios/formularios-de-marcas-y-nombres-comerciales/marcas/solicitud-de-marca/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/herramientas/Formularios/formularios-de-marcas-y-nombres-comerciales/marcas/solicitud-de-marca/",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-search",
    family: "SEARCH",
    displayName: "OEPM Buscador de marcas y nombres comerciales",
    canonicalUri:
      "https://www.oepm.es/es/herramientas/buscador-base-de-datos/buscador-marcas-y-nombres-comerciales/",
    entrypoints: [
      {
        uri: "https://www.oepm.es/es/herramientas/buscador-base-de-datos/buscador-marcas-y-nombres-comerciales/",
        label: "Search tools guidance",
      },
      {
        uri: "https://consultas2.oepm.es/LocalizadorWeb/?no_link=1",
        label: "Localizador de marcas con efectos en España",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/herramientas/buscador-base-de-datos/buscador-marcas-y-nombres-comerciales/",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-fees",
    family: "FEES",
    displayName: "OEPM Tasas de marcas y nombres comerciales",
    canonicalUri:
      "https://www.oepm.es/es/tasas-y-precios-publicos/tasas-de-marcas-y-nombres-comerciales/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/tasas-y-precios-publicos/tasas-de-marcas-y-nombres-comerciales/",
    notes:
      "The official fees page publishes the current 2026 trade mark and trade name fee schedule.",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-forms",
    family: "FILING",
    displayName: "OEPM Formularios de marcas y nombres comerciales",
    canonicalUri:
      "https://www.oepm.es/es/herramientas/Formularios/formularios-de-marcas-y-nombres-comerciales/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/herramientas/Formularios/formularios-de-marcas-y-nombres-comerciales/",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-examination-directives",
    family: "EXAMINATION_MANUAL",
    displayName: "OEPM Directrices de examen",
    canonicalUri: "https://www.oepm.es/es/herramientas/Manuales-y-guias/Directrices-de-examen/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/herramientas/Manuales-y-guias/Directrices-de-examen/",
    notes:
      "OEPM announced updated absolute- and relative-ground examination directives on 31 March 2026.",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "OEPM Normativa de marcas y nombres comerciales",
    canonicalUri:
      "https://www.oepm.es/es/conoce-la-propiedad-industrial/normativa-y-jurisprudencia/normativa-marcas-y-nombres-comerciales/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/conoce-la-propiedad-industrial/normativa-y-jurisprudencia/normativa-marcas-y-nombres-comerciales/",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "OEPM CLINMAR Nice Classification",
    canonicalUri: "https://consultas2.oepm.es/clinmar/inicio",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/herramientas/buscador-base-de-datos/buscador-marcas-y-nombres-comerciales/",
    notes:
      "The current CLINMAR interface identifies Nice Classification 13th Edition 2026 and was updated in July 2026.",
  }),
  target(OEPM_ES, {
    id: "es-oepm-bopi-marks",
    family: "OFFICIAL_GAZETTE",
    displayName: "OEPM Boletín Oficial de la Propiedad Industrial - Marcas",
    canonicalUri: "https://consultas2.oepm.es/bopiweb/descargaPublicaciones/",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: false,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF", "XML"],
    verificationEvidenceUri: "https://consultas2.oepm.es/bopiweb/descargaPublicaciones/",
    notes:
      "The official BOPI download service publishes Tome 1 for marks and other distinctive signs with PDF, XML and HTML downloads.",
  }),
] satisfies readonly SourceCoverageTarget[];

const UIBM_IT: Authority = {
  jurisdiction: "IT",
  authorityName: "Ufficio Italiano Brevetti e Marchi",
  languages: ["it-IT"],
  verificationEvidenceUri: "https://uibm.mise.gov.it/index.php/it/marchi",
};

export const UIBM_IT_SOURCE_COVERAGE_TARGETS = [
  target(UIBM_IT, {
    id: "it-uibm-trademarks",
    family: "PORTAL",
    displayName: "UIBM Marchi",
    canonicalUri: "https://uibm.mise.gov.it/index.php/it/marchi",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-filing",
    family: "FILING",
    displayName: "UIBM Come effettuare il deposito",
    canonicalUri:
      "https://uibm.mise.gov.it/index.php/it/marchi/registrare-in-italia/come-effettuare-il-deposito",
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/marchi/registrare-in-italia/come-effettuare-il-deposito",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-search",
    family: "SEARCH",
    displayName: "UIBM Banca Dati nazionale della Proprietà Industriale",
    canonicalUri: "https://www.uibm.gov.it/bancadati/home/index/",
    entrypoints: [
      { uri: "https://www.uibm.gov.it/bancadati/home/index/", label: "National IP database" },
      {
        uri: "https://uibm.mise.gov.it/index.php/it/banche-dati/2035903-banca-dati-bibliografica",
        label: "Database guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.uibm.gov.it/bancadati/home/index/",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-fees",
    family: "FEES",
    displayName: "UIBM Tariffe Marchi",
    canonicalUri: "https://uibm.mise.gov.it/index.php/it/marchi/procedura-di-nullita/tariffe",
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/marchi/procedura-di-nullita/tariffe",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-forms",
    family: "FILING",
    displayName: "UIBM Marchi - primo deposito modulistica",
    canonicalUri:
      "https://uibm.mise.gov.it/index.php/it/deposito-titoli/modulistica-per-il-deposito-cartaceo/227-modulistica-deposito-cartaceo/2036653-marchi-primo-deposito-nuovo",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/deposito-titoli/modulistica-per-il-deposito-cartaceo/227-modulistica-deposito-cartaceo/2036653-marchi-primo-deposito-nuovo",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-examination-opposition",
    family: "EXAMINATION_MANUAL",
    displayName: "UIBM Esame della domanda e procedura di opposizione",
    canonicalUri:
      "https://uibm.mise.gov.it/index.php/it/marchi/esame-della-domanda-e-procedura-di-opposizione",
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/marchi/esame-della-domanda-e-procedura-di-opposizione",
  }),
  target(UIBM_IT, {
    id: "it-uibm-industrial-property-code",
    family: "LEGAL_TEXTS",
    displayName: "UIBM Codice della Proprietà Industriale",
    canonicalUri:
      "https://uibm.mise.gov.it/index.php/it/normativa-pi/il-codice-della-proprieta-industriale",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/normativa-pi/il-codice-della-proprieta-industriale",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-nullity-revocation",
    family: "PROCEEDINGS",
    displayName: "UIBM Procedura di decadenza e nullità dei marchi",
    canonicalUri: "https://uibm.mise.gov.it/index.php/it/marchi/procedura-di-decadenza",
    entrypoints: [
      {
        uri: "https://uibm.mise.gov.it/index.php/it/marchi/procedura-di-decadenza",
        label: "Procedura di decadenza",
      },
      {
        uri: "https://uibm.mise.gov.it/index.php/en/marchi/procedura-di-nullita",
        label: "Procedura di nullità",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/al-via-la-procedura-per-l-accertamento-della-nullita-e-decadenza-dei-marchi",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "UIBM Bollettino Marchi",
    canonicalUri: "https://www.uibm.gov.it/bancadati/bollettini/index/",
    entrypoints: [
      {
        uri: "https://uibm.mise.gov.it/index.php/it/marchi/bollettino-marchi",
        label: "Bollettino Marchi guidance",
      },
      { uri: "https://www.uibm.gov.it/bancadati/bollettini/index/", label: "Current bulletins" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: false,
    fetchAttachmentsHint: false,
    expectedArtifactKinds: ["HTML"],
    verificationEvidenceUri: "https://uibm.mise.gov.it/index.php/it/marchi/bollettino-marchi",
    notes:
      "Since May 2021 the official trade mark bulletins are published through searchable web pages rather than PDF files.",
  }),
] satisfies readonly SourceCoverageTarget[];

const IPI_CH: Authority = {
  jurisdiction: "CH",
  authorityName: "Swiss Federal Institute of Intellectual Property",
  languages: ["de-CH", "fr-CH", "it-CH", "en"],
  verificationEvidenceUri: "https://www.ige.ch/en/trade-marks",
};

export const IPI_CH_SOURCE_COVERAGE_TARGETS = [
  target(IPI_CH, {
    id: "ch-ipi-trademarks",
    family: "PORTAL",
    displayName: "Swiss IPI Trade Marks",
    canonicalUri: "https://www.ige.ch/en/trade-marks",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-filing",
    family: "FILING",
    displayName: "Swiss IPI National Trade Mark Applications",
    canonicalUri: "https://www.ige.ch/en/protecting-your-ip/trade-marks/national-applications",
    verificationEvidenceUri:
      "https://www.ige.ch/en/protecting-your-ip/trade-marks/national-applications",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-search",
    family: "SEARCH",
    displayName: "Swissreg Trade Mark Database",
    canonicalUri:
      "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg/trade-mark-database",
    entrypoints: [
      {
        uri: "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg/trade-mark-database",
        label: "Trade mark database guidance",
      },
      { uri: "https://www.swissreg.ch/database-client/home?lang=en", label: "Swissreg" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "IMAGE"],
    verificationEvidenceUri:
      "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg/trade-mark-database",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-fees",
    family: "FEES",
    displayName: "Swiss IPI Trade Mark Costs and Fees",
    canonicalUri:
      "https://www.ige.ch/en/protecting-your-ip/trade-marks/national-applications/costs-and-fees",
    verificationEvidenceUri:
      "https://www.ige.ch/en/protecting-your-ip/trade-marks/national-applications/costs-and-fees",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "Swiss IPI Trade Mark Guidelines",
    canonicalUri:
      "https://www.ige.ch/en/services/documents-and-links/trade-mark/praxisaenderungen-des-ige",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ige.ch/en/services/documents-and-links/trade-mark/praxisaenderungen-des-ige",
    notes:
      "The official trade mark documents hub publishes the Trade Mark Guidelines dated 1 January 2026 in German, French and Italian.",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Swiss IPI Classification Tool",
    canonicalUri:
      "https://www.ige.ch/en/services/digital-resources/online-services/classification-tool",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.ige.ch/en/services/digital-resources/online-services/classification-tool",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Swiss IPI Trade Mark Law",
    canonicalUri: "https://www.ige.ch/en/law-and-policy/national-ip-law/trade-mark-law",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.ige.ch/en/law-and-policy/national-ip-law/trade-mark-law",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Swiss IPI Trade Mark Opposition and Non-use Cancellation",
    canonicalUri:
      "https://www.ige.ch/en/protecting-your-ip/trade-marks/after-registration/monitor-and-defend-your-trade-mark/filing-an-opposition",
    entrypoints: [
      {
        uri: "https://www.ige.ch/en/protecting-your-ip/trade-marks/after-registration/monitor-and-defend-your-trade-mark/filing-an-opposition",
        label: "Opposition",
      },
      {
        uri: "https://www.ige.ch/en/protecting-your-ip/trade-marks/after-registration/use-your-trade-mark/cancellation-procedure-for-trade-marks-on-the-grounds-of-non-use",
        label: "Cancellation for non-use",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ige.ch/en/protecting-your-ip/trade-marks/after-registration/monitor-and-defend-your-trade-mark/filing-an-opposition",
  }),
  target(IPI_CH, {
    id: "ch-ipi-swissreg-publications",
    family: "OFFICIAL_GAZETTE",
    displayName: "Swissreg Official Publication Organ",
    canonicalUri:
      "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg",
    entrypoints: [
      {
        uri: "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg",
        label: "Swissreg publication organ guidance",
      },
      {
        uri: "https://www.swissreg.ch/database-client/home?lang=en",
        label: "Swissreg publications",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF", "JSON"],
    verificationEvidenceUri:
      "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg",
    notes:
      "Swissreg is the IPI's official organ for legally effective publication of new registrations and changes to the register.",
  }),
] satisfies readonly SourceCoverageTarget[];

const PRV_SE: Authority = {
  jurisdiction: "SE",
  authorityName: "Swedish Intellectual Property Office (PRV)",
  languages: ["sv-SE", "en"],
  verificationEvidenceUri: "https://www.prv.se/en/trademarks/",
};

export const PRV_SE_SOURCE_COVERAGE_TARGETS = [
  target(PRV_SE, {
    id: "se-prv-trademarks",
    family: "PORTAL",
    displayName: "PRV Trademarks",
    canonicalUri: "https://www.prv.se/en/trademarks/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-filing",
    family: "FILING",
    displayName: "PRV Prepare for the Trademark Application",
    canonicalUri: "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/",
    entrypoints: [
      {
        uri: "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/",
        label: "Application checklist and filing guidance",
      },
      {
        uri: "https://www.prv.se/en/ip-professional/trademarks/trademark-online-services/",
        label: "Trademark online services",
      },
    ],
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-search",
    family: "SEARCH",
    displayName: "PRV Swedish Trademark Database",
    canonicalUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/trademark-databases/",
    entrypoints: [
      {
        uri: "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/trademark-databases/",
        label: "Trademark database guidance",
      },
      { uri: "https://search.prv.se/", label: "Search PRV's Databases" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/trademark-databases/",
    notes:
      "PRV launched the new Search PRV's Databases interface on 26 January 2026 as the modernised access point for the Swedish Trademark Database.",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-fees",
    family: "FEES",
    displayName: "PRV Trademark Fees",
    canonicalUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/fees-and-payment/",
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/fees-and-payment/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "PRV Goods and Services Classification Guidance",
    canonicalUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/choose-the-right-goods-and-services-for-your-trademark/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/choose-the-right-goods-and-services-for-your-trademark/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "PRV Trademark Laws and Regulations",
    canonicalUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/laws-and-regulations-concerning-trademarks/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/laws-and-regulations-concerning-trademarks/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-examination-opposition",
    family: "PROCEEDINGS",
    displayName: "PRV Trademark Application Processing and Opposition",
    canonicalUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/processing-of-applications-of-trademarks/",
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/processing-of-applications-of-trademarks/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Swedish Trademark Gazette",
    canonicalUri:
      "https://www.prv.se/en/trademarks/when-you-have-a-registered-trademark/monitor-your-trademark/swedish-trademark-gazette/",
    entrypoints: [
      {
        uri: "https://www.prv.se/en/trademarks/when-you-have-a-registered-trademark/monitor-your-trademark/swedish-trademark-gazette/",
        label: "Gazette guidance",
      },
      { uri: "https://search.prv.se/", label: "Daily trademark notices" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/when-you-have-a-registered-trademark/monitor-your-trademark/swedish-trademark-gazette/",
    notes:
      "From 26 January 2026 the Swedish Trademark Gazette moved from daily/weekly PDF editions to online notices published daily through Search PRV's Databases.",
  }),
] satisfies readonly SourceCoverageTarget[];

const NIPO_NO: Authority = {
  jurisdiction: "NO",
  authorityName: "Norwegian Industrial Property Office (NIPO)",
  languages: ["nb-NO", "nn-NO", "en"],
  verificationEvidenceUri: "https://www.patentstyret.no/en/trademark",
};

export const NIPO_NO_SOURCE_COVERAGE_TARGETS = [
  target(NIPO_NO, {
    id: "no-nipo-trademarks",
    family: "PORTAL",
    displayName: "NIPO Trademarks",
    canonicalUri: "https://www.patentstyret.no/en/trademark",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-filing",
    family: "FILING",
    displayName: "NIPO Start a Trademark Application",
    canonicalUri: "https://www.patentstyret.no/en/trademark/start-a-trademark-application",
    verificationEvidenceUri:
      "https://www.patentstyret.no/en/trademark/start-a-trademark-application",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-search",
    family: "SEARCH",
    displayName: "NIPO Register Search",
    canonicalUri: "https://search.patentstyret.no/advanced/",
    entrypoints: [
      {
        uri: "https://www.patentstyret.no/en/services",
        label: "NIPO services and register guidance",
      },
      { uri: "https://search.patentstyret.no/advanced/", label: "The Register" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.patentstyret.no/en/services",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-fees",
    family: "FEES",
    displayName: "NIPO Trademark Fees",
    canonicalUri:
      "https://www.patentstyret.no/en/about-us/how-we-work/prices-trademark-patent-design",
    verificationEvidenceUri:
      "https://www.patentstyret.no/en/about-us/how-we-work/prices-trademark-patent-design",
    notes: "The official fee schedule was last modified on 1 July 2026.",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "NIPO Selection and Classification of Goods and Services",
    canonicalUri:
      "https://www.patentstyret.no/en/trademark/selection-and-classification-of-goods-and-services",
    entrypoints: [
      {
        uri: "https://www.patentstyret.no/en/trademark/selection-and-classification-of-goods-and-services",
        label: "Classification guidance",
      },
      {
        uri: "https://services.patentstyret.no/tmclassification",
        label: "Product selector",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://www.patentstyret.no/en/trademark/selection-and-classification-of-goods-and-services",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Norwegian Trademarks Act and Regulations",
    canonicalUri: "https://www.patentstyret.no/en/trademark/trademarks-act",
    entrypoints: [
      {
        uri: "https://www.patentstyret.no/en/trademark/trademarks-act",
        label: "Trademarks Act",
      },
      {
        uri: "https://www.patentstyret.no/en/trademark/regulations-to-the-norwegian-trademarks-act-norwegian-trademark-regulations",
        label: "Trademark Regulations",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.patentstyret.no/en/trademark/trademarks-act",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "NIPO Trademark Opposition and Administrative Review",
    canonicalUri: "https://www.patentstyret.no/en/trademark/trademark-appeal-options",
    entrypoints: [
      {
        uri: "https://www.patentstyret.no/en/trademark/trademark-appeal-options/opposition-in-a-trademark-case",
        label: "Opposition",
      },
      {
        uri: "https://www.patentstyret.no/en/trademark/trademark-appeal-options/administrative-review-in-a-trademark-case",
        label: "Administrative review",
      },
    ],
    verificationEvidenceUri: "https://www.patentstyret.no/en/trademark/trademark-appeal-options",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Norwegian Trademark Gazette",
    canonicalUri: "https://tidende.patentstyret.no/varemerke",
    entrypoints: [
      {
        uri: "https://www.patentstyret.no/en/about-us/how-we-work/about-the-gazette",
        label: "Gazette guidance",
      },
      { uri: "https://tidende.patentstyret.no/varemerke", label: "Digital Trademark Gazette" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "PDF", "IMAGE"],
    verificationEvidenceUri:
      "https://www.patentstyret.no/en/about-us/how-we-work/about-the-gazette",
    notes:
      "The digital Norwegian Gazette replaced PDF editions on 4 March 2024 and publishes the trademark gazette weekly every Monday.",
  }),
] satisfies readonly SourceCoverageTarget[];

const DKPTO_DK: Authority = {
  jurisdiction: "DK",
  authorityName: "Danish Patent and Trademark Office (DKPTO)",
  languages: ["da-DK", "en"],
  verificationEvidenceUri: "https://www.dkpto.org/about-ip-rights/trademarks",
};

export const DKPTO_DK_SOURCE_COVERAGE_TARGETS = [
  target(DKPTO_DK, {
    id: "dk-dkpto-trademarks",
    family: "PORTAL",
    displayName: "DKPTO Trademarks",
    canonicalUri: "https://www.dkpto.org/about-ip-rights/trademarks",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-filing",
    family: "FILING",
    displayName: "DKPTO Apply for a Trademark",
    canonicalUri: "https://www.dkpto.org/apply/apply-trademarks",
    entrypoints: [
      { uri: "https://www.dkpto.org/apply/apply-trademarks", label: "Trademark filing guidance" },
      {
        uri: "https://www.dkpto.org/news/2025/dec/new-submission-system-for-electronic-trademark-applications",
        label: "eFiling launch notice",
      },
    ],
    verificationEvidenceUri: "https://www.dkpto.org/apply/apply-trademarks",
    notes:
      "DKPTO launched its new electronic trademark eFiling system on 16 December 2025, integrated with PVS Pay.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-search",
    family: "SEARCH",
    displayName: "DKPTO PVSOnline Trademark Search",
    canonicalUri: "https://onlineweb.dkpto.dk/pvsonline/?language=GB",
    entrypoints: [
      { uri: "https://www.dkpto.org/search-databases", label: "Search databases guidance" },
      { uri: "https://onlineweb.dkpto.dk/pvsonline/?language=GB", label: "PVSOnline" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.dkpto.org/terms-and-conditions/pvsonline",
    notes:
      "PVSOnline exposes Danish trademark applications, registrations and Madrid marks effective in Denmark and is updated on business days.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-fees",
    family: "FEES",
    displayName: "DKPTO Trademark Prices and Fees",
    canonicalUri: "https://www.dkpto.org/about-ip-rights/prices-and-fees",
    verificationEvidenceUri: "https://www.dkpto.org/about-ip-rights/prices-and-fees",
    notes:
      "The current fee schedule reflects the 2026 fee adjustment and includes application, renewal, opposition and administrative revocation fees.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "DKPTO Trademark Guidelines (Varemærkehåndbogen)",
    canonicalUri: "https://vmguidelines.dkpto.dk/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://vmguidelines.dkpto.dk/",
    notes:
      "The official Trademark Guidelines are a living practice tool explaining DKPTO interpretation and application of the Trade Marks Act and related rules.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "DKPTO Goods and Services Classification Guidance",
    canonicalUri:
      "https://www.dkpto.dk/bliv-klogere-paa-rettigheder/navn-og-logo/varer-og-tjenesteydelser",
    entrypoints: [
      {
        uri: "https://www.dkpto.dk/bliv-klogere-paa-rettigheder/navn-og-logo/varer-og-tjenesteydelser",
        label: "Goods and services guidance",
      },
      {
        uri: "https://vmguidelines.dkpto.dk/aa/aaa/varefortegnelser/saerligt-om-nice-klassifikationen.aspx",
        label: "Nice Classification practice guidance",
      },
    ],
    verificationEvidenceUri:
      "https://www.dkpto.dk/bliv-klogere-paa-rettigheder/navn-og-logo/varer-og-tjenesteydelser",
    notes:
      "DKPTO requires goods and services to be classified under the Nice Classification and maintains detailed class guidance in the Trademark Guidelines.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "DKPTO Trademark Law",
    canonicalUri: "https://www.dkpto.org/about-ip-rights/ip-law",
    entrypoints: [
      {
        uri: "https://www.dkpto.org/about-ip-rights/ip-law",
        label: "IP law and trademark legislation",
      },
      {
        uri: "https://vmguidelines.dkpto.dk/love-og-regler-med-tilknyttede-artikler/varemaerkeloven-%28lbk-nr-88-af-29012019%29.aspx",
        label: "Trade Marks Act with current DKPTO annotations",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.dkpto.org/about-ip-rights/ip-law",
    notes:
      "The official legal hub lists the Trade Marks Act and implementing order; the Trademark Guidelines reflect the fee-law amendments effective 1 January 2026.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Dansk Varemærketidende Current Publications",
    canonicalUri: "https://onlineweb.dkpto.dk/pvsonline/Varemaerke",
    entrypoints: [
      {
        uri: "https://onlineweb.dkpto.dk/pvsonline/Varemaerke",
        label: "PVSOnline trademark publication surface",
      },
      {
        uri: "https://onlineweb.dkpto.dk/pvsonline/Varemaerke?action=101&sagID=VA+2026+00258",
        label: "Current 2026 Gazette publication evidence",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://onlineweb.dkpto.dk/pvsonline/Varemaerke?action=101&sagID=VA+2026+00258",
    notes:
      "Current PVSOnline trademark records expose Dansk Varemærketidende publication events, including 2026 application/opposition and registration publications.",
  }),
] satisfies readonly SourceCoverageTarget[];

const PRH_FI: Authority = {
  jurisdiction: "FI",
  authorityName: "Finnish Patent and Registration Office (PRH)",
  languages: ["fi-FI", "sv-FI", "en"],
  verificationEvidenceUri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks.html",
};

export const PRH_FI_SOURCE_COVERAGE_TARGETS = [
  target(PRH_FI, {
    id: "fi-prh-trademarks",
    family: "PORTAL",
    displayName: "PRH Trademarks",
    canonicalUri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks.html",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-filing",
    family: "FILING",
    displayName: "PRH How to Apply for a Trademark",
    canonicalUri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/how_to_apply.html",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/how_to_apply.html",
        label: "Trademark filing guidance",
      },
      { uri: "https://asiointi.prh.fi/", label: "PRH trademark application service" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/how_to_apply.html",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-search",
    family: "SEARCH",
    displayName: "PRH Trademark Information Service",
    canonicalUri: "https://tavaramerkkitietopalvelu.prh.fi/",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/information_services/trademark_information_service.html",
        label: "Trademark Information Service guidance",
      },
      { uri: "https://tavaramerkkitietopalvelu.prh.fi/", label: "Trademark Information Service" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/information_services/trademark_information_service.html",
    notes:
      "The PRH service covers pending and valid Finnish national trademarks, Madrid registrations designating Finland, and related opposition/revocation information; search guidance was updated on 28 July 2026.",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-fees",
    family: "FEES",
    displayName: "PRH Trademark Application and Registration Fees",
    canonicalUri:
      "https://www.prh.fi/en/price-lists/trademark_fees/fees_for_trademark_applications.html",
    verificationEvidenceUri:
      "https://www.prh.fi/en/price-lists/trademark_fees/fees_for_trademark_applications.html",
    notes:
      "The official price list applies from 1 January 2026 and covers applications, renewals, oppositions, revocations and invalidations.",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "PRH Classification of Goods and Services",
    canonicalUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/ennen_tavaramerkin_hakemista/classification_of_goods_and_services.html",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/ennen_tavaramerkin_hakemista/classification_of_goods_and_services.html",
        label: "Classification guidance",
      },
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/ennen_tavaramerkin_hakemista/classification_of_goods_and_services/classification_principles_and_sources_of_information/luokkaotsikot_2020.html",
        label: "Current NCL 13-2026 class headings",
      },
    ],
    verificationEvidenceUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/ennen_tavaramerkin_hakemista/classification_of_goods_and_services/classification_principles_and_sources_of_information/luokkaotsikot_2020.html",
    notes:
      "PRH identifies NCL 13-2026 as the current Nice Classification effective from 1 January 2026.",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "PRH Trademark Legislation and Guidelines",
    canonicalUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/legislation.html",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/legislation.html",
        label: "Trademark legislation and common practices",
      },
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/legislation/trademark_act.html",
        label: "Trademarks Act 544/2019 English translation",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/legislation.html",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "PRH Trademark Opposition, Revocation and Invalidation",
    canonicalUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/trademark_disputes/opposition_against_a_trademark.html",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/trademark_disputes/opposition_against_a_trademark.html",
        label: "Opposition procedure",
      },
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/trademark_disputes/revocation_and_invalidation_procedure.html",
        label: "Revocation and invalidation procedure",
      },
    ],
    verificationEvidenceUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/trademark_disputes/opposition_against_a_trademark.html",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "PRH Trademark Gazette",
    canonicalUri: "https://teollisoikeuslehdet.prh.fi/en/trademarkgazette",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/information_services/the_trademark_gazette.html",
        label: "Trademark Gazette guidance",
      },
      { uri: "https://teollisoikeuslehdet.prh.fi/en/trademarkgazette", label: "Trademark Gazette" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://teollisoikeuslehdet.prh.fi/en/trademarkgazette",
    notes:
      "The online Trademark Gazette replaces the former twice-monthly PDF gazette and is updated daily with national marks, Madrid registrations valid in Finland and trademarks with a reputation.",
  }),
] satisfies readonly SourceCoverageTarget[];

const PATENTAMT_AT: Authority = {
  jurisdiction: "AT",
  authorityName: "Austrian Patent Office (Österreichisches Patentamt)",
  languages: ["de-AT", "en"],
  verificationEvidenceUri: "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark",
};

export const PATENTAMT_AT_SOURCE_COVERAGE_TARGETS = [
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademarks",
    family: "PORTAL",
    displayName: "Austrian Patent Office Trademark Protection",
    canonicalUri: "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-filing",
    family: "FILING",
    displayName: "Austrian Patent Office National Trademark",
    canonicalUri:
      "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark/national-trademark",
    verificationEvidenceUri:
      "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark/national-trademark",
    notes:
      "The national trademark page documents digital Online Filing, paper filing, examination, publication and post-refusal remedies.",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-search",
    family: "SEARCH",
    displayName: "Austrian Patent Office see.ip Trademark Search",
    canonicalUri: "https://seeip.patentamt.at/en/markesuche",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://seeip.patentamt.at/en/markesuche",
    notes:
      "see.ip is the Austrian Patent Office register search and exposes national, EU and international trademark records relevant to Austria.",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-fees",
    family: "FEES",
    displayName: "Austrian Patent Office Trademark Application Fees",
    canonicalUri: "https://www.patentamt.at/en/apply-for-protection/application-fees",
    verificationEvidenceUri: "https://www.patentamt.at/en/apply-for-protection/application-fees",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Austrian Patent Office Trademark Classification",
    canonicalUri:
      "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark/national-trademark/trademark-classification",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark/national-trademark/trademark-classification",
    notes:
      "The current classification page publishes Nice Classification NCL 13-2026 materials effective from 1 January 2026.",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Austrian Patent Office Law and Legislation",
    canonicalUri: "https://www.patentamt.at/en/about-us/law-legislation",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.patentamt.at/en/about-us/law-legislation",
    notes:
      "The official legal hub publishes current versions in force, including the Trademark Protection Act and Patent Office rules.",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Austrian Patent Office Trademark Proceedings and Appeals",
    canonicalUri:
      "https://www.patentamt.at/en/manage-preserve-protection/trademarks/proceedings-appeals",
    verificationEvidenceUri:
      "https://www.patentamt.at/en/manage-preserve-protection/trademarks/proceedings-appeals",
    notes:
      "The official proceedings page covers opposition, cancellation before the Nullity Department and appeals, with current procedural fees and deadlines.",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Austrian Trademark Gazette",
    canonicalUri:
      "https://www.patentamt.at/en/manage-preserve-protection/trademarks/trademark-gazette",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.patentamt.at/en/manage-preserve-protection/trademarks/trademark-gazette",
    notes:
      "The Austrian Trademark Gazette is published on the 20th of each month and currently provides 2026 issues including July 2026.",
  }),
] satisfies readonly SourceCoverageTarget[];

const IPOI_IE: Authority = {
  jurisdiction: "IE",
  authorityName: "Intellectual Property Office of Ireland (IPOI)",
  languages: ["en-IE"],
  verificationEvidenceUri: "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/",
};

export const IPOI_IE_SOURCE_COVERAGE_TARGETS = [
  target(IPOI_IE, {
    id: "ie-ipoi-trademarks",
    family: "PORTAL",
    displayName: "IPOI Trade Marks",
    canonicalUri: "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-filing",
    family: "FILING",
    displayName: "IPOI Apply for a Trade Mark",
    canonicalUri: "https://www.ipoi.gov.ie/en/manage-ip/apply/apply-for-a-trade-mark/",
    verificationEvidenceUri: "https://www.ipoi.gov.ie/en/manage-ip/apply/apply-for-a-trade-mark/",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-search",
    family: "SEARCH",
    displayName: "IPOI Trademark Search",
    canonicalUri: "https://www.ipoi.gov.ie/en/ip-search-tools/trademark-search/",
    entrypoints: [
      {
        uri: "https://www.ipoi.gov.ie/en/ip-search-tools/trademark-search/",
        label: "Trademark search guidance",
      },
      {
        uri: "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/using-the-trade-mark-search-tools/",
        label: "Irish trademark search tools",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.ipoi.gov.ie/en/ip-search-tools/trademark-search/",
    notes:
      "The National Trade Mark Database covers Irish applications and Madrid registrations designating Ireland; IPOI also exposes quick and advanced register search tools.",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-fees",
    family: "FEES",
    displayName: "IPOI Statutory Trade Mark Fees",
    canonicalUri: "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/statutory-trade-mark-fees/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/statutory-trade-mark-fees/",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "IPOI Classification of Goods and Services",
    canonicalUri:
      "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/understanding-trade-marks/classifying-your-goods-or-services/",
    verificationEvidenceUri:
      "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/understanding-trade-marks/classifying-your-goods-or-services/",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-law-practice",
    family: "LEGAL_TEXTS",
    displayName: "IPOI Trade Mark Law and Practice",
    canonicalUri:
      "https://www.ipoi.gov.ie/en/law-practice/legislation/trade-marks/trade-marks-acts/",
    entrypoints: [
      {
        uri: "https://www.ipoi.gov.ie/en/law-practice/legislation/trade-marks/trade-marks-acts/",
        label: "Trade Marks Acts",
      },
      {
        uri: "https://www.ipoi.gov.ie/en/law-practice/legislation/trade-marks/rules-regulations/",
        label: "Trade mark rules and regulations",
      },
      {
        uri: "https://www.ipoi.gov.ie/en/law-practice/legislation/trade-marks/trade-marks-practice-and-procedures/",
        label: "Trade mark practice and procedures",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ipoi.gov.ie/en/law-practice/legislation/trade-marks/trade-marks-acts/",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-opposition",
    family: "PROCEEDINGS",
    displayName: "IPOI Trademark Opposition",
    canonicalUri: "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/after-you-apply/opposition/",
    verificationEvidenceUri:
      "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/after-you-apply/opposition/",
    notes:
      "IPOI provides a three-month opposition period following publication of an accepted trademark in the Official Journal.",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "IPOI Journal - Trade Marks Part II",
    canonicalUri:
      "https://www.ipoi.gov.ie/en/ip-search-tools/search-the-journal/download-journals/",
    entrypoints: [
      {
        uri: "https://www.ipoi.gov.ie/en/ip-search-tools/search-the-journal/about-the-journal/",
        label: "About the fortnightly Journal",
      },
      {
        uri: "https://www.ipoi.gov.ie/en/ip-search-tools/search-the-journal/download-journals/",
        label: "Download current and past Journals",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ipoi.gov.ie/en/ip-search-tools/search-the-journal/download-journals/",
    notes:
      "IPOI publishes the Journal fortnightly; Part II covers trademark filings, oppositions, registrations, renewals, restorations and Madrid events. The download page lists Journal 2572 dated 15 July 2026.",
  }),
] satisfies readonly SourceCoverageTarget[];

const INPI_PT: Authority = {
  jurisdiction: "PT",
  authorityName: "Instituto Nacional da Propriedade Industrial (Portugal)",
  languages: ["pt-PT", "en"],
  verificationEvidenceUri: "https://inpi.justica.gov.pt/",
};

export const INPI_PT_SOURCE_COVERAGE_TARGETS = [
  target(INPI_PT, {
    id: "pt-inpi-trademarks",
    family: "PORTAL",
    displayName: "Portugal INPI Trademarks Portal",
    canonicalUri: "https://inpi.justica.gov.pt/",
    notes:
      "The official INPI portal exposes national trademark registration, maintenance and post-registration services.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-filing",
    family: "FILING",
    displayName: "Portugal INPI Online Trademark Filing Guide",
    canonicalUri:
      "https://inpi.justica.gov.pt/Saber-PI/Guias-de-pedido-online/Guia-de-pedido-online-de-marcas-e-logotipos",
    entrypoints: [
      {
        uri: "https://inpi.justica.gov.pt/Saber-PI/Guias-de-pedido-online/Guia-de-pedido-online-de-marcas-e-logotipos",
        label: "Online trademark and logo filing guide",
      },
      {
        uri: "https://servicosonline.inpi.justica.gov.pt/sp-ui-eservices/",
        label: "INPI online trademark services",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://inpi.justica.gov.pt/Saber-PI/Guias-de-pedido-online/Guia-de-pedido-online-de-marcas-e-logotipos",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-search",
    family: "SEARCH",
    displayName: "Portugal INPI Online Trademark Search",
    canonicalUri: "https://servicosonline.inpi.justica.gov.pt/pesquisas/main/marcas.jsp?lang=PT",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://inpi.justica.gov.pt/Saber-PI/Guias-de-pedido-online/Guia-de-pedido-online-de-marcas-e-logotipos",
    notes:
      "The official filing guide directs applicants to INPI databases for a fuller search of earlier trademarks and logos before filing.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-fees",
    family: "FEES",
    displayName: "Portugal INPI Industrial Property Fee Tables",
    canonicalUri: "https://inpi.justica.gov.pt/Documentos/Taxas/Tabelas-de-taxas",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://inpi.justica.gov.pt/Documentos/Taxas/Tabelas-de-taxas",
    notes: "The official 2026 industrial property fee table is effective from 1 July 2026.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Portugal INPI International Classifications and Class Lists",
    canonicalUri:
      "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos/Classificacoes-internacionais-e-listas-de-classes",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos/Classificacoes-internacionais-e-listas-de-classes",
    notes:
      "The current trademark classification page publishes the 13th Edition Nice Classification lists and Vienna Classification materials.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-examination-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "Portugal INPI Trademark Examination Guidelines",
    canonicalUri:
      "https://inpi.justica.gov.pt/Noticias-do-INPI/Guia-Pratico-de-Exame-Substancial-de-Marcas-e-Logotipos",
    entrypoints: [
      {
        uri: "https://inpi.justica.gov.pt/Noticias-do-INPI/Guia-Pratico-de-Exame-Substancial-de-Marcas-e-Logotipos",
        label: "Trademark substantive examination guide",
      },
      {
        uri: "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos",
        label: "Current legislation and examination documents hub",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://inpi.justica.gov.pt/Noticias-do-INPI/Guia-Pratico-de-Exame-Substancial-de-Marcas-e-Logotipos",
    notes:
      "The official guide sets out absolute and relative grounds examination criteria for trademarks and logos.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Portugal INPI Industrial Property Code and Trademark Legal Documents",
    canonicalUri: "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos",
    entrypoints: [
      {
        uri: "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos",
        label: "Legislation and other documents",
      },
      {
        uri: "https://servicosonline.inpi.justica.gov.pt/sp-ui-eservices/tm-opposition.htm?execution=e1s1",
        label: "Online trademark opposition service",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos",
    notes:
      "The official legal hub provides the Industrial Property Code, formal filing rules, the CPI implementation manual and trademark examination materials.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-industrial-property-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "Portugal INPI Industrial Property Bulletin",
    canonicalUri: "https://inpi.justica.gov.pt/en-gb/Industrial-Property-Bulletin",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://inpi.justica.gov.pt/en-gb/Industrial-Property-Bulletin",
    notes:
      "The Industrial Property Bulletin is published electronically on business days. Publication dates trigger opposition, appeal and notification-compliance periods; the current page lists July 2026 bulletins.",
  }),
] satisfies readonly SourceCoverageTarget[];

const UPRP_PL: Authority = {
  jurisdiction: "PL",
  authorityName: "Patent Office of the Republic of Poland (UPRP)",
  languages: ["pl-PL"],
  verificationEvidenceUri:
    "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",
};

export const UPRP_PL_SOURCE_COVERAGE_TARGETS = [
  target(UPRP_PL, {
    id: "pl-uprp-trademarks",
    family: "PORTAL",
    displayName: "UPRP Trademark Information",
    canonicalUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",
    verificationEvidenceUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-filing",
    family: "FILING",
    displayName: "UPRP National Trademark Procedure",
    canonicalUri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-",
    entrypoints: [
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-",
        label: "National trademark procedure",
      },
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe-/znaki-towarowe-informacje-podstawowe/jaka-dokumentacje-nalezy-zlozyc",
        label: "Trademark filing documentation",
      },
    ],
    verificationEvidenceUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-",
    notes:
      "The national procedure gives the filing sequence, prior-search tools, Nice-classified goods/services requirements, publication and opposition steps.",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-search",
    family: "SEARCH",
    displayName: "UPRP e-Wyszukiwarka",
    canonicalUri: "https://uprp.gov.pl/pl/uslugi-online/e-wyszukiwarka",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://uprp.gov.pl/pl/uslugi-online/e-wyszukiwarka",
    notes:
      "e-Wyszukiwarka is UPRP's unified public search across industrial-property databases and BUP/WUP publications.",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-fees",
    family: "FEES",
    displayName: "UPRP Trademark Procedure Fees",
    canonicalUri: "https://uprp.gov.pl/pl/przedmioty-ochrony/inne/oplaty-w-postepowaniu",
    entrypoints: [
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/inne/oplaty-w-postepowaniu",
        label: "Official procedure fee table",
      },
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa2/oplaty-zgloszeniowe",
        label: "National trademark filing fees",
      },
    ],
    verificationEvidenceUri: "https://uprp.gov.pl/pl/przedmioty-ochrony/inne/oplaty-w-postepowaniu",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "UPRP Nice Classification",
    canonicalUri: "https://uprp.gov.pl/pl/klasyfikacje",
    entrypoints: [
      { uri: "https://uprp.gov.pl/pl/klasyfikacje", label: "UPRP international classifications" },
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-",
        label: "Trademark procedure Nice classification guidance",
      },
    ],
    verificationEvidenceUri: "https://uprp.gov.pl/pl/klasyfikacje",
    notes:
      "UPRP lists the International Classification of Goods and Services (Nice Classification); its national trademark procedure requires a Nice-classified goods/services list and recommends TMclass.",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "UPRP President Trademark Guidelines",
    canonicalUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/ogolne-wytyczne-prezesa-uprp/wytyczne-w-zakresie-znakow-towarowych",
    verificationEvidenceUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/ogolne-wytyczne-prezesa-uprp/wytyczne-w-zakresie-znakow-towarowych",
    notes:
      "The President's trademark guidelines reflect current law and harmonize UPRP interpretation and examination practice.",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-law-proceedings",
    family: "LEGAL_TEXTS",
    displayName: "UPRP Trademark Law and Opposition Procedure",
    canonicalUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-/procedura-sprzeciwowa",
    entrypoints: [
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",
        label: "Trademark legal acts",
      },
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-/procedura-sprzeciwowa",
        label: "Trademark opposition procedure",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",
    notes:
      "The official trademark information page lists the Industrial Property Law and implementing trademark regulations; the national opposition procedure provides the three-month post-publication opposition framework.",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "UPRP Biuletyn Urzędu Patentowego - Trademarks",
    canonicalUri: "https://uprp.gov.pl/pl/publikacje/biuletyn-i-wiadomo%C5%9Bci-uprp",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://uprp.gov.pl/pl/publikacje/biuletyn-i-wiadomo%C5%9Bci-uprp",
    notes:
      "UPRP publishes weekly 2026 trademark BUP issues; publication of trademark applications starts the statutory opposition period.",
  }),
] satisfies readonly SourceCoverageTarget[];

const UPV_CZ: Authority = {
  jurisdiction: "CZ",
  authorityName: "Industrial Property Office of the Czech Republic (ÚPV)",
  languages: ["cs-CZ", "en"],
  verificationEvidenceUri: "https://upv.gov.cz/en/ip-rights/trademarks",
};

export const UPV_CZ_SOURCE_COVERAGE_TARGETS = [
  target(UPV_CZ, {
    id: "cz-upv-trademarks",
    family: "PORTAL",
    displayName: "Czech Industrial Property Office Trademarks",
    canonicalUri: "https://upv.gov.cz/en/ip-rights/trademarks",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-filing",
    family: "FILING",
    displayName: "ÚPV National Trademark Application",
    canonicalUri: "https://upv.gov.cz/en/ip-rights/trademarks/national-trademark-application",
    verificationEvidenceUri:
      "https://upv.gov.cz/en/ip-rights/trademarks/national-trademark-application",
    notes:
      "The national filing page specifies the required application contents, priority framework and Nice-classified goods/services list.",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-search",
    family: "SEARCH",
    displayName: "ÚPV Trademark Databases",
    canonicalUri:
      "https://upv.gov.cz/en/information-sources/national-databases/trademark-databases",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "XML"],
    verificationEvidenceUri:
      "https://upv.gov.cz/en/information-sources/national-databases/trademark-databases",
    notes:
      "The official national trademark database covers ÚPV, WIPO designations for the Czech Republic/EU and EUIPO records and exposes national trademark XML data.",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-fees",
    family: "FEES",
    displayName: "ÚPV Trademark Fees",
    canonicalUri: "https://upv.gov.cz/en/ip-rights/fees",
    verificationEvidenceUri: "https://upv.gov.cz/en/ip-rights/fees",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "ÚPV Trademark Classification",
    canonicalUri: "https://upv.gov.cz/informacni-zdroje/tridniky/tridnik-ochranne-znamky",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://upv.gov.cz/informacni-zdroje/tridniky/tridnik-ochranne-znamky",
    notes:
      "The current official classification page identifies Nice Classification 13th Edition, version 2026, and Vienna Classification 10th Edition 2026 as effective from 1 January 2026.",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "ÚPV National Trademark Legislation",
    canonicalUri: "https://upv.gov.cz/en/information-sources/legislation/national",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://upv.gov.cz/en/information-sources/legislation/national",
    notes:
      "The national legislation hub publishes Act No. 441/2003 Coll. on Trademarks, implementing Decree No. 97/2004 and related administrative-fee legislation.",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-common-practices",
    family: "EXAMINATION_MANUAL",
    displayName: "ÚPV Common Trademark Practices",
    canonicalUri:
      "https://upv.gov.cz/en/ip-rights/trademarks/common-communications-on-the-practice-of-euipo-and-eu-member-states",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://upv.gov.cz/en/ip-rights/trademarks/common-communications-on-the-practice-of-euipo-and-eu-member-states",
    notes:
      "The official Common Communications page maintains converged EUIPO/member-state trademark examination practices and principles based on court decisions and office best practices.",
  }),
  target(UPV_CZ, {
    id: "cz-upv-official-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "ÚPV Official Bulletin",
    canonicalUri: "https://upv.gov.cz/en/information-sources/ipo-bulletin",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://upv.gov.cz/en/information-sources/ipo-bulletin",
    notes:
      "The ÚPV Official Bulletin is a weekly digital-only publication containing published trademark applications and granted industrial-property rights.",
  }),
] satisfies readonly SourceCoverageTarget[];

const INDPROP_SK: Authority = {
  jurisdiction: "SK",
  authorityName: "Industrial Property Office of the Slovak Republic",
  languages: ["sk-SK", "en"],
  verificationEvidenceUri: "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks",
};

export const INDPROP_SK_SOURCE_COVERAGE_TARGETS = [
  target(INDPROP_SK, {
    id: "sk-indprop-trademarks",
    family: "PORTAL",
    displayName: "Slovak Industrial Property Office Trade Marks",
    canonicalUri: "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-filing",
    family: "FILING",
    displayName: "Slovak IPO File a Trade Mark Application",
    canonicalUri:
      "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/filing-a-trade-mark-application/file-a-trade-mark-application",
    verificationEvidenceUri:
      "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/filing-a-trade-mark-application/file-a-trade-mark-application",
    notes:
      "The official filing page covers electronic and paper applications, payment timing, examination/publication and Fast Track conditions.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-search",
    family: "SEARCH",
    displayName: "Slovak IPO Webregisters",
    canonicalUri:
      "https://www.indprop.gov.sk/en/databases-registries-and-classifications/databases-and-registries",
    entrypoints: [
      {
        uri: "https://www.indprop.gov.sk/en/databases-registries-and-classifications/databases-and-registries",
        label: "Databases and registries guidance",
      },
      { uri: "https://wbr.indprop.gov.sk", label: "Webregister direct access" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.indprop.gov.sk/en/databases-registries-and-classifications/databases-and-registries",
    notes:
      "The official Webregister contains trademark applications and registrations maintained by the Office and is updated daily.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-fees",
    family: "FEES",
    displayName: "Slovak IPO Trade Mark Fees",
    canonicalUri: "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/fees",
    verificationEvidenceUri:
      "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/fees",
    notes:
      "The official fee page publishes current administrative fees for trademark filing and subsequent proceedings under Act No. 145/1995 Coll.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Slovak IPO Trademark Classification Systems",
    canonicalUri:
      "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/classification-systems-trade-marks",
    verificationEvidenceUri:
      "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/classification-systems-trade-marks",
    notes:
      "The current official page identifies NCL(13-2026) as the Nice Classification version in force from 1 January 2026 and links the ezts goods/services tool.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Slovak IPO Trademark Legislation",
    canonicalUri:
      "https://www.indprop.gov.sk/en/legislation/legislation-of-the-slovak-republic/basic-legal-provisions-in-force/trade-marks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.indprop.gov.sk/en/legislation/legislation-of-the-slovak-republic/basic-legal-provisions-in-force/trade-marks",
    notes:
      "The official legislation page publishes Act No. 506/2009 Coll. on Trademarks and implementing Decree No. 567/2009 Coll., as amended.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-proceedings-forms",
    family: "PROCEEDINGS",
    displayName: "Slovak IPO Trademark Proceedings Forms",
    canonicalUri: "https://www.indprop.gov.sk/en/documents-and-forms/trade-marks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "DOCX"],
    verificationEvidenceUri: "https://www.indprop.gov.sk/en/documents-and-forms/trade-marks",
    notes:
      "The official trademark forms surface includes opposition, revocation, invalidity, renewal, transfer, licence and international-trademark proceedings forms.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-official-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Slovak IPO Official Gazette",
    canonicalUri: "https://indprop.gov.sk/en/products-and-services",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://indprop.gov.sk/en/products-and-services",
    notes:
      "The official Gazette includes trademarks and is published twice monthly; the official 2026 schedule lists issues through December and includes issue 15/2026 dated 12 August 2026.",
  }),
] satisfies readonly SourceCoverageTarget[];

const HIPO_HU: Authority = {
  jurisdiction: "HU",
  authorityName: "Hungarian Intellectual Property Office (HIPO)",
  languages: ["hu-HU", "en"],
  verificationEvidenceUri: "https://sztnh.gov.hu/en/services/trademark",
};

export const HIPO_HU_SOURCE_COVERAGE_TARGETS = [
  target(HIPO_HU, {
    id: "hu-hipo-trademarks",
    family: "PORTAL",
    displayName: "HIPO Trademark Protection",
    canonicalUri: "https://sztnh.gov.hu/en/services/trademark",
    verificationEvidenceUri: "https://sztnh.gov.hu/en/services/trademark",
    notes: "The current HIPO trademark portal was last modified on 27 January 2026.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-filing",
    family: "FILING",
    displayName: "HIPO National Trademark Application",
    canonicalUri: "https://sztnh.gov.hu/en/services/trademark/national-application",
    entrypoints: [
      {
        uri: "https://sztnh.gov.hu/en/services/trademark/national-application",
        label: "National trademark registration procedure",
      },
      {
        uri: "https://ugyintezes.sztnh.gov.hu/eBej2/step1",
        label: "HIPO electronic filing system",
      },
    ],
    verificationEvidenceUri: "https://sztnh.gov.hu/en/services/trademark/national-application",
    notes:
      "The national procedure covers filing-date requirements, examination, earlier-rights search, publication, three-month opposition, accelerated procedures, registration and renewal.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-search",
    family: "SEARCH",
    displayName: "HIPO IP Databases and E-register",
    canonicalUri: "https://sztnh.gov.hu/en/services/ip-databases",
    entrypoints: [
      { uri: "https://sztnh.gov.hu/en/services/ip-databases", label: "IP databases guidance" },
      { uri: "https://epub.hpo.hu/e-kutatas/?lang=HU", label: "E-register search" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://sztnh.gov.hu/en/services/ip-databases",
    notes:
      "HIPO's official IP databases provide trademark register and Gazette search; the public page identifies E-register as the search surface for Hungarian industrial-property records.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-fees",
    family: "FEES",
    displayName: "HIPO Trademark Schedule of Fees",
    canonicalUri: "https://sztnh.gov.hu/sw/static/file/dijtablazat_vedjegy-en_20250413.pdf",
    expectedArtifactKinds: ["PDF"],
    verificationEvidenceUri:
      "https://sztnh.gov.hu/sw/static/file/dijtablazat_vedjegy-en_20250413.pdf",
    notes:
      "The official trademark fee schedule is issued under Decree No. 19/2005 GKM and is in force from 13 April 2025; it covers filing, opposition, accelerated procedures, renewal, cancellation and revocation.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "HIPO Nice Classification",
    canonicalUri: "https://sztnh.gov.hu/en/services/trademark/classification/nice",
    entrypoints: [
      {
        uri: "https://sztnh.gov.hu/en/services/trademark/classification/nice",
        label: "Nice Classification guidance",
      },
      {
        uri: "http://classifications.sztnh.gov.hu/nice/",
        label: "Current Nice Classification browser",
      },
    ],
    verificationEvidenceUri: "https://sztnh.gov.hu/en/services/trademark/classification/nice",
    notes:
      "HIPO identifies the 13th edition of the Nice Classification as the current edition, effective from 1 January 2026.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "HIPO Trademark Legal Sources",
    canonicalUri: "https://sztnh.gov.hu/en/legal-sources-of-intellectual-property",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://sztnh.gov.hu/en/legal-sources-of-intellectual-property",
    notes:
      "The official legal-sources hub publishes Act XI of 1997 on trademarks and geographical indications, the formal-requirements decree and the industrial-property fees decree.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "HIPO Electronic Trademark Proceedings",
    canonicalUri: "https://ugyintezes.sztnh.gov.hu/eBej2/step1",
    entrypoints: [
      {
        uri: "https://ugyintezes.sztnh.gov.hu/eBej2/step1",
        label: "Electronic trademark forms and proceedings",
      },
      {
        uri: "https://sztnh.gov.hu/en/services/trademark/national-application",
        label: "Opposition and procedure guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://ugyintezes.sztnh.gov.hu/eBej2/step1",
    notes:
      "HIPO's electronic administration surface provides national trademark filing, accelerated-procedure, observation and opposition forms plus universal cancellation/revocation submissions.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "HIPO Gazette of Patents and Trademarks",
    canonicalUri: "https://sztnh.gov.hu/en/home/gazette",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://sztnh.gov.hu/en/home/gazette",
    notes:
      "The electronically signed Gazette continues in PDF; national and international trademark columns are published twice monthly, with 2026 issues available on the current official page.",
  }),
] satisfies readonly SourceCoverageTarget[];

const OSIM_RO: Authority = {
  jurisdiction: "RO",
  authorityName: "State Office for Inventions and Trademarks (OSIM)",
  languages: ["ro-RO", "en"],
  verificationEvidenceUri: "https://www.osim.ro/en/basic-information-trademarks",
};

export const OSIM_RO_SOURCE_COVERAGE_TARGETS = [
  target(OSIM_RO, {
    id: "ro-osim-trademarks",
    family: "PORTAL",
    displayName: "OSIM Trademark Information",
    canonicalUri: "https://www.osim.ro/en/basic-information-trademarks",
    verificationEvidenceUri: "https://www.osim.ro/en/basic-information-trademarks",
    notes:
      "The current OSIM trademark hub links national legislation, fees, filing guides, Nice/TMclass classification resources and international trademark services.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-filing",
    family: "FILING",
    displayName: "OSIM Online Filing - Trademarks",
    canonicalUri: "https://www.osim.ro/en/online-filing-trademarks",
    entrypoints: [
      {
        uri: "https://www.osim.ro/en/online-filing-trademarks",
        label: "Online filing - trademarks",
      },
      {
        uri: "https://www.osim.ro/en/online-filing-trademarks/guides",
        label: "Trademark registration guides",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.osim.ro/en/online-filing-trademarks",
    notes:
      "OSIM supports national trademark filing online and publishes current registration guidance covering filing, publication, examination and registration steps.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-search",
    family: "SEARCH",
    displayName: "OSIM National Trademark Online Register",
    canonicalUri: "https://api.osim.ro:8443/tm-registry",
    entrypoints: [
      {
        uri: "https://api.osim.ro:8443/tm-registry",
        label: "National trademark online register",
      },
      {
        uri: "https://www.osim.ro/en/basic-information-trademarks?id=29&view=category",
        label: "OSIM trademark documentary-search guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.osim.ro/en/basic-information-trademarks?id=29&view=category",
    notes:
      "OSIM identifies the national trademark register at api.osim.ro as its public database for Romanian trademark records.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-fees",
    family: "FEES",
    displayName: "OSIM 2026 Trademark Fees - Annex 4",
    canonicalUri: "https://www.osim.ro/images/Taxe/2026/Taxe-PI-01.01.2026-Anexa-4-Marci-OSIM.pdf",
    expectedArtifactKinds: ["PDF"],
    verificationEvidenceUri:
      "https://www.osim.ro/images/Taxe/2026/Taxe-PI-01.01.2026-Anexa-4-Marci-OSIM.pdf",
    notes:
      "The official Annex 4 publishes trademark and geographical-indication fees applicable from 1 January 2026.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "OSIM Trademark Classification Guidance",
    canonicalUri: "https://www.osim.ro/en/online-filing-trademarks/guides",
    entrypoints: [
      {
        uri: "https://www.osim.ro/en/online-filing-trademarks/guides",
        label: "Registration guide and Nice classification guidance",
      },
      {
        uri: "https://www.osim.ro/en/basic-information-trademarks",
        label: "OSIM Nice Classification and TMclass links",
      },
    ],
    verificationEvidenceUri: "https://www.osim.ro/en/online-filing-trademarks/guides",
    notes:
      "OSIM requires goods and services to be identified by Nice classes and points applicants to its Nice Classification and TMclass resources; the guide is kept on the current filing surface rather than freezing an older static classification PDF.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "OSIM Trademark Legislation",
    canonicalUri: "https://osim.ro/en/legislation-trademarks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://osim.ro/en/legislation-trademarks",
    notes:
      "The official legislation page publishes Law No. 84/1998 on Trademarks and Geographical Indications, the implementing regulations and the current 2026 fee annex.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "OSIM Trademark Proceedings and Forms",
    canonicalUri: "https://osim.ro/en/forms-trademarks",
    entrypoints: [
      { uri: "https://osim.ro/en/forms-trademarks", label: "Trademark forms including opposition" },
      {
        uri: "https://osim.ro/en/board-of-cancellation-trademarks",
        label: "Trademark cancellation board proceedings",
      },
      {
        uri: "https://osim.ro/en/board-of-appeal-trademarks",
        label: "Trademark appeal board proceedings",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "DOCX"],
    verificationEvidenceUri: "https://osim.ro/en/forms-trademarks",
    notes:
      "OSIM publishes the opposition form and maintains current trademark appeal and cancellation-board proceeding surfaces.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "OSIM Official Industrial Property Bulletin - Trademarks",
    canonicalUri: "https://osim.ro/en/trademarks-official-industrial-property-bulletin",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://osim.ro/en/trademarks-official-industrial-property-bulletin",
    notes:
      "The official BOPI Trademarks and Geographical Indications section publishes monthly 2026 issues and current trademark-application publication notices.",
  }),
] satisfies readonly SourceCoverageTarget[];

const BPO_BG: Authority = {
  jurisdiction: "BG",
  authorityName: "Patent Office of the Republic of Bulgaria (BPO)",
  languages: ["bg-BG", "en"],
  verificationEvidenceUri: "https://www.bpo.bg/en/obekti/marki/nay-vazhnoto-za-markata",
};

export const BPO_BG_SOURCE_COVERAGE_TARGETS = [
  target(BPO_BG, {
    id: "bg-bpo-trademarks",
    family: "PORTAL",
    displayName: "BPO Trademark Summary",
    canonicalUri: "https://www.bpo.bg/en/obekti/marki/nay-vazhnoto-za-markata",
    verificationEvidenceUri: "https://www.bpo.bg/en/obekti/marki/nay-vazhnoto-za-markata",
    notes:
      "The official trademark summary explains protectable signs, collective and certification marks, acquisition of rights and ten-year renewable protection.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-filing",
    family: "FILING",
    displayName: "BPO National Trademark Registration Procedure",
    canonicalUri:
      "https://www.bpo.bg/en/obekti/marki/vazmozhnost-za-registratsiya/registratsiya-po-natsionalen-red",
    entrypoints: [
      {
        uri: "https://www.bpo.bg/en/obekti/marki/vazmozhnost-za-registratsiya/registratsiya-po-natsionalen-red",
        label: "National trademark registration procedure",
      },
      {
        uri: "https://portal.bpo.bg/bpo-portal/eservices/services-trademark/service-definition/tm-efiling",
        label: "BPO electronic trademark filing",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://www.bpo.bg/en/obekti/marki/vazmozhnost-za-registratsiya/registratsiya-po-natsionalen-red",
    notes:
      "The current national procedure covers electronic filing, filing-date requirements, absolute-ground examination, publication, three-month opposition and registration.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-search",
    family: "SEARCH",
    displayName: "BPO State Register of Trademarks",
    canonicalUri: "https://portal.bpo.bg/bpo-registers/marks",
    entrypoints: [
      { uri: "https://www.bpo.bg/en/registri", label: "BPO state registers directory" },
      { uri: "https://portal.bpo.bg/bpo-registers/marks", label: "State Register of Trademarks" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.bpo.bg/en/registri",
    notes:
      "BPO's official registers directory links the public State Register of Trademarks on portal.bpo.bg.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-fees",
    family: "FEES",
    displayName: "BPO 2026 Tariffs and Trademark Fees",
    canonicalUri: "https://www.bpo.bg/en/tarifi",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.bpo.bg/en/tarifi",
    notes:
      "The official tariff surface publishes the Patent Office fee tariff and public-service price list in force from 1 January 2026, including trademark filing and proceeding fees.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "BPO Trademark Goods and Services Classification Guidance",
    canonicalUri: "https://www.bpo.bg/en/chzv/chzv-natsionalna-marka",
    entrypoints: [
      {
        uri: "https://www.bpo.bg/en/chzv/chzv-natsionalna-marka",
        label: "Current national trademark guidance with Nice-class requirements",
      },
      {
        uri: "https://www.bpo.bg/en/obekti/marki/klasifikatsii/nice-klasifikatsiya",
        label: "BPO Nice Classification reference page",
      },
    ],
    verificationEvidenceUri: "https://www.bpo.bg/en/chzv/chzv-natsionalna-marka",
    notes:
      "Current BPO national guidance requires applicants to choose Nice classes and provide the full goods/services list. The standalone BPO Nice page remains on a 2024 version, so it is retained only as a supplementary reference rather than the current canonical source.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "BPO Trademark Legislation",
    canonicalUri: "https://www.bpo.bg/bg/obekti/marki/zakonodatelstvo",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.bpo.bg/bg/obekti/marki/zakonodatelstvo",
    notes:
      "The Bulgarian-language official legislation page publishes the Trademarks and Geographical Indications Act as amended in State Gazette No. 24 of 6 March 2026, together with application, opposition and dispute ordinances.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "BPO Trademark Opposition, Appeals, Revocation and Invalidity",
    canonicalUri: "https://www.bpo.bg/en/obekti/sporove/sporove-protsedura",
    entrypoints: [
      {
        uri: "https://www.bpo.bg/en/obekti/sporove/sporove-protsedura",
        label: "Industrial-property dispute procedure",
      },
      {
        uri: "https://www.bpo.bg/en/obekti/sporove/sporove-elektronni-uslugi",
        label: "Electronic trademark appeal, revocation and invalidity services",
      },
      {
        uri: "https://www.bpo.bg/bg/obekti/marki/marki-elektronni-uslugi/",
        label: "Electronic trademark opposition service",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.bpo.bg/en/obekti/sporove/sporove-protsedura",
    notes:
      "BPO dispute panels hear opposition appeals and requests for invalidity, revocation and cancellation; official electronic services expose the corresponding trademark submissions.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-official-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "BPO Official Bulletin",
    canonicalUri: "https://www.bpo.bg/en/publikacii/bulletin",
    entrypoints: [
      { uri: "https://www.bpo.bg/en/publikacii/bulletin", label: "Official Bulletin guidance" },
      { uri: "https://portal.bpo.bg/bpo-journal/", label: "Electronic BPO Bulletin" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "PDF"],
    verificationEvidenceUri: "https://www.bpo.bg/en/publikacii/bulletin",
    notes:
      "The official bulletin is electronic-only and issued twice monthly; it publishes trademark applications, registrations and State Register changes.",
  }),
] satisfies readonly SourceCoverageTarget[];

const DZIV_HR: Authority = {
  jurisdiction: "HR",
  authorityName: "State Intellectual Property Office of the Republic of Croatia (SIPO/DZIV)",
  languages: ["hr-HR", "en"],
  verificationEvidenceUri:
    "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/",
};

export const DZIV_HR_SOURCE_COVERAGE_TARGETS = [
  target(DZIV_HR, {
    id: "hr-dziv-trademarks",
    family: "PORTAL",
    displayName: "Croatia SIPO Trademark Registration Process",
    canonicalUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/",
    verificationEvidenceUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/",
    notes:
      "The current national registration hub explains Nice-class goods/services lists, filing requirements, applicable law, prior-right searches and the Croatian trademark registration route.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-filing",
    family: "FILING",
    displayName: "Croatia SIPO e-Filing for Trademarks",
    canonicalUri: "https://www.dziv.hr/en/e-services/e-filing/trademarks/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://www.dziv.hr/en/e-services/e-filing/trademarks/",
    notes:
      "The trademark e-filing service page, updated in March 2026, covers national applications and subsequent submissions including opposition, revocation and invalidity proceedings.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-search",
    family: "SEARCH",
    displayName: "Croatia SIPO e-Register of Trademarks",
    canonicalUri: "https://www.dziv.hr/en/e-services/e-registers/trademarks/",
    entrypoints: [
      {
        uri: "https://www.dziv.hr/en/e-services/e-registers/trademarks/",
        label: "National trademark e-register",
      },
      {
        uri: "https://www.dziv.hr/en/e-services/e-registers/",
        label: "SIPO e-registers directory",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.dziv.hr/en/e-services/e-registers/trademarks/",
    notes:
      "SIPO provides a public online trademark e-register for Croatian national trademark applications and registrations.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-fees",
    family: "FEES",
    displayName: "Croatia SIPO Trademark Fees",
    canonicalUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/fees/",
    entrypoints: [
      {
        uri: "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/fees/",
        label: "Trademark procedural costs",
      },
      {
        uri: "https://www.dziv.hr/en/forms-and-publications/fees/",
        label: "SIPO fees legal basis",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/fees/",
    notes:
      "The official fee surface links the basic trademark procedural costs and the legislation governing administrative and professional-service charges.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Croatia SIPO Nice Classification and TMclass Practice",
    canonicalUri:
      "https://www.dziv.hr/hr/prirucnik-za-ispitivanje-zigova/poglavlje-iii-klasifikacija/3-2-opca-pravila/",
    entrypoints: [
      {
        uri: "https://www.dziv.hr/hr/prirucnik-za-ispitivanje-zigova/poglavlje-iii-klasifikacija/3-2-opca-pravila/",
        label: "Trademark examination manual classification rules",
      },
      {
        uri: "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/",
        label: "Current registration process requiring Nice Classification",
      },
    ],
    verificationEvidenceUri:
      "https://www.dziv.hr/hr/prirucnik-za-ispitivanje-zigova/poglavlje-iii-klasifikacija/3-2-opca-pravila/",
    notes:
      "SIPO requires goods/services to be classified under Nice and recommends the harmonised TMclass terminology, including through the integrated e-filing workflow; this practice surface avoids treating older static Nice-edition content as current truth.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Croatia SIPO Trademark Legislation",
    canonicalUri: "https://www.dziv.hr/en/ip-legislation/national-legislation/trademarks/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.dziv.hr/en/ip-legislation/national-legislation/trademarks/",
    notes:
      "The official national legislation page publishes the Trademark Act (OG 14/2019) and Trademark Regulations (OG 38/2019), together with former legislation for transitional proceedings.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Croatia SIPO Trademark Opposition, Revocation and Invalidity Forms",
    canonicalUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/forms-and-publications/",
    entrypoints: [
      {
        uri: "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/forms-and-publications/",
        label: "Trademark forms and proceedings publications",
      },
      {
        uri: "https://www.dziv.hr/en/e-services/e-filing/trademarks/",
        label: "Electronic two-party trademark proceedings",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "DOCX"],
    verificationEvidenceUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/forms-and-publications/",
    notes:
      "The current forms page, updated in March 2026, includes opposition, revocation and invalidity forms, while the e-filing service supports their electronic submission.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-official-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Croatian Intellectual Property Gazette",
    canonicalUri: "https://www.dziv.hr/en/the-croatian-intellectual-property-gazette/",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.dziv.hr/en/the-croatian-intellectual-property-gazette/",
    notes:
      "The Croatian Intellectual Property Gazette is SIPO's official publication surface for requested and valid IP rights; trademark publication operates on a biweekly rhythm relevant to opposition timing.",
  }),
] satisfies readonly SourceCoverageTarget[];

const SIPO_SI: Authority = {
  jurisdiction: "SI",
  authorityName: "Slovenian Intellectual Property Office (SIPO/URSIL)",
  languages: ["sl-SI", "en"],
  verificationEvidenceUri: "https://www.gov.si/en/topics/trademarks/",
};

export const SIPO_SI_SOURCE_COVERAGE_TARGETS = [
  target(SIPO_SI, {
    id: "si-sipo-trademarks",
    family: "PORTAL",
    displayName: "Slovenian Intellectual Property Office Trademarks",
    canonicalUri: "https://www.gov.si/en/topics/trademarks/",
    verificationEvidenceUri: "https://www.gov.si/en/topics/trademarks/",
    notes:
      "The current GOV.SI trademark hub covers national protection, opposition, maintenance, changes, international protection, legislation and official databases; it was updated in February 2026.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-filing",
    family: "FILING",
    displayName: "SIPO Registering a Trademark",
    canonicalUri: "https://www.gov.si/en/registries/services/registering-a-trademark/",
    entrypoints: [
      {
        uri: "https://www.gov.si/en/registries/services/registering-a-trademark/",
        label: "Current national registration procedure",
      },
      { uri: "https://eil.uil-sipo.si/", label: "SIPO online trademark application" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://www.gov.si/en/registries/services/registering-a-trademark/",
    notes:
      "The national registration service was updated on 18 March 2026 and documents electronic/paper filing, Nice-class goods and services, formal and substantive examination, publication, three-month opposition and registration.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-search",
    family: "SEARCH",
    displayName: "SIPO Marks Information Database",
    canonicalUri: "https://www2.uil-sipo.si/que021.stm",
    entrypoints: [
      { uri: "https://www2.uil-sipo.si/default1.stm", label: "SIPO information databases" },
      { uri: "https://www2.uil-sipo.si/que021.stm", label: "Marks query guide" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www2.uil-sipo.si/que021.stm",
    notes:
      "The official SIPO marks database contains applications and registered marks and supports queries by mark text, Nice class, publication date, status, applicant, owner and representative; the indexed English surface was updated on 28 July 2026.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-fees",
    family: "FEES",
    displayName: "SIPO Fees and Charges",
    canonicalUri:
      "https://www.gov.si/assets/organi-v-sestavi/URSIL/Dokumenti/Seznami-cenik/Pristojbine-takse-in-cenik-storitev-Urada-za-intelektualno-lastnino.docx",
    expectedArtifactKinds: ["DOCX"],
    verificationEvidenceUri:
      "https://www.gov.si/en/state-authorities/bodies-within-ministries/slovenian-intellectual-property-office/",
    notes:
      "The Office publishes its official fees, administrative charges and service price list as a GOV.SI document linked from the current SIPO authority page.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "SIPO Nice Classification 13-2026",
    canonicalUri:
      "https://www.gov.si/novice/2025-12-19-nova-nicejska-klasifikacija-2026-spremembe-pri-razvrstitvi-blaga-in-storitev/",
    entrypoints: [
      {
        uri: "https://www.gov.si/novice/2025-12-19-nova-nicejska-klasifikacija-2026-spremembe-pri-razvrstitvi-blaga-in-storitev/",
        label: "Official 2026 Nice Classification notice",
      },
      {
        uri: "https://www.gov.si/en/registries/services/registering-a-trademark/",
        label: "Current filing guidance requiring Nice Classification",
      },
    ],
    verificationEvidenceUri:
      "https://www.gov.si/novice/2025-12-19-nova-nicejska-klasifikacija-2026-spremembe-pri-razvrstitvi-blaga-in-storitev/",
    notes:
      "SIPO announced that the 13th edition of the Nice Classification took effect on 1 January 2026 for applications filed from that date, with no retroactive reclassification of earlier marks.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Slovenia Industrial Property Act and Trademark Rules",
    canonicalUri: "https://pisrs.si/Pis.web/pregledPredpisa?id=ZAKO1668",
    entrypoints: [
      {
        uri: "https://pisrs.si/Pis.web/pregledPredpisa?id=ZAKO1668",
        label: "Industrial Property Act",
      },
      {
        uri: "https://pisrs.si/Pis.web/pregledPredpisa?id=PRAV14047",
        label: "Trademark Rules",
      },
      {
        uri: "https://www.gov.si/en/topics/trademarks/",
        label: "SIPO trademark legislation hub and consolidated Act attachment",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "DOCX"],
    verificationEvidenceUri: "https://pisrs.si/Pis.web/pregledPredpisa?id=ZAKO1668",
    notes:
      "The current SIPO registration and dispute services cite the Industrial Property Act and Trademark Rules; both official legal texts are maintained in Slovenia's PISRS legal information system.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "SIPO Trademark Opposition, Revocation and Invalidity",
    canonicalUri:
      "https://www.gov.si/en/registries/services/opposition-to-a-trademark-registration/",
    entrypoints: [
      {
        uri: "https://www.gov.si/en/registries/services/opposition-to-a-trademark-registration/",
        label: "Trademark opposition procedure",
      },
      {
        uri: "https://www.gov.si/en/registries/services/revocation-of-a-trademark/",
        label: "Trademark revocation procedure",
      },
      {
        uri: "https://www.gov.si/en/registries/services/declaration-of-invalidity-of-a-trademark/",
        label: "Trademark invalidity procedure",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri:
      "https://www.gov.si/en/registries/services/opposition-to-a-trademark-registration/",
    notes:
      "SIPO provides electronic and written opposition, revocation and invalidity procedures; opposition to national applications is due within three months of bulletin publication, while revocation/invalidity requests carry the prescribed proceeding fee.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-industrial-property-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "SIPO Official Bulletin on Industrial Property",
    canonicalUri:
      "https://www.uil-sipo.si/uil/dejavnosti/informacijske-storitve/bilten-za-industrijsko-lastnino/",
    entrypoints: [
      {
        uri: "https://www.gov.si/en/state-authorities/bodies-within-ministries/slovenian-intellectual-property-office/",
        label: "Current SIPO authority page linking the Industrial Property Bulletin",
      },
      {
        uri: "https://www2.uil-sipo.si/s/bil/is.dll?tsl=",
        label: "Electronic Industrial Property Bulletin system",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.gov.si/en/state-authorities/bodies-within-ministries/slovenian-intellectual-property-office/",
    notes:
      "SIPO identifies the Industrial Property Bulletin as its official publication for industrial-property rights and links the electronic PDF bulletin system; trademark application and registration publication dates trigger procedural consequences such as opposition timing.",
  }),
] satisfies readonly SourceCoverageTarget[];

const OBI_GR: Authority = {
  jurisdiction: "GR",
  authorityName: "Hellenic Industrial Property Organisation (OBI)",
  languages: ["el-GR", "en"],
  verificationEvidenceUri: "https://www.obi.gr/en/trademarks/",
};

export const OBI_GR_SOURCE_COVERAGE_TARGETS = [
  target(OBI_GR, {
    id: "gr-obi-trademarks",
    family: "PORTAL",
    displayName: "OBI Trade Marks",
    canonicalUri: "https://www.obi.gr/en/trademarks/",
    verificationEvidenceUri: "https://www.obi.gr/en/trademarks/",
    notes:
      "OBI is the sole competent authority for trademark registration in Greece and maintains the official National Trademark Register under Law 4796/2021 and Law 4679/2020.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-filing",
    family: "FILING",
    displayName: "Greece OBI Electronic Trademark Filing",
    canonicalUri:
      "https://www.gov.gr/en/ipiresies/epikheirematike-drasterioteta/adeiodoteseis-kai-summorphose/elektronike-katathese-emporikou-sematos",
    entrypoints: [
      {
        uri: "https://www.gov.gr/en/ipiresies/epikheirematike-drasterioteta/adeiodoteseis-kai-summorphose/elektronike-katathese-emporikou-sematos",
        label: "Gov.gr trademark filing service",
      },
      {
        uri: "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/ethnika-simata/online-trade-marks-filing/",
        label: "OBI online filing guidance",
      },
      { uri: "https://tmfo.obi.gr/", label: "OBI trademark e-filing system" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/ethnika-simata/online-trade-marks-filing/",
    notes:
      "Current OBI/gov.gr filing guidance requires TAXIS credentials, filing documents and a Nice-classified goods/services list; the National Administrative Procedures Register was updated in July 2026.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-search",
    family: "SEARCH",
    displayName: "OBI Trademark Availability Check",
    canonicalUri:
      "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/trade-marks-availability-check/",
    entrypoints: [
      {
        uri: "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/trade-marks-availability-check/",
        label: "OBI official availability-check guidance",
      },
      {
        uri: "https://www.obi.gr/en/trademarks/",
        label: "National Trademark Register status guidance",
      },
    ],
    verificationEvidenceUri:
      "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/trade-marks-availability-check/",
    notes:
      "OBI recommends TMview for prior-mark availability searching but explicitly states that TMview is informational rather than the binding National Trademark Register; results should be verified against the official register maintained by OBI.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-fees",
    family: "FEES",
    displayName: "OBI Trademark Fees",
    canonicalUri: "https://www.obi.gr/teli/teli-emporikon-simaton/",
    entrypoints: [
      { uri: "https://www.obi.gr/en/trademarks/fees/", label: "English trademark fees guidance" },
      {
        uri: "https://www.obi.gr/teli/teli-emporikon-simaton/",
        label: "Detailed trademark fee table",
      },
    ],
    verificationEvidenceUri: "https://www.obi.gr/teli/teli-emporikon-simaton/",
    notes:
      "The current OBI fee table publishes electronic and paper filing, additional-class, renewal, assignment, licence, opposition/appeal and other trademark proceeding fees.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "OBI Trademark Classification Classes",
    canonicalUri: "https://www.obi.gr/emporika-simata/taxinomisi-simaton-klaseis/",
    entrypoints: [
      {
        uri: "https://www.obi.gr/emporika-simata/taxinomisi-simaton-klaseis/",
        label: "Current Greek trademark classification page",
      },
      {
        uri: "https://www.obi.gr/en/trademarks/trade-marks-classification-classes/",
        label: "English trademark class guidance",
      },
      {
        uri: "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/ethnika-simata/online-trade-marks-filing/",
        label: "TMclass and acceptable-term filing guidance",
      },
    ],
    verificationEvidenceUri: "https://www.obi.gr/emporika-simata/taxinomisi-simaton-klaseis/",
    notes:
      "OBI's current classification page announces Nice Classification 13th Edition effective from 1 January 2026; its e-filing guidance recommends TMclass acceptable terminology and explains class-heading scope.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "OBI Trademark Legislation",
    canonicalUri: "https://www.obi.gr/en/trademarks/related-legislation-trademarks/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.obi.gr/en/trademarks/related-legislation-trademarks/",
    notes:
      "The official trademark legislation page publishes Law 4679/2020 and current OBI guidance spanning filing, registration, opposition and cancellation procedures.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "OBI Administrative Committee of Trademarks Proceedings",
    canonicalUri: "https://www.obi.gr/emporika-simata/dioikitiki-epitropi-simaton/",
    entrypoints: [
      {
        uri: "https://www.obi.gr/emporika-simata/dioikitiki-epitropi-simaton/",
        label: "Administrative Committee of Trademarks",
      },
      {
        uri: "https://www.obi.gr/emporika-simata/dioikitiki-epitropi-simaton/ekthemata/",
        label: "2026 committee hearing exhibits and schedules",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.obi.gr/emporika-simata/dioikitiki-epitropi-simaton/",
    notes:
      "The Administrative Committee handles trademark oppositions, appeals, interventions and applications under Law 4679/2020; the official site publishes 2026 hearing schedules and exhibits.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-decisions",
    family: "OFFICIAL_GAZETTE",
    displayName: "Greece Official Trademark Registration Decisions",
    canonicalUri:
      "https://www.gov.gr/en/upourgeia/upourgeio-anaptuxes/organismos-biomekhanikes-idioktesias-obi/apophaseis-katokhuroses-emporikon-sematon",
    entrypoints: [
      {
        uri: "https://www.gov.gr/en/upourgeia/upourgeio-anaptuxes/organismos-biomekhanikes-idioktesias-obi/apophaseis-katokhuroses-emporikon-sematon",
        label: "Gov.gr trademark registration decisions service",
      },
      {
        uri: "https://www.obi.gr/emporika-simata/dioikitiki-epitropi-simaton/ekthemata/",
        label: "Current Administrative Committee hearing exhibits",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "PDF"],
    verificationEvidenceUri:
      "https://www.gov.gr/en/upourgeia/upourgeio-anaptuxes/organismos-biomekhanikes-idioktesias-obi/apophaseis-katokhuroses-emporikon-sematon",
    notes:
      "Gov.gr exposes a current OBI service for examiner and Administrative Committee trademark-registration decisions; together with current committee exhibits it provides a high-value official change signal for newly issued decisions and contested matters.",
  }),
] satisfies readonly SourceCoverageTarget[];

const CY_IP: Authority = {
  jurisdiction: "CY",
  authorityName:
    "Intellectual Property Section, Department of Registrar of Companies and Intellectual Property",
  languages: ["el-CY", "en"],
  verificationEvidenceUri:
    "https://www.intellectualproperty.gov.cy/en/intellectual-property-rights/trademark/1-lifecycle/1-registering-a-trademark",
};

export const CY_IP_SOURCE_COVERAGE_TARGETS = [
  target(CY_IP, {
    id: "cy-ip-trademarks",
    family: "PORTAL",
    displayName: "Cyprus Trademark Registration Lifecycle",
    canonicalUri:
      "https://www.intellectualproperty.gov.cy/en/intellectual-property-rights/trademark/1-lifecycle/1-registering-a-trademark",
    verificationEvidenceUri:
      "https://www.intellectualproperty.gov.cy/en/intellectual-property-rights/trademark/1-lifecycle/1-registering-a-trademark",
    notes:
      "The Republic of Cyprus Intellectual Property Section maintains the national trademark lifecycle, registration, management and termination guidance and links the current electronic services.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-filing",
    family: "FILING",
    displayName: "Cyprus FTM02 Trademark Application",
    canonicalUri: "https://www.gov.cy/en/service/ftm02-application-for-trademark/",
    entrypoints: [
      {
        uri: "https://www.gov.cy/en/service/ftm02-application-for-trademark/",
        label: "FTM02 application service",
      },
      {
        uri: "https://www.gov.cy/en/services/epixeirhmatikh-drasthriothta/eggrafh-ethnikou-emporikou-shmatos/",
        label: "National trademark services directory",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://www.gov.cy/en/service/ftm02-application-for-trademark/",
    notes:
      "FTM02 is the current national trademark application e-service of the Intellectual Property Section and uses CY Login plus departmental profile activation.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-search",
    family: "SEARCH",
    displayName: "Cyprus Trademarks Register Search",
    canonicalUri: "https://www.gov.cy/en/service/search-in-the-trademark-registry/",
    entrypoints: [
      {
        uri: "https://www.gov.cy/en/service/search-in-the-trademark-registry/",
        label: "Search in the Trademarks Register",
      },
      {
        uri: "https://www.intellectualproperty.gov.cy/en/21-eservices/esearch",
        label: "IP eSearch directory",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.gov.cy/en/service/search-in-the-trademark-registry/",
    notes:
      "The current gov.cy service exposes official information from the Cyprus Trademarks Register under the Intellectual Property Section.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-fees",
    family: "FEES",
    displayName: "Cyprus Trademark Forms and Fees",
    canonicalUri: "https://www.intellectualproperty.gov.cy/en/knowledgebase/forms-fees",
    verificationEvidenceUri: "https://www.intellectualproperty.gov.cy/en/knowledgebase/forms-fees",
    notes:
      "The current official forms-and-fees catalogue lists national trademark filing, renewal, register, opposition and other procedure forms and fees, including the FTM14 opposition fee.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Cyprus FTM03 Goods and Services Classification",
    canonicalUri:
      "https://www.gov.cy/en/service/trademarks-ftm03-change-of-classification-of-goods-and-services/",
    entrypoints: [
      {
        uri: "https://www.gov.cy/en/service/trademarks-ftm03-change-of-classification-of-goods-and-services/",
        label: "FTM03 classification service",
      },
      {
        uri: "https://www.intellectualproperty.gov.cy/en/intellectual-property-rights/trademark/1-lifecycle/1-registering-a-trademark",
        label: "Current trademark registration guidance",
      },
    ],
    verificationEvidenceUri:
      "https://www.gov.cy/en/service/trademarks-ftm03-change-of-classification-of-goods-and-services/",
    notes:
      "Cyprus maintains a dedicated current e-service for amendment of trademark goods/services classification; the registration lifecycle provides the complementary application context without freezing an unverified Nice-edition page.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Cyprus Trade Marks Law and Regulations",
    canonicalUri: "https://www.intellectualproperty.gov.cy/en/knowledgebase/legislation",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.intellectualproperty.gov.cy/en/knowledgebase/legislation",
    notes:
      "The official legislation catalogue publishes the Trade Marks Law and Trade Marks Regulations governing national trademark registration and proceedings.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Cyprus Trademark Opposition, Revocation and Invalidity Proceedings",
    canonicalUri: "https://www.gov.cy/en/service/trademarks-ftm14-opposition/",
    entrypoints: [
      {
        uri: "https://www.gov.cy/en/service/trademarks-ftm14-opposition/",
        label: "FTM14 opposition",
      },
      {
        uri: "https://www.gov.cy/en/services/epixeirhmatikh-drasthriothta/eggrafh-ethnikou-emporikou-shmatos/",
        label: "FTM14-FTM28 opposition, revocation and invalidity services",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.gov.cy/en/service/trademarks-ftm14-opposition/",
    notes:
      "The current gov.cy trademark service family provides electronic opposition plus supporting-document, hearing, revocation and invalidity procedures through FTM14-FTM28.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Cyprus Official Gazette Fifth Supplement Part II",
    canonicalUri:
      "https://www.mof.gov.cy/mof/gpo/gazette.nsf/dmlgaz_appsw_gr/dmlgaz_appsw_gr?Click=&Count=1000&OpenDocument=&OpenView=&app=11&cp=21",
    entrypoints: [
      {
        uri: "https://www.gov.cy/en/service/search-publication-entries-of-trademarks/",
        label: "Search trademark publication entries",
      },
      {
        uri: "https://www.intellectualproperty.gov.cy/en/knowledgebase/gazette",
        label: "IP Section Gazette knowledgebase",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.mof.gov.cy/mof/gpo/gazette.nsf/dmlgaz_appsw_gr/dmlgaz_appsw_gr?Click=&Count=1000&OpenDocument=&OpenView=&app=11&cp=21",
    notes:
      "The Government Printing Office Fifth Supplement Part II publishes trademarks and international trademarks; the current official listing includes multiple 2026 issues through June 2026 and is paired with the live trademark-publication search service.",
  }),
] satisfies readonly SourceCoverageTarget[];

const IPRD_MT: Authority = {
  jurisdiction: "MT",
  authorityName: "Industrial Property Registrations Directorate, Commerce Department",
  languages: ["mt-MT", "en"],
  verificationEvidenceUri:
    "https://commerce.gov.mt/en/industrial-property-registrations-directorate/",
};

export const IPRD_MT_SOURCE_COVERAGE_TARGETS = [
  target(IPRD_MT, {
    id: "mt-iprd-trademarks",
    family: "PORTAL",
    displayName: "Malta Industrial Property Registrations Directorate - Trademarks",
    canonicalUri:
      "https://commerce.gov.mt/en/industrial-property-registrations-directorate/trademarks/",
    verificationEvidenceUri:
      "https://commerce.gov.mt/en/industrial-property-registrations-directorate/",
    notes:
      "The Industrial Property Registrations Directorate within Malta's Commerce Department is the national authority responsible for trademark registration, amendments, renewals, transfers and cancellations.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-filing",
    family: "FILING",
    displayName: "Malta How to Apply for a Trademark",
    canonicalUri:
      "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/",
    entrypoints: [
      {
        uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/",
        label: "Current filing guidance",
      },
      { uri: "https://ips.gov.mt/welcome/?lang=en", label: "Malta IP portal online filing" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/",
    notes:
      "The current filing page directs applicants to the online IP portal, recommends a national pre-application search and explains class selection and the application process.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-search",
    family: "SEARCH",
    displayName: "Malta National Trademark Register",
    canonicalUri: "https://ips.gov.mt/NR/",
    entrypoints: [
      { uri: "https://ips.gov.mt/NR/", label: "National Trademark Register" },
      {
        uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/searching/",
        label: "Official search guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://commerce.gov.mt/en/industrial-property-registrations-directorate/searching/",
    notes:
      "The national register provides public searches by application number, mark name, legal status, Nice class, filing date, applicant and representative; current 2026 records expose publication and opposition-period data.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-fees",
    family: "FEES",
    displayName: "Malta Trademark Fee Schedule",
    canonicalUri:
      "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/schedule-of-fees-for-trademarks/",
    entrypoints: [
      {
        uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/schedule-of-fees-for-trademarks/",
        label: "Trademark fee schedule",
      },
      {
        uri: "https://commerce.gov.mt/en/frequently-asked-questions-related-to-industrial-property-registrations-directorate/trademark/",
        label: "Current trademark FAQ and filing fee",
      },
    ],
    verificationEvidenceUri:
      "https://commerce.gov.mt/en/frequently-asked-questions-related-to-industrial-property-registrations-directorate/trademark/",
    notes:
      "The current Commerce Department FAQ states a €115 fee for a new national trademark covering filing, registration and publication, while the official fee-schedule page remains the procedural fee reference.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Malta Trademark Classification and TMClass Guidance",
    canonicalUri:
      "https://commerce.gov.mt/en/frequently-asked-questions-related-to-industrial-property-registrations-directorate/trademark/",
    entrypoints: [
      {
        uri: "https://commerce.gov.mt/en/frequently-asked-questions-related-to-industrial-property-registrations-directorate/trademark/",
        label: "Current trademark classification FAQ",
      },
      {
        uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/",
        label: "Current filing/class guidance",
      },
    ],
    verificationEvidenceUri:
      "https://commerce.gov.mt/en/frequently-asked-questions-related-to-industrial-property-registrations-directorate/trademark/",
    notes:
      "The current official FAQ uses the 45 Nice goods/services categories and recommends TMClass for accepted terminology. Older static 11th-edition attachments are deliberately not treated as current canonical classification truth.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Malta Trademark Act and Trademark Rules",
    canonicalUri:
      "https://commerce.gov.mt/en/industrial-property-registrations-directorate/advice/",
    entrypoints: [
      {
        uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/advice/",
        label: "Current trademark-law guidance",
      },
      {
        uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/trademarks-explained/",
        label: "Trademark Act and Rules reference",
      },
    ],
    verificationEvidenceUri:
      "https://commerce.gov.mt/en/industrial-property-registrations-directorate/advice/",
    notes:
      "The current law is primarily the Trademark Act, Act XII of 2019, Chapter 597, with Trademark Rules S.L. 597.04; the official advice page was updated in April 2026.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Malta Trademark Opposition Proceedings",
    canonicalUri:
      "https://commerce.gov.mt/en/service/applikazzjoni-biex-topponi-talba-ghal-trejdmark-gdida/",
    entrypoints: [
      {
        uri: "https://commerce.gov.mt/en/service/applikazzjoni-biex-topponi-talba-ghal-trejdmark-gdida/",
        label: "Application to oppose a new trademark",
      },
      { uri: "https://ips.gov.mt/welcome/?lang=en", label: "Online notice of opposition" },
      {
        uri: "https://commerce.gov.mt/en/intellectual-property/latest-publications/",
        label: "90-day opposition timing guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri:
      "https://commerce.gov.mt/en/service/applikazzjoni-biex-topponi-talba-ghal-trejdmark-gdida/",
    notes:
      "A third party may oppose during the publication phase; the official online portal exposes a Notice of Opposition service and the current publication page confirms the 90-day period under S.L. 597.04.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-ip-online-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "Malta IP Online Journal",
    canonicalUri: "https://commerce.gov.mt/en/intellectual-property/latest-publications/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://commerce.gov.mt/en/intellectual-property/latest-publications/",
    notes:
      "The IP Online Journal is issued weekly on the first working day of the week; the official current page links Publications 2026 and states that trademark publication starts the 90-day opposition period.",
  }),
] satisfies readonly SourceCoverageTarget[];

const EPA_EE: Authority = {
  jurisdiction: "EE",
  authorityName: "Estonian Patent Office (Patendiamet)",
  languages: ["et-EE", "en"],
  verificationEvidenceUri: "https://www.epa.ee/en",
};

export const EPA_EE_SOURCE_COVERAGE_TARGETS = [
  target(EPA_EE, {
    id: "ee-epa-trademarks",
    family: "PORTAL",
    displayName: "Estonian Patent Office Trade Marks",
    canonicalUri: "https://www.epa.ee/en",
    verificationEvidenceUri: "https://www.epa.ee/en",
    notes:
      "The Estonian Patent Office is the national industrial-property authority and its current portal provides trademark filing, search, fees, legal guidance, proceedings and Gazette services.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-filing",
    family: "FILING",
    displayName: "Estonian Patent Office National Trademark Filing",
    canonicalUri:
      "https://www.epa.ee/en/trade-marks/filing-application/how-protect-your-trade-mark",
    entrypoints: [
      {
        uri: "https://www.epa.ee/en/trade-marks/filing-application/how-protect-your-trade-mark",
        label: "National trademark filing guidance",
      },
      { uri: "https://www.epa.ee/en/e-services", label: "Patent Office electronic services" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://www.epa.ee/en/trade-marks/filing-application/how-protect-your-trade-mark",
    notes:
      "Current filing guidance directs applicants to file a national trademark application with the Estonian Patent Office electronically or on the official form and links the Office's e-services.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-search",
    family: "SEARCH",
    displayName: "Estonian Patent Office Trademark Database",
    canonicalUri: "https://www.epa.ee/en/trade-marks/search-databases/trade-marks-databases",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.epa.ee/en/trade-marks/search-databases/trade-marks-databases",
    notes:
      "The official trademark database covers national applications and registrations plus international marks protected or filed in Estonia and is updated daily; the Office distinguishes its informative search view from legally effective registry and Gazette data.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-fees",
    family: "FEES",
    displayName: "Estonian Patent Office Trademark Fees",
    canonicalUri: "https://www.epa.ee/en/trade-marks/filing-application/fees",
    verificationEvidenceUri: "https://www.epa.ee/en/trade-marks/filing-application/fees",
    notes:
      "The current official fee page publishes national trademark filing, additional-class, renewal and other trademark procedure fees and was updated in December 2025.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Estonian Patent Office Nice Classification 13-2026",
    canonicalUri: "https://www.epa.ee/kaubamargid/kaubad-ja-teenused/loend-klasside-kaupa",
    entrypoints: [
      {
        uri: "https://www.epa.ee/kaubamargid/kaubad-ja-teenused/loend-klasside-kaupa",
        label: "Nice Classification 13th edition 2026 class list",
      },
      {
        uri: "https://www.epa.ee/en/trade-marks/filing-application/goods-and-services",
        label: "English goods and services guidance",
      },
      {
        uri: "https://www.epa.ee/en/trade-marks/filing-application/scope-legal-protection",
        label: "Current legal-protection and Nice-edition guidance",
      },
    ],
    verificationEvidenceUri:
      "https://www.epa.ee/kaubamargid/kaubad-ja-teenused/loend-klasside-kaupa",
    notes:
      "The official class-by-class list identifies Nice Classification 13th edition, 2026 version; current filing guidance requires goods and services to use the valid Nice edition.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Estonia Trademark Legal Acts",
    canonicalUri: "https://www.epa.ee/en/node/235",
    entrypoints: [
      { uri: "https://www.epa.ee/en/node/235", label: "Patent Office legal acts" },
      {
        uri: "https://www.riigiteataja.ee/en/eli/527022024003/consolide",
        label: "Consolidated Trade Marks Act in Riigi Teataja",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.epa.ee/en/node/235",
    notes:
      "The Patent Office legal-acts surface links Estonia's Trade Marks Act and related rules; the consolidated authentic legal text is maintained in the official Riigi Teataja system.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Estonia Trademark Opposition and Board of Appeal Proceedings",
    canonicalUri: "https://www.epa.ee/en/trade-marks/additional-info/opposition",
    entrypoints: [
      {
        uri: "https://www.epa.ee/en/trade-marks/additional-info/opposition",
        label: "Trademark opposition guidance",
      },
      { uri: "https://www.epa.ee/en/appeals/board-appeals", label: "Board of Appeal" },
      { uri: "https://www.epa.ee/en/e-services", label: "Electronic revocation submissions" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.epa.ee/en/trade-marks/additional-info/opposition",
    notes:
      "The Industrial Property Board of Appeal handles trademark challenges; the official opposition page explains the two-month contest period following Gazette publication and the Office also provides electronic proceeding services.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Estonian Trade Mark Gazette",
    canonicalUri:
      "https://www.epa.ee/en/trade-marks/managing-trade-marks/estonian-trade-mark-gazette",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.epa.ee/en/trade-marks/managing-trade-marks/estonian-trade-mark-gazette",
    notes:
      "The Estonian Trade Mark Gazette is the Office's official digital periodical, issued 24 times per year; the current page lists 2026 PDF issues and publishes registration decisions, registered marks and register amendments.",
  }),
] satisfies readonly SourceCoverageTarget[];

const LPO_LV: Authority = {
  jurisdiction: "LV",
  authorityName: "Latvian Patent Office (Patentu valde)",
  languages: ["lv-LV", "en"],
  verificationEvidenceUri: "https://www.lrpv.gov.lv/en/trade-marks/services",
};

export const LPO_LV_SOURCE_COVERAGE_TARGETS = [
  target(LPO_LV, {
    id: "lv-lpo-trademarks",
    family: "PORTAL",
    displayName: "Latvian Patent Office Trade Mark Services",
    canonicalUri: "https://www.lrpv.gov.lv/en/trade-marks/services",
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/trade-marks/services",
    notes:
      "The current trademark services hub exposes filing, renewal, transfers, licensing, international registration, register extracts, opposition, appeal, revocation and invalidity services.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-filing",
    family: "FILING",
    displayName: "Latvian Patent Office Trademark Application",
    canonicalUri: "https://www.lrpv.gov.lv/en/services/filing-trademark-application",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/services/filing-trademark-application",
    notes:
      "The filing service, updated in April 2026, documents national electronic filing, Nice-class fees, examination, registration/publication, opposition timing and ten-year renewable protection.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-search",
    family: "SEARCH",
    displayName: "Latvian Patent Office Trade Mark Databases",
    canonicalUri: "https://www.lrpv.gov.lv/en/trade-mark-databases-0",
    entrypoints: [
      {
        uri: "https://www.lrpv.gov.lv/en/trade-mark-databases-0",
        label: "Trademark database guidance",
      },
      {
        uri: "https://www.lrpv.gov.lv/en/services/trademark-search",
        label: "Patent Office trademark search service",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/trade-mark-databases-0",
    notes:
      "The Patent Office provides access to the Latvian national trademark database and related search resources; the public database is maintained as an up-to-date information source while legally effective information is published through the register and Official Gazette.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-fees",
    family: "FEES",
    displayName: "Latvian Patent Office Trademark Fees",
    canonicalUri: "https://www.lrpv.gov.lv/en/fees-legal-protection-trademarks",
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/fees-legal-protection-trademarks",
    notes:
      "The official trademark fee table was updated on 20 April 2026 under the current 2026 price list and publishes filing, additional-class, registration, renewal and proceeding charges.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Latvian Patent Office Nice Classification 13-2026",
    canonicalUri: "https://www.lrpv.gov.lv/lv/nicas-klasifikacijas-precu-un-pakalpojumu-saraksts",
    entrypoints: [
      {
        uri: "https://www.lrpv.gov.lv/lv/nicas-klasifikacijas-precu-un-pakalpojumu-saraksts",
        label: "Nice Classification class list",
      },
      {
        uri: "https://www.lrpv.gov.lv/lv/Nicas-klasifikacija/klasu-virsraksti-un-skaidrojumi",
        label: "Nice class headings and explanatory notes",
      },
      {
        uri: "https://www.lrpv.gov.lv/en/services/filing-trademark-application",
        label: "Current filing guidance using Nice classes",
      },
    ],
    verificationEvidenceUri:
      "https://www.lrpv.gov.lv/lv/nicas-klasifikacijas-precu-un-pakalpojumu-saraksts",
    notes:
      "The Patent Office's current class list identifies the 13th edition of the Nice Classification effective from 1 January 2026, and current filing guidance calculates application fees by Nice class.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Latvia Trade Mark Law",
    canonicalUri: "https://www.lrpv.gov.lv/en/law-0",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/law-0",
    notes:
      "The official Patent Office legal surface publishes Latvia's Trade Mark Law, including national filing requirements, fees, examination and registration procedure.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Latvia Industrial Property Board of Appeal Trademark Proceedings",
    canonicalUri: "https://www.lrpv.gov.lv/en/board-of-appeal-services",
    entrypoints: [
      {
        uri: "https://www.lrpv.gov.lv/en/board-of-appeal-services",
        label: "Board of Appeal services",
      },
      {
        uri: "https://www.lrpv.gov.lv/en/services/submission-notice-opposition-registration-object-industrial-property",
        label: "Trademark opposition service",
      },
      {
        uri: "https://www.lrpv.gov.lv/en/services/submission-notice-declaration-invalidity-trademark-registration",
        label: "Trademark invalidity service",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/board-of-appeal-services",
    notes:
      "The Industrial Property Board of Appeal handles trademark appeals, opposition, revocation and invalidity; opposition may be filed within three months from official publication and electronic submission is supported.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-official-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Latvian Patent Office Official Gazette",
    canonicalUri: "https://www.lrpv.gov.lv/en/official-gazette",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/official-gazette",
    notes:
      "The Patent Office publishes its industrial-property registers and changes through the electronic Official Gazette; the current official page lists 2026 issues and the July 2026 issue has been published.",
  }),
] satisfies readonly SourceCoverageTarget[];

const VPB_LT: Authority = {
  jurisdiction: "LT",
  authorityName: "State Patent Bureau of the Republic of Lithuania (VPB)",
  languages: ["lt-LT", "en"],
  verificationEvidenceUri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/",
};

export const VPB_LT_SOURCE_COVERAGE_TARGETS = [
  target(VPB_LT, {
    id: "lt-vpb-trademarks",
    family: "PORTAL",
    displayName: "Lithuanian State Patent Bureau Trademarks",
    canonicalUri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/",
    verificationEvidenceUri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/",
    notes:
      "The current trademark hub, updated in July 2026, links national registration, online requests, search, Nice classification, fees, disputes, validity, international protection and legislation.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-filing",
    family: "FILING",
    displayName: "Lithuanian State Patent Bureau Trademark Filing",
    canonicalUri:
      "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/kaip-iregistruoti-prekiu-zenkla/",
    entrypoints: [
      {
        uri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/kaip-iregistruoti-prekiu-zenkla/",
        label: "Trademark registration guidance",
      },
      {
        uri: "https://vpb.lrv.lt/lt/apie-valstybini-patentu-biura-1/paslaugos/",
        label: "Current electronic services hub",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/kaip-iregistruoti-prekiu-zenkla/",
    notes:
      "The national guidance covers electronic filing, EUR 180 filing fee, additional Nice classes, examination, publication in the official bulletin and subsequent opposition; the current services page states that all Bureau services are available electronically.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-search",
    family: "SEARCH",
    displayName: "Lithuanian State Patent Bureau Trademark Databases",
    canonicalUri: "https://vpb.lrv.lt/lt/duomenu-bazes/",
    entrypoints: [
      { uri: "https://vpb.lrv.lt/lt/duomenu-bazes/", label: "Current VPB databases hub" },
      {
        uri: "https://vpb.lrv.lt/en/services/trademarks/databases-2/",
        label: "English trademark database guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://vpb.lrv.lt/lt/duomenu-bazes/",
    notes:
      "The current database hub, updated in June 2026, provides national trademark search and related industrial-property databases.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-fees",
    family: "FEES",
    displayName: "Lithuanian State Patent Bureau Trademark Fees",
    canonicalUri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/mokesciai/",
    entrypoints: [
      {
        uri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/mokesciai/",
        label: "Current Lithuanian trademark fee table",
      },
      { uri: "https://vpb.lrv.lt/en/services/trademarks/fees-2/", label: "English fee table" },
    ],
    verificationEvidenceUri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/mokesciai/",
    notes:
      "The official fee table publishes the current trademark charges, including EUR 180 filing, EUR 40 for each class after the first, EUR 160 opposition and EUR 180 invalidation or cancellation.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Lithuanian State Patent Bureau Nice Classification Guidance",
    canonicalUri:
      "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/prekiu-ir-paslaugu-klasifikacija/",
    entrypoints: [
      {
        uri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/prekiu-ir-paslaugu-klasifikacija/",
        label: "Goods and services classification guidance",
      },
      {
        uri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/prekiu-ir-paslaugu-klasifikacija/nicos-klasifikacija/",
        label: "Nice Classification hub",
      },
    ],
    verificationEvidenceUri:
      "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/prekiu-ir-paslaugu-klasifikacija/",
    notes:
      "VPB requires goods and services to be classified under the edition of the Nice Classification in force on the filing date and links Nice and TMclass resources; this avoids freezing a stale edition number into the canonical source.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Lithuania Trademark Legal Acts",
    canonicalUri:
      "https://vpb.lrv.lt/lt/teisine-informacija/teises-aktai/prekiu-zenklai-2/lietuvos-respublikos-teises-aktai-2/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://vpb.lrv.lt/lt/teisine-informacija/teises-aktai/prekiu-zenklai-2/lietuvos-respublikos-teises-aktai-2/",
    notes:
      "The current legal-acts page, updated in July 2026, publishes the Lithuanian Law on Trademarks, Trademark Register rules, registration rules and rules governing appeals, opposition, invalidity and cancellation.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Lithuania Trademark Appeals, Opposition, Invalidity and Cancellation",
    canonicalUri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/gincai-del-prekiu-zenklu/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/gincai-del-prekiu-zenklu/",
    notes:
      "The Bureau's Appeals Division conducts mandatory pre-litigation trademark disputes, including appeals, opposition, invalidity and cancellation; the current service describes the statutory filing periods and electronic submission route.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-official-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "Lithuanian State Patent Bureau Official Bulletin - Trademarks and Designs",
    canonicalUri: "https://vpb.lrv.lt/en/structure-and-contacts-1/official-bulletin/2026/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://vpb.lrv.lt/en/structure-and-contacts-1/official-bulletin/2026/",
    notes:
      "The official 2026 bulletin page publishes the Trademarks and Designs issues throughout the year, with issue 14 dated 27 July 2026; it is the current change-signal publication surface for national trademark events.",
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
  ...IMPI_MX_SOURCE_COVERAGE_TARGETS,
  ...IPONZ_NZ_SOURCE_COVERAGE_TARGETS,
  ...OEPM_ES_SOURCE_COVERAGE_TARGETS,
  ...UIBM_IT_SOURCE_COVERAGE_TARGETS,
  ...IPI_CH_SOURCE_COVERAGE_TARGETS,
  ...PRV_SE_SOURCE_COVERAGE_TARGETS,
  ...NIPO_NO_SOURCE_COVERAGE_TARGETS,
  ...DKPTO_DK_SOURCE_COVERAGE_TARGETS,
  ...PRH_FI_SOURCE_COVERAGE_TARGETS,
  ...PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,
  ...IPOI_IE_SOURCE_COVERAGE_TARGETS,
  ...INPI_PT_SOURCE_COVERAGE_TARGETS,
  ...UPRP_PL_SOURCE_COVERAGE_TARGETS,
  ...UPV_CZ_SOURCE_COVERAGE_TARGETS,
  ...INDPROP_SK_SOURCE_COVERAGE_TARGETS,
  ...HIPO_HU_SOURCE_COVERAGE_TARGETS,
  ...OSIM_RO_SOURCE_COVERAGE_TARGETS,
  ...BPO_BG_SOURCE_COVERAGE_TARGETS,
  ...DZIV_HR_SOURCE_COVERAGE_TARGETS,
  ...SIPO_SI_SOURCE_COVERAGE_TARGETS,
  ...OBI_GR_SOURCE_COVERAGE_TARGETS,
  ...CY_IP_SOURCE_COVERAGE_TARGETS,
  ...IPRD_MT_SOURCE_COVERAGE_TARGETS,
  ...EPA_EE_SOURCE_COVERAGE_TARGETS,
  ...LPO_LV_SOURCE_COVERAGE_TARGETS,
  ...VPB_LT_SOURCE_COVERAGE_TARGETS,
  ...CIPO_SOURCE_COVERAGE_TARGETS,
] satisfies readonly SourceCoverageTarget[];
