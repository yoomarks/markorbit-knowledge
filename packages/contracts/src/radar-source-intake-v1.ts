/**
 * Radar Source Intake V1
 *
 * Boundary contract for externally operated Radar onboarding. It converts
 * onboarding evidence into reviewable Knowledge source proposals. It does not
 * authorize activation, collection, semantic ranking, or Story clustering.
 */

export const RADAR_SOURCE_INTAKE_VERSION = "radar-source-intake-v1" as const;

export const RADAR_INTAKE_FILENAMES = [
  "source_registry.csv",
  "candidates.csv",
  "missing_coverage.csv",
  "subscription_log.csv",
  "rules_map.csv",
] as const;
export type RadarIntakeFilename = (typeof RADAR_INTAKE_FILENAMES)[number];

export const RADAR_AUTHORITY_TYPES = [
  "official",
  "international_organization",
  "court",
  "government",
  "association",
  "professional_media",
  "legal_media",
  "law_firm",
  "ip_agency",
  "brand_media",
  "brand_consultancy",
  "business_media",
  "technology_media",
  "blog",
  "newsletter",
  "other",
] as const;
export type RadarAuthorityType = (typeof RADAR_AUTHORITY_TYPES)[number];

export const RADAR_SOURCE_TYPES = [
  "news",
  "newsletter",
  "email_alert",
  "rss",
  "official_notice",
  "guideline",
  "fee",
  "legislation",
  "case_law",
  "client_alert",
  "article",
  "blog",
  "gazette",
  "consultation",
  "system_status",
  "sitemap",
  "api",
  "pdf",
  "other",
] as const;
export type RadarSourceType = (typeof RADAR_SOURCE_TYPES)[number];

export const RADAR_SOURCE_PRIORITIES = ["S", "A", "B", "C"] as const;
export type RadarSourcePriority = (typeof RADAR_SOURCE_PRIORITIES)[number];

export const RADAR_SUBSCRIPTION_STATUSES = [
  "not_checked",
  "available",
  "subscribed",
  "confirmed",
  "already_subscribed",
  "no_newsletter",
  "rss_only",
  "html_watch",
  "sitemap_watch",
  "api_available",
  "manual_required",
  "rejected",
  "failed",
  "inactive",
] as const;
export type RadarSubscriptionStatus = (typeof RADAR_SUBSCRIPTION_STATUSES)[number];

export const RADAR_CANDIDATE_STATUSES = [
  "new",
  "review",
  "promote",
  "reject",
  "duplicate",
] as const;
export type RadarCandidateStatus = (typeof RADAR_CANDIDATE_STATUSES)[number];

export const RADAR_RULE_MATCH_TYPES = [
  "list_id",
  "sender_email",
  "sender_domain",
  "subject",
  "other",
] as const;
export type RadarRuleMatchType = (typeof RADAR_RULE_MATCH_TYPES)[number];

export const RADAR_ACQUISITION_KINDS = [
  "EMAIL",
  "RSS",
  "HTML_WATCH",
  "SITEMAP",
  "API",
  "PDF_WATCH",
] as const;
export type RadarAcquisitionKind = (typeof RADAR_ACQUISITION_KINDS)[number];

export type RadarIntakeDisposition = "REVIEW" | "CANDIDATE_ONLY" | "BLOCKED";

export interface RadarAdvisoryScores {
  /** External onboarding estimate only; never authoritative Knowledge truth. */
  sourceQuality?: number;
  authority?: number;
  originality?: number;
  freshness?: number;
  signal?: number;
  noise?: number;
}

export interface RadarEmailRoutingEvidence {
  matchType: RadarRuleMatchType;
  matchValue: string;
  gmailLabel?: string;
  verifiedFromRealEmail: boolean;
  ruleId?: string;
}

export interface RadarAcquisitionProposal {
  kind: RadarAcquisitionKind;
  locator: string;
  verified: boolean;
  senderEmail?: string;
  senderDomain?: string;
  listId?: string;
}

export interface RadarSourceProposal {
  externalSourceId: string;
  name: string;
  organizationName: string;
  organizationKey: string;
  endpointKey: string;
  jurisdiction?: string;
  country?: string;
  region?: string;
  language?: string;
  authorityType: RadarAuthorityType;
  topic?: string;
  sourceType: RadarSourceType;
  priority: RadarSourcePriority;
  subscriptionStatus: RadarSubscriptionStatus;
  confirmed: boolean;
  homepageUrl?: string;
  newsletterUrl?: string;
  newsUrl?: string;
  acquisitions: RadarAcquisitionProposal[];
  routingEvidence: RadarEmailRoutingEvidence[];
  discoveryProvenance: {
    origin: "RADAR_CODEX_ONBOARDING";
    discoveredBy?: string;
    parentSource?: string;
  };
  advisoryScores?: RadarAdvisoryScores;
  disposition: RadarIntakeDisposition;
  blockingReasons: string[];
  notes?: string;
}

export interface RadarCandidateProposal {
  externalCandidateId: string;
  name: string;
  url: string;
  organizationName?: string;
  country?: string;
  category?: string;
  discoveredFrom?: string;
  reason?: string;
  estimatedPriority?: RadarSourcePriority;
  externalStatus: RadarCandidateStatus;
  disposition: RadarIntakeDisposition;
  notes?: string;
}

export interface RadarCoverageGap {
  jurisdiction: string;
  country?: string;
  sourceCategory: string;
  importance?: string;
  currentCoverage?: string;
  missing: string;
  recommendedAction?: string;
  notes?: string;
}

export interface RadarSubscriptionEvidence {
  timestamp?: string;
  externalSourceId: string;
  sourceName?: string;
  newsletterUrl?: string;
  action?: string;
  result?: string;
  emailUsed?: string;
  confirmationRequired?: boolean;
  confirmationReceived?: boolean;
  confirmationCompleted?: boolean;
  gmailLabel?: string;
  manualRequired?: boolean;
  notes?: string;
}

export interface RadarRoutingRuleEvidence extends RadarEmailRoutingEvidence {
  externalSourceId: string;
  sourceName?: string;
  created: boolean;
  createdAt?: string;
  notes?: string;
}

export interface RadarIntakeIssue {
  severity: "ERROR" | "WARNING";
  code:
    | "MISSING_FILE"
    | "CSV_PARSE_ERROR"
    | "MISSING_HEADER"
    | "MISSING_REQUIRED_VALUE"
    | "UNSUPPORTED_ENUM"
    | "INVALID_BOOLEAN"
    | "INVALID_SCORE"
    | "DUPLICATE_ID"
    | "MISSING_ACQUISITION_LOCATOR";
  file: RadarIntakeFilename;
  row?: number;
  field?: string;
  value?: string;
  message: string;
}

export interface RadarSourceIntakePlan {
  version: typeof RADAR_SOURCE_INTAKE_VERSION;
  mode: "PLAN";
  inputLabel: string;
  generatedAt: string;
  mutationPerformed: false;
  activationAuthorized: false;
  collectionAuthorized: false;
  sourceProposals: RadarSourceProposal[];
  candidateProposals: RadarCandidateProposal[];
  coverageGaps: RadarCoverageGap[];
  subscriptionEvidence: RadarSubscriptionEvidence[];
  routingEvidence: RadarRoutingRuleEvidence[];
  issues: RadarIntakeIssue[];
  summary: {
    filesPresent: number;
    sourceRows: number;
    sourceProposals: number;
    candidateRows: number;
    candidateProposals: number;
    coverageGapRows: number;
    subscriptionRows: number;
    routingRows: number;
    errors: number;
    warnings: number;
  };
}
