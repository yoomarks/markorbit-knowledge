import {
  SOURCE_COVERAGE_PROTOCOL_VERSION,
  type SourceCoverageCatalogState,
  type SourceCoverageTarget,
} from "@markorbit/contracts";

const VERIFIED_AT = "2026-08-13T05:35:00+08:00";
const EUIPO = "European Union Intellectual Property Office";
const ROOT_EVIDENCE = "https://www.euipo.europa.eu/en/trade-marks";

function target(
  input: Omit<
    SourceCoverageTarget,
    | "protocolVersion"
    | "objectType"
    | "jurisdiction"
    | "authorityName"
    | "authorityBasis"
    | "sourceType"
    | "category"
    | "authorityLevel"
    | "languages"
    | "catalogState"
    | "verificationEvidenceUri"
    | "verifiedAt"
  > & {
    verificationEvidenceUri?: string;
    catalogState?: SourceCoverageCatalogState;
  },
): SourceCoverageTarget {
  return {
    protocolVersion: SOURCE_COVERAGE_PROTOCOL_VERSION,
    objectType: "SOURCE_COVERAGE_TARGET",
    jurisdiction: "EU",
    authorityName: EUIPO,
    authorityBasis: "EXPLICIT_CURATED",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    languages: ["en"],
    catalogState: input.catalogState ?? "ACTIVE",
    verifiedAt: VERIFIED_AT,
    ...input,
    verificationEvidenceUri: input.verificationEvidenceUri ?? ROOT_EVIDENCE,
  };
}

/**
 * EUIPO public trademark-source baseline. These records express governed coverage intent
 * only. They do not create Sources, CollectionPlans, schedules, or collection authority.
 */
export const EUIPO_SOURCE_COVERAGE_TARGETS = [
  target({
    id: "eu-euipo-trademarks-root",
    family: "PORTAL",
    displayName: "EUIPO Trade Marks",
    canonicalUri: "https://www.euipo.europa.eu/en/trade-marks",
    entrypoints: [{ uri: "https://www.euipo.europa.eu/en/trade-marks", label: "Trade marks home" }],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    },
  }),
  target({
    id: "eu-euipo-how-to-apply",
    family: "FILING",
    displayName: "EUIPO How to Apply for a Trade Mark",
    canonicalUri: "https://www.euipo.europa.eu/en/trade-marks/how-to-apply",
    entrypoints: [
      {
        uri: "https://www.euipo.europa.eu/en/trade-marks/how-to-apply",
        label: "How to apply",
      },
      {
        uri: "https://www.euipo.europa.eu/en/trade-marks/before-applying",
        label: "Before applying",
      },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    },
  }),
  target({
    id: "eu-euipo-esearch-plus",
    family: "SEARCH",
    displayName: "EUIPO eSearch Plus and IP Search",
    canonicalUri: "https://euipo.europa.eu/eSearch/",
    entrypoints: [
      { uri: "https://euipo.europa.eu/eSearch/", label: "eSearch Plus" },
      { uri: "https://www.euipo.europa.eu/en/search-ip", label: "Search IP guidance" },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "NORMAL",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    },
    verificationEvidenceUri: "https://www.euipo.europa.eu/en/search-ip",
  }),
  target({
    id: "eu-euipo-trade-mark-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "EUIPO Trade Mark Guidelines",
    canonicalUri: "https://guidelines.euipo.europa.eu/",
    entrypoints: [{ uri: "https://guidelines.euipo.europa.eu/", label: "EUIPO Guidelines" }],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    },
    verificationEvidenceUri: "https://guidelines.euipo.europa.eu/",
  }),
  target({
    id: "eu-euipo-tmclass",
    family: "GOODS_SERVICES_ID",
    displayName: "EUIPO TMclass Goods and Services",
    canonicalUri: "https://euipo.europa.eu/ec2/?lang=en",
    entrypoints: [
      { uri: "https://euipo.europa.eu/ec2/?lang=en", label: "TMclass" },
      {
        uri: "https://www.euipo.europa.eu/en/trade-marks/before-applying/goods-and-services",
        label: "Goods and services guidance",
      },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "JSON"],
    },
    verificationEvidenceUri:
      "https://www.euipo.europa.eu/en/trade-marks/before-applying/goods-and-services",
  }),
  target({
    id: "eu-euipo-fees",
    family: "FEES",
    displayName: "EUIPO Trade Mark Fees and Payments",
    canonicalUri: "https://www.euipo.europa.eu/en/trade-marks/before-applying/fees-payments",
    entrypoints: [
      {
        uri: "https://www.euipo.europa.eu/en/trade-marks/before-applying/fees-payments",
        label: "Fees and payments",
      },
      {
        uri: "https://www.euipo.europa.eu/en/help-centre/tm/faq-fees-and-their-payment",
        label: "Fees FAQ",
      },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    },
    verificationEvidenceUri:
      "https://www.euipo.europa.eu/en/help-centre/tm/faq-fees-and-their-payment",
  }),
  target({
    id: "eu-euipo-opposition",
    family: "PROCEEDINGS",
    displayName: "EUIPO Trade Mark Opposition",
    canonicalUri: "https://www.euipo.europa.eu/en/trade-marks/after-applying/opposition",
    entrypoints: [
      {
        uri: "https://www.euipo.europa.eu/en/trade-marks/after-applying/opposition",
        label: "Opposition procedure",
      },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    },
  }),
  target({
    id: "eu-euipo-boards-of-appeal-decisions",
    family: "APPEALS_AND_CASELAW",
    displayName: "EUIPO Boards of Appeal Decisions",
    canonicalUri: "https://www.euipo.europa.eu/en/boards-of-appeal/publications/decisions",
    entrypoints: [
      {
        uri: "https://www.euipo.europa.eu/en/boards-of-appeal/publications/decisions",
        label: "Boards of Appeal decisions",
      },
      {
        uri: "https://www.euipo.europa.eu/en/law/recent-case-law",
        label: "Recent case law",
      },
      { uri: "https://www.euipo.europa.eu/en/search-ip", label: "eSearch case law access" },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    },
  }),
  target({
    id: "eu-euipo-law",
    family: "LEGAL_TEXTS",
    displayName: "EUIPO Trade Mark Law and Legal Texts",
    canonicalUri: "https://www.euipo.europa.eu/en/law",
    entrypoints: [{ uri: "https://www.euipo.europa.eu/en/law", label: "EUIPO law" }],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: false,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    },
  }),
  target({
    id: "eu-euipo-manage-trade-mark",
    family: "MAINTENANCE",
    displayName: "EUIPO Manage a Trade Mark Application or Registration",
    canonicalUri: "https://www.euipo.europa.eu/en/trade-marks/after-applying/manage-my-application",
    entrypoints: [
      {
        uri: "https://www.euipo.europa.eu/en/trade-marks/after-applying/manage-my-application",
        label: "Manage my application",
      },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    },
  }),
  target({
    id: "eu-euipo-news",
    family: "POLICY_NOTICES",
    displayName: "EUIPO News and Trade Mark Updates",
    canonicalUri: "https://www.euipo.europa.eu/en/news-and-events/news",
    entrypoints: [
      { uri: "https://www.euipo.europa.eu/en/news-and-events/news", label: "EUIPO news" },
      { uri: "https://www.euipo.europa.eu/en/news-and-events", label: "News and events" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    },
  }),
] satisfies readonly SourceCoverageTarget[];
