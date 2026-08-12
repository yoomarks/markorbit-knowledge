import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, SqliteSourceRepository, openRegistryDatabase } from "../src/index";
import { SqliteSourceDiscoveryRepository } from "../src/source-discovery";
import { SqliteSourceRegistryV2Repository } from "../src/source-registry-v2-registry";

describe("production discovery provenance", () => {
  it("records one source-level manual seed provenance only after acceptance", () => {
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
        candidateId: "cand_accept",
        locator: "https://example.com/trademarks",
        discoveredAt: "2026-08-12T15:01:00.000Z",
        status: "DISCOVERED",
        discoveredFrom: seed.locator,
        discoveryMethod: "HTML_LINK",
      },
      {
        candidateId: "cand_reject",
        locator: "https://example.com/privacy",
        discoveredAt: "2026-08-12T15:01:01.000Z",
        status: "DISCOVERED",
        discoveredFrom: seed.locator,
        discoveryMethod: "HTML_LINK",
      },
    ]);

    discovery.reviewCandidate("cand_reject", { decision: "REJECTED" });
    expect(registry.get(source.id)).toBeNull();

    discovery.reviewCandidate("cand_accept", {
      decision: "ACCEPTED",
      acceptedSourceId: source.id,
      collectionPlanId: "pln_example",
    });
    discovery.reviewCandidate("cand_accept", {
      decision: "ACCEPTED",
      acceptedSourceId: source.id,
      collectionPlanId: "pln_example",
    });

    expect(registry.get(source.id)).toEqual({
      sourceId: source.id,
      discoveryProvenance: [
        {
          origin: "MANUAL_SEED",
          discoveredAt: "2026-08-12T15:00:00.000Z",
          discoveredFromUrl: "https://example.com/start",
          evidenceUrl: "https://example.com/start",
        },
      ],
      relationships: [],
    });

    database.close();
  });
});
