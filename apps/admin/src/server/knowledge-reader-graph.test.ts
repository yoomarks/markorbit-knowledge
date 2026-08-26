import { describe, expect, it } from "vitest";
import type { ContentEdgeV1, ContentObjectRefV1 } from "@markorbit/contracts";
import {
  buildKnowledgeReaderGraph,
  type KnowledgeReaderGraphRepository,
} from "./knowledge-reader-graph";

const workspaceId = "workspace-graph";

function content(objectId: string): ContentObjectRefV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CONTENT_OBJECT_REF",
    objectId,
    objectKind: "DERIVED_CONTENT",
    workspaceId,
  };
}

function edge(
  from: ContentObjectRefV1,
  to: ContentObjectRefV1,
  overrides: Partial<ContentEdgeV1> = {},
): ContentEdgeV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CONTENT_EDGE",
    from,
    relationType: "CITES",
    to,
    origin: "EXPLICIT_SOURCE",
    evidenceRef: `evidence:${from.objectId}:${to.objectId}`,
    ...overrides,
  };
}

function key(value: ContentObjectRefV1): string {
  return `${value.objectKind}:${value.objectId}`;
}

function repository(
  edges: readonly ContentEdgeV1[],
  totals: Readonly<Record<string, number>> = {},
): KnowledgeReaderGraphRepository {
  return {
    listNeighbors(root, limit = 200, offset = 0) {
      const items = edges
        .filter(
          (candidate) =>
            candidate.from.objectId === root.objectId || candidate.to.objectId === root.objectId,
        )
        .map((candidate) => {
          const outgoing = candidate.from.objectId === root.objectId;
          return {
            direction: outgoing ? ("OUTGOING" as const) : ("INCOMING" as const),
            edge: candidate,
            neighbor: outgoing ? candidate.to : candidate.from,
          };
        });
      return {
        items,
        total: totals[key(root)] ?? items.length,
        limit,
        offset,
      };
    },
  };
}

const root = content("root");
const first = content("first");
const second = content("second");
const third = content("third");

describe("buildKnowledgeReaderGraph", () => {
  it("builds a deterministic one-hop graph and preserves directed provenance", () => {
    const machine = edge(root, first, {
      relationType: "SIMILAR_TO",
      origin: "MACHINE_DERIVED",
      evidenceRef: "evidence:similarity:1",
      algorithm: { id: "content-similarity", version: "2" },
    });
    const incoming = edge(second, root, {
      origin: "HUMAN_CONFIRMED",
      evidenceRef: "review:42",
    });

    const model = buildKnowledgeReaderGraph(repository([incoming, machine]), root, {
      depth: 1,
      resolveMetadata: (candidate) =>
        candidate.objectId === first.objectId
          ? {
              title: "First related note",
              readerHref: "/knowledge/first",
              jurisdictions: ["US", "CA", "US"],
            }
          : undefined,
    });

    expect(model.nodes.map((node) => [node.ref, node.distance])).toEqual([
      ["DERIVED_CONTENT:root", 0],
      ["DERIVED_CONTENT:first", 1],
      ["DERIVED_CONTENT:second", 1],
    ]);
    expect(model.nodes.find((node) => node.ref.endsWith(":first"))).toMatchObject({
      title: "First related note",
      readerHref: "/knowledge/first",
      jurisdictions: ["CA", "US"],
    });
    expect(model.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromRef: "DERIVED_CONTENT:root",
          toRef: "DERIVED_CONTENT:first",
          relationType: "SIMILAR_TO",
          origin: "MACHINE_DERIVED",
          evidenceRef: "evidence:similarity:1",
          algorithm: { id: "content-similarity", version: "2" },
        }),
        expect.objectContaining({
          fromRef: "DERIVED_CONTENT:second",
          toRef: "DERIVED_CONTENT:root",
          origin: "HUMAN_CONFIRMED",
          evidenceRef: "review:42",
        }),
      ]),
    );
    expect(model.expandedNodeCount).toBe(1);
    expect(model.truncated).toBe(false);
  });

  it("expands exactly two hops while deduplicating cyclic nodes and edges", () => {
    const rootToFirst = edge(root, first);
    const firstToRoot = edge(first, root, { relationType: "VERSION_OF" });
    const firstToSecond = edge(first, second, { relationType: "DERIVED_FROM" });

    const model = buildKnowledgeReaderGraph(
      repository([rootToFirst, firstToRoot, firstToSecond]),
      root,
      { depth: 2 },
    );

    expect(model.nodes.map((node) => [node.ref, node.distance])).toEqual([
      ["DERIVED_CONTENT:root", 0],
      ["DERIVED_CONTENT:first", 1],
      ["DERIVED_CONTENT:second", 2],
    ]);
    expect(model.edges).toHaveLength(3);
    expect(new Set(model.edges.map((item) => item.key)).size).toBe(3);
    expect(model.expandedNodeCount).toBe(2);
  });

  it("reports page, node, and edge truncation instead of implying graph completeness", () => {
    const rootToFirst = edge(root, first);
    const rootToSecond = edge(root, second);
    const rootToThird = edge(root, third);

    const nodeLimited = buildKnowledgeReaderGraph(
      repository([rootToFirst, rootToSecond, rootToThird], {
        [key(root)]: 250,
      }),
      root,
      { depth: 1, maxNodes: 2, maxEdges: 10 },
    );
    expect(nodeLimited.nodes).toHaveLength(2);
    expect(nodeLimited.truncated).toBe(true);
    expect(nodeLimited.truncationReasons).toEqual(
      expect.arrayContaining(["NEIGHBOR_PAGE_LIMIT", "NODE_BUDGET"]),
    );

    const edgeLimited = buildKnowledgeReaderGraph(
      repository([rootToFirst, rootToSecond]),
      root,
      { depth: 1, maxNodes: 10, maxEdges: 1 },
    );
    expect(edgeLimited.edges).toHaveLength(1);
    expect(edgeLimited.nodes).toHaveLength(2);
    expect(edgeLimited.truncationReasons).toContain("EDGE_BUDGET");
  });

  it("keeps the local graph content-only and does not promote Brain/business semantics", () => {
    const model = buildKnowledgeReaderGraph(repository([edge(root, first)]), root, { depth: 1 });
    const serialized = JSON.stringify(model);

    for (const forbidden of [
      "entityId",
      "customerId",
      "applicantId",
      "companyId",
      "personId",
      "caseRelevance",
      "businessRelevance",
      "truthScore",
      "authorityScore",
      "recommendationScore",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
