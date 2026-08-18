import { describe, expect, it } from "vitest";
import type { SourceDiscoveryBatch } from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConnectorRepository } from "@markorbit/persistence/connectors";
import { SqliteExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import { SqliteSourceDiscoveryRepository } from "@markorbit/persistence/source-discovery";
import { SqliteSourceGraphRepository } from "@markorbit/persistence/source-graph";
import { DiscoveryCollectionService } from "../discovery-collection-service";
import { reviewDiscoveryCandidatesBatch } from "../discovery-review-batch-service";
import { DiscoveryWorkflowService } from "../discovery-service";

describe("Discovery batch approval → initial collection", () => {
  it("snapshots every same-site accepted entrypoint before creating one initial Run", async () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const connectors = new SqliteConnectorRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const graph = new SqliteSourceGraphRepository(database);
    const runs = new SqliteExecutionLedgerRepository(database);

    const workflow = new DiscoveryWorkflowService({
      discovery,
      graph,
      sources,
      plans,
      connectors,
      provider: {
        async discover(batch: SourceDiscoveryBatch) {
          return [
            {
              candidateId: "cand_111111111111111111111111",
              locator: "https://example.com/trademarks/fees",
              title: "Trademark fees",
              discoveredAt: "2026-08-16T01:00:00.000Z",
              status: "DISCOVERED" as const,
              discoveredFrom: batch.seeds[0]?.locator,
              discoveryMethod: "HTML_LINK" as const,
              depth: 1,
              metadata: { kind: "PAGE" },
            },
            {
              candidateId: "cand_222222222222222222222222",
              locator: "https://example.com/trademarks/guidance",
              title: "Trademark guidance",
              discoveredAt: "2026-08-16T01:00:01.000Z",
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
    const collection = new DiscoveryCollectionService({ discovery, sources, plans, runs });

    await workflow.start({
      locator: "https://example.com/trademarks",
      maxDepth: 1,
      maxCandidates: 10,
    });

    const result = reviewDiscoveryCandidatesBatch(
      {
        candidateIds: ["cand_111111111111111111111111", "cand_222222222222222222222222"],
        decision: "ACCEPTED",
        reviewer: "operator-test",
        startCollection: true,
      },
      { workflow, collection },
    );

    expect(result.summary).toEqual({
      requested: 2,
      succeeded: 2,
      failed: 0,
      collectionStarted: 1,
      collectionDeferred: 0,
    });
    expect(result.items[0]).toMatchObject({ status: "ACCEPTED", replayed: false });
    expect(result.items[1]).toMatchObject({ status: "ACCEPTED", replayed: false });
    expect(result.items[0] && "runId" in result.items[0] ? result.items[0].runId : undefined).toBe(
      result.items[1] && "runId" in result.items[1] ? result.items[1].runId : undefined,
    );

    const sourceList = sources.list({ sourceType: "WEB", limit: 100 });
    expect(sourceList.total).toBe(1);
    expect(sourceList.items[0]?.entrypoints.map((entrypoint) => entrypoint.uri)).toEqual([
      "https://example.com/trademarks",
      "https://example.com/trademarks/fees",
      "https://example.com/trademarks/guidance",
    ]);

    const runList = runs.list({ limit: 100 });
    expect(runList.total).toBe(1);
    expect(runList.items[0]?.jobs).toHaveLength(1);
    expect(
      runList.items[0]?.run.sourceSnapshot.entrypoints.map((entrypoint) => entrypoint.uri),
    ).toEqual([
      "https://example.com/trademarks",
      "https://example.com/trademarks/fees",
      "https://example.com/trademarks/guidance",
    ]);
    expect(
      runList.items[0]?.jobs[0]?.sourceSnapshot.entrypoints.map((entrypoint) => entrypoint.uri),
    ).toEqual([
      "https://example.com/trademarks",
      "https://example.com/trademarks/fees",
      "https://example.com/trademarks/guidance",
    ]);

    const planId = sourceList.items[0]?.defaultCollectionPlanId;
    expect(planId).toBeTruthy();
    expect(planId ? plans.getById(planId)?.plan.status : null).toBe("ACTIVE");

    database.close();
  });
});
