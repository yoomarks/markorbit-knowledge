import { describe, expect, it } from "vitest";
import { openRegistryDatabase } from "../src/index";
import { SqliteSourceDiscoveryRepository } from "../src/source-discovery-registry";

describe("SqliteSourceDiscoveryRepository", () => {
  it("persists seeds, batches, candidates and terminal review decisions", () => {
    const database = openRegistryDatabase(":memory:");
    let now = "2026-08-08T01:00:00.000Z";
    const repository = new SqliteSourceDiscoveryRepository(database, () => new Date(now));

    const seed = repository.createSeed({
      seedId: "seed_test",
      locator: "https://example.com/",
    });
    const duplicateSeed = repository.createSeed({ locator: "https://example.com/" });
    expect(duplicateSeed.seedId).toBe(seed.seedId);

    repository.createBatch({
      batchId: "disc_test",
      seeds: [{ seedId: seed.seedId, locator: seed.locator }],
      createdAt: now,
      constraints: { maxDepth: 1, maxCandidates: 10, sameHostOnly: true },
    });

    now = "2026-08-08T01:01:00.000Z";
    const completed = repository.completeBatch("disc_test", [
      {
        candidateId: "cand_test",
        locator: "https://example.com/trademarks",
        discoveredAt: "2026-08-08T01:00:30.000Z",
        status: "DISCOVERED",
        discoveredFrom: "https://example.com/",
        discoveryMethod: "HTML_LINK",
        depth: 1,
      },
    ]);

    expect(completed.status).toBe("COMPLETED");
    expect(completed.candidateCount).toBe(1);
    expect(repository.listCandidates().summary.DISCOVERED).toBe(1);

    now = "2026-08-08T01:02:00.000Z";
    const rejectionNote = "reason:IRRELEVANT|not relevant to trademark knowledge";
    const rejected = repository.reviewCandidate("cand_test", {
      decision: "REJECTED",
      reviewer: "operator-1",
      note: rejectionNote,
    });
    expect(rejected.candidate.status).toBe("REJECTED");
    expect(rejected.review?.reviewer).toBe("operator-1");
    expect(rejected.review?.note).toBe(rejectionNote);
    expect(repository.listCandidates().summary.REJECTED).toBe(1);

    repository.createBatch({
      batchId: "disc_rediscovered",
      seeds: [{ seedId: seed.seedId, locator: seed.locator }],
      createdAt: "2026-08-08T01:03:00.000Z",
    });
    now = "2026-08-08T01:04:00.000Z";
    repository.completeBatch("disc_rediscovered", [
      {
        candidateId: "cand_test",
        locator: "https://example.com/trademarks",
        title: "Rediscovered title",
        discoveredAt: "2026-08-08T01:03:30.000Z",
        status: "DISCOVERED",
        discoveredFrom: "https://example.com/",
        discoveryMethod: "HTML_LINK",
        depth: 1,
      },
    ]);

    const remembered = repository.getCandidate("cand_test");
    expect(remembered?.candidate.status).toBe("REJECTED");
    expect(remembered?.review?.note).toBe(rejectionNote);
    expect(remembered?.batchId).toBe("disc_rediscovered");

    expect(
      repository.reviewCandidate("cand_test", {
        decision: "REJECTED",
        reviewer: "operator-1",
      }).candidate.status,
    ).toBe("REJECTED");
    expect(() =>
      repository.reviewCandidate("cand_test", {
        decision: "ACCEPTED",
        acceptedSourceId: "src_missing",
        collectionPlanId: "pln_missing",
      }),
    ).toThrow(/already REJECTED/);

    database.close();
  });
});
