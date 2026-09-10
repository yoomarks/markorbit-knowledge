import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CollectionPlan } from "@markorbit/contracts";
import type { CollectionPlanRepository } from "../src/collection-plan-registry";
import {
  applyAdaptiveRecrawlCadenceForCompletedJob,
  recommendAdaptiveRecrawlCadence,
} from "../src/adaptive-recrawl-cadence";

const planId = "pln_adaptive";
const sourceId = "src_adaptive";
const observedAt = new Date("2026-09-10T12:00:00.000Z");

function plan(adaptive = true, intervalSeconds = 86_400): CollectionPlan {
  return {
    schemaVersion: "1.0",
    objectType: "COLLECTION_PLAN",
    id: planId,
    workspaceId: "wsp_test",
    sourceId,
    name: "Adaptive refresh",
    status: "ACTIVE",
    schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: intervalSeconds },
    priority: "HIGH",
    policy: {
      includePatterns: ["https://example.test/*"],
      excludePatterns: [],
      maxDepth: 1,
      maxItems: 10,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 12,
      timeoutSeconds: 60,
      retry: { maxAttempts: 2, backoffSeconds: 10 },
      locale: "en",
    },
    output: { artifactKinds: ["MARKDOWN"] },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-10T11:00:00.000Z",
    extensions: {
      "x-markorbit-adaptive-refresh-cadence": adaptive,
      "x-markorbit-source-class": "OFFICIAL_AUTHORITY",
    },
  };
}

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      document_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE execution_attempts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_at TEXT,
      document_json TEXT NOT NULL
    ) STRICT;
  `);
  return db;
}

function insertEvidence(
  db: DatabaseSync,
  count: number,
  metadataOnlyCount: number,
  sourceClass: "OFFICIAL_AUTHORITY" | "PEER_PROFESSIONAL" = "OFFICIAL_AUTHORITY",
): string {
  let completedJob = "";
  for (let index = 0; index < count; index += 1) {
    const jobId = `job_${index}`;
    completedJob = jobId;
    db.prepare("INSERT INTO jobs (id, plan_id, document_json) VALUES (?, ?, ?)").run(
      jobId,
      planId,
      JSON.stringify({
        planSnapshot: { schedule: { mode: "CHANGE_WATCH" } },
        sourceSnapshot: { extensions: { "x-markorbit-source-class": sourceClass } },
      }),
    );
    db.prepare(
      `INSERT INTO execution_attempts (id, job_id, status, completed_at, document_json)
       VALUES (?, ?, 'COMPLETED', ?, ?)`,
    ).run(
      `att_${index}`,
      jobId,
      new Date(observedAt.getTime() - (count - index) * 60_000).toISOString(),
      JSON.stringify({ receipt: { metadataOnly: index < metadataOnlyCount } }),
    );
  }
  return completedJob;
}

function fakeRepository(initial: CollectionPlan) {
  let current = initial;
  const updates: Array<{ input: Record<string, unknown>; expectedUpdatedAt: string }> = [];
  const repository = {
    getById(id: string) {
      if (id !== current.id) return null;
      return { plan: current, source: {}, runtimeState: "NOT_SCHEDULED" };
    },
    update(id: string, input: Record<string, unknown>, expectedUpdatedAt: string) {
      updates.push({ input, expectedUpdatedAt });
      current = { ...current, ...input, updatedAt: observedAt.toISOString() } as CollectionPlan;
      return { plan: current, source: {}, runtimeState: "NOT_SCHEDULED" };
    },
  } as unknown as CollectionPlanRepository;
  return { repository, updates, current: () => current };
}
describe("adaptive recrawl cadence policy", () => {
  it("recommends faster or slower cadence within source-class bounds", () => {
    expect(
      recommendAdaptiveRecrawlCadence({
        sourceClass: "OFFICIAL_AUTHORITY",
        currentIntervalSeconds: 86_400,
        evidenceRuns: 6,
        metadataOnlyRuns: 0,
        observedAt,
      }),
    ).toMatchObject({ decision: "FASTER", recommendedIntervalSeconds: 43_200 });

    expect(
      recommendAdaptiveRecrawlCadence({
        sourceClass: "PEER_PROFESSIONAL",
        currentIntervalSeconds: 604_800,
        evidenceRuns: 12,
        metadataOnlyRuns: 12,
        observedAt,
      }),
    ).toMatchObject({ decision: "SLOWER", recommendedIntervalSeconds: 1_209_600 });
  });

  it("fails safe when evidence is insufficient", () => {
    const result = recommendAdaptiveRecrawlCadence({
      sourceClass: "OFFICIAL_AUTHORITY",
      currentIntervalSeconds: 86_400,
      evidenceRuns: 5,
      metadataOnlyRuns: 5,
      observedAt,
    });
    expect(result).toMatchObject({
      decision: "INSUFFICIENT_EVIDENCE",
      recommendedIntervalSeconds: 86_400,
      evidenceRuns: 5,
    });
  });

  it("uses cooldown hysteresis to prevent schedule thrash", () => {
    const result = recommendAdaptiveRecrawlCadence({
      sourceClass: "OFFICIAL_AUTHORITY",
      currentIntervalSeconds: 43_200,
      evidenceRuns: 12,
      metadataOnlyRuns: 12,
      observedAt: new Date("2026-09-11T12:00:00.000Z"),
      lastChangedAt: "2026-09-10T12:00:00.000Z",
      lastPreviousIntervalSeconds: 86_400,
    });
    expect(result).toMatchObject({
      decision: "COOLDOWN",
      recommendedIntervalSeconds: 43_200,
      cooldownUntil: "2026-09-13T12:00:00.000Z",
    });
  });

  it("does not override a non-adaptive cadence", () => {
    const db = database();
    const jobId = insertEvidence(db, 8, 8);
    const fake = fakeRepository(plan(false));
    const result = applyAdaptiveRecrawlCadenceForCompletedJob(
      db,
      fake.repository,
      jobId,
      observedAt,
    );
    expect(result.skipReason).toBe("DISABLED");
    expect(result.applied).toBe(false);
    expect(fake.updates).toHaveLength(0);
    db.close();
  });

  it("preserves the pre-change cadence anchor during cooldown-only evaluations", () => {
    const db = database();
    const jobId = insertEvidence(db, 8, 8);
    const cooledPlan = plan(true, 43_200);
    cooledPlan.extensions = {
      ...(cooledPlan.extensions ?? {}),
      "x-markorbit-adaptive-cadence-last-changed-at": "2026-09-10T00:00:00.000Z",
      "x-markorbit-adaptive-cadence-previous-seconds": 86_400,
      "x-markorbit-adaptive-cadence-current-seconds": 43_200,
    };
    const fake = fakeRepository(cooledPlan);

    const result = applyAdaptiveRecrawlCadenceForCompletedJob(
      db,
      fake.repository,
      jobId,
      observedAt,
    );

    expect(result).toMatchObject({ decision: "COOLDOWN", applied: false });
    expect(fake.current().extensions).toMatchObject({
      "x-markorbit-adaptive-cadence-previous-seconds": 86_400,
      "x-markorbit-adaptive-cadence-current-seconds": 43_200,
    });
    db.close();
  });

  it("applies a bounded decision and records explanatory extensions", () => {
    const db = database();
    const jobId = insertEvidence(db, 8, 8);
    const fake = fakeRepository(plan(true));
    const result = applyAdaptiveRecrawlCadenceForCompletedJob(
      db,
      fake.repository,
      jobId,
      observedAt,
    );

    expect(result).toMatchObject({
      sourceClass: "OFFICIAL_AUTHORITY",
      decision: "SLOWER",
      applied: true,
      evidenceRuns: 8,
      metadataOnlyRuns: 8,
      noChangeRatePercent: 100,
      recommendedIntervalSeconds: 172_800,
    });
    expect(fake.updates).toHaveLength(1);
    expect(fake.current().schedule).toEqual({
      mode: "CHANGE_WATCH",
      pollIntervalSeconds: 172_800,
    });
    expect(fake.current().extensions).toMatchObject({
      "x-markorbit-adaptive-refresh-cadence": true,
      "x-markorbit-adaptive-cadence-policy-version": "1.0",
      "x-markorbit-adaptive-cadence-last-decision": "SLOWER",
      "x-markorbit-adaptive-cadence-evidence-runs": 8,
      "x-markorbit-adaptive-cadence-no-change-rate-percent": 100,
      "x-markorbit-adaptive-cadence-previous-seconds": 86_400,
      "x-markorbit-adaptive-cadence-current-seconds": 172_800,
      "x-markorbit-adaptive-cadence-last-changed-at": observedAt.toISOString(),
    });
    db.close();
  });
});
