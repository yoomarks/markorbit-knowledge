import type { DatabaseSync } from "node:sqlite";
import {
  SOURCE_OPERATIONAL_TOPOLOGY_PROTOCOL_VERSION,
  isRawArtifact,
  type RawArtifact,
  type SourceGraphNode,
  type SourceOperationalTopology,
  type SourceOperationalTopologyArtifact,
  type SourceOperationalTopologyAuthority,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryNotFoundError,
  RegistryValidationError,
  SqliteSourceRepository,
} from "./index";
import { SqliteSourceGraphRepository, type SourceGraphSnapshot } from "./source-graph-registry";
import { SqliteSourceRegistryV2Repository } from "./source-registry-v2-registry";

function normalizeUri(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.toString();
  } catch {
    return trimmed;
  }
}

function graphNodeUri(node: SourceGraphNode): string | null {
  switch (node.kind) {
    case "WEBSITE":
      return node.canonicalOrigin;
    case "SECTION":
      return node.canonicalUri ?? null;
    case "PAGE":
    case "DOCUMENT":
    case "SITEMAP":
      return node.canonicalUri;
    default:
      return null;
  }
}

function eligibleGraphNode(node: SourceGraphNode): boolean {
  return node.lifecycleState === "ACTIVE" && node.reviewState !== "REJECTED";
}

function authorities(snapshot: SourceGraphSnapshot | null): SourceOperationalTopologyAuthority[] {
  if (!snapshot) return [];
  const nodes = new Map(snapshot.nodes.filter(eligibleGraphNode).map((node) => [node.id, node]));
  const result: SourceOperationalTopologyAuthority[] = [];
  for (const node of snapshot.nodes) {
    if (
      node.kind !== "ORGANIZATION" ||
      node.organizationType !== "AUTHORITY" ||
      !eligibleGraphNode(node)
    ) {
      continue;
    }
    const edgeIds = snapshot.edges
      .filter(
        (edge) =>
          edge.kind === "PUBLISHED_BY" &&
          edge.objectNodeId === node.id &&
          edge.lifecycleState === "ACTIVE" &&
          edge.reviewState !== "REJECTED" &&
          nodes.has(edge.subjectNodeId),
      )
      .map((edge) => edge.id)
      .sort();
    if (edgeIds.length === 0) continue;
    result.push({
      nodeId: node.id,
      displayName: node.displayName,
      websiteUri: node.websiteUri ?? null,
      publishedByEdgeIds: edgeIds,
    });
  }
  return result.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
}

function hasTable(database: DatabaseSync, table: string): boolean {
  return Boolean(
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

function parseArtifact(value: string, workspaceId: string, sourceId: string): RawArtifact {
  const parsed = JSON.parse(value) as unknown;
  if (!isRawArtifact(parsed)) {
    throw new RegistryValidationError("Persisted RawArtifact violates Schema v1");
  }
  if (parsed.workspaceId !== workspaceId || parsed.sourceId !== sourceId) {
    throw new RegistryConflictError(
      "SOURCE_TOPOLOGY_ARTIFACT_SCOPE_MISMATCH",
      `RawArtifact ${parsed.id} does not match the requested source scope`,
    );
  }
  return parsed;
}

function projectArtifact(
  artifact: RawArtifact,
  entrypointUris: readonly string[],
): SourceOperationalTopologyArtifact {
  const artifactUris = [artifact.canonicalUri, artifact.provenance.sourceUri]
    .filter((value): value is string => Boolean(value))
    .map(normalizeUri);
  const matchedEntrypointUri =
    entrypointUris.find((uri) => artifactUris.includes(normalizeUri(uri))) ?? null;
  return {
    artifactId: artifact.id,
    artifactKind: artifact.artifactKind,
    version: artifact.version,
    logicalDocumentId: artifact.logicalDocumentId ?? null,
    canonicalUri: artifact.canonicalUri ?? null,
    sourceUri: artifact.provenance.sourceUri,
    binarySha256: artifact.binaryHash.value,
    contentSha256: artifact.contentHash?.value ?? null,
    sizeBytes: artifact.sizeBytes,
    capturedAt: artifact.capturedAt,
    matchedEntrypointUri,
  };
}

export class SqliteSourceOperationalTopologyRepository {
  private readonly sources: SqliteSourceRepository;
  private readonly sourceRegistryV2: SqliteSourceRegistryV2Repository;
  private readonly sourceGraph: SqliteSourceGraphRepository;

  constructor(private readonly database: DatabaseSync) {
    this.sources = new SqliteSourceRepository(database);
    this.sourceRegistryV2 = new SqliteSourceRegistryV2Repository(database);
    this.sourceGraph = new SqliteSourceGraphRepository(database);
  }

  get(sourceId: string): SourceOperationalTopology {
    const source = this.sources.getById(sourceId);
    if (!source) throw new RegistryNotFoundError(sourceId);

    const sourceRegistry = this.sourceRegistryV2.get(sourceId);
    const family = this.explicitFamily(source.id, source.workspaceId);
    const graph = this.sourceGraph.snapshotBySourceId(source.id);
    const explicitAuthorities = authorities(graph);
    const rawArtifactRegistryAvailable = hasTable(this.database, "raw_artifacts");
    const rawArtifacts = rawArtifactRegistryAvailable
      ? (
          this.database
            .prepare(
              `SELECT document_json FROM raw_artifacts
             WHERE workspace_id = ? AND source_id = ?
             ORDER BY created_at ASC, id ASC`,
            )
            .all(source.workspaceId, source.id) as Array<{ document_json: string }>
        ).map((row) => parseArtifact(row.document_json, source.workspaceId, source.id))
      : [];

    const eligibleNodes = graph?.nodes.filter(eligibleGraphNode) ?? [];
    const projectedEntrypoints = source.entrypoints.map((entrypoint) => {
      const normalized = normalizeUri(entrypoint.uri);
      const graphNode = eligibleNodes.find((node) => {
        const uri = graphNodeUri(node);
        return uri !== null && normalizeUri(uri) === normalized;
      });
      return {
        uri: entrypoint.uri,
        label: entrypoint.label ?? null,
        graphNodeId: graphNode?.id ?? null,
        artifactIds: [] as string[],
      };
    });
    const entrypointUris = projectedEntrypoints.map((entrypoint) => entrypoint.uri);
    const artifacts = rawArtifacts
      .map((artifact) => projectArtifact(artifact, entrypointUris))
      .sort(
        (left, right) =>
          Date.parse(left.capturedAt) - Date.parse(right.capturedAt) ||
          left.version - right.version ||
          left.artifactId.localeCompare(right.artifactId),
      );
    for (const artifact of artifacts) {
      if (!artifact.matchedEntrypointUri) continue;
      const entrypoint = projectedEntrypoints.find(
        (candidate) => candidate.uri === artifact.matchedEntrypointUri,
      );
      entrypoint?.artifactIds.push(artifact.artifactId);
    }

    return {
      protocolVersion: SOURCE_OPERATIONAL_TOPOLOGY_PROTOCOL_VERSION,
      objectType: "SOURCE_OPERATIONAL_TOPOLOGY",
      workspaceId: source.workspaceId,
      source: {
        sourceId: source.id,
        name: source.name,
        sourceType: source.sourceType,
        category: source.category,
        authorityLevel: source.authorityLevel,
        canonicalUri: source.canonicalUri ?? null,
      },
      family,
      authorities: explicitAuthorities,
      entrypoints: projectedEntrypoints,
      artifacts,
      relationships: sourceRegistry?.relationships ?? [],
      discoveryProvenance: sourceRegistry?.discoveryProvenance ?? [],
      graph: graph
        ? {
            profileId: graph.profile.id,
            rootNodeId: graph.profile.rootNodeId,
            nodeCount: graph.summary.nodeCount,
            edgeCount: graph.summary.edgeCount,
          }
        : null,
      coverage: {
        sourceRegistryV2Observed: sourceRegistry !== null,
        sourceGraphObserved: graph !== null,
        explicitParentageObserved: family.parentSourceIds.length > 0,
        explicitAuthorityObserved: explicitAuthorities.length > 0,
        rawArtifactRegistryAvailable,
        rawArtifactsObserved: artifacts.length > 0,
      },
    };
  }

  private explicitFamily(
    sourceId: string,
    workspaceId: string,
  ): SourceOperationalTopology["family"] {
    const parentSourceIds: string[] = [];
    const seen = new Set([sourceId]);
    let currentSourceId = sourceId;
    while (true) {
      const record = this.sourceRegistryV2.get(currentSourceId);
      const parentSourceId = record?.parentSourceId;
      if (!parentSourceId) break;
      if (seen.has(parentSourceId)) {
        throw new RegistryConflictError(
          "SOURCE_TOPOLOGY_PARENT_CYCLE",
          `Explicit source parentage contains a cycle at ${parentSourceId}`,
        );
      }
      const parent = this.sources.getById(parentSourceId);
      if (!parent || parent.workspaceId !== workspaceId) {
        throw new RegistryConflictError(
          "SOURCE_TOPOLOGY_PARENT_SCOPE_MISMATCH",
          `Explicit parent ${parentSourceId} is missing or outside workspace ${workspaceId}`,
        );
      }
      seen.add(parentSourceId);
      parentSourceIds.push(parentSourceId);
      currentSourceId = parentSourceId;
    }
    return {
      parentSourceIds,
      familyRootSourceId: parentSourceIds.at(-1) ?? sourceId,
      relationshipBasis: "EXPLICIT_PARENT_SOURCE_ID",
    };
  }
}
