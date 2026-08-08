import type {
  SourceDefinition,
  SourceGraphNode,
  SourceGraphObservationBatch,
  WebsiteSourceProfile,
} from "@markorbit/contracts";
import { SOURCE_GRAPH_PROTOCOL_VERSION } from "@markorbit/contracts";
import {
  generateSourceGraphId,
  type SourceGraphRepository,
  type SourceGraphSnapshot,
} from "@markorbit/persistence/source-graph";
import { RegistryValidationError } from "@markorbit/persistence";
import { websiteOrigin } from "./discovery-source-graph";

export type CompatibleSourceGraph = {
  requestedSourceId: string;
  governedSourceId: string;
  compatibilityProjection: boolean;
  snapshot: SourceGraphSnapshot;
};

function sourceLocator(source: SourceDefinition): string | null {
  return source.canonicalUri ?? source.entrypoints[0]?.uri ?? null;
}

export function findCompatibleSourceGraph(
  graph: SourceGraphRepository,
  source: SourceDefinition,
): CompatibleSourceGraph | null {
  const direct = graph.snapshotBySourceId(source.id);
  if (direct) {
    return {
      requestedSourceId: source.id,
      governedSourceId: direct.profile.sourceId,
      compatibilityProjection: false,
      snapshot: direct,
    };
  }
  if (source.sourceType !== "WEB") return null;
  const locator = sourceLocator(source);
  if (!locator) return null;
  const profile = graph.getProfileByCanonicalOrigin(source.workspaceId, websiteOrigin(locator));
  if (!profile) return null;
  const snapshot = graph.snapshotBySourceId(profile.sourceId);
  if (!snapshot) return null;
  return {
    requestedSourceId: source.id,
    governedSourceId: profile.sourceId,
    compatibilityProjection: profile.sourceId !== source.id,
    snapshot,
  };
}

function importProvenance(sourceId: string, sourceUri: string, observedAt: string) {
  return {
    kind: "IMPORT" as const,
    sourceId,
    sourceUri,
    observedAt,
  };
}

function ensureLegacyProfile(
  graph: SourceGraphRepository,
  source: SourceDefinition,
  observedAt: string,
): WebsiteSourceProfile {
  const locator = sourceLocator(source);
  if (!locator) {
    throw new RegistryValidationError(`WEB source ${source.id} has no canonical URI or entrypoint`);
  }
  const origin = websiteOrigin(locator);
  const existing = graph.getProfileByCanonicalOrigin(source.workspaceId, origin);
  if (existing) return existing;

  const profileId = generateSourceGraphId("spf");
  const rootNodeId = generateSourceGraphId("sgn");
  const url = new URL(origin);
  const profile: WebsiteSourceProfile = {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "WEBSITE_SOURCE_PROFILE",
    id: profileId,
    workspaceId: source.workspaceId,
    sourceId: source.id,
    canonicalOrigin: origin,
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
    identity: { strategy: "CANONICAL_URI", key: origin },
    reviewState: "RETAINED",
    lifecycleState: "ACTIVE",
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    provenance: [importProvenance(source.id, locator, observedAt)],
    canonicalOrigin: origin,
    host: url.hostname.toLowerCase(),
    displayName: source.name,
    extensions: { "x-markorbit-legacy-projection": true },
  };
  return graph.createProfile(profile, root);
}

export function projectLegacyWebSource(
  graph: SourceGraphRepository,
  source: SourceDefinition,
  observedAt = new Date().toISOString(),
): CompatibleSourceGraph {
  if (source.sourceType !== "WEB") {
    throw new RegistryValidationError(
      "Only WEB SourceDefinitions can be projected into Website Source Graph",
    );
  }
  const profile = ensureLegacyProfile(graph, source, observedAt);
  const governedSourceId = profile.sourceId;
  const root = graph.getNode(profile.rootNodeId);
  if (!root || root.kind !== "WEBSITE") {
    throw new RegistryValidationError(`WebsiteSourceProfile ${profile.id} has no valid root node`);
  }

  const entrypoints = source.entrypoints.filter(
    (entrypoint) => !graph.findNodeByIdentity(profile.id, "CANONICAL_URI", entrypoint.uri),
  );
  if (entrypoints.length > 0) {
    const nodes: SourceGraphNode[] = [root];
    const edges: SourceGraphObservationBatch["edges"] = [];
    for (const entrypoint of entrypoints) {
      const nodeId = generateSourceGraphId("sgn");
      const node: SourceGraphNode = {
        protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
        objectType: "SOURCE_GRAPH_NODE",
        id: nodeId,
        workspaceId: profile.workspaceId,
        sourceId: governedSourceId,
        profileId: profile.id,
        kind: "PAGE",
        identity: { strategy: "CANONICAL_URI", key: entrypoint.uri },
        reviewState: "RETAINED",
        lifecycleState: "ACTIVE",
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
        provenance: [importProvenance(governedSourceId, entrypoint.uri, observedAt)],
        canonicalUri: entrypoint.uri,
        ...(entrypoint.label ? { title: entrypoint.label } : {}),
        extensions: {
          "x-markorbit-legacy-source-id": source.id,
        },
      };
      nodes.push(node);
      edges.push({
        protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
        objectType: "SOURCE_GRAPH_EDGE",
        id: generateSourceGraphId("sge"),
        workspaceId: profile.workspaceId,
        sourceId: governedSourceId,
        profileId: profile.id,
        kind: "CONTAINS",
        subjectNodeId: root.id,
        objectNodeId: nodeId,
        reviewState: "RETAINED",
        lifecycleState: "ACTIVE",
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
        provenance: [importProvenance(governedSourceId, entrypoint.uri, observedAt)],
        extensions: {
          "x-markorbit-legacy-source-id": source.id,
        },
      });
    }

    const batch: SourceGraphObservationBatch = {
      protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
      objectType: "SOURCE_GRAPH_OBSERVATION_BATCH",
      id: generateSourceGraphId("sgb"),
      workspaceId: profile.workspaceId,
      sourceId: governedSourceId,
      profileId: profile.id,
      idempotencyKey: `legacy-source:${source.id}`,
      observedAt,
      producer: {
        kind: "MANUAL_IMPORT",
        name: "MarkOrbit legacy SourceDefinition projection",
        version: "1.0.0",
      },
      nodes,
      edges,
      extensions: {
        "x-markorbit-legacy-source-id": source.id,
      },
    };
    graph.ingestObservationBatch(batch);
  }

  const snapshot = graph.snapshotBySourceId(governedSourceId);
  if (!snapshot) {
    throw new RegistryValidationError(`Unable to read projected Source Graph for ${source.id}`);
  }
  return {
    requestedSourceId: source.id,
    governedSourceId,
    compatibilityProjection: governedSourceId !== source.id,
    snapshot,
  };
}
