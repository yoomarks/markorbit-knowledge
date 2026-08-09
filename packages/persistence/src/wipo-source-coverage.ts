import {
  SOURCE_COVERAGE_PROTOCOL_VERSION,
  type SourceCoverageCatalogState,
  type SourceCoverageTarget,
} from "@markorbit/contracts";

const VERIFIED_AT = "2026-08-09T14:00:00Z";
const WIPO = "World Intellectual Property Organization";
const ROOT_EVIDENCE = "https://www.wipo.int/en/web/madrid-system/";

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
    jurisdiction: "WO",
    authorityName: WIPO,
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
 * WIPO public trademark-source baseline. These targets state coverage intent only; they do not
 * create CollectionPlans, authorize a crawl, or imply that a dynamic application's internal API
 * may be harvested.
 */
export const WIPO_SOURCE_COVERAGE_TARGETS = [
  target({
    id: "wo-wipo-madrid-system",
    family: "PORTAL",
    displayName: "WIPO Madrid System",
    canonicalUri: "https://www.wipo.int/en/web/madrid-system/",
    entrypoints: [{ uri: "https://www.wipo.int/en/web/madrid-system/", label: "Madrid System" }],
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
    id: "wo-wipo-madrid-monitor",
    family: "STATUS_AND_DOCUMENTS",
    displayName: "WIPO Madrid Monitor / Find and Monitor",
    canonicalUri:
      "https://www.wipo.int/en/web/madrid-system/find-and-monitor-international-trademark-registrations",
    entrypoints: [
      {
        uri: "https://www.wipo.int/en/web/madrid-system/find-and-monitor-international-trademark-registrations",
        label: "Find and monitor guidance",
      },
      { uri: "https://www3.wipo.int/madrid/monitor/en/", label: "Legacy Madrid Monitor" },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON", "PDF"],
    },
  }),
  target({
    id: "wo-wipo-global-brand-database",
    family: "SEARCH",
    displayName: "WIPO Global Brand Database",
    canonicalUri: "https://www.wipo.int/en/web/global-brand-database/index",
    entrypoints: [
      { uri: "https://www.wipo.int/en/web/global-brand-database/index", label: "Database guidance" },
      { uri: "https://branddb.wipo.int/en/", label: "Global Brand Database" },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "NORMAL",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    },
  }),
  target({
    id: "wo-wipo-nice-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "WIPO Nice Classification",
    canonicalUri: "https://www.wipo.int/en/web/classification-nice/index",
    entrypoints: [
      { uri: "https://www.wipo.int/en/web/classification-nice/index", label: "Nice Classification" },
      { uri: "https://nclpub.wipo.int/", label: "NCLPub" },
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
    id: "wo-wipo-madrid-legal-texts",
    family: "POLICY_NOTICES",
    displayName: "WIPO Madrid System Legal Texts",
    canonicalUri: "https://www.wipo.int/en/web/madrid-system/legal_texts/index",
    entrypoints: [
      {
        uri: "https://www.wipo.int/en/web/madrid-system/legal_texts/index",
        label: "Madrid legal texts",
      },
    ],
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
    id: "wo-wipo-madrid-forms",
    family: "FILING",
    displayName: "WIPO Madrid System Forms",
    canonicalUri: "https://www.wipo.int/en/web/madrid-system/forms/index",
    entrypoints: [
      { uri: "https://www.wipo.int/en/web/madrid-system/forms/index", label: "Madrid forms" },
    ],
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
    id: "wo-wipo-madrid-fees",
    family: "FEES",
    displayName: "WIPO Madrid System Fees",
    canonicalUri: "https://www.wipo.int/en/web/madrid-system/fees/sched",
    entrypoints: [
      { uri: "https://www.wipo.int/en/web/madrid-system/fees/sched", label: "Schedule of fees" },
      { uri: "https://madrid.wipo.int/feecalcapp/", label: "Madrid fee calculator" },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    },
  }),
  target({
    id: "wo-wipo-madrid-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "WIPO Gazette of International Marks",
    canonicalUri: "https://www.wipo.int/en/web/madrid-system/madridgazette/index",
    entrypoints: [
      {
        uri: "https://www.wipo.int/en/web/madrid-system/madridgazette/index",
        label: "WIPO Gazette of International Marks",
      },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    },
  }),
  target({
    id: "wo-wipo-madrid-member-profiles",
    family: "PORTAL",
    displayName: "WIPO Madrid Member Profiles",
    canonicalUri: "https://www.wipo.int/madrid/memberprofiles/",
    entrypoints: [
      { uri: "https://www.wipo.int/madrid/memberprofiles/", label: "Madrid Member Profiles" },
    ],
    coverageTier: "SUPPORTING",
    changeSensitivity: "NORMAL",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    },
  }),
  target({
    id: "wo-wipo-madrid-information-notices",
    family: "POLICY_NOTICES",
    displayName: "WIPO Madrid System Information Notices",
    canonicalUri: "https://www.wipo.int/en/web/madrid-system/notices",
    entrypoints: [
      { uri: "https://www.wipo.int/en/web/madrid-system/notices", label: "Madrid information notices" },
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
