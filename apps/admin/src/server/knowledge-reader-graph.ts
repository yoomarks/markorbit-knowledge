import type { ContentEdgeV1, ContentObjectRefV1 } from "@markorbit/contracts";
import type { KnowledgeReaderRelationshipMetadata } from "./knowledge-reader-relationships";

const NEIGHBOR_PAGE_LIMIT = 200;
export const DEFAULT_KNOWLEDGE_GRAPH_MAX_NODES = 40;
export const DEFAULT_KNOWLEDGE_GRAPH_MAX_EDGES = 80;

export type KnowledgeReaderGraphDepth = 1 | 2;
export type KnowledgeReaderGraphTruncationReason =
  | "NEIGHBOR_PAGE_LIMIT"
  | "NODE_BUDGET"
  | "EDGE_BUDGET";

export type KnowledgeReaderGraphNode = {
  ref: string;
  distance: 0 | 1 | 2;
  content: ContentObjectRefV1;
  title?: string;
  readerHref?: string;
  sourceName?: string;
  version?: number;
  jurisdictions: string[];
};

export type KnowledgeReaderGraphEdge = {
  key: string;
  fromRef: string;
  toRef: string;
  relationType: ContentEdgeV1["relationType"];
  origin: ContentEdgeV1["origin"];
  evidenceRef?: string;
  algorithm?: Readonly<{ id: string; version: string }>;
};

export type KnowledgeReaderGraph = {
  protocolVersion: "1.0";
  rootRef: string;
  depth: KnowledgeReaderGraphDepth;
  nodes: KnowledgeReaderGraphNode[];
  edges: KnowledgeReaderGraphEdge[];
  expandedNodeCount: number;
  truncated: boolean;
  truncationReasons: KnowledgeReaderGraphTruncationReason[];
  limits: {
    maxNodes: number;
    maxEdges: number;
    neighborPageLimit: number;
  };
};

export interface KnowledgeReaderGraphRepository {
  listNeighbors(
    content: ContentObjectRefV1,
    limit?: number,
    offset?: number,
  ): {
    items: Array<{
      direction: "OUTGOING" | "INCOMING";
      edge: ContentEdgeV1;
      neighbor: ContentObjectRefV1;
    }>;
    total: number;
    limit: number;
    offset: number;
  };
}

export type BuildKnowledgeReaderGraphOptions = {
  depth?: KnowledgeReaderGraphDepth;
  maxNodes?: number;
  maxEdges?: number;
  resolveMetadata?: (
    content: ContentObjectRefV1,
  ) => KnowledgeReaderRelationshipMetadata | undefined;
};

function positiveInteger(value: number | undefined, fallback: number, field: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return resolved;
}

function contentKey(content: ContentObjectRefV1): string {
  return JSON.stringify([content.workspaceId, content.objectKind, content.objectId]);
}

function publicRef(content: ContentObjectRefV1): string {
  return `${content.objectKind}:${content.objectId}`;
}

function edgeKey(edge: ContentEdgeV1): string {
  return JSON.stringify([
    edge.from.workspaceId,
    edge.from.objectKind,
    edge.from.objectId,
    edge.relationType,
    edge.to.workspaceId,
    edge.to.objectKind,
    edge.to.objectId,
    edge.origin,
    edge.evidenceRef ?? "",
    edge.algorithm?.id ?? "",
    edge.algorithm?.version ?? "",
  ]);
}

function graphNode(
  content: ContentObjectRefV1,
  distance: 0 | 1 | 2,
  resolveMetadata: BuildKnowledgeReaderGraphOptions["resolveMetadata"],
): KnowledgeReaderGraphNode {
  const metadata = resolveMetadata?.(content);
  return {
    ref: publicRef(content),
    distance,
    content: structuredClone(content),
    ...(metadata?.title ? { title: metadata.title } : {}),
    ...(metadata?.readerHref ? { readerHref: metadata.readerHref } : {}),
    ...(metadata?.sourceName ? { sourceName: metadata.sourceName } : {}),
    ...(metadata?.version === undefined ? {} : { version: metadata.version }),
    jurisdictions: [...new Set(metadata?.jurisdictions ?? [])].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function graphEdge(edge: ContentEdgeV1): KnowledgeReaderGraphEdge {
  return {
    key: edgeKey(edge),
    fromRef: publicRef(edge.from),
    toRef: publicRef(edge.to),
    relationType: edge.relationType,
    origin: edge.origin,
    ...(edge.evidenceRef ? { evidenceRef: edge.evidenceRef } : {}),
    ...(edge.algorithm ? { algorithm: structuredClone(edge.algorithm) } : {}),
  };
}

function compareNeighbors(
  left: { edge: ContentEdgeV1; neighbor: ContentObjectRefV1 },
  right: { edge: ContentEdgeV1; neighbor: ContentObjectRefV1 },
): number {
  return (
    edgeKey(left.edge).localeCompare(edgeKey(right.edge)) ||
    contentKey(left.neighbor).localeCompare(contentKey(right.neighbor))
  );
}

export function buildKnowledgeReaderGraph(
  repository: KnowledgeReaderGraphRepository,
  root: ContentObjectRefV1,
  options: BuildKnowledgeReaderGraphOptions = {},
): KnowledgeReaderGraph {
  const depth = options.depth ?? 2;
  if (depth !== 1 && depth !== 2) throw new Error("depth must be 1 or 2");

  const maxNodes = positiveInteger(
    options.maxNodes,
    DEFAULT_KNOWLEDGE_GRAPH_MAX_NODES,
    "maxNodes",
  );
  const maxEdges = positiveInteger(
    options.maxEdges,
    DEFAULT_KNOWLEDGE_GRAPH_MAX_EDGES,
    "maxEdges",
  );
  const rootKey = contentKey(root);
  const nodes = new Map<string, KnowledgeReaderGraphNode>([
    [rootKey, graphNode(root, 0, options.resolveMetadata)],
  ]);
  const edges = new Map<string, KnowledgeReaderGraphEdge>();
  const queue: Array<{ content: ContentObjectRefV1; distance: 0 | 1 }> = [
    { content: root, distance: 0 },
  ];
  const expanded = new Set<string>();
  const truncationReasons = new Set<KnowledgeReaderGraphTruncationReason>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = contentKey(current.content);
    if (expanded.has(currentKey) || current.distance >= depth) continue;
    expanded.add(currentKey);

    const page = repository.listNeighbors(current.content, NEIGHBOR_PAGE_LIMIT, 0);
    if (page.total > page.items.length) truncationReasons.add("NEIGHBOR_PAGE_LIMIT");

    const neighbors = [...page.items].sort(compareNeighbors);
    for (const neighbor of neighbors) {
      const nextDistance = (current.distance + 1) as 1 | 2;
      const neighborKey = contentKey(neighbor.neighbor);
      const existingNode = nodes.get(neighborKey);

      if (!existingNode && nodes.size >= maxNodes) {
        truncationReasons.add("NODE_BUDGET");
        continue;
      }

      const relationshipKey = edgeKey(neighbor.edge);
      if (!edges.has(relationshipKey) && edges.size >= maxEdges) {
        truncationReasons.add("EDGE_BUDGET");
        continue;
      }

      if (!existingNode) {
        nodes.set(neighborKey, graphNode(neighbor.neighbor, nextDistance, options.resolveMetadata));
        if (nextDistance < depth) {
          queue.push({ content: neighbor.neighbor, distance: 1 });
        }
      }

      if (!edges.has(relationshipKey)) {
        edges.set(relationshipKey, graphEdge(neighbor.edge));
      }
    }
  }

  return {
    protocolVersion: "1.0",
    rootRef: publicRef(root),
    depth,
    nodes: [...nodes.values()].sort(
      (left, right) => left.distance - right.distance || left.ref.localeCompare(right.ref),
    ),
    edges: [...edges.values()].sort((left, right) => left.key.localeCompare(right.key)),
    expandedNodeCount: expanded.size,
    truncated: truncationReasons.size > 0,
    truncationReasons: [...truncationReasons].sort(),
    limits: { maxNodes, maxEdges, neighborPageLimit: NEIGHBOR_PAGE_LIMIT },
  };
}
