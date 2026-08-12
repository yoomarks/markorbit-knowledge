import { describe, expect, it } from "vitest";
import type { SourceDiscoveryBatch } from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConnectorRepository } from "@markorbit/persistence/connectors";
import { SqliteSourceDiscoveryRepository } from "@markorbit/persistence/source-discovery";
import { SqliteSourceGraphRepository } from "@markorbit/persistence/source-graph";
import { DiscoveryWorkflowService } from "../discovery-service";

describe("DiscoveryWorkflowService expansion lineage", () => {
  it("allows governed second-hop expansion and blocks the next generation before fetch", async () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const connectors = new SqliteConnectorRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const graph = new SqliteSourceGraphRepository(database);
    const providerCalls: SourceDiscoveryBatch[] = [];
    const service = new DiscoveryWorkflowService({
      discovery,
      graph,
      sources,
      plans,
      connectors,
      provider: {
        async discover(batch: SourceDiscoveryBatch) {
          providerCalls.push(batch);
          const seed = batch.seeds[0]?.locator;
          if (!batch.lineage?.parentSourceId) {
            return [
              {
                candidateId: "cand_root00000000000000000000",
                locator: "https://root.example/trademarks",
                discoveredAt: "2026-08-12T17:10:00.000Z",
                status: "DISCOVERED" as const,
                discoveredFrom: seed,
                discoveryMethod: "HTML_LINK" as const,
                depth: 1,
                metadata: { kind: "PAGE" },
              },
            ];
          }
          if (seed?.startsWith("https://root.example")) {
            return [
              {
                candidateId: "cand_peer00000000000000000000",
                locator: "https://peer.example/services",
                discoveredAt: "2026-08-12T17:20:00.000Z",
                status: "DISCOVERED" as const,
                discoveredFrom: seed,
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
          }
          if (seed?.startsWith("https://peer.example")) {
            return [
              {
                candidateId: "cand_third0000000000000000000",
                locator: "https://third.example/rules",
                discoveredAt: "2026-08-12T17:30:00.000Z",
                status: "DISCOVERED" as const,
                discoveredFrom: seed,
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
          }
          return [];
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

    const rootRun = await service.start({
      locator: "https://root.example/start",
      maxExpansionGeneration: 2,
    });
    expect(rootRun.batch.batch.lineage).toEqual({ generation: 0 });
    const rootAccepted = service.review("cand_root00000000000000000000", {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });
    expect(rootAccepted.source?.extensions?.["x-markorbit-discovery-generation"]).toBe(0);

    const rootExpansion = await service.expandSource(rootAccepted.source!.id, {
      maxExpansionGeneration: 2,
      maxCandidates: 20,
      maxFetches: 10,
      maxExternalCandidates: 5,
    });
    expect(rootExpansion.generation).toBe(0);
    expect(rootExpansion.batch.batch.lineage).toMatchObject({
      generation: 0,
      parentSourceId: rootAccepted.source?.id,
      rootSourceId: rootAccepted.source?.id,
    });
    expect(rootExpansion.batch.batch.constraints?.maxExpansionGeneration).toBe(2);

    const peerAccepted = service.review("cand_peer00000000000000000000", {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });
    expect(peerAccepted.source?.extensions).toMatchObject({
      "x-markorbit-discovery-generation": 1,
      "x-markorbit-discovery-parent-source-id": rootAccepted.source?.id,
      "x-markorbit-discovery-root-source-id": rootAccepted.source?.id,
    });

    const peerExpansion = await service.expandSource(peerAccepted.source!.id, {
      maxExpansionGeneration: 2,
      maxCandidates: 20,
      maxFetches: 10,
      maxExternalCandidates: 5,
    });
    expect(peerExpansion.generation).toBe(1);
    expect(peerExpansion.batch.batch.lineage).toMatchObject({
      generation: 1,
      parentSourceId: peerAccepted.source?.id,
      rootSourceId: rootAccepted.source?.id,
    });

    const thirdAccepted = service.review("cand_third0000000000000000000", {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });
    expect(thirdAccepted.source?.extensions).toMatchObject({
      "x-markorbit-discovery-generation": 2,
      "x-markorbit-discovery-parent-source-id": peerAccepted.source?.id,
      "x-markorbit-discovery-root-source-id": rootAccepted.source?.id,
    });

    const callsBeforeBlockedExpansion = providerCalls.length;
    await expect(
      service.expandSource(thirdAccepted.source!.id, { maxExpansionGeneration: 2 }),
    ).rejects.toMatchObject({
      code: "DISCOVERY_EXPANSION_LIMIT_REACHED",
      details: {
        sourceId: thirdAccepted.source?.id,
        generation: 2,
        maxExpansionGeneration: 2,
      },
    });
    expect(providerCalls).toHaveLength(callsBeforeBlockedExpansion);

    database.close();
  });
});
