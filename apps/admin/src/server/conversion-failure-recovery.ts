import { randomBytes } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  isConversionRun,
  type ConversionFailure,
  type ConversionRun,
  type ConversionTrigger,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { getConversionRunLedgerRepository, getRegistryDatabase } from "./source-registry";

const MIGRATION_ID = "m11_conversion_failure_recovery";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_SECONDS = 60;
const DEFAULT_MAX_DELAY_SECONDS = 15 * 60;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

export const CONVERSION_RECOVERY_STATES = [
  "WAITING",
  "RUNNING",
  "RESOLVED",
  "DEAD_LETTERED",
] as const;
export type ConversionRecoveryState = (typeof CONVERSION_RECOVERY_STATES)[number];

export const CONVERSION_DEAD_LETTER_REASONS = [
  "NON_RETRYABLE_FAILURE",
  "RETRY_BUDGET_EXHAUSTED",
  "RETRY_RUN_CANCELLED",
  "DISPATCH_FAILED",
] as const;
export type ConversionDeadLetterReason = (typeof CONVERSION_DEAD_LETTER_REASONS)[number];

export type ConversionRecoveryCase = {
  objectType: "CONVERSION_RECOVERY_CASE";
  version: "1.0";
  id: string;
  workspaceId: string;
  rootRunId: string;
  latestRunId: string;
  rawArtifactId: string;
  conversionProfileId: string;
  originalTrigger: ConversionTrigger;
  state: ConversionRecoveryState;
  retryCount: number;
  maxRetries: number;
  operatorOverrideCount: number;
  retryable: boolean;
  lastFailureRunId: string;
  lastFailure: ConversionFailure;
  replacementRunIds: string[];
  nextRetryAt?: string;
  deadLetterReason?: ConversionDeadLetterReason;
  lastDispatchErrorCode?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  deadLetteredAt?: string;
};

export type ConversionRecoveryListFilters = {
  workspaceId: string;
  state?: ConversionRecoveryState;
  limit?: number;
  offset?: number;
};

export type ConversionRecoveryListResult = {
  items: ConversionRecoveryCase[];
  total: number;
  limit: number;
  offset: number;
  summary: Record<ConversionRecoveryState, number> & { total: number };
};

export type ConversionFailureReconciliationResult = {
  status: "COMPLETED";
  workspaceId: string;
  discovered: number;
  waiting: number;
  dispatched: number;
  replayed: number;
  resolved: number;
  deadLettered: number;
  failed: number;
  failures: Array<{ recoveryCaseId?: string; conversionRunId?: string; code: string }>;
};

export type ConversionFailureReconciliationOptions = {
  limit?: number;
  maxRetries?: number;
  now?: Date;
};

export type OperatorRetryInput = {
  workspaceId: string;
  actorId: string;
};

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

function recoveryCaseId(now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `crc_${timestamp}${encodeBase32(randomValue, 16)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRun(value: string): ConversionRun {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionRun(parsed)) {
    throw new RegistryValidationError("Persisted ConversionRun is invalid");
  }
  return parsed;
}

function parseRecoveryCase(value: string): ConversionRecoveryCase {
  const parsed = JSON.parse(value) as unknown;
  if (
    !record(parsed) ||
    parsed.objectType !== "CONVERSION_RECOVERY_CASE" ||
    parsed.version !== "1.0" ||
    typeof parsed.id !== "string" ||
    typeof parsed.workspaceId !== "string" ||
    typeof parsed.rootRunId !== "string" ||
    typeof parsed.latestRunId !== "string" ||
    typeof parsed.rawArtifactId !== "string" ||
    typeof parsed.conversionProfileId !== "string" ||
    !CONVERSION_RECOVERY_STATES.includes(parsed.state as ConversionRecoveryState) ||
    typeof parsed.retryCount !== "number" ||
    !Number.isInteger(parsed.retryCount) ||
    typeof parsed.maxRetries !== "number" ||
    !Number.isInteger(parsed.maxRetries) ||
    typeof parsed.operatorOverrideCount !== "number" ||
    !Number.isInteger(parsed.operatorOverrideCount) ||
    typeof parsed.retryable !== "boolean" ||
    typeof parsed.lastFailureRunId !== "string" ||
    !record(parsed.lastFailure) ||
    !Array.isArray(parsed.replacementRunIds) ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string"
  ) {
    throw new RegistryValidationError("Persisted ConversionRecoveryCase is invalid");
  }
  return parsed as unknown as ConversionRecoveryCase;
}

function normalizedLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value <= 0) {
    throw new RegistryValidationError("Conversion recovery limit must be positive");
  }
  return Math.min(value, MAX_LIMIT);
}

function normalizedOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new RegistryValidationError("Conversion recovery offset must be non-negative");
  }
  return value;
}

function normalizedMaxRetries(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_RETRIES;
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    throw new RegistryValidationError("maxRetries must be an integer between 0 and 10");
  }
  return value;
}

function workspace(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError("workspaceId is required");
  return normalized;
}

function actorId(value: string): string {
  const normalized = value.trim();
  if (!ACTOR.test(normalized)) throw new RegistryValidationError("Invalid recovery actorId");
  return normalized;
}

function failureOrUnknown(run: ConversionRun): ConversionFailure {
  return (
    run.failure ?? {
      kind: "UNKNOWN",
      code: "FAILED_WITHOUT_FAILURE_METADATA",
      message: "ConversionRun reached FAILED without failure metadata",
      retryable: false,
    }
  );
}

export function conversionFailureIsAutoRetryable(failure: ConversionFailure): boolean {
  if (failure.retryable) return true;
  if (["TIMEOUT", "WORKER_ERROR", "INPUT_UNAVAILABLE"].includes(failure.kind)) return true;
  if (failure.kind !== "CONVERTER_ERROR") return false;
  return /(TIMEOUT|TEMPORAR|UNAVAILABLE|NETWORK|RATE_LIMIT|THROTTL|RETRY)/i.test(failure.code);
}

export function conversionRetryDelaySeconds(
  retryCount: number,
  baseDelaySeconds = DEFAULT_BASE_DELAY_SECONDS,
  maxDelaySeconds = DEFAULT_MAX_DELAY_SECONDS,
): number {
  if (!Number.isInteger(retryCount) || retryCount < 0) {
    throw new RegistryValidationError("retryCount must be a non-negative integer");
  }
  return Math.min(baseDelaySeconds * 2 ** retryCount, maxDelaySeconds);
}

function nextRetryAt(failedAt: string, retryCount: number): string {
  const base = Date.parse(failedAt);
  if (!Number.isFinite(base)) throw new RegistryValidationError("Failure timestamp is invalid");
  return new Date(base + conversionRetryDelaySeconds(retryCount) * 1000).toISOString();
}

export function ensureConversionFailureRecovery(database: DatabaseSync): void {
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS conversion_recovery_cases (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        root_run_id TEXT NOT NULL UNIQUE,
        latest_run_id TEXT NOT NULL,
        raw_artifact_id TEXT NOT NULL,
        conversion_profile_id TEXT NOT NULL,
        state TEXT NOT NULL,
        retry_count INTEGER NOT NULL,
        max_retries INTEGER NOT NULL,
        next_retry_at TEXT,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT,
        dead_lettered_at TEXT,
        FOREIGN KEY (root_run_id) REFERENCES conversion_runs(id),
        FOREIGN KEY (latest_run_id) REFERENCES conversion_runs(id),
        FOREIGN KEY (raw_artifact_id) REFERENCES raw_artifacts(id),
        FOREIGN KEY (conversion_profile_id) REFERENCES conversion_profiles(id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_conversion_recovery_workspace_state_due
        ON conversion_recovery_cases(workspace_id, state, next_retry_at, updated_at);
      CREATE INDEX IF NOT EXISTS idx_conversion_recovery_latest_run
        ON conversion_recovery_cases(latest_run_id);
      CREATE INDEX IF NOT EXISTS idx_conversion_recovery_artifact
        ON conversion_recovery_cases(raw_artifact_id, updated_at DESC);
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

export function failedConversionRecoveryCandidateIds(
  database: DatabaseSync,
  workspaceId: string,
  limit = DEFAULT_LIMIT,
): string[] {
  const normalizedWorkspaceId = workspace(workspaceId);
  const normalized = normalizedLimit(limit);
  const rows = database
    .prepare(
      `SELECT r.id
       FROM conversion_runs r
       WHERE r.workspace_id = ?
         AND r.status = 'FAILED'
         AND NOT EXISTS (
           SELECT 1
           FROM conversion_recovery_cases c
           WHERE c.workspace_id = r.workspace_id
             AND (
               c.root_run_id = r.id
               OR c.latest_run_id = r.id
               OR EXISTS (
                 SELECT 1
                 FROM json_each(c.document_json, '$.replacementRunIds') replacements
                 WHERE replacements.value = r.id
               )
               OR r.idempotency_key LIKE 'failure-retry:' || c.id || ':%'
               OR r.idempotency_key LIKE 'operator-retry:' || c.id || ':%'
             )
         )
       ORDER BY r.updated_at ASC, r.id ASC
       LIMIT ?`,
    )
    .all(normalizedWorkspaceId, normalized) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

function getCase(
  database: DatabaseSync,
  id: string,
  workspaceId?: string,
): ConversionRecoveryCase | null {
  const row = database
    .prepare(
      `SELECT document_json FROM conversion_recovery_cases
       WHERE id = ? ${workspaceId ? "AND workspace_id = ?" : ""}`,
    )
    .get(...(workspaceId ? [id, workspaceId] : [id])) as { document_json: string } | undefined;
  return row ? parseRecoveryCase(row.document_json) : null;
}

function loadRun(database: DatabaseSync, id: string): ConversionRun {
  const row = database.prepare("SELECT document_json FROM conversion_runs WHERE id = ?").get(id) as
    { document_json: string } | undefined;
  if (!row) throw new RegistryError("CONVERSION_RUN_NOT_FOUND", `ConversionRun ${id} not found`);
  return parseRun(row.document_json);
}

function persistCase(database: DatabaseSync, value: ConversionRecoveryCase): void {
  const updated = database
    .prepare(
      `UPDATE conversion_recovery_cases SET
         latest_run_id = ?, state = ?, retry_count = ?, max_retries = ?, next_retry_at = ?,
         document_json = ?, updated_at = ?, resolved_at = ?, dead_lettered_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(
      value.latestRunId,
      value.state,
      value.retryCount,
      value.maxRetries,
      value.nextRetryAt ?? null,
      JSON.stringify(value),
      value.updatedAt,
      value.resolvedAt ?? null,
      value.deadLetteredAt ?? null,
      value.id,
      value.workspaceId,
    );
  if (updated.changes !== 1) {
    throw new RegistryConflictError(
      "CONVERSION_RECOVERY_CASE_UPDATE_FAILED",
      "Conversion recovery case changed concurrently",
    );
  }
}

function createCase(
  database: DatabaseSync,
  run: ConversionRun,
  now: string,
  maxRetries: number,
): ConversionRecoveryCase {
  const failure = failureOrUnknown(run);
  const autoRetryable = conversionFailureIsAutoRetryable(failure);
  const retryable = autoRetryable && maxRetries > 0;
  const value: ConversionRecoveryCase = {
    objectType: "CONVERSION_RECOVERY_CASE",
    version: "1.0",
    id: recoveryCaseId(),
    workspaceId: run.workspaceId,
    rootRunId: run.id,
    latestRunId: run.id,
    rawArtifactId: run.rawArtifactId,
    conversionProfileId: run.conversionProfileId,
    originalTrigger: run.trigger,
    state: retryable ? "WAITING" : "DEAD_LETTERED",
    retryCount: 0,
    maxRetries,
    operatorOverrideCount: 0,
    retryable,
    lastFailureRunId: run.id,
    lastFailure: clone(failure),
    replacementRunIds: [],
    ...(retryable ? { nextRetryAt: nextRetryAt(run.failedAt ?? run.updatedAt, 0) } : {}),
    ...(!retryable
      ? {
          deadLetterReason: autoRetryable
            ? ("RETRY_BUDGET_EXHAUSTED" as const)
            : ("NON_RETRYABLE_FAILURE" as const),
        }
      : {}),
    createdAt: now,
    updatedAt: now,
    ...(!retryable ? { deadLetteredAt: now } : {}),
  };
  database
    .prepare(
      `INSERT INTO conversion_recovery_cases
       (id, workspace_id, root_run_id, latest_run_id, raw_artifact_id, conversion_profile_id,
        state, retry_count, max_retries, next_retry_at, document_json, created_at, updated_at,
        resolved_at, dead_lettered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      value.id,
      value.workspaceId,
      value.rootRunId,
      value.latestRunId,
      value.rawArtifactId,
      value.conversionProfileId,
      value.state,
      value.retryCount,
      value.maxRetries,
      value.nextRetryAt ?? null,
      JSON.stringify(value),
      value.createdAt,
      value.updatedAt,
      null,
      value.deadLetteredAt ?? null,
    );
  return value;
}

function refreshedCase(
  value: ConversionRecoveryCase,
  latest: ConversionRun,
  now: string,
): ConversionRecoveryCase {
  if (latest.status === "COMPLETED") {
    return {
      ...value,
      state: "RESOLVED",
      retryable: false,
      updatedAt: now,
      resolvedAt: now,
      nextRetryAt: undefined,
      deadLetterReason: undefined,
      deadLetteredAt: undefined,
      lastDispatchErrorCode: undefined,
    };
  }
  if (latest.status === "CANCELLED") {
    return {
      ...value,
      state: "DEAD_LETTERED",
      retryable: false,
      updatedAt: now,
      nextRetryAt: undefined,
      deadLetterReason: "RETRY_RUN_CANCELLED",
      deadLetteredAt: now,
    };
  }
  if (latest.status === "FAILED") {
    const failure = failureOrUnknown(latest);
    const retryable = conversionFailureIsAutoRetryable(failure);
    const budgetRemaining = value.retryCount < value.maxRetries;
    if (retryable && budgetRemaining) {
      return {
        ...value,
        state: "WAITING",
        retryable: true,
        lastFailureRunId: latest.id,
        lastFailure: clone(failure),
        nextRetryAt: nextRetryAt(latest.failedAt ?? latest.updatedAt, value.retryCount),
        deadLetterReason: undefined,
        deadLetteredAt: undefined,
        lastDispatchErrorCode: undefined,
        updatedAt: now,
      };
    }
    return {
      ...value,
      state: "DEAD_LETTERED",
      retryable: false,
      lastFailureRunId: latest.id,
      lastFailure: clone(failure),
      nextRetryAt: undefined,
      deadLetterReason: retryable ? "RETRY_BUDGET_EXHAUSTED" : "NON_RETRYABLE_FAILURE",
      deadLetteredAt: now,
      updatedAt: now,
    };
  }
  return {
    ...value,
    state: "RUNNING",
    retryable: true,
    nextRetryAt: undefined,
    updatedAt: now,
  };
}

function refreshCase(database: DatabaseSync, value: ConversionRecoveryCase, now: string) {
  if (value.state === "RESOLVED" || value.state === "DEAD_LETTERED") return value;
  const latest = loadRun(database, value.latestRunId);
  const next = refreshedCase(value, latest, now);
  if (JSON.stringify(next) !== JSON.stringify(value)) persistCase(database, next);
  return next;
}

function dispatchErrorCode(error: unknown): string {
  if (error instanceof RegistryError) return error.code;
  if (error instanceof Error && error.name) return error.name;
  return "CONVERSION_RETRY_DISPATCH_FAILED";
}

function dispatchRetry(
  database: DatabaseSync,
  value: ConversionRecoveryCase,
  now: string,
  options: { operator: boolean; actorId?: string },
): { recoveryCase: ConversionRecoveryCase; replayed: boolean; conversionRunId: string } {
  const latest = loadRun(database, value.latestRunId);
  if (latest.status !== "FAILED" && latest.status !== "CANCELLED") {
    throw new RegistryConflictError(
      "CONVERSION_RECOVERY_LATEST_RUN_NOT_TERMINAL",
      "Recovery retry requires a FAILED or CANCELLED latest ConversionRun",
    );
  }
  const ordinal = options.operator ? value.operatorOverrideCount + 1 : value.retryCount + 1;
  const prefix = options.operator ? "operator-retry" : "failure-retry";
  const actor = options.operator
    ? { type: "ADMIN" as const, id: actorId(options.actorId ?? "local-admin") }
    : { type: "SYSTEM" as const, id: "conversion-failure-recovery" };
  const dispatch = getConversionRunLedgerRepository().dispatchManual({
    workspaceId: value.workspaceId,
    rawArtifactId: value.rawArtifactId,
    conversionProfileId: value.conversionProfileId,
    requestedOutput: clone(latest.requestedOutput),
    trigger: value.originalTrigger,
    actor,
    idempotencyKey: `${prefix}:${value.id}:${ordinal}`,
  });
  const replacementRunId = dispatch.record.run.id;
  const replacements = value.replacementRunIds.includes(replacementRunId)
    ? value.replacementRunIds
    : [...value.replacementRunIds, replacementRunId];
  const next: ConversionRecoveryCase = {
    ...value,
    latestRunId: replacementRunId,
    state: "RUNNING",
    retryable: true,
    retryCount: options.operator ? value.retryCount : ordinal,
    operatorOverrideCount: options.operator ? ordinal : value.operatorOverrideCount,
    replacementRunIds: replacements,
    nextRetryAt: undefined,
    deadLetterReason: undefined,
    deadLetteredAt: undefined,
    lastDispatchErrorCode: undefined,
    updatedAt: now,
  };
  persistCase(database, next);
  return { recoveryCase: next, replayed: dispatch.replayed, conversionRunId: replacementRunId };
}

function deadLetterDispatchFailure(
  database: DatabaseSync,
  value: ConversionRecoveryCase,
  now: string,
  error: unknown,
): ConversionRecoveryCase {
  const next: ConversionRecoveryCase = {
    ...value,
    state: "DEAD_LETTERED",
    retryable: false,
    nextRetryAt: undefined,
    deadLetterReason: "DISPATCH_FAILED",
    deadLetteredAt: now,
    lastDispatchErrorCode: dispatchErrorCode(error),
    updatedAt: now,
  };
  persistCase(database, next);
  return next;
}

function openCases(
  database: DatabaseSync,
  workspaceId: string,
  limit: number,
): ConversionRecoveryCase[] {
  const rows = database
    .prepare(
      `SELECT document_json FROM conversion_recovery_cases
       WHERE workspace_id = ? AND state IN ('WAITING', 'RUNNING')
       ORDER BY updated_at ASC, id ASC LIMIT ?`,
    )
    .all(workspaceId, limit) as Array<{ document_json: string }>;
  return rows.map((row) => parseRecoveryCase(row.document_json));
}

function dueCases(
  database: DatabaseSync,
  workspaceId: string,
  now: string,
  limit: number,
): ConversionRecoveryCase[] {
  const rows = database
    .prepare(
      `SELECT document_json FROM conversion_recovery_cases
       WHERE workspace_id = ? AND state = 'WAITING' AND next_retry_at <= ?
       ORDER BY next_retry_at ASC, id ASC LIMIT ?`,
    )
    .all(workspaceId, now, limit) as Array<{ document_json: string }>;
  return rows.map((row) => parseRecoveryCase(row.document_json));
}

export function reconcileConversionFailures(
  workspaceId: string,
  options: ConversionFailureReconciliationOptions = {},
): ConversionFailureReconciliationResult {
  const normalizedWorkspaceId = workspace(workspaceId);
  const limit = normalizedLimit(options.limit);
  const maxRetries = normalizedMaxRetries(options.maxRetries);
  const now = (options.now ?? new Date()).toISOString();

  // Ensure conversion tables exist before creating the M11 recovery ledger with foreign keys.
  getConversionRunLedgerRepository();
  const database = getRegistryDatabase();
  ensureConversionFailureRecovery(database);

  const result: ConversionFailureReconciliationResult = {
    status: "COMPLETED",
    workspaceId: normalizedWorkspaceId,
    discovered: 0,
    waiting: 0,
    dispatched: 0,
    replayed: 0,
    resolved: 0,
    deadLettered: 0,
    failed: 0,
    failures: [],
  };

  for (const current of openCases(database, normalizedWorkspaceId, limit)) {
    try {
      const refreshed = refreshCase(database, current, now);
      if (refreshed.state === "WAITING") result.waiting += 1;
      if (refreshed.state === "RESOLVED" && current.state !== "RESOLVED") result.resolved += 1;
      if (refreshed.state === "DEAD_LETTERED" && current.state !== "DEAD_LETTERED") {
        result.deadLettered += 1;
      }
    } catch (error) {
      result.failed += 1;
      if (result.failures.length < 10) {
        result.failures.push({ recoveryCaseId: current.id, code: dispatchErrorCode(error) });
      }
    }
  }

  const candidateIds = failedConversionRecoveryCandidateIds(database, normalizedWorkspaceId, limit);
  for (const runId of candidateIds) {
    try {
      const run = loadRun(database, runId);
      const value = createCase(database, run, now, maxRetries);
      result.discovered += 1;
      if (value.state === "WAITING") result.waiting += 1;
      else result.deadLettered += 1;
    } catch (error) {
      result.failed += 1;
      if (result.failures.length < 10) {
        result.failures.push({ conversionRunId: runId, code: dispatchErrorCode(error) });
      }
    }
  }

  for (const value of dueCases(database, normalizedWorkspaceId, now, limit)) {
    try {
      const dispatched = dispatchRetry(database, value, now, { operator: false });
      if (dispatched.replayed) result.replayed += 1;
      else result.dispatched += 1;
    } catch (error) {
      try {
        deadLetterDispatchFailure(database, value, now, error);
        result.deadLettered += 1;
      } catch {
        // Keep the original dispatch failure as the observable error if dead-letter persistence also fails.
      }
      result.failed += 1;
      if (result.failures.length < 10) {
        result.failures.push({ recoveryCaseId: value.id, code: dispatchErrorCode(error) });
      }
    }
  }

  return result;
}

export function listConversionRecoveryCases(
  filters: ConversionRecoveryListFilters,
): ConversionRecoveryListResult {
  const normalizedWorkspaceId = workspace(filters.workspaceId);
  const limit = normalizedLimit(filters.limit);
  const offset = normalizedOffset(filters.offset);
  if (filters.state && !CONVERSION_RECOVERY_STATES.includes(filters.state)) {
    throw new RegistryValidationError("Unknown conversion recovery state");
  }
  getConversionRunLedgerRepository();
  const database = getRegistryDatabase();
  ensureConversionFailureRecovery(database);

  const clauses = ["workspace_id = ?"];
  const values: SQLInputValue[] = [normalizedWorkspaceId];
  if (filters.state) {
    clauses.push("state = ?");
    values.push(filters.state);
  }
  const where = clauses.join(" AND ");
  const rows = database
    .prepare(
      `SELECT document_json FROM conversion_recovery_cases
       WHERE ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...values, limit, offset) as Array<{ document_json: string }>;
  const total = Number(
    (
      database
        .prepare(`SELECT COUNT(*) AS count FROM conversion_recovery_cases WHERE ${where}`)
        .get(...values) as { count: number }
    ).count,
  );
  const summaryRows = database
    .prepare(
      `SELECT state, COUNT(*) AS count FROM conversion_recovery_cases
       WHERE workspace_id = ? GROUP BY state`,
    )
    .all(normalizedWorkspaceId) as Array<{ state: ConversionRecoveryState; count: number }>;
  const summary = Object.fromEntries(
    CONVERSION_RECOVERY_STATES.map((state) => [state, 0]),
  ) as Record<ConversionRecoveryState, number>;
  for (const row of summaryRows) {
    if (CONVERSION_RECOVERY_STATES.includes(row.state)) summary[row.state] = Number(row.count);
  }
  return {
    items: rows.map((row) => parseRecoveryCase(row.document_json)),
    total,
    limit,
    offset,
    summary: { ...summary, total: Object.values(summary).reduce((sum, count) => sum + count, 0) },
  };
}

export function retryConversionRecoveryCaseNow(
  recoveryCaseId: string,
  input: OperatorRetryInput,
): { recoveryCase: ConversionRecoveryCase; replayed: boolean; conversionRunId: string } {
  const normalizedWorkspaceId = workspace(input.workspaceId);
  const normalizedActorId = actorId(input.actorId);
  getConversionRunLedgerRepository();
  const database = getRegistryDatabase();
  ensureConversionFailureRecovery(database);
  const value = getCase(database, recoveryCaseId, normalizedWorkspaceId);
  if (!value) {
    throw new RegistryError(
      "CONVERSION_RECOVERY_CASE_NOT_FOUND",
      `Conversion recovery case ${recoveryCaseId} was not found`,
    );
  }
  if (value.state !== "WAITING" && value.state !== "DEAD_LETTERED") {
    throw new RegistryConflictError(
      "CONVERSION_RECOVERY_CASE_NOT_RETRYABLE",
      "Only WAITING or DEAD_LETTERED recovery cases may be retried by an operator",
    );
  }
  return dispatchRetry(database, value, new Date().toISOString(), {
    operator: true,
    actorId: normalizedActorId,
  });
}
