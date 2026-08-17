import { createHash } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { SourceSupplyHealthRecord } from "@markorbit/contracts";
import { RegistryConflictError, RegistryNotFoundError, RegistryValidationError } from "./index";

export const SOURCE_SUPPLY_PROMOTION_RECEIPT_VERSION =
  "SOURCE_SUPPLY_PROMOTION_RECEIPT_V1" as const;
export const SOURCE_SUPPLY_PROMOTION_RECEIPT_STATUSES = ["DISPATCHED", "PROVEN"] as const;
export type SourceSupplyPromotionReceiptStatus =
  (typeof SOURCE_SUPPLY_PROMOTION_RECEIPT_STATUSES)[number];
export const SOURCE_SUPPLY_PROMOTION_PROOF_STATUSES = [
  "UNCHECKED",
  "INCOMPLETE",
  "FAILED",
  "PROVEN",
] as const;
export type SourceSupplyPromotionProofStatus =
  (typeof SOURCE_SUPPLY_PROMOTION_PROOF_STATUSES)[number];
export const SOURCE_SUPPLY_PROMOTION_PROOF_BLOCKERS = [
  "SOURCE_UNREGISTERED",
  "NO_ACQUISITION_EVIDENCE",
  "NO_READY_NORMALIZED_DOCUMENT",
  "NO_CURRENT_RETRIEVAL_DOCUMENT",
  "SUPPLY_NOT_FRESH",
  "COMPATIBILITY_NOT_PASS",
  "COMPATIBILITY_NOT_FRESH",
] as const;
export type SourceSupplyPromotionProofBlocker =
  (typeof SOURCE_SUPPLY_PROMOTION_PROOF_BLOCKERS)[number];

export type SourceSupplyPromotionProofEvidence = {
  registrationState: string;
  artifactCount: number;
  readyDocumentCount: number;
  currentRetrievalDocumentCount: number;
  supplyFreshness: string;
  compatibilityState: string;
  compatibilityFreshness: string;
  latestRunStatus: string | null;
};

export type SourceSupplyPromotionProofResult = {
  status: "INCOMPLETE" | "PROVEN";
  blockers: SourceSupplyPromotionProofBlocker[];
  evidence: SourceSupplyPromotionProofEvidence;
};

export type SourceSupplyPromotionReceipt = {
  version: typeof SOURCE_SUPPLY_PROMOTION_RECEIPT_VERSION;
  objectType: "SOURCE_SUPPLY_PROMOTION_RECEIPT";
  id: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  sourceId: string;
  planId: string;
  collectionRunId: string;
  operatorActor: string;
  idempotencyKey: string;
  status: SourceSupplyPromotionReceiptStatus;
  lastProofStatus: SourceSupplyPromotionProofStatus;
  proofBlockers: SourceSupplyPromotionProofBlocker[];
  proofEvidence: SourceSupplyPromotionProofEvidence | null;
  proofError: string | null;
  dispatchedAt: string;
  lastCheckedAt: string | null;
  provenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StartSourceSupplyPromotionReceiptInput = {
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  sourceId: string;
  planId: string;
  collectionRunId: string;
  operatorActor: string;
  idempotencyKey?: string;
  dispatchedAt?: string;
};

export type RecordSourceSupplyPromotionProofInput = {
  receiptId: string;
  checkedAt: string;
  proof?: SourceSupplyPromotionProofResult;
  error?: string;
};

export type SourceSupplyPromotionReceiptListFilters = {
  workspaceId: string;
  jurisdiction?: string;
  targetId?: string;
  status?: SourceSupplyPromotionReceiptStatus;
  limit?: number;
};

const TABLE = "source_supply_promotion_receipts";
const DEFAULT_LIMIT = 50;

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  if (normalized.length > 500) throw new RegistryValidationError(`${field} is too long`);
  return normalized;
}

function deterministicId(input: {
  workspaceId: string;
  targetId: string;
  collectionRunId: string;
}): string {
  return `sspr_${createHash("sha256")
    .update(`${input.workspaceId}\n${input.targetId}\n${input.collectionRunId}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function semanticFingerprint(input: StartSourceSupplyPromotionReceiptInput): string {
  return createHash("sha256")
    .update(
      [
        input.workspaceId,
        input.jurisdiction,
        input.targetId,
        input.sourceId,
        input.planId,
        input.collectionRunId,
      ].join("\n"),
    )
    .digest("hex");
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function evaluateSourceSupplyPromotionProof(
  item: SourceSupplyHealthRecord,
): SourceSupplyPromotionProofResult {
  const evidence: SourceSupplyPromotionProofEvidence = {
    registrationState: item.registrationState,
    artifactCount: numberValue(item.acquisition.artifactCount),
    readyDocumentCount: numberValue(item.normalization.readyDocumentCount),
    currentRetrievalDocumentCount: numberValue(item.retrieval.currentDocumentCount),
    supplyFreshness: item.freshness.state,
    compatibilityState: item.compatibility?.state ?? "UNOBSERVED",
    compatibilityFreshness: item.compatibility?.freshness ?? "UNOBSERVED",
    latestRunStatus: item.latestRun?.status ?? null,
  };
  const blockers: SourceSupplyPromotionProofBlocker[] = [];
  if (evidence.registrationState !== "REGISTERED") blockers.push("SOURCE_UNREGISTERED");
  if (evidence.artifactCount <= 0) blockers.push("NO_ACQUISITION_EVIDENCE");
  if (evidence.readyDocumentCount <= 0) blockers.push("NO_READY_NORMALIZED_DOCUMENT");
  if (evidence.currentRetrievalDocumentCount <= 0) {
    blockers.push("NO_CURRENT_RETRIEVAL_DOCUMENT");
  }
  if (evidence.supplyFreshness !== "FRESH") blockers.push("SUPPLY_NOT_FRESH");
  if (evidence.compatibilityState !== "PASS") blockers.push("COMPATIBILITY_NOT_PASS");
  if (evidence.compatibilityFreshness !== "FRESH") blockers.push("COMPATIBILITY_NOT_FRESH");
  return { status: blockers.length === 0 ? "PROVEN" : "INCOMPLETE", blockers, evidence };
}

function rowToReceipt(row: Record<string, unknown>): SourceSupplyPromotionReceipt {
  return {
    version: SOURCE_SUPPLY_PROMOTION_RECEIPT_VERSION,
    objectType: "SOURCE_SUPPLY_PROMOTION_RECEIPT",
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    jurisdiction: String(row.jurisdiction),
    targetId: String(row.target_id),
    sourceId: String(row.source_id),
    planId: String(row.plan_id),
    collectionRunId: String(row.collection_run_id),
    operatorActor: String(row.operator_actor),
    idempotencyKey: String(row.idempotency_key),
    status: String(row.status) as SourceSupplyPromotionReceiptStatus,
    lastProofStatus: String(row.last_proof_status) as SourceSupplyPromotionProofStatus,
    proofBlockers: JSON.parse(String(row.proof_blockers_json)) as SourceSupplyPromotionProofBlocker[],
    proofEvidence: row.proof_evidence_json
      ? (JSON.parse(String(row.proof_evidence_json)) as SourceSupplyPromotionProofEvidence)
      : null,
    proofError: row.proof_error ? String(row.proof_error) : null,
    dispatchedAt: String(row.dispatched_at),
    lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : null,
    provenAt: row.proven_at ? String(row.proven_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function ensureSourceSupplyPromotionReceiptLedger(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      target_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      collection_run_id TEXT NOT NULL UNIQUE,
      operator_actor TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      semantic_fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('DISPATCHED','PROVEN')),
      last_proof_status TEXT NOT NULL CHECK (last_proof_status IN ('UNCHECKED','INCOMPLETE','FAILED','PROVEN')),
      proof_blockers_json TEXT NOT NULL,
      proof_evidence_json TEXT,
      proof_error TEXT,
      dispatched_at TEXT NOT NULL,
      last_checked_at TEXT,
      proven_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, idempotency_key)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_supply_promotion_receipts_workspace
      ON ${TABLE}(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_supply_promotion_receipts_target
      ON ${TABLE}(workspace_id, jurisdiction, target_id, updated_at DESC);
  `);
}

export class SqliteSourceSupplyPromotionReceiptLedger {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureSourceSupplyPromotionReceiptLedger(database);
  }

  getById(id: string): SourceSupplyPromotionReceipt | null {
    const row = this.database.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToReceipt(row) : null;
  }

  getByCollectionRunId(collectionRunId: string): SourceSupplyPromotionReceipt | null {
    const row = this.database
      .prepare(`SELECT * FROM ${TABLE} WHERE collection_run_id = ?`)
      .get(collectionRunId) as Record<string, unknown> | undefined;
    return row ? rowToReceipt(row) : null;
  }

  start(input: StartSourceSupplyPromotionReceiptInput): {
    receipt: SourceSupplyPromotionReceipt;
    replayed: boolean;
  } {
    const normalized = {
      ...input,
      workspaceId: required(input.workspaceId, "workspaceId"),
      jurisdiction: required(input.jurisdiction, "jurisdiction").toUpperCase(),
      targetId: required(input.targetId, "targetId"),
      sourceId: required(input.sourceId, "sourceId"),
      planId: required(input.planId, "planId"),
      collectionRunId: required(input.collectionRunId, "collectionRunId"),
      operatorActor: required(input.operatorActor, "operatorActor"),
    };
    const fingerprint = semanticFingerprint(normalized);
    const idempotencyKey =
      input.idempotencyKey?.trim() || `source-supply-promotion:${normalized.collectionRunId}`;
    const existing = this.getByCollectionRunId(normalized.collectionRunId);
    if (existing) {
      const existingFingerprint = this.database
        .prepare(`SELECT semantic_fingerprint FROM ${TABLE} WHERE id = ?`)
        .get(existing.id) as { semantic_fingerprint: string } | undefined;
      if (existingFingerprint?.semantic_fingerprint !== fingerprint) {
        throw new RegistryConflictError(
          "SOURCE_SUPPLY_PROMOTION_RECEIPT_CONFLICT",
          "CollectionRun already belongs to a different supply promotion receipt",
        );
      }
      return { receipt: existing, replayed: true };
    }
    const timestamp = this.clock().toISOString();
    const dispatchedAt = input.dispatchedAt?.trim() || timestamp;
    const id = deterministicId(normalized);
    try {
      this.database
        .prepare(
          `INSERT INTO ${TABLE} (
            id, workspace_id, jurisdiction, target_id, source_id, plan_id, collection_run_id,
            operator_actor, idempotency_key, semantic_fingerprint, status, last_proof_status,
            proof_blockers_json, proof_evidence_json, proof_error, dispatched_at,
            last_checked_at, proven_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISPATCHED', 'UNCHECKED', '[]', NULL, NULL, ?, NULL, NULL, ?, ?)`,
        )
        .run(
          id,
          normalized.workspaceId,
          normalized.jurisdiction,
          normalized.targetId,
          normalized.sourceId,
          normalized.planId,
          normalized.collectionRunId,
          normalized.operatorActor,
          idempotencyKey,
          fingerprint,
          dispatchedAt,
          timestamp,
          timestamp,
        );
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
        const row = this.database
          .prepare(`SELECT * FROM ${TABLE} WHERE workspace_id = ? AND idempotency_key = ?`)
          .get(normalized.workspaceId, idempotencyKey) as Record<string, unknown> | undefined;
        if (row && String(row.semantic_fingerprint) === fingerprint) {
          return { receipt: rowToReceipt(row), replayed: true };
        }
        throw new RegistryConflictError(
          "SOURCE_SUPPLY_PROMOTION_IDEMPOTENCY_CONFLICT",
          "Idempotency key was already used for a different supply promotion receipt",
        );
      }
      throw error;
    }
    return { receipt: this.getById(id)!, replayed: false };
  }

  recordProof(input: RecordSourceSupplyPromotionProofInput): SourceSupplyPromotionReceipt {
    const current = this.getById(required(input.receiptId, "receiptId"));
    if (!current) throw new RegistryNotFoundError(input.receiptId);
    if (current.status === "PROVEN") return current;
    const checkedAt = required(input.checkedAt, "checkedAt");
    const timestamp = this.clock().toISOString();
    const proofStatus: SourceSupplyPromotionProofStatus = input.proof
      ? input.proof.status
      : "FAILED";
    const provenAt = input.proof?.status === "PROVEN" ? checkedAt : null;
    this.database
      .prepare(
        `UPDATE ${TABLE}
         SET status = ?, last_proof_status = ?, proof_blockers_json = ?, proof_evidence_json = ?,
             proof_error = ?, last_checked_at = ?, proven_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.proof?.status === "PROVEN" ? "PROVEN" : "DISPATCHED",
        proofStatus,
        JSON.stringify(input.proof?.blockers ?? []),
        input.proof ? JSON.stringify(input.proof.evidence) : null,
        input.error?.trim() || null,
        checkedAt,
        provenAt,
        timestamp,
        current.id,
      );
    return this.getById(current.id)!;
  }

  list(filters: SourceSupplyPromotionReceiptListFilters): SourceSupplyPromotionReceipt[] {
    const workspaceId = required(filters.workspaceId, "workspaceId");
    const clauses = ["workspace_id = ?"];
    const values: SQLInputValue[] = [workspaceId];
    if (filters.jurisdiction) {
      clauses.push("jurisdiction = ?");
      values.push(filters.jurisdiction.trim().toUpperCase());
    }
    if (filters.targetId) {
      clauses.push("target_id = ?");
      values.push(filters.targetId.trim());
    }
    if (filters.status) {
      clauses.push("status = ?");
      values.push(filters.status);
    }
    const limit = filters.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
      throw new RegistryValidationError("limit must be an integer between 1 and 100");
    }
    return (
      this.database
        .prepare(
          `SELECT * FROM ${TABLE} WHERE ${clauses.join(" AND ")}
           ORDER BY updated_at DESC, id DESC LIMIT ?`,
        )
        .all(...values, limit) as Record<string, unknown>[]
    ).map(rowToReceipt);
  }
}
