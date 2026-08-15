import { describe, expect, it } from "vitest";
import type { SourceDiscoveryBatch } from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConnectorRepository } from "@markorbit/persistence/connectors";
import { SqliteSourceDiscoveryRepository } from "@markorbit/persistence/source-discovery";
import { SqliteSourceGraphRepository } from "@markorbit/persistence/source-graph";
import { SqliteSourceRegistryV2Repository } from "@markorbit/persistence/source-registry-v2";
import { DiscoveryWorkflowService } from "../discovery-service";

describe("DiscoveryWorkflowService", () => {
  it("promotes one production-collectable website source and writes accepted pages into its Source Graph", async () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const connectors = new SqliteConnectorRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const graph = new SqliteSourceGraphRepository(database);
    const service = new DiscoveryWorkflowService({
      discovery,
      graph,
      sources,
      plans,
      connectors,
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
              locator: "https://www.example.com/guides/fees.pdf",
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

    const legacyConnectorBefore = connectors.get("crawl4ai-web", "1.0.0");
    expect(legacyConnectorBefore).not.toBeNull();

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
    expect(first.source?.connector).toEqual({ connectorId: "crawl4ai-web", version: "1.2.0" });
    expect(first.plan?.status).toBe("PAUSED");
    expect(first.plan?.output.artifactKinds).toEqual(["HTML", "MARKDOWN"]);
    expect(first.source?.defaultCollectionPlanId).toBe(first.plan?.id);
    expect(connectors.get("crawl4ai-web", "1.2.0")?.manifest.status).toBe("ACTIVE");
    expect(connectors.get("crawl4ai-web", "1.0.0")).toEqual(legacyConnectorBefore);
    expect(connectors.get("crawl4ai-web", "1.0.0")?.boundSourceCount).toBe(0);

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
      ? graph.findNodeByIdentity(
          profile.id,
          "CANONICAL_URI",
          "https://www.example.com/guides/fees.pdf",
        )
      : null;
    expect(documentNode?.reviewState).toBe("RETAINED");

    database.close();
  });

  it("promotes external candidates into their own source and preserves the source-to-source discovery path", async () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const connectors = new SqliteConnectorRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const graph = new SqliteSourceGraphRepository(database);
    const registryV2 = new SqliteSourceRegistryV2Repository(database);
    let discoveryRun = 0;
    const service = new DiscoveryWorkflowService({
      discovery,
      graph,
      sources,
      plans,
      connectors,
      provider: {
        async discover(batch: SourceDiscoveryBatch) {
          discoveryRun += 1;
          if (discoveryRun === 1) {
            return [
              {
                candidateId: "cand_111111111111111111111111",
                locator: "https://example.com/trademarks",
                discoveredAt: "2026-08-12T16:10:00.000Z",
                status: "DISCOVERED" as const,
                discoveredFrom: batch.seeds[0]?.locator,
                discoveryMethod: "HTML_LINK" as const,
                depth: 1,
                metadata: { kind: "PAGE" },
              },
            ];
          }
          return [
            {
              candidateId: "cand_dddddddddddddddddddddddd",
              locator: "https://outside.example/article",
              discoveredAt: "2026-08-12T16:20:00.000Z",
              status: "DISCOVERED" as const,
              discoveredFrom: batch.seeds[0]?.locator,
              discoveryMethod: "HTML_LINK" as const,
              depth: 1,
              metadata: {
                kind: "PAGE",
                externalToSeed: true,
                discoveryScope: "EXTERNAL_ONE_HOP",
                fetchEligibleInOriginatingRun: false,
              },
            },
            {
              candidateId: "cand_eeeeeeeeeeeeeeeeeeeeeeee",
              locator: "https://peer.example/services",
              discoveredAt: "2026-08-12T16:20:01.000Z",
              status: "DISCOVERED" as const,
              discoveredFrom: batch.seeds[0]?.locator,
              discoveryMethod: "HTML_LINK" as const,
              depth: 1,
              metadata: {
                kind: "PAGE",
                externalToSeed: true,
                discoveryScope: "EXTERNAL_ONE_HOP",
                fetchEligibleInOriginatingRun: false,
              },
            },
            {
              candidateId: "cand_ffffffffffffffffffffffff",
              locator: "https://www.peer.example/blog",
              discoveredAt: "2026-08-12T16:20:02.000Z",
              status: "DISCOVERED" as const,
              discoveredFrom: batch.seeds[0]?.locator,
              discoveryMethod: "HTML_LINK" as const,
              depth: 1,
              metadata: {
                kind: "PAGE",
                externalToSeed: true,
                discoveryScope: "EXTERNAL_ONE_HOP",
                fetchEligibleInOriginatingRun: false,
              },
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

    await service.start({ locator: "https://example.com/start-here" });
    const acceptedSeed = service.review("cand_111111111111111111111111", {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });
    expect(acceptedSeed.source?.canonicalUri).toBe("https://example.com/");

    const externalRun = await service.start({
      locator: "https://example.com/start-here",
      discoverExternalLinks: true,
      maxExternalCandidates: 10,
    });
    expect(externalRun.candidates).toHaveLength(3);

    const rejected = service.review("cand_dddddddddddddddddddddddd", {
      decision: "REJECTED",
      reviewer: "operator-test",
    });
    expect(rejected.candidate.candidate.status).toBe("REJECTED");

    const firstExternal = service.review("cand_eeeeeeeeeeeeeeeeeeeeeeee", {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });
    expect(firstExternal.source?.canonicalUri).toBe("https://peer.example/");
    expect(firstExternal.source?.entrypoints[0]?.uri).toBe("https://peer.example/services");
    expect(firstExternal.source?.entrypoints[0]?.label).toBe("Discovered external source");
    expect(firstExternal.source?.id).not.toBe(acceptedSeed.source?.id);
    expect(firstExternal.plan?.status).toBe("PAUSED");

    const secondExternal = service.review("cand_ffffffffffffffffffffffff", {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });
    expect(secondExternal.source?.id).toBe(firstExternal.source?.id);
    expect(secondExternal.plan?.id).toBe(firstExternal.plan?.id);
    expect(sources.list({ sourceType: "WEB", limit: 100 }).total).toBe(2);
    expect(firstExternal.source ? plans.listForSource(firstExternal.source.id) : []).toHaveLength(
      1,
    );

    const peerProfile = firstExternal.source
      ? graph.getProfileBySourceId(firstExternal.source.id)
      : null;
    expect(peerProfile?.canonicalOrigin).toBe("https://peer.example/");
    const peerSnapshot = firstExternal.source
      ? graph.snapshotBySourceId(firstExternal.source.id)
      : null;
    expect(peerSnapshot?.summary.nodeKinds.WEBSITE).toBe(1);
    expect(peerSnapshot?.summary.nodeKinds.PAGE).toBe(2);
    expect(peerSnapshot?.edges.filter((edge) => edge.kind === "CONTAINS")).toHaveLength(2);

    const seedProfile = acceptedSeed.source
      ? graph.getProfileBySourceId(acceptedSeed.source.id)
      : null;
    const seedSnapshot = acceptedSeed.source
      ? graph.snapshotBySourceId(acceptedSeed.source.id)
      : null;
    const outboundNode = seedProfile
      ? graph.findNodeByIdentity(seedProfile.id, "CANONICAL_URI", "https://peer.example/services")
      : null;
    expect(outboundNode?.reviewState).toBe("RETAINED");
    expect(
      seedSnapshot?.edges.some(
        (edge) => edge.kind === "LINKS_TO" && edge.objectNodeId === outboundNode?.id,
      ),
    ).toBe(true);
    expect(
      seedSnapshot?.edges.some(
        (edge) => edge.kind === "CONTAINS" && edge.objectNodeId === outboundNode?.id,
      ),
    ).toBe(false);

    const externalRegistry = firstExternal.source ? registryV2.get(firstExternal.source.id) : null;
    expect(externalRegistry?.discoveryProvenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          origin: "EXTERNAL_LINK",
          discoveredFromSourceId: acceptedSeed.source?.id,
          discoveredFromUrl: "https://example.com/start-here",
          evidenceUrl: "https://example.com/start-here",
        }),
      ]),
    );
    expect(service.overview().candidates.summary.REJECTED).toBe(1);
    expect(service.overview().candidates.summary.ACCEPTED).toBe(3);

    database.close();
  });
});
