import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { isJobLease, isWorkerHeartbeat } from "@markorbit/contracts";
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
  type CreateCollectionPlanInput,
} from "../src/collection-plan-registry";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { claimSpecificJob } from "../src/targeted-worker-claim";
import {
  SqliteWorkerRegistryRepository,
  WorkerAuthenticationError,
  WorkerAuthorizationError,
  ensureWorkerRegistry,
  type CreateWorkerInput,
  type WorkerProtocolOptions,
} from "../src/worker-registry";

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
    ...overrides,
  };
}

function workerInput(overrides: Partial<CreateWorkerInput> = {}): CreateWorkerInput {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    displayName: "Local Web Worker",
    desiredState: "ACTIVE",
    runtime: { runtimeId: "mo-worker", version: "1.0.0" },
    supportedJobTypes: ["WEB_CRAWL", "PAGE_UPDATE_CHECK"],
    connectorBindings: [
      {
        connectorId: "crawl4ai-web",
        version: "1.0.0",
        capabilities: ["COLLECT", "CHECK_UPDATE", "RENDER_JAVASCRIPT", "FETCH_ATTACHMENTS"],
      },
    ],
    maxConcurrency: 1,
    labels: ["local", "web"],
    ...overrides,
  };
}

function environment(
  database = new DatabaseSync(":memory:"),
  workerOptions: WorkerProtocolOptions = {},
) {
  let current = new Date("2026-07-16T02:00:00Z");
  let sourceTick = 0;
  let planTick = 0;
  let runTick = 0;
  let jobTick = 0;
  let workerTick = 0;
  let heartbeatTick = 0;
  let leaseTick = 0;
  const clock = () => new Date(current);
  const advance = (milliseconds: number) => {
    current = new Date(current.getTime() + milliseconds);
  };
  const sources = new SqliteSourceRepository(
    database,
    clock,
    () => `src_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + sourceTick++)}`,
  );
  const plans = new SqliteCollectionPlanRepository(
    database,
    clock,
    () => `pln_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + planTick++)}`,
  );
  const runs = new SqliteExecutionLedgerRepository(
    database,
    clock,
    () => `run_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + runTick++)}`,
    () => `job_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + jobTick++)}`,
  );
  const workers = new SqliteWorkerRegistryRepository(
    database,
    clock,
    () => `wrk_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + workerTick++)}`,
    () => `hbt_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + heartbeatTick++)}`,
    () => `lse_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + leaseTick++)}`,
    {
      heartbeatFreshnessMs: 10_000,
      heartbeatClockSkewMs: 10_000,
      leaseDurationMs: 2_000,
      maxLeaseLifetimeMs: 10_000,
      ...workerOptions,
    },
  );
  return { database, clock, advance, sources, plans, runs, workers };
}

function dispatchOne(env: ReturnType<typeof environment>, overrides = {}) {
  const source = env.sources.create(sourceInput());
  const plan = env.plans.create(planInput(source.id, overrides));
  return {
    source,
    plan,
    record: env.runs.dispatchManual({ planId: plan.plan.id }).record,
  };
}

function heartbeat(
  env: ReturnType<typeof environment>,
  workerId: string,
  credential: string,
  health: "HEALTHY" | "DEGRADED" | "ERROR" = "HEALTHY",
) {
  return env.workers.heartbeat(
    {
      workerId,
      observedAt: env.clock().toISOString(),
      runtimeVersion: "1.0.0",
      health,
      activeLeaseIds: [],
    },
    credential,
  );
}

describe("SQLite Worker Registry", () => {
  it("applies migration 0005 idempotently", () => {
    const database = new DatabaseSync(":memory:");
    ensureWorkerRegistry(database);
    ensureWorkerRegistry(database);
    expect(listAppliedMigrations(database)).toEqual([
      "0001_source_registry",
      "0002_connector_registry",
      "0003_collection_plan_registry",
      "0004_execution_ledger",
      "0005_worker_registry_and_leases",
    ]);
    database.close();
  });

  it("creates a Worker, stores only credential digest and rotates credentials", () => {
    const env = environment();
    const created = env.workers.create(workerInput());
    expect(created.credential).toMatch(/^mwk_/);
    const stored = env.database
      .prepare("SELECT credential_digest FROM worker_credentials WHERE worker_id = ?")
      .get(created.view.worker.id) as { credential_digest: string };
    expect(stored.credential_digest).not.toContain(created.credential);
    expect(env.workers.verifyCredential(created.view.worker.id, created.credential).id).toBe(
      created.view.worker.id,
    );

    const rotated = env.workers.rotateCredential(created.view.worker.id);
    expect(rotated.credential).not.toBe(created.credential);
    expect(() =>
      env.workers.verifyCredential(created.view.worker.id, created.credential),
    ).toThrowError(WorkerAuthenticationError);
    expect(env.workers.verifyCredential(created.view.worker.id, rotated.credential).id).toBe(
      created.view.worker.id,
    );
    env.database.close();
  });

  it("derives OFFLINE, ONLINE, BUSY, DRAINING, DISABLED and ERROR status", () => {
    const env = environment();
    const created = env.workers.create(workerInput());
    expect(created.view.effectiveStatus).toBe("OFFLINE");
    expect(heartbeat(env, created.view.worker.id, created.credential).effectiveStatus).toBe(
      "ONLINE",
    );

    dispatchOne(env);
    const claim = env.workers.claim(created.view.worker.id, created.credential);
    expect(claim.lease).not.toBeNull();
    expect(env.workers.getById(created.view.worker.id)?.effectiveStatus).toBe("BUSY");

    const busy = env.workers.getById(created.view.worker.id)!;
    const draining = env.workers.update(
      created.view.worker.id,
      { desiredState: "DRAINING" },
      busy.worker.updatedAt,
    );
    expect(draining.effectiveStatus).toBe("DRAINING");
    const disabled = env.workers.update(
      created.view.worker.id,
      { desiredState: "DISABLED" },
      draining.worker.updatedAt,
    );
    expect(disabled.effectiveStatus).toBe("DISABLED");
    expect(disabled.activeLeaseCount).toBe(0);
    expect(env.runs.list().items[0]?.jobs[0]?.status).toBe("PENDING");

    const errorWorker = env.workers.create(workerInput({ displayName: "Error Worker" }));
    expect(
      heartbeat(env, errorWorker.view.worker.id, errorWorker.credential, "ERROR").effectiveStatus,
    ).toBe("ERROR");
    env.database.close();
  });

  it("rejects excessive heartbeat clock skew and foreign leases", () => {
    const env = environment();
    const first = env.workers.create(workerInput());
    const second = env.workers.create(workerInput({ displayName: "Second Worker" }));
    expect(() =>
      env.workers.heartbeat(
        {
          workerId: first.view.worker.id,
          observedAt: "2026-07-16T03:00:00Z",
          runtimeVersion: "1.0.0",
          health: "HEALTHY",
        },
        first.credential,
      ),
    ).toThrowError(RegistryConflictError);

    heartbeat(env, first.view.worker.id, first.credential);
    dispatchOne(env);
    const claim = env.workers.claim(first.view.worker.id, first.credential);
    expect(isJobLease(claim.lease)).toBe(true);
    expect(() =>
      env.workers.heartbeat(
        {
          workerId: second.view.worker.id,
          observedAt: env.clock().toISOString(),
          runtimeVersion: "1.0.0",
          health: "HEALTHY",
          activeLeaseIds: [claim.lease!.id],
        },
        second.credential,
      ),
    ).toThrowError(WorkerAuthorizationError);
    env.database.close();
  });

  it("claims the highest-priority compatible Job and leaves CollectionRun pending", () => {
    const env = environment();
    const lowSource = env.sources.create(sourceInput({ name: "Low", slug: "low" }));
    const lowPlan = env.plans.create(
      planInput(lowSource.id, { name: "Low plan", priority: "LOW" }),
    );
    const low = env.runs.dispatchManual({ planId: lowPlan.plan.id });
    const criticalSource = env.sources.create(sourceInput({ name: "Critical", slug: "critical" }));
    const criticalPlan = env.plans.create(
      planInput(criticalSource.id, { name: "Critical plan", priority: "CRITICAL" }),
    );
    const critical = env.runs.dispatchManual({ planId: criticalPlan.plan.id });

    const worker = env.workers.create(workerInput());
    heartbeat(env, worker.view.worker.id, worker.credential);
    const claim = env.workers.claim(worker.view.worker.id, worker.credential);
    expect(claim.job?.id).toBe(critical.record.jobs[0]?.id);
    expect(claim.job?.status).toBe("LEASED");
    expect(claim.leaseToken).toMatch(/^mls_/);
    expect(env.runs.getById(critical.record.run.id)?.run.status).toBe("PENDING");
    expect(env.runs.getById(low.record.run.id)?.jobs[0]?.status).toBe("PENDING");
    expect(
      Number(
        (
          env.database
            .prepare("SELECT COUNT(*) AS count FROM job_leases WHERE status = 'ACTIVE'")
            .get() as { count: number }
        ).count,
      ),
    ).toBe(1);
    env.database.close();
  });

  it("returns an empty claim when no compatible work exists", () => {
    const env = environment();
    dispatchOne(env);
    const worker = env.workers.create(
      workerInput({
        supportedJobTypes: ["PAGE_UPDATE_CHECK"],
      }),
    );
    heartbeat(env, worker.view.worker.id, worker.credential);
    expect(env.workers.claim(worker.view.worker.id, worker.credential)).toEqual({
      job: null,
      lease: null,
      leaseToken: null,
    });
    env.database.close();
  });

  it("enforces maxConcurrency and one active lease per Job", () => {
    const env = environment();
    dispatchOne(env);
    const secondSource = env.sources.create(
      sourceInput({
        name: "Second source",
        slug: "second-source",
        canonicalUri: "https://www.wipo.int/pressroom/en/",
        entrypoints: [{ uri: "https://www.wipo.int/pressroom/en/" }],
      }),
    );
    const secondPlan = env.plans.create(planInput(secondSource.id, { name: "Second plan" }));
    env.runs.dispatchManual({ planId: secondPlan.plan.id });
    const first = env.workers.create(workerInput());
    const second = env.workers.create(workerInput({ displayName: "Second Worker" }));
    heartbeat(env, first.view.worker.id, first.credential);
    heartbeat(env, second.view.worker.id, second.credential);
    const firstClaim = env.workers.claim(first.view.worker.id, first.credential);
    expect(firstClaim.job).not.toBeNull();
    expect(() => env.workers.claim(first.view.worker.id, first.credential)).toThrowError(
      RegistryConflictError,
    );
    const secondClaim = env.workers.claim(second.view.worker.id, second.credential);
    expect(secondClaim.job?.id).not.toBe(firstClaim.job?.id);
    expect(
      Number(
        (
          env.database
            .prepare(
              `SELECT COUNT(*) AS count FROM job_leases
               WHERE job_id = ? AND status = 'ACTIVE'`,
            )
            .get(firstClaim.job!.id) as { count: number }
        ).count,
      ),
    ).toBe(1);
    env.database.close();
  });

  it("shares the default durable web-domain concurrency gate across Workers and www aliases", () => {
    const env = environment();
    const firstSource = env.sources.create(sourceInput());
    const firstPlan = env.plans.create(planInput(firstSource.id, { name: "First USPTO plan" }));
    env.runs.dispatchManual({ planId: firstPlan.plan.id });
    const aliasSource = env.sources.create(
      sourceInput({
        name: "USPTO Patents",
        slug: "uspto-patents",
        canonicalUri: "https://uspto.gov/patents",
        entrypoints: [{ uri: "https://uspto.gov/patents" }],
      }),
    );
    const aliasPlan = env.plans.create(planInput(aliasSource.id, { name: "Alias USPTO plan" }));
    env.runs.dispatchManual({ planId: aliasPlan.plan.id });
    const otherSource = env.sources.create(
      sourceInput({
        name: "WIPO News",
        slug: "wipo-news",
        canonicalUri: "https://www.wipo.int/pressroom/en/",
        entrypoints: [{ uri: "https://www.wipo.int/pressroom/en/" }],
      }),
    );
    const otherPlan = env.plans.create(planInput(otherSource.id, { name: "WIPO plan" }));
    env.runs.dispatchManual({ planId: otherPlan.plan.id });

    const firstWorker = env.workers.create(workerInput({ displayName: "Worker A" }));
    const secondWorker = env.workers.create(workerInput({ displayName: "Worker B" }));
    heartbeat(env, firstWorker.view.worker.id, firstWorker.credential);
    heartbeat(env, secondWorker.view.worker.id, secondWorker.credential);

    const firstClaim = env.workers.claim(firstWorker.view.worker.id, firstWorker.credential);
    expect(firstClaim.job?.sourceId).toBe(firstSource.id);
    const secondClaim = env.workers.claim(secondWorker.view.worker.id, secondWorker.credential);
    expect(secondClaim.job?.sourceId).toBe(otherSource.id);
    expect(env.runs.list({ sourceId: aliasSource.id }).items[0]?.jobs[0]?.status).toBe("PENDING");

    env.database.close();
  });

  it("enforces the strictest rolling per-minute web-domain rate limit across Workers", () => {
    const env = environment(new DatabaseSync(":memory:"), {
      maxConcurrentWebLeasesPerDomain: 10,
    });
    const locators = [
      ["Rate A", "rate-a", "https://www.uspto.gov/a", 2],
      ["Rate B", "rate-b", "https://uspto.gov/b", 2],
      ["Rate C", "rate-c", "https://www.uspto.gov/c", 100],
    ] as const;
    for (const [name, slug, locator, rateLimitPerMinute] of locators) {
      const source = env.sources.create(
        sourceInput({
          name,
          slug,
          canonicalUri: locator,
          entrypoints: [{ uri: locator }],
        }),
      );
      const plan = env.plans.create(
        planInput(source.id, {
          name: `${name} plan`,
          policy: {
            ...planInput(source.id).policy,
            rateLimitPerMinute,
          },
        }),
      );
      env.runs.dispatchManual({ planId: plan.plan.id });
    }

    const workers = ["Worker A", "Worker B", "Worker C"].map((displayName) =>
      env.workers.create(workerInput({ displayName })),
    );
    for (const worker of workers) {
      heartbeat(env, worker.view.worker.id, worker.credential);
    }

    expect(
      env.workers.claim(workers[0]!.view.worker.id, workers[0]!.credential).job,
    ).not.toBeNull();
    expect(
      env.workers.claim(workers[1]!.view.worker.id, workers[1]!.credential).job,
    ).not.toBeNull();
    expect(env.workers.claim(workers[2]!.view.worker.id, workers[2]!.credential).job).toBeNull();

    env.advance(60_001);
    heartbeat(env, workers[2]!.view.worker.id, workers[2]!.credential);
    expect(
      env.workers.claim(workers[2]!.view.worker.id, workers[2]!.credential).job,
    ).not.toBeNull();

    env.database.close();
  });

  it("applies the same domain governance to targeted exact-Job claims", () => {
    const env = environment(new DatabaseSync(":memory:"), {
      maxConcurrentWebLeasesPerDomain: 1,
      leaseDurationMs: 4_000,
    });
    const sameDomainJobs = ["a", "b"].map((suffix) => {
      const source = env.sources.create(
        sourceInput({
          name: `Same domain ${suffix}`,
          slug: `same-domain-${suffix}`,
          canonicalUri: `https://www.uspto.gov/${suffix}`,
          entrypoints: [{ uri: `https://www.uspto.gov/${suffix}` }],
        }),
      );
      const plan = env.plans.create(planInput(source.id, { name: `Same domain ${suffix} plan` }));
      return env.runs.dispatchManual({ planId: plan.plan.id }).record.jobs[0]!;
    });
    const otherSource = env.sources.create(
      sourceInput({
        name: "Other domain",
        slug: "other-domain",
        canonicalUri: "https://www.euipo.europa.eu/news",
        entrypoints: [{ uri: "https://www.euipo.europa.eu/news" }],
      }),
    );
    const otherPlan = env.plans.create(planInput(otherSource.id, { name: "Other domain plan" }));
    const otherJob = env.runs.dispatchManual({ planId: otherPlan.plan.id }).record.jobs[0]!;

    const firstWorker = env.workers.create(workerInput({ displayName: "Target Worker A" }));
    const secondWorker = env.workers.create(workerInput({ displayName: "Target Worker B" }));
    heartbeat(env, firstWorker.view.worker.id, firstWorker.credential);
    heartbeat(env, secondWorker.view.worker.id, secondWorker.credential);
    const options = {
      heartbeatFreshnessMs: 10_000,
      heartbeatClockSkewMs: 10_000,
      leaseDurationMs: 4_000,
      maxLeaseLifetimeMs: 10_000,
      maxConcurrentWebLeasesPerDomain: 1,
    };

    const first = claimSpecificJob(
      env.database,
      firstWorker.view.worker.id,
      firstWorker.credential,
      sameDomainJobs[0]!.id,
      env.clock,
      options,
    );
    expect(Date.parse(first.lease!.expiresAt) - Date.parse(first.lease!.acquiredAt)).toBe(4_000);
    expect(() =>
      claimSpecificJob(
        env.database,
        secondWorker.view.worker.id,
        secondWorker.credential,
        sameDomainJobs[1]!.id,
        env.clock,
        options,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "WEB_DOMAIN_CLAIM_QUOTA_EXCEEDED",
      }),
    );
    const other = claimSpecificJob(
      env.database,
      secondWorker.view.worker.id,
      secondWorker.credential,
      otherJob.id,
      env.clock,
      options,
    );
    expect(other.job?.sourceId).toBe(otherSource.id);
    env.database.close();
  });

  it("applies the strictest rolling domain rate limit to targeted claims", () => {
    const env = environment(new DatabaseSync(":memory:"), {
      maxConcurrentWebLeasesPerDomain: 10,
      leaseDurationMs: 2_000,
    });
    const jobs = ["rate-target-a", "rate-target-b", "rate-target-c"].map((slug, index) => {
      const source = env.sources.create(
        sourceInput({
          name: `Target rate ${index + 1}`,
          slug,
          canonicalUri: `https://www.uspto.gov/target-rate-${index + 1}`,
          entrypoints: [{ uri: `https://www.uspto.gov/target-rate-${index + 1}` }],
        }),
      );
      const plan = env.plans.create(
        planInput(source.id, {
          name: `Target rate ${index + 1} plan`,
          policy: { ...planInput(source.id).policy, rateLimitPerMinute: 2 },
        }),
      );
      return env.runs.dispatchManual({ planId: plan.plan.id }).record.jobs[0]!;
    });
    const workers = ["Rate Target A", "Rate Target B", "Rate Target C"].map((displayName) =>
      env.workers.create(workerInput({ displayName })),
    );
    for (const worker of workers) heartbeat(env, worker.view.worker.id, worker.credential);
    const options = {
      heartbeatFreshnessMs: 10_000,
      heartbeatClockSkewMs: 10_000,
      leaseDurationMs: 2_000,
      maxLeaseLifetimeMs: 10_000,
      maxConcurrentWebLeasesPerDomain: 10,
    };

    for (const index of [0, 1]) {
      expect(
        claimSpecificJob(
          env.database,
          workers[index]!.view.worker.id,
          workers[index]!.credential,
          jobs[index]!.id,
          env.clock,
          options,
        ).job,
      ).not.toBeNull();
    }
    expect(() =>
      claimSpecificJob(
        env.database,
        workers[2]!.view.worker.id,
        workers[2]!.credential,
        jobs[2]!.id,
        env.clock,
        options,
      ),
    ).toThrowError(expect.objectContaining({ code: "WEB_DOMAIN_CLAIM_QUOTA_EXCEEDED" }));

    env.advance(60_001);
    heartbeat(env, workers[2]!.view.worker.id, workers[2]!.credential);
    expect(
      claimSpecificJob(
        env.database,
        workers[2]!.view.worker.id,
        workers[2]!.credential,
        jobs[2]!.id,
        env.clock,
        options,
      ).job,
    ).not.toBeNull();
    env.database.close();
  });

  it("renews and releases only with owning credential and lease token", () => {
    const env = environment();
    dispatchOne(env);
    const worker = env.workers.create(workerInput());
    heartbeat(env, worker.view.worker.id, worker.credential);
    const claim = env.workers.claim(worker.view.worker.id, worker.credential);
    env.advance(1_000);
    const renewed = env.workers.renewLease(
      worker.view.worker.id,
      worker.credential,
      claim.lease!.id,
      claim.leaseToken!,
    );
    expect(Date.parse(renewed.expiresAt)).toBeGreaterThan(Date.parse(claim.lease!.expiresAt));
    expect(() =>
      env.workers.releaseLease(
        worker.view.worker.id,
        worker.credential,
        claim.lease!.id,
        "wrong-token",
      ),
    ).toThrowError(WorkerAuthenticationError);
    const released = env.workers.releaseLease(
      worker.view.worker.id,
      worker.credential,
      claim.lease!.id,
      claim.leaseToken!,
      "Testing complete",
    );
    expect(released.status).toBe("RELEASED");
    expect(env.runs.list().items[0]?.jobs[0]?.status).toBe("PENDING");
    env.database.close();
  });

  it("expires and reaps leases idempotently without creating retry attempts", () => {
    const env = environment();
    dispatchOne(env);
    const worker = env.workers.create(workerInput());
    heartbeat(env, worker.view.worker.id, worker.credential);
    env.workers.claim(worker.view.worker.id, worker.credential);
    env.advance(3_000);
    expect(env.workers.reapExpired()).toBe(1);
    expect(env.workers.reapExpired()).toBe(0);
    const record = env.runs.list().items[0]!;
    expect(record.jobs).toHaveLength(1);
    expect(record.jobs[0]?.attempt).toBe(1);
    expect(record.jobs[0]?.status).toBe("PENDING");
    expect(env.workers.listLeases({ status: "EXPIRED" }).total).toBe(1);
    env.database.close();
  });

  it("rejects draining, disabled, offline and error Workers from claims", () => {
    const env = environment();
    dispatchOne(env);
    const offline = env.workers.create(workerInput());
    expect(() => env.workers.claim(offline.view.worker.id, offline.credential)).toThrowError(
      RegistryConflictError,
    );

    const draining = env.workers.create(
      workerInput({ displayName: "Draining", desiredState: "DRAINING" }),
    );
    heartbeat(env, draining.view.worker.id, draining.credential);
    expect(() => env.workers.claim(draining.view.worker.id, draining.credential)).toThrowError(
      WorkerAuthorizationError,
    );

    const disabled = env.workers.create(
      workerInput({ displayName: "Disabled", desiredState: "DISABLED" }),
    );
    expect(() => env.workers.claim(disabled.view.worker.id, disabled.credential)).toThrowError(
      WorkerAuthorizationError,
    );

    const error = env.workers.create(workerInput({ displayName: "Error" }));
    heartbeat(env, error.view.worker.id, error.credential, "ERROR");
    expect(() => env.workers.claim(error.view.worker.id, error.credential)).toThrowError(
      RegistryConflictError,
    );
    env.database.close();
  });

  it("persists Workers, heartbeats and leases after reopen without execution output tables", () => {
    const path = join(tmpdir(), `markorbit-worker-${process.pid}-${Date.now()}.sqlite`);
    temporaryPaths.push(path, `${path}-shm`, `${path}-wal`);
    const firstDatabase = openRegistryDatabase(path);
    const first = environment(firstDatabase);
    dispatchOne(first);
    const worker = first.workers.create(workerInput());
    const heartbeatView = heartbeat(first, worker.view.worker.id, worker.credential);
    expect(isWorkerHeartbeat(heartbeatView.latestHeartbeat)).toBe(true);
    const claim = first.workers.claim(worker.view.worker.id, worker.credential);
    firstDatabase.close();

    const secondDatabase = openRegistryDatabase(path);
    const secondWorkers = new SqliteWorkerRegistryRepository(secondDatabase);
    expect(secondWorkers.getById(worker.view.worker.id)?.activeLeases[0]?.id).toBe(claim.lease?.id);
    const tableNames = secondDatabase
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String((row as { name: unknown }).name));
    expect(tableNames).not.toContain("raw_artifacts");
    expect(tableNames).not.toContain("connector_executions");
    expect(tableNames).not.toContain("scheduler_runs");
    secondDatabase.close();
  });
});
