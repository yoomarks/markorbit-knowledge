import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { DEFAULT_WORKSPACE, SqliteSourceRepository } from "../src/index";

const workspaceId = DEFAULT_WORKSPACE.id;

function policy(maxItems: number) {
  return {
    includePatterns: [],
    excludePatterns: [],
    maxDepth: 4,
    maxItems,
    renderJavascript: false,
    fetchAttachments: false,
    respectRobots: true,
    rateLimitPerMinute: 30,
    timeoutSeconds: 60,
    retry: { maxAttempts: 3, backoffSeconds: 10 },
    locale: "en-US",
  };
}

describe("Crawl4AI change-watch entrypoint budget", () => {
  it("requires maxItems to cover every unique reviewed start URL", () => {
    const database = new DatabaseSync(":memory:");
    try {
      const sources = new SqliteSourceRepository(database);
      const plans = new SqliteCollectionPlanRepository(database);
      const source = sources.create({
        workspaceId,
        name: "USPTO watched pages",
        slug: "uspto-watched-pages",
        sourceType: "WEB",
        category: "OFFICIAL_AUTHORITY",
        authorityLevel: "PRIMARY_OFFICIAL",
        status: "ACTIVE",
        jurisdictions: ["US"],
        languages: ["en-US"],
        connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
        connectorConfig: {},
        canonicalUri: "https://www.uspto.gov/trademarks",
        entrypoints: [
          { uri: "https://www.uspto.gov/trademarks" },
          { uri: "https://www.uspto.gov/trademarks/fees" },
          { uri: "https://www.uspto.gov/trademarks/forms" },
        ],
        tags: ["official"],
      });

      expect(() =>
        plans.create({
          workspaceId,
          sourceId: source.id,
          name: "Undersized change watch",
          status: "ACTIVE",
          schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 900 },
          priority: "NORMAL",
          policy: policy(2),
          output: { artifactKinds: ["HTML", "MARKDOWN"] },
        }),
      ).toThrowError(
        expect.objectContaining({
          code: "COLLECTION_PLAN_CHANGE_WATCH_ENTRYPOINT_BUDGET_EXCEEDED",
        }),
      );

      const created = plans.create({
        workspaceId,
        sourceId: source.id,
        name: "Complete change watch",
        status: "ACTIVE",
        schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 900 },
        priority: "NORMAL",
        policy: policy(3),
        output: { artifactKinds: ["HTML", "MARKDOWN"] },
      });
      expect(created.plan.schedule.mode).toBe("CHANGE_WATCH");
      expect(created.plan.policy.maxItems).toBe(3);
    } finally {
      database.close();
    }
  });

  it("revalidates the entrypoint budget when an existing plan switches to CHANGE_WATCH", () => {
    const database = new DatabaseSync(":memory:");
    try {
      const sources = new SqliteSourceRepository(database);
      const plans = new SqliteCollectionPlanRepository(database);
      const source = sources.create({
        workspaceId,
        name: "USPTO updates",
        slug: "uspto-updates-watch-switch",
        sourceType: "WEB",
        category: "OFFICIAL_AUTHORITY",
        authorityLevel: "PRIMARY_OFFICIAL",
        status: "ACTIVE",
        jurisdictions: ["US"],
        languages: ["en-US"],
        connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
        connectorConfig: {},
        canonicalUri: "https://www.uspto.gov/a",
        entrypoints: [{ uri: "https://www.uspto.gov/a" }, { uri: "https://www.uspto.gov/b" }],
        tags: ["official"],
      });
      const created = plans.create({
        workspaceId,
        sourceId: source.id,
        name: "Interval crawl",
        status: "ACTIVE",
        schedule: { mode: "INTERVAL", intervalSeconds: 3600 },
        priority: "NORMAL",
        policy: policy(1),
        output: { artifactKinds: ["HTML"] },
      });

      expect(() =>
        plans.update(
          created.plan.id,
          { schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 900 } },
          created.plan.updatedAt,
        ),
      ).toThrowError(
        expect.objectContaining({
          code: "COLLECTION_PLAN_CHANGE_WATCH_ENTRYPOINT_BUDGET_EXCEEDED",
        }),
      );
    } finally {
      database.close();
    }
  });
});
