import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  EXECUTION_CONTRACT_VERSION,
  isCollectionPlan,
  isCollectionRun,
  isConnectorManifest,
  isJob,
  isSourceDefinition,
  type CollectionPlan,
  type CollectionRun,
  type CollectionSchedule,
  type ConnectorManifest,
  type Job,
  type SourceDefinition,
} from "@markorbit/contracts";
import {
  deriveCollectionJobType,
  ensureExecutionLedger,
  generateCollectionRunId,
  generateJobId,
} from "./execution-ledger";
import {
  RegistryConflictError,
  RegistryError,
  RegistryNotFoundError,
  RegistryValidationError,
} from "./index";

const MIGRATION_ID = "0018_collection_scheduler_runtime";
const DEFAULT_TICK_LIMIT = 50;
const MAX_TICK_LIMIT = 250;
const MAX_CRON_LOOKAHEAD_MINUTES = 367 * 24 * 60;
const SYSTEM_ACTOR_ID = "collection-scheduler";

export const COLLECTION_SCHEDULER_RUNTIME_STATES = [
  "NOT_SCHEDULED",
  "PAUSED",
  "SCHEDULED",
  "ERROR",
] as const;
export type CollectionSchedulerRuntimeState = (typeof COLLECTION_SCHEDULER_RUNTIME_STATES)[number];

export type CollectionScheduleState = {
  planId: string;
  workspaceId: string;
  scheduleMode: CollectionSchedule["mode"];
  scheduleFingerprint: string;
  runtimeState: CollectionSchedulerRuntimeState;
  nextDueAt: string | null;
  lastSlotAt?: string;
  lastTriggeredAt?: string;
  lastRunId?: string;
  lastError?: {
    code: string;
    message: string;
    at: string;
  };
  updatedAt: string;
};

export type CollectionSchedulerTickItem = {
  planId: string;
  outcome: "INITIALIZED" | "NOT_DUE" | "DISPATCHED" | "REPLAYED" | "COALESCED" | "ERROR";
  nextDueAt: string | null;
  runId?: string;
  errorCode?: string;
};

export type CollectionSchedulerTickResult = {
  observedAt: string;
  examined: number;
  dispatched: number;
  replayed: number;
  coalesced: number;
  errors: number;
  items: CollectionSchedulerTickItem[];
};

export type CollectionSchedulerTickInput = {
  observedAt?: Date;
  limit?: number;
};

export interface CollectionSchedulerRepository {
  tick(input?: CollectionSchedulerTickInput): CollectionSchedulerTickResult;
  getState(planId: string): CollectionScheduleState;
  listStates(workspaceId?: string, limit?: number): CollectionScheduleState[];
}

type PersistedScheduleState = {
  planId: string;
  workspaceId: string;
  scheduleMode: Exclude<CollectionSchedule["mode"], "MANUAL">;
  scheduleFingerprint: string;
  nextDueAt: string | null;
  lastSlotAt: string | null;
  lastTriggeredAt: string | null;
  lastRunId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
  updatedAt: string;
};

type ScheduledDispatchResult = {
  run: CollectionRun;
  jobs: Job[];
  replayed: boolean;
  coalesced: boolean;
};

type CronField = {
  values: Set<number>;
  unrestricted: boolean;
};

type CronSpec = {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function schedulerConflict(code: string, message: string, details?: Record<string, unknown>) {
  return new RegistryConflictError(code, message, details);
}

function normalizedTickLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TICK_LIMIT;
  if (!Number.isInteger(value) || value <= 0) {
    throw new RegistryValidationError("Scheduler tick limit must be a positive integer");
  }
  return Math.min(value, MAX_TICK_LIMIT);
}

function isRfc3339(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function scheduleFingerprint(schedule: CollectionSchedule): string {
  return createHash("sha256").update(JSON.stringify(schedule)).digest("hex");
}

function parsePositiveSeconds(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw schedulerConflict(
      "SCHEDULER_INVALID_INTERVAL",
      `${field} must be a positive safe integer`,
    );
  }
  const milliseconds = value * 1_000;
  if (!Number.isSafeInteger(milliseconds)) {
    throw schedulerConflict("SCHEDULER_INVALID_INTERVAL", `${field} is too large`);
  }
  return milliseconds;
}

function parseInteger(value: string, field: string): number {
  if (!/^\d+$/.test(value)) {
    throw schedulerConflict("SCHEDULER_INVALID_CRON", `${field} contains a non-integer value`);
  }
  return Number(value);
}

function cronField(
  expression: string,
  minimum: number,
  maximum: number,
  field: string,
  normalize: (value: number) => number = (value) => value,
): CronField {
  const source = expression.trim();
  if (!source) {
    throw schedulerConflict("SCHEDULER_INVALID_CRON", `${field} cron field is empty`);
  }
  const values = new Set<number>();
  for (const segment of source.split(",")) {
    if (!segment) {
      throw schedulerConflict("SCHEDULER_INVALID_CRON", `${field} contains an empty segment`);
    }
    const slashParts = segment.split("/");
    if (slashParts.length > 2) {
      throw schedulerConflict("SCHEDULER_INVALID_CRON", `${field} has an invalid step`);
    }
    const base = slashParts[0] ?? "";
    const step = slashParts.length === 2 ? parseInteger(slashParts[1] ?? "", field) : 1;
    if (step <= 0) {
      throw schedulerConflict("SCHEDULER_INVALID_CRON", `${field} step must be positive`);
    }

    let start: number;
    let end: number;
    if (base === "*") {
      start = minimum;
      end = maximum;
    } else if (base.includes("-")) {
      const range = base.split("-");
      if (range.length !== 2) {
        throw schedulerConflict("SCHEDULER_INVALID_CRON", `${field} has an invalid range`);
      }
      start = parseInteger(range[0] ?? "", field);
      end = parseInteger(range[1] ?? "", field);
    } else {
      start = parseInteger(base, field);
      end = slashParts.length === 2 ? maximum : start;
    }

    if (start < minimum || start > maximum || end < minimum || end > maximum || start > end) {
      throw schedulerConflict(
        "SCHEDULER_INVALID_CRON",
        `${field} must stay within ${minimum}-${maximum}`,
      );
    }
    for (let value = start; value <= end; value += step) values.add(normalize(value));
  }

  const normalizedDomain = new Set<number>();
  for (let value = minimum; value <= maximum; value += 1) normalizedDomain.add(normalize(value));
  return { values, unrestricted: values.size === normalizedDomain.size };
}

function parseCron(expression: string): CronSpec {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw schedulerConflict(
      "SCHEDULER_INVALID_CRON",
      "Cron expression must contain exactly five fields: minute hour day-of-month month day-of-week",
    );
  }
  return {
    minute: cronField(fields[0]!, 0, 59, "minute"),
    hour: cronField(fields[1]!, 0, 23, "hour"),
    dayOfMonth: cronField(fields[2]!, 1, 31, "day-of-month"),
    month: cronField(fields[3]!, 1, 12, "month"),
    dayOfWeek: cronField(fields[4]!, 0, 7, "day-of-week", (value) => (value === 7 ? 0 : value)),
  };
}

function timezoneFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw schedulerConflict("SCHEDULER_INVALID_TIMEZONE", `Unknown cron timezone ${timezone}`);
  }
}

function localParts(formatter: Intl.DateTimeFormat, date: Date) {
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hourValue = Number(parts.hour);
  const hour = hourValue === 24 ? 0 : hourValue;
  const minute = Number(parts.minute);
  if ([year, month, day, hour, minute].some((value) => !Number.isInteger(value))) {
    throw schedulerConflict(
      "SCHEDULER_TIMEZONE_FORMAT_ERROR",
      "Unable to resolve cron timezone parts",
    );
  }
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, dayOfWeek };
}

function cronMatches(spec: CronSpec, parts: ReturnType<typeof localParts>): boolean {
  if (!spec.minute.values.has(parts.minute)) return false;
  if (!spec.hour.values.has(parts.hour)) return false;
  if (!spec.month.values.has(parts.month)) return false;

  const dayOfMonthMatches = spec.dayOfMonth.values.has(parts.day);
  const dayOfWeekMatches = spec.dayOfWeek.values.has(parts.dayOfWeek);
  const dayMatches =
    spec.dayOfMonth.unrestricted && spec.dayOfWeek.unrestricted
      ? true
      : spec.dayOfMonth.unrestricted
        ? dayOfWeekMatches
        : spec.dayOfWeek.unrestricted
          ? dayOfMonthMatches
          : dayOfMonthMatches || dayOfWeekMatches;
  return dayMatches;
}

export function nextCronOccurrence(expression: string, timezone: string, after: Date): Date {
  if (Number.isNaN(after.getTime())) {
    throw new RegistryValidationError("Cron reference time must be a valid Date");
  }
  const spec = parseCron(expression);
  const formatter = timezoneFormatter(timezone.trim());
  let candidate = new Date(Math.floor(after.getTime() / 60_000) * 60_000 + 60_000);
  for (let minute = 0; minute < MAX_CRON_LOOKAHEAD_MINUTES; minute += 1) {
    if (cronMatches(spec, localParts(formatter, candidate))) return candidate;
    candidate = new Date(candidate.getTime() + 60_000);
  }
  throw schedulerConflict(
    "SCHEDULER_CRON_LOOKAHEAD_EXCEEDED",
    "Cron expression has no occurrence within the supported 367-day lookahead window",
  );
}

export function nextScheduledAt(schedule: CollectionSchedule, after: Date): Date | null {
  switch (schedule.mode) {
    case "MANUAL":
      return null;
    case "INTERVAL":
      return new Date(
        after.getTime() + parsePositiveSeconds(schedule.intervalSeconds, "intervalSeconds"),
      );
    case "CHANGE_WATCH":
      return new Date(
        after.getTime() + parsePositiveSeconds(schedule.pollIntervalSeconds, "pollIntervalSeconds"),
      );
    case "CRON":
      return nextCronOccurrence(schedule.expression, schedule.timezone, after);
  }
}

function nextFutureScheduledAt(schedule: CollectionSchedule, slot: Date, now: Date): Date | null {
  if (schedule.mode === "MANUAL") return null;
  if (schedule.mode === "CRON")
    return nextCronOccurrence(schedule.expression, schedule.timezone, now);
  const interval =
    schedule.mode === "INTERVAL"
      ? parsePositiveSeconds(schedule.intervalSeconds, "intervalSeconds")
      : parsePositiveSeconds(schedule.pollIntervalSeconds, "pollIntervalSeconds");
  let next = slot.getTime() + interval;
  if (next <= now.getTime()) {
    const skipped = Math.floor((now.getTime() - next) / interval) + 1;
    next += skipped * interval;
  }
  return new Date(next);
}

function parsePlan(value: unknown): CollectionPlan {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isCollectionPlan(parsed)) {
    throw new RegistryValidationError("Persisted collection plan no longer satisfies Schema v1");
  }
  return parsed;
}

function parseSource(value: unknown): SourceDefinition {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isSourceDefinition(parsed)) {
    throw new RegistryValidationError("Persisted source no longer satisfies Schema v1");
  }
  return parsed;
}

function parseConnector(value: unknown): ConnectorManifest {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isConnectorManifest(parsed)) {
    throw new RegistryValidationError("Persisted connector no longer satisfies Schema v1");
  }
  return parsed;
}

function parseRun(value: unknown): CollectionRun {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isCollectionRun(parsed)) {
    throw new RegistryValidationError(
      "Persisted CollectionRun no longer satisfies Execution Contract v1",
    );
  }
  return parsed;
}

function parseJob(value: unknown): Job {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isJob(parsed)) {
    throw new RegistryValidationError("Persisted Job no longer satisfies Execution Contract v1");
  }
  return parsed;
}

function loadPlan(database: DatabaseSync, planId: string): CollectionPlan {
  const row = database
    .prepare("SELECT document_json FROM collection_plans WHERE id = ?")
    .get(planId) as { document_json: string } | undefined;
  if (!row) throw new RegistryNotFoundError(planId);
  return parsePlan(row.document_json);
}

function loadSource(database: DatabaseSync, sourceId: string): SourceDefinition {
  const row = database
    .prepare("SELECT document_json FROM source_definitions WHERE id = ?")
    .get(sourceId) as { document_json: string } | undefined;
  if (!row) throw new RegistryNotFoundError(sourceId);
  return parseSource(row.document_json);
}

function loadConnector(database: DatabaseSync, source: SourceDefinition): ConnectorManifest {
  const row = database
    .prepare(
      `SELECT document_json FROM connector_manifests
       WHERE connector_id = ? AND version = ?`,
    )
    .get(source.connector.connectorId, source.connector.version) as
    { document_json: string } | undefined;
  if (!row) {
    throw schedulerConflict(
      "SCHEDULER_CONNECTOR_NOT_FOUND",
      `Connector ${source.connector.connectorId}@${source.connector.version} was not found`,
    );
  }
  return parseConnector(row.document_json);
}

function assertCapability(
  connector: ConnectorManifest,
  capability: ConnectorManifest["capabilities"][number],
  message: string,
): void {
  if (!connector.capabilities.includes(capability)) {
    throw schedulerConflict("SCHEDULER_CAPABILITY_MISMATCH", message, { capability });
  }
}

function validateScheduledDispatch(
  plan: CollectionPlan,
  source: SourceDefinition,
  connector: ConnectorManifest,
): Job["jobType"] {
  if (plan.status !== "ACTIVE") {
    throw schedulerConflict("SCHEDULER_PLAN_NOT_ACTIVE", "Only an active plan can be scheduled");
  }
  if (plan.schedule.mode === "MANUAL") {
    throw schedulerConflict(
      "SCHEDULER_MANUAL_PLAN",
      "Manual plans are not automatically scheduled",
    );
  }
  if (source.status !== "ACTIVE") {
    throw schedulerConflict(
      "SCHEDULER_SOURCE_NOT_ACTIVE",
      "Scheduled dispatch requires an active source",
    );
  }
  if (connector.status !== "ACTIVE") {
    throw schedulerConflict(
      "SCHEDULER_CONNECTOR_NOT_ACTIVE",
      "Scheduled dispatch requires an active exact ConnectorManifest version",
    );
  }
  if (!connector.sourceTypes.includes(source.sourceType)) {
    throw schedulerConflict(
      "SCHEDULER_SOURCE_TYPE_MISMATCH",
      `Connector does not support ${source.sourceType}`,
    );
  }
  assertCapability(connector, "COLLECT", "Scheduled dispatch requires COLLECT capability");
  if (plan.policy.renderJavascript) {
    assertCapability(connector, "RENDER_JAVASCRIPT", "Plan requires JavaScript rendering");
  }
  if (plan.policy.fetchAttachments) {
    assertCapability(connector, "FETCH_ATTACHMENTS", "Plan requires attachment fetching");
  }
  if (
    plan.schedule.mode === "CHANGE_WATCH" &&
    !connector.capabilities.includes("CHECK_UPDATE") &&
    !connector.capabilities.includes("WATCH")
  ) {
    throw schedulerConflict(
      "SCHEDULER_CHANGE_WATCH_UNSUPPORTED",
      "Change-watch scheduling requires CHECK_UPDATE or WATCH capability",
    );
  }
  const unsupportedKinds = plan.output.artifactKinds.filter(
    (kind) => !connector.outputArtifactKinds.includes(kind),
  );
  if (unsupportedKinds.length > 0) {
    throw schedulerConflict(
      "SCHEDULER_OUTPUT_MISMATCH",
      "Plan requests unsupported artifact kinds",
      { unsupportedKinds },
    );
  }
  return deriveCollectionJobType(plan, source, connector);
}

function jobsForRun(database: DatabaseSync, runId: string): Job[] {
  return database
    .prepare("SELECT document_json FROM jobs WHERE run_id = ? ORDER BY attempt, created_at")
    .all(runId)
    .map((row) => parseJob((row as { document_json: string }).document_json));
}

function inFlightRunForPlan(database: DatabaseSync, planId: string): CollectionRun | null {
  const row = database
    .prepare(
      `SELECT document_json FROM collection_runs
       WHERE plan_id = ? AND status IN ('PENDING', 'RUNNING')
       ORDER BY requested_at DESC, id DESC
       LIMIT 1`,
    )
    .get(planId) as { document_json: string } | undefined;
  return row ? parseRun(row.document_json) : null;
}

function coalescedDispatch(run: CollectionRun): ScheduledDispatchResult {
  return { run, jobs: [], replayed: false, coalesced: true };
}

function existingScheduledRun(
  database: DatabaseSync,
  workspaceId: string,
  planId: string,
  idempotencyKey: string,
): ScheduledDispatchResult | null {
  const row = database
    .prepare(
      `SELECT document_json FROM collection_runs
       WHERE workspace_id = ? AND idempotency_key = ?`,
    )
    .get(workspaceId, idempotencyKey) as { document_json: string } | undefined;
  if (!row) return null;
  const run = parseRun(row.document_json);
  if (run.planId !== planId || run.trigger.type !== "SCHEDULED") {
    throw schedulerConflict(
      "SCHEDULER_IDEMPOTENCY_CONFLICT",
      "Schedule slot idempotency key was already used for a different dispatch",
    );
  }
  return { run, jobs: jobsForRun(database, run.id), replayed: true, coalesced: false };
}

export function scheduledSlotIdempotencyKey(planId: string, slot: Date): string {
  const value = `schedule:${planId}:${slot.toISOString()}`;
  if (value.length > 128) {
    throw new RegistryValidationError("Scheduled slot idempotency key exceeds 128 characters");
  }
  return value;
}

function errorFields(error: unknown): { code: string; message: string } {
  const code =
    error instanceof RegistryError
      ? error.code
      : typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
        ? error.code
        : "SCHEDULER_INTERNAL_ERROR";
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.trim().slice(0, 500) || "Unknown scheduler error";
  return { code, message };
}

function rowFromDatabase(value: Record<string, unknown>): PersistedScheduleState {
  return {
    planId: String(value.plan_id),
    workspaceId: String(value.workspace_id),
    scheduleMode: String(value.schedule_mode) as PersistedScheduleState["scheduleMode"],
    scheduleFingerprint: String(value.schedule_fingerprint),
    nextDueAt: value.next_due_at === null ? null : String(value.next_due_at),
    lastSlotAt: value.last_slot_at === null ? null : String(value.last_slot_at),
    lastTriggeredAt: value.last_triggered_at === null ? null : String(value.last_triggered_at),
    lastRunId: value.last_run_id === null ? null : String(value.last_run_id),
    lastErrorCode: value.last_error_code === null ? null : String(value.last_error_code),
    lastErrorMessage: value.last_error_message === null ? null : String(value.last_error_message),
    lastErrorAt: value.last_error_at === null ? null : String(value.last_error_at),
    updatedAt: String(value.updated_at),
  };
}

function publicState(
  plan: CollectionPlan,
  row: PersistedScheduleState | null,
): CollectionScheduleState {
  const fingerprint = scheduleFingerprint(plan.schedule);
  if (plan.schedule.mode === "MANUAL") {
    return {
      planId: plan.id,
      workspaceId: plan.workspaceId,
      scheduleMode: "MANUAL",
      scheduleFingerprint: fingerprint,
      runtimeState: "NOT_SCHEDULED",
      nextDueAt: null,
      updatedAt: plan.updatedAt,
    };
  }
  if (!row) {
    return {
      planId: plan.id,
      workspaceId: plan.workspaceId,
      scheduleMode: plan.schedule.mode,
      scheduleFingerprint: fingerprint,
      runtimeState: plan.status === "ACTIVE" ? "SCHEDULED" : "PAUSED",
      nextDueAt: null,
      updatedAt: plan.updatedAt,
    };
  }
  return {
    planId: plan.id,
    workspaceId: plan.workspaceId,
    scheduleMode: plan.schedule.mode,
    scheduleFingerprint: row.scheduleFingerprint,
    runtimeState: plan.status !== "ACTIVE" ? "PAUSED" : row.lastErrorCode ? "ERROR" : "SCHEDULED",
    nextDueAt: row.nextDueAt,
    ...(row.lastSlotAt ? { lastSlotAt: row.lastSlotAt } : {}),
    ...(row.lastTriggeredAt ? { lastTriggeredAt: row.lastTriggeredAt } : {}),
    ...(row.lastRunId ? { lastRunId: row.lastRunId } : {}),
    ...(row.lastErrorCode && row.lastErrorMessage && row.lastErrorAt
      ? {
          lastError: {
            code: row.lastErrorCode,
            message: row.lastErrorMessage,
            at: row.lastErrorAt,
          },
        }
      : {}),
    updatedAt: row.updatedAt,
  };
}

export function ensureCollectionScheduler(database: DatabaseSync): void {
  ensureExecutionLedger(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS collection_schedule_states (
        plan_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        schedule_mode TEXT NOT NULL,
        schedule_fingerprint TEXT NOT NULL,
        next_due_at TEXT,
        last_slot_at TEXT,
        last_triggered_at TEXT,
        last_run_id TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        last_error_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES collection_plans(id),
        FOREIGN KEY (last_run_id) REFERENCES collection_runs(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_collection_schedule_states_due
        ON collection_schedule_states(next_due_at, plan_id);
      CREATE INDEX IF NOT EXISTS idx_collection_schedule_states_workspace
        ON collection_schedule_states(workspace_id, updated_at DESC);
    `);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export class SqliteCollectionSchedulerRepository implements CollectionSchedulerRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly runIdFactory: () => string = () => generateCollectionRunId(),
    private readonly jobIdFactory: () => string = () => generateJobId(),
  ) {
    ensureCollectionScheduler(database);
  }

  private stateRow(planId: string): PersistedScheduleState | null {
    const row = this.database
      .prepare("SELECT * FROM collection_schedule_states WHERE plan_id = ?")
      .get(planId) as Record<string, unknown> | undefined;
    return row ? rowFromDatabase(row) : null;
  }

  private writeScheduleError(
    plan: CollectionPlan,
    now: Date,
    error: unknown,
  ): PersistedScheduleState {
    if (plan.schedule.mode === "MANUAL") {
      throw new RegistryValidationError("Manual plans do not have scheduler state");
    }
    const fields = errorFields(error);
    const timestamp = now.toISOString();
    const fingerprint = scheduleFingerprint(plan.schedule);
    this.database
      .prepare(
        `INSERT INTO collection_schedule_states (
           plan_id, workspace_id, schedule_mode, schedule_fingerprint, next_due_at,
           last_slot_at, last_triggered_at, last_run_id,
           last_error_code, last_error_message, last_error_at, updated_at
         ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)
         ON CONFLICT(plan_id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           schedule_mode = excluded.schedule_mode,
           next_due_at = CASE
             WHEN collection_schedule_states.schedule_fingerprint <> excluded.schedule_fingerprint THEN NULL
             ELSE collection_schedule_states.next_due_at
           END,
           schedule_fingerprint = excluded.schedule_fingerprint,
           last_error_code = excluded.last_error_code,
           last_error_message = excluded.last_error_message,
           last_error_at = excluded.last_error_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        plan.id,
        plan.workspaceId,
        plan.schedule.mode,
        fingerprint,
        fields.code,
        fields.message,
        timestamp,
        timestamp,
      );
    return this.stateRow(plan.id)!;
  }

  private reconcileActivePlan(
    plan: CollectionPlan,
    now: Date,
  ): { row: PersistedScheduleState; initialized: boolean } {
    if (plan.status !== "ACTIVE" || plan.schedule.mode === "MANUAL") {
      throw new RegistryValidationError("Only active automatic plans can be reconciled");
    }
    const fingerprint = scheduleFingerprint(plan.schedule);
    const existing = this.stateRow(plan.id);
    if (
      existing &&
      existing.scheduleMode === plan.schedule.mode &&
      existing.scheduleFingerprint === fingerprint &&
      existing.nextDueAt &&
      isRfc3339(existing.nextDueAt)
    ) {
      return { row: existing, initialized: false };
    }

    try {
      const next = nextScheduledAt(plan.schedule, now);
      if (!next) throw new RegistryValidationError("Automatic schedule did not produce nextDueAt");
      const timestamp = now.toISOString();
      this.database
        .prepare(
          `INSERT INTO collection_schedule_states (
             plan_id, workspace_id, schedule_mode, schedule_fingerprint, next_due_at,
             last_slot_at, last_triggered_at, last_run_id,
             last_error_code, last_error_message, last_error_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?)
           ON CONFLICT(plan_id) DO UPDATE SET
             workspace_id = excluded.workspace_id,
             schedule_mode = excluded.schedule_mode,
             schedule_fingerprint = excluded.schedule_fingerprint,
             next_due_at = excluded.next_due_at,
             last_error_code = NULL,
             last_error_message = NULL,
             last_error_at = NULL,
             updated_at = excluded.updated_at`,
        )
        .run(
          plan.id,
          plan.workspaceId,
          plan.schedule.mode,
          fingerprint,
          next.toISOString(),
          timestamp,
        );
      return { row: this.stateRow(plan.id)!, initialized: true };
    } catch (error) {
      return { row: this.writeScheduleError(plan, now, error), initialized: !existing };
    }
  }

  private dispatchScheduled(plan: CollectionPlan, slot: Date, now: Date): ScheduledDispatchResult {
    const source = loadSource(this.database, plan.sourceId);
    const connector = loadConnector(this.database, source);
    const jobType = validateScheduledDispatch(plan, source, connector);
    const idempotencyKey = scheduledSlotIdempotencyKey(plan.id, slot);
    const replay = existingScheduledRun(this.database, plan.workspaceId, plan.id, idempotencyKey);
    if (replay) return replay;
    const active = inFlightRunForPlan(this.database, plan.id);
    if (active) return coalescedDispatch(active);

    const timestamp = now.toISOString();
    const run: CollectionRun = {
      contractVersion: EXECUTION_CONTRACT_VERSION,
      objectType: "COLLECTION_RUN",
      id: this.runIdFactory(),
      workspaceId: plan.workspaceId,
      sourceId: source.id,
      planId: plan.id,
      status: "PENDING",
      trigger: {
        type: "SCHEDULED",
        requestedBy: { actorType: "SYSTEM", actorId: SYSTEM_ACTOR_ID },
        idempotencyKey,
      },
      planSnapshot: clone(plan),
      sourceSnapshot: clone(source),
      connectorSnapshot: clone(connector),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const job: Job = {
      contractVersion: EXECUTION_CONTRACT_VERSION,
      objectType: "JOB",
      id: this.jobIdFactory(),
      runId: run.id,
      workspaceId: run.workspaceId,
      sourceId: run.sourceId,
      planId: run.planId,
      jobType,
      status: "PENDING",
      connector: {
        connectorId: connector.connectorId,
        version: connector.version,
      },
      priority: plan.priority,
      attempt: 1,
      maxAttempts: plan.policy.retry.maxAttempts,
      availableAt: timestamp,
      planSnapshot: clone(plan),
      sourceSnapshot: clone(source),
      connectorSnapshot: clone(connector),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (!isCollectionRun(run) || !isJob(job)) {
      throw new RegistryValidationError(
        "Scheduled dispatch does not satisfy Execution Contract v1",
      );
    }

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const concurrentReplay = existingScheduledRun(
        this.database,
        plan.workspaceId,
        plan.id,
        idempotencyKey,
      );
      if (concurrentReplay) {
        this.database.exec("COMMIT;");
        return concurrentReplay;
      }
      const concurrentActive = inFlightRunForPlan(this.database, plan.id);
      if (concurrentActive) {
        this.database.exec("COMMIT;");
        return coalescedDispatch(concurrentActive);
      }
      this.database
        .prepare(
          `INSERT INTO collection_runs (
             id, workspace_id, source_id, plan_id, plan_name, source_name,
             connector_id, connector_version, trigger_type, status, idempotency_key,
             document_json, requested_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          run.id,
          run.workspaceId,
          run.sourceId,
          run.planId,
          plan.name,
          source.name,
          connector.connectorId,
          connector.version,
          run.trigger.type,
          run.status,
          idempotencyKey,
          JSON.stringify(run),
          run.requestedAt,
          run.createdAt,
          run.updatedAt,
        );
      this.database
        .prepare(
          `INSERT INTO jobs (
             id, run_id, workspace_id, source_id, plan_id, connector_id,
             connector_version, job_type, status, attempt, available_at,
             document_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          job.id,
          job.runId,
          job.workspaceId,
          job.sourceId,
          job.planId,
          job.connector.connectorId,
          job.connector.version,
          job.jobType,
          job.status,
          job.attempt,
          job.availableAt,
          JSON.stringify(job),
          job.createdAt,
          job.updatedAt,
        );
      this.database.exec("COMMIT;");
      return { run, jobs: [job], replayed: false, coalesced: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
        const raceReplay = existingScheduledRun(
          this.database,
          plan.workspaceId,
          plan.id,
          idempotencyKey,
        );
        if (raceReplay) return raceReplay;
      }
      throw error;
    }
  }

  private advanceCoalescedState(
    plan: CollectionPlan,
    expectedSlot: string,
    now: Date,
  ): PersistedScheduleState {
    const slot = new Date(expectedSlot);
    const next = nextFutureScheduledAt(plan.schedule, slot, now);
    if (!next) {
      throw new RegistryValidationError("Automatic schedule did not produce a future slot");
    }
    const timestamp = now.toISOString();
    const result = this.database
      .prepare(
        `UPDATE collection_schedule_states
         SET next_due_at = ?, last_slot_at = ?,
             last_error_code = NULL, last_error_message = NULL, last_error_at = NULL,
             updated_at = ?
         WHERE plan_id = ? AND schedule_fingerprint = ? AND next_due_at = ?`,
      )
      .run(
        next.toISOString(),
        expectedSlot,
        timestamp,
        plan.id,
        scheduleFingerprint(plan.schedule),
        expectedSlot,
      );
    if (Number(result.changes) === 0) {
      const current = this.stateRow(plan.id);
      if (!current) {
        throw schedulerConflict(
          "SCHEDULER_STATE_LOST",
          "Scheduler state disappeared while coalescing an in-flight run",
        );
      }
      return current;
    }
    return this.stateRow(plan.id)!;
  }

  private advanceState(
    plan: CollectionPlan,
    expectedSlot: string,
    run: CollectionRun,
    now: Date,
  ): PersistedScheduleState {
    const slot = new Date(expectedSlot);
    const next = nextFutureScheduledAt(plan.schedule, slot, now);
    if (!next)
      throw new RegistryValidationError("Automatic schedule did not produce a future slot");
    const timestamp = now.toISOString();
    const result = this.database
      .prepare(
        `UPDATE collection_schedule_states
         SET next_due_at = ?, last_slot_at = ?, last_triggered_at = ?, last_run_id = ?,
             last_error_code = NULL, last_error_message = NULL, last_error_at = NULL,
             updated_at = ?
         WHERE plan_id = ? AND schedule_fingerprint = ? AND next_due_at = ?`,
      )
      .run(
        next.toISOString(),
        expectedSlot,
        timestamp,
        run.id,
        timestamp,
        plan.id,
        scheduleFingerprint(plan.schedule),
        expectedSlot,
      );
    if (Number(result.changes) === 0) {
      const current = this.stateRow(plan.id);
      if (!current) {
        throw schedulerConflict(
          "SCHEDULER_STATE_LOST",
          "Scheduler state disappeared during dispatch",
        );
      }
      return current;
    }
    return this.stateRow(plan.id)!;
  }

  tick(input: CollectionSchedulerTickInput = {}): CollectionSchedulerTickResult {
    const now = input.observedAt ?? this.clock();
    if (Number.isNaN(now.getTime())) {
      throw new RegistryValidationError("Scheduler observedAt must be a valid Date");
    }
    const limit = normalizedTickLimit(input.limit);
    const rows = this.database
      .prepare(
        `SELECT p.document_json
         FROM collection_plans p
         LEFT JOIN collection_schedule_states s ON s.plan_id = p.id
         WHERE p.status = 'ACTIVE' AND p.schedule_mode <> 'MANUAL'
         ORDER BY CASE WHEN s.plan_id IS NULL THEN 0 ELSE 1 END,
                  CASE
                    WHEN s.last_error_at IS NOT NULL
                      AND (s.next_due_at IS NULL OR s.next_due_at <= ?)
                      THEN s.last_error_at
                    ELSE COALESCE(s.next_due_at, '')
                  END ASC,
                  p.id ASC
         LIMIT ?`,
      )
      .all(now.toISOString(), limit) as Array<{ document_json: string }>;

    const items: CollectionSchedulerTickItem[] = [];
    let dispatched = 0;
    let replayed = 0;
    let coalesced = 0;
    let errors = 0;
    for (const row of rows) {
      const plan = parsePlan(row.document_json);
      const reconciled = this.reconcileActivePlan(plan, now);
      const state = reconciled.row;
      if (!state.nextDueAt) {
        errors += 1;
        items.push({
          planId: plan.id,
          outcome: "ERROR",
          nextDueAt: null,
          ...(state.lastErrorCode ? { errorCode: state.lastErrorCode } : {}),
        });
        continue;
      }
      if (new Date(state.nextDueAt).getTime() > now.getTime()) {
        if (state.lastErrorCode) errors += 1;
        items.push({
          planId: plan.id,
          outcome: state.lastErrorCode
            ? "ERROR"
            : reconciled.initialized
              ? "INITIALIZED"
              : "NOT_DUE",
          nextDueAt: state.nextDueAt,
          ...(state.lastErrorCode ? { errorCode: state.lastErrorCode } : {}),
        });
        continue;
      }

      try {
        const dispatch = this.dispatchScheduled(plan, new Date(state.nextDueAt), now);
        if (dispatch.coalesced) {
          const advanced = this.advanceCoalescedState(plan, state.nextDueAt, now);
          coalesced += 1;
          items.push({
            planId: plan.id,
            outcome: "COALESCED",
            nextDueAt: advanced.nextDueAt,
            runId: dispatch.run.id,
          });
          continue;
        }
        const advanced = this.advanceState(plan, state.nextDueAt, dispatch.run, now);
        if (dispatch.replayed) replayed += 1;
        else dispatched += 1;
        items.push({
          planId: plan.id,
          outcome: dispatch.replayed ? "REPLAYED" : "DISPATCHED",
          nextDueAt: advanced.nextDueAt,
          runId: dispatch.run.id,
        });
      } catch (error) {
        const failed = this.writeScheduleError(plan, now, error);
        errors += 1;
        items.push({
          planId: plan.id,
          outcome: "ERROR",
          nextDueAt: failed.nextDueAt,
          ...(failed.lastErrorCode ? { errorCode: failed.lastErrorCode } : {}),
        });
      }
    }

    return {
      observedAt: now.toISOString(),
      examined: rows.length,
      dispatched,
      replayed,
      coalesced,
      errors,
      items,
    };
  }

  getState(planId: string): CollectionScheduleState {
    const plan = loadPlan(this.database, planId.trim());
    if (plan.schedule.mode === "MANUAL" || plan.status !== "ACTIVE") {
      return publicState(plan, this.stateRow(plan.id));
    }
    return publicState(plan, this.reconcileActivePlan(plan, this.clock()).row);
  }

  listStates(workspaceId?: string, limit = DEFAULT_TICK_LIMIT): CollectionScheduleState[] {
    const normalizedLimit = normalizedTickLimit(limit);
    const workspace = workspaceId?.trim();
    const rows = workspace
      ? (this.database
          .prepare(
            `SELECT document_json FROM collection_plans
             WHERE workspace_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?`,
          )
          .all(workspace, normalizedLimit) as Array<{ document_json: string }>)
      : (this.database
          .prepare(
            `SELECT document_json FROM collection_plans
             ORDER BY updated_at DESC, id DESC LIMIT ?`,
          )
          .all(normalizedLimit) as Array<{ document_json: string }>);
    const now = this.clock();
    return rows.map((row) => {
      const plan = parsePlan(row.document_json);
      if (plan.schedule.mode === "MANUAL" || plan.status !== "ACTIVE") {
        return publicState(plan, this.stateRow(plan.id));
      }
      return publicState(plan, this.reconcileActivePlan(plan, now).row);
    });
  }
}
