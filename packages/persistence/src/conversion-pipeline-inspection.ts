import { DatabaseSync } from "node:sqlite";
import {
  isConversionAttempt,
  isConversionLease,
  isConversionRun,
  isStagingDocumentDescriptor,
  type ConversionAttempt,
  type ConversionLease,
  type ConversionRun,
  type StagingDocumentDescriptor,
} from "@markorbit/contracts";
import { RegistryValidationError } from "./index";
import { ensureStagingVerification } from "./staging-verification";
import type { StagingVerificationEvidence } from "./staging-verification";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export type ConversionPipelineInspection = {
  workspaceId: string;
  conversionRun: ConversionRun;
  latestAttempt: ConversionAttempt | null;
  latestLease: ConversionLease | null;
  stagingDocument: StagingDocumentDescriptor | null;
  verification: StagingVerificationEvidence | null;
  observedPhase:
    "PENDING" | "CLAIMED" | "RUNNING" | "VERIFYING" | "COMPLETED" | "FAILED" | "CANCELLED";
  updatedAt: string;
};

export type ConversionPipelineInspectionFilters = {
  workspaceId: string;
  sourceId?: string;
  rawArtifactId?: string;
  runStatus?: ConversionRun["status"];
  stagingStatus?: StagingDocumentDescriptor["status"];
  limit?: number;
  offset?: number;
};

export type ConversionPipelineInspectionList = {
  items: ConversionPipelineInspection[];
  total: number;
  limit: number;
  offset: number;
};

export interface ConversionPipelineInspectionRepository {
  getByRun(workspaceId: string, conversionRunId: string): ConversionPipelineInspection | null;
  list(filters: ConversionPipelineInspectionFilters): ConversionPipelineInspectionList;
}

type InspectionRow = {
  run_json: string;
  run_updated_at: string;
  attempt_json: string | null;
  lease_json: string | null;
  staging_json: string | null;
  staging_updated_at: string | null;
  verification_json: string | null;
  verification_created_at: string | null;
};

function parseRun(value: string): ConversionRun {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionRun(parsed))
    throw new RegistryValidationError("Persisted ConversionRun is invalid");
  return parsed;
}

function parseAttempt(value: string | null): ConversionAttempt | null {
  if (value === null) return null;
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionAttempt(parsed)) {
    throw new RegistryValidationError("Persisted ConversionAttempt is invalid");
  }
  return parsed;
}

function parseLease(value: string | null): ConversionLease | null {
  if (value === null) return null;
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionLease(parsed)) {
    throw new RegistryValidationError("Persisted ConversionLease is invalid");
  }
  return parsed;
}

function parseStaging(value: string | null): StagingDocumentDescriptor | null {
  if (value === null) return null;
  const parsed = JSON.parse(value) as unknown;
  if (!isStagingDocumentDescriptor(parsed)) {
    throw new RegistryValidationError("Persisted StagingDocumentDescriptor is invalid");
  }
  return parsed;
}

function parseVerification(value: string | null): StagingVerificationEvidence | null {
  if (value === null) return null;
  const parsed = JSON.parse(value) as Partial<StagingVerificationEvidence>;
  if (
    typeof parsed.id !== "string" ||
    typeof parsed.workspaceId !== "string" ||
    typeof parsed.stagingDocumentId !== "string" ||
    typeof parsed.conversionRunId !== "string" ||
    !Array.isArray(parsed.checks) ||
    !Array.isArray(parsed.warnings)
  ) {
    throw new RegistryValidationError("Persisted Staging verification evidence is invalid");
  }
  return parsed as StagingVerificationEvidence;
}

function phase(
  run: ConversionRun,
  attempt: ConversionAttempt | null,
): ConversionPipelineInspection["observedPhase"] {
  if (run.status === "COMPLETED") return "COMPLETED";
  if (run.status === "FAILED") return "FAILED";
  if (run.status === "CANCELLED") return "CANCELLED";
  if (run.status === "VERIFYING") return "VERIFYING";
  if (run.status === "RUNNING") return "RUNNING";
  return attempt ? "CLAIMED" : "PENDING";
}

function maximumTimestamp(values: Array<string | null>): string {
  return (
    values
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? ""
  );
}

function mapRow(row: InspectionRow): ConversionPipelineInspection {
  const conversionRun = parseRun(row.run_json);
  const latestAttempt = parseAttempt(row.attempt_json);
  const latestLease = parseLease(row.lease_json);
  const stagingDocument = parseStaging(row.staging_json);
  const verification = parseVerification(row.verification_json);
  return {
    workspaceId: conversionRun.workspaceId,
    conversionRun,
    latestAttempt,
    latestLease,
    stagingDocument,
    verification,
    observedPhase: phase(conversionRun, latestAttempt),
    updatedAt: maximumTimestamp([
      row.run_updated_at,
      row.staging_updated_at,
      row.verification_created_at,
      latestAttempt?.endedAt ?? latestAttempt?.startedAt ?? latestAttempt?.createdAt ?? null,
      latestLease?.releasedAt ??
        latestLease?.expiredAt ??
        latestLease?.supersededAt ??
        latestLease?.issuedAt ??
        null,
    ]),
  };
}

function limit(value?: number): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
}

function offset(value?: number): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RegistryValidationError("offset must be a non-negative integer");
  }
  return value;
}

const SELECT_INSPECTION = `
  SELECT
    r.document_json AS run_json,
    r.updated_at AS run_updated_at,
    a.document_json AS attempt_json,
    l.document_json AS lease_json,
    s.document_json AS staging_json,
    s.updated_at AS staging_updated_at,
    v.document_json AS verification_json,
    v.created_at AS verification_created_at
  FROM conversion_runs r
  LEFT JOIN conversion_attempts a ON a.id = (
    SELECT a2.id FROM conversion_attempts a2
    WHERE a2.conversion_run_id = r.id
    ORDER BY a2.ordinal DESC LIMIT 1
  )
  LEFT JOIN conversion_leases l ON l.id = (
    SELECT l2.id FROM conversion_leases l2
    WHERE l2.conversion_run_id = r.id
    ORDER BY l2.generation DESC, l2.issued_at DESC LIMIT 1
  )
  LEFT JOIN staging_documents s ON s.conversion_run_id = r.id
  LEFT JOIN staging_document_verifications v ON v.id = (
    SELECT v2.id FROM staging_document_verifications v2
    WHERE v2.conversion_run_id = r.id
    ORDER BY v2.created_at DESC, v2.id DESC LIMIT 1
  )`;

export class SqliteConversionPipelineInspectionRepository implements ConversionPipelineInspectionRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureStagingVerification(database);
  }

  getByRun(workspaceId: string, conversionRunId: string): ConversionPipelineInspection | null {
    const row = this.database
      .prepare(`${SELECT_INSPECTION} WHERE r.workspace_id = ? AND r.id = ?`)
      .get(workspaceId, conversionRunId) as InspectionRow | undefined;
    return row ? mapRow(row) : null;
  }

  list(filters: ConversionPipelineInspectionFilters): ConversionPipelineInspectionList {
    const take = limit(filters.limit);
    const skip = offset(filters.offset);
    const where = ["r.workspace_id = ?"];
    const values: Array<string | number> = [filters.workspaceId];
    if (filters.sourceId) {
      where.push("r.source_id = ?");
      values.push(filters.sourceId);
    }
    if (filters.rawArtifactId) {
      where.push("r.raw_artifact_id = ?");
      values.push(filters.rawArtifactId);
    }
    if (filters.runStatus) {
      where.push("r.status = ?");
      values.push(filters.runStatus);
    }
    if (filters.stagingStatus) {
      where.push("s.status = ?");
      values.push(filters.stagingStatus);
    }
    const predicate = where.join(" AND ");
    const count = this.database
      .prepare(
        `SELECT COUNT(*) AS total FROM conversion_runs r
         LEFT JOIN staging_documents s ON s.conversion_run_id = r.id
         WHERE ${predicate}`,
      )
      .get(...values) as { total: number };
    const rows = this.database
      .prepare(
        `${SELECT_INSPECTION} WHERE ${predicate} ORDER BY r.updated_at DESC, r.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...values, take, skip) as InspectionRow[];
    return { items: rows.map(mapRow), total: count.total, limit: take, offset: skip };
  }
}
