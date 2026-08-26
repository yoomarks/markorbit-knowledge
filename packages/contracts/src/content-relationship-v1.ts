export const CONTENT_RELATIONSHIP_PROTOCOL_VERSION = "1.0" as const;

export const CONTENT_OBJECT_KINDS = [
  "WEB_CONTENT",
  "AI_SOURCE",
  "EXPERT_SOURCE",
  "CASE_DOSSIER",
  "CASE_EVIDENCE",
  "DOCUMENT",
  "RAW_ARTIFACT",
  "DERIVED_CONTENT",
] as const;
export type ContentObjectKind = (typeof CONTENT_OBJECT_KINDS)[number];

export const CONTENT_FACET_TYPES = [
  "KEYWORD",
  "TOPIC",
  "AUTHOR",
  "SOURCE",
  "JURISDICTION",
  "CONTENT_TYPE",
] as const;
export type ContentFacetType = (typeof CONTENT_FACET_TYPES)[number];

export const CONTENT_RELATION_TYPES = [
  "CITES",
  "DERIVED_FROM",
  "VERSION_OF",
  "SUPERSEDES",
  "DUPLICATE_OF",
  "SIMILAR_TO",
] as const;
export type ContentRelationType = (typeof CONTENT_RELATION_TYPES)[number];

export const RELATION_ORIGINS = [
  "EXPLICIT_SOURCE",
  "SYSTEM_DERIVED",
  "MACHINE_DERIVED",
  "HUMAN_CONFIRMED",
] as const;
export type RelationOrigin = (typeof RELATION_ORIGINS)[number];

export type ContentObjectRefV1 = {
  protocolVersion: typeof CONTENT_RELATIONSHIP_PROTOCOL_VERSION;
  objectType: "CONTENT_OBJECT_REF";
  objectId: string;
  objectKind: ContentObjectKind;
  workspaceId: string;
};

export type ContentFacetV1 = {
  protocolVersion: typeof CONTENT_RELATIONSHIP_PROTOCOL_VERSION;
  objectType: "CONTENT_FACET";
  content: ContentObjectRefV1;
  facetType: ContentFacetType;
  value: string;
  normalizedValue: string;
  origin: Exclude<RelationOrigin, "MACHINE_DERIVED">;
  evidenceRef?: string;
};

export type ContentEdgeV1 = {
  protocolVersion: typeof CONTENT_RELATIONSHIP_PROTOCOL_VERSION;
  objectType: "CONTENT_EDGE";
  from: ContentObjectRefV1;
  relationType: ContentRelationType;
  to: ContentObjectRefV1;
  origin: RelationOrigin;
  evidenceRef?: string;
  algorithm?: {
    id: string;
    version: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

function oneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isContentObjectRefV1(value: unknown): value is ContentObjectRefV1 {
  if (!isRecord(value)) return false;
  return (
    value.protocolVersion === CONTENT_RELATIONSHIP_PROTOCOL_VERSION &&
    value.objectType === "CONTENT_OBJECT_REF" &&
    nonBlank(value.objectId) &&
    oneOf(CONTENT_OBJECT_KINDS, value.objectKind) &&
    nonBlank(value.workspaceId)
  );
}

export function isContentFacetV1(value: unknown): value is ContentFacetV1 {
  if (!isRecord(value)) return false;
  return (
    value.protocolVersion === CONTENT_RELATIONSHIP_PROTOCOL_VERSION &&
    value.objectType === "CONTENT_FACET" &&
    isContentObjectRefV1(value.content) &&
    oneOf(CONTENT_FACET_TYPES, value.facetType) &&
    nonBlank(value.value) &&
    nonBlank(value.normalizedValue) &&
    value.normalizedValue === value.normalizedValue.toLocaleLowerCase("en-US") &&
    oneOf(RELATION_ORIGINS, value.origin) &&
    value.origin !== "MACHINE_DERIVED" &&
    (value.evidenceRef === undefined || nonBlank(value.evidenceRef))
  );
}

export function isContentEdgeV1(value: unknown): value is ContentEdgeV1 {
  if (!isRecord(value)) return false;
  if (
    value.protocolVersion !== CONTENT_RELATIONSHIP_PROTOCOL_VERSION ||
    value.objectType !== "CONTENT_EDGE" ||
    !isContentObjectRefV1(value.from) ||
    !isContentObjectRefV1(value.to) ||
    !oneOf(CONTENT_RELATION_TYPES, value.relationType) ||
    !oneOf(RELATION_ORIGINS, value.origin) ||
    (value.evidenceRef !== undefined && !nonBlank(value.evidenceRef))
  ) {
    return false;
  }
  if (value.from.workspaceId !== value.to.workspaceId) return false;
  if (value.from.objectId === value.to.objectId && value.relationType !== "VERSION_OF") return false;

  if (value.origin === "MACHINE_DERIVED") {
    if (!isRecord(value.algorithm) || !nonBlank(value.algorithm.id) || !nonBlank(value.algorithm.version)) {
      return false;
    }
  } else if (value.algorithm !== undefined) {
    return false;
  }
  return true;
}

export function normalizeContentFacetValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
