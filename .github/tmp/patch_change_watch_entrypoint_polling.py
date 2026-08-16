from pathlib import Path

plan_path = Path("packages/persistence/src/collection-plan-registry.ts")
text = plan_path.read_text()
anchor = '''function validateCrawl4AiPolicy(plan: CollectionPlan, connector: ConnectorManifest): void {
'''
addition = '''function crawl4AiStartUrls(source: SourceDefinition): string[] {
  return [
    ...new Set(
      [source.canonicalUri, ...source.entrypoints.map((entrypoint) => entrypoint.uri)].filter(
        (uri): uri is string => Boolean(uri),
      ),
    ),
  ];
}

function validateCrawl4AiChangeWatch(plan: CollectionPlan, source: SourceDefinition): void {
  if (source.connector.connectorId !== "crawl4ai-web" || plan.schedule.mode !== "CHANGE_WATCH") {
    return;
  }
  const watchedStartUrls = crawl4AiStartUrls(source);
  if (watchedStartUrls.length <= plan.policy.maxItems) return;
  throw new RegistryConflictError(
    "COLLECTION_PLAN_CHANGE_WATCH_ENTRYPOINT_BUDGET_EXCEEDED",
    `Change-watch plan maxItems ${plan.policy.maxItems} cannot cover all ${watchedStartUrls.length} governed Crawl4AI start URLs`,
    {
      connectorId: source.connector.connectorId,
      watchedStartUrls: watchedStartUrls.length,
      maxItems: plan.policy.maxItems,
    },
  );
}

'''
if text.count(anchor) != 1:
    raise SystemExit(f"plan crawl policy anchor count={text.count(anchor)}")
text = text.replace(anchor, addition + anchor, 1)
old = '''  validateCrawl4AiPolicy(plan, connector);

  if (!connector.sourceTypes.includes(source.sourceType)) {
'''
new = '''  validateCrawl4AiPolicy(plan, connector);
  validateCrawl4AiChangeWatch(plan, source);

  if (!connector.sourceTypes.includes(source.sourceType)) {
'''
if text.count(old) != 1:
    raise SystemExit(f"plan compatibility validation anchor count={text.count(old)}")
plan_path.write_text(text.replace(old, new, 1))

worker_path = Path("packages/worker-runtime/src/crawl4ai-subprocess-acquirer.ts")
text = worker_path.read_text()
old = '''  if (urls.length > CRAWL4AI_MAX_START_URLS) {
    throw new CollectionAcquisitionError(
      "CRAWL_START_URL_BUDGET_EXCEEDED",
      `Crawl4AI Source snapshot contains ${urls.length} unique start URLs; the governed limit is ${CRAWL4AI_MAX_START_URLS}`,
      false,
    );
  }
}
'''
new = '''  if (urls.length > CRAWL4AI_MAX_START_URLS) {
    throw new CollectionAcquisitionError(
      "CRAWL_START_URL_BUDGET_EXCEEDED",
      `Crawl4AI Source snapshot contains ${urls.length} unique start URLs; the governed limit is ${CRAWL4AI_MAX_START_URLS}`,
      false,
    );
  }
  if (job.jobType === "PAGE_UPDATE_CHECK" && urls.length > job.planSnapshot.policy.maxItems) {
    throw new CollectionAcquisitionError(
      "CHANGE_WATCH_ENTRYPOINT_BUDGET_EXCEEDED",
      `Change-watch Job maxItems ${job.planSnapshot.policy.maxItems} cannot cover all ${urls.length} governed start URLs`,
      false,
    );
  }
}
'''
if text.count(old) != 1:
    raise SystemExit(f"worker start url validation anchor count={text.count(old)}")
text = text.replace(old, new, 1)
old = '''        maxDepth: policy.maxDepth,
        maxItems: policy.maxItems,
'''
new = '''        // PAGE_UPDATE_CHECK is a bounded poll of reviewed Source entrypoints, not a
        // recursive rediscovery crawl. Content identity comparison later in the
        // artifact executor decides whether a new immutable version is necessary.
        maxDepth: context.job.jobType === "PAGE_UPDATE_CHECK" ? 0 : policy.maxDepth,
        maxItems: policy.maxItems,
'''
if text.count(old) != 1:
    raise SystemExit(f"worker request depth anchor count={text.count(old)}")
worker_path.write_text(text.replace(old, new, 1))

worker_test = Path("packages/worker-runtime/tests/crawl4ai-subprocess-acquirer.test.ts")
test = worker_test.read_text()
insert_anchor = '''  it("passes explicit attachment authorization and verifies PDF bytes", async () => {
'''
addition = '''  it("polls only reviewed entrypoints for PAGE_UPDATE_CHECK instead of recursively crawling", async () => {
    const ctx = context();
    ctx.job.jobType = "PAGE_UPDATE_CHECK";
    ctx.job.sourceSnapshot.entrypoints = [
      { uri: "https://example.com/trademarks" },
      { uri: "https://example.com/fees" },
    ];
    ctx.job.sourceSnapshot.canonicalUri = "https://example.com/trademarks";
    ctx.job.planSnapshot.policy.maxDepth = 5;
    ctx.job.planSnapshot.policy.maxItems = 2;
    let seenDepth = -1;
    let seenUrls: string[] = [];
    const runner: Crawl4AiProcessRunner = {
      async run(request) {
        seenDepth = request.maxDepth;
        seenUrls = request.startUrls;
        const content = new TextEncoder().encode("<html>watch</html>");
        const sha256 = createHash("sha256").update(content).digest("hex");
        await writeFile(join(request.outputDirectory, "watch.html"), content);
        return {
          protocolVersion: "1.0",
          ok: true,
          pagesAttempted: 2,
          totalBytes: content.byteLength,
          artifacts: [
            {
              artifactKind: "HTML",
              mimeType: "text/html",
              originalName: "watch.html",
              sourceUri: "https://example.com/trademarks",
              canonicalUri: "https://example.com/trademarks",
              fileName: "watch.html",
              sizeBytes: content.byteLength,
              sha256,
            },
          ],
        };
      },
    };
    const acquirer = new Crawl4AiSubprocessAcquirer({ runner, requireEgressProxy: false });
    await acquirer.acquire(ctx);
    expect(seenDepth).toBe(0);
    expect(seenUrls).toEqual([
      "https://example.com/trademarks",
      "https://example.com/fees",
    ]);
  });

  it("rejects legacy PAGE_UPDATE_CHECK snapshots whose maxItems cannot cover all entrypoints", async () => {
    const ctx = context();
    ctx.job.jobType = "PAGE_UPDATE_CHECK";
    ctx.job.sourceSnapshot.entrypoints = [
      { uri: "https://example.com/a" },
      { uri: "https://example.com/b" },
    ];
    ctx.job.sourceSnapshot.canonicalUri = "https://example.com/a";
    ctx.job.planSnapshot.policy.maxItems = 1;
    let invoked = false;
    const runner: Crawl4AiProcessRunner = {
      async run() {
        invoked = true;
        throw new Error("runner must not be invoked");
      },
    };
    const acquirer = new Crawl4AiSubprocessAcquirer({ runner, requireEgressProxy: false });
    await expect(acquirer.acquire(ctx)).rejects.toMatchObject({
      code: "CHANGE_WATCH_ENTRYPOINT_BUDGET_EXCEEDED",
      retryable: false,
    });
    expect(invoked).toBe(false);
  });

'''
if test.count(insert_anchor) != 1:
    raise SystemExit(f"worker test insertion anchor count={test.count(insert_anchor)}")
worker_test.write_text(test.replace(insert_anchor, addition + insert_anchor, 1))

plan_test_path = Path("packages/persistence/tests/change-watch-entrypoint-budget.test.ts")
plan_test_path.write_text('''import { DatabaseSync } from "node:sqlite";
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
        entrypoints: [
          { uri: "https://www.uspto.gov/a" },
          { uri: "https://www.uspto.gov/b" },
        ],
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
''')
