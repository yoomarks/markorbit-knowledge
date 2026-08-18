import { createHash, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import { getRegistryDatabase } from "./source-registry";

export type HttpValidatorCheckpoint = {
  workspaceId: string;
  sourceId: string;
  canonicalUri: string;
  etag: string | null;
  lastModified: string | null;
  observedAt: string;
  updatedAt: string;
};

export type HttpValidatorCheckpointAuth = {
  workerId: string;
  credential: string;
  leaseId: string;
  leaseToken: string;
};

export type WriteHttpValidatorCheckpointInput = HttpValidatorCheckpointAuth & {
  canonicalUri: string;
  etag?: string | null;
  lastModified?: string | null;
  observedAt?: string;
};

const MAX_VALIDATOR_LENGTH = 2_048;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function verifyDigest(value: string, expectedHex: string): boolean {
  const actual = digest(value);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function canonicalHttpUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new RegistryValidationError("canonicalUri must be an absolute HTTP(S) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RegistryValidationError("canonicalUri must use http or https");
  }
  url.hash = "";
  return url.toString();
}

function optionalValidator(value: string | null | undefined, field: string): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > MAX_VALIDATOR_LENGTH) {
    throw new RegistryValidationError(`${field} exceeds ${MAX_VALIDATOR_LENGTH} characters`);
  }
  return normalized;
}

function observedTimestamp(value: string | undefined, fallback: Date): string {
  if (!value) return fallback.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new RegistryValidationError("observedAt must be a valid RFC3339 timestamp");
  }
  return parsed.toISOString();
}

export class SqliteHttpValidatorCheckpointRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.ensureRegistry();
  }

  private ensureRegistry(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS http_validator_checkpoints (
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        canonical_uri TEXT NOT NULL,
        etag TEXT,
        last_modified TEXT,
        observed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, source_id, canonical_uri),
        FOREIGN KEY(source_id) REFERENCES source_definitions(id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_http_validator_checkpoints_source
        ON http_validator_checkpoints(workspace_id, source_id, updated_at DESC);
    `);
  }

  private sourceScopeForLease(auth: HttpValidatorCheckpointAuth): {
    workspaceId: string;
    sourceId: string;
  } {
    const workerId = auth.workerId.trim();
    const leaseId = auth.leaseId.trim();
    if (!workerId || !auth.credential || !leaseId || !auth.leaseToken) {
      throw new RegistryValidationError(
        "Worker credential and active lease authentication are required",
      );
    }
    const row = this.database
      .prepare(
        `SELECT w.desired_state AS desiredState,
                c.credential_digest AS credentialDigest,
                l.worker_id AS leaseWorkerId,
                l.workspace_id AS leaseWorkspaceId,
                l.job_id AS jobId,
                l.status AS leaseStatus,
                l.token_digest AS tokenDigest,
                l.expires_at AS expiresAt,
                j.workspace_id AS jobWorkspaceId,
                j.source_id AS sourceId
         FROM worker_definitions w
         JOIN worker_credentials c ON c.worker_id = w.id
         JOIN job_leases l ON l.worker_id = w.id
         JOIN jobs j ON j.id = l.job_id
         WHERE w.id = ? AND l.id = ?`,
      )
      .get(workerId, leaseId) as
      | {
          desiredState: string;
          credentialDigest: string;
          leaseWorkerId: string;
          leaseWorkspaceId: string;
          jobId: string;
          leaseStatus: string;
          tokenDigest: string;
          expiresAt: string;
          jobWorkspaceId: string;
          sourceId: string;
        }
      | undefined;
    if (
      !row ||
      row.leaseWorkerId !== workerId ||
      !verifyDigest(auth.credential, row.credentialDigest) ||
      !verifyDigest(auth.leaseToken, row.tokenDigest)
    ) {
      throw new RegistryConflictError(
        "HTTP_VALIDATOR_AUTHENTICATION_FAILED",
        "Worker credential or lease token is invalid",
      );
    }
    if (row.desiredState === "DISABLED") {
      throw new RegistryConflictError("WORKER_DISABLED", "Worker is disabled");
    }
    if (row.leaseStatus !== "ACTIVE") {
      throw new RegistryConflictError(
        "LEASE_NOT_ACTIVE",
        "HTTP validator access requires an active lease",
      );
    }
    if (Date.parse(row.expiresAt) <= this.clock().getTime()) {
      throw new RegistryConflictError("LEASE_EXPIRED", "Lease has expired");
    }
    if (row.leaseWorkspaceId !== row.jobWorkspaceId) {
      throw new RegistryConflictError(
        "HTTP_VALIDATOR_SCOPE_MISMATCH",
        "Worker lease and Job have inconsistent workspace scope",
      );
    }
    return { workspaceId: row.jobWorkspaceId, sourceId: row.sourceId };
  }

  read(
    input: HttpValidatorCheckpointAuth & { canonicalUri: string },
  ): HttpValidatorCheckpoint | null {
    const scope = this.sourceScopeForLease(input);
    const canonicalUri = canonicalHttpUri(input.canonicalUri);
    const row = this.database
      .prepare(
        `SELECT workspace_id, source_id, canonical_uri, etag, last_modified, observed_at, updated_at
         FROM http_validator_checkpoints
         WHERE workspace_id = ? AND source_id = ? AND canonical_uri = ?`,
      )
      .get(scope.workspaceId, scope.sourceId, canonicalUri) as
      | {
          workspace_id: string;
          source_id: string;
          canonical_uri: string;
          etag: string | null;
          last_modified: string | null;
          observed_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      workspaceId: row.workspace_id,
      sourceId: row.source_id,
      canonicalUri: row.canonical_uri,
      etag: row.etag,
      lastModified: row.last_modified,
      observedAt: row.observed_at,
      updatedAt: row.updated_at,
    };
  }

  clear(input: HttpValidatorCheckpointAuth & { canonicalUri: string }): boolean {
    const scope = this.sourceScopeForLease(input);
    const canonicalUri = canonicalHttpUri(input.canonicalUri);
    const result = this.database
      .prepare(
        `DELETE FROM http_validator_checkpoints
         WHERE workspace_id = ? AND source_id = ? AND canonical_uri = ?`,
      )
      .run(scope.workspaceId, scope.sourceId, canonicalUri);
    return Number(result.changes) > 0;
  }

  write(input: WriteHttpValidatorCheckpointInput): HttpValidatorCheckpoint {
    const scope = this.sourceScopeForLease(input);
    const canonicalUri = canonicalHttpUri(input.canonicalUri);
    const etag = optionalValidator(input.etag, "etag");
    const lastModified = optionalValidator(input.lastModified, "lastModified");
    if (!etag && !lastModified) {
      throw new RegistryValidationError("At least one HTTP validator is required");
    }
    const now = this.clock();
    const observedAt = observedTimestamp(input.observedAt, now);
    const updatedAt = now.toISOString();
    this.database
      .prepare(
        `INSERT INTO http_validator_checkpoints (
           workspace_id, source_id, canonical_uri, etag, last_modified, observed_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, source_id, canonical_uri) DO UPDATE SET
           etag = excluded.etag,
           last_modified = excluded.last_modified,
           observed_at = excluded.observed_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        scope.workspaceId,
        scope.sourceId,
        canonicalUri,
        etag,
        lastModified,
        observedAt,
        updatedAt,
      );
    return {
      ...scope,
      canonicalUri,
      etag,
      lastModified,
      observedAt,
      updatedAt,
    };
  }
}

function repository(): SqliteHttpValidatorCheckpointRepository {
  return new SqliteHttpValidatorCheckpointRepository(getRegistryDatabase());
}

export function readHttpValidatorCheckpoint(
  input: HttpValidatorCheckpointAuth & { canonicalUri: string },
): HttpValidatorCheckpoint | null {
  return repository().read(input);
}

export function writeHttpValidatorCheckpoint(
  input: WriteHttpValidatorCheckpointInput,
): HttpValidatorCheckpoint {
  return repository().write(input);
}

export function clearHttpValidatorCheckpoint(
  input: HttpValidatorCheckpointAuth & { canonicalUri: string },
): boolean {
  return repository().clear(input);
}
