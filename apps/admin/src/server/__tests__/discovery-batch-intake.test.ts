import { describe, expect, it } from "vitest";
import type { SourceDiscoveryBatch } from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConnectorRepository } from "@markorbit/persistence/connectors";
import { SqliteSourceDiscoveryRepository } from "@markorbit/persistence/source-discovery";
import { SqliteSourceGraphRepository } from "@markorbit/persistence/source-graph";
import { DiscoveryWorkflowService } from "../discovery-service";

function candidateIdFor(locator: string, suffix: string): string {
  const token = new URL(locator).hostname.includes("other") ? "b" : suffix;
  return `cand_${token.repeat(24)}`;
}

describe("DiscoveryWorkflowService batch intake", () => {
  it("deduplicates website origins, skips existing sources, and applies defaults only to the seeded origin", async () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const connectors = new SqliteConnectorRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const graph = new SqliteSourceGraphRepository(database);
    const service = new DiscoveryWorkflowService({
      discovery,
      graph,
      sources,
      plans,
      connectors,
      provider: {
        async discover(batch: SourceDiscoveryBatch) {
          const seed = batch.seeds[0]!.locator;
          const origin = new URL(seed).origin;
          if (origin === "https://example.com") {
            return [
              {
                candidateId: candidateIdFor(seed, "a"),
                locator: "https://example.com/trademark-guidance",
                title: "Trademark guidance",
                discoveredAt: "2026-08-15T00:00:00.000Z",
                status: "DISCOVERED" as const,
                discoveredFrom: seed,
                discoveryMethod: "HTML_LINK" as const,
                depth: 1,
                metadata: { kind: "PAGE" },
              },
              {
                candidateId: `cand_${"c".repeat(24)}`,
                locator: "https://peer.example/services",
                title: "Peer services",
                discoveredAt: "2026-08-15T00:00:01.000Z",
                status: "DISCOVERED" as const,
                discoveredFrom: seed,
                discoveryMethod: "HTML_LINK" as const,
                depth: 1,
                metadata: { kind: "PAGE", externalToSeed: true },
              },
            ];
          }
          return [
            {
              candidateId: candidateIdFor(seed, "d"),
              locator: "https://other.example/guides",
              title: "Other guides",
              discoveredAt: "2026-08-15T00:00:02.000Z",
              status: "DISCOVERED" as const,
              discoveredFrom: seed,
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

    const batch = await service.startBatch({
      locators: [
        "https://example.com/start",
        "https://example.com/another-path",
        "https://other.example/start",
      ],
      maxDepth: 1,
      maxCandidates: 20,
      intake: {
        category: "OFFICIAL_AUTHORITY",
        authorityLevel: "PRIMARY_OFFICIAL",
        jurisdictions: ["us"],
        languages: ["en"],
        note: "Primary trademark office source",
        tags: ["official", "trademark"],
      },
    });

    expect(batch.summary).toMatchObject({
      submitted: 3,
      uniqueOrigins: 2,
      started: 2,
      skippedDuplicateInput: 1,
      skippedExistingSource: 0,
      failed: 0,
      candidateCount: 3,
    });

    const sameOrigin = service.review(`cand_${"a".repeat(24)}`, {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });
    expect(sameOrigin.source).toMatchObject({
      category: "OFFICIAL_AUTHORITY",
      authorityLevel: "PRIMARY_OFFICIAL",
      jurisdictions: ["US"],
      languages: ["en"],
    });
    expect(sameOrigin.source?.tags).toEqual(
      expect.arrayContaining(["discovery-accepted", "website-source", "official", "trademark"]),
    );
    expect(sameOrigin.source?.extensions?.["x-markorbit-intake-note"]).toBe(
      "Primary trademark office source",
    );

    const external = service.review(`cand_${"c".repeat(24)}`, {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });
    expect(external.source).toMatchObject({
      category: "OTHER",
      authorityLevel: "UNKNOWN",
      jurisdictions: ["GLOBAL"],
      languages: ["und"],
    });
    expect(external.source?.extensions?.["x-markorbit-intake-note"]).toBeUndefined();

    const repeat = await service.startBatch({
      locators: ["https://example.com/new-entry"],
      intake: { jurisdictions: ["CA"] },
    });
    expect(repeat.summary).toMatchObject({
      submitted: 1,
      uniqueOrigins: 1,
      started: 0,
      skippedExistingSource: 1,
      failed: 0,
    });

    database.close();
  });
});
