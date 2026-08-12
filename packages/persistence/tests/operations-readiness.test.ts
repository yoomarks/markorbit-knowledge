import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, openRegistryDatabase } from "../src/index";
import {
  deriveOperationsReadinessIssues,
  deriveOperationsReadinessState,
  SqliteOperationsReadinessRepository,
  type OperationsReadinessMetrics,
} from "../src/operations-readiness";

const NOW = new Date("2026-08-12T00:00:00.000Z");
const OTHER_WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAA";

function emptyMetrics(): OperationsReadinessMetrics {
  return {
    sources: { total: 0, active: 0, error: 0 },
    workers: {
      total: 0,
      online: 0,
      busy: 0,
      draining: 0,
      offline: 0,
      disabled: 0,
      error: 0,
      activeLeases: 0,
      expiredLeases: 0,
    },
    collection: {
      runsTotal: 0,
      pendingRuns: 0,
      runningRuns: 0,
      failedRuns24h: 0,
      jobsPending: 0,
      jobsLeased: 0,
      jobsRunning: 0,
      jobsRetry: 0,
      jobsFailed24h: 0,
      jobsDeadLetter: 0,
    },
    conversion: {
      total: 0,
      pending: 0,
      running: 0,
      verifying: 0,
      completed: 0,
      failed24h: 0,
      stalled: 0,
    },
    scheduler: {
      activeAutomaticPlans: 0,
      initialized: 0,
      uninitialized: 0,
      errors: 0,
      overdue: 0,
    },
    readyPackages: { verified: 0, withoutSubmission: 0 },
    delivery: {
      total: 0,
      safeToSubmit: 0,
      outcomeUnknown: 0,
      localFinalizationRequired: 0,
      delivered: 0,
      consumerRejected: 0,
      evidenceInconsistent: 0,
    },
  };
}

function insertJob(
  database: ReturnType<typeof openRegistryDatabase>,
  input: { id: string; workspaceId: string; status: string; updatedAt: string },
) {
  database
    .prepare(
      `INSERT INTO jobs
       (id, run_id, workspace_id, source_id, plan_id, connector_id, connector_version,
        job_type, status, attempt, available_at, document_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      `run_${input.id.slice(4)}`,
      input.workspaceId,
      "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "test-connector",
      "1.0.0",
      "WEB_CRAWL",
      input.status,
      1,
      input.updatedAt,
      "{}",
      input.updatedAt,
      input.updatedAt,
    );
}

describe("Operations Readiness", () => {
  it("reports an empty Workspace as operationally READY", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteOperationsReadinessRepository(database, () => NOW);

    const snapshot = repository.inspect(DEFAULT_WORKSPACE.id);

    expect(snapshot.state).toBe("READY");
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.metrics.sources.total).toBe(0);
    expect(snapshot.metrics.workers.total).toBe(0);
    expect(snapshot.metrics.delivery.total).toBe(0);
    database.close();
  });

  it("keeps explicit operator actions separate from degraded system health", () => {
    const metrics = emptyMetrics();
    metrics.readyPackages.verified = 2;
    metrics.readyPackages.withoutSubmission = 2;
    metrics.delivery.total = 1;
    metrics.delivery.safeToSubmit = 1;
    metrics.delivery.localFinalizationRequired = 1;

    const issues = deriveOperationsReadinessIssues(metrics);

    expect(issues.map((item) => item.severity)).toEqual(["ACTION", "ACTION", "ACTION"]);
    expect(deriveOperationsReadinessState(issues)).toBe("READY");
  });

  it("uses a 24-hour failure window instead of permanently degrading on historical failures", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteOperationsReadinessRepository(database, () => NOW);
    database.exec("PRAGMA foreign_keys = OFF;");

    insertJob(database, {
      id: "job_01ARZ3NDEKTSV4RRFFQ69G5FAB",
      workspaceId: DEFAULT_WORKSPACE.id,
      status: "FAILED",
      updatedAt: "2026-08-10T00:00:00.000Z",
    });
    insertJob(database, {
      id: "job_01ARZ3NDEKTSV4RRFFQ69G5FAC",
      workspaceId: DEFAULT_WORKSPACE.id,
      status: "FAILED",
      updatedAt: "2026-08-11T23:00:00.000Z",
    });

    const snapshot = repository.inspect(DEFAULT_WORKSPACE.id);

    expect(snapshot.metrics.collection.jobsFailed24h).toBe(1);
    expect(snapshot.state).toBe("DEGRADED");
    expect(snapshot.issues.map((item) => item.code)).toContain("RECENT_COLLECTION_FAILURES");
    database.close();
  });

  it("blocks a collection backlog when configured ACTIVE Workers have no fresh heartbeat", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteOperationsReadinessRepository(database, () => NOW);
    database.exec("PRAGMA foreign_keys = OFF;");
    database
      .prepare(
        `INSERT INTO worker_definitions
         (id, workspace_id, display_name, desired_state, runtime_id, runtime_version,
          job_types_json, bindings_json, labels_json, max_concurrency, document_json,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        DEFAULT_WORKSPACE.id,
        "Offline test worker",
        "ACTIVE",
        "test-runtime",
        "1.0.0",
        "[]",
        "[]",
        "[]",
        1,
        "{}",
        NOW.toISOString(),
        NOW.toISOString(),
      );
    insertJob(database, {
      id: "job_01ARZ3NDEKTSV4RRFFQ69G5FAD",
      workspaceId: DEFAULT_WORKSPACE.id,
      status: "PENDING",
      updatedAt: NOW.toISOString(),
    });

    const snapshot = repository.inspect(DEFAULT_WORKSPACE.id);

    expect(snapshot.metrics.workers.offline).toBe(1);
    expect(snapshot.metrics.collection.jobsPending).toBe(1);
    expect(snapshot.state).toBe("BLOCKED");
    expect(snapshot.issues[0]?.code).toBe("COLLECTION_BACKLOG_NO_WORKER");
    database.close();
  });

  it("fails closed on corrupt ReadyPackage V2 delivery evidence without leaking frozen data", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteOperationsReadinessRepository(database, () => NOW);
    database.exec("PRAGMA foreign_keys = OFF;");
    database
      .prepare(
        `INSERT INTO ready_package_v2_delivery_submissions
         (workspace_id, submission_id, ready_package_id, ready_package_digest, core_workspace_id,
          request_sha256, content_export_sha256, state, document_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        DEFAULT_WORKSPACE.id,
        "rvd_corrupt-evidence",
        "rdp_corrupt-evidence",
        "a".repeat(64),
        "11111111-1111-4111-8111-111111111111",
        "b".repeat(64),
        "c".repeat(64),
        "PENDING",
        JSON.stringify({ requestJson: "SHOULD_NOT_LEAK", idempotencyKey: "SHOULD_NOT_LEAK" }),
        NOW.toISOString(),
        NOW.toISOString(),
      );

    const snapshot = repository.inspect(DEFAULT_WORKSPACE.id);
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.state).toBe("BLOCKED");
    expect(snapshot.metrics.delivery.evidenceInconsistent).toBe(1);
    expect(snapshot.issues[0]?.code).toBe("DELIVERY_EVIDENCE_INCONSISTENT");
    expect(serialized).not.toContain("SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("requestJson");
    expect(serialized).not.toContain("idempotencyKey");
    database.close();
  });

  it("keeps all operational counts Workspace-scoped", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteOperationsReadinessRepository(database, () => NOW);
    database.exec("PRAGMA foreign_keys = OFF;");
    insertJob(database, {
      id: "job_01ARZ3NDEKTSV4RRFFQ69G5FAE",
      workspaceId: OTHER_WORKSPACE,
      status: "PENDING",
      updatedAt: NOW.toISOString(),
    });

    const snapshot = repository.inspect(DEFAULT_WORKSPACE.id);

    expect(snapshot.metrics.collection.jobsPending).toBe(0);
    expect(snapshot.state).toBe("READY");
    database.close();
  });
});
