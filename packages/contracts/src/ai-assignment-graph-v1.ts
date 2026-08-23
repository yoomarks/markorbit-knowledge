export const AI_ASSIGNMENT_GRAPH_PROTOCOL_VERSION = "1.0" as const;
export const AI_ASSIGNMENT_GRAPH_OBJECT_TYPE = "AI_ASSIGNMENT_GRAPH" as const;

export const AI_ASSIGNMENT_GRAPH_NODE_ROLES = ["ROOT", "FOLLOW_UP"] as const;
export const AI_ASSIGNMENT_GRAPH_EDGE_RELATIONS = [
  "DECOMPOSES",
  "DEPENDS_ON",
  "SUPPORTS",
] as const;

export type AiAssignmentGraphNodeRole = (typeof AI_ASSIGNMENT_GRAPH_NODE_ROLES)[number];
export type AiAssignmentGraphEdgeRelation =
  (typeof AI_ASSIGNMENT_GRAPH_EDGE_RELATIONS)[number];

export type AiAssignmentGraphNodeV1 = {
  assignmentId: string;
  role: AiAssignmentGraphNodeRole;
};

export type AiAssignmentGraphEdgeV1 = {
  fromAssignmentId: string;
  toAssignmentId: string;
  relation: AiAssignmentGraphEdgeRelation;
};

export type AiAssignmentGraphV1 = {
  protocolVersion: typeof AI_ASSIGNMENT_GRAPH_PROTOCOL_VERSION;
  objectType: typeof AI_ASSIGNMENT_GRAPH_OBJECT_TYPE;
  graphId: string;
  revision: number;
  title: string;
  jurisdiction: string;
  domain: string;
  rootAssignmentIds: string[];
  nodes: AiAssignmentGraphNodeV1[];
  edges: AiAssignmentGraphEdgeV1[];
  changeReason: string;
  triggerEvidenceRefs: string[];
  boundaries: {
    executionAuthorityGranted: false;
    legalTruthVerified: false;
  };
  createdAt: string;
};

const GRAPH_ID = /^kag_[a-z0-9_]{3,123}$/u;
const ASSIGNMENT_ID = /^kas_[a-z0-9_]{3,123}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNode(value: unknown): value is AiAssignmentGraphNodeV1 {
  const item = record(value);
  return Boolean(
    item &&
      exactKeys(item, ["assignmentId", "role"]) &&
      typeof item.assignmentId === "string" &&
      ASSIGNMENT_ID.test(item.assignmentId) &&
      typeof item.role === "string" &&
      (AI_ASSIGNMENT_GRAPH_NODE_ROLES as readonly string[]).includes(item.role),
  );
}

function isEdge(value: unknown): value is AiAssignmentGraphEdgeV1 {
  const item = record(value);
  return Boolean(
    item &&
      exactKeys(item, ["fromAssignmentId", "toAssignmentId", "relation"]) &&
      typeof item.fromAssignmentId === "string" &&
      ASSIGNMENT_ID.test(item.fromAssignmentId) &&
      typeof item.toAssignmentId === "string" &&
      ASSIGNMENT_ID.test(item.toAssignmentId) &&
      item.fromAssignmentId !== item.toAssignmentId &&
      typeof item.relation === "string" &&
      (AI_ASSIGNMENT_GRAPH_EDGE_RELATIONS as readonly string[]).includes(item.relation),
  );
}

function isAcyclic(nodes: AiAssignmentGraphNodeV1[], edges: AiAssignmentGraphEdgeV1[]): boolean {
  const adjacency = new Map(nodes.map((node) => [node.assignmentId, [] as string[]]));
  for (const edge of edges) adjacency.get(edge.fromAssignmentId)?.push(edge.toAssignmentId);

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (!visit(next)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  return nodes.every((node) => visit(node.assignmentId));
}

export function isAiAssignmentGraphV1(value: unknown): value is AiAssignmentGraphV1 {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "protocolVersion",
      "objectType",
      "graphId",
      "revision",
      "title",
      "jurisdiction",
      "domain",
      "rootAssignmentIds",
      "nodes",
      "edges",
      "changeReason",
      "triggerEvidenceRefs",
      "boundaries",
      "createdAt",
    ]) ||
    item.protocolVersion !== AI_ASSIGNMENT_GRAPH_PROTOCOL_VERSION ||
    item.objectType !== AI_ASSIGNMENT_GRAPH_OBJECT_TYPE ||
    typeof item.graphId !== "string" ||
    !GRAPH_ID.test(item.graphId) ||
    !Number.isSafeInteger(item.revision) ||
    (item.revision as number) <= 0 ||
    !nonEmpty(item.title) ||
    !nonEmpty(item.jurisdiction) ||
    !nonEmpty(item.domain) ||
    !nonEmpty(item.changeReason) ||
    !isTimestamp(item.createdAt) ||
    !Array.isArray(item.rootAssignmentIds) ||
    item.rootAssignmentIds.length === 0 ||
    !item.rootAssignmentIds.every(
      (id) => typeof id === "string" && ASSIGNMENT_ID.test(id),
    ) ||
    new Set(item.rootAssignmentIds).size !== item.rootAssignmentIds.length ||
    !Array.isArray(item.nodes) ||
    item.nodes.length === 0 ||
    !item.nodes.every(isNode) ||
    !Array.isArray(item.edges) ||
    !item.edges.every(isEdge) ||
    !Array.isArray(item.triggerEvidenceRefs) ||
    !item.triggerEvidenceRefs.every(nonEmpty) ||
    new Set(item.triggerEvidenceRefs).size !== item.triggerEvidenceRefs.length
  ) {
    return false;
  }

  const boundaries = record(item.boundaries);
  if (
    !boundaries ||
    !exactKeys(boundaries, ["executionAuthorityGranted", "legalTruthVerified"]) ||
    boundaries.executionAuthorityGranted !== false ||
    boundaries.legalTruthVerified !== false
  ) {
    return false;
  }

  const nodes = item.nodes as AiAssignmentGraphNodeV1[];
  const edges = item.edges as AiAssignmentGraphEdgeV1[];
  const nodeIds = new Set(nodes.map((node) => node.assignmentId));
  if (nodeIds.size !== nodes.length) return false;

  const roots = new Set(item.rootAssignmentIds as string[]);
  if (
    ![...roots].every((id) => nodeIds.has(id)) ||
    nodes.some((node) => (roots.has(node.assignmentId) ? node.role !== "ROOT" : node.role === "ROOT"))
  ) {
    return false;
  }

  const edgeKeys = new Set<string>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.fromAssignmentId) || !nodeIds.has(edge.toAssignmentId)) return false;
    const key = `${edge.fromAssignmentId}\u0000${edge.toAssignmentId}\u0000${edge.relation}`;
    if (edgeKeys.has(key)) return false;
    edgeKeys.add(key);
  }

  return isAcyclic(nodes, edges);
}

export function assertAiAssignmentGraphV1(value: unknown): asserts value is AiAssignmentGraphV1 {
  if (!isAiAssignmentGraphV1(value)) {
    throw new TypeError("Invalid AiAssignmentGraphV1");
  }
}
