import type { DatabaseSync } from "node:sqlite";
import { CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION, isJob, type Job } from "@markorbit/contracts";
import { RegistryConflictError } from "./index";
import {
  SqliteRawArtifactRepository as BaseSqliteRawArtifactRepository,
  type CreateArtifactSessionInput,
} from "./raw-artifact-registry";

export type {
  ArtifactContentIdentityResult,
  ArtifactListFilters,
  ArtifactSessionRecord,
  CheckArtifactContentInput,
  CreateArtifactSessionInput,
  RawArtifactListResult,
  RawArtifactRepository,
  RawArtifactView,
  StreamUploadResult,
} from "./raw-artifact-registry";

export {
  ArtifactSessionNotFoundError,
  ArtifactStorageError,
  LocalContentAddressedStore,
  RawArtifactNotFoundError,
  assertFinalizedArtifactReceipts,
  ensureRawArtifactRegistry,
  generateArtifactEventId,
  generateArtifactReceiptId,
  generateArtifactSessionId,
  generateRawArtifactId,
} from "./raw-artifact-registry";

type RawArtifactParentScope = {
  workspaceId: string;
  sourceId: string;
  parentArtifactIds: string[];
  authorizedCrossSourceParentArtifactIds?: string[];
};

type ParentArtifactRow = {
  id: string;
  workspace_id: string;
  source_id: string;
};

const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;

function persistedJob(value: string): Job {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    parsed = null;
  }
  if (!isJob(parsed)) {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_PARENT_GRANT_INVALID",
      "Cross-Source parent artifact grant requires a valid immutable Job snapshot",
    );
  }
  return parsed;
}

function authorizedCrossSourceParentArtifactIds(job: Job): string[] {
  const raw = job.extensions?.[CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION];
  if (raw === undefined) return [];
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    raw.some((value) => typeof value !== "string" || !ARTIFACT_ID.test(value)) ||
    new Set(raw).size !== raw.length
  ) {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_PARENT_GRANT_INVALID",
      "Cross-Source parent artifact grant must contain unique RawArtifact ids",
    );
  }
  return raw as string[];
}

export function assertRawArtifactParentScope(
  database: DatabaseSync,
  input: RawArtifactParentScope,
): void {
  if (input.parentArtifactIds.length === 0) return;

  const placeholders = input.parentArtifactIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `SELECT id, workspace_id, source_id
         FROM raw_artifacts
        WHERE id IN (${placeholders})`,
    )
    .all(...input.parentArtifactIds) as unknown as ParentArtifactRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const crossSourceGrants = new Set(input.authorizedCrossSourceParentArtifactIds ?? []);

  for (const parentArtifactId of input.parentArtifactIds) {
    const parent = byId.get(parentArtifactId);
    if (!parent) {
      throw new RegistryConflictError(
        "RAW_ARTIFACT_PARENT_NOT_FOUND",
        `RawArtifact parent ${parentArtifactId} was not found`,
        { parentArtifactId },
      );
    }
    if (parent.workspace_id !== input.workspaceId) {
      throw new RegistryConflictError(
        "RAW_ARTIFACT_PARENT_WORKSPACE_MISMATCH",
        "RawArtifact parent must belong to the same workspace as the ingestion execution",
        {
          parentArtifactId,
          expectedWorkspaceId: input.workspaceId,
          actualWorkspaceId: parent.workspace_id,
        },
      );
    }
    if (parent.source_id !== input.sourceId && !crossSourceGrants.has(parentArtifactId)) {
      throw new RegistryConflictError(
        "RAW_ARTIFACT_PARENT_SOURCE_MISMATCH",
        "RawArtifact parent must belong to the same Source as the ingestion execution",
        {
          parentArtifactId,
          expectedSourceId: input.sourceId,
          actualSourceId: parent.source_id,
        },
      );
    }
  }
}

/**
 * Production package boundary for RawArtifact ingestion.
 *
 * The underlying registry remains the storage/lifecycle implementation. This
 * wrapper adds write-side lineage integrity before a new ingestion session can
 * persist parentArtifactIds. Existing authentication and idempotency behavior
 * remains delegated to the base repository.
 */
export class SqliteRawArtifactRepository extends BaseSqliteRawArtifactRepository {
  private readonly integrityDatabase: DatabaseSync;

  constructor(...args: ConstructorParameters<typeof BaseSqliteRawArtifactRepository>) {
    super(...args);
    this.integrityDatabase = args[0];
  }

  override createSession(input: CreateArtifactSessionInput) {
    const parentArtifactIds = input.descriptor.parentArtifactIds ?? [];
    if (parentArtifactIds.length > 0) {
      const executionScope = this.integrityDatabase
        .prepare(
          `SELECT r.workspace_id AS workspaceId, r.source_id AS sourceId,
                  j.document_json AS jobJson
             FROM job_leases AS l
             JOIN collection_runs AS r ON r.id = l.run_id
             JOIN jobs AS j ON j.id = l.job_id
            WHERE l.id = ?`,
        )
        .get(input.leaseId) as
        { workspaceId: string; sourceId: string; jobJson: string } | undefined;

      // Authentication and missing execution-context errors remain owned by the
      // base repository. Only validate lineage once a real execution scope can
      // be resolved without creating an ingestion session.
      if (executionScope) {
        assertRawArtifactParentScope(this.integrityDatabase, {
          workspaceId: executionScope.workspaceId,
          sourceId: executionScope.sourceId,
          parentArtifactIds,
          authorizedCrossSourceParentArtifactIds: authorizedCrossSourceParentArtifactIds(
            persistedJob(executionScope.jobJson),
          ),
        });
      }
    }

    return super.createSession(input);
  }
}
