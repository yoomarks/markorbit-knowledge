import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  SOURCE_GRAPH_PROTOCOL_VERSION,
  type RawArtifact,
  type SourceGraphContactKind,
  type SourceGraphEdge,
  type SourceGraphNode,
  type SourceGraphObservationBatch,
  type SourceGraphOrganizationType,
  type SourceGraphProvenance,
  type WebsiteSourceProfile,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import type { RawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import type {
  SourceGraphBatchIngestResult,
  SourceGraphRepository,
} from "@markorbit/persistence/source-graph";

const EXTRACTOR_NAME = "deterministic-web-structure-extractor";
const EXTRACTOR_VERSION = "1.0.0";
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_LINKS = 200;
const DEFAULT_MAX_ENTITIES = 50;
const DEFAULT_MAX_CONTACTS = 50;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DOCUMENT_EXTENSIONS = new Map<string, { mediaType?: string; documentType: string }>([
  [".pdf", { mediaType: "application/pdf", documentType: "PDF" }],
  [".doc", { mediaType: "application/msword", documentType: "DOC" }],
  [
    ".docx",
    {
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      documentType: "DOCX",
    },
  ],
  [".xls", { mediaType: "application/vnd.ms-excel", documentType: "XLS" }],
  [
    ".xlsx",
    {
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      documentType: "XLSX",
    },
  ],
  [".ppt", { mediaType: "application/vnd.ms-powerpoint", documentType: "PPT" }],
  [
    ".pptx",
    {
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      documentType: "PPTX",
    },
  ],
  [".csv", { mediaType: "text/csv", documentType: "CSV" }],
  [".json", { mediaType: "application/json", documentType: "JSON" }],
  [".xml", { mediaType: "application/xml", documentType: "XML" }],
  [".zip", { mediaType: "application/zip", documentType: "ZIP" }],
]);

export type RawArtifactSourceGraphSkipReason =
  | "UNSUPPORTED_ARTIFACT_KIND"
  | "NO_SOURCE_GRAPH_PROFILE"
  | "ARTIFACT_TOO_LARGE"
  | "OUTSIDE_SOURCE_SCOPE"
  | "EMPTY_CONTENT";

export type RawArtifactSourceGraphResult =
  | {
      status: "SKIPPED";
      artifactId: string;
      sourceId: string;
      reason: RawArtifactSourceGraphSkipReason;
    }
  | {
      status: "EXTRACTED" | "REPLAYED";
      artifactId: string;
      sourceId: string;
      profileId: string;
      batchId: string;
      nodesObserved: number;
      edgesObserved: number;
      linkCount: number;
      entityCount: number;
      contactCount: number;
      truncated: boolean;
      ingest: SourceGraphBatchIngestResult;
    };

export type RawArtifactSourceGraphBuild = {
  batch: SourceGraphObservationBatch;
  linkCount: number;
  entityCount: number;
  contactCount: number;
  truncated: boolean;
};

export type RawArtifactSourceGraphOptions = {
  maxBytes?: number;
  maxLinks?: number;
  maxEntities?: number;
  maxContacts?: number;
};

type HtmlFacts = {
  title?: string;
  language?: string;
  canonicalUri?: string;
  links: string[];
  contacts: Array<{ kind: SourceGraphContactKind; value: string; fragment: string }>;
  jsonLd: unknown[];
};

type EntityContext = {
  nodes: Map<string, SourceGraphNode>;
  edges: Map<string, SourceGraphEdge>;
  contactKeys: Set<string>;
  entityCount: number;
  contactCount: number;
  truncated: boolean;
};

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

function stableGraphId(prefix: "sgn" | "sge" | "sgb", seed: string, observedAt: string): string {
  const timestamp = Number.isFinite(Date.parse(observedAt)) ? Date.parse(observedAt) : 0;
  const timePart = encodeBase32(BigInt(Math.max(0, timestamp)), 10);
  const digest = createHash("sha256").update(seed, "utf8").digest();
  let randomValue = 0n;
  for (const byte of digest.subarray(0, 10)) randomValue = (randomValue << 8n) | BigInt(byte);
  return `${prefix}_${timePart}${encodeBase32(randomValue, 16)}`;
}

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeHttpUri(value: string, base?: string): string | null {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeOrigin(value: string): string | null {
  const uri = normalizeHttpUri(value);
  if (!uri) return null;
  return `${new URL(uri).origin}/`;
}

function allowedHosts(profile: WebsiteSourceProfile): Set<string> {
  const hosts = new Set<string>([
    profile.canonicalHost.toLowerCase(),
    ...profile.observedHostAliases.map((host) => host.toLowerCase()),
  ]);
  for (const host of [...hosts]) {
    if (host.startsWith("www.")) hosts.add(host.slice(4));
    else hosts.add(`www.${host}`);
  }
  return hosts;
}

function inProfileScope(uri: string, profile: WebsiteSourceProfile): boolean {
  const normalized = normalizeHttpUri(uri);
  return (
    normalized !== null && allowedHosts(profile).has(new URL(normalized).hostname.toLowerCase())
  );
}

function isWebsiteRoot(uri: string, profile: WebsiteSourceProfile): boolean {
  const origin = normalizeOrigin(uri);
  return (
    origin !== null &&
    origin === normalizeOrigin(profile.canonicalOrigin) &&
    new URL(uri).pathname === "/"
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function compactText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const compact = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  return compact || undefined;
}

function extractAttribute(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return compactText(match?.[1] ?? match?.[2] ?? match?.[3]);
}

function extractHtmlFacts(content: string, baseUri: string): HtmlFacts {
  const title = compactText(content.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]);
  const htmlTag = content.match(/<html\b[^>]*>/i)?.[0];
  const language = htmlTag ? extractAttribute(htmlTag, "lang") : undefined;
  let canonicalUri: string | undefined;
  for (const tag of content.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = extractAttribute(tag, "rel")?.toLowerCase().split(/\s+/) ?? [];
    if (!rel.includes("canonical")) continue;
    const href = extractAttribute(tag, "href");
    const normalized = href ? normalizeHttpUri(href, baseUri) : null;
    if (normalized) {
      canonicalUri = normalized;
      break;
    }
  }

  const links: string[] = [];
  const contacts: HtmlFacts["contacts"] = [];
  for (const tag of content.match(/<(?:a|area)\b[^>]*>/gi) ?? []) {
    const href = extractAttribute(tag, "href");
    if (!href) continue;
    if (/^mailto:/i.test(href)) {
      const value = href
        .slice(href.indexOf(":") + 1)
        .split("?")[0]
        ?.trim()
        .toLowerCase();
      if (value) contacts.push({ kind: "GENERAL_EMAIL", value, fragment: "html:mailto" });
      continue;
    }
    if (/^tel:/i.test(href)) {
      const value = href
        .slice(href.indexOf(":") + 1)
        .split("?")[0]
        ?.trim();
      if (value) contacts.push({ kind: "OFFICE_PHONE", value, fragment: "html:tel" });
      continue;
    }
    const normalized = normalizeHttpUri(href, baseUri);
    if (normalized) links.push(normalized);
  }

  const jsonLd: unknown[] = [];
  const scriptPattern =
    /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const match of content.matchAll(scriptPattern)) {
    const raw = match[1]?.trim();
    if (!raw || raw.length > 1_000_000) continue;
    try {
      jsonLd.push(JSON.parse(raw) as unknown);
    } catch {
      // Invalid publisher metadata is ignored; RawArtifact itself remains preserved unchanged.
    }
  }

  return { title, language, canonicalUri, links, contacts, jsonLd };
}

function extractMarkdownFacts(content: string, baseUri: string): HtmlFacts {
  const frontmatterTitle = content.match(
    /^---\s*[\r\n]+[\s\S]*?^title:\s*["']?(.+?)["']?\s*$[\s\S]*?^---\s*$/im,
  )?.[1];
  const headingTitle = content.match(/^#\s+(.+?)\s*$/m)?.[1];
  const links: string[] = [];
  const contacts: HtmlFacts["contacts"] = [];
  const candidates = [
    ...content.matchAll(/!?(?:\[[^\]]*\])\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g),
    ...content.matchAll(/<((?:https?:\/\/|mailto:|tel:)[^>]+)>/gi),
  ];
  for (const match of candidates) {
    const href = match[1]?.trim();
    if (!href) continue;
    if (/^mailto:/i.test(href)) {
      const value = href
        .slice(href.indexOf(":") + 1)
        .split("?")[0]
        ?.trim()
        .toLowerCase();
      if (value) contacts.push({ kind: "GENERAL_EMAIL", value, fragment: "markdown:mailto" });
      continue;
    }
    if (/^tel:/i.test(href)) {
      const value = href
        .slice(href.indexOf(":") + 1)
        .split("?")[0]
        ?.trim();
      if (value) contacts.push({ kind: "OFFICE_PHONE", value, fragment: "markdown:tel" });
      continue;
    }
    const normalized = normalizeHttpUri(href, baseUri);
    if (normalized) links.push(normalized);
  }
  return { title: compactText(frontmatterTitle ?? headingTitle), links, contacts, jsonLd: [] };
}

function fileExtension(uri: string): string {
  const pathname = new URL(uri).pathname.toLowerCase();
  const lastSlash = pathname.lastIndexOf("/");
  const lastDot = pathname.lastIndexOf(".");
  return lastDot > lastSlash ? pathname.slice(lastDot) : "";
}

function linkedNodeKind(uri: string): "PAGE" | "DOCUMENT" | "SITEMAP" {
  const pathname = new URL(uri).pathname.toLowerCase();
  if (pathname.endsWith("sitemap.xml") || /(?:^|\/)sitemap[^/]*\.xml$/.test(pathname))
    return "SITEMAP";
  return DOCUMENT_EXTENSIONS.has(fileExtension(uri)) ? "DOCUMENT" : "PAGE";
}

function baseProvenance(
  artifact: RawArtifact,
  sourceUri: string,
  locatorFragment?: string,
): SourceGraphProvenance {
  return {
    kind: "RAW_ARTIFACT",
    sourceId: artifact.sourceId,
    sourceUri,
    observedAt: artifact.capturedAt,
    rawArtifactId: artifact.id,
    ...(locatorFragment ? { locatorFragment } : {}),
  };
}

function nodeIdFor(
  profile: WebsiteSourceProfile,
  kind: SourceGraphNode["kind"],
  identityKey: string,
  at: string,
): string {
  return stableGraphId("sgn", `${profile.id}|${kind}|${identityKey}`, at);
}

function edgeIdFor(
  profile: WebsiteSourceProfile,
  kind: SourceGraphEdge["kind"],
  subjectNodeId: string,
  objectNodeId: string,
  artifactId: string,
  at: string,
): string {
  return stableGraphId(
    "sge",
    `${profile.id}|${kind}|${subjectNodeId}|${objectNodeId}|${artifactId}`,
    at,
  );
}

function sourceLocalKey(kind: string, value: string): string {
  return `${kind}:${createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex").slice(0, 32)}`;
}

function normalizedEntityName(value: unknown): string | null {
  return typeof value === "string" ? (compactText(value) ?? null) : null;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function jsonTypes(value: Record<string, unknown>): string[] {
  const type = value["@type"];
  if (typeof type === "string") return [type];
  if (Array.isArray(type)) return type.filter((item): item is string => typeof item === "string");
  return [];
}

function organizationType(types: string[]): SourceGraphOrganizationType {
  const lower = types.map((value) => value.toLowerCase());
  if (lower.some((value) => value.includes("government"))) return "AUTHORITY";
  if (lower.some((value) => ["legalservice", "attorney", "lawfirm"].includes(value)))
    return "LAW_FIRM";
  if (lower.some((value) => value.includes("association") || value.includes("ngo")))
    return "ASSOCIATION";
  if (
    lower.some((value) =>
      ["corporation", "localbusiness", "professionalservice", "company"].includes(value),
    )
  )
    return "COMPANY";
  return "OTHER";
}

function isOrganization(types: string[]): boolean {
  const lower = types.map((value) => value.toLowerCase());
  return lower.some(
    (value) =>
      value.includes("organization") ||
      [
        "corporation",
        "localbusiness",
        "professionalservice",
        "legalservice",
        "attorney",
        "lawfirm",
        "company",
      ].includes(value),
  );
}

function addEdge(
  context: EntityContext,
  profile: WebsiteSourceProfile,
  artifact: RawArtifact,
  kind: SourceGraphEdge["kind"],
  subjectNodeId: string,
  objectNodeId: string,
  sourceUri: string,
  fragment: string,
): void {
  if (subjectNodeId === objectNodeId) return;
  const semanticKey = `${kind}|${subjectNodeId}|${objectNodeId}`;
  if (context.edges.has(semanticKey)) return;
  context.edges.set(semanticKey, {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_EDGE",
    id: edgeIdFor(profile, kind, subjectNodeId, objectNodeId, artifact.id, artifact.capturedAt),
    workspaceId: profile.workspaceId,
    sourceId: profile.sourceId,
    profileId: profile.id,
    kind,
    subjectNodeId,
    objectNodeId,
    reviewState: "OBSERVED",
    lifecycleState: "ACTIVE",
    firstObservedAt: artifact.capturedAt,
    lastObservedAt: artifact.capturedAt,
    provenance: [baseProvenance(artifact, sourceUri, fragment)],
  });
}

function addContact(
  context: EntityContext,
  profile: WebsiteSourceProfile,
  artifact: RawArtifact,
  ownerNodeId: string,
  kind: SourceGraphContactKind,
  value: string,
  sourceUri: string,
  fragment: string,
  maxContacts: number,
): void {
  const normalizedValue = kind.includes("EMAIL") ? value.trim().toLowerCase() : value.trim();
  if (!normalizedValue) return;
  const identityKey = sourceLocalKey(`contact:${kind}`, normalizedValue);
  const existingNode = context.nodes.get(identityKey);
  if (!existingNode && context.contactCount >= maxContacts) {
    context.truncated = true;
    return;
  }
  let nodeId = existingNode?.id;
  if (!nodeId) {
    nodeId = nodeIdFor(profile, "CONTACT_POINT", identityKey, artifact.capturedAt);
    context.nodes.set(identityKey, {
      protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
      objectType: "SOURCE_GRAPH_NODE",
      id: nodeId,
      workspaceId: profile.workspaceId,
      sourceId: profile.sourceId,
      profileId: profile.id,
      kind: "CONTACT_POINT",
      identity: { strategy: "SOURCE_LOCAL", key: identityKey },
      reviewState: "OBSERVED",
      lifecycleState: "ACTIVE",
      firstObservedAt: artifact.capturedAt,
      lastObservedAt: artifact.capturedAt,
      provenance: [baseProvenance(artifact, sourceUri, fragment)],
      contactKind: kind,
      value: normalizedValue,
      visibility: "PUBLIC_BUSINESS",
    });
    context.contactCount += 1;
  }
  context.contactKeys.add(identityKey);
  addEdge(
    context,
    profile,
    artifact,
    "HAS_CONTACT_POINT",
    ownerNodeId,
    nodeId,
    sourceUri,
    fragment,
  );
}

function explicitWebsiteUri(value: Record<string, unknown>, baseUri: string): string | undefined {
  const raw = typeof value.url === "string" ? value.url : undefined;
  return raw ? (normalizeHttpUri(raw, baseUri) ?? undefined) : undefined;
}

function addOrganization(
  context: EntityContext,
  profile: WebsiteSourceProfile,
  artifact: RawArtifact,
  value: Record<string, unknown>,
  baseUri: string,
  maxEntities: number,
  maxContacts: number,
): string | null {
  const name = normalizedEntityName(value.name);
  if (!name) return null;
  const websiteUri = explicitWebsiteUri(value, baseUri);
  const identityKey = sourceLocalKey("organization", `${name}|${websiteUri ?? ""}`);
  const existing = context.nodes.get(identityKey);
  if (existing) return existing.id;
  if (context.entityCount >= maxEntities) {
    context.truncated = true;
    return null;
  }
  const nodeId = nodeIdFor(profile, "ORGANIZATION", identityKey, artifact.capturedAt);
  context.nodes.set(identityKey, {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_NODE",
    id: nodeId,
    workspaceId: profile.workspaceId,
    sourceId: profile.sourceId,
    profileId: profile.id,
    kind: "ORGANIZATION",
    identity: { strategy: "SOURCE_LOCAL", key: identityKey },
    reviewState: "OBSERVED",
    lifecycleState: "ACTIVE",
    firstObservedAt: artifact.capturedAt,
    lastObservedAt: artifact.capturedAt,
    provenance: [baseProvenance(artifact, baseUri, "jsonld:organization")],
    displayName: name,
    organizationType: organizationType(jsonTypes(value)),
    ...(websiteUri ? { websiteUri } : {}),
  });
  context.entityCount += 1;
  if (typeof value.email === "string") {
    addContact(
      context,
      profile,
      artifact,
      nodeId,
      "BUSINESS_EMAIL",
      value.email,
      baseUri,
      "jsonld:email",
      maxContacts,
    );
  }
  if (typeof value.telephone === "string") {
    addContact(
      context,
      profile,
      artifact,
      nodeId,
      "OFFICE_PHONE",
      value.telephone,
      baseUri,
      "jsonld:telephone",
      maxContacts,
    );
  }
  return nodeId;
}

function addPerson(
  context: EntityContext,
  profile: WebsiteSourceProfile,
  artifact: RawArtifact,
  value: Record<string, unknown>,
  baseUri: string,
  maxEntities: number,
  maxContacts: number,
): string | null {
  const name = normalizedEntityName(value.name);
  if (!name) return null;
  const roleLabel = normalizedEntityName(value.jobTitle) ?? undefined;
  const identityKey = sourceLocalKey("person", `${name}|${roleLabel ?? ""}`);
  const existing = context.nodes.get(identityKey);
  if (existing) return existing.id;
  if (context.entityCount >= maxEntities) {
    context.truncated = true;
    return null;
  }
  const nodeId = nodeIdFor(profile, "PERSON", identityKey, artifact.capturedAt);
  context.nodes.set(identityKey, {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_NODE",
    id: nodeId,
    workspaceId: profile.workspaceId,
    sourceId: profile.sourceId,
    profileId: profile.id,
    kind: "PERSON",
    identity: { strategy: "SOURCE_LOCAL", key: identityKey },
    reviewState: "OBSERVED",
    lifecycleState: "ACTIVE",
    firstObservedAt: artifact.capturedAt,
    lastObservedAt: artifact.capturedAt,
    provenance: [baseProvenance(artifact, baseUri, "jsonld:person")],
    displayName: name,
    ...(roleLabel ? { roleLabel } : {}),
  });
  context.entityCount += 1;
  if (typeof value.email === "string") {
    addContact(
      context,
      profile,
      artifact,
      nodeId,
      "BUSINESS_EMAIL",
      value.email,
      baseUri,
      "jsonld:email",
      maxContacts,
    );
  }
  if (typeof value.telephone === "string") {
    addContact(
      context,
      profile,
      artifact,
      nodeId,
      "OFFICE_PHONE",
      value.telephone,
      baseUri,
      "jsonld:telephone",
      maxContacts,
    );
  }
  const worksFor = jsonObject(value.worksFor);
  if (worksFor) {
    const organizationId = addOrganization(
      context,
      profile,
      artifact,
      worksFor,
      baseUri,
      maxEntities,
      maxContacts,
    );
    if (organizationId)
      addEdge(
        context,
        profile,
        artifact,
        "WORKS_AT",
        nodeId,
        organizationId,
        baseUri,
        "jsonld:worksFor",
      );
  }
  return nodeId;
}

function visitJsonLd(
  value: unknown,
  visitor: (object: Record<string, unknown>) => void,
  depth = 0,
): void {
  if (depth > 8) return;
  if (Array.isArray(value)) {
    for (const child of value) visitJsonLd(child, visitor, depth + 1);
    return;
  }
  const object = jsonObject(value);
  if (!object) return;
  visitor(object);
  const graph = object["@graph"];
  if (graph !== undefined) visitJsonLd(graph, visitor, depth + 1);
}

function addJsonLdEntities(
  context: EntityContext,
  profile: WebsiteSourceProfile,
  artifact: RawArtifact,
  jsonLd: unknown[],
  currentNodeId: string,
  baseUri: string,
  maxEntities: number,
  maxContacts: number,
): void {
  for (const document of jsonLd) {
    visitJsonLd(document, (object) => {
      const types = jsonTypes(object);
      if (types.some((type) => type.toLowerCase() === "person")) {
        addPerson(context, profile, artifact, object, baseUri, maxEntities, maxContacts);
      } else if (isOrganization(types)) {
        addOrganization(context, profile, artifact, object, baseUri, maxEntities, maxContacts);
      }

      const authorValues = Array.isArray(object.author)
        ? object.author
        : object.author
          ? [object.author]
          : [];
      for (const rawAuthor of authorValues) {
        const author = jsonObject(rawAuthor);
        if (!author) continue;
        const authorId = addPerson(
          context,
          profile,
          artifact,
          author,
          baseUri,
          maxEntities,
          maxContacts,
        );
        if (authorId)
          addEdge(
            context,
            profile,
            artifact,
            "AUTHORED_BY",
            currentNodeId,
            authorId,
            baseUri,
            "jsonld:author",
          );
      }

      const publisher = jsonObject(object.publisher);
      if (publisher) {
        const publisherId = addOrganization(
          context,
          profile,
          artifact,
          publisher,
          baseUri,
          maxEntities,
          maxContacts,
        );
        if (publisherId)
          addEdge(
            context,
            profile,
            artifact,
            "PUBLISHED_BY",
            currentNodeId,
            publisherId,
            baseUri,
            "jsonld:publisher",
          );
      }
    });
  }
}

function newLinkedNode(
  profile: WebsiteSourceProfile,
  artifact: RawArtifact,
  uri: string,
  kind: "PAGE" | "DOCUMENT" | "SITEMAP",
  sourceUri: string,
): SourceGraphNode {
  const common = {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_NODE" as const,
    id: nodeIdFor(profile, kind, uri, artifact.capturedAt),
    workspaceId: profile.workspaceId,
    sourceId: profile.sourceId,
    profileId: profile.id,
    identity: { strategy: "CANONICAL_URI" as const, key: uri },
    reviewState: "OBSERVED" as const,
    lifecycleState: "ACTIVE" as const,
    firstObservedAt: artifact.capturedAt,
    lastObservedAt: artifact.capturedAt,
    provenance: [baseProvenance(artifact, sourceUri, "link")],
  };
  if (kind === "SITEMAP") return { ...common, kind, canonicalUri: uri, sitemapType: "UNKNOWN" };
  if (kind === "DOCUMENT") {
    const metadata = DOCUMENT_EXTENSIONS.get(fileExtension(uri));
    return {
      ...common,
      kind,
      canonicalUri: uri,
      ...(metadata?.mediaType ? { mediaType: metadata.mediaType } : {}),
      ...(metadata ? { documentType: metadata.documentType } : {}),
    };
  }
  return { ...common, kind, canonicalUri: uri };
}

export function buildRawArtifactSourceGraphBatch(
  artifact: RawArtifact,
  profile: WebsiteSourceProfile,
  content: string,
  graph: SourceGraphRepository,
  options: RawArtifactSourceGraphOptions = {},
): RawArtifactSourceGraphBuild {
  if (artifact.sourceId !== profile.sourceId || artifact.workspaceId !== profile.workspaceId) {
    throw new RegistryValidationError(
      "RawArtifact and WebsiteSourceProfile must share exact source scope",
    );
  }
  const suppliedUri = artifact.canonicalUri ?? artifact.provenance.sourceUri;
  const initialUri = normalizeHttpUri(suppliedUri);
  if (!initialUri || !inProfileScope(initialUri, profile)) {
    throw new RegistryValidationError("RawArtifact URI is outside its WebsiteSourceProfile scope");
  }

  const facts =
    artifact.artifactKind === "HTML"
      ? extractHtmlFacts(content, initialUri)
      : extractMarkdownFacts(content, initialUri);
  const candidateCanonical =
    facts.canonicalUri && inProfileScope(facts.canonicalUri, profile)
      ? facts.canonicalUri
      : initialUri;
  const currentUri = normalizeHttpUri(candidateCanonical) ?? initialUri;
  const maxLinks = options.maxLinks ?? DEFAULT_MAX_LINKS;
  const maxEntities = options.maxEntities ?? DEFAULT_MAX_ENTITIES;
  const maxContacts = options.maxContacts ?? DEFAULT_MAX_CONTACTS;
  const nodes = new Map<string, SourceGraphNode>();
  const edges = new Map<string, SourceGraphEdge>();
  const contactKeys = new Set<string>();
  const context: EntityContext = {
    nodes,
    edges,
    contactKeys,
    entityCount: 0,
    contactCount: 0,
    truncated: false,
  };
  const root = graph.getNode(profile.rootNodeId);
  if (!root || root.kind !== "WEBSITE") {
    throw new RegistryValidationError(
      `WebsiteSourceProfile ${profile.id} has no valid WEBSITE root`,
    );
  }

  let currentNodeId = root.id;
  if (isWebsiteRoot(currentUri, profile)) {
    nodes.set(root.identity.key, {
      protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
      objectType: "SOURCE_GRAPH_NODE",
      id: root.id,
      workspaceId: profile.workspaceId,
      sourceId: profile.sourceId,
      profileId: profile.id,
      kind: "WEBSITE",
      identity: { strategy: "CANONICAL_URI", key: profile.canonicalOrigin },
      reviewState: "OBSERVED",
      lifecycleState: "ACTIVE",
      firstObservedAt: artifact.capturedAt,
      lastObservedAt: artifact.capturedAt,
      provenance: [baseProvenance(artifact, currentUri, "document")],
      canonicalOrigin: profile.canonicalOrigin,
      host: profile.canonicalHost,
    });
  } else {
    const existingCurrent = graph.findNodeByIdentity(profile.id, "CANONICAL_URI", currentUri);
    if (existingCurrent) {
      currentNodeId = existingCurrent.id;
      if (existingCurrent.kind === "PAGE") {
        nodes.set(currentUri, {
          protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
          objectType: "SOURCE_GRAPH_NODE",
          id: existingCurrent.id,
          workspaceId: profile.workspaceId,
          sourceId: profile.sourceId,
          profileId: profile.id,
          kind: "PAGE",
          identity: { strategy: "CANONICAL_URI", key: currentUri },
          reviewState: "OBSERVED",
          lifecycleState: "ACTIVE",
          firstObservedAt: artifact.capturedAt,
          lastObservedAt: artifact.capturedAt,
          provenance: [baseProvenance(artifact, currentUri, "document")],
          canonicalUri: currentUri,
          ...(facts.title ? { title: facts.title } : {}),
          ...(facts.language ? { language: facts.language } : {}),
        });
      }
    } else {
      currentNodeId = nodeIdFor(profile, "PAGE", currentUri, artifact.capturedAt);
      nodes.set(currentUri, {
        protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
        objectType: "SOURCE_GRAPH_NODE",
        id: currentNodeId,
        workspaceId: profile.workspaceId,
        sourceId: profile.sourceId,
        profileId: profile.id,
        kind: "PAGE",
        identity: { strategy: "CANONICAL_URI", key: currentUri },
        reviewState: "OBSERVED",
        lifecycleState: "ACTIVE",
        firstObservedAt: artifact.capturedAt,
        lastObservedAt: artifact.capturedAt,
        provenance: [baseProvenance(artifact, currentUri, "document")],
        canonicalUri: currentUri,
        ...(facts.title ? { title: facts.title } : {}),
        ...(facts.language ? { language: facts.language } : {}),
      });
    }
    addEdge(context, profile, artifact, "CONTAINS", root.id, currentNodeId, currentUri, "document");
  }

  const uniqueLinks = [
    ...new Set(
      facts.links.map((uri) => normalizeHttpUri(uri)).filter((uri): uri is string => uri !== null),
    ),
  ].filter((uri) => inProfileScope(uri, profile) && uri !== currentUri);
  if (uniqueLinks.length > maxLinks) context.truncated = true;
  const selectedLinks = uniqueLinks.slice(0, maxLinks);
  for (const uri of selectedLinks) {
    const expectedKind = linkedNodeKind(uri);
    const deterministic = newLinkedNode(profile, artifact, uri, expectedKind, currentUri);
    const existing = graph.findNodeByIdentity(profile.id, "CANONICAL_URI", uri);
    const targetId = existing?.id ?? deterministic.id;
    if (!existing || (existing.id === deterministic.id && existing.kind === expectedKind)) {
      nodes.set(uri, { ...deterministic, id: targetId });
    }
    addEdge(context, profile, artifact, "LINKS_TO", currentNodeId, targetId, currentUri, "link");
    addEdge(
      context,
      profile,
      artifact,
      "CONTAINS",
      root.id,
      targetId,
      currentUri,
      "same-site-link",
    );
  }

  const uniqueAnchorContacts = new Map<string, HtmlFacts["contacts"][number]>();
  for (const contact of facts.contacts)
    uniqueAnchorContacts.set(`${contact.kind}|${contact.value.toLowerCase()}`, contact);
  for (const contact of uniqueAnchorContacts.values()) {
    addContact(
      context,
      profile,
      artifact,
      root.id,
      contact.kind,
      contact.value,
      currentUri,
      contact.fragment,
      maxContacts,
    );
  }

  addJsonLdEntities(
    context,
    profile,
    artifact,
    facts.jsonLd,
    currentNodeId,
    currentUri,
    maxEntities,
    maxContacts,
  );

  const batch: SourceGraphObservationBatch = {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_OBSERVATION_BATCH",
    id: stableGraphId(
      "sgb",
      `${artifact.id}|${EXTRACTOR_NAME}|${EXTRACTOR_VERSION}`,
      artifact.capturedAt,
    ),
    workspaceId: profile.workspaceId,
    sourceId: profile.sourceId,
    profileId: profile.id,
    idempotencyKey: `raw-artifact:${artifact.id}:${EXTRACTOR_NAME}:${EXTRACTOR_VERSION}`,
    observedAt: artifact.capturedAt,
    producer: {
      kind: "EXTRACTION",
      name: EXTRACTOR_NAME,
      version: EXTRACTOR_VERSION,
      ...(artifact.collectionRunId ? { collectionRunId: artifact.collectionRunId } : {}),
    },
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    extensions: {
      "x-markorbit-raw-artifact-sha256": artifact.binaryHash.value,
      "x-markorbit-extraction-truncated": context.truncated,
    },
  };

  return {
    batch,
    linkCount: selectedLinks.length,
    entityCount: context.entityCount,
    contactCount: context.contactCount,
    truncated: context.truncated,
  };
}

export async function extractRawArtifactIntoSourceGraph(
  artifactId: string,
  artifacts: RawArtifactRepository,
  graph: SourceGraphRepository,
  options: RawArtifactSourceGraphOptions = {},
): Promise<RawArtifactSourceGraphResult> {
  const view = artifacts.getArtifact(artifactId);
  if (!view) throw new RegistryValidationError(`RawArtifact ${artifactId} was not found`);
  const artifact = view.artifact;
  if (artifact.artifactKind !== "HTML" && artifact.artifactKind !== "MARKDOWN") {
    return {
      status: "SKIPPED",
      artifactId,
      sourceId: artifact.sourceId,
      reason: "UNSUPPORTED_ARTIFACT_KIND",
    };
  }
  const profile = graph.getProfileBySourceId(artifact.sourceId);
  if (!profile)
    return {
      status: "SKIPPED",
      artifactId,
      sourceId: artifact.sourceId,
      reason: "NO_SOURCE_GRAPH_PROFILE",
    };
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (artifact.sizeBytes > maxBytes)
    return {
      status: "SKIPPED",
      artifactId,
      sourceId: artifact.sourceId,
      reason: "ARTIFACT_TOO_LARGE",
    };
  const sourceUri = normalizeHttpUri(artifact.canonicalUri ?? artifact.provenance.sourceUri);
  if (!sourceUri || !inProfileScope(sourceUri, profile)) {
    return {
      status: "SKIPPED",
      artifactId,
      sourceId: artifact.sourceId,
      reason: "OUTSIDE_SOURCE_SCOPE",
    };
  }

  const contentLocation = artifacts.contentPath(artifactId);
  const bytes = await readFile(contentLocation.path);
  if (
    bytes.byteLength !== artifact.sizeBytes ||
    bytes.byteLength !== view.contentObject.sizeBytes
  ) {
    throw new RegistryValidationError(
      `RawArtifact ${artifactId} byte size no longer matches immutable evidence`,
    );
  }
  const digest = sha256Hex(bytes);
  if (digest !== artifact.binaryHash.value || digest !== view.contentObject.sha256) {
    throw new RegistryValidationError(
      `RawArtifact ${artifactId} SHA-256 no longer matches immutable evidence`,
    );
  }
  const content = bytes.toString("utf8");
  if (!content.trim())
    return { status: "SKIPPED", artifactId, sourceId: artifact.sourceId, reason: "EMPTY_CONTENT" };

  const built = buildRawArtifactSourceGraphBatch(artifact, profile, content, graph, options);
  const ingest = graph.ingestObservationBatch(built.batch);
  return {
    status: ingest.replayed ? "REPLAYED" : "EXTRACTED",
    artifactId,
    sourceId: artifact.sourceId,
    profileId: profile.id,
    batchId: built.batch.id,
    nodesObserved: built.batch.nodes.length,
    edgesObserved: built.batch.edges.length,
    linkCount: built.linkCount,
    entityCount: built.entityCount,
    contactCount: built.contactCount,
    truncated: built.truncated,
    ingest,
  };
}
