import type { ArtifactKind, AuthorityLevel, SourceCategory } from "./schema-v1";
import type { SourceType } from "./vocabularies";

/**
 * Curated metadata for cross-jurisdiction reference sources.
 *
 * This contract classifies how a source may be acquired and exported with provenance.
 * It does not create a second Source lifecycle and does not perform legal interpretation,
 * scoring, investment analysis, recommendation, or content generation.
 */
export const GLOBAL_REFERENCE_SOURCE_PROTOCOL_VERSION = "1.0" as const;

export const GLOBAL_REFERENCE_SOURCE_ROLES = [
  "COUNTRY_CONTEXT",
  "INVESTMENT_GUIDE",
  "COUNTRY_STATISTICS",
  "PROPERTY_RIGHTS_INDEX",
  "TM_PRACTICE_GUIDE",
  "TM_CHANGE_SIGNAL",
  "IP_AUTHORITY_REFERENCE",
  "IP_CASE_STUDY",
  "IP_LEGAL_SOURCE",
  "TM_EXPERT_GUIDE",
  "CONTENT_MARKETING_REFERENCE",
  "COMPETITOR_BENCHMARK",
  "LEGACY_REFERENCE",
] as const;
export type GlobalReferenceSourceRole = (typeof GLOBAL_REFERENCE_SOURCE_ROLES)[number];

export const GLOBAL_REFERENCE_AUTHORITY_TIERS = [
  "A_PLUS",
  "A",
  "B_PLUS",
  "B",
  "C_PLUS",
  "C",
  "D",
] as const;
export type GlobalReferenceAuthorityTier = (typeof GLOBAL_REFERENCE_AUTHORITY_TIERS)[number];

export const GLOBAL_REFERENCE_CONTENT_DOMAINS = [
  "COUNTRY_PROFILE",
  "INVESTMENT_ENVIRONMENT",
  "DEMOGRAPHICS",
  "PROPERTY_RIGHTS",
  "TRADEMARK_PRACTICE",
  "TRADEMARK_LAW",
  "TRADEMARK_CHANGE",
  "IP_CASES",
  "CONTENT_IDEATION",
  "PROVIDER_PRICING",
] as const;
export type GlobalReferenceContentDomain = (typeof GLOBAL_REFERENCE_CONTENT_DOMAINS)[number];

export const GLOBAL_REFERENCE_INTENDED_USES = [
  "COUNTRY_PROFILE",
  "TRADEMARK_PROFILE",
  "CHANGE_SIGNAL",
  "CASE_LIBRARY",
  "CONTENT_IDEATION",
  "PROVIDER_BENCHMARK",
  "LEGACY_CROSSCHECK",
] as const;
export type GlobalReferenceIntendedUse = (typeof GLOBAL_REFERENCE_INTENDED_USES)[number];

export const GLOBAL_REFERENCE_FACT_ELIGIBILITY = [
  "PRIMARY",
  "AUTHORITATIVE_AGGREGATOR",
  "SECONDARY",
  "SUPPORTING_ONLY",
  "NONE",
] as const;
export type GlobalReferenceFactEligibility = (typeof GLOBAL_REFERENCE_FACT_ELIGIBILITY)[number];

export const GLOBAL_REFERENCE_VERIFICATION_POLICIES = [
  "NOT_REQUIRED",
  "CONDITIONAL",
  "REQUIRED",
] as const;
export type GlobalReferenceVerificationPolicy =
  (typeof GLOBAL_REFERENCE_VERIFICATION_POLICIES)[number];

export const GLOBAL_REFERENCE_CONTENT_REUSE_POLICIES = [
  "FACT_EXTRACTION_WITH_PROVENANCE",
  "STRUCTURE_AND_TOPIC_ONLY",
  "BENCHMARK_ONLY",
  "LEGACY_CROSSCHECK_ONLY",
] as const;
export type GlobalReferenceContentReusePolicy =
  (typeof GLOBAL_REFERENCE_CONTENT_REUSE_POLICIES)[number];

export const GLOBAL_REFERENCE_FRESHNESS_POLICIES = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "ANNUAL",
  "LOW_FREQUENCY",
] as const;
export type GlobalReferenceFreshnessPolicy = (typeof GLOBAL_REFERENCE_FRESHNESS_POLICIES)[number];

export type GlobalReferenceAcquisitionHint = {
  mode: "WEB_CRAWL" | "DIRECT_DOCUMENT" | "API_OR_STRUCTURED" | "MIXED";
  renderJavascriptHint: boolean;
  fetchAttachmentsHint: boolean;
  expectedArtifactKinds: ArtifactKind[];
};

export type GlobalReferenceVerification = {
  policy: GlobalReferenceVerificationPolicy;
  verifyAgainstSourceIds?: string[];
  verifyAgainstJurisdictionOfficialSource?: boolean;
};

export type GlobalReferenceSourceDescriptor = {
  protocolVersion: typeof GLOBAL_REFERENCE_SOURCE_PROTOCOL_VERSION;
  objectType: "GLOBAL_REFERENCE_SOURCE";
  id: string;
  name: string;
  canonicalUri: string;
  sourceType: SourceType;
  category: SourceCategory;
  authorityLevel: AuthorityLevel;
  sourceRole: GlobalReferenceSourceRole;
  authorityTier: GlobalReferenceAuthorityTier;
  jurisdictionScope: "GLOBAL" | "MULTI_JURISDICTION";
  languages: string[];
  contentDomains: GlobalReferenceContentDomain[];
  intendedUses: GlobalReferenceIntendedUse[];
  factEligibility: GlobalReferenceFactEligibility;
  changeSignalEligible: boolean;
  verification: GlobalReferenceVerification;
  contentReusePolicy: GlobalReferenceContentReusePolicy;
  freshnessPolicy: GlobalReferenceFreshnessPolicy;
  acquisition: GlobalReferenceAcquisitionHint;
  tags: string[];
  notes?: string;
};
