import { describe, expect, it } from "vitest";
import type {
  PageValueScreeningResponseV1,
  SourceCandidate,
  SourceDiscoveryBatch,
} from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConnectorRepository } from "@markorbit/persistence/connectors";
import { SqliteSourceDiscoveryRepository } from "@markorbit/persistence/source-discovery";
import { SqliteSourceGraphRepository } from "@markorbit/persistence/source-graph";
import type { DiscoveryPageValueRanker } from "../discovery-page-value-ranker";
import { DiscoveryWorkflowService } from "../discovery-service";

function candidate(id: string, path: string): SourceCandidate {
  return {
    candidateId: id,
    locator: `https://example.com/${path}`,
    title: path,
    discoveredAt: "2026-08-15T09:00:00.000Z",
    status: "DISCOVERED",
    discoveredFrom: "https://example.com/",
    discoveryMethod: "HTML_LINK",
    depth: 1,
    metadata: { kind: "PAGE" },
  };
}

function response(
  items: Array<{ candidateId: string; score: number }>,
): PageValueScreeningResponseV1 {
  return {
    version: "1.0",
    capability: "page-value-screening",
    provider: {
      providerId: "test-capability",
      model: "ranker-test",
      executionId: "exec-ranking-test",
    },
    generatedAt: "2026-08-15T09:01:00.000Z",
    items: items.map((item) => ({
      candidateId: item.candidateId,
      title: item.candidateId,
      summary: "test ranking",
      pageType: "guidance",
      valuePoints: ["durable reference"],
      score: item.score,
      priority: item.score >= 90 ? "HIGH" : "MEDIUM",
    })),
  };
}

function createService(input: {
  providerCandidates: SourceCandidate[];
  pageValueRanker: DiscoveryPageValueRanker;
  onProviderBatch?: (batch: SourceDiscoveryBatch) => void;
}) {
  const database = openRegistryDatabase(":memory:");
  const discovery = new SqliteSourceDiscoveryRepository(database);
  const service = new DiscoveryWorkflowService({
    discovery,
    graph: new SqliteSourceGraphRepository(database),
    sources: new SqliteSourceRepository(database),
    plans: new SqliteCollectionPlanRepository(database),
    connectors: new SqliteConnectorRepository(database),
    provider: {
      async discover(batch: SourceDiscoveryBatch) {
        input.onProviderBatch?.(batch);
        return input.providerCandidates;
      },
    },
    pageValueRanker: input.pageValueRanker,
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
  return { database, discovery, service };
}

describe("DiscoveryWorkflowService page value ranking", () => {
  it("oversamples structurally, keeps capability-ranked Top N, and persists ranking provenance", async () => {
    const candidates = [
      candidate("cand_low_1", "navigation"),
      candidate("cand_low_2", "about"),
      candidate("cand_high_2", "fees"),
      candidate("cand_high_1", "trademark-rules"),
    ];
    let providerBudget: number | undefined;
    let screenedCount = 0;
    let requestedResults = 0;
    let recorded: PageValueScreeningResponseV1 | undefined;
    const pageValueRanker: DiscoveryPageValueRanker = {
      async rank(input) {
        screenedCount = input.candidates.length;
        requestedResults = input.maxResults;
        return {
          request: {
            version: "1.0",
            capability: "page-value-screening",
            locale: "zh-CN",
            objective: "test",
            maxResults: 2,
            candidates: input.candidates.map((item) => ({
              candidateId: item.candidateId,
              url: item.locator,
            })),
          },
          response: response([
            { candidateId: "cand_high_1", score: 99 },
            { candidateId: "cand_high_2", score: 92 },
          ]),
        };
      },
      record(value) {
        recorded = value;
      },
    };
    const { database, discovery, service } = createService({
      providerCandidates: candidates,
      pageValueRanker,
      onProviderBatch(batch) {
        providerBudget = batch.constraints?.maxCandidates;
      },
    });

    const result = await service.start({
      locator: "https://example.com/",
      maxCandidates: 2,
      maxFetches: 10,
    });

    expect(providerBudget).toBe(6);
    expect(screenedCount).toBe(4);
    expect(requestedResults).toBe(2);
    expect(result.candidates.map((item) => item.candidateId)).toEqual([
      "cand_high_1",
      "cand_high_2",
    ]);
    expect(discovery.listCandidates({ limit: 100 }).total).toBe(2);
    expect(discovery.getCandidate("cand_low_1")).toBeNull();
    expect(recorded?.provider.executionId).toBe("exec-ranking-test");
    expect(recorded?.items.map((item) => item.candidateId)).toEqual(["cand_high_1", "cand_high_2"]);
    expect(result.candidates[0]?.metadata).toEqual({ kind: "PAGE" });

    database.close();
  });

  it("falls back to deterministic provider order when shared ranking is unavailable", async () => {
    const candidates = [
      candidate("cand_first", "first"),
      candidate("cand_second", "second"),
      candidate("cand_third", "third"),
    ];
    let recordCalled = false;
    const pageValueRanker: DiscoveryPageValueRanker = {
      async rank() {
        throw new Error("capability timeout");
      },
      record() {
        recordCalled = true;
      },
    };
    const { database, discovery, service } = createService({
      providerCandidates: candidates,
      pageValueRanker,
    });

    const result = await service.start({
      locator: "https://example.com/",
      maxCandidates: 2,
      maxFetches: 10,
    });

    expect(result.candidates.map((item) => item.candidateId)).toEqual([
      "cand_first",
      "cand_second",
    ]);
    expect(discovery.listCandidates({ limit: 100 }).total).toBe(2);
    expect(recordCalled).toBe(false);

    database.close();
  });
});
