import { describe, expect, it } from "vitest";
import {
  CRAWL4AI_MAX_DEPTH,
  CRAWL4AI_MAX_ITEMS,
  CRAWL4AI_MAX_PATTERN_LENGTH,
  CRAWL4AI_MAX_PATTERNS_PER_LIST,
  CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE,
  CRAWL4AI_MAX_TIMEOUT_SECONDS,
  type CollectionPlan,
} from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "../src/index";
import { SqliteConnectorRepository } from "../src/connector-registry";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";

function policy(overrides: Partial<CollectionPlan["policy"]> = {}): CollectionPlan["policy"] {
  return {
    includePatterns: [],
    excludePatterns: [],
    maxDepth: 1,
    maxItems: 100,
    renderJavascript: false,
    fetchAttachments: false,
    respectRobots: true,
    rateLimitPerMinute: 30,
    timeoutSeconds: 30,
    retry: { maxAttempts: 3, backoffSeconds: 5 },
    locale: "en-US",
    ...overrides,
  };
}

describe("Crawl4AI CollectionPlan safety compatibility", () => {
  it("rejects every Python protocol policy overflow before persistence", () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const source = sources.create({
      name: "Official source",
      slug: "official-source",
      sourceType: "WEB",
      category: "OFFICIAL_AUTHORITY",
      authorityLevel: "PRIMARY_OFFICIAL",
      status: "ACTIVE",
      jurisdictions: ["US"],
      languages: ["en-US"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      connectorConfig: {},
      canonicalUri: "https://example.com/trademarks",
      entrypoints: [{ uri: "https://example.com/trademarks" }],
    });

    const oversizedLocale = `en-${Array.from({ length: 22 }, () => "US").join("-")}`;
    const cases: Array<[string, Partial<CollectionPlan["policy"]>]> = [
      ["depth", { maxDepth: CRAWL4AI_MAX_DEPTH + 1 }],
      ["items", { maxItems: CRAWL4AI_MAX_ITEMS + 1 }],
      ["rate", { rateLimitPerMinute: CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE + 1 }],
      ["timeout", { timeoutSeconds: CRAWL4AI_MAX_TIMEOUT_SECONDS + 1 }],
      [
        "include-count",
        {
          includePatterns: Array.from(
            { length: CRAWL4AI_MAX_PATTERNS_PER_LIST + 1 },
            (_, i) => `/i/${i}`,
          ),
        },
      ],
      [
        "exclude-count",
        {
          excludePatterns: Array.from(
            { length: CRAWL4AI_MAX_PATTERNS_PER_LIST + 1 },
            (_, i) => `/e/${i}`,
          ),
        },
      ],
      ["pattern-length", { includePatterns: [`/${"a".repeat(CRAWL4AI_MAX_PATTERN_LENGTH)}`] }],
      ["locale-length", { locale: oversizedLocale }],
    ];

    for (const [name, overrides] of cases) {
      try {
        plans.create({
          sourceId: source.id,
          name: `Invalid ${name}`,
          status: "PAUSED",
          schedule: { mode: "MANUAL" },
          priority: "NORMAL",
          policy: policy(overrides),
          output: { artifactKinds: ["HTML"] },
        });
        throw new Error(`expected ${name} to be rejected`);
      } catch (error) {
        expect(error).toMatchObject({ code: "COLLECTION_PLAN_CRAWL4AI_POLICY_MISMATCH" });
      }
    }
    expect(plans.list({ sourceId: source.id }).total).toBe(0);
    database.close();
  });

  it("allows exact Crawl4AI maxima and rejects an invalid update without mutating the plan", () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const source = sources.create({
      name: "Bounded source",
      slug: "bounded-source",
      sourceType: "WEB",
      category: "OTHER",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: ["GLOBAL"],
      languages: ["en-US"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      connectorConfig: {},
      canonicalUri: "https://example.com/",
      entrypoints: [{ uri: "https://example.com/" }],
    });
    const created = plans.create({
      sourceId: source.id,
      name: "At runtime maxima",
      status: "PAUSED",
      schedule: { mode: "MANUAL" },
      priority: "NORMAL",
      policy: policy({
        maxDepth: CRAWL4AI_MAX_DEPTH,
        maxItems: CRAWL4AI_MAX_ITEMS,
        rateLimitPerMinute: CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE,
        timeoutSeconds: CRAWL4AI_MAX_TIMEOUT_SECONDS,
        includePatterns: Array.from(
          { length: CRAWL4AI_MAX_PATTERNS_PER_LIST },
          (_, i) => `/p/${i}`,
        ),
        excludePatterns: [`/${"x".repeat(CRAWL4AI_MAX_PATTERN_LENGTH - 1)}`],
      }),
      output: { artifactKinds: ["HTML"] },
    });

    expect(created.plan.policy.maxItems).toBe(CRAWL4AI_MAX_ITEMS);
    expect(() =>
      plans.update(
        created.plan.id,
        { policy: { ...created.plan.policy, timeoutSeconds: CRAWL4AI_MAX_TIMEOUT_SECONDS + 1 } },
        created.plan.updatedAt,
      ),
    ).toThrowError();
    expect(plans.getById(created.plan.id)?.plan.policy.timeoutSeconds).toBe(
      CRAWL4AI_MAX_TIMEOUT_SECONDS,
    );
    database.close();
  });

  it("does not impose Crawl4AI-specific maxima on a different connector", () => {
    const database = openRegistryDatabase(":memory:");
    const connectors = new SqliteConnectorRepository(database);
    connectors.create({
      connectorId: "wide-web",
      displayName: "Wide Web",
      version: "1.0.0",
      sourceTypes: ["WEB"],
      runtime: "EXTERNAL",
      capabilities: ["COLLECT"],
      supportedJobTypes: ["WEB_CRAWL"],
      configurationSchema: { type: "object", properties: {} },
      secretSchema: { type: "object", properties: {} },
      outputArtifactKinds: ["HTML"],
      healthCheck: { mode: "NONE", timeoutSeconds: 1 },
      status: "ACTIVE",
    });
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const source = sources.create({
      name: "Wide source",
      slug: "wide-source",
      sourceType: "WEB",
      category: "OTHER",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: ["GLOBAL"],
      languages: ["en-US"],
      connector: { connectorId: "wide-web", version: "1.0.0" },
      connectorConfig: {},
      canonicalUri: "https://wide.example/",
      entrypoints: [{ uri: "https://wide.example/" }],
    });
    const created = plans.create({
      sourceId: source.id,
      name: "Wide policy",
      status: "PAUSED",
      schedule: { mode: "MANUAL" },
      priority: "NORMAL",
      policy: policy({
        maxDepth: CRAWL4AI_MAX_DEPTH + 1,
        maxItems: CRAWL4AI_MAX_ITEMS + 1,
        rateLimitPerMinute: CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE + 1,
        timeoutSeconds: CRAWL4AI_MAX_TIMEOUT_SECONDS + 1,
      }),
      output: { artifactKinds: ["HTML"] },
    });
    expect(created.plan.policy.maxItems).toBe(CRAWL4AI_MAX_ITEMS + 1);
    database.close();
  });
});
