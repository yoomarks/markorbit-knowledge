import { describe, expect, it } from "vitest";
import type { SourceCandidate } from "@markorbit/contracts";
import { openRegistryDatabase } from "../src/index";
import { SqliteSourceDiscoveryRepository } from "../src/source-discovery";

function candidate(overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    candidateId: "cand_policy",
    locator: "https://example.com/policy",
    title: "Policy",
    discoveredAt: "2026-08-15T01:00:00.000Z",
    status: "DISCOVERED",
    discoveredFrom: "https://example.com/",
    discoveryMethod: "HTML_LINK",
    metadata: {
      kind: "PAGE",
      host: "example.com",
      robotsAllowed: true,
      observedContentSha256: "a".repeat(64),
      topic: "GUIDANCE",
      relevanceScore: 80,
    },
    ...overrides,
  };
}

function addBatch(
  discovery: SqliteSourceDiscoveryRepository,
  batchId: string,
  observedCandidate: SourceCandidate,
) {
  const seed = discovery.createSeed({
    seedId: "seed_example",
    locator: "https://example.com/",
  });
  discovery.createBatch({
    batchId,
    seeds: [{ seedId: seed.seedId, locator: seed.locator }],
    createdAt: observedCandidate.discoveredAt,
  });
  return discovery.completeBatch(batchId, [observedCandidate]);
}

describe("source candidate rescan observations", () => {
  it("keeps rejected candidates suppressed when unchanged and preserves review history", () => {
    const database = openRegistryDatabase(":memory:");
    let now = "2026-08-15T01:01:00.000Z";
    const discovery = new SqliteSourceDiscoveryRepository(database, () => new Date(now));

    addBatch(discovery, "batch_first", candidate());
    expect(discovery.candidateObservationSummary("batch_first")).toMatchObject({
      total: 1,
      newCount: 1,
      knownCount: 0,
      changedCount: 0,
      rejectedChangedCount: 0,
    });

    discovery.reviewCandidate("cand_policy", {
      decision: "REJECTED",
      reviewer: "operator",
      note: "not needed",
    });

    now = "2026-08-15T02:01:00.000Z";
    addBatch(discovery, "batch_second", candidate({ discoveredAt: "2026-08-15T02:00:00.000Z" }));

    expect(discovery.getCandidate("cand_policy")?.candidate.status).toBe("REJECTED");
    expect(discovery.latestCandidateObservation("cand_policy")?.delta).toBe("KNOWN");
    expect(discovery.listReviewEvents("cand_policy")).toHaveLength(1);
    expect(discovery.candidateObservationSummary("batch_second")).toMatchObject({
      total: 1,
      newCount: 0,
      knownCount: 1,
      changedCount: 0,
      rejectedChangedCount: 0,
    });

    database.close();
  });

  it("records objective changes to a rejected candidate without reopening it", () => {
    const database = openRegistryDatabase(":memory:");
    let now = "2026-08-15T01:01:00.000Z";
    const discovery = new SqliteSourceDiscoveryRepository(database, () => new Date(now));

    addBatch(discovery, "batch_first", candidate());
    discovery.reviewCandidate("cand_policy", {
      decision: "REJECTED",
      reviewer: "operator",
      note: "not needed",
    });

    now = "2026-08-15T03:01:00.000Z";
    addBatch(
      discovery,
      "batch_changed",
      candidate({
        discoveredAt: "2026-08-15T03:00:00.000Z",
        metadata: {
          kind: "PAGE",
          host: "example.com",
          robotsAllowed: true,
          observedContentSha256: "b".repeat(64),
          topic: "GUIDANCE",
          relevanceScore: 80,
        },
      }),
    );

    const latest = discovery.latestCandidateObservation("cand_policy");
    expect(latest?.delta).toBe("REJECTED_CHANGED");
    expect(latest?.evidenceKind).toBe("CONTENT_SHA256");
    expect(discovery.getCandidate("cand_policy")?.candidate.status).toBe("REJECTED");
    expect(discovery.listReviewEvents("cand_policy")).toHaveLength(1);

    const reopened = discovery.reopenCandidate("cand_policy", {
      reviewer: "operator",
      note: "content changed; review again",
    });
    expect(reopened.candidate.status).toBe("DISCOVERED");
    expect(discovery.listReviewEvents("cand_policy").map((event) => event.action)).toEqual([
      "REVIEWED",
      "REOPENED",
    ]);

    database.close();
  });

  it("does not treat semantic triage metadata changes as source-content changes", () => {
    const database = openRegistryDatabase(":memory:");
    let now = "2026-08-15T01:01:00.000Z";
    const discovery = new SqliteSourceDiscoveryRepository(database, () => new Date(now));

    addBatch(discovery, "batch_first", candidate());
    now = "2026-08-15T04:01:00.000Z";
    addBatch(
      discovery,
      "batch_triage_only",
      candidate({
        discoveredAt: "2026-08-15T04:00:00.000Z",
        metadata: {
          kind: "PAGE",
          host: "example.com",
          robotsAllowed: true,
          observedContentSha256: "a".repeat(64),
          topic: "LEGAL",
          relevanceScore: 20,
          reasonCodes: ["LEGAL_SIGNAL"],
        },
      }),
    );

    expect(discovery.latestCandidateObservation("cand_policy")?.delta).toBe("KNOWN");
    database.close();
  });
});
