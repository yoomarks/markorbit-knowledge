import { describe, expect, it } from "vitest";
import { openRegistryDatabase } from "../src/index";
import { SqliteSourceDiscoveryRepository } from "../src/source-discovery";

describe("source discovery lineage persistence", () => {
  it("round-trips structural generation lineage in the existing batch ledger", () => {
    const database = openRegistryDatabase(":memory:");
    const discovery = new SqliteSourceDiscoveryRepository(database);
    discovery.createSeed({
      seedId: "seed_lineage",
      locator: "https://peer.example/",
    });

    discovery.createBatch({
      batchId: "disc_lineage",
      seeds: [{ seedId: "seed_lineage", locator: "https://peer.example/" }],
      createdAt: "2026-08-12T17:00:00.000Z",
      constraints: {
        maxDepth: 1,
        maxCandidates: 50,
        maxFetches: 20,
        discoverExternalLinks: true,
        maxExternalCandidates: 10,
        maxExpansionGeneration: 2,
      },
      lineage: {
        generation: 1,
        parentBatchId: "disc_parent",
        parentSourceId: "src_01HZZZZZZZZZZZZZZZZZZZZZZZ",
        rootSourceId: "src_01HYYYYYYYYYYYYYYYYYYYYYYY",
      },
    });

    expect(discovery.getBatch("disc_lineage")?.batch).toMatchObject({
      batchId: "disc_lineage",
      constraints: { maxExpansionGeneration: 2 },
      lineage: {
        generation: 1,
        parentBatchId: "disc_parent",
        parentSourceId: "src_01HZZZZZZZZZZZZZZZZZZZZZZZ",
        rootSourceId: "src_01HYYYYYYYYYYYYYYYYYYYYYYY",
      },
    });

    database.close();
  });
});
