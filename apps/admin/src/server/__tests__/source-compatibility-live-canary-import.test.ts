import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, openRegistryDatabase } from "@markorbit/persistence";
import { SqliteOperationalSupplyHealthRepository } from "@markorbit/persistence/source-compatibility-supply-health";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
import { SourceCompatibilityLiveCanaryImportService } from "../source-compatibility-live-canary-import";

const observedAt = "2026-08-20T00:22:22.447Z";

function kipoBlockedSummary() {
  return {
    version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
    observedAt,
    strict: false,
    total: 1,
    passed: 0,
    degraded: 0,
    blocked: 1,
    failed: 1,
    observations: [
      {
        jurisdiction: "KR",
        displayName: "Republic of Korea",
        profile: "MULTILINGUAL",
        targetId: "kr-moip-trademark-system",
        family: "PORTAL",
        requestedUri: "https://www.kipo.go.kr/en/HtmlApp?c=9300010&catmenu=ek04_01_01",
        renderJavascript: false,
        elapsedMs: 78940,
        state: "BLOCKED",
        pagesAttempted: 0,
        artifactCount: 0,
        artifactKinds: [],
        finalUris: [],
        totalBytes: 0,
        errorCode: "CRAWL4AI_FETCH_FAILED",
        errorMessage: "Page.goto: Timeout 75000ms exceeded.",
      },
    ],
  };
}

describe("live canary compatibility import", () => {
  it("persists a real-shaped KIPO BLOCKED observation idempotently", () => {
    const database = openRegistryDatabase(":memory:");
    const service = new SourceCompatibilityLiveCanaryImportService(database);

    const first = service.import(kipoBlockedSummary());
    const replay = service.import(kipoBlockedSummary());

    expect(first).toMatchObject({
      imported: 1,
      targetIds: ["kr-moip-trademark-system"],
      observations: [
        {
          jurisdiction: "KR",
          targetId: "kr-moip-trademark-system",
          state: "BLOCKED",
          observedAt,
          renderJavascript: false,
          errorCode: "CRAWL4AI_FETCH_FAILED",
        },
      ],
    });
    expect(replay.observations[0]?.id).toBe(first.observations[0]?.id);

    const latest = new SqliteSourceCompatibilityObservationRepository(database).latest([
      "kr-moip-trademark-system",
    ]);
    expect(latest.get("kr-moip-trademark-system")).toMatchObject({
      state: "BLOCKED",
      errorCode: "CRAWL4AI_FETCH_FAILED",
      details: {
        profile: "MULTILINGUAL",
        family: "PORTAL",
        elapsedMs: 78940,
        artifactCount: 0,
      },
    });
    database.close();
  });

  it("projects imported KIPO evidence into existing supply health without source activation", () => {
    const database = openRegistryDatabase(":memory:");
    new SourceCompatibilityLiveCanaryImportService(database).import(kipoBlockedSummary());

    const health = new SqliteOperationalSupplyHealthRepository(
      database,
      () => new Date("2026-08-20T01:00:00.000Z"),
    ).list({
      workspaceId: DEFAULT_WORKSPACE.id,
      targetId: "kr-moip-trademark-system",
    });

    expect(health.items).toHaveLength(1);
    const item = health.items[0]!;
    expect(item.registrationState).toBe("UNREGISTERED");
    expect(item.sourceIds).toEqual([]);
    expect(item.compatibility).toMatchObject({
      state: "BLOCKED",
      freshness: "FRESH",
      errorCode: "CRAWL4AI_FETCH_FAILED",
      primaryUri: "https://www.kipo.go.kr/en/HtmlApp?c=9300010&catmenu=ek04_01_01",
    });
    expect(item.gaps).toContain("EXTERNAL_COMPATIBILITY_BLOCKED");
    expect(item.state).toBe("BLOCKED");
    database.close();
  });
});
