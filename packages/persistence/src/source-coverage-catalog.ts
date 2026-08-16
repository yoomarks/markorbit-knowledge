import {
  SOURCE_COVERAGE_PROTOCOL_VERSION,
  SOURCE_COVERAGE_TIERS,
  SOURCE_COVERAGE_CATALOG_STATES,
  type SourceCoverageCatalogState,
  type SourceCoverageFamily,
  type SourceCoverageSummary,
  type SourceCoverageTarget,
  type SourceCoverageTier,
  type SourceDefinition,
} from "@markorbit/contracts";
import { EUIPO_SOURCE_COVERAGE_TARGETS } from "./euipo-source-coverage";
import {
  CIPO_SOURCE_COVERAGE_TARGETS,
  CNIPA_SOURCE_COVERAGE_TARGETS,
  DPMA_SOURCE_COVERAGE_TARGETS,
  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,
  IP_INDIA_SOURCE_COVERAGE_TARGETS,
  INPI_FR_SOURCE_COVERAGE_TARGETS,
  INPI_BR_SOURCE_COVERAGE_TARGETS,
  IMPI_MX_SOURCE_COVERAGE_TARGETS,
  IPONZ_NZ_SOURCE_COVERAGE_TARGETS,
  OEPM_ES_SOURCE_COVERAGE_TARGETS,
  UIBM_IT_SOURCE_COVERAGE_TARGETS,
  IPI_CH_SOURCE_COVERAGE_TARGETS,
  PRV_SE_SOURCE_COVERAGE_TARGETS,
  NIPO_NO_SOURCE_COVERAGE_TARGETS,
  DKPTO_DK_SOURCE_COVERAGE_TARGETS,
  PRH_FI_SOURCE_COVERAGE_TARGETS,
  PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,
  IPOI_IE_SOURCE_COVERAGE_TARGETS,
  INPI_PT_SOURCE_COVERAGE_TARGETS,
  UPRP_PL_SOURCE_COVERAGE_TARGETS,
  UPV_CZ_SOURCE_COVERAGE_TARGETS,
  INDPROP_SK_SOURCE_COVERAGE_TARGETS,
  HIPO_HU_SOURCE_COVERAGE_TARGETS,
  OSIM_RO_SOURCE_COVERAGE_TARGETS,
  BPO_BG_SOURCE_COVERAGE_TARGETS,
  DZIV_HR_SOURCE_COVERAGE_TARGETS,
  SIPO_SI_SOURCE_COVERAGE_TARGETS,
  OBI_GR_SOURCE_COVERAGE_TARGETS,
  CY_IP_SOURCE_COVERAGE_TARGETS,
  IPRD_MT_SOURCE_COVERAGE_TARGETS,
  EPA_EE_SOURCE_COVERAGE_TARGETS,
  LPO_LV_SOURCE_COVERAGE_TARGETS,
  VPB_LT_SOURCE_COVERAGE_TARGETS,
  TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,
  ZIS_RS_SOURCE_COVERAGE_TARGETS,
  SAIP_SA_SOURCE_COVERAGE_TARGETS,
  MOET_AE_SOURCE_COVERAGE_TARGETS,
  MOCI_QA_SOURCE_COVERAGE_TARGETS,
  MOCIIP_OM_SOURCE_COVERAGE_TARGETS,
  MOIC_BH_SOURCE_COVERAGE_TARGETS,
  MOCI_KW_SOURCE_COVERAGE_TARGETS,
  IPPD_JO_SOURCE_COVERAGE_TARGETS,
  DPDT_BD_SOURCE_COVERAGE_TARGETS,
  DOI_NP_SOURCE_COVERAGE_TARGETS,
  MYIPO_MY_SOURCE_COVERAGE_TARGETS,
  IPOPHL_PH_SOURCE_COVERAGE_TARGETS,
  DJKI_ID_SOURCE_COVERAGE_TARGETS,
  IPVN_VN_SOURCE_COVERAGE_TARGETS,
  NIPO_LK_SOURCE_COVERAGE_TARGETS,
  DIP_TH_SOURCE_COVERAGE_TARGETS,
  CIPC_ZA_SOURCE_COVERAGE_TARGETS,
  INAPI_CL_SOURCE_COVERAGE_TARGETS,
  SIC_CO_SOURCE_COVERAGE_TARGETS,
  IPOS_SOURCE_COVERAGE_TARGETS,
  JPO_SOURCE_COVERAGE_TARGETS,
  KOREA_SOURCE_COVERAGE_TARGETS,
  PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,
  UKIPO_SOURCE_COVERAGE_TARGETS,
} from "./priority-national-source-coverage";
import { WIPO_SOURCE_COVERAGE_TARGETS } from "./wipo-source-coverage";

const VERIFIED_AT = "2026-08-09T08:55:00Z";
const USPTO = "United States Patent and Trademark Office";
const ROOT_EVIDENCE = "https://www.uspto.gov/trademarks";

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
    jurisdiction: "US",
    authorityName: USPTO,
    authorityBasis: "EXPLICIT_CURATED",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    languages: ["en-US"],
    catalogState: input.catalogState ?? "ACTIVE",
    verifiedAt: VERIFIED_AT,
    ...input,
    verificationEvidenceUri: input.verificationEvidenceUri ?? ROOT_EVIDENCE,
  };
}

export const US_SOURCE_COVERAGE_TARGETS = [
  target({
    id: "us-uspto-trademarks-root",
    family: "PORTAL",
    displayName: "USPTO Trademarks",
    canonicalUri: "https://www.uspto.gov/trademarks",
    entrypoints: [{ uri: "https://www.uspto.gov/trademarks", label: "Trademarks home" }],
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
    id: "us-uspto-trademark-search",
    family: "SEARCH",
    displayName: "USPTO Trademark Search",
    canonicalUri: "https://tmsearch.uspto.gov/",
    entrypoints: [
      { uri: "https://tmsearch.uspto.gov/", label: "Trademark Search" },
      { uri: "https://www.uspto.gov/trademarks/search", label: "Search guidance" },
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
    id: "us-uspto-trademark-center",
    family: "FILING",
    displayName: "USPTO Trademark Center",
    canonicalUri: "https://trademarkcenter.uspto.gov/",
    entrypoints: [
      { uri: "https://trademarkcenter.uspto.gov/", label: "Trademark Center" },
      { uri: "https://www.uspto.gov/trademarks/apply", label: "Apply guidance" },
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
    id: "us-uspto-tsdr",
    family: "STATUS_AND_DOCUMENTS",
    displayName: "Trademark Status and Document Retrieval (TSDR)",
    canonicalUri: "https://tsdr.uspto.gov/",
    entrypoints: [
      { uri: "https://tsdr.uspto.gov/", label: "TSDR" },
      {
        uri: "https://www.uspto.gov/trademarks/apply/check-status-view-documents",
        label: "TSDR guidance",
      },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "NORMAL",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON", "PDF", "IMAGE"],
    },
  }),
  target({
    id: "us-uspto-tmep-current",
    family: "EXAMINATION_MANUAL",
    displayName: "Trademark Manual of Examining Procedure — Current",
    canonicalUri: "https://tmep.uspto.gov/RDMS/TMEP/current",
    entrypoints: [{ uri: "https://tmep.uspto.gov/RDMS/TMEP/current", label: "Current TMEP" }],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    },
    verificationEvidenceUri: "https://tmep.uspto.gov/RDMS/TMEP/current",
  }),
  target({
    id: "us-uspto-tmep-archives",
    family: "EXAMINATION_MANUAL",
    displayName: "TMEP Files and Archives",
    canonicalUri: "https://www.uspto.gov/trademarks/guides-and-manuals/tmep-archives",
    entrypoints: [
      {
        uri: "https://www.uspto.gov/trademarks/guides-and-manuals/tmep-archives",
        label: "TMEP archives",
      },
    ],
    coverageTier: "SUPPORTING",
    changeSensitivity: "NORMAL",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: false,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    },
    verificationEvidenceUri: "https://www.uspto.gov/trademarks/guides-and-manuals/tmep-archives",
  }),
  target({
    id: "us-uspto-tbmp-current",
    family: "TTAB_PROCEDURE",
    displayName: "Trademark Trial and Appeal Board Manual of Procedure — Current",
    canonicalUri: "https://tbmp.uspto.gov/RDMS/TBMP/current",
    entrypoints: [{ uri: "https://tbmp.uspto.gov/RDMS/TBMP/current", label: "Current TBMP" }],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    },
    verificationEvidenceUri: "https://tbmp.uspto.gov/RDMS/TBMP/current",
  }),
  target({
    id: "us-uspto-tbmp-pdf",
    family: "TTAB_PROCEDURE",
    displayName: "TBMP PDF Distribution",
    canonicalUri: "https://www.uspto.gov/trademarks/ttab/tbmp-preface",
    entrypoints: [
      { uri: "https://www.uspto.gov/trademarks/ttab/tbmp-preface", label: "TBMP PDF index" },
    ],
    coverageTier: "SUPPORTING",
    changeSensitivity: "NORMAL",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: false,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    },
    verificationEvidenceUri: "https://www.uspto.gov/trademarks/ttab/tbmp-preface",
  }),
  target({
    id: "us-uspto-id-manual",
    family: "GOODS_SERVICES_ID",
    displayName: "Trademark ID Manual",
    canonicalUri: "https://idm-tmng.uspto.gov/",
    entrypoints: [{ uri: "https://idm-tmng.uspto.gov/", label: "ID Manual" }],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "JSON"],
    },
  }),
  target({
    id: "us-uspto-trademark-fees",
    family: "FEES",
    displayName: "Trademark Fee Information",
    canonicalUri: "https://www.uspto.gov/trademarks/trademark-fee-information",
    entrypoints: [
      {
        uri: "https://www.uspto.gov/trademarks/trademark-fee-information",
        label: "Trademark fee information",
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
    verificationEvidenceUri: "https://www.uspto.gov/trademarks/trademark-fee-information",
  }),
  target({
    id: "us-uspto-trademark-assignments",
    family: "ASSIGNMENTS",
    displayName: "Trademark Assignments and Ownership Changes",
    canonicalUri: "https://www.uspto.gov/trademarks/trademark-assignments-change-search-ownership",
    entrypoints: [
      {
        uri: "https://www.uspto.gov/trademarks/trademark-assignments-change-search-ownership",
        label: "Assignment guidance",
      },
      { uri: "https://assignmentcenter.uspto.gov/", label: "Assignment Center" },
    ],
    coverageTier: "SUPPORTING",
    changeSensitivity: "NORMAL",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    },
    verificationEvidenceUri:
      "https://www.uspto.gov/trademarks/trademark-assignments-change-search-ownership",
  }),
  target({
    id: "us-uspto-registration-maintenance",
    family: "MAINTENANCE",
    displayName: "Maintaining a Federal Trademark Registration",
    canonicalUri: "https://www.uspto.gov/trademarks/basics/maintaining-registration",
    entrypoints: [
      {
        uri: "https://www.uspto.gov/trademarks/basics/maintaining-registration",
        label: "Maintenance guidance",
      },
      { uri: "https://www.uspto.gov/trademarks/maintain", label: "Maintenance forms" },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    },
    verificationEvidenceUri: "https://www.uspto.gov/trademarks/basics/maintaining-registration",
  }),
  target({
    id: "us-uspto-ttab",
    family: "TTAB_PROCEEDINGS",
    displayName: "Trademark Trial and Appeal Board",
    canonicalUri: "https://www.uspto.gov/trademarks/ttab",
    entrypoints: [
      { uri: "https://www.uspto.gov/trademarks/ttab", label: "TTAB home" },
      { uri: "https://ttabcenter.uspto.gov/", label: "TTAB Center" },
      { uri: "https://ttabvue.uspto.gov/", label: "TTABVUE" },
    ],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "JSON"],
    },
  }),
  target({
    id: "us-uspto-trademark-official-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Trademark Official Gazette",
    canonicalUri: "https://eog-tmng.uspto.gov/",
    entrypoints: [{ uri: "https://eog-tmng.uspto.gov/", label: "TMOG" }],
    coverageTier: "FOUNDATIONAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "PDF", "IMAGE"],
    },
  }),
  target({
    id: "us-uspto-system-status",
    family: "SYSTEM_STATUS",
    displayName: "USPTO System Status and Availability",
    canonicalUri: "https://www.uspto.gov/system-status",
    entrypoints: [{ uri: "https://www.uspto.gov/system-status", label: "Systems status" }],
    coverageTier: "CHANGE_SIGNAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    },
    verificationEvidenceUri: "https://www.uspto.gov/system-status",
  }),
  target({
    id: "us-uspto-trademark-rulemaking",
    family: "POLICY_NOTICES",
    displayName: "Trademark Federal Register Notices and Comments",
    canonicalUri:
      "https://www.uspto.gov/trademarks/laws/rule-making-trademark-federal-register-notices-and-comments",
    entrypoints: [
      {
        uri: "https://www.uspto.gov/trademarks/laws/rule-making-trademark-federal-register-notices-and-comments",
        label: "Trademark rulemaking notices",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: false,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "XML", "TEXT"],
    },
    verificationEvidenceUri:
      "https://www.uspto.gov/trademarks/laws/rule-making-trademark-federal-register-notices-and-comments",
  }),
  target({
    id: "us-uspto-trademark-examination-guides",
    family: "POLICY_NOTICES",
    displayName: "Trademark Examination Guides",
    canonicalUri:
      "https://www.uspto.gov/trademarks/guides-and-manuals/trademark-examination-guides",
    entrypoints: [
      {
        uri: "https://www.uspto.gov/trademarks/guides-and-manuals/trademark-examination-guides",
        label: "Examination guides",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    changeSensitivity: "HIGH",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: false,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    },
    verificationEvidenceUri:
      "https://www.uspto.gov/trademarks/guides-and-manuals/trademark-examination-guides",
  }),
] satisfies readonly SourceCoverageTarget[];

export {
  CIPO_SOURCE_COVERAGE_TARGETS,
  CNIPA_SOURCE_COVERAGE_TARGETS,
  DPMA_SOURCE_COVERAGE_TARGETS,
  EUIPO_SOURCE_COVERAGE_TARGETS,
  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,
  IP_INDIA_SOURCE_COVERAGE_TARGETS,
  INPI_FR_SOURCE_COVERAGE_TARGETS,
  INPI_BR_SOURCE_COVERAGE_TARGETS,
  IMPI_MX_SOURCE_COVERAGE_TARGETS,
  IPONZ_NZ_SOURCE_COVERAGE_TARGETS,
  OEPM_ES_SOURCE_COVERAGE_TARGETS,
  UIBM_IT_SOURCE_COVERAGE_TARGETS,
  IPI_CH_SOURCE_COVERAGE_TARGETS,
  PRV_SE_SOURCE_COVERAGE_TARGETS,
  NIPO_NO_SOURCE_COVERAGE_TARGETS,
  DKPTO_DK_SOURCE_COVERAGE_TARGETS,
  PRH_FI_SOURCE_COVERAGE_TARGETS,
  PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,
  IPOI_IE_SOURCE_COVERAGE_TARGETS,
  INPI_PT_SOURCE_COVERAGE_TARGETS,
  UPRP_PL_SOURCE_COVERAGE_TARGETS,
  UPV_CZ_SOURCE_COVERAGE_TARGETS,
  INDPROP_SK_SOURCE_COVERAGE_TARGETS,
  HIPO_HU_SOURCE_COVERAGE_TARGETS,
  OSIM_RO_SOURCE_COVERAGE_TARGETS,
  BPO_BG_SOURCE_COVERAGE_TARGETS,
  DZIV_HR_SOURCE_COVERAGE_TARGETS,
  SIPO_SI_SOURCE_COVERAGE_TARGETS,
  OBI_GR_SOURCE_COVERAGE_TARGETS,
  CY_IP_SOURCE_COVERAGE_TARGETS,
  IPRD_MT_SOURCE_COVERAGE_TARGETS,
  EPA_EE_SOURCE_COVERAGE_TARGETS,
  LPO_LV_SOURCE_COVERAGE_TARGETS,
  VPB_LT_SOURCE_COVERAGE_TARGETS,
  TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,
  ZIS_RS_SOURCE_COVERAGE_TARGETS,
  SAIP_SA_SOURCE_COVERAGE_TARGETS,
  MOET_AE_SOURCE_COVERAGE_TARGETS,
  MOCI_QA_SOURCE_COVERAGE_TARGETS,
  MOCIIP_OM_SOURCE_COVERAGE_TARGETS,
  MOIC_BH_SOURCE_COVERAGE_TARGETS,
  MOCI_KW_SOURCE_COVERAGE_TARGETS,
  IPPD_JO_SOURCE_COVERAGE_TARGETS,
  DPDT_BD_SOURCE_COVERAGE_TARGETS,
  DOI_NP_SOURCE_COVERAGE_TARGETS,
  MYIPO_MY_SOURCE_COVERAGE_TARGETS,
  IPOPHL_PH_SOURCE_COVERAGE_TARGETS,
  DJKI_ID_SOURCE_COVERAGE_TARGETS,
  IPVN_VN_SOURCE_COVERAGE_TARGETS,
  NIPO_LK_SOURCE_COVERAGE_TARGETS,
  DIP_TH_SOURCE_COVERAGE_TARGETS,
  CIPC_ZA_SOURCE_COVERAGE_TARGETS,
  INAPI_CL_SOURCE_COVERAGE_TARGETS,
  SIC_CO_SOURCE_COVERAGE_TARGETS,
  IPOS_SOURCE_COVERAGE_TARGETS,
  JPO_SOURCE_COVERAGE_TARGETS,
  KOREA_SOURCE_COVERAGE_TARGETS,
  PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,
  UKIPO_SOURCE_COVERAGE_TARGETS,
  WIPO_SOURCE_COVERAGE_TARGETS,
};
export const SOURCE_COVERAGE_TARGETS = [
  ...US_SOURCE_COVERAGE_TARGETS,
  ...WIPO_SOURCE_COVERAGE_TARGETS,
  ...EUIPO_SOURCE_COVERAGE_TARGETS,
  ...PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,
] satisfies readonly SourceCoverageTarget[];

export type SourceCoverageFilters = {
  jurisdiction?: string;
  family?: SourceCoverageFamily;
  coverageTier?: SourceCoverageTier;
  catalogState?: SourceCoverageCatalogState;
};

export type SourceCoverageRegistration = {
  targetId: string;
  state: "REGISTERED" | "UNREGISTERED";
  sourceIds: string[];
};

function normalizeUri(uri: string): string {
  const parsed = new URL(uri);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString().replace(/\/$/, "");
}

export function listSourceCoverageTargets(
  filters: SourceCoverageFilters = {},
): SourceCoverageTarget[] {
  return SOURCE_COVERAGE_TARGETS.filter((item) => {
    if (filters.jurisdiction && item.jurisdiction !== filters.jurisdiction.toUpperCase())
      return false;
    if (filters.family && item.family !== filters.family) return false;
    if (filters.coverageTier && item.coverageTier !== filters.coverageTier) return false;
    if (filters.catalogState && item.catalogState !== filters.catalogState) return false;
    return true;
  }).map((item) => ({
    ...item,
    entrypoints: [...item.entrypoints],
    acquisition: { ...item.acquisition },
  }));
}

export function getSourceCoverageTarget(id: string): SourceCoverageTarget | undefined {
  const item = SOURCE_COVERAGE_TARGETS.find((candidate) => candidate.id === id);
  if (!item) return undefined;
  return { ...item, entrypoints: [...item.entrypoints], acquisition: { ...item.acquisition } };
}

export function summarizeSourceCoverage(
  targets: readonly SourceCoverageTarget[],
): SourceCoverageSummary {
  const byTier = Object.fromEntries(SOURCE_COVERAGE_TIERS.map((tier) => [tier, 0])) as Record<
    SourceCoverageTier,
    number
  >;
  const byCatalogState = Object.fromEntries(
    SOURCE_COVERAGE_CATALOG_STATES.map((state) => [state, 0]),
  ) as Record<SourceCoverageCatalogState, number>;
  const byFamily: SourceCoverageSummary["byFamily"] = {};

  for (const item of targets) {
    byTier[item.coverageTier] += 1;
    byCatalogState[item.catalogState] += 1;
    byFamily[item.family] = (byFamily[item.family] ?? 0) + 1;
  }

  return { total: targets.length, byTier, byCatalogState, byFamily };
}

export function evaluateSourceCoverage(
  sources: readonly SourceDefinition[],
  targets: readonly SourceCoverageTarget[] = SOURCE_COVERAGE_TARGETS,
): SourceCoverageRegistration[] {
  const sourceUris = sources.map((source) => ({
    sourceId: source.id,
    uris: new Set(
      [source.canonicalUri, ...source.entrypoints.map((entrypoint) => entrypoint.uri)]
        .filter((uri): uri is string => Boolean(uri))
        .map(normalizeUri),
    ),
  }));

  return targets.map((item) => {
    const targetUris = new Set(
      [item.canonicalUri, ...item.entrypoints.map((entrypoint) => entrypoint.uri)].map(
        normalizeUri,
      ),
    );
    const sourceIds = sourceUris
      .filter((source) => [...targetUris].some((uri) => source.uris.has(uri)))
      .map((source) => source.sourceId);
    return {
      targetId: item.id,
      state: sourceIds.length > 0 ? "REGISTERED" : "UNREGISTERED",
      sourceIds,
    };
  });
}
