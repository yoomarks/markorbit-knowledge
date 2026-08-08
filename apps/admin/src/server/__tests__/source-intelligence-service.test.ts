import { describe, expect, it } from "vitest";
import type { SourceDefinition, SourceGraphNode } from "@markorbit/contracts";
import { evaluateSourceIntelligence } from "@markorbit/worker-runtime";
import { SourceIntelligenceService } from "../source-intelligence-service";

const source: SourceDefinition = {
  schemaVersion: "1.0",
  objectType: "SOURCE_DEFINITION",
  id: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  name: "Example Source",
  slug: "example-source",
  sourceType: "WEB",
  category: "DOMAIN_OTHER",
  authorityLevel: "UNKNOWN",
  status: "ACTIVE",
  jurisdictions: [],
  languages: ["en"],
  connector: { connectorId: "crawl4ai-web", version: "1.1.0" },
  connectorConfig: {},
  canonicalUri: "https://example.com/",
  entrypoints: [{ uri: "https://example.com/" }],
  tags: [],
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
};

function node(id: string, topic: string, raw: boolean): SourceGraphNode {
  return {
    protocolVersion: "1.0",
    objectType: "SOURCE_GRAPH_NODE",
    id,
    workspaceId: source.workspaceId,
    sourceId: source.id,
    profileId: "sgp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    kind: "PAGE",
    identity: { strategy: "CANONICAL_URI", key: `https://example.com/${id}` },
    canonicalUri: `https://example.com/${id}`,
    topic,
    reviewState: "OBSERVED",
    lifecycleState: "ACTIVE",
    firstObservedAt: "2026-08-08T00:00:00.000Z",
    lastObservedAt: "2026-08-08T00:00:00.000Z",
    provenance: [
      {
        kind: raw ? "RAW_ARTIFACT" : "DISCOVERY_BATCH",
        sourceId: source.id,
        sourceUri: `https://example.com/${id}`,
        observedAt: "2026-08-08T00:00:00.000Z",
        ...(raw ? { rawArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV" } : { discoveryBatchId: "sdb_01ARZ3NDEKTSV4RRFFQ69G5FAV" }),
      },
    ],
  };
}

describe("SourceIntelligenceService", () => {
  it("assesses graph evidence without changing authority or schedules", () => {
    let saved = null as ReturnType<typeof evaluateSourceIntelligence> | null;
    const service = new SourceIntelligenceService({
      sources: { getById: () => source },
      graph: {
        snapshotBySourceId: () => ({
          profile: {
            protocolVersion: "1.0",
            objectType: "WEBSITE_SOURCE_PROFILE",
            id: "sgp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            workspaceId: source.workspaceId,
            sourceId: source.id,
            canonicalOrigin: "https://example.com/",
            canonicalHost: "example.com",
            observedHostAliases: [],
            rootNodeId: "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            createdAt: "2026-08-08T00:00:00.000Z",
            updatedAt: "2026-08-08T00:00:00.000Z",
          },
          nodes: [node("sgn_01ARZ3NDEKTSV4RRFFQ69G5FAA", "TRADEMARKS", true), node("sgn_01ARZ3NDEKTSV4RRFFQ69G5FAB", "GENERAL", false)],
          edges: [],
          summary: { nodeCount: 2, edgeCount: 0, nodeKinds: { PAGE: 2 }, reviewStates: { OBSERVED: 2 }, lifecycleStates: { ACTIVE: 2 } },
        }),
      },
      artifacts: {
        list: () => ({
          items: [],
          total: 0,
          limit: 100,
          offset: 0,
          summary: { REGISTERED: 0, VERIFIED: 0, QUARANTINED: 0, total: 0 },
        }),
      },
      intelligence: {
        save: (assessment) => {
          saved = assessment;
          return assessment;
        },
        get: () => null,
        getByFingerprint: () => null,
        latestForSource: () => null,
        listLatest: () => [],
      },
      now: () => "2026-08-08T08:00:00.000Z",
    });

    const assessment = service.assess(source.id);
    expect(saved?.id).toBe(assessment.id);
    expect(assessment.input.relevantContentNodeCount).toBe(1);
    expect(assessment.dimensions.AUTHORITY_SIGNAL.score).toBeNull();
    expect(assessment.boundaries.autoScheduleApplied).toBe(false);
    expect(assessment.boundaries.authorityInferred).toBe(false);
  });
});
