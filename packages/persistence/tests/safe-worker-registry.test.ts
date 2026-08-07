import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { RegistryConflictError, SqliteSourceRepository } from "../src/index";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { SqliteWorkerRegistryRepository } from "../src/safe-worker-registry";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("safe Worker Registry facade", () => {
  it("persists EXPIRED and returns the Job to PENDING when renewal observes expiry", () => {
    const database = new DatabaseSync(":memory:");
    let current = new Date("2026-07-16T08:00:00Z");
    const clock = () => new Date(current);

    const sources = new SqliteSourceRepository(database, clock);
    const plans = new SqliteCollectionPlanRepository(database, clock);
    const runs = new SqliteExecutionLedgerRepository(database, clock);
    const workers = new SqliteWorkerRegistryRepository(
      database,
      clock,
      undefined,
      undefined,
      undefined,
      {
        heartbeatFreshnessMs: 10_000,
        heartbeatClockSkewMs: 10_000,
        leaseDurationMs: 2_000,
        maxLeaseLifetimeMs: 10_000,
      },
    );

    const source = sources.create({
      workspaceId,
      name: "USPTO News",
      slug: "uspto-news-safe-renew",
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
    });

    const plan = plans.create({
      workspaceId,
      sourceId: source.id,
      name: "Safe renew test plan",
      status: "ACTIVE",
      schedule: { mode: "INTERVAL", intervalSeconds: 3600 },
      priority: "NORMAL",
      policy: {
        includePatterns: [],
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
    });
    const record = runs.dispatchManual({ planId: plan.plan.id }).record;

    const worker = workers.create({
      workspaceId,
      displayName: "Safe renew Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: "mo-worker", version: "1.0.0" },
      supportedJobTypes: ["WEB_CRAWL"],
      connectorBindings: [
        {
          connectorId: "crawl4ai-web",
          version: "1.0.0",
          capabilities: ["COLLECT"],
        },
      ],
      maxConcurrency: 1,
      labels: ["test"],
    });

    workers.heartbeat(
      {
        workerId: worker.view.worker.id,
        observedAt: clock().toISOString(),
        runtimeVersion: "1.0.0",
        health: "HEALTHY",
        activeLeaseIds: [],
      },
      worker.credential,
    );
    const claim = workers.claim(worker.view.worker.id, worker.credential);
    current = new Date(current.getTime() + 3_000);

    expect(() =>
      workers.renewLease(
        worker.view.worker.id,
        worker.credential,
        claim.lease!.id,
        claim.leaseToken!,
      ),
    ).toThrowError(RegistryConflictError);

    expect(workers.listLeases({ status: "EXPIRED" }).total).toBe(1);
    expect(runs.getById(record.run.id)?.jobs[0]?.status).toBe("PENDING");
    database.close();
  });
});
