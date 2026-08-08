import { describe, expect, it } from "vitest";
import type { SourceDiscoveryBatch } from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteSourceDiscoveryRepository } from "@markorbit/persistence/source-discovery";
import { SqliteSourceGraphRepository } from "@markorbit/persistence/source-graph";
import { DiscoveryWorkflowService } from "../discovery-service";

describe("DiscoveryWorkflowService", () => {
  it("promotes one governed website source and writes accepted pages into its Source Graph", async () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const graph = new SqliteSourceGraphRepository(database);
    const service = new DiscoveryWorkflowService({
      discovery,
      graph,
      sources,
      plans,
      provider: {
        async discover(batch: SourceDiscoveryBatch) {
          return [
            {
              candidateId: "cand_aaaaaaaaaaaaaaaaaaaaaaaa",
              locator: "https://example.com/trademarks",
              title: "Trademarks",
              discoveredAt: "2026-08-08T01:00:00.000Z",
              status: "DISCOVERED" as const,
              discoveredFrom: batch.seeds[0]?.locator,
              discoveryMethod: "HTML_LINK" as const,
              depth: 1,
              metadata: { kind: "PAGE" },
            },
            {
              candidateId: "cand_bbbbbbbbbbbbbbbbbbbbbbbb",
              locator: "https://example.com/guides/fees.pdf",
              title: "Fee guide",
              discoveredAt: "2026-08-08T01:00:01.000Z",
              status: "DISCOVERED" as const,
              discoveredFrom: batch.seeds[0]?.locator,
              discoveryMethod: "HTML_LINK" as const,
              depth: 1,
              metadata: { kind: "DOCUMENT" },
            },
            {
              candidateId: "cand_cccccccccccccccccccccccc",
              locator: "https://example.com/",
              title: "Example home",
              discoveredAt: "2026-08-08T01:00:02.000Z",
              status: "DISCOVERED" as const,
              discoveredFrom: batch.seeds[0]?.locator,
              discoveryMethod: "HTML_LINK" as const,
              depth: 1,
              metadata: { kind: "PAGE" },
            },
          ];
        },
      },
      transaction(operation) {
        database.exec("BEGIN IMMEDIATE;");
        try {
          const result = operation();
          database.exec("COMMIT;");
          return result;
        } catch (error) {
          database.exec("ROLLBACK;");
          throw error;
        }
      },
    });

    const run = await service.start({
      locator: "https://example.com/start-here",
      maxDepth: 1,
      maxCandidates: 10,
    });
    expect(run.candidates).toHaveLength(3);
    expect(service.overview().candidates.summary.DISCOVERED).toBe(3);

    const first = service.review("cand_aaaaaaaaaaaaaaaaaaaaaaaa", {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });
    expect(first.candidate.candidate.status).toBe("ACCEPTED");
    expect(first.source?.status).toBe("ACTIVE");
    expect(first.source?.authorityLevel).toBe("UNKNOWN");
    expect(first.source?.canonicalUri).toBe("https://example.com/");
    expect(first.source?.entrypoints[0]?.uri).toBe("https://example.com/start-here");
    expect(first.plan?.status).toBe("PAUSED");
    expect(first.source?.defaultCollectionPlanId).toBe(first.plan?.id);

    const profile = first.source ? graph.getProfileBySourceId(first.source.id) : null;
    expect(profile?.canonicalOrigin).toBe("https://example.com/");
    const firstSnapshot = first.source ? graph.snapshotBySourceId(first.source.id) : null;
    expect(firstSnapshot?.summary.nodeCount).toBe(3);
    expect(firstSnapshot?.summary.nodeKinds.WEBSITE).toBe(1);
    expect(firstSnapshot?.summary.nodeKinds.PAGE).toBe(1);
    expect(firstSnapshot?.summary.nodeKinds.DOCUMENT).toBe(1);
    const trademarkNode = profile
      ? graph.findNodeByIdentity(profile.id, "CANONICAL_URI", "https://example.com/trademarks")
      : null;
    expect(trademarkNode?.reviewState).toBe("RETAINED");
    expect(
      profile
        ? graph.findNodeByIdentity(profile.id, "CANONICAL_URI", "https://example.com/")
        : null,
    )?.toMatchObject({ id: profile?.rootNodeId, kind: "WEBSITE" });

    const second = service.review("cand_bbbbbbbbbbbbbbbbbbbbbbbb", {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });
    expect(second.source?.id).toBe(first.source?.id);
    expect(second.plan?.id).toBe(first.plan?.id);
    expect(sources.list({ sourceType: "WEB", limit: 100 }).total).toBe(1);
    expect(first.source ? plans.listForSource(first.source.id) : []).toHaveLength(1);
    const documentNode = profile
      ? graph.findNodeByIdentity(profile.id, "CANONICAL_URI", "https://example.com/guides/fees.pdf")
      : null;
    expect(documentNode?.reviewState).toBe("RETAINED");

    database.close();
  });
});
