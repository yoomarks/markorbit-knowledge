import { randomBytes } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  COLLECTION_RUN_STATUSES,
  EXECUTION_CONTRACT_VERSION,
  JOB_STATUSES,
  JOB_TYPES,
  RUN_TRIGGER_TYPES,
  isCollectionPlan,
  isCollectionRun,
  isConnectorManifest,
  isJob,
  isSourceDefinition,
  type CollectionPlan,
  type CollectionRun,
  type CollectionRunStatus,
  type ConnectorManifest,
  type ExecutionActor,
  type Job,
  type JobType,
  type RunTriggerType,
  type SourceDefinition,
} from "@markorbit/contracts";
import {
  CollectionPlanNotFoundError,
  ensureCollectionPlanRegistry,
} from "./collection-plan-registry";
import { ConnectorNotFoundError } from "./connector-registry";
import {
  RegistryConflictError,
  RegistryError,
  RegistryNotFoundError,
  RegistryValidationError,
} from "./index";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MIGRATION_ID = "0004_execution_ledger";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const COLLECTION_JOB_TYPES: JobType[] = [
  "WEB_CRAWL",
  "PAGE_UPDATE_CHECK",
  "API_COLLECTION",
  "EMAIL_IMPORT",
  "LOCAL_FILE_SCAN",
];

export type ManualDispatchInput = {
  planId: string;
  requestedBy?: ExecutionActor;
  idempotencyKey?: string;
};

export type CancelRunInput = {
  expectedUpdatedAt: string;
  reason?: string;
};

export type ExecutionRunListFilters = {
  q?: string;
  workspaceId?: string;
  sourceId?: string;
  planId?: string;
  connectorId?: string;
  status?: CollectionRunStatus;
  triggerType?: RunTriggerType;
  jobType?: JobType;
  limit?: number;
  offset?: number;
};

export type ExecutionRunRecord = {
  run: CollectionRun;
  jobs: Job[];
};

export type ExecutionRunSummary = {
  total: number;
  statuses: Record<CollectionRunStatus, number>;
  triggers: Record<RunTriggerType, number>;
};

export type ExecutionRunListResult = {
  items: ExecutionRunRecord[];
  total: number;
  limit: number;
  offset: number;
  summary: ExecutionRunSummary;
};

export type ManualDispatchResult = {
  record: ExecutionRunRecord;
  replayed: boolean;
};

export interface ExecutionLedgerRepository {
  dispatchManual(input: ManualDispatchInput): ManualDispatchResult;
  getById(id: string): ExecutionRunRecord | null;
  list(filters?: ExecutionRunListFilters): ExecutionRunListResult;
  listForPlan(planId: string, limit?: number): ExecutionRunRecord[];
  listForSource(sourceId: string, limit?: number): ExecutionRunRecord[];
  cancel(id: string, input: CancelRunInput): ExecutionRunRecord;
}

export class ExecutionRunNotFoundError extends RegistryError {
  constructor(id: string) {
    super("EXECUTION_RUN_NOT_FOUND", `Collection run ${id} was not found`, { id });
  }
}

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

function typedId(prefix: "run" | "job", now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

export function generateCollectionRunId(now = Date.now()): string {
  return typedId("run", now);
}

export function generateJobId(now = Date.now()): string {
  return typedId("job", now);
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new RegistryValidationError("offset must be a non-negative integer");
  }
  return value;
}

function normalizeIdempotencyKey(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new RegistryValidationError("Idempotency key must contain 1 to 128 characters");
  }
  return normalized;
}

function normalizeActor(value: ExecutionActor | undefined): ExecutionActor {
  const actor = value ?? { actorType: "LOCAL_ADMIN", actorId: "local-admin" };
  if (
    !["LOCAL_ADMIN", "SYSTEM", "API_CLIENT"].includes(actor.actorType) ||
    (actor.actorId !== undefined &&
      (actor.actorId.trim().length === 0 || actor.actorId.trim().length > 200))
  ) {
    throw new RegistryValidationError("Invalid execution actor");
  }
  return {
    actorType: actor.actorType,
    ...(actor.actorId ? { actorId: actor.actorId.trim() } : {}),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
  if (!row) throw new CollectionPlanNotFoundError(planId);
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
    throw new ConnectorNotFoundError(source.connector.connectorId, source.connector.version);
  }
  return parseConnector(row.document_json);
}

export function deriveCollectionJobType(
  plan: CollectionPlan,
  source: SourceDefinition,
  connector: ConnectorManifest,
): JobType {
  let derived: JobType | undefined;
  switch (source.sourceType) {
    case "WEB":
      derived = plan.schedule.mode === "CHANGE_WATCH" ? "PAGE_UPDATE_CHECK" : "WEB_CRAWL";
      break;
    case "API":
      derived = "API_COLLECTION";
      break;
    case "EMAIL":
      derived = "EMAIL_IMPORT";
      break;
    case "LOCAL_FOLDER":
    case "MANUAL_UPLOAD":
      derived = "LOCAL_FILE_SCAN";
      break;
    default: {
      const compatible = connector.supportedJobTypes.filter((jobType) =>
        COLLECTION_JOB_TYPES.includes(jobType),
      );
      if (compatible.length !== 1) {
        throw new RegistryConflictError(
          "EXECUTION_JOB_TYPE_AMBIGUOUS",
          `Unable to derive one collection JobType for ${source.sourceType}`,
          { supportedJobTypes: connector.supportedJobTypes },
        );
      }
      [derived] = compatible;
    }
  }
  if (!connector.supportedJobTypes.includes(derived)) {
    throw new RegistryConflictError(
      "EXECUTION_JOB_TYPE_UNSUPPORTED",
      `Connector ${connector.connectorId}@${connector.version} does not support ${derived}`,
      { jobType: derived },
    );
  }
  return derived;
}

function assertCapability(
  connector: ConnectorManifest,
  capability: ConnectorManifest["capabilities"][number],
  message: string,
): void {
  if (!connector.capabilities.includes(capability)) {
    throw new RegistryConflictError("EXECUTION_CAPABILITY_MISMATCH", message, { capability });
  }
}

function validateDispatch(
  plan: CollectionPlan,
  source: SourceDefinition,
  connector: ConnectorManifest,
): JobType {
  if (plan.status !== "ACTIVE") {
    throw new RegistryConflictError(
      "EXECUTION_PLAN_NOT_ACTIVE",
      "Only an active plan can be dispatched",
    );
  }
  if (source.status !== "ACTIVE") {
    throw new RegistryConflictError(
      "EXECUTION_SOURCE_NOT_ACTIVE",
      "An active source is required for dispatch",
    );
  }
  if (connector.status !== "ACTIVE") {
    throw new RegistryConflictError(
      "EXECUTION_CONNECTOR_NOT_ACTIVE",
      "An active exact ConnectorManifest version is required for dispatch",
    );
  }
  if (!connector.sourceTypes.includes(source.sourceType)) {
    throw new RegistryConflictError(
      "EXECUTION_SOURCE_TYPE_MISMATCH",
      `Connector does not support ${source.sourceType}`,
    );
  }
  assertCapability(connector, "COLLECT", "Dispatch requires COLLECT capability");
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
    throw new RegistryConflictError(
      "EXECUTION_CHANGE_WATCH_UNSUPPORTED",
      "Change-watch dispatch requires CHECK_UPDATE or WATCH capability",
    );
  }
  const unsupportedKinds = plan.output.artifactKinds.filter(
    (kind) => !connector.outputArtifactKinds.includes(kind),
  );
  if (unsupportedKinds.length > 0) {
    throw new RegistryConflictError(
      "EXECUTION_OUTPUT_MISMATCH",
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

function recordFromRun(database: DatabaseSync, value: unknown): ExecutionRunRecord {
  const run = parseRun(value);
  return { run, jobs: jobsForRun(database, run.id) };
}

function buildWhere(filters: ExecutionRunListFilters, includeStatus = true) {
  const clauses: string[] = [];
  const values: SQLInputValue[] = [];
  if (filters.q?.trim()) {
    const query = `%${filters.q.trim().toLowerCase()}%`;
    clauses.push(
      "(lower(r.plan_name) LIKE ? OR lower(r.source_name) LIKE ? OR lower(r.id) LIKE ?)",
    );
    values.push(query, query, query);
  }
  if (filters.workspaceId) {
    clauses.push("r.workspace_id = ?");
    values.push(filters.workspaceId);
  }
  if (filters.sourceId) {
    clauses.push("r.source_id = ?");
    values.push(filters.sourceId);
  }
  if (filters.planId) {
    clauses.push("r.plan_id = ?");
    values.push(filters.planId);
  }
  if (filters.connectorId) {
    clauses.push("r.connector_id = ?");
    values.push(filters.connectorId);
  }
  if (includeStatus && filters.status) {
    clauses.push("r.status = ?");
    values.push(filters.status);
  }
  if (filters.triggerType) {
    clauses.push("r.trigger_type = ?");
    values.push(filters.triggerType);
  }
  if (filters.jobType) {
    clauses.push("EXISTS (SELECT 1 FROM jobs j WHERE j.run_id = r.id AND j.job_type = ?)");
    values.push(filters.jobType);
  }
  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

export function assertExecutionRunFilterValues(filters: ExecutionRunListFilters): void {
  if (filters.status && !COLLECTION_RUN_STATUSES.includes(filters.status)) {
    throw new RegistryValidationError("Unknown CollectionRun status filter");
  }
  if (filters.triggerType && !RUN_TRIGGER_TYPES.includes(filters.triggerType)) {
    throw new RegistryValidationError("Unknown trigger type filter");
  }
  if (filters.jobType && !JOB_TYPES.includes(filters.jobType)) {
    throw new RegistryValidationError("Unknown JobType filter");
  }
}

export function ensureExecutionLedger(database: DatabaseSync): void {
  ensureCollectionPlanRegistry(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS collection_runs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        source_name TEXT NOT NULL,
        connector_id TEXT NOT NULL,
        connector_version TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT,
        document_json TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES source_definitions(id),
        FOREIGN KEY (plan_id) REFERENCES collection_plans(id),
        UNIQUE (workspace_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        connector_id TEXT NOT NULL,
        connector_version TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        available_at TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES collection_runs(id),
        UNIQUE (run_id, attempt)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_collection_runs_workspace_status
        ON collection_runs(workspace_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_collection_runs_plan
        ON collection_runs(plan_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_collection_runs_source
        ON collection_runs(source_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_collection_runs_connector
        ON collection_runs(connector_id, connector_version);
      CREATE INDEX IF NOT EXISTS idx_collection_runs_trigger
        ON collection_runs(trigger_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_status_available
        ON jobs(status, available_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_type
        ON jobs(job_type, created_at DESC);
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

export class SqliteExecutionLedgerRepository implements ExecutionLedgerRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly runIdFactory: () => string = () => generateCollectionRunId(),
    private readonly jobIdFactory: () => string = () => generateJobId(),
  ) {
    ensureExecutionLedger(database);
  }

  dispatchManual(input: ManualDispatchInput): ManualDispatchResult {
    const plan = loadPlan(this.database, input.planId.trim());
    const source = loadSource(this.database, plan.sourceId);
    const connector = loadConnector(this.database, source);
    const jobType = validateDispatch(plan, source, connector);
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

    if (idempotencyKey) {
      const existing = this.database
        .prepare(
          `SELECT document_json FROM collection_runs
           WHERE workspace_id = ? AND idempotency_key = ?`,
        )
        .get(plan.workspaceId, idempotencyKey) as { document_json: string } | undefined;
      if (existing) {
        const record = recordFromRun(this.database, existing.document_json);
        if (record.run.planId !== plan.id || record.run.trigger.type !== "MANUAL") {
          throw new RegistryConflictError(
            "EXECUTION_IDEMPOTENCY_CONFLICT",
            "Idempotency key was already used for a different dispatch",
          );
        }
        return { record, replayed: true };
      }
    }

    const timestamp = this.clock().toISOString();
    const actor = normalizeActor(input.requestedBy);
    const run: CollectionRun = {
      contractVersion: EXECUTION_CONTRACT_VERSION,
      objectType: "COLLECTION_RUN",
      id: this.runIdFactory(),
      workspaceId: plan.workspaceId,
      sourceId: source.id,
      planId: plan.id,
      status: "PENDING",
      trigger: {
        type: "MANUAL",
        requestedBy: actor,
        ...(idempotencyKey ? { idempotencyKey } : {}),
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
      throw new RegistryValidationError("Dispatch does not satisfy Execution Contract v1");
    }

    this.database.exec("BEGIN IMMEDIATE;");
    try {
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
          idempotencyKey ?? null,
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
    } catch (error) {
      this.database.exec("ROLLBACK;");
      if (idempotencyKey && error instanceof Error && error.message.includes("UNIQUE constraint")) {
        const existing = this.database
          .prepare(
            `SELECT document_json FROM collection_runs
             WHERE workspace_id = ? AND idempotency_key = ?`,
          )
          .get(plan.workspaceId, idempotencyKey) as { document_json: string } | undefined;
        if (existing) {
          const record = recordFromRun(this.database, existing.document_json);
          if (record.run.planId !== plan.id || record.run.trigger.type !== "MANUAL") {
            throw new RegistryConflictError(
              "EXECUTION_IDEMPOTENCY_CONFLICT",
              "Idempotency key was concurrently used for a different dispatch",
            );
          }
          return { record, replayed: true };
        }
      }
      throw error;
    }
    return { record: { run, jobs: [job] }, replayed: false };
  }

  getById(id: string): ExecutionRunRecord | null {
    const row = this.database
      .prepare("SELECT document_json FROM collection_runs WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    return row ? recordFromRun(this.database, row.document_json) : null;
  }

  list(filters: ExecutionRunListFilters = {}): ExecutionRunListResult {
    assertExecutionRunFilterValues(filters);
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const where = buildWhere(filters);
    const rows = this.database
      .prepare(
        `SELECT r.document_json FROM collection_runs r
         ${where.sql}
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...where.values, limit, offset) as Array<{ document_json: string }>;
    const total = Number(
      (
        this.database
          .prepare(`SELECT COUNT(*) AS count FROM collection_runs r ${where.sql}`)
          .get(...where.values) as { count: number }
      ).count,
    );

    const summaryWhere = buildWhere({ ...filters, status: undefined }, false);
    const statusRows = this.database
      .prepare(
        `SELECT r.status, COUNT(*) AS count FROM collection_runs r
         ${summaryWhere.sql} GROUP BY r.status`,
      )
      .all(...summaryWhere.values) as Array<{ status: CollectionRunStatus; count: number }>;
    const triggerRows = this.database
      .prepare(
        `SELECT r.trigger_type AS triggerType, COUNT(*) AS count FROM collection_runs r
         ${summaryWhere.sql} GROUP BY r.trigger_type`,
      )
      .all(...summaryWhere.values) as Array<{ triggerType: RunTriggerType; count: number }>;
    const statuses = Object.fromEntries(
      COLLECTION_RUN_STATUSES.map((status) => [status, 0]),
    ) as Record<CollectionRunStatus, number>;
    const triggers = Object.fromEntries(RUN_TRIGGER_TYPES.map((trigger) => [trigger, 0])) as Record<
      RunTriggerType,
      number
    >;
    for (const row of statusRows) statuses[row.status] = Number(row.count);
    for (const row of triggerRows) triggers[row.triggerType] = Number(row.count);

    return {
      items: rows.map((row) => recordFromRun(this.database, row.document_json)),
      total,
      limit,
      offset,
      summary: {
        total: Object.values(statuses).reduce((sum, value) => sum + value, 0),
        statuses,
        triggers,
      },
    };
  }

  listForPlan(planId: string, limit = 20): ExecutionRunRecord[] {
    return this.list({ planId, limit }).items;
  }

  listForSource(sourceId: string, limit = 20): ExecutionRunRecord[] {
    return this.list({ sourceId, limit }).items;
  }

  cancel(id: string, input: CancelRunInput): ExecutionRunRecord {
    const current = this.getById(id);
    if (!current) throw new ExecutionRunNotFoundError(id);
    if (current.run.updatedAt !== input.expectedUpdatedAt) {
      throw new RegistryConflictError(
        "EXECUTION_VERSION_CONFLICT",
        "CollectionRun was modified after it was read",
      );
    }
    if (current.run.status !== "PENDING") {
      throw new RegistryConflictError(
        "EXECUTION_RUN_NOT_CANCELLABLE",
        `Only PENDING runs can be cancelled; current status is ${current.run.status}`,
      );
    }
    const reason = input.reason?.trim();
    if (reason && reason.length > 500) {
      throw new RegistryValidationError("Cancellation reason must not exceed 500 characters");
    }
    const timestamp = this.clock().toISOString();
    const run: CollectionRun = {
      ...current.run,
      status: "CANCELLED",
      updatedAt: timestamp,
      cancelledAt: timestamp,
      ...(reason ? { cancellationReason: reason } : {}),
    };
    const jobs = current.jobs.map((job) => {
      if (job.status !== "PENDING") {
        throw new RegistryConflictError(
          "EXECUTION_JOB_NOT_CANCELLABLE",
          `Job ${job.id} is ${job.status} and cannot be cancelled by the control plane`,
        );
      }
      return {
        ...job,
        status: "CANCELLED" as const,
        updatedAt: timestamp,
        cancelledAt: timestamp,
        ...(reason ? { cancellationReason: reason } : {}),
      };
    });
    if (!isCollectionRun(run) || !jobs.every(isJob)) {
      throw new RegistryValidationError("Cancellation does not satisfy Execution Contract v1");
    }

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const result = this.database
        .prepare(
          `UPDATE collection_runs
           SET status = ?, document_json = ?, updated_at = ?
           WHERE id = ? AND updated_at = ?`,
        )
        .run(run.status, JSON.stringify(run), run.updatedAt, run.id, input.expectedUpdatedAt);
      if (Number(result.changes) !== 1) {
        throw new RegistryConflictError(
          "EXECUTION_VERSION_CONFLICT",
          "CollectionRun was modified during cancellation",
        );
      }
      const statement = this.database.prepare(
        `UPDATE jobs SET status = ?, document_json = ?, updated_at = ?
         WHERE id = ? AND status = ?`,
      );
      for (const job of jobs) {
        const result = statement.run(
          job.status,
          JSON.stringify(job),
          job.updatedAt,
          job.id,
          "PENDING",
        );
        if (Number(result.changes) !== 1) {
          throw new RegistryConflictError(
            "EXECUTION_JOB_STATE_CONFLICT",
            `Job ${job.id} changed during cancellation`,
          );
        }
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return { run, jobs };
  }
}

export function assertNoPublicWorkerMutation(status: string): void {
  if (status !== "PENDING" && status !== "CANCELLED") {
    throw new RegistryValidationError(
      "Worker-owned execution states cannot be written through the administration API",
      { status, allowed: ["PENDING", "CANCELLED"], jobStatuses: JOB_STATUSES },
    );
  }
}
