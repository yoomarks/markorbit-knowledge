import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  SOURCE_GRAPH_PROTOCOL_VERSION,
  type SourceGraphEdge,
  type SourceGraphNode,
  type SourceGraphObservationBatch,
  type WebsiteSourceProfile,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError, initializeRegistry } from "../src/index";
import { SqliteSourceGraphRepository } from "../src/source-graph-registry";

const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OTHER_SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const PROFILE_ID = "spf_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ROOT_ID = "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PAGE_ID = "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const DUPLICATE_PAGE_ID = "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAX";
const OTHER_PAGE_ID = "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAY";
const EDGE_ID = "sge_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SECOND_EDGE_ID = "sge_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const BATCH_ID = "sgb_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SECOND_BATCH_ID = "sgb_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const T0 = "2026-08-08T00:00:00Z";
const T1 = "2026-08-08T01:00:00Z";

type WebsiteNode = Extract<SourceGraphNode, { kind: "WEBSITE" }>;
type PageNode = Extract<SourceGraphNode, { kind: "PAGE" }>;

function provenance(sourceUri: string, observedAt = T0, sourceId = SOURCE_ID) {
  return {
    kind: "DISCOVERY" as const,
    sourceId,
    sourceUri,
    observedAt,
    discoveryCandidateId: "cand_aaaaaaaaaaaaaaaaaaaaaaaa",
    discoveryBatchId: "disc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
}

function profile(sourceId = SOURCE_ID): WebsiteSourceProfile {
  return {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "WEBSITE_SOURCE_PROFILE",
    id: PROFILE_ID,
    workspaceId: WORKSPACE_ID,
    sourceId,
    canonicalOrigin: "https://example.com/",
    canonicalHost: "example.com",
    observedHostAliases: ["example.com"],
    rootNodeId: ROOT_ID,
    createdAt: T0,
    updatedAt: T0,
  };
}

function root(sourceId = SOURCE_ID): WebsiteNode {
  return {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_NODE",
    id: ROOT_ID,
    workspaceId: WORKSPACE_ID,
    sourceId,
    profileId: PROFILE_ID,
    kind: "WEBSITE",
    identity: { strategy: "CANONICAL_URI", key: "https://example.com/" },
    reviewState: "RETAINED",
    lifecycleState: "ACTIVE",
    firstObservedAt: T0,
    lastObservedAt: T0,
    provenance: [provenance("https://example.com/", T0, sourceId)],
    canonicalOrigin: "https://example.com/",
    host: "example.com",
    displayName: "Example",
  };
}

function page(id = PAGE_ID, observedAt = T0): PageNode {
  return {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_NODE",
    id,
    workspaceId: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    profileId: PROFILE_ID,
    kind: "PAGE",
    identity: { strategy: "CANONICAL_URI", key: "https://example.com/trademarks" },
    reviewState: "OBSERVED",
    lifecycleState: "ACTIVE",
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    provenance: [provenance("https://example.com/trademarks", observedAt)],
    canonicalUri: "https://example.com/trademarks",
    title: observedAt === T0 ? "Trademark guide" : "Updated trademark guide",
  };
}

function containsEdge(id = EDGE_ID, objectNodeId = PAGE_ID, observedAt = T0): SourceGraphEdge {
  return {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_EDGE",
    id,
    workspaceId: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    profileId: PROFILE_ID,
    kind: "CONTAINS",
    subjectNodeId: ROOT_ID,
    objectNodeId,
    reviewState: "OBSERVED",
    lifecycleState: "ACTIVE",
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    provenance: [provenance("https://example.com/trademarks", observedAt)],
  };
}

function batch(
  id = BATCH_ID,
  idempotencyKey = "discovery:one",
  nodes: SourceGraphNode[] = [root(), page()],
  edges: SourceGraphEdge[] = [containsEdge()],
  observedAt = T0,
): SourceGraphObservationBatch {
  return {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_OBSERVATION_BATCH",
    id,
    workspaceId: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    profileId: PROFILE_ID,
    idempotencyKey,
    observedAt,
    producer: {
      kind: "DISCOVERY",
      name: "source-graph-persistence-test",
      version: "1.0.0",
      discoveryBatchId: "disc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    nodes,
    edges,
  };
}

function repository() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  return { database, graph: new SqliteSourceGraphRepository(database) };
}

describe("SqliteSourceGraphRepository", () => {
  it("creates exactly one website profile per governed source and origin", () => {
    const { graph } = repository();
    expect(graph.createProfile(profile(), root())).toEqual(profile());
    expect(graph.getProfileBySourceId(SOURCE_ID)?.id).toBe(PROFILE_ID);
    expect(graph.getProfileByCanonicalOrigin(WORKSPACE_ID, "https://example.com")?.id).toBe(
      PROFILE_ID,
    );

    const conflicting = profile(OTHER_SOURCE_ID);
    expect(() => graph.createProfile(conflicting, root(OTHER_SOURCE_ID))).toThrow(
      RegistryConflictError,
    );
  });

  it("ingests graph evidence transactionally and replays the same idempotency key", () => {
    const { graph } = repository();
    graph.createProfile(profile(), root());

    const first = graph.ingestObservationBatch(batch());
    expect(first.replayed).toBe(false);
    expect(first.nodesInserted).toBe(1);
    expect(first.nodesUpdated).toBe(1);
    expect(first.edgesInserted).toBe(1);

    const replay = graph.ingestObservationBatch(batch());
    expect(replay.replayed).toBe(true);
    expect(graph.listNodes(PROFILE_ID)).toHaveLength(2);
    expect(graph.listEdges(PROFILE_ID)).toHaveLength(1);
  });

  it("rejects reuse of an idempotency key with different evidence", () => {
    const { graph } = repository();
    graph.createProfile(profile(), root());
    graph.ingestObservationBatch(batch());

    const changed = batch(BATCH_ID, "discovery:one", [root(), { ...page(), title: "Different" }]);
    expect(() => graph.ingestObservationBatch(changed)).toThrow(RegistryConflictError);
  });

  it("deduplicates canonical URI nodes, preserves the first id, rewires edges, and merges provenance", () => {
    const { graph } = repository();
    graph.createProfile(profile(), root());
    graph.ingestObservationBatch(batch());

    const secondRoot = {
      ...root(),
      lastObservedAt: T1,
      provenance: [provenance("https://example.com/", T1)],
    };
    const duplicatePage = page(DUPLICATE_PAGE_ID, T1);
    const second = batch(
      SECOND_BATCH_ID,
      "discovery:two",
      [secondRoot, duplicatePage],
      [containsEdge(SECOND_EDGE_ID, DUPLICATE_PAGE_ID, T1)],
      T1,
    );
    const result = graph.ingestObservationBatch(second);

    expect(result.nodeIdMap[DUPLICATE_PAGE_ID]).toBe(PAGE_ID);
    const stored = graph.getNode(PAGE_ID);
    expect(stored?.lastObservedAt).toBe(T1);
    expect(stored?.provenance).toHaveLength(2);
    expect(stored && "title" in stored ? stored.title : undefined).toBe("Updated trademark guide");
    expect(graph.listNodes(PROFILE_ID)).toHaveLength(2);
    expect(graph.listEdges(PROFILE_ID)).toHaveLength(1);
    expect(graph.listEdges(PROFILE_ID)[0]?.objectNodeId).toBe(PAGE_ID);
  });

  it("does not let machine re-observation downgrade a human review decision", () => {
    const { graph } = repository();
    graph.createProfile(profile(), root());
    graph.ingestObservationBatch(batch());
    graph.reviewNode(PAGE_ID, "RETAINED");

    const observedAgain = page(DUPLICATE_PAGE_ID, T1);
    graph.ingestObservationBatch(
      batch(
        SECOND_BATCH_ID,
        "discovery:two",
        [root(), observedAgain],
        [containsEdge(SECOND_EDGE_ID, DUPLICATE_PAGE_ID, T1)],
        T1,
      ),
    );
    expect(graph.getNode(PAGE_ID)?.reviewState).toBe("RETAINED");
  });

  it("allows an explicit rejected node recovery without allowing retained nodes to reopen", () => {
    const { graph } = repository();
    graph.createProfile(profile(), root());
    graph.ingestObservationBatch(batch());
    graph.reviewNode(PAGE_ID, "REJECTED");
    expect(graph.reopenNode(PAGE_ID).reviewState).toBe("OBSERVED");
    graph.reviewNode(PAGE_ID, "RETAINED");
    expect(() => graph.reopenNode(PAGE_ID)).toThrow(RegistryConflictError);
  });

  it("rejects cross-source nodes and dangling or cross-profile edges", () => {
    const { graph } = repository();
    graph.createProfile(profile(), root());

    const escaped = { ...page(), sourceId: OTHER_SOURCE_ID } as SourceGraphNode;
    expect(() =>
      graph.ingestObservationBatch(batch(BATCH_ID, "bad-scope", [root(), escaped], [])),
    ).toThrow(RegistryValidationError);

    const dangling = containsEdge(EDGE_ID, OTHER_PAGE_ID);
    expect(() =>
      graph.ingestObservationBatch(batch(SECOND_BATCH_ID, "dangling", [root()], [dangling])),
    ).toThrow(RegistryValidationError);
  });

  it("keeps contact points as evidence observations without inventing a VERIFIED state", () => {
    const { graph } = repository();
    graph.createProfile(profile(), root());
    const contactId = "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAZ";
    const contact: SourceGraphNode = {
      protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
      objectType: "SOURCE_GRAPH_NODE",
      id: contactId,
      workspaceId: WORKSPACE_ID,
      sourceId: SOURCE_ID,
      profileId: PROFILE_ID,
      kind: "CONTACT_POINT",
      identity: { strategy: "SOURCE_LOCAL", key: "contact:public:info@example.com" },
      reviewState: "OBSERVED",
      lifecycleState: "ACTIVE",
      firstObservedAt: T0,
      lastObservedAt: T0,
      provenance: [provenance("https://example.com/contact")],
      contactKind: "GENERAL_EMAIL",
      value: "info@example.com",
      visibility: "PUBLIC_BUSINESS",
    };
    const edge: SourceGraphEdge = {
      ...containsEdge(),
      id: SECOND_EDGE_ID,
      kind: "HAS_CONTACT_POINT",
      objectNodeId: contactId,
    };
    graph.ingestObservationBatch(batch(BATCH_ID, "contact", [root(), contact], [edge]));

    const stored = graph.getNode(contactId);
    expect(stored?.reviewState).toBe("OBSERVED");
    expect(["OBSERVED", "RETAINED", "REJECTED"]).toContain(stored?.reviewState);
    expect((stored as unknown as { verified?: unknown }).verified).toBeUndefined();
  });

  it("returns a source-scoped graph snapshot for admin inspection", () => {
    const { graph } = repository();
    graph.createProfile(profile(), root());
    graph.ingestObservationBatch(batch());
    const snapshot = graph.snapshotBySourceId(SOURCE_ID);
    expect(snapshot?.summary.nodeCount).toBe(2);
    expect(snapshot?.summary.edgeCount).toBe(1);
    expect(snapshot?.summary.nodeKinds.WEBSITE).toBe(1);
    expect(snapshot?.summary.nodeKinds.PAGE).toBe(1);
  });
});
