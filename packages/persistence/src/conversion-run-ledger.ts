import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  CONVERSION_EXECUTION_VERSION,
  CONVERSION_TRIGGERS,
  canTransitionConversionRun,
  converterAccepts,
  forbiddenConversionExecutionField,
  isConversionExecutionEvent,
  isConversionRun,
  isConversionProfile,
  isConverterManifest,
  mimePatternMatches,
  type ConversionActor,
  type ConversionExecutionEvent,
  type ConversionRun,
  type ConversionRunStatus,
  type ConversionTrigger,
  type RawArtifact,
  isRawArtifact,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryError, RegistryValidationError } from "./index";
import { ensureRawArtifactRegistry } from "./raw-artifact-registry";
import { ensureConverterRegistry } from "./converter-registry";

const MIGRATION_ID = "0009_conversion_run_ledger";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export type ManualConversionDispatchInput = {
  workspaceId: string;
  rawArtifactId: string;
  conversionProfileId: string;
  requestedOutput: ConversionRun["requestedOutput"];
  trigger?: ConversionTrigger;
  actor?: ConversionActor;
  idempotencyKey: string;
};
export type CancelConversionRunInput = {
  workspaceId: string;
  actor?: ConversionActor;
  message?: string;
};
export type ConversionRunListFilters = {
  workspaceId?: string;
  sourceId?: string;
  rawArtifactId?: string;
  conversionProfileId?: string;
  converterId?: string;
  status?: ConversionRunStatus;
  trigger?: ConversionTrigger;
  limit?: number;
  offset?: number;
};
export type ConversionRunRecord = { run: ConversionRun; events: ConversionExecutionEvent[] };
export type ConversionRunListResult = {
  items: ConversionRun[];
  total: number;
  limit: number;
  offset: number;
};
export type ManualConversionDispatchResult = { record: ConversionRunRecord; replayed: boolean };

export interface ConversionRunLedgerRepository {
  dispatchManual(input: ManualConversionDispatchInput): ManualConversionDispatchResult;
  list(filters?: ConversionRunListFilters): ConversionRunListResult;
  getById(id: string, workspaceId?: string): ConversionRunRecord | null;
  listEvents(runId: string): ConversionExecutionEvent[];
  cancel(id: string, input: CancelConversionRunInput): ConversionRunRecord;
}

export class ConversionRunNotFoundError extends RegistryError {
  constructor(id: string) {
    super("CONVERSION_RUN_NOT_FOUND", `ConversionRun ${id} was not found`, { id });
  }
}

function encodeBase32(value: bigint, length: number): string {
  let out = "";
  let rem = value;
  for (let i = 0; i < length; i += 1) {
    out = CROCKFORD[Number(rem & 31n)] + out;
    rem >>= 5n;
  }
  return out;
}
function typedId(prefix: "cvr" | "cve", now = Date.now()): string {
  const ts = encodeBase32(BigInt(now), 10);
  const rnd = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${ts}${encodeBase32(rnd, 16)}`;
}
export function generateConversionRunId(now = Date.now()): string {
  return typedId("cvr", now);
}
export function generateConversionEventId(now = Date.now()): string {
  return typedId("cve", now);
}
function parseRun(value: string): ConversionRun {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionRun(parsed))
    throw new RegistryValidationError("Persisted ConversionRun is invalid");
  return parsed;
}
function parseEvent(value: string): ConversionExecutionEvent {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionExecutionEvent(parsed))
    throw new RegistryValidationError("Persisted ConversionExecutionEvent is invalid");
  return parsed;
}
function parseArtifact(value: string): RawArtifact {
  const parsed = JSON.parse(value) as unknown;
  if (!isRawArtifact(parsed)) throw new RegistryValidationError("Persisted RawArtifact is invalid");
  return parsed;
}
function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function digest(value: unknown): string {
  return createHash("sha256").update(stable(value), "utf8").digest("hex");
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function limit(value?: number): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value <= 0)
    throw new RegistryValidationError("limit must be positive");
  return Math.min(value, MAX_LIMIT);
}
function offset(value?: number): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0)
    throw new RegistryValidationError("offset must be non-negative");
  return value;
}
function actor(value?: ConversionActor): ConversionActor {
  const a = value ?? { type: "ADMIN", id: "local-admin" };
  if (
    !(["ADMIN", "SYSTEM", "WORKER"] as const).includes(a.type) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(a.id)
  )
    throw new RegistryValidationError("Invalid conversion actor");
  return a;
}
function key(value: string): string {
  const v = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(v))
    throw new RegistryValidationError("Invalid idempotency key");
  return v;
}

export function ensureConversionRunLedger(database: DatabaseSync): void {
  ensureRawArtifactRegistry(database);
  ensureConverterRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS conversion_runs (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_id TEXT NOT NULL,
        raw_artifact_id TEXT NOT NULL, conversion_profile_id TEXT NOT NULL,
        converter_id TEXT NOT NULL, converter_version TEXT NOT NULL, status TEXT NOT NULL,
        trigger_type TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        dispatch_intent_digest TEXT NOT NULL, document_json TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, cancelled_at TEXT, terminal_at TEXT,
        FOREIGN KEY (raw_artifact_id) REFERENCES raw_artifacts(id),
        FOREIGN KEY (conversion_profile_id) REFERENCES conversion_profiles(id),
        UNIQUE (workspace_id, idempotency_key)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS conversion_execution_events (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, sequence INTEGER NOT NULL CHECK (sequence > 0),
        event_type TEXT NOT NULL, previous_status TEXT, resulting_status TEXT NOT NULL,
        document_json TEXT NOT NULL, occurred_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES conversion_runs(id), UNIQUE (run_id, sequence)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_conversion_runs_workspace_status ON conversion_runs(workspace_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversion_runs_artifact ON conversion_runs(raw_artifact_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversion_runs_profile ON conversion_runs(conversion_profile_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversion_runs_converter ON conversion_runs(converter_id, converter_version, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversion_runs_trigger ON conversion_runs(trigger_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversion_events_run ON conversion_execution_events(run_id, sequence);
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

export class SqliteConversionRunLedgerRepository implements ConversionRunLedgerRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly runId: () => string = () => generateConversionRunId(),
    private readonly eventId: () => string = () => generateConversionEventId(),
  ) {
    ensureConversionRunLedger(database);
  }
  dispatchManual(input: ManualConversionDispatchInput): ManualConversionDispatchResult {
    const idempotencyKey = key(input.idempotencyKey);
    const trigger = input.trigger ?? "MANUAL";
    if (!CONVERSION_TRIGGERS.includes(trigger))
      throw new RegistryValidationError("Invalid conversion trigger");
    const rawRow = this.database
      .prepare("SELECT document_json FROM raw_artifacts WHERE id = ?")
      .get(input.rawArtifactId) as { document_json: string } | undefined;
    if (!rawRow) throw new RegistryError("RAW_ARTIFACT_NOT_FOUND", "RawArtifact was not found");
    const artifact = parseArtifact(rawRow.document_json);
    if (artifact.workspaceId !== input.workspaceId)
      throw new RegistryConflictError(
        "CONVERSION_ARTIFACT_WORKSPACE_MISMATCH",
        "RawArtifact belongs to another Workspace",
      );
    if (artifact.status !== "READY_FOR_CONVERSION")
      throw new RegistryConflictError(
        "CONVERSION_ARTIFACT_NOT_AVAILABLE",
        "RawArtifact is not available for conversion",
      );
    const profileRow = this.database
      .prepare("SELECT document_json FROM conversion_profiles WHERE id = ?")
      .get(input.conversionProfileId) as { document_json: string } | undefined;
    if (!profileRow)
      throw new RegistryError("CONVERSION_PROFILE_NOT_FOUND", "ConversionProfile was not found");
    const profile = JSON.parse(profileRow.document_json) as unknown;
    if (!isConversionProfile(profile))
      throw new RegistryValidationError("Persisted ConversionProfile is invalid");
    if (profile.status !== "ACTIVE")
      throw new RegistryConflictError(
        "CONVERSION_PROFILE_NOT_ACTIVE",
        "ConversionProfile must be ACTIVE",
      );
    if (profile.workspaceId !== input.workspaceId)
      throw new RegistryConflictError(
        "CONVERSION_PROFILE_WORKSPACE_MISMATCH",
        "ConversionProfile belongs to another Workspace",
      );
    if (profile.sourceId && profile.sourceId !== artifact.sourceId)
      throw new RegistryConflictError(
        "CONVERSION_PROFILE_SOURCE_MISMATCH",
        "ConversionProfile Source scope does not match RawArtifact",
      );
    const manifestRow = this.database
      .prepare(
        "SELECT document_json FROM converter_manifests WHERE converter_id = ? AND version = ?",
      )
      .get(profile.converter.converterId, profile.converter.version) as
      { document_json: string } | undefined;
    if (!manifestRow)
      throw new RegistryError("CONVERTER_NOT_FOUND", "ConverterManifest was not found");
    const manifest = JSON.parse(manifestRow.document_json) as unknown;
    if (!isConverterManifest(manifest))
      throw new RegistryValidationError("Persisted ConverterManifest is invalid");
    if (manifest.status !== "ACTIVE")
      throw new RegistryConflictError("CONVERTER_NOT_ACTIVE", "ConverterManifest must be ACTIVE");
    const inputEvidence = {
      artifactId: artifact.id,
      artifactKind: artifact.artifactKind,
      mimeType: artifact.mimeType,
      sha256: artifact.binaryHash.value,
      sizeBytes: artifact.sizeBytes,
    };
    if (
      !profile.input.artifactKinds.includes(artifact.artifactKind) ||
      !profile.input.mimePatterns.some((p) => mimePatternMatches(p, artifact.mimeType)) ||
      !converterAccepts(manifest, artifact.artifactKind, artifact.mimeType)
    )
      throw new RegistryConflictError(
        "CONVERSION_INPUT_INCOMPATIBLE",
        "RawArtifact is not compatible with the selected ConversionProfile and ConverterManifest",
      );
    if (
      input.requestedOutput.format !== profile.outputFormat ||
      input.requestedOutput.format !== manifest.outputFormat ||
      input.requestedOutput.targetPathTemplate !== profile.targetPathTemplate
    )
      throw new RegistryConflictError(
        "CONVERSION_OUTPUT_INCOMPATIBLE",
        "Requested output must match the Profile and ConverterManifest",
      );
    const timestamp = this.clock().toISOString();
    const run: ConversionRun = {
      contractVersion: CONVERSION_EXECUTION_VERSION,
      objectType: "CONVERSION_RUN",
      id: this.runId(),
      workspaceId: input.workspaceId,
      sourceId: artifact.sourceId,
      rawArtifactId: artifact.id,
      conversionProfileId: profile.id,
      conversionProfileSnapshot: clone(profile),
      converter: clone(profile.converter),
      converterManifestSnapshot: clone(manifest),
      input: inputEvidence,
      trigger,
      actor: actor(input.actor),
      idempotencyKey,
      requestedOutput: clone(input.requestedOutput),
      status: "PENDING",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const intentDigest = digest({
      workspaceId: run.workspaceId,
      rawArtifactId: run.rawArtifactId,
      conversionProfileId: run.conversionProfileId,
      requestedOutput: run.requestedOutput,
      trigger: run.trigger,
      input: run.input,
    });
    const event: ConversionExecutionEvent = {
      contractVersion: CONVERSION_EXECUTION_VERSION,
      objectType: "CONVERSION_EXECUTION_EVENT",
      id: this.eventId(),
      runId: run.id,
      sequence: 1,
      eventType: "CREATED",
      previousStatus: null,
      resultingStatus: "PENDING",
      occurredAt: timestamp,
      actor: run.actor,
      message: "Awaiting conversion runtime",
    };
    if (
      !isConversionRun(run) ||
      !isConversionExecutionEvent(event) ||
      forbiddenConversionExecutionField(run) ||
      forbiddenConversionExecutionField(event)
    )
      throw new RegistryValidationError(
        "ConversionRun dispatch violates Conversion Execution Protocol v1",
      );
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO conversion_runs (id,workspace_id,source_id,raw_artifact_id,conversion_profile_id,converter_id,converter_version,status,trigger_type,idempotency_key,dispatch_intent_digest,document_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          run.id,
          run.workspaceId,
          run.sourceId,
          run.rawArtifactId,
          run.conversionProfileId,
          run.converter.converterId,
          run.converter.version,
          run.status,
          run.trigger,
          run.idempotencyKey,
          intentDigest,
          JSON.stringify(run),
          run.createdAt,
          run.updatedAt,
        );
      this.database
        .prepare(
          `INSERT INTO conversion_execution_events (id,run_id,sequence,event_type,previous_status,resulting_status,document_json,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(
          event.id,
          event.runId,
          event.sequence,
          event.eventType,
          event.previousStatus,
          event.resultingStatus,
          JSON.stringify(event),
          event.occurredAt,
        );
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
        const existing = this.database
          .prepare(
            "SELECT document_json, dispatch_intent_digest FROM conversion_runs WHERE workspace_id = ? AND idempotency_key = ?",
          )
          .get(input.workspaceId, idempotencyKey) as
          { document_json: string; dispatch_intent_digest: string } | undefined;
        if (existing) {
          if (existing.dispatch_intent_digest !== intentDigest)
            throw new RegistryConflictError(
              "CONVERSION_IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for a different conversion intent",
            );
          const run = parseRun(existing.document_json);
          return { record: { run, events: this.listEvents(run.id) }, replayed: true };
        }
      }
      throw error;
    }
    return { record: { run, events: [event] }, replayed: false };
  }
  list(filters: ConversionRunListFilters = {}): ConversionRunListResult {
    const lim = limit(filters.limit),
      off = offset(filters.offset);
    const clauses: string[] = [];
    const values: SQLInputValue[] = [];
    const eq = (c: string, v?: string) => {
      if (v) {
        clauses.push(`${c} = ?`);
        values.push(v);
      }
    };
    eq("workspace_id", filters.workspaceId);
    eq("source_id", filters.sourceId);
    eq("raw_artifact_id", filters.rawArtifactId);
    eq("conversion_profile_id", filters.conversionProfileId);
    eq("converter_id", filters.converterId);
    eq("status", filters.status);
    eq("trigger_type", filters.trigger);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT document_json FROM conversion_runs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...values, lim, off) as { document_json: string }[];
    const total = Number(
      (
        this.database
          .prepare(`SELECT COUNT(*) AS count FROM conversion_runs ${where}`)
          .get(...values) as { count: number }
      ).count,
    );
    return { items: rows.map((r) => parseRun(r.document_json)), total, limit: lim, offset: off };
  }
  getById(id: string, workspaceId?: string): ConversionRunRecord | null {
    const row = this.database
      .prepare(
        `SELECT document_json FROM conversion_runs WHERE id = ? ${workspaceId ? "AND workspace_id = ?" : ""}`,
      )
      .get(...(workspaceId ? [id, workspaceId] : [id])) as { document_json: string } | undefined;
    if (!row) return null;
    const run = parseRun(row.document_json);
    return { run, events: this.listEvents(run.id) };
  }
  listEvents(runId: string): ConversionExecutionEvent[] {
    const rows = this.database
      .prepare(
        "SELECT document_json FROM conversion_execution_events WHERE run_id = ? ORDER BY sequence ASC",
      )
      .all(runId) as { document_json: string }[];
    return rows.map((r) => parseEvent(r.document_json));
  }
  cancel(id: string, input: CancelConversionRunInput): ConversionRunRecord {
    const current = this.getById(id, input.workspaceId);
    if (!current) throw new ConversionRunNotFoundError(id);
    if (current.run.status !== "PENDING")
      throw new RegistryConflictError(
        "CONVERSION_RUN_NOT_CANCELLABLE",
        "Only PENDING ConversionRuns can be cancelled",
      );
    if (!canTransitionConversionRun("PENDING", "CANCELLED"))
      throw new RegistryValidationError("Illegal conversion transition");
    const timestamp = this.clock().toISOString();
    const next: ConversionRun = {
      ...current.run,
      status: "CANCELLED",
      updatedAt: timestamp,
      cancelledAt: timestamp,
    };
    const event: ConversionExecutionEvent = {
      contractVersion: CONVERSION_EXECUTION_VERSION,
      objectType: "CONVERSION_EXECUTION_EVENT",
      id: this.eventId(),
      runId: next.id,
      sequence: current.events.length + 1,
      eventType: "CANCELLED",
      previousStatus: "PENDING",
      resultingStatus: "CANCELLED",
      occurredAt: timestamp,
      actor: actor(input.actor),
      ...(input.message ? { message: input.message } : {}),
    };
    if (!isConversionRun(next) || !isConversionExecutionEvent(event))
      throw new RegistryValidationError("Cancellation violates Conversion Execution Protocol v1");
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const row = this.database
        .prepare("SELECT document_json FROM conversion_runs WHERE id = ? AND workspace_id = ?")
        .get(id, input.workspaceId) as { document_json: string } | undefined;
      if (!row) throw new ConversionRunNotFoundError(id);
      const lockedRun = parseRun(row.document_json);
      if (lockedRun.status !== "PENDING")
        throw new RegistryConflictError(
          "CONVERSION_RUN_NOT_CANCELLABLE",
          "Only PENDING ConversionRuns can be cancelled",
        );
      const lockedEvents = this.listEvents(id);
      const lockedNext: ConversionRun = {
        ...lockedRun,
        status: "CANCELLED",
        updatedAt: timestamp,
        cancelledAt: timestamp,
      };
      const lockedEvent: ConversionExecutionEvent = {
        ...event,
        runId: lockedNext.id,
        sequence: lockedEvents.length + 1,
      };
      if (!isConversionRun(lockedNext) || !isConversionExecutionEvent(lockedEvent))
        throw new RegistryValidationError("Cancellation violates Conversion Execution Protocol v1");
      this.database
        .prepare(
          "UPDATE conversion_runs SET status = ?, document_json = ?, updated_at = ?, cancelled_at = ?, terminal_at = ? WHERE id = ? AND workspace_id = ? AND status = 'PENDING'",
        )
        .run(
          lockedNext.status,
          JSON.stringify(lockedNext),
          lockedNext.updatedAt,
          timestamp,
          timestamp,
          lockedNext.id,
          lockedNext.workspaceId,
        );
      this.database
        .prepare(
          "INSERT INTO conversion_execution_events (id,run_id,sequence,event_type,previous_status,resulting_status,document_json,occurred_at) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(
          lockedEvent.id,
          lockedEvent.runId,
          lockedEvent.sequence,
          lockedEvent.eventType,
          lockedEvent.previousStatus,
          lockedEvent.resultingStatus,
          JSON.stringify(lockedEvent),
          lockedEvent.occurredAt,
        );
      this.database.exec("COMMIT;");
      return { run: lockedNext, events: [...lockedEvents, lockedEvent] };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }
}
