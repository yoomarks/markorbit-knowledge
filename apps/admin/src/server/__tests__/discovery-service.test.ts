import { describe, expect, it } from "vitest";
import type { SourceDiscoveryBatch } from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteSourceDiscoveryRepository } from "@markorbit/persistence/source-discovery";
import { DiscoveryWorkflowService } from "../discovery-service";

describe("DiscoveryWorkflowService", () => {
  it("persists discovery and turns an accepted candidate into a source and paused plan", async () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const service = new DiscoveryWorkflowService({
      discovery,
      sources,
      plans,
      provider: {
        async discover(batch: SourceDiscoveryBatch) {
          return [
            {
              candidateId: "cand_example_trademarks",
              locator: "https://example.com/trademarks",
              discoveredAt: "2026-08-08T01:00:00.000Z",
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
      locator: "https://example.com/",
      maxDepth: 1,
      maxCandidates: 10,
    });
    expect(run.candidates).toHaveLength(1);
    expect(service.overview().candidates.summary.DISCOVERED).toBe(1);

    const accepted = service.review("cand_example_trademarks", {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });

    expect(accepted.candidate.candidate.status).toBe("ACCEPTED");
    expect(accepted.source?.status).toBe("ACTIVE");
    expect(accepted.source?.authorityLevel).toBe("UNKNOWN");
    expect(accepted.plan?.status).toBe("PAUSED");
    expect(accepted.source?.defaultCollectionPlanId).toBe(accepted.plan?.id);
    expect(accepted.candidate.review?.acceptedSourceId).toBe(accepted.source?.id);
    expect(accepted.candidate.review?.collectionPlanId).toBe(accepted.plan?.id);

    database.close();
  });
});
