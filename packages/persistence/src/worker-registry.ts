import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  JOB_LEASE_STATUSES,
  JOB_STATUSES,
  JOB_TYPES,
  WORKER_DESIRED_STATES,
  WORKER_HEALTH_STATES,
  WORKER_PROTOCOL_VERSION,
  WORKER_STATUSES,
  isJob,
  isJobLease,
  isWorkerDefinition,
  isWorkerHeartbeat,
  type ConnectorCapability,
  type Extensions,
  type Job,
  type JobLease,
  type JobLeaseStatus,
  type JobType,
  type WorkerConnectorBinding,
  type WorkerDefinition,
  type WorkerDesiredState,
  type WorkerHealthState,
  type WorkerHeartbeat,
  type WorkerRuntimeView,
  type WorkerStatus,
} from "@markorbit/contracts";
import { ensureExecutionLedger } from "./execution-ledger";
import {
  DEFAULT_WORKSPACE,
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "./index";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MIGRATION_ID = "0005_worker_registry_and_leases";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const HEARTBEAT_HISTORY_LIMIT = 100;

export const DEFAULT_HEARTBEAT_FRESHNESS_MS = 90_000;
export const DEFAULT_HEARTBEAT_CLOCK_SKEW_MS = 300_000;
export const DEFAULT_LEASE_DURATION_MS = 120_000;
export const DEFAULT_MAX_LEASE_LIFETIME_MS = 900_000;

export type WorkerProtocolOptions = {
  heartbeatFreshnessMs?: number;
  heartbeatClockSkewMs?: number;
  leaseDurationMs?: number;
  maxLeaseLifetimeMs?: number;
};

export type CreateWorkerInput = {
  workspaceId?: string;
  displayName: string;
  desiredState?: WorkerDesiredState;
  runtime: WorkerDefinition["runtime"];
  supportedJobTypes: JobType[];
  connectorBindings: WorkerConnectorBinding[];
  maxConcurrency: number;
  labels?: string[];
  extensions?: Extensions;
};

export type UpdateWorkerInput = Partial<
  Pick<
    WorkerDefinition,
    | "displayName"
    | "desiredState"
    | "runtime"
    | "supportedJobTypes"
    | "connectorBindings"
    | "maxConcurrency"
    | "labels"
    | "extensions"
  >
> & { extensions?: Extensions | null };

export type WorkerListFilters = {
  q?: string;
  workspaceId?: string;
  desiredState?: WorkerDesiredState;
  effectiveStatus?: WorkerStatus;
  runtimeId?: string;
  connectorId?: string;
  jobType?: JobType;
  label?: string;
  limit?: number;
  offset?: number;
};

export type WorkerStatusSummary = Record<WorkerStatus, number> & {
  total: number;
  activeLeases: number;
  expiredLeases: number;
};

export type WorkerListResult = {
  items: WorkerRuntimeView[];
  total: number;
  limit: number;
  offset: number;
  summary: WorkerStatusSummary;
};

export type WorkerCreationResult = {
  view: WorkerRuntimeView;
  credential: string;
};

export type CredentialRotationResult = {
  workerId: string;
  credential: string;
  rotatedAt: string;
};

export type HeartbeatInput = {
  workerId: string;
  observedAt: string;
  runtimeVersion: string;
  health: WorkerHealthState;
  activeLeaseIds?: string[];
  diagnostics?: Extensions;
};

export type ClaimResult = {
  job: Job | null;
  lease: JobLease | null;
  leaseToken: string | null;
};

export type LeaseListFilters = {
  workerId?: string;
  jobId?: string;
  runId?: string;
  status?: JobLeaseStatus;
  limit?: number;
  offset?: number;
};

export type LeaseListResult = {
  items: JobLease[];
  total: number;
  limit: number;
  offset: number;
};

export interface WorkerRegistryRepository {
  create(input: CreateWorkerInput): WorkerCreationResult;
  getById(id: string): WorkerRuntimeView | null;
  list(filters?: WorkerListFilters): WorkerListResult;
  update(id: string, input: UpdateWorkerInput, expectedUpdatedAt: string): WorkerRuntimeView;
  rotateCredential(id: string): CredentialRotationResult;
  verifyCredential(workerId: string, credential: string): WorkerDefinition;
  heartbeat(input: HeartbeatInput, credential: string): WorkerRuntimeView;
  claim(workerId: string, credential: string): ClaimResult;
  renewLease(workerId: string, credential: string, leaseId: string, leaseToken: string): JobLease;
  releaseLease(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    reason?: string,
  ): JobLease;
  reapExpired(): number;
  listLeases(filters?: LeaseListFilters): LeaseListResult;
}

export class WorkerNotFoundError extends RegistryError {
  constructor(id: string) {
    super("WORKER_NOT_FOUND", `Worker ${id} was not found`, { id });
  }
}

export class LeaseNotFoundError extends RegistryError {
  constructor(id: string) {
    super("LEASE_NOT_FOUND", `Lease ${id} was not found`, { id });
  }
}

export class WorkerAuthenticationError extends RegistryError {
  constructor(message = "Worker credential is missing or invalid") {
    super("WORKER_AUTHENTICATION_FAILED", message);
  }
}

export class WorkerAuthorizationError extends RegistryError {
  constructor(code: string, message: string) {
    super(code, message);
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

function typedId(prefix: "wrk" | "hbt" | "lse", now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

export function generateWorkerId(now = Date.now()): string {
  return typedId("wrk", now);
}

export function generateHeartbeatId(now = Date.now()): string {
  return typedId("hbt", now);
}

export function generateLeaseId(now = Date.now()): string {
  return typedId("lse", now);
}

function generateCredential(): string {
  return `mwk_${randomBytes(32).toString("base64url")}`;
}

function generateLeaseToken(): string {
  return `mls_${randomBytes(32).toString("base64url")}`;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function digestHex(value: string): string {
  return digest(value).toString("hex");
}

function verifyDigest(value: string, expectedHex: string): boolean {
  const actual = digest(value);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function boundedDuration(value: number | undefined, fallback: number, field: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1_000 || resolved > 86_400_000) {
    throw new RegistryValidationError(`${field} must be between 1000 and 86400000 milliseconds`);
  }
  return resolved;
}

function parseWorker(value: unknown): WorkerDefinition {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isWorkerDefinition(parsed)) {
    throw new RegistryValidationError(
      "Persisted WorkerDefinition no longer satisfies Worker Protocol v1",
    );
  }
  return parsed;
}

function parseHeartbeat(value: unknown): WorkerHeartbeat {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isWorkerHeartbeat(parsed)) {
    throw new RegistryValidationError(
      "Persisted WorkerHeartbeat no longer satisfies Worker Protocol v1",
    );
  }
  return parsed;
}

function parseLease(value: unknown): JobLease {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isJobLease(parsed)) {
    throw new RegistryValidationError("Persisted JobLease no longer satisfies Worker Protocol v1");
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

function connectorIdentity(binding: WorkerConnectorBinding): string {
  return `${binding.connectorId}@${binding.version}`;
}

function normalizeWorkerInput(
  input: CreateWorkerInput,
  id: string,
  timestamp: string,
): WorkerDefinition {
  const worker: WorkerDefinition = {
    contractVersion: WORKER_PROTOCOL_VERSION,
    objectType: "WORKER_DEFINITION",
    id,
    workspaceId: input.workspaceId ?? DEFAULT_WORKSPACE.id,
    displayName: input.displayName.trim(),
    desiredState: input.desiredState ?? "ACTIVE",
    runtime: {
      runtimeId: input.runtime.runtimeId.trim().toLowerCase(),
      version: input.runtime.version.trim(),
    },
    supportedJobTypes: [...new Set(input.supportedJobTypes)],
    connectorBindings: input.connectorBindings.map((binding) => ({
      connectorId: binding.connectorId.trim().toLowerCase(),
      version: binding.version.trim(),
      capabilities: [...new Set(binding.capabilities)],
    })),
    maxConcurrency: input.maxConcurrency,
    labels: [...new Set((input.labels ?? []).map((label) => label.trim()).filter(Boolean))],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.extensions ? { extensions: input.extensions } : {}),
  };
  if (!isWorkerDefinition(worker)) {
    throw new RegistryValidationError("Worker input does not satisfy Worker Protocol v1");
  }
  return worker;
}

function applyWorkerUpdate(
  current: WorkerDefinition,
  input: UpdateWorkerInput,
  timestamp: string,
): WorkerDefinition {
  const next = clone(current);
  if (input.displayName !== undefined) next.displayName = input.displayName.trim();
  if (input.desiredState !== undefined) next.desiredState = input.desiredState;
  if (input.runtime !== undefined) {
    next.runtime = {
      runtimeId: input.runtime.runtimeId.trim().toLowerCase(),
      version: input.runtime.version.trim(),
    };
  }
  if (input.supportedJobTypes !== undefined) {
    next.supportedJobTypes = [...new Set(input.supportedJobTypes)];
  }
  if (input.connectorBindings !== undefined) {
    next.connectorBindings = input.connectorBindings.map((binding) => ({
      connectorId: binding.connectorId.trim().toLowerCase(),
      version: binding.version.trim(),
      capabilities: [...new Set(binding.capabilities)],
    }));
  }
  if (input.maxConcurrency !== undefined) next.maxConcurrency = input.maxConcurrency;
  if (input.labels !== undefined) {
    next.labels = [...new Set(input.labels.map((label) => label.trim()).filter(Boolean))];
  }
  if (input.extensions === null) delete next.extensions;
  else if (input.extensions !== undefined) next.extensions = input.extensions;
  next.updatedAt = timestamp;
  if (!isWorkerDefinition(next)) {
    throw new RegistryValidationError("Worker update does not satisfy Worker Protocol v1");
  }
  return next;
}

function requiredCapabilities(job: Job): ConnectorCapability[] {
  const required = new Set<ConnectorCapability>(["COLLECT"]);
  if (job.planSnapshot.policy.renderJavascript) required.add("RENDER_JAVASCRIPT");
  if (job.planSnapshot.policy.fetchAttachments) required.add("FETCH_ATTACHMENTS");
  if (job.planSnapshot.schedule.mode === "CHANGE_WATCH") {
    if (job.connectorSnapshot.capabilities.includes("CHECK_UPDATE")) required.add("CHECK_UPDATE");
    else required.add("WATCH");
  }
  return [...required];
}

function workerCanRun(worker: WorkerDefinition, job: Job): boolean {
  if (!worker.supportedJobTypes.includes(job.jobType)) return false;
  const binding = worker.connectorBindings.find(
    (candidate) =>
      candidate.connectorId === job.connector.connectorId &&
      candidate.version === job.connector.version,
  );
  if (!binding) return false;
  return requiredCapabilities(job).every((capability) => binding.capabilities.includes(capability));
}

function workerRow(worker: WorkerDefinition) {
  return {
    id: worker.id,
    workspaceId: worker.workspaceId,
    displayName: worker.displayName,
    desiredState: worker.desiredState,
    runtimeId: worker.runtime.runtimeId,
    runtimeVersion: worker.runtime.version,
    jobTypesJson: JSON.stringify(worker.supportedJobTypes),
    bindingsJson: JSON.stringify(worker.connectorBindings),
    labelsJson: JSON.stringify(worker.labels),
    maxConcurrency: worker.maxConcurrency,
    documentJson: JSON.stringify(worker),
    createdAt: worker.createdAt,
    updatedAt: worker.updatedAt,
  };
}

function leaseRow(lease: JobLease) {
  return {
    id: lease.id,
    workspaceId: lease.workspaceId,
    workerId: lease.workerId,
    jobId: lease.jobId,
    runId: lease.runId,
    connectorId: lease.connector.connectorId,
    connectorVersion: lease.connector.version,
    jobType: lease.jobType,
    status: lease.status,
    documentJson: JSON.stringify(lease),
    acquiredAt: lease.acquiredAt,
    expiresAt: lease.expiresAt,
    updatedAt: lease.updatedAt,
  };
}

function validateWorkerBindings(database: DatabaseSync, worker: WorkerDefinition): void {
  const manifestJobTypes = new Set<JobType>();
  for (const binding of worker.connectorBindings) {
    const row = database
      .prepare(
        `SELECT status, job_types_json, capabilities_json
         FROM connector_manifests WHERE connector_id = ? AND version = ?`,
      )
      .get(binding.connectorId, binding.version) as
      { status: string; job_types_json: string; capabilities_json: string } | undefined;
    if (!row) {
      throw new RegistryConflictError(
        "WORKER_CONNECTOR_NOT_FOUND",
        `Connector ${connectorIdentity(binding)} is not registered`,
      );
    }
    if (row.status === "DISABLED") {
      throw new RegistryConflictError(
        "WORKER_CONNECTOR_DISABLED",
        `Connector ${connectorIdentity(binding)} is disabled`,
      );
    }
    const manifestCapabilities = JSON.parse(row.capabilities_json) as ConnectorCapability[];
    const unsupported = binding.capabilities.filter(
      (capability) => !manifestCapabilities.includes(capability),
    );
    if (unsupported.length > 0) {
      throw new RegistryConflictError(
        "WORKER_CAPABILITY_MISMATCH",
        `Worker declares capabilities not present in ${connectorIdentity(binding)}`,
        { unsupported },
      );
    }
    for (const jobType of JSON.parse(row.job_types_json) as JobType[]) {
      manifestJobTypes.add(jobType);
    }
  }
  const unsupportedJobTypes = worker.supportedJobTypes.filter(
    (jobType) => !manifestJobTypes.has(jobType),
  );
  if (unsupportedJobTypes.length > 0) {
    throw new RegistryConflictError(
      "WORKER_JOB_TYPE_MISMATCH",
      "Worker declares JobTypes unsupported by its exact Connector bindings",
      { unsupportedJobTypes },
    );
  }
}

function jobWithStatus(job: Job, status: "PENDING" | "LEASED", timestamp: string): Job {
  const next = { ...clone(job), status, updatedAt: timestamp };
  if (!isJob(next)) {
    throw new RegistryValidationError("Job transition does not satisfy Execution Contract v1");
  }
  return next;
}

export function ensureWorkerRegistry(database: DatabaseSync): void {
  ensureExecutionLedger(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS worker_definitions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        desired_state TEXT NOT NULL,
        runtime_id TEXT NOT NULL,
        runtime_version TEXT NOT NULL,
        job_types_json TEXT NOT NULL,
        bindings_json TEXT NOT NULL,
        labels_json TEXT NOT NULL,
        max_concurrency INTEGER NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS worker_credentials (
        worker_id TEXT PRIMARY KEY,
        credential_digest TEXT NOT NULL,
        rotated_at TEXT NOT NULL,
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS worker_heartbeats (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        health TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        document_json TEXT NOT NULL,
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS job_leases (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        connector_id TEXT NOT NULL,
        connector_version TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        token_digest TEXT NOT NULL,
        document_json TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id),
        FOREIGN KEY (job_id) REFERENCES jobs(id),
        FOREIGN KEY (run_id) REFERENCES collection_runs(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_workers_workspace_state
        ON worker_definitions(workspace_id, desired_state, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workers_runtime
        ON worker_definitions(runtime_id, runtime_version);
      CREATE INDEX IF NOT EXISTS idx_heartbeats_worker_received
        ON worker_heartbeats(worker_id, received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_leases_worker_status
        ON job_leases(worker_id, status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_leases_job_status
        ON job_leases(job_id, status);
      CREATE INDEX IF NOT EXISTS idx_leases_run_status
        ON job_leases(run_id, status);
      CREATE INDEX IF NOT EXISTS idx_leases_expiration
        ON job_leases(status, expires_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_lease_per_job
        ON job_leases(job_id) WHERE status = 'ACTIVE';
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

export class SqliteWorkerRegistryRepository implements WorkerRegistryRepository {
  private readonly heartbeatFreshnessMs: number;
  private readonly heartbeatClockSkewMs: number;
  private readonly leaseDurationMs: number;
  private readonly maxLeaseLifetimeMs: number;

  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly workerIdFactory: () => string = () => generateWorkerId(),
    private readonly heartbeatIdFactory: () => string = () => generateHeartbeatId(),
    private readonly leaseIdFactory: () => string = () => generateLeaseId(),
    options: WorkerProtocolOptions = {},
  ) {
    ensureWorkerRegistry(database);
    this.heartbeatFreshnessMs = boundedDuration(
      options.heartbeatFreshnessMs,
      DEFAULT_HEARTBEAT_FRESHNESS_MS,
      "heartbeatFreshnessMs",
    );
    this.heartbeatClockSkewMs = boundedDuration(
      options.heartbeatClockSkewMs,
      DEFAULT_HEARTBEAT_CLOCK_SKEW_MS,
      "heartbeatClockSkewMs",
    );
    this.leaseDurationMs = boundedDuration(
      options.leaseDurationMs,
      DEFAULT_LEASE_DURATION_MS,
      "leaseDurationMs",
    );
    this.maxLeaseLifetimeMs = boundedDuration(
      options.maxLeaseLifetimeMs,
      DEFAULT_MAX_LEASE_LIFETIME_MS,
      "maxLeaseLifetimeMs",
    );
    if (this.maxLeaseLifetimeMs < this.leaseDurationMs) {
      throw new RegistryValidationError(
        "maxLeaseLifetimeMs must be greater than or equal to leaseDurationMs",
      );
    }
  }

  create(input: CreateWorkerInput): WorkerCreationResult {
    const timestamp = this.clock().toISOString();
    const worker = normalizeWorkerInput(input, this.workerIdFactory(), timestamp);
    validateWorkerBindings(this.database, worker);
    const credential = generateCredential();
    const row = workerRow(worker);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO worker_definitions (
             id, workspace_id, display_name, desired_state, runtime_id, runtime_version,
             job_types_json, bindings_json, labels_json, max_concurrency, document_json,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          row.workspaceId,
          row.displayName,
          row.desiredState,
          row.runtimeId,
          row.runtimeVersion,
          row.jobTypesJson,
          row.bindingsJson,
          row.labelsJson,
          row.maxConcurrency,
          row.documentJson,
          row.createdAt,
          row.updatedAt,
        );
      this.database
        .prepare(
          `INSERT INTO worker_credentials (worker_id, credential_digest, rotated_at)
           VALUES (?, ?, ?)`,
        )
        .run(worker.id, digestHex(credential), timestamp);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return { view: this.viewForWorker(worker), credential };
  }

  getById(id: string): WorkerRuntimeView | null {
    const row = this.database
      .prepare("SELECT document_json FROM worker_definitions WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    return row ? this.viewForWorker(parseWorker(row.document_json)) : null;
  }

  list(filters: WorkerListFilters = {}): WorkerListResult {
    if (filters.desiredState && !WORKER_DESIRED_STATES.includes(filters.desiredState)) {
      throw new RegistryValidationError("Unknown Worker desired state filter");
    }
    if (filters.effectiveStatus && !WORKER_STATUSES.includes(filters.effectiveStatus)) {
      throw new RegistryValidationError("Unknown Worker effective status filter");
    }
    if (filters.jobType && !JOB_TYPES.includes(filters.jobType)) {
      throw new RegistryValidationError("Unknown Worker JobType filter");
    }
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const clauses: string[] = [];
    const values: SQLInputValue[] = [];
    if (filters.q?.trim()) {
      const q = `%${filters.q.trim().toLowerCase()}%`;
      clauses.push("(lower(w.display_name) LIKE ? OR lower(w.id) LIKE ?)");
      values.push(q, q);
    }
    if (filters.workspaceId) {
      clauses.push("w.workspace_id = ?");
      values.push(filters.workspaceId);
    }
    if (filters.desiredState) {
      clauses.push("w.desired_state = ?");
      values.push(filters.desiredState);
    }
    if (filters.runtimeId) {
      clauses.push("w.runtime_id = ?");
      values.push(filters.runtimeId);
    }
    if (filters.connectorId) {
      clauses.push(
        "EXISTS (SELECT 1 FROM json_each(w.bindings_json) b WHERE json_extract(b.value, '$.connectorId') = ?)",
      );
      values.push(filters.connectorId);
    }
    if (filters.jobType) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(w.job_types_json) WHERE value = ?)");
      values.push(filters.jobType);
    }
    if (filters.label) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(w.labels_json) WHERE value = ?)");
      values.push(filters.label);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const all = this.database
      .prepare(
        `SELECT document_json FROM worker_definitions w ${where}
         ORDER BY w.updated_at DESC, w.id DESC`,
      )
      .all(...values)
      .map((row) =>
        this.viewForWorker(parseWorker((row as { document_json: string }).document_json)),
      );
    const filtered = filters.effectiveStatus
      ? all.filter((view) => view.effectiveStatus === filters.effectiveStatus)
      : all;
    const items = filtered.slice(offset, offset + limit);
    const summary = Object.fromEntries(WORKER_STATUSES.map((status) => [status, 0])) as Record<
      WorkerStatus,
      number
    >;
    for (const view of all) summary[view.effectiveStatus] += 1;
    const activeLeases = Number(
      (
        this.database
          .prepare("SELECT COUNT(*) AS count FROM job_leases WHERE status = 'ACTIVE'")
          .get() as { count: number }
      ).count,
    );
    const expiredLeases = Number(
      (
        this.database
          .prepare("SELECT COUNT(*) AS count FROM job_leases WHERE status = 'EXPIRED'")
          .get() as { count: number }
      ).count,
    );
    return {
      items,
      total: filtered.length,
      limit,
      offset,
      summary: {
        ...summary,
        total: all.length,
        activeLeases,
        expiredLeases,
      },
    };
  }

  update(id: string, input: UpdateWorkerInput, expectedUpdatedAt: string): WorkerRuntimeView {
    const row = this.database
      .prepare("SELECT document_json FROM worker_definitions WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    if (!row) throw new WorkerNotFoundError(id);
    const current = parseWorker(row.document_json);
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new RegistryConflictError(
        "WORKER_VERSION_CONFLICT",
        "The Worker changed after it was loaded. Refresh before saving.",
      );
    }
    const timestamp = this.clock().toISOString();
    const next = applyWorkerUpdate(current, input, timestamp);
    validateWorkerBindings(this.database, next);
    const nextRow = workerRow(next);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const result = this.database
        .prepare(
          `UPDATE worker_definitions SET
             display_name = ?, desired_state = ?, runtime_id = ?, runtime_version = ?,
             job_types_json = ?, bindings_json = ?, labels_json = ?, max_concurrency = ?,
             document_json = ?, updated_at = ?
           WHERE id = ? AND updated_at = ?`,
        )
        .run(
          nextRow.displayName,
          nextRow.desiredState,
          nextRow.runtimeId,
          nextRow.runtimeVersion,
          nextRow.jobTypesJson,
          nextRow.bindingsJson,
          nextRow.labelsJson,
          nextRow.maxConcurrency,
          nextRow.documentJson,
          nextRow.updatedAt,
          id,
          expectedUpdatedAt,
        );
      if (Number(result.changes) !== 1) {
        throw new RegistryConflictError(
          "WORKER_VERSION_CONFLICT",
          "The Worker changed after it was loaded. Refresh before saving.",
        );
      }
      if (next.desiredState === "DISABLED") {
        this.revokeActiveLeasesForWorker(id, timestamp, "Worker disabled by administrator");
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return this.viewForWorker(next);
  }

  rotateCredential(id: string): CredentialRotationResult {
    if (!this.getWorker(id)) throw new WorkerNotFoundError(id);
    const credential = generateCredential();
    const rotatedAt = this.clock().toISOString();
    this.database
      .prepare(
        `UPDATE worker_credentials SET credential_digest = ?, rotated_at = ?
         WHERE worker_id = ?`,
      )
      .run(digestHex(credential), rotatedAt, id);
    return { workerId: id, credential, rotatedAt };
  }

  verifyCredential(workerId: string, credential: string): WorkerDefinition {
    if (!credential || credential.length > 256) throw new WorkerAuthenticationError();
    const row = this.database
      .prepare(
        `SELECT w.document_json, c.credential_digest
         FROM worker_definitions w
         JOIN worker_credentials c ON c.worker_id = w.id
         WHERE w.id = ?`,
      )
      .get(workerId) as { document_json: string; credential_digest: string } | undefined;
    if (!row || !verifyDigest(credential, row.credential_digest)) {
      throw new WorkerAuthenticationError();
    }
    const worker = parseWorker(row.document_json);
    if (worker.desiredState === "DISABLED") {
      throw new WorkerAuthorizationError("WORKER_DISABLED", "Worker is disabled");
    }
    return worker;
  }

  heartbeat(input: HeartbeatInput, credential: string): WorkerRuntimeView {
    const worker = this.verifyCredential(input.workerId, credential);
    const now = this.clock();
    const observed = new Date(input.observedAt);
    if (Number.isNaN(observed.getTime())) {
      throw new RegistryValidationError("observedAt must be a valid RFC3339 timestamp");
    }
    if (Math.abs(now.getTime() - observed.getTime()) > this.heartbeatClockSkewMs) {
      throw new RegistryConflictError(
        "WORKER_CLOCK_SKEW",
        "Worker observedAt exceeds the permitted clock-skew threshold",
      );
    }
    const activeLeaseIds = [...new Set(input.activeLeaseIds ?? [])];
    for (const leaseId of activeLeaseIds) {
      const lease = this.getLease(leaseId);
      if (!lease || lease.status !== "ACTIVE") {
        throw new RegistryConflictError(
          "WORKER_HEARTBEAT_UNKNOWN_LEASE",
          `Heartbeat references unknown or inactive lease ${leaseId}`,
        );
      }
      if (lease.workerId !== worker.id) {
        throw new WorkerAuthorizationError(
          "WORKER_LEASE_OWNERSHIP",
          `Lease ${leaseId} belongs to another Worker`,
        );
      }
    }
    const heartbeat: WorkerHeartbeat = {
      contractVersion: WORKER_PROTOCOL_VERSION,
      objectType: "WORKER_HEARTBEAT",
      id: this.heartbeatIdFactory(),
      workerId: worker.id,
      workspaceId: worker.workspaceId,
      observedAt: observed.toISOString(),
      receivedAt: now.toISOString(),
      runtimeVersion: input.runtimeVersion.trim(),
      health: input.health,
      activeLeaseIds,
      ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
    };
    if (!isWorkerHeartbeat(heartbeat)) {
      throw new RegistryValidationError("Heartbeat does not satisfy Worker Protocol v1");
    }
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO worker_heartbeats (
             id, worker_id, workspace_id, health, observed_at, received_at, document_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          heartbeat.id,
          heartbeat.workerId,
          heartbeat.workspaceId,
          heartbeat.health,
          heartbeat.observedAt,
          heartbeat.receivedAt,
          JSON.stringify(heartbeat),
        );
      this.database
        .prepare(
          `DELETE FROM worker_heartbeats WHERE worker_id = ? AND id NOT IN (
             SELECT id FROM worker_heartbeats WHERE worker_id = ?
             ORDER BY received_at DESC, id DESC LIMIT ?
           )`,
        )
        .run(worker.id, worker.id, HEARTBEAT_HISTORY_LIMIT);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return this.viewForWorker(worker);
  }

  claim(workerId: string, credential: string): ClaimResult {
    this.verifyCredential(workerId, credential);
    const now = this.clock();
    const timestamp = now.toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.reapExpiredInTransaction(timestamp);
      const worker = this.getWorker(workerId);
      if (!worker) throw new WorkerNotFoundError(workerId);
      if (worker.desiredState !== "ACTIVE") {
        throw new WorkerAuthorizationError(
          "WORKER_NOT_ACTIVE",
          "Only an ACTIVE Worker may claim work",
        );
      }
      const view = this.viewForWorker(worker);
      if (view.effectiveStatus === "OFFLINE") {
        throw new RegistryConflictError(
          "WORKER_HEARTBEAT_STALE",
          "A fresh heartbeat is required before claiming work",
        );
      }
      if (view.effectiveStatus === "ERROR") {
        throw new RegistryConflictError(
          "WORKER_HEALTH_ERROR",
          "A Worker reporting ERROR health cannot claim work",
        );
      }
      if (view.activeLeaseCount >= worker.maxConcurrency) {
        throw new RegistryConflictError("WORKER_AT_CAPACITY", "Worker has reached maxConcurrency");
      }

      const candidates = this.database
        .prepare(
          `SELECT document_json FROM jobs
           WHERE status = 'PENDING' AND available_at <= ?
           ORDER BY
             CASE json_extract(document_json, '$.priority')
               WHEN 'CRITICAL' THEN 1
               WHEN 'HIGH' THEN 2
               WHEN 'NORMAL' THEN 3
               WHEN 'LOW' THEN 4
               ELSE 5
             END,
             available_at ASC,
             created_at ASC,
             id ASC
           LIMIT 250`,
        )
        .all(timestamp)
        .map((row) => parseJob((row as { document_json: string }).document_json));
      const job = candidates.find(
        (candidate) =>
          candidate.workspaceId === worker.workspaceId && workerCanRun(worker, candidate),
      );
      if (!job) {
        this.database.exec("COMMIT;");
        return { job: null, lease: null, leaseToken: null };
      }

      const leaseToken = generateLeaseToken();
      const lease: JobLease = {
        contractVersion: WORKER_PROTOCOL_VERSION,
        objectType: "JOB_LEASE",
        id: this.leaseIdFactory(),
        workspaceId: job.workspaceId,
        workerId: worker.id,
        jobId: job.id,
        runId: job.runId,
        jobType: job.jobType,
        connector: clone(job.connector),
        status: "ACTIVE",
        acquiredAt: timestamp,
        expiresAt: new Date(now.getTime() + this.leaseDurationMs).toISOString(),
        updatedAt: timestamp,
      };
      if (!isJobLease(lease)) {
        throw new RegistryValidationError("Lease does not satisfy Worker Protocol v1");
      }
      const leasedJob = jobWithStatus(job, "LEASED", timestamp);
      const leaseData = leaseRow(lease);
      const jobUpdate = this.database
        .prepare(
          `UPDATE jobs SET status = ?, document_json = ?, updated_at = ?
           WHERE id = ? AND status = 'PENDING'`,
        )
        .run(leasedJob.status, JSON.stringify(leasedJob), leasedJob.updatedAt, job.id);
      if (Number(jobUpdate.changes) !== 1) {
        throw new RegistryConflictError("JOB_CLAIM_CONFLICT", "Job was claimed by another Worker");
      }
      this.database
        .prepare(
          `INSERT INTO job_leases (
             id, workspace_id, worker_id, job_id, run_id, connector_id,
             connector_version, job_type, status, token_digest, document_json,
             acquired_at, expires_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          leaseData.id,
          leaseData.workspaceId,
          leaseData.workerId,
          leaseData.jobId,
          leaseData.runId,
          leaseData.connectorId,
          leaseData.connectorVersion,
          leaseData.jobType,
          leaseData.status,
          digestHex(leaseToken),
          leaseData.documentJson,
          leaseData.acquiredAt,
          leaseData.expiresAt,
          leaseData.updatedAt,
        );
      this.database.exec("COMMIT;");
      return { job: leasedJob, lease, leaseToken };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  renewLease(workerId: string, credential: string, leaseId: string, leaseToken: string): JobLease {
    this.verifyCredential(workerId, credential);
    const now = this.clock();
    const timestamp = now.toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const lease = this.requireOwnedActiveLease(workerId, leaseId, leaseToken);
      if (Date.parse(lease.expiresAt) <= now.getTime()) {
        this.expireLeaseInTransaction(lease, timestamp);
        throw new RegistryConflictError("LEASE_EXPIRED", "Lease has expired");
      }
      const hardLimit = Date.parse(lease.acquiredAt) + this.maxLeaseLifetimeMs;
      const expiresAt = new Date(
        Math.min(now.getTime() + this.leaseDurationMs, hardLimit),
      ).toISOString();
      if (Date.parse(expiresAt) <= now.getTime()) {
        this.expireLeaseInTransaction(lease, timestamp);
        throw new RegistryConflictError(
          "LEASE_MAX_LIFETIME_REACHED",
          "Lease reached its maximum lifetime",
        );
      }
      const next: JobLease = { ...lease, expiresAt, updatedAt: timestamp };
      this.updateLeaseDocument(next);
      this.database.exec("COMMIT;");
      return next;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  releaseLease(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    reason?: string,
  ): JobLease {
    this.verifyCredential(workerId, credential);
    const timestamp = this.clock().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const lease = this.requireOwnedActiveLease(workerId, leaseId, leaseToken);
      const next = this.closeLease(lease, "RELEASED", timestamp, reason ?? "Released by Worker");
      this.returnJobToPending(lease.jobId, timestamp);
      this.database.exec("COMMIT;");
      return next;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  reapExpired(): number {
    const timestamp = this.clock().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const count = this.reapExpiredInTransaction(timestamp);
      this.database.exec("COMMIT;");
      return count;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  listLeases(filters: LeaseListFilters = {}): LeaseListResult {
    if (filters.status && !JOB_LEASE_STATUSES.includes(filters.status)) {
      throw new RegistryValidationError("Unknown lease status filter");
    }
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const clauses: string[] = [];
    const values: SQLInputValue[] = [];
    if (filters.workerId) {
      clauses.push("worker_id = ?");
      values.push(filters.workerId);
    }
    if (filters.jobId) {
      clauses.push("job_id = ?");
      values.push(filters.jobId);
    }
    if (filters.runId) {
      clauses.push("run_id = ?");
      values.push(filters.runId);
    }
    if (filters.status) {
      clauses.push("status = ?");
      values.push(filters.status);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const items = this.database
      .prepare(
        `SELECT document_json FROM job_leases ${where}
         ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset)
      .map((row) => parseLease((row as { document_json: string }).document_json));
    const count = this.database
      .prepare(`SELECT COUNT(*) AS count FROM job_leases ${where}`)
      .get(...values) as { count: number };
    return { items, total: Number(count.count), limit, offset };
  }

  private getWorker(id: string): WorkerDefinition | null {
    const row = this.database
      .prepare("SELECT document_json FROM worker_definitions WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    return row ? parseWorker(row.document_json) : null;
  }

  private getLease(id: string): JobLease | null {
    const row = this.database
      .prepare("SELECT document_json FROM job_leases WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    return row ? parseLease(row.document_json) : null;
  }

  private latestHeartbeat(workerId: string): WorkerHeartbeat | null {
    const row = this.database
      .prepare(
        `SELECT document_json FROM worker_heartbeats
         WHERE worker_id = ? ORDER BY received_at DESC, id DESC LIMIT 1`,
      )
      .get(workerId) as { document_json: string } | undefined;
    return row ? parseHeartbeat(row.document_json) : null;
  }

  private activeLeases(workerId: string): JobLease[] {
    return this.database
      .prepare(
        `SELECT document_json FROM job_leases
         WHERE worker_id = ? AND status = 'ACTIVE'
         ORDER BY acquired_at ASC, id ASC`,
      )
      .all(workerId)
      .map((row) => parseLease((row as { document_json: string }).document_json));
  }

  private viewForWorker(worker: WorkerDefinition): WorkerRuntimeView {
    const latestHeartbeat = this.latestHeartbeat(worker.id);
    const activeLeases = this.activeLeases(worker.id);
    const effectiveStatus = this.effectiveStatus(worker, latestHeartbeat, activeLeases.length);
    return {
      worker,
      effectiveStatus,
      latestHeartbeat,
      activeLeaseCount: activeLeases.length,
      activeLeases,
    };
  }

  private effectiveStatus(
    worker: WorkerDefinition,
    heartbeat: WorkerHeartbeat | null,
    activeLeaseCount: number,
  ): WorkerStatus {
    if (worker.desiredState === "DISABLED") return "DISABLED";
    if (worker.desiredState === "DRAINING") return "DRAINING";
    if (
      !heartbeat ||
      this.clock().getTime() - Date.parse(heartbeat.receivedAt) > this.heartbeatFreshnessMs
    ) {
      return "OFFLINE";
    }
    if (heartbeat.health === "ERROR") return "ERROR";
    if (activeLeaseCount >= worker.maxConcurrency) return "BUSY";
    return "ONLINE";
  }

  private requireOwnedActiveLease(workerId: string, leaseId: string, leaseToken: string): JobLease {
    const row = this.database
      .prepare("SELECT document_json, token_digest FROM job_leases WHERE id = ?")
      .get(leaseId) as { document_json: string; token_digest: string } | undefined;
    if (!row) throw new LeaseNotFoundError(leaseId);
    const lease = parseLease(row.document_json);
    if (lease.workerId !== workerId) {
      throw new WorkerAuthorizationError(
        "WORKER_LEASE_OWNERSHIP",
        "Lease belongs to another Worker",
      );
    }
    if (!leaseToken || !verifyDigest(leaseToken, row.token_digest)) {
      throw new WorkerAuthenticationError("Lease token is missing or invalid");
    }
    if (lease.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "LEASE_NOT_ACTIVE",
        `Lease is ${lease.status} and cannot be changed`,
      );
    }
    return lease;
  }

  private closeLease(
    lease: JobLease,
    status: Exclude<JobLeaseStatus, "ACTIVE">,
    timestamp: string,
    reason: string,
  ): JobLease {
    const next: JobLease = {
      ...lease,
      status,
      updatedAt: timestamp,
      closedAt: timestamp,
      closeReason: reason.slice(0, 500),
    };
    if (!isJobLease(next)) {
      throw new RegistryValidationError("Closed lease does not satisfy Worker Protocol v1");
    }
    this.updateLeaseDocument(next);
    return next;
  }

  private updateLeaseDocument(lease: JobLease): void {
    this.database
      .prepare(
        `UPDATE job_leases SET status = ?, document_json = ?, expires_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(lease.status, JSON.stringify(lease), lease.expiresAt, lease.updatedAt, lease.id);
  }

  private returnJobToPending(jobId: string, timestamp: string): void {
    const row = this.database.prepare("SELECT document_json FROM jobs WHERE id = ?").get(jobId) as
      { document_json: string } | undefined;
    if (!row) return;
    const job = parseJob(row.document_json);
    if (job.status !== "LEASED") return;
    const pending = jobWithStatus(job, "PENDING", timestamp);
    this.database
      .prepare("UPDATE jobs SET status = ?, document_json = ?, updated_at = ? WHERE id = ?")
      .run(pending.status, JSON.stringify(pending), pending.updatedAt, pending.id);
  }

  private expireLeaseInTransaction(lease: JobLease, timestamp: string): void {
    this.closeLease(lease, "EXPIRED", timestamp, "Lease expired");
    this.returnJobToPending(lease.jobId, timestamp);
  }

  private reapExpiredInTransaction(timestamp: string): number {
    const expired = this.database
      .prepare(
        `SELECT document_json FROM job_leases
         WHERE status = 'ACTIVE' AND expires_at <= ?
         ORDER BY expires_at ASC, id ASC`,
      )
      .all(timestamp)
      .map((row) => parseLease((row as { document_json: string }).document_json));
    for (const lease of expired) this.expireLeaseInTransaction(lease, timestamp);
    return expired.length;
  }

  private revokeActiveLeasesForWorker(workerId: string, timestamp: string, reason: string): void {
    for (const lease of this.activeLeases(workerId)) {
      this.closeLease(lease, "REVOKED", timestamp, reason);
      this.returnJobToPending(lease.jobId, timestamp);
    }
  }
}

export function assertWorkerListFilters(filters: WorkerListFilters): void {
  if (filters.desiredState && !WORKER_DESIRED_STATES.includes(filters.desiredState)) {
    throw new RegistryValidationError("Unknown Worker desired state filter");
  }
  if (filters.effectiveStatus && !WORKER_STATUSES.includes(filters.effectiveStatus)) {
    throw new RegistryValidationError("Unknown Worker effective status filter");
  }
  if (filters.jobType && !JOB_TYPES.includes(filters.jobType)) {
    throw new RegistryValidationError("Unknown Worker JobType filter");
  }
}

export function assertHeartbeatInput(input: HeartbeatInput): void {
  if (!WORKER_HEALTH_STATES.includes(input.health)) {
    throw new RegistryValidationError("Unknown Worker health state");
  }
}

export function assertLeaseFilterValues(filters: LeaseListFilters): void {
  if (filters.status && !JOB_LEASE_STATUSES.includes(filters.status)) {
    throw new RegistryValidationError("Unknown lease status filter");
  }
}

export function workerProtocolWritesOnlyLeaseStates(status: string): boolean {
  return (
    JOB_STATUSES.includes(status as (typeof JOB_STATUSES)[number]) &&
    ["PENDING", "LEASED"].includes(status)
  );
}
