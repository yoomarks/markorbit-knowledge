import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_WORKSPACE,
  RegistryConflictError,
  RegistryValidationError,
  assertWorkspaceActive,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "0020_cnipa_detail_enrichment_queue";
const GOVERNANCE_MIGRATION_ID = "0021_cnipa_detail_lane_governance";
const MAX_LIMIT = 100;
const DEFAULT_LEASE_MS = 10 * 60_000;
const DOCUMENT_KINDS = [
  "REGISTRATION_EXAMINATION",
  "OPPOSITION_DECISION",
  "REVIEW_ADJUDICATION",
] as const;

export type CnipaDetailDocumentKind = (typeof DOCUMENT_KINDS)[number];
export type CnipaDetailQueueLifecycle =
  "PENDING" | "LEASED" | "FETCHED" | "RETRYABLE" | "PERMANENTLY_UNAVAILABLE";
export type CnipaDetailQueueHoldReason = "AUTH_SECURITY" | null;

export type CnipaDetailQueueRecord = {
  protocolVersion: "1.0";
  objectType: "CNIPA_DETAIL_ENRICHMENT_QUEUE_ITEM";
  workspaceId: string;
  documentKind: CnipaDetailDocumentKind;
  sourceRecordId: string;
  detailCanonicalUri: string;
  firstListArtifactRef: string;
  lastListArtifactRef: string;
  discoveredAt: string;
  lastObservedAt: string;
  observationCount: number;
  lifecycle: CnipaDetailQueueLifecycle;
  holdReason: CnipaDetailQueueHoldReason;
  leaseId: string | null;
  leasedAt: string | null;
  leaseExpiresAt: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  lastHttpStatus: number | null;
  lastBusinessCode: number | null;
  lastSuccessAt: string | null;
  detailArtifactRef: string | null;
  detailSha256: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdmitCnipaDetailPointerInput = {
  workspaceId: string;
  documentKind: CnipaDetailDocumentKind;
  sourceRecordId: string;
  detailCanonicalUri: string;
  listArtifactRef: string;
  observedAt: string;
};

export type ClaimCnipaDetailInput = {
  workspaceId: string;
  leaseId: string;
  now?: string;
  leaseMs?: number;
};

export type ClaimGovernedCnipaDetailInput = ClaimCnipaDetailInput & {
  budgetWindowKey: string;
  minIntervalMs: number;
  maxRequestsPerBudgetWindow: number;
};

export type ClaimGovernedCnipaDetailResult =
  | {
      status: "CLAIMED";
      record: CnipaDetailQueueRecord;
      budgetWindowKey: string;
      requestCount: number;
    }
  | {
      status: "PACING_BLOCKED";
      record: null;
      budgetWindowKey: string;
      requestCount: number;
      nextEligibleAt: string;
    }
  | {
      status: "BUDGET_EXHAUSTED";
      record: null;
      budgetWindowKey: string;
      requestCount: number;
      nextEligibleAt: null;
    }
  | {
      status: "EMPTY";
      record: null;
      budgetWindowKey: string;
      requestCount: number;
      nextEligibleAt: null;
    };

export type PersistCnipaDetailAttemptTransitionInput = {
  workspaceId: string;
  documentKind: CnipaDetailDocumentKind;
  sourceRecordId: string;
  expectedLeaseId: string;
  lifecycle: Exclude<CnipaDetailQueueLifecycle, "LEASED">;
  holdReason: CnipaDetailQueueHoldReason;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  lastHttpStatus: number | null;
  lastBusinessCode: number | null;
  lastSuccessAt: string | null;
  detailArtifactRef: string | null;
  detailSha256: string | null;
};

export type ReleaseCnipaDetailAuthSecurityHoldInput = {
  workspaceId: string;
  documentKind: CnipaDetailDocumentKind;
  sourceRecordId: string;
};

type QueueRow = {
  workspace_id: string;
  document_kind: CnipaDetailDocumentKind;
  source_record_id: string;
  detail_canonical_uri: string;
  first_list_artifact_ref: string;
  last_list_artifact_ref: string;
  discovered_at: string;
  last_observed_at: string;
  observation_count: number;
  lifecycle: CnipaDetailQueueLifecycle;
  hold_reason: "AUTH_SECURITY" | null;
  lease_id: string | null;
  leased_at: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  last_error_code: string | null;
  last_http_status: number | null;
  last_business_code: number | null;
  last_success_at: string | null;
  detail_artifact_ref: string | null;
  detail_sha256: string | null;
  created_at: string;
  updated_at: string;
};

const DETAIL_PATHS: Record<CnipaDetailDocumentKind, string> = {
  REGISTRATION_EXAMINATION: "/toas-pub-prod/pub-prod-api/pubnotice/portal/tmscJudgment/queryInfo",
  OPPOSITION_DECISION: "/toas-pub-prod/pub-prod-api/pubnotice/portal/tmyyJudgment/queryInfo",
  REVIEW_ADJUDICATION: "/toas-pub-prod/pub-prod-api/pubnotice/portal/tmpsJudgment/queryInfo",
};

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${label} is required`);
  return normalized;
}

function timestamp(value: string, label: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new RegistryValidationError(`${label} must be an ISO timestamp`);
  }
  return parsed.toISOString();
}

function documentKind(value: CnipaDetailDocumentKind): CnipaDetailDocumentKind {
  if (!(DOCUMENT_KINDS as readonly string[]).includes(value)) {
    throw new RegistryValidationError("documentKind is invalid");
  }
  return value;
}

export function cnipaDetailQueueCanonicalUri(
  kind: CnipaDetailDocumentKind,
  sourceRecordIdRaw: string,
): string {
  const sourceRecordId = required(sourceRecordIdRaw, "sourceRecordId");
  const url = new URL(DETAIL_PATHS[documentKind(kind)], "https://pub.sbj.cnipa.gov.cn");
  url.searchParams.set("id", sourceRecordId);
  return url.toString();
}

function rowRecord(row: QueueRow): CnipaDetailQueueRecord {
  return {
    protocolVersion: "1.0",
    objectType: "CNIPA_DETAIL_ENRICHMENT_QUEUE_ITEM",
    workspaceId: row.workspace_id,
    documentKind: row.document_kind,
    sourceRecordId: row.source_record_id,
    detailCanonicalUri: row.detail_canonical_uri,
    firstListArtifactRef: row.first_list_artifact_ref,
    lastListArtifactRef: row.last_list_artifact_ref,
    discoveredAt: row.discovered_at,
    lastObservedAt: row.last_observed_at,
    observationCount: Number(row.observation_count),
    lifecycle: row.lifecycle,
    holdReason: row.hold_reason,
    leaseId: row.lease_id,
    leasedAt: row.leased_at,
    leaseExpiresAt: row.lease_expires_at,
    attemptCount: Number(row.attempt_count),
    lastAttemptAt: row.last_attempt_at,
    nextAttemptAt: row.next_attempt_at,
    lastErrorCode: row.last_error_code,
    lastHttpStatus: row.last_http_status === null ? null : Number(row.last_http_status),
    lastBusinessCode: row.last_business_code === null ? null : Number(row.last_business_code),
    lastSuccessAt: row.last_success_at,
    detailArtifactRef: row.detail_artifact_ref,
    detailSha256: row.detail_sha256,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function ensureCnipaDetailEnrichmentQueue(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS cnipa_detail_enrichment_queue (
        workspace_id TEXT NOT NULL,
        document_kind TEXT NOT NULL CHECK (
          document_kind IN (
            'REGISTRATION_EXAMINATION',
            'OPPOSITION_DECISION',
            'REVIEW_ADJUDICATION'
          )
        ),
        source_record_id TEXT NOT NULL,
        detail_canonical_uri TEXT NOT NULL,
        first_list_artifact_ref TEXT NOT NULL,
        last_list_artifact_ref TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL,
        observation_count INTEGER NOT NULL CHECK (observation_count > 0),
        lifecycle TEXT NOT NULL CHECK (
          lifecycle IN ('PENDING','LEASED','FETCHED','RETRYABLE','PERMANENTLY_UNAVAILABLE')
        ),
        hold_reason TEXT CHECK (hold_reason IS NULL OR hold_reason = 'AUTH_SECURITY'),
        lease_id TEXT,
        leased_at TEXT,
        lease_expires_at TEXT,
        attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
        last_attempt_at TEXT,
        next_attempt_at TEXT,
        last_error_code TEXT,
        last_http_status INTEGER,
        last_business_code INTEGER,
        last_success_at TEXT,
        detail_artifact_ref TEXT,
        detail_sha256 TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, document_kind, source_record_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_cnipa_detail_queue_eligible
        ON cnipa_detail_enrichment_queue(
          workspace_id, lifecycle, hold_reason, next_attempt_at, discovered_at
        );
      CREATE INDEX IF NOT EXISTS idx_cnipa_detail_queue_lease_expiry
        ON cnipa_detail_enrichment_queue(workspace_id, lease_expires_at)
        WHERE lifecycle = 'LEASED';
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

function ensureCnipaDetailLaneGovernance(database: DatabaseSync): void {
  initializeRegistry(database);
  if (
    database
      .prepare("SELECT id FROM schema_migrations WHERE id = ?")
      .get(GOVERNANCE_MIGRATION_ID)
  ) {
    return;
  }

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS cnipa_detail_lane_governance (
        workspace_id TEXT PRIMARY KEY,
        budget_window_key TEXT NOT NULL,
        request_count INTEGER NOT NULL CHECK (request_count >= 0),
        last_request_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      ) STRICT;
    `);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(GOVERNANCE_MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function nonNegativeIntegerBounded(
  value: number,
  label: string,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RegistryValidationError(
      `${label} must be an integer in 0..${maximum}`,
    );
  }
  return value;
}

function positiveIntegerBounded(
  value: number,
  label: string,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RegistryValidationError(
      `${label} must be an integer in 1..${maximum}`,
    );
  }
  return value;
}

export class SqliteCnipaDetailEnrichmentQueueRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureCnipaDetailEnrichmentQueue(database);
    ensureCnipaDetailLaneGovernance(database);
  }

  admit(input: AdmitCnipaDetailPointerInput): CnipaDetailQueueRecord {
    const workspaceId = required(input.workspaceId, "workspaceId");
    assertWorkspaceActive(this.database, workspaceId);
    const kind = documentKind(input.documentKind);
    const sourceRecordId = required(input.sourceRecordId, "sourceRecordId");
    const detailCanonicalUri = required(input.detailCanonicalUri, "detailCanonicalUri");
    const expectedUri = cnipaDetailQueueCanonicalUri(kind, sourceRecordId);
    if (detailCanonicalUri !== expectedUri) {
      throw new RegistryConflictError(
        "CNIPA_DETAIL_IDENTITY_MISMATCH",
        "DETAIL URI does not match the CNIPA document-kind/source-record identity",
      );
    }
    const listArtifactRef = required(input.listArtifactRef, "listArtifactRef");
    const observedAt = timestamp(input.observedAt, "observedAt");
    const existing = this.getByIdentity(workspaceId, kind, sourceRecordId);
    const now = this.clock().toISOString();

    if (existing) {
      if (existing.detailCanonicalUri !== detailCanonicalUri) {
        throw new RegistryConflictError(
          "CNIPA_DETAIL_IDENTITY_MISMATCH",
          "Persisted DETAIL URI conflicts with the admitted pointer",
        );
      }
      const isNewestObservation = observedAt >= existing.lastObservedAt;
      const lastObservedAt = isNewestObservation ? observedAt : existing.lastObservedAt;
      const lastListArtifactRef = isNewestObservation
        ? listArtifactRef
        : existing.lastListArtifactRef;
      this.database
        .prepare(
          `UPDATE cnipa_detail_enrichment_queue
              SET last_list_artifact_ref = ?,
                  last_observed_at = ?,
                  observation_count = observation_count + 1,
                  updated_at = ?
            WHERE workspace_id = ? AND document_kind = ? AND source_record_id = ?`,
        )
        .run(lastListArtifactRef, lastObservedAt, now, workspaceId, kind, sourceRecordId);
      return this.getByIdentity(workspaceId, kind, sourceRecordId)!;
    }

    const record: CnipaDetailQueueRecord = {
      protocolVersion: "1.0",
      objectType: "CNIPA_DETAIL_ENRICHMENT_QUEUE_ITEM",
      workspaceId,
      documentKind: kind,
      sourceRecordId,
      detailCanonicalUri,
      firstListArtifactRef: listArtifactRef,
      lastListArtifactRef: listArtifactRef,
      discoveredAt: observedAt,
      lastObservedAt: observedAt,
      observationCount: 1,
      lifecycle: "PENDING",
      holdReason: null,
      leaseId: null,
      leasedAt: null,
      leaseExpiresAt: null,
      attemptCount: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      lastErrorCode: null,
      lastHttpStatus: null,
      lastBusinessCode: null,
      lastSuccessAt: null,
      detailArtifactRef: null,
      detailSha256: null,
      createdAt: now,
      updatedAt: now,
    };
    this.database
      .prepare(
        `INSERT INTO cnipa_detail_enrichment_queue (
          workspace_id, document_kind, source_record_id, detail_canonical_uri,
          first_list_artifact_ref, last_list_artifact_ref,
          discovered_at, last_observed_at, observation_count,
          lifecycle, hold_reason, lease_id, leased_at, lease_expires_at,
          attempt_count, last_attempt_at, next_attempt_at,
          last_error_code, last_http_status, last_business_code,
          last_success_at, detail_artifact_ref, detail_sha256,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?
        )`,
      )
      .run(
        record.workspaceId,
        record.documentKind,
        record.sourceRecordId,
        record.detailCanonicalUri,
        record.firstListArtifactRef,
        record.lastListArtifactRef,
        record.discoveredAt,
        record.lastObservedAt,
        record.observationCount,
        record.lifecycle,
        record.holdReason,
        record.leaseId,
        record.leasedAt,
        record.leaseExpiresAt,
        record.attemptCount,
        record.lastAttemptAt,
        record.nextAttemptAt,
        record.lastErrorCode,
        record.lastHttpStatus,
        record.lastBusinessCode,
        record.lastSuccessAt,
        record.detailArtifactRef,
        record.detailSha256,
        record.createdAt,
        record.updatedAt,
      );
    return record;
  }

  getByIdentity(
    workspaceIdRaw: string,
    kind: CnipaDetailDocumentKind,
    sourceRecordIdRaw: string,
  ): CnipaDetailQueueRecord | null {
    const workspaceId = required(workspaceIdRaw, "workspaceId");
    const sourceRecordId = required(sourceRecordIdRaw, "sourceRecordId");
    const row = this.database
      .prepare(
        `SELECT * FROM cnipa_detail_enrichment_queue
          WHERE workspace_id = ? AND document_kind = ? AND source_record_id = ?`,
      )
      .get(workspaceId, documentKind(kind), sourceRecordId) as unknown as QueueRow | undefined;
    return row ? rowRecord(row) : null;
  }

  claimNext(input: ClaimCnipaDetailInput): CnipaDetailQueueRecord | null {
    const workspaceId = required(input.workspaceId, "workspaceId");
    assertWorkspaceActive(this.database, workspaceId);
    const leaseId = required(input.leaseId, "leaseId");
    const now = timestamp(input.now ?? this.clock().toISOString(), "now");
    const leaseMs = input.leaseMs ?? DEFAULT_LEASE_MS;
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || leaseMs > 24 * 60 * 60_000) {
      throw new RegistryValidationError("leaseMs must be an integer in 1..86400000");
    }
    const leaseExpiresAt = new Date(Date.parse(now) + leaseMs).toISOString();

    let claimedIdentity:
      { documentKind: CnipaDetailDocumentKind; sourceRecordId: string } | undefined;
    databaseTransaction(this.database, () => {
      this.database
        .prepare(
          `UPDATE cnipa_detail_enrichment_queue
              SET lifecycle = 'RETRYABLE',
                  lease_id = NULL,
                  leased_at = NULL,
                  lease_expires_at = NULL,
                  next_attempt_at = ?,
                  last_error_code = 'CNIPA_DETAIL_LEASE_EXPIRED',
                  updated_at = ?
            WHERE workspace_id = ?
              AND lifecycle = 'LEASED'
              AND lease_expires_at <= ?`,
        )
        .run(now, now, workspaceId, now);

      const candidate = this.database
        .prepare(
          `SELECT workspace_id, document_kind, source_record_id
             FROM cnipa_detail_enrichment_queue
            WHERE workspace_id = ?
              AND lifecycle IN ('PENDING','RETRYABLE')
              AND hold_reason IS NULL
              AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
            ORDER BY
              CASE WHEN next_attempt_at IS NULL THEN 0 ELSE 1 END,
              next_attempt_at,
              discovered_at,
              document_kind,
              source_record_id
            LIMIT 1`,
        )
        .get(workspaceId, now) as
        | {
            workspace_id: string;
            document_kind: CnipaDetailDocumentKind;
            source_record_id: string;
          }
        | undefined;
      if (!candidate) return;
      claimedIdentity = {
        documentKind: candidate.document_kind,
        sourceRecordId: candidate.source_record_id,
      };

      this.database
        .prepare(
          `UPDATE cnipa_detail_enrichment_queue
              SET lifecycle = 'LEASED',
                  lease_id = ?,
                  leased_at = ?,
                  lease_expires_at = ?,
                  updated_at = ?
            WHERE workspace_id = ? AND document_kind = ? AND source_record_id = ?
              AND lifecycle IN ('PENDING','RETRYABLE')
              AND hold_reason IS NULL
              AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
        )
        .run(
          leaseId,
          now,
          leaseExpiresAt,
          now,
          candidate.workspace_id,
          candidate.document_kind,
          candidate.source_record_id,
          now,
        );
    });

    if (!claimedIdentity) return null;
    return this.getByIdentity(
      workspaceId,
      claimedIdentity.documentKind,
      claimedIdentity.sourceRecordId,
    );
  }

  claimNextGoverned(
    input: ClaimGovernedCnipaDetailInput,
  ): ClaimGovernedCnipaDetailResult {
    const workspaceId = required(input.workspaceId, "workspaceId");
    assertWorkspaceActive(this.database, workspaceId);
    const leaseId = required(input.leaseId, "leaseId");
    const budgetWindowKey = required(input.budgetWindowKey, "budgetWindowKey");
    if (budgetWindowKey.length > 128) {
      throw new RegistryValidationError("budgetWindowKey must be at most 128 characters");
    }
    const now = timestamp(input.now ?? this.clock().toISOString(), "now");
    const leaseMs = input.leaseMs ?? DEFAULT_LEASE_MS;
    positiveIntegerBounded(leaseMs, "leaseMs", 24 * 60 * 60_000);
    const minIntervalMs = nonNegativeIntegerBounded(
      input.minIntervalMs,
      "minIntervalMs",
      24 * 60 * 60_000,
    );
    const maxRequests = positiveIntegerBounded(
      input.maxRequestsPerBudgetWindow,
      "maxRequestsPerBudgetWindow",
      100_000,
    );
    const leaseExpiresAt = new Date(Date.parse(now) + leaseMs).toISOString();

    let result: ClaimGovernedCnipaDetailResult = {
      status: "EMPTY",
      record: null,
      budgetWindowKey,
      requestCount: 0,
      nextEligibleAt: null,
    };

    databaseTransaction(this.database, () => {
      this.database
        .prepare(
          `UPDATE cnipa_detail_enrichment_queue
              SET lifecycle = 'RETRYABLE',
                  lease_id = NULL,
                  leased_at = NULL,
                  lease_expires_at = NULL,
                  next_attempt_at = ?,
                  last_error_code = 'CNIPA_DETAIL_LEASE_EXPIRED',
                  updated_at = ?
            WHERE workspace_id = ?
              AND lifecycle = 'LEASED'
              AND lease_expires_at <= ?`,
        )
        .run(now, now, workspaceId, now);

      const lane = this.database
        .prepare(
          `SELECT budget_window_key, request_count, last_request_at
             FROM cnipa_detail_lane_governance
            WHERE workspace_id = ?`,
        )
        .get(workspaceId) as
        | {
            budget_window_key: string;
            request_count: number;
            last_request_at: string | null;
          }
        | undefined;

      const sameWindow = lane?.budget_window_key === budgetWindowKey;
      const requestCount = sameWindow ? Number(lane?.request_count ?? 0) : 0;
      const lastRequestAt = lane?.last_request_at ?? null;

      if (lastRequestAt && minIntervalMs > 0) {
        const nextEligibleAt = new Date(
          Date.parse(lastRequestAt) + minIntervalMs,
        ).toISOString();
        if (nextEligibleAt > now) {
          result = {
            status: "PACING_BLOCKED",
            record: null,
            budgetWindowKey,
            requestCount,
            nextEligibleAt,
          };
          return;
        }
      }

      if (requestCount >= maxRequests) {
        result = {
          status: "BUDGET_EXHAUSTED",
          record: null,
          budgetWindowKey,
          requestCount,
          nextEligibleAt: null,
        };
        return;
      }

      const candidate = this.database
        .prepare(
          `SELECT workspace_id, document_kind, source_record_id
             FROM cnipa_detail_enrichment_queue
            WHERE workspace_id = ?
              AND lifecycle IN ('PENDING','RETRYABLE')
              AND hold_reason IS NULL
              AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
            ORDER BY
              CASE WHEN next_attempt_at IS NULL THEN 0 ELSE 1 END,
              next_attempt_at,
              discovered_at,
              document_kind,
              source_record_id
            LIMIT 1`,
        )
        .get(workspaceId, now) as
        | {
            workspace_id: string;
            document_kind: CnipaDetailDocumentKind;
            source_record_id: string;
          }
        | undefined;

      if (!candidate) {
        result = {
          status: "EMPTY",
          record: null,
          budgetWindowKey,
          requestCount,
          nextEligibleAt: null,
        };
        return;
      }

      const claimed = this.database
        .prepare(
          `UPDATE cnipa_detail_enrichment_queue
              SET lifecycle = 'LEASED',
                  lease_id = ?,
                  leased_at = ?,
                  lease_expires_at = ?,
                  updated_at = ?
            WHERE workspace_id = ?
              AND document_kind = ?
              AND source_record_id = ?
              AND lifecycle IN ('PENDING','RETRYABLE')
              AND hold_reason IS NULL
              AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
        )
        .run(
          leaseId,
          now,
          leaseExpiresAt,
          now,
          workspaceId,
          candidate.document_kind,
          candidate.source_record_id,
          now,
        );
      if (Number(claimed.changes) !== 1) {
        throw new RegistryConflictError(
          "CNIPA_DETAIL_CLAIM_RACE",
          "CNIPA DETAIL queue item changed before governed claim",
        );
      }

      const nextCount = requestCount + 1;
      this.database
        .prepare(
          `INSERT INTO cnipa_detail_lane_governance
             (workspace_id, budget_window_key, request_count, last_request_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(workspace_id) DO UPDATE SET
             budget_window_key = excluded.budget_window_key,
             request_count = excluded.request_count,
             last_request_at = excluded.last_request_at,
             updated_at = excluded.updated_at`,
        )
        .run(workspaceId, budgetWindowKey, nextCount, now, now);

      result = {
        status: "CLAIMED",
        record: null as unknown as CnipaDetailQueueRecord,
        budgetWindowKey,
        requestCount: nextCount,
      };
      const claimedRecord = this.getByIdentity(
        workspaceId,
        candidate.document_kind,
        candidate.source_record_id,
      );
      if (!claimedRecord) {
        throw new RegistryConflictError(
          "CNIPA_DETAIL_CLAIM_MISSING",
          "Governed CNIPA DETAIL claim could not be reloaded",
        );
      }
      result = { ...result, record: claimedRecord };
    });

    return result;
  }

  persistAttemptTransition(
    input: PersistCnipaDetailAttemptTransitionInput,
  ): CnipaDetailQueueRecord {
    const workspaceId = required(input.workspaceId, "workspaceId");
    const kind = documentKind(input.documentKind);
    const sourceRecordId = required(input.sourceRecordId, "sourceRecordId");
    const expectedLeaseId = required(input.expectedLeaseId, "expectedLeaseId");
    const current = this.getByIdentity(workspaceId, kind, sourceRecordId);
    if (!current) {
      throw new RegistryConflictError(
        "CNIPA_DETAIL_QUEUE_ITEM_NOT_FOUND",
        "CNIPA DETAIL queue item was not found",
      );
    }
    if (current.lifecycle !== "LEASED" || current.leaseId !== expectedLeaseId) {
      throw new RegistryConflictError(
        "CNIPA_DETAIL_STALE_LEASE",
        "CNIPA DETAIL transition does not own the active queue lease",
      );
    }
    if (!Number.isSafeInteger(input.attemptCount) || input.attemptCount < 0) {
      throw new RegistryValidationError("attemptCount must be a non-negative integer");
    }
    if (input.attemptCount < current.attemptCount) {
      throw new RegistryConflictError(
        "CNIPA_DETAIL_ATTEMPT_REGRESSION",
        "CNIPA DETAIL transition cannot reduce attemptCount",
      );
    }
    if (input.lifecycle === "FETCHED") {
      if (!input.detailArtifactRef?.trim() || !/^[a-f0-9]{64}$/.test(input.detailSha256 ?? "")) {
        throw new RegistryValidationError(
          "FETCHED CNIPA DETAIL transition requires artifact ref and SHA-256",
        );
      }
      if (!input.lastSuccessAt) {
        throw new RegistryValidationError("FETCHED CNIPA DETAIL transition requires lastSuccessAt");
      }
    }
    if (input.holdReason === "AUTH_SECURITY" && input.lifecycle !== "PENDING") {
      throw new RegistryValidationError("AUTH_SECURITY hold requires PENDING lifecycle");
    }

    const normalizeNullableTime = (value: string | null, label: string) =>
      value === null ? null : timestamp(value, label);
    const now = this.clock().toISOString();
    const result = this.database
      .prepare(
        `UPDATE cnipa_detail_enrichment_queue
            SET lifecycle = ?,
                hold_reason = ?,
                lease_id = NULL,
                leased_at = NULL,
                lease_expires_at = NULL,
                attempt_count = ?,
                last_attempt_at = ?,
                next_attempt_at = ?,
                last_error_code = ?,
                last_http_status = ?,
                last_business_code = ?,
                last_success_at = ?,
                detail_artifact_ref = ?,
                detail_sha256 = ?,
                updated_at = ?
          WHERE workspace_id = ?
            AND document_kind = ?
            AND source_record_id = ?
            AND lifecycle = 'LEASED'
            AND lease_id = ?`,
      )
      .run(
        input.lifecycle,
        input.holdReason,
        input.attemptCount,
        normalizeNullableTime(input.lastAttemptAt, "lastAttemptAt"),
        normalizeNullableTime(input.nextAttemptAt, "nextAttemptAt"),
        input.lastErrorCode,
        input.lastHttpStatus,
        input.lastBusinessCode,
        normalizeNullableTime(input.lastSuccessAt, "lastSuccessAt"),
        input.detailArtifactRef?.trim() || null,
        input.detailSha256,
        now,
        workspaceId,
        kind,
        sourceRecordId,
        expectedLeaseId,
      );
    if (Number(result.changes) !== 1) {
      throw new RegistryConflictError(
        "CNIPA_DETAIL_STALE_LEASE",
        "CNIPA DETAIL queue lease changed before transition persistence",
      );
    }
    return this.getByIdentity(workspaceId, kind, sourceRecordId)!;
  }

  releaseAuthSecurityHold(input: ReleaseCnipaDetailAuthSecurityHoldInput): CnipaDetailQueueRecord {
    const workspaceId = required(input.workspaceId, "workspaceId");
    const kind = documentKind(input.documentKind);
    const sourceRecordId = required(input.sourceRecordId, "sourceRecordId");
    const current = this.getByIdentity(workspaceId, kind, sourceRecordId);
    if (!current) {
      throw new RegistryConflictError(
        "CNIPA_DETAIL_QUEUE_ITEM_NOT_FOUND",
        "CNIPA DETAIL queue item was not found",
      );
    }
    if (current.holdReason !== "AUTH_SECURITY" || current.leaseId !== null) {
      throw new RegistryConflictError(
        "CNIPA_DETAIL_AUTH_HOLD_NOT_ACTIVE",
        "CNIPA DETAIL item does not have a releasable auth/security hold",
      );
    }
    const now = this.clock().toISOString();
    this.database
      .prepare(
        `UPDATE cnipa_detail_enrichment_queue
            SET hold_reason = NULL,
                next_attempt_at = NULL,
                updated_at = ?
          WHERE workspace_id = ?
            AND document_kind = ?
            AND source_record_id = ?
            AND hold_reason = 'AUTH_SECURITY'
            AND lease_id IS NULL`,
      )
      .run(now, workspaceId, kind, sourceRecordId);
    return this.getByIdentity(workspaceId, kind, sourceRecordId)!;
  }

  list(workspaceIdRaw: string, limitRaw = 50): CnipaDetailQueueRecord[] {
    const workspaceId = required(workspaceIdRaw, "workspaceId");
    if (!Number.isSafeInteger(limitRaw) || limitRaw <= 0) {
      throw new RegistryValidationError("limit must be a positive integer");
    }
    const limit = Math.min(limitRaw, MAX_LIMIT);
    const rows = this.database
      .prepare(
        `SELECT * FROM cnipa_detail_enrichment_queue
          WHERE workspace_id = ?
          ORDER BY discovered_at, document_kind, source_record_id
          LIMIT ?`,
      )
      .all(workspaceId, limit) as unknown as QueueRow[];
    return rows.map(rowRecord);
  }
}

function databaseTransaction(database: DatabaseSync, work: () => void): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    work();
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export const CNIPA_DETAIL_QUEUE_DEFAULT_WORKSPACE_ID = DEFAULT_WORKSPACE.id;
