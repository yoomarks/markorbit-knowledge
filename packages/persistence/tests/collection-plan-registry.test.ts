import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { isCollectionPlan, isSourceDefinition } from "@markorbit/contracts";
import {
  DEFAULT_WORKSPACE,
  RegistryConflictError,
  SqliteSourceRepository,
  listAppliedMigrations,
  openRegistryDatabase,
  type CreateSourceInput,
} from "../src/index";
import {
  SqliteCollectionPlanRepository,
  ensureCollectionPlanRegistry,
  type CreateCollectionPlanInput,
} from "../src/collection-plan-registry";
import { SqliteConnectorRepository } from "../src/connector-registry";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { force: true });
});

function sourceInput(overrides: Partial<CreateSourceInput> = {}): CreateSourceInput {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    name: "USPTO News",
    slug: "uspto-news",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://www.uspto.gov/about-us/news-updates",
    entrypoints: [{ uri: "https://www.uspto.gov/about-us/news-updates" }],
    tags: ["official"],
    ...overrides,
  };
}

function planInput(
  sourceId: string,
  overrides: Partial<CreateCollectionPlanInput> = {},
): CreateCollectionPlanInput {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    sourceId,
    name: "Daily official updates",
    status: "PAUSED",
    schedule: { mode: "INTERVAL", intervalSeconds: 3600 },
    priority: "NORMAL",
    policy: {
      includePatterns: ["/about-us/news-updates/**"],
      excludePatterns: [],
      maxDepth: 2,
      maxItems: 100,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 30,
      timeoutSeconds: 60,
      retry: { maxAttempts: 3, backoffSeconds: 10 },
      locale: "en-US",
    },
    output: { artifactKinds: ["HTML", "MARKDOWN"] },
    ...overrides,
  };
}

function repositories(database = new DatabaseSync(":memory:")) {
  let tick = 0;
  let sourceTick = 0;
  let planTick = 0;
  const clock = () => new Date(Date.UTC(2026, 6, 16, 1, 0, tick++));
  const sources = new SqliteSourceRepository(
    database,
    clock,
    () => `src_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + sourceTick++)}`,
  );
  const connectors = new SqliteConnectorRepository(database, clock);
  const plans = new SqliteCollectionPlanRepository(
    database,
    clock,
    () => `pln_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + planTick++)}`,
  );
  return { database, sources, connectors, plans };
}

describe("SQLite CollectionPlan Registry", () => {
  it("applies migration 0003 idempotently", () => {
    const database = new DatabaseSync(":memory:");
    ensureCollectionPlanRegistry(database);
    ensureCollectionPlanRegistry(database);
    expect(listAppliedMigrations(database)).toEqual([
      "0001_source_registry",
      "0002_connector_registry",
      "0003_collection_plan_registry",
    ]);
    database.close();
  });

  it("persists create, read, update and lifecycle transitions", () => {
    const { database, sources, plans } = repositories();
    const source = sources.create(sourceInput());
    const created = plans.create(planInput(source.id));
    expect(isCollectionPlan(created.plan)).toBe(true);
    expect(created.runtimeState).toBe("NOT_SCHEDULED");
    expect(plans.getById(created.plan.id)).toEqual(created);

    const updated = plans.update(
      created.plan.id,
      { name: "Hourly official updates", priority: "HIGH" },
      created.plan.updatedAt,
    );
    expect(updated.plan.name).toBe("Hourly official updates");
    expect(updated.plan.priority).toBe("HIGH");

    const active = plans.updateStatus(updated.plan.id, "ACTIVE", updated.plan.updatedAt);
    expect(active.plan.status).toBe("ACTIVE");
    const paused = plans.updateStatus(active.plan.id, "PAUSED", active.plan.updatedAt);
    expect(paused.plan.status).toBe("PAUSED");
    const archived = plans.updateStatus(paused.plan.id, "ARCHIVED", paused.plan.updatedAt);
    expect(archived.plan.status).toBe("ARCHIVED");
    expect(() =>
      plans.updateStatus(archived.plan.id, "ACTIVE", archived.plan.updatedAt),
    ).toThrowError(RegistryConflictError);
    database.close();
  });

  it("filters, paginates and lists plans for one source", () => {
    const { database, sources, plans } = repositories();
    const source = sources.create(sourceInput());
    plans.create(planInput(source.id));
    plans.create(
      planInput(source.id, {
        name: "Watch official updates",
        schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 1800 },
        priority: "HIGH",
      }),
    );

    expect(plans.list({ scheduleMode: "CHANGE_WATCH" }).total).toBe(1);
    expect(plans.list({ priority: "HIGH" }).items).toHaveLength(1);
    expect(plans.list({ artifactKind: "MARKDOWN", limit: 1, offset: 1 }).items).toHaveLength(1);
    expect(plans.listForSource(source.id)).toHaveLength(2);
    database.close();
  });

  it("enforces unique plan names per source and optimistic concurrency", () => {
    const { database, sources, plans } = repositories();
    const source = sources.create(sourceInput());
    const created = plans.create(planInput(source.id));
    expect(() => plans.create(planInput(source.id))).toThrowError(RegistryConflictError);
    const updated = plans.update(created.plan.id, { priority: "LOW" }, created.plan.updatedAt);
    expect(() =>
      plans.update(created.plan.id, { priority: "CRITICAL" }, created.plan.updatedAt),
    ).toThrowError(RegistryConflictError);
    expect(plans.getById(created.plan.id)?.plan.updatedAt).toBe(updated.plan.updatedAt);
    database.close();
  });

  it("requires active source and connector only when a plan is active", () => {
    const { database, sources, connectors, plans } = repositories();
    const source = sources.create(sourceInput());
    const deprecated = connectors.updateStatus("crawl4ai-web", "1.0.0", "DEPRECATED");
    expect(deprecated.manifest.status).toBe("DEPRECATED");

    const paused = plans.create(planInput(source.id));
    expect(paused.plan.status).toBe("PAUSED");
    expect(() => plans.updateStatus(paused.plan.id, "ACTIVE", paused.plan.updatedAt)).toThrowError(
      RegistryConflictError,
    );
    database.close();
  });

  it("rejects unsupported output kinds and capabilities", () => {
    const { database, sources, connectors, plans } = repositories();
    connectors.create({
      connectorId: "minimal-web",
      displayName: "Minimal Web",
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
    const source = sources.create(
      sourceInput({
        name: "Minimal source",
        slug: "minimal-source",
        connector: { connectorId: "minimal-web", version: "1.0.0" },
      }),
    );

    expect(() =>
      plans.create(planInput(source.id, { output: { artifactKinds: ["PDF"] } })),
    ).toThrowError(RegistryConflictError);
    expect(() =>
      plans.create(
        planInput(source.id, {
          name: "JavaScript plan",
          policy: { ...planInput(source.id).policy, renderJavascript: true },
          output: { artifactKinds: ["HTML"] },
        }),
      ),
    ).toThrowError(RegistryConflictError);
    expect(() =>
      plans.create(
        planInput(source.id, {
          name: "Watch plan",
          schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 3600 },
          output: { artifactKinds: ["HTML"] },
        }),
      ),
    ).toThrowError(RegistryConflictError);
    database.close();
  });

  it("validates and clears a source default plan", () => {
    const { database, sources, plans } = repositories();
    const source = sources.create(sourceInput());
    const otherSource = sources.create(
      sourceInput({ name: "EUIPO News", slug: "euipo-news", jurisdictions: ["EU"] }),
    );
    const plan = plans.create(planInput(source.id));
    const otherPlan = plans.create(planInput(otherSource.id, { name: "EUIPO updates" }));

    const withDefault = plans.setSourceDefaultPlan(source.id, plan.plan.id, source.updatedAt);
    expect(withDefault.defaultCollectionPlanId).toBe(plan.plan.id);
    expect(isSourceDefinition(withDefault)).toBe(true);
    expect(() =>
      plans.setSourceDefaultPlan(source.id, otherPlan.plan.id, withDefault.updatedAt),
    ).toThrowError(RegistryConflictError);

    const archived = plans.updateStatus(plan.plan.id, "ARCHIVED", plan.plan.updatedAt);
    expect(archived.plan.status).toBe("ARCHIVED");
    expect(sources.getById(source.id)?.defaultCollectionPlanId).toBeUndefined();
    database.close();
  });

  it("survives database reopen and creates no execution tables", () => {
    const path = join(tmpdir(), `markorbit-plans-${process.pid}-${Date.now()}.sqlite`);
    temporaryPaths.push(path, `${path}-shm`, `${path}-wal`);

    const firstDatabase = openRegistryDatabase(path);
    const first = repositories(firstDatabase);
    const source = first.sources.create(sourceInput());
    const created = first.plans.create(planInput(source.id));
    firstDatabase.close();

    const secondDatabase = openRegistryDatabase(path);
    const second = repositories(secondDatabase);
    expect(second.plans.getById(created.plan.id)?.plan).toEqual(created.plan);
    const executionTables = secondDatabase
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN ('jobs', 'collection_runs', 'worker_leases')`,
      )
      .all();
    expect(executionTables).toHaveLength(0);
    secondDatabase.close();
  });
});
