import {
  SOURCE_COVERAGE_PROTOCOL_VERSION,
  type SourceCoverageCatalogState,
  type SourceCoverageChangeSensitivity,
  type SourceCoverageFamily,
  type SourceCoverageTarget,
  type SourceCoverageTier,
} from "@markorbit/contracts";

const VERIFIED_AT = "2026-08-17T00:00:00Z";
const OAPI_AUTHORITY_NAME = "African Intellectual Property Organization (OAPI)";
const OAPI_VERIFICATION_URI = "https://oapi.int/";

type OapiJurisdiction = "CI" | "CM" | "SN";

type TargetBlueprint = {
  key: string;
  family: SourceCoverageFamily;
  displayName: string;
  canonicalUri: string;
  coverageTier?: SourceCoverageTier;
  catalogState?: SourceCoverageCatalogState;
  changeSensitivity?: SourceCoverageChangeSensitivity;
  mode?: SourceCoverageTarget["acquisition"]["mode"];
  renderJavascriptHint?: boolean;
  fetchAttachmentsHint?: boolean;
  expectedArtifactKinds?: SourceCoverageTarget["acquisition"]["expectedArtifactKinds"];
  notes?: string;
};

const OAPI_TARGET_BLUEPRINTS: readonly TargetBlueprint[] = [
  {
    key: "portal",
    family: "PORTAL",
    displayName: "OAPI Regional Intellectual Property Office",
    canonicalUri: "https://oapi.int/oapi/",
    notes:
      "Shared regional authority source. OAPI centrally administers industrial-property titles for its member states under the Bangui Agreement.",
  },
  {
    key: "trademark-filing",
    family: "FILING",
    displayName: "OAPI Trademark Protection and Filing",
    canonicalUri: "https://oapi.int/proteger-la-pi/marque/",
    notes:
      "Official OAPI trademark page covering filing directly with OAPI or through national liaison structures, electronic filing, classes and payment evidence.",
  },
  {
    key: "trademark-search",
    family: "SEARCH",
    displayName: "OAPI Trademark Prior-Art Search",
    canonicalUri: "https://oapi.int/proteger-la-pi/recherche-danteriorite/",
    notes:
      "Official OAPI identical/similarity search service for product and service trademarks.",
  },
  {
    key: "trademark-fees",
    family: "FEES",
    displayName: "OAPI Trademark Fee Regulations",
    canonicalUri: "https://oapi.int/ressources/reglements-des-taxes/",
    changeSensitivity: "HIGH",
    notes:
      "Official current OAPI fee-regulation index includes fees for product and service trademarks; amounts remain at source.",
  },
  {
    key: "bangui-agreement",
    family: "LEGAL_TEXTS",
    displayName: "OAPI Bangui Agreement – Trademark Annex III",
    canonicalUri: "https://oapi.int/cadre-juridique/accord-de-bangui/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    notes:
      "The Bangui Agreement governs IP across OAPI member states, serves as national law in each member state and places product/service trademarks in Annex III.",
  },
  {
    key: "implementing-regulation",
    family: "EXAMINATION_MANUAL",
    displayName: "OAPI Implementing Regulation to the Bangui Agreement",
    canonicalUri: "https://oapi.int/ressources/reglement-dapplication/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    notes: "Official implementing regulation for the Bangui Agreement, Act of 14 December 2015.",
  },
];

function targetsFor(jurisdiction: OapiJurisdiction): SourceCoverageTarget[] {
  return OAPI_TARGET_BLUEPRINTS.map((input) => ({
    protocolVersion: SOURCE_COVERAGE_PROTOCOL_VERSION,
    objectType: "SOURCE_COVERAGE_TARGET",
    jurisdiction,
    authorityName: OAPI_AUTHORITY_NAME,
    authorityBasis: "EXPLICIT_CURATED",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    languages: ["fr"],
    catalogState: input.catalogState ?? "ACTIVE",
    coverageTier: input.coverageTier ?? "FOUNDATIONAL",
    changeSensitivity: input.changeSensitivity ?? "HIGH",
    verifiedAt: VERIFIED_AT,
    id: `${jurisdiction.toLowerCase()}-oapi-${input.key}`,
    family: input.family,
    displayName: input.displayName,
    canonicalUri: input.canonicalUri,
    entrypoints: [{ uri: input.canonicalUri }],
    acquisition: {
      mode: input.mode ?? "WEB_CRAWL",
      renderJavascriptHint: input.renderJavascriptHint ?? false,
      fetchAttachmentsHint: input.fetchAttachmentsHint ?? false,
      expectedArtifactKinds: input.expectedArtifactKinds ?? ["HTML", "MARKDOWN"],
    },
    verificationEvidenceUri: OAPI_VERIFICATION_URI,
    ...(input.notes ? { notes: input.notes } : {}),
  }));
}

export const OAPI_CI_SOURCE_COVERAGE_TARGETS = targetsFor("CI");
export const OAPI_CM_SOURCE_COVERAGE_TARGETS = targetsFor("CM");
export const OAPI_SN_SOURCE_COVERAGE_TARGETS = targetsFor("SN");

export const PRIORITY_REGIONAL_SOURCE_COVERAGE_TARGETS = [
  ...OAPI_CI_SOURCE_COVERAGE_TARGETS,
  ...OAPI_CM_SOURCE_COVERAGE_TARGETS,
  ...OAPI_SN_SOURCE_COVERAGE_TARGETS,
] satisfies readonly SourceCoverageTarget[];
