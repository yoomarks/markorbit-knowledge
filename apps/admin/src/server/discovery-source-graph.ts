import type {
  SourceCandidate,
  SourceDefinition,
  SourceDiscoveryBatch,
  SourceGraphEdge,
  SourceGraphNode,
  SourceGraphObservationBatch,
  SourceGraphProvenance,
  WebsiteSourceProfile,
} from "@markorbit/contracts";
import { SOURCE_GRAPH_PROTOCOL_VERSION } from "@markorbit/contracts";
import {
  generateSourceGraphId,
  type SourceGraphRepository,
} from "@markorbit/persistence/source-graph";
import { RegistryValidationError } from "@markorbit/persistence";

export function websiteOrigin(locator: string): string {
  const url = new URL(locator);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RegistryValidationError("Website Source Graph requires an http or https locator");
  }
  return `${url.origin}/`;
}

function canonicalCandidateUri(locator: string): string {
  const url = new URL(locator);
  url.hash = "";
  return url.toString();
}

function isWebsiteRootUri(locator: string, profile: WebsiteSourceProfile): boolean {
  const url = new URL(canonicalCandidateUri(locator));
  const profileUrl = new URL(profile.canonicalOrigin);
  return url.origin === profileUrl.origin && url.pathname === "/" && url.search === "";
}

function publicPathLooksLikeDocument(url: URL): boolean {
  return /\.(?:pdf|doc|docx|xls|xlsx|csv|json|xml|txt|zip)$/i.test(url.pathname);
}

function looksLikeSitemap(url: URL): boolean {
  return /(?:^|[/_.-])sitemap(?:[/_.-]|$)/i.test(url.pathname) && /\.xml$/i.test(url.pathname);
}

function inferredMediaType(url: URL): string | undefined {
  const pathname = url.pathname.toLowerCase();
  if (pathname.endsWith(".pdf")) return "application/pdf";
  if (pathname.endsWith(".json")) return "application/json";
  if (pathname.endsWith(".xml")) return "application/xml";
  if (pathname.endsWith(".csv")) return "text/csv";
  if (pathname.endsWith(".txt")) return "text/plain";
  return undefined;
}

function candidateReviewState(candidate: SourceCandidate): SourceGraphNode["reviewState"] {
  if (candidate.status === "ACCEPTED") return "RETAINED";
  if (candidate.status === "REJECTED") return "REJECTED";
  return "OBSERVED";
}

function candidateProvenance(
  sourceId: string,
  batchId: string,
  candidate: SourceCandidate,
): SourceGraphProvenance {
  return {
    kind: "DISCOVERY",
    sourceId,
    sourceUri: candidate.locator,
    observedAt: candidate.discoveredAt,
    ...(candidate.candidateId.startsWith("cand_")
      ? { discoveryCandidateId: candidate.candidateId }
      : {}),
    ...(batchId.startsWith("disc_") ? { discoveryBatchId: batchId } : {}),
  };
}

function rootProvenance(
  sourceId: string,
  batchId: string,
  seedLocator: string,
  observedAt: string,
): SourceGraphProvenance {
  return {
    kind: "DISCOVERY",
    sourceId,
    sourceUri: seedLocator,
    observedAt,
    ...(batchId.startsWith("disc_") ? { discoveryBatchId: batchId } : {}),
  };
}

export function ensureWebsiteSourceProfile(
  graph: SourceGraphRepository,
  source: SourceDefinition,
  seedLocator: string,
  observedAt: string,
  discoveryBatchId: string,
): WebsiteSourceProfile {
  if (source.sourceType !== "WEB") {
    throw new RegistryValidationError(`Source ${source.id} is not a WEB source`);
  }
  const existing = graph.getProfileBySourceId(source.id);
  if (existing) return existing;

  const canonicalOrigin = websiteOrigin(source.canonicalUri ?? seedLocator);
  const url = new URL(canonicalOrigin);
  const profileId = generateSourceGraphId("spf");
  const rootNodeId = generateSourceGraphId("sgn");
  const provenance = rootProvenance(source.id, discoveryBatchId, seedLocator, observedAt);
  const profile: WebsiteSourceProfile = {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "WEBSITE_SOURCE_PROFILE",
    id: profileId,
    workspaceId: source.workspaceId,
    sourceId: source.id,
    canonicalOrigin,
    canonicalHost: url.hostname.toLowerCase(),
    observedHostAliases: [url.hostname.toLowerCase()],
    rootNodeId,
    createdAt: observedAt,
    updatedAt: observedAt,
  };
  const root: SourceGraphNode = {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_NODE",
    id: rootNodeId,
    workspaceId: source.workspaceId,
    sourceId: source.id,
    profileId,
    kind: "WEBSITE",
    identity: { strategy: "CANONICAL_URI", key: canonicalOrigin },
    reviewState: "RETAINED",
    lifecycleState: "ACTIVE",
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    provenance: [provenance],
    canonicalOrigin,
    host: url.hostname.toLowerCase(),
    displayName: source.name,
  };
  return graph.createProfile(profile, root);
}

export function candidateToGraphNode(
  source: SourceDefinition,
  profile: WebsiteSourceProfile,
  batchId: string,
  candidate: SourceCandidate,
): SourceGraphNode {
  const canonicalUri = canonicalCandidateUri(candidate.locator);
  const url = new URL(canonicalUri);
  const base = {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_NODE" as const,
    id: generateSourceGraphId("sgn"),
    workspaceId: source.workspaceId,
    sourceId: source.id,
    profileId: profile.id,
    identity: { strategy: "CANONICAL_URI" as const, key: canonicalUri },
    reviewState: candidateReviewState(candidate),
    lifecycleState: "ACTIVE" as const,
    firstObservedAt: candidate.discoveredAt,
    lastObservedAt: candidate.discoveredAt,
    provenance: [candidateProvenance(source.id, batchId, candidate)],
  };

  if (looksLikeSitemap(url)) {
    return {
      ...base,
      kind: "SITEMAP",
      canonicalUri,
      sitemapType: "UNKNOWN",
    };
  }
  if (publicPathLooksLikeDocument(url)) {
    return {
      ...base,
      kind: "DOCUMENT",
      canonicalUri,
      ...(candidate.title ? { title: candidate.title } : {}),
      ...(inferredMediaType(url) ? { mediaType: inferredMediaType(url) } : {}),
    };
  }
  return {
    ...base,
    kind: "PAGE",
    canonicalUri,
    ...(candidate.title ? { title: candidate.title } : {}),
  };
}

function edgeProvenance(node: SourceGraphNode): SourceGraphProvenance[] {
  return node.provenance;
}

function containsEdge(
  source: SourceDefinition,
  profile: WebsiteSourceProfile,
  rootNodeId: string,
  node: SourceGraphNode,
): SourceGraphEdge {
  return {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_EDGE",
    id: generateSourceGraphId("sge"),
    workspaceId: source.workspaceId,
    sourceId: source.id,
    profileId: profile.id,
    kind: "CONTAINS",
    subjectNodeId: rootNodeId,
    objectNodeId: node.id,
    reviewState: node.reviewState,
    lifecycleState: "ACTIVE",
    firstObservedAt: node.firstObservedAt,
    lastObservedAt: node.lastObservedAt,
    provenance: edgeProvenance(node),
  };
}

function discoveredFromEdge(
  source: SourceDefinition,
  profile: WebsiteSourceProfile,
  child: SourceGraphNode,
  parent: SourceGraphNode,
): SourceGraphEdge {
  return {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_EDGE",
    id: generateSourceGraphId("sge"),
    workspaceId: source.workspaceId,
    sourceId: source.id,
    profileId: profile.id,
    kind: "DISCOVERED_FROM",
    subjectNodeId: child.id,
    objectNodeId: parent.id,
    reviewState: child.reviewState,
    lifecycleState: "ACTIVE",
    firstObservedAt: child.firstObservedAt,
    lastObservedAt: child.lastObservedAt,
    provenance: edgeProvenance(child),
  };
}

function linksToEdge(
  source: SourceDefinition,
  profile: WebsiteSourceProfile,
  parent: SourceGraphNode,
  target: SourceGraphNode,
): SourceGraphEdge {
  return {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_EDGE",
    id: generateSourceGraphId("sge"),
    workspaceId: source.workspaceId,
    sourceId: source.id,
    profileId: profile.id,
    kind: "LINKS_TO",
    subjectNodeId: parent.id,
    objectNodeId: target.id,
    reviewState: target.reviewState,
    lifecycleState: "ACTIVE",
    firstObservedAt: target.firstObservedAt,
    lastObservedAt: target.lastObservedAt,
    provenance: edgeProvenance(target),
  };
}

export function writeDiscoveryBatchToSourceGraph(
  graph: SourceGraphRepository,
  source: SourceDefinition,
  profile: WebsiteSourceProfile,
  discoveryBatch: SourceDiscoveryBatch,
  candidates: SourceCandidate[],
): void {
  if (candidates.length === 0) return;
  const root = graph.getNode(profile.rootNodeId);
  if (!root || root.kind !== "WEBSITE") {
    throw new RegistryValidationError(
      `WebsiteSourceProfile ${profile.id} has no valid WEBSITE root`,
    );
  }

  const candidateEntries = candidates
    .filter((candidate) => !isWebsiteRootUri(candidate.locator, profile))
    .map((candidate) => ({
      candidate,
      node: candidateToGraphNode(source, profile, discoveryBatch.batchId, candidate),
    }));
  const byLocator = new Map<string, SourceGraphNode>([[profile.canonicalOrigin, root]]);
  for (const { node } of candidateEntries) {
    if ("canonicalUri" in node && typeof node.canonicalUri === "string") {
      byLocator.set(node.canonicalUri, node);
    }
  }

  const nodes: SourceGraphNode[] = [
    {
      ...root,
      lastObservedAt:
        Date.parse(discoveryBatch.createdAt) > Date.parse(root.lastObservedAt)
          ? discoveryBatch.createdAt
          : root.lastObservedAt,
      provenance: [
        ...root.provenance,
        rootProvenance(
          source.id,
          discoveryBatch.batchId,
          discoveryBatch.seeds[0]?.locator ?? profile.canonicalOrigin,
          discoveryBatch.createdAt,
        ),
      ],
    },
    ...candidateEntries.map(({ node }) => node),
  ];
  const edges: SourceGraphEdge[] = candidateEntries.map(({ node }) =>
    containsEdge(source, profile, root.id, node),
  );

  for (const { candidate, node: child } of candidateEntries) {
    if (!candidate.discoveredFrom) continue;
    const parentLocator = canonicalCandidateUri(candidate.discoveredFrom);
    const parent = byLocator.get(parentLocator);
    if (!parent || parent.id === child.id) continue;
    edges.push(discoveredFromEdge(source, profile, child, parent));
  }

  const observation: SourceGraphObservationBatch = {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_OBSERVATION_BATCH",
    id: generateSourceGraphId("sgb"),
    workspaceId: source.workspaceId,
    sourceId: source.id,
    profileId: profile.id,
    idempotencyKey: `discovery:${discoveryBatch.batchId}`,
    observedAt: discoveryBatch.createdAt,
    producer: {
      kind: "DISCOVERY",
      name: "MarkOrbit Knowledge Discovery",
      version: "1.0.0",
      ...(discoveryBatch.batchId.startsWith("disc_")
        ? { discoveryBatchId: discoveryBatch.batchId }
        : {}),
    },
    nodes,
    edges,
  };
  graph.ingestObservationBatch(observation);
}

/**
 * Records a structurally observed cross-origin link inside the originating
 * website graph. The external node is not a child of the source website and no
 * CONTAINS edge is created; the only relationship is the literal hyperlink.
 */
export function writeExternalDiscoveryLinkToSourceGraph(
  graph: SourceGraphRepository,
  source: SourceDefinition,
  profile: WebsiteSourceProfile,
  discoveryBatch: SourceDiscoveryBatch,
  candidate: SourceCandidate,
): void {
  if (websiteOrigin(candidate.locator) === profile.canonicalOrigin) {
    throw new RegistryValidationError("External Source Graph link requires a cross-origin target");
  }
  const root = graph.getNode(profile.rootNodeId);
  if (!root || root.kind !== "WEBSITE") {
    throw new RegistryValidationError(
      `WebsiteSourceProfile ${profile.id} has no valid WEBSITE root`,
    );
  }

  const target = candidateToGraphNode(source, profile, discoveryBatch.batchId, candidate);
  const parentLocator = candidate.discoveredFrom
    ? canonicalCandidateUri(candidate.discoveredFrom)
    : undefined;
  const parent = parentLocator
    ? isWebsiteRootUri(parentLocator, profile)
      ? root
      : (graph.findNodeByIdentity(profile.id, "CANONICAL_URI", parentLocator) ?? root)
    : root;
  const observation: SourceGraphObservationBatch = {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_OBSERVATION_BATCH",
    id: generateSourceGraphId("sgb"),
    workspaceId: source.workspaceId,
    sourceId: source.id,
    profileId: profile.id,
    idempotencyKey: `discovery-external:${discoveryBatch.batchId}:${candidate.candidateId}`,
    observedAt: candidate.discoveredAt,
    producer: {
      kind: "DISCOVERY",
      name: "MarkOrbit Knowledge Discovery",
      version: "1.0.0",
      ...(discoveryBatch.batchId.startsWith("disc_")
        ? { discoveryBatchId: discoveryBatch.batchId }
        : {}),
    },
    nodes: [target],
    edges: [linksToEdge(source, profile, parent, target)],
  };
  graph.ingestObservationBatch(observation);
}

export function reviewCandidateGraphNode(
  graph: SourceGraphRepository,
  profile: WebsiteSourceProfile,
  candidate: SourceCandidate,
  decision: "ACCEPTED" | "REJECTED",
): SourceGraphNode | null {
  const identityKey = isWebsiteRootUri(candidate.locator, profile)
    ? profile.canonicalOrigin
    : canonicalCandidateUri(candidate.locator);
  const node = graph.findNodeByIdentity(profile.id, "CANONICAL_URI", identityKey);
  if (!node) return null;
  return graph.reviewNode(node.id, decision === "ACCEPTED" ? "RETAINED" : "REJECTED");
}
