import { describe, expect, it } from "vitest";
import { openRegistryDatabase } from "../src/index";
import { buildPlatformOperationsPortfolio } from "../src/platform-operations-portfolio";
import { executeRetentionPolicy } from "../src/retention-execution";
import { SqliteWebUrlCatalogRepository } from "../src/web-url-catalog";

const scope = {
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  campaignId: "portfolio-campaign",
  sourceKey: "official-web",
};

describe("platform operations portfolio", () => {
  it("aggregates bounded read-only operational facts without direct SQLite inspection", () => {
    const db = openRegistryDatabase(":memory:");
    const catalog = new SqliteWebUrlCatalogRepository(
      db,
      () => new Date("2026-09-16T01:00:00.000Z"),
    );
    catalog.upsertDiscovered({
      ...scope,
      discoveryMode: "SITEMAP",
      urls: ["https://example.com/a", "https://example.com/b"],
    });
    executeRetentionPolicy(db, {
      mode: "DRY_RUN",
      observedAt: new Date("2026-09-16T02:00:00.000Z"),
    });

    const portfolio = buildPlatformOperationsPortfolio(db, {
      observedAt: new Date("2026-09-16T03:00:00.000Z"),
      walBytes: 1024,
      backupAgeHours: 2,
      restoreDrillAgeDays: 3,
      restoreThroughputMiBPerSecond: 100,
    });

    expect(portfolio.version).toBe("1.0");
    expect(portfolio.workspaces).toEqual({ total: 1, byStatus: { ACTIVE: 1 } });
    expect(portfolio.acquisition).toEqual({
      activeFrontierRows: 2,
      historicalUrlRows: 0,
      campaigns: { ACTIVE: 1 },
    });
    expect(portfolio.currentness.latestRetentionExecution).toMatchObject({
      mode: "DRY_RUN",
      scanned: 0,
      held: 0,
      applied: 0,
    });
    expect(portfolio.storage.walBytes).toBe(1024);
    expect(portfolio.storage.envelope.migrationAuthorized).toBe(false);
    db.close();
  });
});
