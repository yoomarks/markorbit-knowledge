import { describe, expect, it } from "vitest";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteSourceGraphRepository } from "@markorbit/persistence/source-graph";
import {
  findCompatibleSourceGraph,
  projectLegacyWebSource,
} from "../source-graph-compatibility";

function createLegacySource(
  sources: SqliteSourceRepository,
  slug: string,
  canonicalUri: string,
  label: string,
) {
  return sources.create({
    name: label,
    slug,
    sourceType: "WEB",
    category: "OTHER",
    authorityLevel: "UNKNOWN",
    status: "ACTIVE",
    jurisdictions: ["GLOBAL"],
    languages: ["und"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    canonicalUri,
    entrypoints: [{ uri: canonicalUri, label }],
    tags: ["legacy-page-source"],
  });
}

describe("legacy Source Graph compatibility projection", () => {
  it("keeps old page-level SourceDefinitions while converging same-origin pages on one website graph", () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const graph = new SqliteSourceGraphRepository(database);
    const first = createLegacySource(
      sources,
      "example-page-a",
      "https://example.com/page-a",
      "Page A",
    );
    const second = createLegacySource(
      sources,
      "example-page-b",
      "https://example.com/page-b",
      "Page B",
    );

    const firstProjection = projectLegacyWebSource(graph, first, "2026-08-08T02:00:00Z");
    expect(firstProjection.compatibilityProjection).toBe(false);
    expect(firstProjection.governedSourceId).toBe(first.id);
    expect(firstProjection.snapshot.profile.canonicalOrigin).toBe("https://example.com/");

    const secondProjection = projectLegacyWebSource(graph, second, "2026-08-08T02:01:00Z");
    expect(secondProjection.compatibilityProjection).toBe(true);
    expect(secondProjection.governedSourceId).toBe(first.id);
    expect(secondProjection.snapshot.summary.nodeCount).toBe(3);
    const secondPage = graph.findNodeByIdentity(
      secondProjection.snapshot.profile.id,
      "CANONICAL_URI",
      "https://example.com/page-b",
    );
    expect(secondPage?.extensions?.["x-markorbit-legacy-source-id"]).toBe(second.id);

    expect(sources.getById(first.id)?.status).toBe("ACTIVE");
    expect(sources.getById(second.id)?.status).toBe("ACTIVE");
    expect(findCompatibleSourceGraph(graph, second)?.compatibilityProjection).toBe(true);

    const replay = projectLegacyWebSource(graph, second, "2026-08-08T02:02:00Z");
    expect(replay.snapshot.summary.nodeCount).toBe(3);

    database.close();
  });
});
