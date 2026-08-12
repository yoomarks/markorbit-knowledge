import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, SqliteSourceRepository, openRegistryDatabase } from "../src/index";
import { SqliteSourceRegistryV2Repository } from "../src/source-registry-v2-registry";

function createSource(
  sources: SqliteSourceRepository,
  slug: string,
  uri: string,
) {
  return sources.create({
    workspaceId: DEFAULT_WORKSPACE.id,
    name: slug,
    slug,
    sourceType: "WEB",
    category: "OTHER",
    authorityLevel: "UNKNOWN",
    status: "ACTIVE",
    jurisdictions: ["GLOBAL"],
    languages: ["und"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    canonicalUri: uri,
    entrypoints: [{ uri }],
  });
}

describe("SqliteSourceRegistryV2Repository", () => {
  it("persists idempotent discovery provenance and directional source relationships", () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const parent = createSource(sources, "wipo", "https://www.wipo.int/");
    const child = createSource(sources, "example-office", "https://ip.example/");
    const registry = new SqliteSourceRegistryV2Repository(
      database,
      () => new Date("2026-08-12T15:10:00.000Z"),
    );

    const provenance = {
      origin: "EXTERNAL_LINK" as const,
      discoveredAt: "2026-08-12T15:00:00.000Z",
      discoveredFromSourceId: parent.id,
      discoveredFromUrl: "https://www.wipo.int/members/en/",
      evidenceUrl: "https://www.wipo.int/members/en/",
    };

    registry.recordDiscovery(child.id, provenance, parent.id);
    const replayed = registry.recordDiscovery(child.id, provenance, parent.id);
    expect(replayed.parentSourceId).toBe(parent.id);
    expect(replayed.discoveryProvenance).toEqual([provenance]);

    registry.addRelationship({
      relationshipType: "OFFICIAL_LINK",
      sourceId: parent.id,
      relatedSourceId: child.id,
    });
    const related = registry.addRelationship({
      relationshipType: "OFFICIAL_LINK",
      sourceId: parent.id,
      relatedSourceId: child.id,
    });
    expect(related.relationships).toEqual([
      {
        relationshipType: "OFFICIAL_LINK",
        sourceId: parent.id,
        relatedSourceId: child.id,
      },
    ]);

    database.close();
  });

  it("rejects missing, self-referential and conflicting parent sources", () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const first = createSource(sources, "first", "https://first.example/");
    const second = createSource(sources, "second", "https://second.example/");
    const third = createSource(sources, "third", "https://third.example/");
    const registry = new SqliteSourceRegistryV2Repository(database);
    const provenance = {
      origin: "MANUAL_SEED" as const,
      discoveredAt: "2026-08-12T15:00:00.000Z",
      discoveredFromUrl: "https://second.example/",
      evidenceUrl: "https://second.example/",
    };

    expect(() => registry.recordDiscovery("src_missing", provenance)).toThrow(/not found/i);
    expect(() => registry.recordDiscovery(second.id, provenance, second.id)).toThrow(/own parent/i);

    registry.recordDiscovery(second.id, provenance, first.id);
    expect(() => registry.recordDiscovery(second.id, provenance, third.id)).toThrow(/already has parent/i);
    expect(() =>
      registry.addRelationship({
        relationshipType: "REFERENCES",
        sourceId: first.id,
        relatedSourceId: first.id,
      }),
    ).toThrow(/cannot point to itself/i);

    database.close();
  });
});
