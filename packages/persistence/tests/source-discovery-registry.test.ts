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
    expect(repository.listReviewEvents("cand_test")).toMatchObject([
      { action: "REVIEWED", decision: "REJECTED", note: rejectionNote },
    ]);

    expect(
      repository.reviewCandidate("cand_test", {
        decision: "REJECTED",
        reviewer: "operator-1",
      }).candidate.status,
    ).toBe("REJECTED");
    expect(repository.listReviewEvents("cand_test")).toHaveLength(1);
    expect(() =>
      repository.reviewCandidate("cand_test", {
        decision: "ACCEPTED",
        acceptedSourceId: "src_missing",
        collectionPlanId: "pln_missing",
      }),
    ).toThrow(/already REJECTED/);

    now = "2026-08-08T01:05:00.000Z";
    const reopened = repository.reopenCandidate("cand_test", {
      reviewer: "operator-2",
      note: "restore:manual",
    });
    expect(reopened.candidate.status).toBe("DISCOVERED");
    expect(reopened.review).toBeUndefined();
    expect(repository.listCandidates().summary.DISCOVERED).toBe(1);
    expect(repository.listReviewEvents("cand_test")).toMatchObject([
      { action: "REVIEWED", decision: "REJECTED", note: rejectionNote },
      { action: "REOPENED", reviewer: "operator-2", note: "restore:manual" },
    ]);

    now = "2026-08-08T01:06:00.000Z";
    repository.reviewCandidate("cand_test", {
      decision: "REJECTED",
      reviewer: "operator-3",
      note: "reason:NOT_NEEDED",
    });
    expect(repository.listReviewEvents("cand_test")).toHaveLength(3);

    database.close();
  });

  it("does not reopen an accepted candidate that already owns source lifecycle objects", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteSourceDiscoveryRepository(
      database,
      () => new Date("2026-08-08T02:00:00.000Z"),
    );
    const seed = repository.createSeed({ locator: "https://example.com/" });
    repository.createBatch({
      batchId: "disc_accepted",
      seeds: [{ seedId: seed.seedId, locator: seed.locator }],
      createdAt: "2026-08-08T01:59:00.000Z",
    });
    repository.completeBatch("disc_accepted", [
      {
        candidateId: "cand_accepted",
        locator: "https://example.com/accepted",
        discoveredAt: "2026-08-08T01:59:30.000Z",
        status: "DISCOVERED",
      },
    ]);
    repository.reviewCandidate("cand_accepted", {
      decision: "ACCEPTED",
      acceptedSourceId: "src_test",
      collectionPlanId: "pln_test",
    });

    expect(() => repository.reopenCandidate("cand_accepted")).toThrow(/only REJECTED/);
    expect(repository.listReviewEvents("cand_accepted")).toHaveLength(1);
    database.close();
  });
  it("pages across multiple candidate statuses while preserving global summary", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteSourceDiscoveryRepository(
      database,
      () => new Date("2026-08-15T10:00:00.000Z"),
    );
    const seed = repository.createSeed({ locator: "https://example.com/" });
    repository.createBatch({
      batchId: "disc_paging",
      seeds: [{ seedId: seed.seedId, locator: seed.locator }],
      createdAt: "2026-08-15T09:59:00.000Z",
    });
    repository.completeBatch("disc_paging", [
      {
        candidateId: "cand_pending_a",
        locator: "https://example.com/a",
        discoveredAt: "2026-08-15T09:59:10.000Z",
        status: "DISCOVERED",
      },
      {
        candidateId: "cand_pending_b",
        locator: "https://example.com/b",
        discoveredAt: "2026-08-15T09:59:20.000Z",
        status: "REVIEWED",
      },
      {
        candidateId: "cand_rejected",
        locator: "https://example.com/rejected",
        discoveredAt: "2026-08-15T09:59:30.000Z",
        status: "DISCOVERED",
      },
      {
        candidateId: "cand_accepted",
        locator: "https://example.com/accepted",
        discoveredAt: "2026-08-15T09:59:40.000Z",
        status: "DISCOVERED",
      },
    ]);
    repository.reviewCandidate("cand_rejected", { decision: "REJECTED" });
    repository.reviewCandidate("cand_accepted", {
      decision: "ACCEPTED",
      acceptedSourceId: "src_test",
      collectionPlanId: "pln_test",
    });

    const page = repository.listCandidates({
      statuses: ["DISCOVERED", "REVIEWED"],
      limit: 1,
      offset: 1,
    });
    expect(page.items).toHaveLength(1);
    expect(["DISCOVERED", "REVIEWED"]).toContain(page.items[0]?.candidate.status);
    expect(page.total).toBe(2);
    expect(page.limit).toBe(1);
    expect(page.offset).toBe(1);
    expect(page.summary).toMatchObject({
      DISCOVERED: 1,
      REVIEWED: 1,
      ACCEPTED: 1,
      REJECTED: 1,
      total: 4,
    });

    database.close();
  });
});
