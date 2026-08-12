import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, SqliteSourceRepository, openRegistryDatabase } from "../src/index";
import { SqliteSourceDiscoveryRepository } from "../src/source-discovery";
import { SqliteSourceRegistryV2Repository } from "../src/source-registry-v2-registry";

describe("production discovery provenance", () => {
  it("records the candidate's actual structural discovery path only after acceptance", () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const source = sources.create({
      workspaceId: DEFAULT_WORKSPACE.id,
      name: "Example",
      slug: "example",
      sourceType: "WEB",
      category: "OTHER",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: ["GLOBAL"],
      languages: ["und"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      canonicalUri: "https://example.com/",
      entrypoints: [{ uri: "https://example.com/start" }],
    });
    const discovery = new SqliteSourceDiscoveryRepository(
      database,
      () => new Date("2026-08-12T15:20:00.000Z"),
    );
    const registry = new SqliteSourceRegistryV2Repository(database);
    const seed = discovery.createSeed({
      seedId: "seed_example",
      locator: "https://example.com/start",
    });
    discovery.createBatch({
      batchId: "disc_example",
      seeds: [{ seedId: seed.seedId, locator: seed.locator }],
      createdAt: "2026-08-12T15:00:00.000Z",
    });
    discovery.completeBatch("disc_example", [
      {
        candidateId: "cand_link",
        locator: "https://example.com/trademarks",
        discoveredAt: "2026-08-12T15:01:00.000Z",
        status: "DISCOVERED",
        discoveredFrom: seed.locator,
        discoveryMethod: "HTML_LINK",
      },
      {
        candidateId: "cand_sitemap",
        locator: "https://example.com/forms.pdf",
        discoveredAt: "2026-08-12T15:02:00.000Z",
        status: "DISCOVERED",
        discoveredFrom: "https://example.com/sitemap.xml",
        discoveryMethod: "SITEMAP",
      },
      {
        candidateId: "cand_feed",
        locator: "https://example.com/news/1",
        discoveredAt: "2026-08-12T15:03:00.000Z",
        status: "DISCOVERED",
        discoveredFrom: "https://example.com/feed.xml",
        discoveryMethod: "FEED",
      },
      {
        candidateId: "cand_citation",
        locator: "https://example.com/decision/2",
        discoveredAt: "2026-08-12T15:04:00.000Z",
        status: "DISCOVERED",
        discoveredFrom: "https://example.com/decision/1",
        discoveryMethod: "CITATION",
      },
      {
        candidateId: "cand_manual",
        locator: "https://example.com/manual-entry",
        discoveredAt: "2026-08-12T15:05:00.000Z",
        status: "DISCOVERED",
        discoveryMethod: "MANUAL",
      },
      {
        candidateId: "cand_reject",
        locator: "https://example.com/privacy",
        discoveredAt: "2026-08-12T15:06:00.000Z",
        status: "DISCOVERED",
        discoveredFrom: seed.locator,
        discoveryMethod: "HTML_LINK",
      },
    ]);

    discovery.reviewCandidate("cand_reject", { decision: "REJECTED" });
    expect(registry.get(source.id)).toBeNull();

    for (const candidateId of [
      "cand_link",
      "cand_sitemap",
      "cand_feed",
      "cand_citation",
      "cand_manual",
    ]) {
      discovery.reviewCandidate(candidateId, {
        decision: "ACCEPTED",
        acceptedSourceId: source.id,
        collectionPlanId: "pln_example",
      });
    }

    // Re-reviewing the same accepted candidate must remain idempotent.
    discovery.reviewCandidate("cand_link", {
      decision: "ACCEPTED",
      acceptedSourceId: source.id,
      collectionPlanId: "pln_example",
    });

    expect(registry.get(source.id)).toEqual({
      sourceId: source.id,
      discoveryProvenance: [
        {
          origin: "EXTERNAL_LINK",
          discoveredAt: "2026-08-12T15:01:00.000Z",
          discoveredFromUrl: "https://example.com/start",
          evidenceUrl: "https://example.com/start",
        },
        {
          origin: "SITEMAP",
          discoveredAt: "2026-08-12T15:02:00.000Z",
          discoveredFromUrl: "https://example.com/sitemap.xml",
          evidenceUrl: "https://example.com/sitemap.xml",
        },
        {
          origin: "RSS_FEED",
          discoveredAt: "2026-08-12T15:03:00.000Z",
          discoveredFromUrl: "https://example.com/feed.xml",
          evidenceUrl: "https://example.com/feed.xml",
        },
        {
          origin: "CITATION",
          discoveredAt: "2026-08-12T15:04:00.000Z",
          discoveredFromUrl: "https://example.com/decision/1",
          evidenceUrl: "https://example.com/decision/1",
        },
        {
          origin: "MANUAL_SEED",
          discoveredAt: "2026-08-12T15:05:00.000Z",
          evidenceUrl: "https://example.com/manual-entry",
        },
      ],
      relationships: [],
    });

    database.close();
  });
});
