import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  isCollectionPlan,
  isSourceDefinition,
  type CollectionPlan,
  type CollectionRunStatus,
  type ScheduleMode,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";

export type SourceCollectionHealthState =
  | "NEVER_RUN"
  | "COLLECTING"
  | "HEALTHY"
  | "RETRYING"
  | "FAILING"
  | "CANCELLED";

export type SourceCollectionAlertCode =
  | "COLLECTION_OVERDUE"
  | "FAILURE_STREAK"
  | "SCHEDULER_ERROR";

export type SourceCollectionAlert = {
  code: SourceCollectionAlertCode;
  severity: "WARNING" | "CRITICAL";
  sinceAt: string | null;
  message: string;
};

export type SourceCollectionHealth = {
  state: SourceCollectionHealthState;
  latestRunStatus: CollectionRunStatus | null;
  latestRunAt: string | null;
  latestSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  failedRuns: number;
  defaultPlanId: string | null;
  scheduleMode: ScheduleMode | null;
  expectedNextCollectionAt: string | null;
  staleSince: string | null;
  attentionRequired: boolean;
  alerts: SourceCollectionAlert[];
};

export type SourceCollectionHealthRow = {
  sourceId: string;
  status: CollectionRunStatus;
  updatedAt: string;
  retrying: boolean;
  jobFailureAt: string | null;
};

type PlanRuntimeContext = {
  plan: CollectionPlan;
  schedulerNextDueAt: string | null;
  schedulerErrorCode: string | null;
  schedulerErrorAt: string | null;
};

const HISTORY_LIMIT = 20;
const MAX_SOURCES = 100;
const CRON_OVERDUE_GRACE_SECONDS = 300;
const FAILURE_STREAK_ALERT_THRESHOLD = 2;

function emptyHealth(): SourceCollectionHealth {
  return {
    state: "NEVER_RUN",
    latestRunStatus: null,
    latestRunAt: null,
    latestSuccessAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
    failedRuns: 0,
    defaultPlanId: null,
    scheduleMode: null,
    expectedNextCollectionAt: null,
    staleSince: null,
    attentionRequired: false,
    alerts: [],
  };
}

export function summarizeSourceCollectionHealth(
  rows: SourceCollectionHealthRow[],
): SourceCollectionHealth {
  if (rows.length === 0) return emptyHealth();
  const latest = rows[0]!;
  let state: SourceCollectionHealthState;
  if (latest.retrying) state = "RETRYING";
  else if (latest.status === "FAILED") state = "FAILING";
  else if (latest.status === "COMPLETED") state = "HEALTHY";
  else if (latest.status === "CANCELLED") state = "CANCELLED";
  else state = "COLLECTING";

  let consecutiveFailures = 0;
  for (const row of rows) {
    if (row.status !== "FAILED") break;
    consecutiveFailures += 1;
  }
  const failedRuns = rows.filter((row) => row.status === "FAILED").length;
  const lastFailureAt =
    rows.find((row) => row.jobFailureAt !== null)?.jobFailureAt ??
    rows.find((row) => row.status === "FAILED")?.updatedAt ??
    null;
  const latestSuccessAt = rows.find((row) => row.status === "COMPLETED")?.updatedAt ?? null;

  return {
    state,
    latestRunStatus: latest.status,
    latestRunAt: latest.updatedAt,
    latestSuccessAt,
    lastFailureAt,
    consecutiveFailures,
    failedRuns,
    defaultPlanId: null,
    scheduleMode: null,
    expectedNextCollectionAt: null,
    staleSince: null,
    attentionRequired: false,
    alerts: [],
  };
}

function tableExists(database: DatabaseSync, tableName: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  );
}

function addSeconds(timestamp: string, seconds: number): string | null {
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value)) return null;
  return new Date(value + seconds * 1_000).toISOString();
}

function overdueGraceSeconds(intervalSeconds: number): number {
  return Math.max(60, Math.min(3_600, Math.ceil(intervalSeconds * 0.1)));
}

function intervalSeconds(plan: CollectionPlan): number | null {
  if (plan.schedule.mode === "INTERVAL") return plan.schedule.intervalSeconds;
  if (plan.schedule.mode === "CHANGE_WATCH") return plan.schedule.pollIntervalSeconds;
  return null;
}

function loadLatestSuccessfulRuns(
  database: DatabaseSync,
  sourceIds: string[],
): Map<string, string> {
  const placeholders = sourceIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `SELECT source_id AS sourceId, MAX(updated_at) AS latestSuccessAt
       FROM collection_runs
       WHERE source_id IN (${placeholders}) AND status = 'COMPLETED'
       GROUP BY source_id`,
    )
    .all(...(sourceIds as SQLInputValue[])) as Array<{
    sourceId: string;
    latestSuccessAt: string;
  }>;
  return new Map(rows.map((row) => [row.sourceId, row.latestSuccessAt]));
}

function loadPlanContexts(
  database: DatabaseSync,
  sourceIds: string[],
): Map<string, PlanRuntimeContext> {
  const placeholders = sourceIds.map(() => "?").join(", ");
  const sourceRows = database
    .prepare(
      `SELECT id, document_json AS documentJson
       FROM source_definitions
       WHERE id IN (${placeholders})`,
    )
    .all(...(sourceIds as SQLInputValue[])) as Array<{ id: string; documentJson: string }>;

  const planBySource = new Map<string, string>();
  for (const row of sourceRows) {
    const parsed = JSON.parse(row.documentJson) as unknown;
    if (!isSourceDefinition(parsed) || !parsed.defaultCollectionPlanId) continue;
    planBySource.set(row.id, parsed.defaultCollectionPlanId);
  }
  const planIds = [...new Set(planBySource.values())];
  if (planIds.length === 0) return new Map();

  const planPlaceholders = planIds.map(() => "?").join(", ");
  const planRows = database
    .prepare(
      `SELECT id, document_json AS documentJson
       FROM collection_plans
       WHERE id IN (${planPlaceholders})`,
    )
    .all(...(planIds as SQLInputValue[])) as Array<{ id: string; documentJson: string }>;
  const plans = new Map<string, CollectionPlan>();
  for (const row of planRows) {
    const parsed = JSON.parse(row.documentJson) as unknown;
    if (isCollectionPlan(parsed)) plans.set(row.id, parsed);
  }

  const scheduler = new Map<
    string,
    { nextDueAt: string | null; errorCode: string | null; errorAt: string | null }
  >();
  if (tableExists(database, "collection_schedule_states")) {
    const rows = database
      .prepare(
        `SELECT plan_id AS planId, next_due_at AS nextDueAt,
                last_error_code AS errorCode, last_error_at AS errorAt
         FROM collection_schedule_states
         WHERE plan_id IN (${planPlaceholders})`,
      )
      .all(...(planIds as SQLInputValue[])) as Array<{
      planId: string;
      nextDueAt: string | null;
      errorCode: string | null;
      errorAt: string | null;
    }>;
    for (const row of rows) scheduler.set(row.planId, row);
  }

  const result = new Map<string, PlanRuntimeContext>();
  for (const [sourceId, planId] of planBySource) {
    const plan = plans.get(planId);
    if (!plan || plan.status !== "ACTIVE") continue;
    const runtime = scheduler.get(plan.id);
    result.set(sourceId, {
      plan,
      schedulerNextDueAt: runtime?.nextDueAt ?? null,
      schedulerErrorCode: runtime?.errorCode ?? null,
      schedulerErrorAt: runtime?.errorAt ?? null,
    });
  }
  return result;
}

function enrichHealthWithOperations(
  health: SourceCollectionHealth,
  runtime: PlanRuntimeContext | undefined,
  latestSuccessAt: string | null,
  observedAt: Date,
): SourceCollectionHealth {
  const alerts: SourceCollectionAlert[] = [];
  if (health.consecutiveFailures >= FAILURE_STREAK_ALERT_THRESHOLD) {
    alerts.push({
      code: "FAILURE_STREAK",
      severity: health.consecutiveFailures >= 3 ? "CRITICAL" : "WARNING",
      sinceAt: health.lastFailureAt,
      message: `${health.consecutiveFailures} consecutive collection runs failed`,
    });
  }

  if (!runtime) {
    return {
      ...health,
      latestSuccessAt,
      attentionRequired: alerts.length > 0,
      alerts,
    };
  }

  const { plan } = runtime;
  let expectedNextCollectionAt: string | null = null;
  let staleSince: string | null = null;
  const seconds = intervalSeconds(plan);
  if (seconds !== null) {
    const anchor = latestSuccessAt ?? plan.createdAt;
    expectedNextCollectionAt = addSeconds(anchor, seconds);
    if (expectedNextCollectionAt) {
      staleSince = addSeconds(expectedNextCollectionAt, overdueGraceSeconds(seconds));
    }
  } else if (plan.schedule.mode === "CRON" && runtime.schedulerNextDueAt) {
    expectedNextCollectionAt = runtime.schedulerNextDueAt;
    staleSince = addSeconds(expectedNextCollectionAt, CRON_OVERDUE_GRACE_SECONDS);
  }

  const activelyRecovering = health.state === "COLLECTING" || health.state === "RETRYING";
  if (
    staleSince &&
    Date.parse(staleSince) < observedAt.getTime() &&
    !activelyRecovering
  ) {
    alerts.push({
      code: "COLLECTION_OVERDUE",
      severity: "WARNING",
      sinceAt: staleSince,
      message: "Collection is overdue for the active default plan",
    });
  }
  if (runtime.schedulerErrorCode) {
    alerts.push({
      code: "SCHEDULER_ERROR",
      severity: "CRITICAL",
      sinceAt: runtime.schedulerErrorAt,
      message: `Scheduler error: ${runtime.schedulerErrorCode}`,
    });
  }

  return {
    ...health,
    latestSuccessAt,
    defaultPlanId: plan.id,
    scheduleMode: plan.schedule.mode,
    expectedNextCollectionAt,
    staleSince,
    attentionRequired: alerts.length > 0,
    alerts,
  };
}

export function listSourceCollectionHealth(
  database: DatabaseSync,
  sourceIds: string[],
  historyLimit = HISTORY_LIMIT,
  observedAt: Date = new Date(),
): Record<string, SourceCollectionHealth> {
  const ids = [...new Set(sourceIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};
  if (ids.length > MAX_SOURCES) {
    throw new RegistryValidationError(`sourceIds must contain at most ${MAX_SOURCES} sources`);
  }
  if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > 100) {
    throw new RegistryValidationError("historyLimit must be an integer from 1 to 100");
  }
  if (Number.isNaN(observedAt.getTime())) {
    throw new RegistryValidationError("observedAt must be a valid Date");
  }

  const placeholders = ids.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `WITH ranked AS (
         SELECT r.id, r.source_id, r.status, r.updated_at,
                ROW_NUMBER() OVER (
                  PARTITION BY r.source_id
                  ORDER BY r.created_at DESC, r.id DESC
                ) AS row_number
         FROM collection_runs r
         WHERE r.source_id IN (${placeholders})
       )
       SELECT ranked.source_id AS sourceId,
              ranked.status,
              ranked.updated_at AS updatedAt,
              EXISTS(
                SELECT 1 FROM jobs j
                WHERE j.run_id = ranked.id
                  AND (j.status = 'RETRY' OR (j.attempt > 1 AND j.status IN ('PENDING', 'LEASED', 'RUNNING')))
              ) AS retrying,
              (
                SELECT MAX(j.updated_at) FROM jobs j
                WHERE j.run_id = ranked.id
                  AND j.status IN ('RETRY', 'FAILED', 'DEAD_LETTER')
              ) AS jobFailureAt
       FROM ranked
       WHERE ranked.row_number <= ?
       ORDER BY ranked.source_id ASC, ranked.row_number ASC`,
    )
    .all(...(ids as SQLInputValue[]), historyLimit) as Array<{
    sourceId: string;
    status: CollectionRunStatus;
    updatedAt: string;
    retrying: number;
    jobFailureAt: string | null;
  }>;

  const grouped = new Map<string, SourceCollectionHealthRow[]>();
  for (const id of ids) grouped.set(id, []);
  for (const row of rows) {
    grouped.get(row.sourceId)?.push({ ...row, retrying: row.retrying === 1 });
  }

  const latestSuccessfulRuns = loadLatestSuccessfulRuns(database, ids);
  const planContexts = loadPlanContexts(database, ids);
  return Object.fromEntries(
    ids.map((id) => {
      const health = summarizeSourceCollectionHealth(grouped.get(id) ?? []);
      return [
        id,
        enrichHealthWithOperations(
          health,
          planContexts.get(id),
          latestSuccessfulRuns.get(id) ?? health.latestSuccessAt,
          observedAt,
        ),
      ];
    }),
  );
}
