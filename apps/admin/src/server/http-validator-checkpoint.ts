import type { DatabaseSync } from "node:sqlite";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import { getRegistryDatabase, getWorkerRegistryRepository } from "@/server/source-registry";

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

function ensureCheckpointRegistry(database: DatabaseSync): void {
  database.exec(`
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

function observedTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new RegistryValidationError("observedAt must be a valid RFC3339 timestamp");
  }
  return parsed.toISOString();
}

function sourceScopeForLease(database: DatabaseSync, auth: HttpValidatorCheckpointAuth) {
  const lease = getWorkerRegistryRepository().verifyLease(
    auth.workerId.trim(),
    auth.credential,
    auth.leaseId.trim(),
    auth.leaseToken,
  );
  const row = database
    .prepare("SELECT workspace_id, source_id FROM jobs WHERE id = ?")
    .get(lease.jobId) as { workspace_id: string; source_id: string } | undefined;
  if (!row) {
    throw new RegistryConflictError(
      "HTTP_VALIDATOR_JOB_NOT_FOUND",
      "The active Worker lease does not reference a persisted Job",
    );
  }
  if (row.workspace_id !== lease.workspaceId) {
    throw new RegistryConflictError(
      "HTTP_VALIDATOR_SCOPE_MISMATCH",
      "The active Worker lease and Job have inconsistent workspace scope",
    );
  }
  return { workspaceId: row.workspace_id, sourceId: row.source_id };
}

function rowToCheckpoint(row: {
  workspace_id: string;
  source_id: string;
  canonical_uri: string;
  etag: string | null;
  last_modified: string | null;
  observed_at: string;
  updated_at: string;
}): HttpValidatorCheckpoint {
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

export function readHttpValidatorCheckpoint(
  auth: HttpValidatorCheckpointAuth & { canonicalUri: string },
): HttpValidatorCheckpoint | null {
  const database = getRegistryDatabase();
  ensureCheckpointRegistry(database);
  const scope = sourceScopeForLease(database, auth);
  const canonicalUri = canonicalHttpUri(auth.canonicalUri);
  const row = database
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
  return row ? rowToCheckpoint(row) : null;
}

export function writeHttpValidatorCheckpoint(
  input: WriteHttpValidatorCheckpointInput,
): HttpValidatorCheckpoint {
  const database = getRegistryDatabase();
  ensureCheckpointRegistry(database);
  const scope = sourceScopeForLease(database, input);
  const canonicalUri = canonicalHttpUri(input.canonicalUri);
  const etag = optionalValidator(input.etag, "etag");
  const lastModified = optionalValidator(input.lastModified, "lastModified");
  if (!etag && !lastModified) {
    throw new RegistryValidationError("At least one HTTP validator is required");
  }
  const observedAt = observedTimestamp(input.observedAt);
  const updatedAt = new Date().toISOString();
  database
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
