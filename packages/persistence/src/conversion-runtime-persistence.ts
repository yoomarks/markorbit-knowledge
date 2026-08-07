import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  CONVERSION_RUNTIME_VERSION,
  conversionCapabilitySupports,
  isConversionAttempt,
  isConversionClaimRequest,
  isConversionClaimResult,
  isConversionLease,
  isConversionRun,
  isConversionWorkerCapability,
  isRawArtifactReadGrant,
  isStagingOutputUploadGrant,
  normalizeStagingTargetPath,
  type ConversionAttempt,
  type ConversionClaimRequest,
  type ConversionClaimResult,
  type ConversionLease,
  type ConversionWorkerCapability,
  type RawArtifactReadGrant,
  type StagingOutputUploadGrant,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryError, RegistryValidationError } from "./index";
import { ensureConversionRunLedger } from "./conversion-run-ledger";
import { ensureWorkerRegistry } from "./worker-registry";

const MIGRATION_ID = "0010_conversion_runtime_lease_attempt";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_LEASE_SECONDS = 120;
const MAX_LEASE_SECONDS = 3600;
const DEFAULT_RENEWABLE_SECONDS = 900;

export type ConversionCapabilityListFilters = {
  workerId?: string;
  workspaceId?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
};

export type ConversionCapabilityRecord = {
  capability: ConversionWorkerCapability;
  active: boolean;
  deactivatedAt?: string;
};

export type ConversionCapabilityListResult = {
  items: ConversionCapabilityRecord[];
  total: number;
  limit: number;
  offset: number;
};

export type ConversionClaimPersistenceResult = {
  result: ConversionClaimResult;
  replayed: boolean;
};

export type ConversionLeaseListFilters = {
  workspaceId?: string;
  workerId?: string;
  conversionRunId?: string;
  status?: ConversionLease["status"];
  limit?: number;
  offset?: number;
};

export type ConversionLeaseListResult = {
  items: ConversionLease[];
  total: number;
  limit: number;
  offset: number;
};

export type RenewConversionLeaseInput = {
  workspaceId: string;
  workerId: string;
  requestedDurationSeconds: number;
  idempotencyKey: string;
};

export type CloseConversionLeaseInput = {
  workspaceId: string;
  workerId: string;
  reconciliationCode: string;
  evidence?: Record<string, string | number | boolean | null>;
};

export interface ConversionRuntimePersistenceRepository {
  registerCapability(capability: ConversionWorkerCapability): ConversionCapabilityRecord;
  getCapability(id: string): ConversionCapabilityRecord | null;
  listCapabilities(filters?: ConversionCapabilityListFilters): ConversionCapabilityListResult;
  deactivateCapability(id: string): ConversionCapabilityRecord;
  claim(request: ConversionClaimRequest): ConversionClaimPersistenceResult;
  getLease(id: string): ConversionLease | null;
  listLeases(filters?: ConversionLeaseListFilters): ConversionLeaseListResult;
  getAttempt(id: string): ConversionAttempt | null;
  listAttempts(conversionRunId: string): ConversionAttempt[];
  renewLease(id: string, input: RenewConversionLeaseInput): ConversionLease;
  releaseBeforeStart(id: string, input: CloseConversionLeaseInput): ConversionLease;
  expireBeforeStart(id: string, input: CloseConversionLeaseInput): ConversionLease;
}

export class ConversionCapabilityNotFoundError extends RegistryError {
  constructor(id: string) {
    super("CONVERSION_CAPABILITY_NOT_FOUND", `Conversion capability ${id} was not found`, { id });
  }
}

export class ConversionLeaseNotFoundError extends RegistryError {
  constructor(id: string) {
    super("CONVERSION_LEASE_NOT_FOUND", `Conversion lease ${id} was not found`, { id });
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

function typedId(prefix: string, now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return sha256(stable(value));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeLimit(value?: number): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
}

function normalizeOffset(value?: number): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new RegistryValidationError("offset must be a non-negative integer");
  }
  return value;
}

function parseCapability(value: string): ConversionWorkerCapability {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionWorkerCapability(parsed)) {
    throw new RegistryValidationError("Persisted ConversionWorkerCapability is invalid");
  }
  return parsed;
}

function parseLease(value: string): ConversionLease {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionLease(parsed)) {
    throw new RegistryValidationError("Persisted ConversionLease is invalid");
  }
  return parsed;
}

function parseAttempt(value: string): ConversionAttempt {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionAttempt(parsed)) {
    throw new RegistryValidationError("Persisted ConversionAttempt is invalid");
  }
  return parsed;
}

function parseClaimResult(value: string): ConversionClaimResult {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionClaimResult(parsed)) {
    throw new RegistryValidationError("Persisted ConversionClaimResult is invalid");
  }
  return parsed;
}

function boundedLeaseSeconds(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_LEASE_SECONDS) {
    throw new RegistryValidationError(
      `requestedDurationSeconds must be between 1 and ${MAX_LEASE_SECONDS}`,
    );
  }
  return value;
}

function expandTargetPath(template: string, artifactId: string, runId: string): string | null {
  return normalizeStagingTargetPath(
    template
      .replaceAll("{{artifactId}}", artifactId)
      .replaceAll("{artifactId}", artifactId)
      .replaceAll("{{runId}}", runId)
      .replaceAll("{runId}", runId),
  );
}

export function ensureConversionRuntimePersistence(database: DatabaseSync): void {
  ensureWorkerRegistry(database);
  ensureConversionRunLedger(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS conversion_worker_capabilities (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        capability_revision INTEGER NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deactivated_at TEXT,
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id),
        UNIQUE (worker_id, capability_revision)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS conversion_attempts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        conversion_run_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        conversion_lease_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal > 0),
        converter_id TEXT NOT NULL,
        converter_version TEXT NOT NULL,
        status TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        ended_at TEXT,
        FOREIGN KEY (conversion_run_id) REFERENCES conversion_runs(id),
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id),
        UNIQUE (conversion_run_id, ordinal)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS conversion_leases (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        conversion_run_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        conversion_attempt_id TEXT NOT NULL,
        converter_id TEXT NOT NULL,
        converter_version TEXT NOT NULL,
        generation INTEGER NOT NULL CHECK (generation > 0),
        status TEXT NOT NULL,
        token_reference TEXT NOT NULL,
        token_digest TEXT NOT NULL,
        document_json TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        renewable_until TEXT NOT NULL,
        closed_at TEXT,
        FOREIGN KEY (conversion_run_id) REFERENCES conversion_runs(id),
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id),
        FOREIGN KEY (conversion_attempt_id) REFERENCES conversion_attempts(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS conversion_read_grants (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        conversion_run_id TEXT NOT NULL,
        conversion_attempt_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        document_json TEXT NOT NULL,
        FOREIGN KEY (conversion_run_id) REFERENCES conversion_runs(id),
        FOREIGN KEY (conversion_attempt_id) REFERENCES conversion_attempts(id),
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS conversion_upload_grants (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        conversion_run_id TEXT NOT NULL,
        conversion_attempt_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        document_json TEXT NOT NULL,
        FOREIGN KEY (conversion_run_id) REFERENCES conversion_runs(id),
        FOREIGN KEY (conversion_attempt_id) REFERENCES conversion_attempts(id),
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS conversion_claim_idempotency (
        workspace_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, worker_id, idempotency_key),
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_conversion_capabilities_worker_active
        ON conversion_worker_capabilities(worker_id, active, capability_revision DESC);
      CREATE INDEX IF NOT EXISTS idx_conversion_attempts_run_ordinal
        ON conversion_attempts(conversion_run_id, ordinal);
      CREATE INDEX IF NOT EXISTS idx_conversion_attempts_worker_status
        ON conversion_attempts(worker_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversion_leases_worker_status
        ON conversion_leases(worker_id, status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_conversion_leases_run_status
        ON conversion_leases(conversion_run_id, status);
      CREATE INDEX IF NOT EXISTS idx_conversion_leases_expiration
        ON conversion_leases(status, expires_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_conversion_lease_per_run
        ON conversion_leases(conversion_run_id) WHERE status = 'ACTIVE';
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

export class SqliteConversionRuntimePersistenceRepository implements ConversionRuntimePersistenceRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureConversionRuntimePersistence(database);
  }

  registerCapability(capability: ConversionWorkerCapability): ConversionCapabilityRecord {
    if (!isConversionWorkerCapability(capability)) {
      throw new RegistryValidationError(
        "Capability does not satisfy Conversion Runtime Protocol v1",
      );
    }
    const worker = this.database
      .prepare("SELECT workspace_id, desired_state FROM worker_definitions WHERE id = ?")
      .get(capability.workerId) as { workspace_id: string; desired_state: string } | undefined;
    if (!worker)
      throw new RegistryError("WORKER_NOT_FOUND", `Worker ${capability.workerId} was not found`);
    if (worker.desired_state !== "ACTIVE") {
      throw new RegistryConflictError(
        "WORKER_NOT_ACTIVE",
        "Conversion capability requires an ACTIVE Worker",
      );
    }
    const workspaceId = worker.workspace_id;
    try {
      this.database
        .prepare(
          `INSERT INTO conversion_worker_capabilities
           (id, workspace_id, worker_id, capability_revision, active, document_json, created_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          capability.id,
          workspaceId,
          capability.workerId,
          capability.capabilityRevision,
          JSON.stringify(capability),
          capability.createdAt,
        );
    } catch (error) {
      throw new RegistryConflictError(
        "CONVERSION_CAPABILITY_CONFLICT",
        "Capability identity or revision already exists",
        {
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
    return { capability: clone(capability), active: true };
  }

  getCapability(id: string): ConversionCapabilityRecord | null {
    const row = this.database
      .prepare(
        "SELECT document_json, active, deactivated_at FROM conversion_worker_capabilities WHERE id = ?",
      )
      .get(id) as
      { document_json: string; active: number; deactivated_at: string | null } | undefined;
    return row
      ? {
          capability: parseCapability(row.document_json),
          active: row.active === 1,
          ...(row.deactivated_at ? { deactivatedAt: row.deactivated_at } : {}),
        }
      : null;
  }

  listCapabilities(filters: ConversionCapabilityListFilters = {}): ConversionCapabilityListResult {
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filters.workerId) {
      where.push("worker_id = ?");
      params.push(filters.workerId);
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      params.push(filters.workspaceId);
    }
    if (filters.active !== undefined) {
      where.push("active = ?");
      params.push(filters.active ? 1 : 0);
    }
    const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const total = Number(
      (
        this.database
          .prepare(`SELECT COUNT(*) AS total FROM conversion_worker_capabilities${clause}`)
          .get(...params) as { total: number }
      ).total,
    );
    const rows = this.database
      .prepare(
        `SELECT document_json, active, deactivated_at FROM conversion_worker_capabilities${clause}
         ORDER BY capability_revision DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Array<{
      document_json: string;
      active: number;
      deactivated_at: string | null;
    }>;
    return {
      items: rows.map((row) => ({
        capability: parseCapability(row.document_json),
        active: row.active === 1,
        ...(row.deactivated_at ? { deactivatedAt: row.deactivated_at } : {}),
      })),
      total,
      limit,
      offset,
    };
  }

  deactivateCapability(id: string): ConversionCapabilityRecord {
    const current = this.getCapability(id);
    if (!current) throw new ConversionCapabilityNotFoundError(id);
    if (!current.active) return current;
    const timestamp = this.clock().toISOString();
    this.database
      .prepare(
        "UPDATE conversion_worker_capabilities SET active = 0, deactivated_at = ? WHERE id = ? AND active = 1",
      )
      .run(timestamp, id);
    return { capability: current.capability, active: false, deactivatedAt: timestamp };
  }

  claim(request: ConversionClaimRequest): ConversionClaimPersistenceResult {
    if (!isConversionClaimRequest(request)) {
      throw new RegistryValidationError(
        "Claim request does not satisfy Conversion Runtime Protocol v1",
      );
    }
    const requestDigest = digest(request);
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const previous = this.database
        .prepare(
          `SELECT request_digest, result_json FROM conversion_claim_idempotency
           WHERE workspace_id = ? AND worker_id = ? AND idempotency_key = ?`,
        )
        .get(request.workspaceId, request.workerId, request.idempotencyKey) as
        { request_digest: string; result_json: string } | undefined;
      if (previous) {
        if (previous.request_digest !== requestDigest) {
          throw new RegistryConflictError(
            "CONVERSION_CLAIM_IDEMPOTENCY_CONFLICT",
            "Claim idempotency key was reused with a different request",
          );
        }
        const result = parseClaimResult(previous.result_json);
        this.database.exec("COMMIT;");
        return { result, replayed: true };
      }

      const worker = this.database
        .prepare("SELECT workspace_id, desired_state FROM worker_definitions WHERE id = ?")
        .get(request.workerId) as { workspace_id: string; desired_state: string } | undefined;
      if (!worker)
        throw new RegistryError("WORKER_NOT_FOUND", `Worker ${request.workerId} was not found`);
      if (worker.workspace_id !== request.workspaceId) {
        throw new RegistryConflictError(
          "CONVERSION_WORKER_WORKSPACE_MISMATCH",
          "Worker belongs to another Workspace",
        );
      }
      if (worker.desired_state !== "ACTIVE") {
        throw new RegistryConflictError(
          "WORKER_NOT_ACTIVE",
          "Worker must be ACTIVE to claim conversion work",
        );
      }
      const capabilityRow = this.database
        .prepare(
          `SELECT document_json FROM conversion_worker_capabilities
           WHERE worker_id = ? AND workspace_id = ? AND capability_revision = ? AND active = 1`,
        )
        .get(request.workerId, request.workspaceId, request.capabilityRevision) as
        { document_json: string } | undefined;
      if (!capabilityRow) {
        throw new RegistryConflictError(
          "CONVERSION_CAPABILITY_NOT_ACTIVE",
          "Exact active capability revision was not found",
        );
      }
      const capability = parseCapability(capabilityRow.document_json);
      const rows = this.database
        .prepare(
          `SELECT document_json FROM conversion_runs r
           WHERE r.workspace_id = ? AND r.status = 'PENDING'
             AND NOT EXISTS (
               SELECT 1 FROM conversion_leases l
               WHERE l.conversion_run_id = r.id AND l.status = 'ACTIVE'
             )
           ORDER BY r.created_at ASC`,
        )
        .all(request.workspaceId) as Array<{ document_json: string }>;

      let selected: ReturnType<typeof JSON.parse> | null = null;
      let targetPath: string | null = null;
      for (const row of rows) {
        const candidate = JSON.parse(row.document_json) as unknown;
        if (!isConversionRun(candidate)) continue;
        if (
          !request.supportedConverters.some(
            (entry) =>
              entry.converterId === candidate.converter.converterId &&
              entry.versions.includes(candidate.converter.version),
          )
        )
          continue;
        if (
          !conversionCapabilitySupports(capability, {
            converterId: candidate.converter.converterId,
            version: candidate.converter.version,
            artifactKind: candidate.input.artifactKind,
            mimeType: candidate.input.mimeType,
            outputFormat: candidate.requestedOutput.format,
          })
        )
          continue;
        const expanded = expandTargetPath(
          candidate.requestedOutput.targetPathTemplate,
          candidate.rawArtifactId,
          candidate.id,
        );
        if (!expanded) continue;
        selected = candidate;
        targetPath = expanded;
        break;
      }

      const timestamp = this.clock().toISOString();
      if (!selected || !targetPath) {
        const result: ConversionClaimResult = {
          contractVersion: CONVERSION_RUNTIME_VERSION,
          objectType: "CONVERSION_CLAIM_RESULT",
          id: typedId("ccs"),
          workspaceId: request.workspaceId,
          workerId: request.workerId,
          result: "NO_COMPATIBLE_WORK",
          idempotencyKey: request.idempotencyKey,
        };
        if (!isConversionClaimResult(result)) {
          throw new RegistryValidationError("No-work claim result is invalid");
        }
        this.database
          .prepare(
            `INSERT INTO conversion_claim_idempotency
             (workspace_id, worker_id, idempotency_key, request_digest, result_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            request.workspaceId,
            request.workerId,
            request.idempotencyKey,
            requestDigest,
            JSON.stringify(result),
            timestamp,
          );
        this.database.exec("COMMIT;");
        return { result, replayed: false };
      }

      const ordinal =
        Number(
          (
            this.database
              .prepare(
                "SELECT COUNT(*) AS total FROM conversion_attempts WHERE conversion_run_id = ?",
              )
              .get(selected.id) as { total: number }
          ).total,
        ) + 1;
      const attemptId = typedId("cva");
      const leaseId = typedId("cvl");
      const leaseSeconds = boundedLeaseSeconds(
        request.requestedLeaseDurationSeconds || DEFAULT_LEASE_SECONDS,
      );
      const expiresAt = new Date(Date.parse(timestamp) + leaseSeconds * 1000).toISOString();
      const renewableUntil = new Date(
        Date.parse(timestamp) + Math.max(leaseSeconds, DEFAULT_RENEWABLE_SECONDS) * 1000,
      ).toISOString();
      const leaseSecret = randomBytes(32).toString("base64url");
      const lease: ConversionLease = {
        contractVersion: CONVERSION_RUNTIME_VERSION,
        objectType: "CONVERSION_LEASE",
        id: leaseId,
        workspaceId: request.workspaceId,
        conversionRunId: selected.id,
        workerId: request.workerId,
        conversionAttemptId: attemptId,
        converter: clone(selected.converter),
        generation: 1,
        tokenReference: `rtk_${typedId("ref").slice(4)}`,
        tokenDigest: sha256(leaseSecret),
        status: "ACTIVE",
        issuedAt: timestamp,
        expiresAt,
        renewableUntil,
      };
      const attempt: ConversionAttempt = {
        contractVersion: CONVERSION_RUNTIME_VERSION,
        objectType: "CONVERSION_ATTEMPT",
        id: attemptId,
        workspaceId: request.workspaceId,
        conversionRunId: selected.id,
        workerId: request.workerId,
        conversionLeaseId: leaseId,
        ordinal,
        converter: clone(selected.converter),
        createdAt: timestamp,
        status: "CLAIMED",
      };
      const grantExpiry = expiresAt;
      const readSecret = randomBytes(32).toString("base64url");
      const readGrant: RawArtifactReadGrant = {
        contractVersion: CONVERSION_RUNTIME_VERSION,
        objectType: "RAW_ARTIFACT_READ_GRANT",
        id: typedId("rag"),
        workspaceId: request.workspaceId,
        rawArtifactId: selected.rawArtifactId,
        conversionRunId: selected.id,
        conversionAttemptId: attemptId,
        workerId: request.workerId,
        expectedSha256: selected.input.sha256,
        expectedBytes: selected.input.sizeBytes,
        expectedMime: selected.input.mimeType,
        accessRef: `artifact-read:${selected.rawArtifactId}:${attemptId}`,
        issuedAt: timestamp,
        expiresAt: grantExpiry,
        maximumReads: 1,
        readsUsed: 0,
        usagePolicy: "CONVERSION_INPUT_ONLY",
        tokenReference: `rtk_${typedId("ref").slice(4)}`,
        tokenDigest: sha256(readSecret),
      };
      const uploadSecret = randomBytes(32).toString("base64url");
      const uploadGrant: StagingOutputUploadGrant = {
        contractVersion: CONVERSION_RUNTIME_VERSION,
        objectType: "STAGING_OUTPUT_UPLOAD_GRANT",
        id: typedId("sug"),
        workspaceId: request.workspaceId,
        conversionRunId: selected.id,
        conversionAttemptId: attemptId,
        workerId: request.workerId,
        normalizedTargetPath: targetPath,
        allowedMediaType: "text/markdown",
        maximumBytes: 5_000_000,
        requiredDigestAlgorithm: "SHA-256",
        uploadSessionRef: `staging-upload:${selected.id}:${attemptId}`,
        issuedAt: timestamp,
        expiresAt: grantExpiry,
        tokenReference: `rtk_${typedId("ref").slice(4)}`,
        tokenDigest: sha256(uploadSecret),
        allowedContentCount: 1,
        expectedProvenancePolicy: "CONVERSION_ATTEMPT_BOUND",
      };
      const result: ConversionClaimResult = {
        contractVersion: CONVERSION_RUNTIME_VERSION,
        objectType: "CONVERSION_CLAIM_RESULT",
        id: typedId("ccs"),
        workspaceId: request.workspaceId,
        workerId: request.workerId,
        result: "CLAIMED",
        idempotencyKey: request.idempotencyKey,
        lease,
        executionSummary: {
          conversionRunId: selected.id,
          rawArtifactId: selected.rawArtifactId,
          artifactKind: selected.input.artifactKind,
          mimeType: selected.input.mimeType,
          sha256: selected.input.sha256,
          sizeBytes: selected.input.sizeBytes,
          requestedOutputFormat: selected.requestedOutput.format,
          targetPathTemplate: selected.requestedOutput.targetPathTemplate,
        },
        converter: clone(selected.converter),
        rawArtifactReadGrant: readGrant,
        stagingOutputUploadGrant: uploadGrant,
      };
      if (
        !isConversionLease(lease) ||
        !isConversionAttempt(attempt) ||
        !isRawArtifactReadGrant(readGrant) ||
        !isStagingOutputUploadGrant(uploadGrant) ||
        !isConversionClaimResult(result)
      ) {
        throw new RegistryValidationError(
          "Claim persistence objects violate Conversion Runtime Protocol v1",
        );
      }

      this.database
        .prepare(
          `INSERT INTO conversion_attempts
           (id, workspace_id, conversion_run_id, worker_id, conversion_lease_id, ordinal,
            converter_id, converter_version, status, document_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          attempt.id,
          attempt.workspaceId,
          attempt.conversionRunId,
          attempt.workerId,
          attempt.conversionLeaseId,
          attempt.ordinal,
          attempt.converter.converterId,
          attempt.converter.version,
          attempt.status,
          JSON.stringify(attempt),
          attempt.createdAt,
        );
      this.database
        .prepare(
          `INSERT INTO conversion_leases
           (id, workspace_id, conversion_run_id, worker_id, conversion_attempt_id,
            converter_id, converter_version, generation, status, token_reference, token_digest,
            document_json, issued_at, expires_at, renewable_until)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          lease.id,
          lease.workspaceId,
          lease.conversionRunId,
          lease.workerId,
          lease.conversionAttemptId,
          lease.converter.converterId,
          lease.converter.version,
          lease.generation,
          lease.status,
          lease.tokenReference,
          lease.tokenDigest,
          JSON.stringify(lease),
          lease.issuedAt,
          lease.expiresAt,
          lease.renewableUntil,
        );
      this.database
        .prepare(
          `INSERT INTO conversion_read_grants
           (id, workspace_id, conversion_run_id, conversion_attempt_id, worker_id, expires_at, document_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          readGrant.id,
          readGrant.workspaceId,
          readGrant.conversionRunId,
          readGrant.conversionAttemptId,
          readGrant.workerId,
          readGrant.expiresAt,
          JSON.stringify(readGrant),
        );
      this.database
        .prepare(
          `INSERT INTO conversion_upload_grants
           (id, workspace_id, conversion_run_id, conversion_attempt_id, worker_id, expires_at, document_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          uploadGrant.id,
          uploadGrant.workspaceId,
          uploadGrant.conversionRunId,
          uploadGrant.conversionAttemptId,
          uploadGrant.workerId,
          uploadGrant.expiresAt,
          JSON.stringify(uploadGrant),
        );
      this.database
        .prepare(
          `INSERT INTO conversion_claim_idempotency
           (workspace_id, worker_id, idempotency_key, request_digest, result_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          request.workspaceId,
          request.workerId,
          request.idempotencyKey,
          requestDigest,
          JSON.stringify(result),
          timestamp,
        );
      this.database.exec("COMMIT;");
      return { result, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getLease(id: string): ConversionLease | null {
    const row = this.database
      .prepare("SELECT document_json FROM conversion_leases WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    return row ? parseLease(row.document_json) : null;
  }

  listLeases(filters: ConversionLeaseListFilters = {}): ConversionLeaseListResult {
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const where: string[] = [];
    const params: string[] = [];
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      params.push(filters.workspaceId);
    }
    if (filters.workerId) {
      where.push("worker_id = ?");
      params.push(filters.workerId);
    }
    if (filters.conversionRunId) {
      where.push("conversion_run_id = ?");
      params.push(filters.conversionRunId);
    }
    if (filters.status) {
      where.push("status = ?");
      params.push(filters.status);
    }
    const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const total = Number(
      (
        this.database
          .prepare(`SELECT COUNT(*) AS total FROM conversion_leases${clause}`)
          .get(...params) as { total: number }
      ).total,
    );
    const rows = this.database
      .prepare(
        `SELECT document_json FROM conversion_leases${clause}
         ORDER BY issued_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Array<{ document_json: string }>;
    return { items: rows.map((row) => parseLease(row.document_json)), total, limit, offset };
  }

  getAttempt(id: string): ConversionAttempt | null {
    const row = this.database
      .prepare("SELECT document_json FROM conversion_attempts WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    return row ? parseAttempt(row.document_json) : null;
  }

  listAttempts(conversionRunId: string): ConversionAttempt[] {
    const rows = this.database
      .prepare(
        `SELECT document_json FROM conversion_attempts
         WHERE conversion_run_id = ? ORDER BY ordinal ASC`,
      )
      .all(conversionRunId) as Array<{ document_json: string }>;
    return rows.map((row) => parseAttempt(row.document_json));
  }

  renewLease(id: string, input: RenewConversionLeaseInput): ConversionLease {
    const seconds = boundedLeaseSeconds(input.requestedDurationSeconds);
    const timestamp = this.clock().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.getLease(id);
      if (!current) throw new ConversionLeaseNotFoundError(id);
      if (current.workspaceId !== input.workspaceId || current.workerId !== input.workerId) {
        throw new RegistryConflictError(
          "CONVERSION_LEASE_SCOPE_MISMATCH",
          "Lease scope does not match request",
        );
      }
      if (current.status !== "ACTIVE" || Date.parse(timestamp) >= Date.parse(current.expiresAt)) {
        throw new RegistryConflictError(
          "CONVERSION_LEASE_NOT_ACTIVE",
          "Only an unexpired ACTIVE lease may be renewed",
        );
      }
      const nextExpiresAt = new Date(Date.parse(timestamp) + seconds * 1000).toISOString();
      if (Date.parse(nextExpiresAt) > Date.parse(current.renewableUntil)) {
        throw new RegistryConflictError(
          "CONVERSION_LEASE_RENEWAL_LIMIT",
          "Renewal exceeds renewableUntil",
        );
      }
      const nextSecret = randomBytes(32).toString("base64url");
      const next: ConversionLease = {
        ...clone(current),
        generation: current.generation + 1,
        tokenReference: `rtk_${typedId("ref").slice(4)}`,
        tokenDigest: sha256(nextSecret),
        expiresAt: nextExpiresAt,
      };
      if (!isConversionLease(next)) {
        throw new RegistryValidationError("Renewed lease violates Conversion Runtime Protocol v1");
      }
      this.database
        .prepare(
          `UPDATE conversion_leases SET generation = ?, token_reference = ?, token_digest = ?,
           document_json = ?, expires_at = ? WHERE id = ? AND status = 'ACTIVE'`,
        )
        .run(
          next.generation,
          next.tokenReference,
          next.tokenDigest,
          JSON.stringify(next),
          next.expiresAt,
          id,
        );
      this.database.exec("COMMIT;");
      return next;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  releaseBeforeStart(id: string, input: CloseConversionLeaseInput): ConversionLease {
    return this.closeBeforeStart(id, input, "RELEASED");
  }

  expireBeforeStart(id: string, input: CloseConversionLeaseInput): ConversionLease {
    return this.closeBeforeStart(id, input, "EXPIRED");
  }

  private closeBeforeStart(
    id: string,
    input: CloseConversionLeaseInput,
    status: "RELEASED" | "EXPIRED",
  ): ConversionLease {
    const timestamp = this.clock().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.getLease(id);
      if (!current) throw new ConversionLeaseNotFoundError(id);
      if (current.workspaceId !== input.workspaceId || current.workerId !== input.workerId) {
        throw new RegistryConflictError(
          "CONVERSION_LEASE_SCOPE_MISMATCH",
          "Lease scope does not match request",
        );
      }
      if (current.status !== "ACTIVE") {
        throw new RegistryConflictError(
          "CONVERSION_LEASE_NOT_ACTIVE",
          "Only ACTIVE lease may be closed",
        );
      }
      const attempt = this.getAttempt(current.conversionAttemptId);
      if (!attempt) {
        throw new RegistryError("CONVERSION_ATTEMPT_NOT_FOUND", "Conversion attempt was not found");
      }
      if (attempt.status !== "CLAIMED" || attempt.startedAt !== undefined) {
        throw new RegistryConflictError(
          "CONVERSION_ATTEMPT_ALREADY_STARTED",
          "Started conversion attempts cannot return the run to pre-start availability",
        );
      }
      const nextLease: ConversionLease = {
        ...clone(current),
        status,
        ...(status === "RELEASED" ? { releasedAt: timestamp } : { expiredAt: timestamp }),
      };
      const nextAttempt: ConversionAttempt = {
        ...clone(attempt),
        status: status === "RELEASED" ? "ABANDONED" : "LEASE_LOST",
        outcome: status === "RELEASED" ? "ABANDONED" : "LEASE_LOST",
        endedAt: timestamp,
        reconciliation: {
          code: input.reconciliationCode,
          evidence: { "x-pre-start": true, ...(input.evidence ?? {}) },
        },
      };
      if (!isConversionLease(nextLease) || !isConversionAttempt(nextAttempt)) {
        throw new RegistryValidationError("Pre-start lease reconciliation violates protocol");
      }
      this.database
        .prepare(
          `UPDATE conversion_leases SET status = ?, document_json = ?, closed_at = ?
           WHERE id = ? AND status = 'ACTIVE'`,
        )
        .run(nextLease.status, JSON.stringify(nextLease), timestamp, id);
      this.database
        .prepare(
          `UPDATE conversion_attempts SET status = ?, document_json = ?, ended_at = ?
           WHERE id = ? AND status = 'CLAIMED'`,
        )
        .run(nextAttempt.status, JSON.stringify(nextAttempt), timestamp, nextAttempt.id);
      this.database.exec("COMMIT;");
      return nextLease;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }
}
