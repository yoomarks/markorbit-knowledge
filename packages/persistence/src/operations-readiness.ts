import { DatabaseSync } from "node:sqlite";
import { ensureCollectionScheduler } from "./collection-scheduler";
import { ensureConversionRunLedger } from "./conversion-run-ledger";
import { ensureExecutionLedger } from "./execution-ledger";
import { initializeRegistry, RegistryValidationError } from "./index";
import { diagnoseReadyPackageV2Delivery } from "./ready-package-v2-delivery-reconciliation";
import {
  ensureReadyPackageV2DeliverySubmissionRegistry,
  SqliteReadyPackageV2DeliverySubmissionRepository,
} from "./ready-package-v2-delivery-submission";
import {
  DEFAULT_HEARTBEAT_FRESHNESS_MS,
  ensureWorkerRegistry,
} from "./worker-registry";

export const OPERATIONS_READINESS_STATES = ["READY", "DEGRADED", "BLOCKED"] as const;
export type OperationsReadinessState = (typeof OPERATIONS_READINESS_STATES)[number];

export const OPERATIONS_ISSUE_SEVERITIES = ["ACTION", "DEGRADED", "BLOCKED"] as const;
export type OperationsIssueSeverity = (typeof OPERATIONS_ISSUE_SEVERITIES)[number];

export const OPERATIONS_FAILURE_LOOKBACK_MS = 24 * 60 * 60 * 1_000;
export const OPERATIONS_CONVERSION_STALL_MS = 30 * 60 * 1_000;
export const OPERATIONS_SCHEDULER_OVERDUE_MS = 5 * 60 * 1_000;

export type OperationsReadinessIssue = {
  code: string;
  severity: OperationsIssueSeverity;
  count: number;
  message: string;
  recommendedAction: string;
  href: string;
};

export type OperationsSourceMetrics = {
  total: number;
  active: number;
  error: number;
};

export type OperationsWorkerMetrics = {
  total: number;
  online: number;
  busy: number;
  draining: number;
  offline: number;
  disabled: number;
  error: number;
  activeLeases: number;
  expiredLeases: number;
};

export type OperationsCollectionMetrics = {
  runsTotal: number;
  pendingRuns: number;
  runningRuns: number;
  failedRuns24h: number;
  jobsPending: number;
  jobsLeased: number;
  jobsRunning: number;
  jobsRetry: number;
  jobsFailed24h: number;
  jobsDeadLetter: number;
};

export type OperationsConversionMetrics = {
  total: number;
  pending: number;
  running: number;
  verifying: number;
  completed: number;
  failed24h: number;
  stalled: number;
};

export type OperationsSchedulerMetrics = {
  activeAutomaticPlans: number;
  initialized: number;
  uninitialized: number;
  errors: number;
  overdue: number;
};

export type OperationsReadyPackageMetrics = {
  verified: number;
  withoutSubmission: number;
};

export type OperationsDeliveryMetrics = {
  total: number;
  safeToSubmit: number;
  outcomeUnknown: number;
  localFinalizationRequired: number;
  delivered: number;
  consumerRejected: number;
  evidenceInconsistent: number;
};

export type OperationsReadinessMetrics = {
  sources: OperationsSourceMetrics;
  workers: OperationsWorkerMetrics;
  collection: OperationsCollectionMetrics;
  conversion: OperationsConversionMetrics;
  scheduler: OperationsSchedulerMetrics;
  readyPackages: OperationsReadyPackageMetrics;
  delivery: OperationsDeliveryMetrics;
};

export type OperationsReadinessSnapshot = {
  workspaceId: string;
  observedAt: string;
  state: OperationsReadinessState;
  metrics: OperationsReadinessMetrics;
  issues: OperationsReadinessIssue[];
};

type CountRow = { count: number };
type StatusCountRow = { status: string; count: number };
type SourceCountRow = { total: number; active: number; error: number };
type SchedulerCountRow = {
  total: number;
  initialized: number;
  errors: number;
  overdue: number;
};
type WorkerRow = {
  desired_state: string;
  max_concurrency: number;
  heartbeat_health: string | null;
  heartbeat_received_at: string | null;
  active_lease_count: number;
};
type DeliveryRow = {
  submission_id: string;
  ready_package_id: string;
};

function count(row: CountRow | undefined): number {
  return Number(row?.count ?? 0);
}

function statusCounts(rows: StatusCountRow[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
}

function totalStatuses(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

function issue(
  issues: OperationsReadinessIssue[],
  code: string,
  severity: OperationsIssueSeverity,
  countValue: number,
  message: string,
  recommendedAction: string,
  href: string,
): void {
  if (countValue <= 0) return;
  issues.push({
    code,
    severity,
    count: countValue,
    message,
    recommendedAction,
    href,
  });
}

function sourceMetrics(database: DatabaseSync, workspaceId: string): OperationsSourceMetrics {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END), 0) AS active,
              COALESCE(SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END), 0) AS error
       FROM source_definitions WHERE workspace_id = ?`,
    )
    .get(workspaceId) as SourceCountRow;
  return { total: Number(row.total), active: Number(row.active), error: Number(row.error) };
}

function workerMetrics(
  database: DatabaseSync,
  workspaceId: string,
  observedAt: Date,
): OperationsWorkerMetrics {
  const rows = database
    .prepare(
      `SELECT w.desired_state,
              w.max_concurrency,
              (SELECT h.health FROM worker_heartbeats h
               WHERE h.worker_id = w.id
               ORDER BY h.received_at DESC, h.id DESC LIMIT 1) AS heartbeat_health,
              (SELECT h.received_at FROM worker_heartbeats h
               WHERE h.worker_id = w.id
               ORDER BY h.received_at DESC, h.id DESC LIMIT 1) AS heartbeat_received_at,
              (SELECT COUNT(*) FROM job_leases l
               WHERE l.worker_id = w.id AND l.status = 'ACTIVE') AS active_lease_count
       FROM worker_definitions w
       WHERE w.workspace_id = ?`,
    )
    .all(workspaceId) as WorkerRow[];

  const metrics: OperationsWorkerMetrics = {
    total: rows.length,
    online: 0,
    busy: 0,
    draining: 0,
    offline: 0,
    disabled: 0,
    error: 0,
    activeLeases: 0,
    expiredLeases: 0,
  };

  for (const row of rows) {
    const activeLeases = Number(row.active_lease_count);
    metrics.activeLeases += activeLeases;
    if (row.desired_state === "DISABLED") {
      metrics.disabled += 1;
      continue;
    }
    if (row.desired_state === "DRAINING") {
      metrics.draining += 1;
      continue;
    }
    if (row.desired_state !== "ACTIVE") {
      metrics.error += 1;
      continue;
    }
    const heartbeatMs = row.heartbeat_received_at ? Date.parse(row.heartbeat_received_at) : Number.NaN;
    if (
      !Number.isFinite(heartbeatMs) ||
      observedAt.getTime() - heartbeatMs > DEFAULT_HEARTBEAT_FRESHNESS_MS
    ) {
      metrics.offline += 1;
      continue;
    }
    if (row.heartbeat_health === "ERROR" || row.heartbeat_health === null) {
      metrics.error += 1;
      continue;
    }
    if (activeLeases >= Number(row.max_concurrency)) metrics.busy += 1;
    else metrics.online += 1;
  }

  metrics.expiredLeases = count(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM job_leases l
         JOIN worker_definitions w ON w.id = l.worker_id
         WHERE w.workspace_id = ? AND l.status = 'EXPIRED'`,
      )
      .get(workspaceId) as CountRow,
  );
  return metrics;
}

function collectionMetrics(
  database: DatabaseSync,
  workspaceId: string,
  failureCutoff: string,
): OperationsCollectionMetrics {
  const runCounts = statusCounts(
    database
      .prepare(
        `SELECT status, COUNT(*) AS count FROM collection_runs
         WHERE workspace_id = ? GROUP BY status`,
      )
      .all(workspaceId) as StatusCountRow[],
  );
  const jobCounts = statusCounts(
    database
      .prepare(
        `SELECT status, COUNT(*) AS count FROM jobs
         WHERE workspace_id = ? GROUP BY status`,
      )
      .all(workspaceId) as StatusCountRow[],
  );
  const failedRuns24h = count(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM collection_runs
         WHERE workspace_id = ? AND status = 'FAILED' AND updated_at >= ?`,
      )
      .get(workspaceId, failureCutoff) as CountRow,
  );
  const failedJobs24h = count(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM jobs
         WHERE workspace_id = ? AND status = 'FAILED' AND updated_at >= ?`,
      )
      .get(workspaceId, failureCutoff) as CountRow,
  );
  return {
    runsTotal: totalStatuses(runCounts),
    pendingRuns: runCounts.PENDING ?? 0,
    runningRuns: runCounts.RUNNING ?? 0,
    failedRuns24h,
    jobsPending: jobCounts.PENDING ?? 0,
    jobsLeased: jobCounts.LEASED ?? 0,
    jobsRunning:
      (jobCounts.RUNNING ?? 0) + (jobCounts.UPLOADING ?? 0) + (jobCounts.VERIFYING ?? 0),
    jobsRetry: jobCounts.RETRY ?? 0,
    jobsFailed24h: failedJobs24h,
    jobsDeadLetter: jobCounts.DEAD_LETTER ?? 0,
  };
}

function conversionMetrics(
  database: DatabaseSync,
  workspaceId: string,
  failureCutoff: string,
  stallCutoff: string,
): OperationsConversionMetrics {
  const counts = statusCounts(
    database
      .prepare(
        `SELECT status, COUNT(*) AS count FROM conversion_runs
         WHERE workspace_id = ? GROUP BY status`,
      )
      .all(workspaceId) as StatusCountRow[],
  );
  const failed24h = count(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM conversion_runs
         WHERE workspace_id = ? AND status = 'FAILED' AND updated_at >= ?`,
      )
      .get(workspaceId, failureCutoff) as CountRow,
  );
  const stalled = count(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM conversion_runs
         WHERE workspace_id = ?
           AND status IN ('PENDING','RUNNING','VERIFYING')
           AND updated_at < ?`,
      )
      .get(workspaceId, stallCutoff) as CountRow,
  );
  return {
    total: totalStatuses(counts),
    pending: counts.PENDING ?? 0,
    running: counts.RUNNING ?? 0,
    verifying: counts.VERIFYING ?? 0,
    completed: counts.COMPLETED ?? 0,
    failed24h,
    stalled,
  };
}

function schedulerMetrics(
  database: DatabaseSync,
  workspaceId: string,
  overdueCutoff: string,
): OperationsSchedulerMetrics {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN s.plan_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS initialized,
              COALESCE(SUM(CASE WHEN s.last_error_code IS NOT NULL THEN 1 ELSE 0 END), 0) AS errors,
              COALESCE(SUM(CASE WHEN s.next_due_at IS NOT NULL AND s.next_due_at <= ? THEN 1 ELSE 0 END), 0) AS overdue
       FROM collection_plans p
       LEFT JOIN collection_schedule_states s ON s.plan_id = p.id
       WHERE p.workspace_id = ? AND p.status = 'ACTIVE' AND p.schedule_mode <> 'MANUAL'`,
    )
    .get(overdueCutoff, workspaceId) as SchedulerCountRow;
  const total = Number(row.total);
  const initialized = Number(row.initialized);
  return {
    activeAutomaticPlans: total,
    initialized,
    uninitialized: Math.max(0, total - initialized),
    errors: Number(row.errors),
    overdue: Number(row.overdue),
  };
}

function readyPackageMetrics(
  database: DatabaseSync,
  workspaceId: string,
): OperationsReadyPackageMetrics {
  const verified = count(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM ready_packages_v2
         WHERE workspace_id = ? AND status = 'VERIFIED'`,
      )
      .get(workspaceId) as CountRow,
  );
  const withoutSubmission = count(
    database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM ready_packages_v2 p
         LEFT JOIN ready_package_v2_delivery_submissions d
           ON d.workspace_id = p.workspace_id AND d.ready_package_id = p.id
         WHERE p.workspace_id = ? AND p.status = 'VERIFIED' AND d.submission_id IS NULL`,
      )
      .get(workspaceId) as CountRow,
  );
  return { verified, withoutSubmission };
}

function deliveryMetrics(
  database: DatabaseSync,
  workspaceId: string,
): OperationsDeliveryMetrics {
  const result: OperationsDeliveryMetrics = {
    total: 0,
    safeToSubmit: 0,
    outcomeUnknown: 0,
    localFinalizationRequired: 0,
    delivered: 0,
    consumerRejected: 0,
    evidenceInconsistent: 0,
  };
  const repository = new SqliteReadyPackageV2DeliverySubmissionRepository(database);
  const rows = database
    .prepare(
      `SELECT submission_id, ready_package_id
       FROM ready_package_v2_delivery_submissions
       WHERE workspace_id = ? ORDER BY created_at ASC, submission_id ASC`,
    )
    .all(workspaceId) as DeliveryRow[];
  result.total = rows.length;

  for (const row of rows) {
    try {
      const submission = repository.getByReadyPackage(workspaceId, row.ready_package_id);
      if (!submission || submission.submissionId !== row.submission_id) {
        result.evidenceInconsistent += 1;
        continue;
      }
      const diagnosis = diagnoseReadyPackageV2Delivery(
        submission,
        repository.listAuditEvents(workspaceId, submission.submissionId, 200),
      );
      switch (diagnosis.state) {
        case "SAFE_TO_SUBMIT":
          result.safeToSubmit += 1;
          break;
        case "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST":
          result.outcomeUnknown += 1;
          break;
        case "LOCAL_FINALIZATION_REQUIRED":
          result.localFinalizationRequired += 1;
          break;
        case "DELIVERED":
          result.delivered += 1;
          break;
        case "CONSUMER_REJECTED":
          result.consumerRejected += 1;
          break;
        case "EVIDENCE_INCONSISTENT":
          result.evidenceInconsistent += 1;
          break;
      }
    } catch {
      // Operations readiness must fail closed on corrupt persisted delivery evidence,
      // without leaking the malformed document or frozen request into the snapshot.
      result.evidenceInconsistent += 1;
    }
  }
  return result;
}

export function deriveOperationsReadinessIssues(
  metrics: OperationsReadinessMetrics,
): OperationsReadinessIssue[] {
  const issues: OperationsReadinessIssue[] = [];
  const availableWorkers = metrics.workers.online + metrics.workers.busy;
  const collectionBacklog = metrics.collection.jobsPending + metrics.collection.jobsRetry;

  issue(
    issues,
    "DELIVERY_EVIDENCE_INCONSISTENT",
    "BLOCKED",
    metrics.delivery.evidenceInconsistent,
    "ReadyPackage V2 delivery evidence is inconsistent and must not be retried or finalized automatically.",
    "Review the frozen delivery evidence and audit timeline before any network action.",
    "/packages",
  );
  issue(
    issues,
    "DEAD_LETTER_JOBS",
    "BLOCKED",
    metrics.collection.jobsDeadLetter,
    "Collection jobs are in DEAD_LETTER and require explicit operator review.",
    "Inspect the failed jobs and decide whether to create a controlled retry.",
    "/runs",
  );
  if (collectionBacklog > 0 && availableWorkers === 0) {
    issue(
      issues,
      "COLLECTION_BACKLOG_NO_WORKER",
      "BLOCKED",
      collectionBacklog,
      "Collection work is waiting but no ONLINE or BUSY Worker is available in the Workspace.",
      "Restore an ACTIVE Worker heartbeat or explicitly reconfigure Worker capacity.",
      "/workers",
    );
  }

  issue(
    issues,
    "SOURCE_ERRORS",
    "DEGRADED",
    metrics.sources.error,
    "Sources are currently marked ERROR.",
    "Inspect the affected Source definitions before relying on new collection results.",
    "/sources",
  );
  issue(
    issues,
    "WORKER_ERRORS",
    "DEGRADED",
    metrics.workers.error,
    "Workers are currently reporting an error state or invalid runtime health.",
    "Inspect Worker diagnostics and restore a healthy heartbeat before new claims.",
    "/workers",
  );
  issue(
    issues,
    "WORKERS_OFFLINE",
    "DEGRADED",
    metrics.workers.offline,
    "ACTIVE Workers have no fresh heartbeat.",
    "Restart or reconnect the affected Worker runtime, or disable it if it is intentionally retired.",
    "/workers",
  );
  issue(
    issues,
    "RECENT_COLLECTION_FAILURES",
    "DEGRADED",
    metrics.collection.failedRuns24h + metrics.collection.jobsFailed24h,
    "Collection runs or jobs failed during the last 24 hours.",
    "Inspect the execution ledger and retry only through the existing controlled boundaries.",
    "/runs",
  );
  issue(
    issues,
    "RECENT_CONVERSION_FAILURES",
    "DEGRADED",
    metrics.conversion.failed24h,
    "Conversion runs failed during the last 24 hours.",
    "Inspect ConversionRun evidence and converter/runtime diagnostics.",
    "/conversionRuns",
  );
  issue(
    issues,
    "STALLED_CONVERSIONS",
    "DEGRADED",
    metrics.conversion.stalled,
    "Conversion runs have remained non-terminal without an update for more than 30 minutes.",
    "Inspect the conversion runtime, lease state, and verification evidence before intervening.",
    "/conversionRuns",
  );
  issue(
    issues,
    "SCHEDULER_ERRORS",
    "DEGRADED",
    metrics.scheduler.errors,
    "Automatic CollectionPlans have durable scheduler errors.",
    "Inspect scheduler state and the affected plan/connector configuration.",
    "/jobs",
  );
  issue(
    issues,
    "SCHEDULER_OVERDUE",
    "DEGRADED",
    metrics.scheduler.overdue,
    "Automatic CollectionPlans are more than five minutes past their durable next-due slot.",
    "Verify Worker claim activity and scheduler state before manually dispatching work.",
    "/jobs",
  );
  issue(
    issues,
    "DELIVERY_OUTCOME_UNKNOWN",
    "DEGRADED",
    metrics.delivery.outcomeUnknown,
    "ReadyPackage V2 deliveries have an unknown transport outcome.",
    "Use only the existing exact-frozen-request retry action.",
    "/packages",
  );
  issue(
    issues,
    "DELIVERY_CONSUMER_REJECTED",
    "DEGRADED",
    metrics.delivery.consumerRejected,
    "ReadyPackage V2 deliveries were rejected by the consumer.",
    "Review the consumer rejection; do not silently rewrite or downgrade the V2 request.",
    "/packages",
  );

  issue(
    issues,
    "READY_PACKAGE_WITHOUT_SUBMISSION",
    "ACTION",
    metrics.readyPackages.withoutSubmission,
    "Verified ReadyPackage V2 objects have not yet been frozen into a delivery submission.",
    "Open Packages and explicitly prepare the intended Core delivery.",
    "/packages",
  );
  issue(
    issues,
    "DELIVERY_SAFE_TO_SUBMIT",
    "ACTION",
    metrics.delivery.safeToSubmit,
    "Frozen ReadyPackage V2 deliveries are safe to submit and have not started transport.",
    "Submit the already-frozen request through the explicit delivery action.",
    "/packages",
  );
  issue(
    issues,
    "DELIVERY_LOCAL_FINALIZATION_REQUIRED",
    "ACTION",
    metrics.delivery.localFinalizationRequired,
    "Consumer results are durable but local delivery finalization is still required.",
    "Finalize locally without another network request.",
    "/packages",
  );

  const order: Record<OperationsIssueSeverity, number> = {
    BLOCKED: 0,
    DEGRADED: 1,
    ACTION: 2,
  };
  return issues.sort(
    (left, right) => order[left.severity] - order[right.severity] || left.code.localeCompare(right.code),
  );
}

export function deriveOperationsReadinessState(
  issues: readonly OperationsReadinessIssue[],
): OperationsReadinessState {
  if (issues.some((item) => item.severity === "BLOCKED")) return "BLOCKED";
  if (issues.some((item) => item.severity === "DEGRADED")) return "DEGRADED";
  return "READY";
}

export class SqliteOperationsReadinessRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    initializeRegistry(database);
    ensureExecutionLedger(database);
    ensureWorkerRegistry(database);
    ensureConversionRunLedger(database);
    ensureCollectionScheduler(database);
    ensureReadyPackageV2DeliverySubmissionRegistry(database);
  }

  inspect(workspaceIdValue: string): OperationsReadinessSnapshot {
    const workspaceId = workspaceIdValue.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    const observedAt = this.clock();
    if (Number.isNaN(observedAt.getTime())) {
      throw new RegistryValidationError("Operations readiness clock returned an invalid Date");
    }
    const failureCutoff = new Date(
      observedAt.getTime() - OPERATIONS_FAILURE_LOOKBACK_MS,
    ).toISOString();
    const stallCutoff = new Date(
      observedAt.getTime() - OPERATIONS_CONVERSION_STALL_MS,
    ).toISOString();
    const overdueCutoff = new Date(
      observedAt.getTime() - OPERATIONS_SCHEDULER_OVERDUE_MS,
    ).toISOString();

    const metrics: OperationsReadinessMetrics = {
      sources: sourceMetrics(this.database, workspaceId),
      workers: workerMetrics(this.database, workspaceId, observedAt),
      collection: collectionMetrics(this.database, workspaceId, failureCutoff),
      conversion: conversionMetrics(this.database, workspaceId, failureCutoff, stallCutoff),
      scheduler: schedulerMetrics(this.database, workspaceId, overdueCutoff),
      readyPackages: readyPackageMetrics(this.database, workspaceId),
      delivery: deliveryMetrics(this.database, workspaceId),
    };
    const issues = deriveOperationsReadinessIssues(metrics);
    return {
      workspaceId,
      observedAt: observedAt.toISOString(),
      state: deriveOperationsReadinessState(issues),
      metrics,
      issues,
    };
  }
}
