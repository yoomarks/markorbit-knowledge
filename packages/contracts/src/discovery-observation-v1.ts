export type DiscoverySourceFamily =
  | "OFFICIAL_AUTHORITY"
  | "PROFESSIONAL_FIRM"
  | "PROFESSIONAL_INDIVIDUAL"
  | "BLOG_MEDIA"
  | "NEWS"
  | "VIDEO_CHANNEL"
  | "CASE_DATABASE"
  | "GAZETTE"
  | "DATASET"
  | "PRIVATE_EMAIL"
  | "INTERNAL_SOURCE"
  | "OTHER";

export type DiscoveryAutonomyLevel = "L0_MANUAL" | "L1_ASSISTED" | "L2_GUIDED" | "L3_AUTONOMOUS" | "L4_TRUSTED_MONITORING";

export type ObservedEntityKind =
  | "ORGANIZATION"
  | "PROFESSIONAL_PERSON"
  | "AUTHORITY"
  | "COMPANY"
  | "BRAND"
  | "AUTHOR"
  | "SPEAKER"
  | "OTHER";

export type ObservedBusinessContactKind =
  | "BUSINESS_EMAIL"
  | "GENERAL_EMAIL"
  | "OFFICE_PHONE"
  | "OFFICE_ADDRESS"
  | "PROFESSIONAL_PROFILE_URL"
  | "BUSINESS_MESSAGING"
  | "OTHER";

export type ObservationConfidence = "LOW" | "MEDIUM" | "HIGH";

export type ObservationVisibility =
  | "PUBLIC_BUSINESS"
  | "ORGANIZATION_PRIVATE"
  | "WORKSPACE_PRIVATE"
  | "USER_LOCAL";

export interface DiscoveryEvidenceRef {
  sourceUri: string;
  observedAt: string;
  rawArtifactId?: string;
  locatorFragment?: string;
}

/**
 * A source-backed observation, not a resolved MarkOrbit Core entity.
 * Multiple observations may later resolve to one entity in Core.
 */
export interface ObservedEntityCandidate {
  observationId: string;
  kind: ObservedEntityKind;
  displayName: string;
  sourceFamily: DiscoverySourceFamily;
  evidence: DiscoveryEvidenceRef;
  confidence: ObservationConfidence;
  attributes?: Record<string, unknown>;
}

/**
 * A publicly presented professional/business contact point or a contact point
 * contained in appropriately scoped private professional evidence.
 *
 * This contract does not authorize private-personal enrichment. The evidence
 * and visibility fields are mandatory so downstream consumers can preserve
 * provenance and access boundaries.
 */
export interface ObservedBusinessContact {
  observationId: string;
  kind: ObservedBusinessContactKind;
  value: string;
  evidence: DiscoveryEvidenceRef;
  confidence: ObservationConfidence;
  visibility: ObservationVisibility;
  relatedEntityObservationId?: string;
  roleLabel?: string;
  lastVerifiedAt?: string;
}

export type ObservedRelationshipKind =
  | "WORKS_AT"
  | "AUTHORED_BY"
  | "PUBLISHED_BY"
  | "CITES"
  | "MENTIONS"
  | "MENTIONED_CLIENT"
  | "LOCATED_IN"
  | "SPECIALIZES_IN"
  | "OTHER";

/**
 * Relationship evidence observed in a source. It is a claim/evidence record,
 * not a verified current relationship or professional recommendation.
 */
export interface ObservedRelationshipCandidate {
  observationId: string;
  kind: ObservedRelationshipKind;
  subjectObservationId: string;
  objectObservationId?: string;
  objectLabel?: string;
  evidence: DiscoveryEvidenceRef;
  confidence: ObservationConfidence;
}
