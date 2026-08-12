import type { ArtifactKind, AuthorityLevel, Extensions, SourceCategory } from "./schema-v1";
import type { SourceType } from "./vocabularies";

export const SOURCE_COVERAGE_PROTOCOL_VERSION = "1.0" as const;

export const SOURCE_COVERAGE_FAMILIES = [
  "PORTAL",
  "FILING",
  "SEARCH",
  "STATUS_AND_DOCUMENTS",
  "EXAMINATION_MANUAL",
  "TTAB_PROCEDURE",
  "GOODS_SERVICES_ID",
  "FEES",
  "ASSIGNMENTS",
  "MAINTENANCE",
  "TTAB_PROCEEDINGS",
  "PROCEEDINGS",
  "APPEALS_AND_CASELAW",
  "LEGAL_TEXTS",
  "OFFICIAL_GAZETTE",
  "SYSTEM_STATUS",
  "POLICY_NOTICES",
] as const;
export type SourceCoverageFamily = (typeof SOURCE_COVERAGE_FAMILIES)[number];

export const SOURCE_COVERAGE_TIERS = ["FOUNDATIONAL", "SUPPORTING", "CHANGE_SIGNAL"] as const;
export type SourceCoverageTier = (typeof SOURCE_COVERAGE_TIERS)[number];

export const SOURCE_COVERAGE_ACQUISITION_MODES = [
  "WEB_CRAWL",
  "DIRECT_DOCUMENT",
  "API_OR_STRUCTURED",
  "MIXED",
] as const;
export type SourceCoverageAcquisitionMode = (typeof SOURCE_COVERAGE_ACQUISITION_MODES)[number];

export const SOURCE_COVERAGE_CATALOG_STATES = ["ACTIVE", "WATCH", "RETIRED"] as const;
export type SourceCoverageCatalogState = (typeof SOURCE_COVERAGE_CATALOG_STATES)[number];

export const SOURCE_COVERAGE_CHANGE_SENSITIVITIES = ["HIGH", "NORMAL", "LOW"] as const;
export type SourceCoverageChangeSensitivity = (typeof SOURCE_COVERAGE_CHANGE_SENSITIVITIES)[number];

export type SourceCoverageEntrypoint = {
  uri: string;
  label?: string;
};

export type SourceCoverageAcquisitionHint = {
  mode: SourceCoverageAcquisitionMode;
  renderJavascriptHint: boolean;
  fetchAttachmentsHint: boolean;
  expectedArtifactKinds: ArtifactKind[];
};

/**
 * A SourceCoverageTarget is a version-controlled statement that a public source should be
 * represented in MarkOrbit's foundational source layer. It is not a CollectionPlan, does not
 * authorize collection, and must never be treated as scheduler permission.
 */
export type SourceCoverageTarget = {
  protocolVersion: typeof SOURCE_COVERAGE_PROTOCOL_VERSION;
  objectType: "SOURCE_COVERAGE_TARGET";
  id: string;
  jurisdiction: string;
  authorityName: string;
  authorityBasis: "EXPLICIT_CURATED";
  family: SourceCoverageFamily;
  displayName: string;
  canonicalUri: string;
  entrypoints: SourceCoverageEntrypoint[];
  sourceType: SourceType;
  category: SourceCategory;
  authorityLevel: AuthorityLevel;
  languages: string[];
  coverageTier: SourceCoverageTier;
  catalogState: SourceCoverageCatalogState;
  changeSensitivity: SourceCoverageChangeSensitivity;
  acquisition: SourceCoverageAcquisitionHint;
  verifiedAt: string;
  verificationEvidenceUri: string;
  notes?: string;
  extensions?: Extensions;
};

export type SourceCoverageSummary = {
  total: number;
  byTier: Record<SourceCoverageTier, number>;
  byCatalogState: Record<SourceCoverageCatalogState, number>;
  byFamily: Partial<Record<SourceCoverageFamily, number>>;
};
