/**
 * Source Registry V2
 *
 * This contract records where a source came from and how it was discovered.
 * It intentionally contains no semantic interpretation, legal conclusion,
 * recommendation or generated knowledge.
 */

export const SOURCE_REGISTRY_V2_VERSION = "2.0" as const;

export const SOURCE_DISCOVERY_ORIGINS = [
  "MANUAL_SEED",
  "EXTERNAL_LINK",
  "SITEMAP",
  "RSS_FEED",
  "CITATION",
  "RELATED_SOURCE",
  "CORE_PROPOSAL",
] as const;

export type SourceDiscoveryOrigin = (typeof SOURCE_DISCOVERY_ORIGINS)[number];

export const SOURCE_RELATIONSHIP_TYPES = [
  "REFERENCES",
  "PUBLISHED_BY",
  "MEMBER_OF",
  "OFFICIAL_LINK",
  "RELATED_PUBLICATION",
  "SAME_ORGANIZATION",
] as const;

export type SourceRelationshipType = (typeof SOURCE_RELATIONSHIP_TYPES)[number];

export interface SourceDiscoveryProvenance {
  origin: SourceDiscoveryOrigin;
  discoveredAt: string;
  discoveredFromSourceId?: string;
  discoveredFromUrl?: string;
  evidenceUrl?: string;
}

export interface SourceRelationship {
  relationshipType: SourceRelationshipType;
  sourceId: string;
  relatedSourceId: string;
}

export interface SourceRegistryV2Record {
  sourceId: string;
  parentSourceId?: string;
  discoveryProvenance: SourceDiscoveryProvenance[];
  relationships: SourceRelationship[];
}
