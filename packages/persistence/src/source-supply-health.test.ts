import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONNECTOR_MANIFEST, DEFAULT_WORKSPACE, SqliteSourceRepository } from "./index";
import { listSourceCoverageTargets } from "./source-coverage-catalog";
import { SqliteSourceSupplyHealthRepository } from "./source-supply-health";

function instrumentSupplyQueries(database: DatabaseSync): {
  database: DatabaseSync;
  reset: () => void;
  count: () => number;
} {
  let count = 0;
  const instrumented = new Proxy(database, {
    get(target, property) {
      if (property === "prepare") {
        return (sql: string) => {
          if (
            /\b(?:collection_runs|raw_artifacts|staging_documents|retrieval_documents)\b/u.test(sql)
          ) {
            count += 1;
          }
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as DatabaseSync;
  return {
    database: instrumented,
    reset: () => {
      count = 0;
    },
    count: () => count,
  };
}

function registerCoverageSources(database: DatabaseSync, count: number): number {
  const repository = new SqliteSourceRepository(database);
  const seenUris = new Set<string>();
  const targets = listSourceCoverageTargets({ catalogState: "ACTIVE" }).filter((target) => {
    if (seenUris.has(target.canonicalUri)) return false;
    seenUris.add(target.canonicalUri);
    return true;
  });
  let created = 0;
  for (const target of targets) {
    repository.create({
      workspaceId: DEFAULT_WORKSPACE.id,
      name: `Supply health ${target.id}`,
      slug: `supply-health-${created}`,
      sourceType: target.sourceType,
      category: target.category,
      authorityLevel: target.authorityLevel,
      status: "ACTIVE",
      jurisdictions: [target.jurisdiction],
      languages: [...target.languages],
      connector: {
        connectorId: DEFAULT_CONNECTOR_MANIFEST.connectorId,
        version: DEFAULT_CONNECTOR_MANIFEST.version,
      },
      canonicalUri: target.canonicalUri,
      entrypoints: target.entrypoints.map((entrypoint) => ({ ...entrypoint })),
      tags: ["source-supply-health-test"],
    });
    created += 1;
    if (created >= count) break;
  }
  return created;
}

describe("Source supply health batching", () => {
  it("keeps supply-table reads bounded as registered coverage grows", () => {
    const database = new DatabaseSync(":memory:");
    const created = registerCoverageSources(database, 40);
    expect(created).toBe(40);

    const instrumented = instrumentSupplyQueries(database);
    const repository = new SqliteSourceSupplyHealthRepository(
      instrumented.database,
      () => new Date("2026-08-17T12:00:00.000Z"),
    );
    instrumented.reset();

    const result = repository.list({
      workspaceId: DEFAULT_WORKSPACE.id,
      catalogState: "ACTIVE",
    });

    expect(result.summary.registered).toBeGreaterThanOrEqual(40);
    expect(result.summary.byState.BLOCKED).toBeGreaterThanOrEqual(40);
    expect(result.summary.gapCounts.NO_ACQUISITION_EVIDENCE).toBeGreaterThanOrEqual(40);
    expect(instrumented.count()).toBeLessThanOrEqual(8);
  });

  it("does not issue supply-table reads when no catalog target is registered", () => {
    const database = new DatabaseSync(":memory:");
    const instrumented = instrumentSupplyQueries(database);
    const repository = new SqliteSourceSupplyHealthRepository(instrumented.database);
    instrumented.reset();

    const result = repository.list({
      workspaceId: DEFAULT_WORKSPACE.id,
      targetId: "us-uspto-trademarks-root",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.registrationState).toBe("UNREGISTERED");
    expect(result.items[0]?.state).toBe("BLOCKED");
    expect(instrumented.count()).toBe(0);
  });
});
