import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  isRawArtifact,
  isStagingDocumentDescriptor,
  isWorkspace,
  type Workspace,
} from "@markorbit/contracts";
import { RegistryValidationError, initializeRegistry } from "./index";

const MIGRATION_ID = "1140_retention_execution_audit";
const DEFAULT_LIMIT = 1_000;
const MAX_LIMIT = 5_000;
const TERMINAL_CONVERSION_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export type RetentionExecutionMode = "DRY_RUN" | "APPLY";
export type RetentionAction = "ARCHIVE_RAW_ARTIFACT" | "ARCHIVE_DERIVED_DOCUMENT";
export type RetentionHoldReason =
  | "ACTIVE_CONVERSION_REFERENCE"
  | "ACTIVE_STAGING_REFERENCE"
  | "READY_PACKAGE_REFERENCE"
  | "CURRENT_RETRIEVAL_REFERENCE"
  | "EVIDENCE_SET_REFERENCE";

export type RetentionCandidate = {
  action: RetentionAction;
  workspaceId: string;
  id: string;
  createdAt: string;
  cutoffAt: string;
  holdReasons: RetentionHoldReason[];
};

export type RetentionExecutionResult = {
  executionId: string;
  mode: RetentionExecutionMode;
  observedAt: string;
  workspaceId: string | null;
  scanned: number;
  actionable: number;
  held: number;
  applied: number;
  truncated: boolean;
  candidates: RetentionCandidate[];
};

function tableExists(database: DatabaseSync, table: string): boolean {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table),
  );
}

function ensureRetentionAudit(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS retention_execution_audits (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('DRY_RUN','APPLY')),
        workspace_id TEXT,
        observed_at TEXT NOT NULL,
        document_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_retention_execution_audits_observed
        ON retention_execution_audits(observed_at DESC, id DESC);
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

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_LIMIT) {
    throw new RegistryValidationError(`retention limit must be an integer in 1..${MAX_LIMIT}`);
  }
  return limit;
}

function cutoff(observedAt: Date, days: number): string {
  return new Date(observedAt.getTime() - days * 86_400_000).toISOString();
}

function loadWorkspaces(database: DatabaseSync, workspaceId?: string): Workspace[] {
  const rows = database
    .prepare(
      workspaceId
        ? "SELECT document_json FROM workspaces WHERE id = ? ORDER BY id"
        : "SELECT document_json FROM workspaces ORDER BY id",
    )
    .all(...(workspaceId ? [workspaceId] : [])) as Array<{ document_json: string }>;
  return rows.map((row) => {
    const parsed = JSON.parse(row.document_json) as unknown;
    if (!isWorkspace(parsed)) {
      throw new RegistryValidationError("Persisted Workspace no longer satisfies Schema v1");
    }
    return parsed;
  });
}

function addIfExists(
  database: DatabaseSync,
  table: string,
  query: string,
  values: unknown[],
  reason: RetentionHoldReason,
  reasons: Set<RetentionHoldReason>,
): void {
  if (!tableExists(database, table)) return;
  if (database.prepare(query).get(...(values as never[]))) reasons.add(reason);
}

function evidenceSetReferences(database: DatabaseSync): {
  raw: Set<string>;
  staging: Set<string>;
} {
  const raw = new Set<string>();
  const staging = new Set<string>();
  if (!tableExists(database, "evidence_sets")) return { raw, staging };
  const rows = database.prepare("SELECT document_json FROM evidence_sets").all() as Array<{
    document_json: string;
  }>;
  for (const row of rows) {
    const parsed = JSON.parse(row.document_json) as { members?: unknown };
    if (!Array.isArray(parsed.members)) continue;
    for (const item of parsed.members) {
      if (!item || typeof item !== "object") continue;
      const member = item as Record<string, unknown>;
      if (typeof member.rawArtifactId === "string") raw.add(member.rawArtifactId);
      if (typeof member.stagingDocumentId === "string") staging.add(member.stagingDocumentId);
    }
  }
  return { raw, staging };
}

function rawHolds(
  database: DatabaseSync,
  artifactId: string,
  evidenceRaw: ReadonlySet<string>,
): RetentionHoldReason[] {
  const reasons = new Set<RetentionHoldReason>();
  if (tableExists(database, "conversion_runs")) {
    const rows = database
      .prepare("SELECT status FROM conversion_runs WHERE raw_artifact_id = ?")
      .all(artifactId) as Array<{ status: string }>;
    if (rows.some((row) => !TERMINAL_CONVERSION_STATUSES.has(row.status))) {
      reasons.add("ACTIVE_CONVERSION_REFERENCE");
    }
  }
  addIfExists(
    database,
    "staging_documents",
    "SELECT 1 FROM staging_documents WHERE raw_artifact_id = ? AND status <> 'ARCHIVED' LIMIT 1",
    [artifactId],
    "ACTIVE_STAGING_REFERENCE",
    reasons,
  );
  addIfExists(
    database,
    "ready_packages",
    "SELECT 1 FROM ready_packages WHERE raw_artifact_id = ? LIMIT 1",
    [artifactId],
    "READY_PACKAGE_REFERENCE",
    reasons,
  );
  addIfExists(
    database,
    "retrieval_documents",
    "SELECT 1 FROM retrieval_documents WHERE raw_artifact_id = ? AND is_current = 1 LIMIT 1",
    [artifactId],
    "CURRENT_RETRIEVAL_REFERENCE",
    reasons,
  );
  if (evidenceRaw.has(artifactId)) reasons.add("EVIDENCE_SET_REFERENCE");
  return [...reasons].sort();
}

function stagingHolds(
  database: DatabaseSync,
  stagingId: string,
  evidenceStaging: ReadonlySet<string>,
): RetentionHoldReason[] {
  const reasons = new Set<RetentionHoldReason>();
  if (tableExists(database, "conversion_runs") && tableExists(database, "staging_documents")) {
    const rows = database
      .prepare(
        `SELECT c.status FROM conversion_runs c
         JOIN staging_documents s ON s.conversion_run_id = c.id
         WHERE s.id = ?`,
      )
      .all(stagingId) as Array<{ status: string }>;
    if (rows.some((row) => !TERMINAL_CONVERSION_STATUSES.has(row.status))) {
      reasons.add("ACTIVE_CONVERSION_REFERENCE");
    }
  }
  addIfExists(
    database,
    "ready_packages",
    "SELECT 1 FROM ready_packages WHERE staging_document_id = ? LIMIT 1",
    [stagingId],
    "READY_PACKAGE_REFERENCE",
    reasons,
  );
  addIfExists(
    database,
    "retrieval_documents",
    "SELECT 1 FROM retrieval_documents WHERE staging_document_id = ? AND is_current = 1 LIMIT 1",
    [stagingId],
    "CURRENT_RETRIEVAL_REFERENCE",
    reasons,
  );
  if (evidenceStaging.has(stagingId)) reasons.add("EVIDENCE_SET_REFERENCE");
  return [...reasons].sort();
}

function archiveRawArtifact(database: DatabaseSync, id: string): void {
  const row = database.prepare("SELECT document_json FROM raw_artifacts WHERE id = ?").get(id) as
    { document_json: string } | undefined;
  if (!row) return;
  const artifact = JSON.parse(row.document_json) as unknown;
  if (!isRawArtifact(artifact)) {
    throw new RegistryValidationError(`RawArtifact ${id} no longer satisfies Schema v1`);
  }
  const archived = { ...artifact, status: "ARCHIVED" as const };
  database
    .prepare("UPDATE raw_artifacts SET status = 'ARCHIVED', document_json = ? WHERE id = ?")
    .run(JSON.stringify(archived), id);
}

function archiveStagingDocument(database: DatabaseSync, id: string, observedAt: string): void {
  const row = database
    .prepare("SELECT document_json FROM staging_documents WHERE id = ?")
    .get(id) as { document_json: string } | undefined;
  if (!row) return;
  const descriptor = JSON.parse(row.document_json) as unknown;
  if (!isStagingDocumentDescriptor(descriptor)) {
    throw new RegistryValidationError(`Staging document ${id} is invalid`);
  }
  database
    .prepare(
      "UPDATE staging_documents SET status = 'ARCHIVED', document_json = ?, updated_at = ? WHERE id = ?",
    )
    .run(JSON.stringify({ ...descriptor, status: "ARCHIVED" as const }), observedAt, id);
}

export function executeRetentionPolicy(
  database: DatabaseSync,
  input: {
    mode: RetentionExecutionMode;
    observedAt?: Date;
    workspaceId?: string;
    limit?: number;
  },
): RetentionExecutionResult {
  ensureRetentionAudit(database);
  const observed = input.observedAt ?? new Date();
  if (!Number.isFinite(observed.getTime()))
    throw new RegistryValidationError("observedAt is invalid");
  const limit = normalizeLimit(input.limit);
  const executionId = `ret_${randomUUID()}`;
  const observedAt = observed.toISOString();
  database.exec("BEGIN IMMEDIATE;");
  try {
    const evidence = evidenceSetReferences(database);
    const candidates: RetentionCandidate[] = [];
    let truncated = false;
    const workspaces = loadWorkspaces(database, input.workspaceId);
    if (input.workspaceId && workspaces.length === 0) {
      throw new RegistryValidationError(`Workspace ${input.workspaceId} was not found`);
    }
    for (const workspace of workspaces) {
      const rawDays = workspace.retentionPolicy.rawArtifactDays;
      if (rawDays !== null && tableExists(database, "raw_artifacts")) {
        const cutoffAt = cutoff(observed, rawDays);
        const remaining = Math.max(limit - candidates.length, 0);
        const rows = database
          .prepare(
            `SELECT id, created_at FROM raw_artifacts
             WHERE workspace_id = ? AND status <> 'ARCHIVED' AND created_at < ?
             ORDER BY created_at ASC, id ASC LIMIT ?`,
          )
          .all(workspace.id, cutoffAt, remaining + 1) as Array<{ id: string; created_at: string }>;
        if (rows.length > remaining) truncated = true;
        for (const row of rows.slice(0, remaining)) {
          candidates.push({
            action: "ARCHIVE_RAW_ARTIFACT",
            workspaceId: workspace.id,
            id: row.id,
            createdAt: row.created_at,
            cutoffAt,
            holdReasons: rawHolds(database, row.id, evidence.raw),
          });
        }
      }
      if (candidates.length >= limit) {
        truncated = true;
        break;
      }
      const derivedDays = workspace.retentionPolicy.derivedDocumentDays;
      if (derivedDays !== null && tableExists(database, "staging_documents")) {
        const cutoffAt = cutoff(observed, derivedDays);
        const remaining = Math.max(limit - candidates.length, 0);
        const rows = database
          .prepare(
            `SELECT id, created_at FROM staging_documents
             WHERE workspace_id = ? AND status <> 'ARCHIVED' AND updated_at < ?
             ORDER BY updated_at ASC, id ASC LIMIT ?`,
          )
          .all(workspace.id, cutoffAt, remaining + 1) as Array<{ id: string; created_at: string }>;
        if (rows.length > remaining) truncated = true;
        for (const row of rows.slice(0, remaining)) {
          candidates.push({
            action: "ARCHIVE_DERIVED_DOCUMENT",
            workspaceId: workspace.id,
            id: row.id,
            createdAt: row.created_at,
            cutoffAt,
            holdReasons: stagingHolds(database, row.id, evidence.staging),
          });
        }
      }
    }
    const actionable = candidates.filter((candidate) => candidate.holdReasons.length === 0);
    let applied = 0;
    if (input.mode === "APPLY") {
      for (const candidate of actionable) {
        if (candidate.action === "ARCHIVE_RAW_ARTIFACT") archiveRawArtifact(database, candidate.id);
        else archiveStagingDocument(database, candidate.id, observedAt);
        applied += 1;
      }
    }
    const result: RetentionExecutionResult = {
      executionId,
      mode: input.mode,
      observedAt,
      workspaceId: input.workspaceId ?? null,
      scanned: candidates.length,
      actionable: actionable.length,
      held: candidates.length - actionable.length,
      applied,
      truncated,
      candidates,
    };
    database
      .prepare(
        `INSERT INTO retention_execution_audits
         (id, mode, workspace_id, observed_at, document_json) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(executionId, input.mode, input.workspaceId ?? null, observedAt, JSON.stringify(result));
    database.exec("COMMIT;");
    return result;
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}
