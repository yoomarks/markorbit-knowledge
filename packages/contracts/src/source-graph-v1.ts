import type { JsonValue } from "./schema-v1";

export const SOURCE_GRAPH_PROTOCOL_VERSION = "1.0" as const;

export const SOURCE_GRAPH_NODE_KINDS = [
  "WEBSITE",
  "SECTION",
  "PAGE",
  "DOCUMENT",
  "SITEMAP",
  "ORGANIZATION",
  "PERSON",
  "CONTACT_POINT",
] as const;
export type SourceGraphNodeKind = (typeof SOURCE_GRAPH_NODE_KINDS)[number];

export const SOURCE_GRAPH_EDGE_KINDS = [
  "CONTAINS",
  "DISCOVERED_FROM",
  "LINKS_TO",
  "PUBLISHED_BY",
  "AUTHORED_BY",
  "WORKS_AT",
  "HAS_CONTACT_POINT",
  "MENTIONS",
  "REFERENCES",
  "CITES",
] as const;
export type SourceGraphEdgeKind = (typeof SOURCE_GRAPH_EDGE_KINDS)[number];

export const SOURCE_GRAPH_REVIEW_STATES = ["OBSERVED", "RETAINED", "REJECTED"] as const;
export type SourceGraphReviewState = (typeof SOURCE_GRAPH_REVIEW_STATES)[number];

export const SOURCE_GRAPH_LIFECYCLE_STATES = ["ACTIVE", "STALE", "REMOVED"] as const;
export type SourceGraphLifecycleState = (typeof SOURCE_GRAPH_LIFECYCLE_STATES)[number];

export const SOURCE_GRAPH_IDENTITY_STRATEGIES = ["CANONICAL_URI", "SOURCE_LOCAL"] as const;
export type SourceGraphIdentityStrategy = (typeof SOURCE_GRAPH_IDENTITY_STRATEGIES)[number];

export const SOURCE_GRAPH_PROVENANCE_KINDS = [
  "DISCOVERY",
  "RAW_ARTIFACT",
  "MANUAL",
  "IMPORT",
] as const;
export type SourceGraphProvenanceKind = (typeof SOURCE_GRAPH_PROVENANCE_KINDS)[number];

export const SOURCE_GRAPH_PRODUCER_KINDS = [
  "DISCOVERY",
  "COLLECTION",
  "EXTRACTION",
  "MANUAL_IMPORT",
] as const;
export type SourceGraphProducerKind = (typeof SOURCE_GRAPH_PRODUCER_KINDS)[number];

export const SOURCE_GRAPH_SITEMAP_TYPES = ["URL_SET", "INDEX", "UNKNOWN"] as const;
export type SourceGraphSitemapType = (typeof SOURCE_GRAPH_SITEMAP_TYPES)[number];

export const SOURCE_GRAPH_ORGANIZATION_TYPES = [
  "AUTHORITY",
  "LAW_FIRM",
  "COMPANY",
  "ASSOCIATION",
  "OTHER",
] as const;
export type SourceGraphOrganizationType = (typeof SOURCE_GRAPH_ORGANIZATION_TYPES)[number];

export const SOURCE_GRAPH_CONTACT_KINDS = [
  "BUSINESS_EMAIL",
  "GENERAL_EMAIL",
  "OFFICE_PHONE",
  "OFFICE_ADDRESS",
  "CONTACT_FORM",
  "PROFESSIONAL_PROFILE_URL",
  "BUSINESS_MESSAGING",
  "OTHER",
] as const;
export type SourceGraphContactKind = (typeof SOURCE_GRAPH_CONTACT_KINDS)[number];

export const SOURCE_GRAPH_CONTACT_VISIBILITIES = [
  "PUBLIC_BUSINESS",
  "ORGANIZATION_PRIVATE",
  "WORKSPACE_PRIVATE",
  "USER_LOCAL",
] as const;
export type SourceGraphContactVisibility = (typeof SOURCE_GRAPH_CONTACT_VISIBILITIES)[number];

export type SourceGraphExtensions = Record<`x-${string}`, JsonValue>;

export type SourceGraphIdentity = {
  strategy: SourceGraphIdentityStrategy;
  key: string;
};

export type SourceGraphProvenance = {
  kind: SourceGraphProvenanceKind;
  sourceId: string;
  sourceUri: string;
  observedAt: string;
  discoveryCandidateId?: string;
  discoveryBatchId?: string;
  rawArtifactId?: string;
  locatorFragment?: string;
};

export type WebsiteSourceProfile = {
  protocolVersion: typeof SOURCE_GRAPH_PROTOCOL_VERSION;
  objectType: "WEBSITE_SOURCE_PROFILE";
  id: string;
  workspaceId: string;
  sourceId: string;
  canonicalOrigin: string;
  canonicalHost: string;
  observedHostAliases: string[];
  rootNodeId: string;
  createdAt: string;
  updatedAt: string;
  extensions?: SourceGraphExtensions;
};

type SourceGraphNodeBase = {
  protocolVersion: typeof SOURCE_GRAPH_PROTOCOL_VERSION;
  objectType: "SOURCE_GRAPH_NODE";
  id: string;
  workspaceId: string;
  sourceId: string;
  profileId: string;
  kind: SourceGraphNodeKind;
  identity: SourceGraphIdentity;
  reviewState: SourceGraphReviewState;
  lifecycleState: SourceGraphLifecycleState;
  firstObservedAt: string;
  lastObservedAt: string;
  provenance: SourceGraphProvenance[];
  extensions?: SourceGraphExtensions;
};

export type WebsiteSourceGraphNode = SourceGraphNodeBase & {
  kind: "WEBSITE";
  canonicalOrigin: string;
  host: string;
  displayName?: string;
};

export type SectionSourceGraphNode = SourceGraphNodeBase & {
  kind: "SECTION";
  label: string;
  canonicalUri?: string;
  pathPrefix?: string;
};

export type PageSourceGraphNode = SourceGraphNodeBase & {
  kind: "PAGE";
  canonicalUri: string;
  title?: string;
  language?: string;
  topic?: string;
};

export type DocumentSourceGraphNode = SourceGraphNodeBase & {
  kind: "DOCUMENT";
  canonicalUri: string;
  title?: string;
  mediaType?: string;
  documentType?: string;
};

export type SitemapSourceGraphNode = SourceGraphNodeBase & {
  kind: "SITEMAP";
  canonicalUri: string;
  sitemapType: SourceGraphSitemapType;
};

export type OrganizationSourceGraphNode = SourceGraphNodeBase & {
  kind: "ORGANIZATION";
  displayName: string;
  organizationType: SourceGraphOrganizationType;
  websiteUri?: string;
};

export type PersonSourceGraphNode = SourceGraphNodeBase & {
  kind: "PERSON";
  displayName: string;
  roleLabel?: string;
};

export type ContactPointSourceGraphNode = SourceGraphNodeBase & {
  kind: "CONTACT_POINT";
  contactKind: SourceGraphContactKind;
  value: string;
  visibility: SourceGraphContactVisibility;
  roleLabel?: string;
  lastVerifiedAt?: string;
};

export type SourceGraphNode =
  | WebsiteSourceGraphNode
  | SectionSourceGraphNode
  | PageSourceGraphNode
  | DocumentSourceGraphNode
  | SitemapSourceGraphNode
  | OrganizationSourceGraphNode
  | PersonSourceGraphNode
  | ContactPointSourceGraphNode;

export type SourceGraphEdge = {
  protocolVersion: typeof SOURCE_GRAPH_PROTOCOL_VERSION;
  objectType: "SOURCE_GRAPH_EDGE";
  id: string;
  workspaceId: string;
  sourceId: string;
  profileId: string;
  kind: SourceGraphEdgeKind;
  subjectNodeId: string;
  objectNodeId: string;
  reviewState: SourceGraphReviewState;
  lifecycleState: SourceGraphLifecycleState;
  firstObservedAt: string;
  lastObservedAt: string;
  provenance: SourceGraphProvenance[];
  extensions?: SourceGraphExtensions;
};

export type SourceGraphProducer = {
  kind: SourceGraphProducerKind;
  name: string;
  version?: string;
  discoveryBatchId?: string;
  collectionRunId?: string;
};

export type SourceGraphObservationBatch = {
  protocolVersion: typeof SOURCE_GRAPH_PROTOCOL_VERSION;
  objectType: "SOURCE_GRAPH_OBSERVATION_BATCH";
  id: string;
  workspaceId: string;
  sourceId: string;
  profileId: string;
  idempotencyKey: string;
  observedAt: string;
  producer: SourceGraphProducer;
  nodes: SourceGraphNode[];
  edges: SourceGraphEdge[];
  extensions?: SourceGraphExtensions;
};

const ULID = "[0-9A-HJKMNP-TV-Z]{26}";
const WORKSPACE_ID = new RegExp(`^wsp_${ULID}$`);
const SOURCE_ID = new RegExp(`^src_${ULID}$`);
const PROFILE_ID = new RegExp(`^spf_${ULID}$`);
const NODE_ID = new RegExp(`^sgn_${ULID}$`);
const EDGE_ID = new RegExp(`^sge_${ULID}$`);
const BATCH_ID = new RegExp(`^sgb_${ULID}$`);
const ARTIFACT_ID = new RegExp(`^art_${ULID}$`);
const DISCOVERY_CANDIDATE_ID = /^cand_[a-f0-9]{24}$/;
const DISCOVERY_BATCH_ID = /^disc_[a-f0-9]{32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value));
}

function isHttpUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isCanonicalOrigin(value: unknown): value is string {
  if (!isHttpUri(value)) return false;
  const url = new URL(value);
  return url.toString() === `${url.origin}/` || value === url.origin;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEnumValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function isExtensions(value: unknown): value is SourceGraphExtensions {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return Object.keys(value).every((key) => /^x-[a-z0-9][a-z0-9.-]*$/.test(key));
}

function isIdentity(value: unknown): value is SourceGraphIdentity {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["strategy", "key"]) &&
    isEnumValue(SOURCE_GRAPH_IDENTITY_STRATEGIES, value.strategy) &&
    isNonEmptyString(value.key)
  );
}

function isProvenance(value: unknown): value is SourceGraphProvenance {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(value, [
      "kind",
      "sourceId",
      "sourceUri",
      "observedAt",
      "discoveryCandidateId",
      "discoveryBatchId",
      "rawArtifactId",
      "locatorFragment",
    ])
  ) {
    return false;
  }

  return (
    isEnumValue(SOURCE_GRAPH_PROVENANCE_KINDS, value.kind) &&
    typeof value.sourceId === "string" &&
    SOURCE_ID.test(value.sourceId) &&
    isHttpUri(value.sourceUri) &&
    isTimestamp(value.observedAt) &&
    (value.discoveryCandidateId === undefined ||
      (typeof value.discoveryCandidateId === "string" &&
        DISCOVERY_CANDIDATE_ID.test(value.discoveryCandidateId))) &&
    (value.discoveryBatchId === undefined ||
      (typeof value.discoveryBatchId === "string" &&
        DISCOVERY_BATCH_ID.test(value.discoveryBatchId))) &&
    (value.rawArtifactId === undefined ||
      (typeof value.rawArtifactId === "string" && ARTIFACT_ID.test(value.rawArtifactId))) &&
    isOptionalString(value.locatorFragment)
  );
}

function hasNodeBase(value: Record<string, unknown>): boolean {
  return (
    value.protocolVersion === SOURCE_GRAPH_PROTOCOL_VERSION &&
    value.objectType === "SOURCE_GRAPH_NODE" &&
    typeof value.id === "string" &&
    NODE_ID.test(value.id) &&
    typeof value.workspaceId === "string" &&
    WORKSPACE_ID.test(value.workspaceId) &&
    typeof value.sourceId === "string" &&
    SOURCE_ID.test(value.sourceId) &&
    typeof value.profileId === "string" &&
    PROFILE_ID.test(value.profileId) &&
    isEnumValue(SOURCE_GRAPH_NODE_KINDS, value.kind) &&
    isIdentity(value.identity) &&
    isEnumValue(SOURCE_GRAPH_REVIEW_STATES, value.reviewState) &&
    isEnumValue(SOURCE_GRAPH_LIFECYCLE_STATES, value.lifecycleState) &&
    isTimestamp(value.firstObservedAt) &&
    isTimestamp(value.lastObservedAt) &&
    Date.parse(value.lastObservedAt) >= Date.parse(value.firstObservedAt) &&
    Array.isArray(value.provenance) &&
    value.provenance.length > 0 &&
    value.provenance.every(isProvenance) &&
    isExtensions(value.extensions)
  );
}

const NODE_BASE_KEYS = [
  "protocolVersion",
  "objectType",
  "id",
  "workspaceId",
  "sourceId",
  "profileId",
  "kind",
  "identity",
  "reviewState",
  "lifecycleState",
  "firstObservedAt",
  "lastObservedAt",
  "provenance",
  "extensions",
] as const;

function hasUriIdentity(value: Record<string, unknown>, uri: string): boolean {
  return (
    isRecord(value.identity) &&
    value.identity.strategy === "CANONICAL_URI" &&
    value.identity.key === uri
  );
}

export function isWebsiteSourceProfile(value: unknown): value is WebsiteSourceProfile {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(value, [
      "protocolVersion",
      "objectType",
      "id",
      "workspaceId",
      "sourceId",
      "canonicalOrigin",
      "canonicalHost",
      "observedHostAliases",
      "rootNodeId",
      "createdAt",
      "updatedAt",
      "extensions",
    ])
  ) {
    return false;
  }
  if (!isCanonicalOrigin(value.canonicalOrigin)) return false;
  const canonicalUrl = new URL(value.canonicalOrigin);

  return (
    value.protocolVersion === SOURCE_GRAPH_PROTOCOL_VERSION &&
    value.objectType === "WEBSITE_SOURCE_PROFILE" &&
    typeof value.id === "string" &&
    PROFILE_ID.test(value.id) &&
    typeof value.workspaceId === "string" &&
    WORKSPACE_ID.test(value.workspaceId) &&
    typeof value.sourceId === "string" &&
    SOURCE_ID.test(value.sourceId) &&
    value.canonicalHost === canonicalUrl.hostname.toLowerCase() &&
    isStringArray(value.observedHostAliases) &&
    value.observedHostAliases.every((host) => host === host.toLowerCase() && host.length > 0) &&
    typeof value.rootNodeId === "string" &&
    NODE_ID.test(value.rootNodeId) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    Date.parse(value.updatedAt) >= Date.parse(value.createdAt) &&
    isExtensions(value.extensions)
  );
}

export function isSourceGraphNode(value: unknown): value is SourceGraphNode {
  if (!isRecord(value) || !hasNodeBase(value)) return false;

  for (const provenance of value.provenance as SourceGraphProvenance[]) {
    if (provenance.sourceId !== value.sourceId) return false;
  }

  switch (value.kind) {
    case "WEBSITE": {
      if (
        !hasOnlyKeys(value, [...NODE_BASE_KEYS, "canonicalOrigin", "host", "displayName"]) ||
        !isCanonicalOrigin(value.canonicalOrigin) ||
        !isNonEmptyString(value.host) ||
        !isOptionalString(value.displayName)
      ) {
        return false;
      }
      const origin = new URL(value.canonicalOrigin);
      return (
        value.host === origin.hostname.toLowerCase() &&
        hasUriIdentity(
          value,
          value.canonicalOrigin === origin.origin ? origin.origin : `${origin.origin}/`,
        )
      );
    }
    case "SECTION": {
      if (
        !hasOnlyKeys(value, [...NODE_BASE_KEYS, "label", "canonicalUri", "pathPrefix"]) ||
        !isNonEmptyString(value.label) ||
        (value.canonicalUri !== undefined && !isHttpUri(value.canonicalUri)) ||
        !isOptionalString(value.pathPrefix)
      ) {
        return false;
      }
      if (value.canonicalUri !== undefined) return hasUriIdentity(value, value.canonicalUri);
      return (value.identity as SourceGraphIdentity).strategy === "SOURCE_LOCAL";
    }
    case "PAGE":
      return (
        hasOnlyKeys(value, [...NODE_BASE_KEYS, "canonicalUri", "title", "language", "topic"]) &&
        isHttpUri(value.canonicalUri) &&
        hasUriIdentity(value, value.canonicalUri) &&
        isOptionalString(value.title) &&
        isOptionalString(value.language) &&
        isOptionalString(value.topic)
      );
    case "DOCUMENT":
      return (
        hasOnlyKeys(value, [
          ...NODE_BASE_KEYS,
          "canonicalUri",
          "title",
          "mediaType",
          "documentType",
        ]) &&
        isHttpUri(value.canonicalUri) &&
        hasUriIdentity(value, value.canonicalUri) &&
        isOptionalString(value.title) &&
        isOptionalString(value.mediaType) &&
        isOptionalString(value.documentType)
      );
    case "SITEMAP":
      return (
        hasOnlyKeys(value, [...NODE_BASE_KEYS, "canonicalUri", "sitemapType"]) &&
        isHttpUri(value.canonicalUri) &&
        hasUriIdentity(value, value.canonicalUri) &&
        isEnumValue(SOURCE_GRAPH_SITEMAP_TYPES, value.sitemapType)
      );
    case "ORGANIZATION":
      return (
        hasOnlyKeys(value, [...NODE_BASE_KEYS, "displayName", "organizationType", "websiteUri"]) &&
        (value.identity as SourceGraphIdentity).strategy === "SOURCE_LOCAL" &&
        isNonEmptyString(value.displayName) &&
        isEnumValue(SOURCE_GRAPH_ORGANIZATION_TYPES, value.organizationType) &&
        (value.websiteUri === undefined || isHttpUri(value.websiteUri))
      );
    case "PERSON":
      return (
        hasOnlyKeys(value, [...NODE_BASE_KEYS, "displayName", "roleLabel"]) &&
        (value.identity as SourceGraphIdentity).strategy === "SOURCE_LOCAL" &&
        isNonEmptyString(value.displayName) &&
        isOptionalString(value.roleLabel)
      );
    case "CONTACT_POINT":
      return (
        hasOnlyKeys(value, [
          ...NODE_BASE_KEYS,
          "contactKind",
          "value",
          "visibility",
          "roleLabel",
          "lastVerifiedAt",
        ]) &&
        (value.identity as SourceGraphIdentity).strategy === "SOURCE_LOCAL" &&
        isEnumValue(SOURCE_GRAPH_CONTACT_KINDS, value.contactKind) &&
        isNonEmptyString(value.value) &&
        isEnumValue(SOURCE_GRAPH_CONTACT_VISIBILITIES, value.visibility) &&
        isOptionalString(value.roleLabel) &&
        (value.lastVerifiedAt === undefined || isTimestamp(value.lastVerifiedAt))
      );
  }
}

export function isSourceGraphEdge(value: unknown): value is SourceGraphEdge {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(value, [
      "protocolVersion",
      "objectType",
      "id",
      "workspaceId",
      "sourceId",
      "profileId",
      "kind",
      "subjectNodeId",
      "objectNodeId",
      "reviewState",
      "lifecycleState",
      "firstObservedAt",
      "lastObservedAt",
      "provenance",
      "extensions",
    ])
  ) {
    return false;
  }

  return (
    value.protocolVersion === SOURCE_GRAPH_PROTOCOL_VERSION &&
    value.objectType === "SOURCE_GRAPH_EDGE" &&
    typeof value.id === "string" &&
    EDGE_ID.test(value.id) &&
    typeof value.workspaceId === "string" &&
    WORKSPACE_ID.test(value.workspaceId) &&
    typeof value.sourceId === "string" &&
    SOURCE_ID.test(value.sourceId) &&
    typeof value.profileId === "string" &&
    PROFILE_ID.test(value.profileId) &&
    isEnumValue(SOURCE_GRAPH_EDGE_KINDS, value.kind) &&
    typeof value.subjectNodeId === "string" &&
    NODE_ID.test(value.subjectNodeId) &&
    typeof value.objectNodeId === "string" &&
    NODE_ID.test(value.objectNodeId) &&
    value.subjectNodeId !== value.objectNodeId &&
    isEnumValue(SOURCE_GRAPH_REVIEW_STATES, value.reviewState) &&
    isEnumValue(SOURCE_GRAPH_LIFECYCLE_STATES, value.lifecycleState) &&
    isTimestamp(value.firstObservedAt) &&
    isTimestamp(value.lastObservedAt) &&
    Date.parse(value.lastObservedAt) >= Date.parse(value.firstObservedAt) &&
    Array.isArray(value.provenance) &&
    value.provenance.length > 0 &&
    value.provenance.every(
      (provenance) => isProvenance(provenance) && provenance.sourceId === value.sourceId,
    ) &&
    isExtensions(value.extensions)
  );
}

function isProducer(value: unknown): value is SourceGraphProducer {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ["kind", "name", "version", "discoveryBatchId", "collectionRunId"])) {
    return false;
  }

  return (
    isEnumValue(SOURCE_GRAPH_PRODUCER_KINDS, value.kind) &&
    isNonEmptyString(value.name) &&
    isOptionalString(value.version) &&
    (value.discoveryBatchId === undefined ||
      (typeof value.discoveryBatchId === "string" &&
        DISCOVERY_BATCH_ID.test(value.discoveryBatchId))) &&
    isOptionalString(value.collectionRunId)
  );
}

export function validateSourceGraphObservationBatch(value: unknown): string[] {
  if (!isRecord(value)) return ["batch must be an object"];

  const issues: string[] = [];
  const allowedKeys = [
    "protocolVersion",
    "objectType",
    "id",
    "workspaceId",
    "sourceId",
    "profileId",
    "idempotencyKey",
    "observedAt",
    "producer",
    "nodes",
    "edges",
    "extensions",
  ] as const;

  if (!hasOnlyKeys(value, allowedKeys)) issues.push("batch contains unknown top-level fields");
  if (value.protocolVersion !== SOURCE_GRAPH_PROTOCOL_VERSION) {
    issues.push("protocolVersion must be 1.0");
  }
  if (value.objectType !== "SOURCE_GRAPH_OBSERVATION_BATCH") {
    issues.push("objectType must be SOURCE_GRAPH_OBSERVATION_BATCH");
  }
  if (typeof value.id !== "string" || !BATCH_ID.test(value.id)) {
    issues.push("id must be an sgb_ prefixed ULID");
  }
  if (typeof value.workspaceId !== "string" || !WORKSPACE_ID.test(value.workspaceId)) {
    issues.push("workspaceId must be a wsp_ prefixed ULID");
  }
  if (typeof value.sourceId !== "string" || !SOURCE_ID.test(value.sourceId)) {
    issues.push("sourceId must be a src_ prefixed ULID");
  }
  if (typeof value.profileId !== "string" || !PROFILE_ID.test(value.profileId)) {
    issues.push("profileId must be an spf_ prefixed ULID");
  }
  if (!isNonEmptyString(value.idempotencyKey)) issues.push("idempotencyKey is required");
  if (!isTimestamp(value.observedAt)) issues.push("observedAt must be an RFC3339 UTC timestamp");
  if (!isProducer(value.producer)) issues.push("producer is invalid");
  if (!isExtensions(value.extensions)) issues.push("extensions must use x- namespaced keys");

  if (!Array.isArray(value.nodes)) {
    issues.push("nodes must be an array");
  } else {
    const nodeIds = new Set<string>();
    const identityKeys = new Set<string>();
    for (const node of value.nodes) {
      if (!isSourceGraphNode(node)) {
        issues.push("nodes contains an invalid SourceGraphNode");
        continue;
      }
      if (
        node.workspaceId !== value.workspaceId ||
        node.sourceId !== value.sourceId ||
        node.profileId !== value.profileId
      ) {
        issues.push(`node ${node.id} escapes the batch workspace/source/profile boundary`);
      }
      if (nodeIds.has(node.id)) issues.push(`duplicate node id ${node.id}`);
      nodeIds.add(node.id);
      if (identityKeys.has(node.identity.key)) {
        issues.push(`duplicate node identity ${node.identity.key}`);
      }
      identityKeys.add(node.identity.key);
    }
  }

  if (!Array.isArray(value.edges)) {
    issues.push("edges must be an array");
  } else {
    const edgeIds = new Set<string>();
    for (const edge of value.edges) {
      if (!isSourceGraphEdge(edge)) {
        issues.push("edges contains an invalid SourceGraphEdge");
        continue;
      }
      if (
        edge.workspaceId !== value.workspaceId ||
        edge.sourceId !== value.sourceId ||
        edge.profileId !== value.profileId
      ) {
        issues.push(`edge ${edge.id} escapes the batch workspace/source/profile boundary`);
      }
      if (edgeIds.has(edge.id)) issues.push(`duplicate edge id ${edge.id}`);
      edgeIds.add(edge.id);
    }
  }

  return issues;
}

export function isSourceGraphObservationBatch(
  value: unknown,
): value is SourceGraphObservationBatch {
  return validateSourceGraphObservationBatch(value).length === 0;
}
