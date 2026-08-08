import { randomUUID } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type {
  SourceCandidate,
  SourceCandidateStatus,
  SourceDiscoveryBatch,
  SourceDiscoveryConstraints,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "1000_vnext_discovery_review_registry";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export type DiscoverySeedStatus = "ACTIVE" | "ARCHIVED";
export type DiscoveryBatchStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type CandidateReviewDecision = "ACCEPTED" | "REJECTED";

export type DiscoverySeedRecord = {
  seedId: string;
  locator: string;
  metadata?: Record<string, unknown>;
  status: DiscoverySeedStatus;
  createdAt: string;
  updatedAt: string;
};

export type DiscoveryBatchRecord = {
  batch: SourceDiscoveryBatch;
  status: DiscoveryBatchStatus;
  candidateCount: number;
  completedAt?: string;
  errorMessage?: string;
};

export type CandidateReview = {
  decision: CandidateReviewDecision;
  reviewedAt: string;
  reviewer?: string;
  note?: string;
  acceptedSourceId?: string;
  collectionPlanId?: string;
};

export type SourceCandidateRecord = {
  batchId: string;
  candidate: SourceCandidate;
  firstSeenAt: string;
  lastSeenAt: string;
  review?: CandidateReview;
};

export type SourceCandidateListFilters = {
  status?: SourceCandidateStatus;
  batchId?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export type SourceCandidateListResult = {
  items: SourceCandidateRecord[];
  total: number;
  limit: number;
  offset: number;
  summary: Record<SourceCandidateStatus, number> & { total: number };
};

export type ReviewCandidateInput = {
  decision: CandidateReviewDecision;
  reviewer?: string;
  note?: string;
  acceptedSourceId?: string;
  collectionPlanId?: string;
};

export interface SourceDiscoveryRepository {
  createSeed(input: {
    seedId?: string;
    locator: string;
    metadata?: Record<string, unknown>;
  }): DiscoverySeedRecord;
  listSeeds(): DiscoverySeedRecord[];
  createBatch(batch: SourceDiscoveryBatch): DiscoveryBatchRecord;
  completeBatch(batchId: string, candidates: SourceCandidate[]): DiscoveryBatchRecord;
  failBatch(batchId: string, errorMessage: string): DiscoveryBatchRecord;
  getBatch(batchId: string): DiscoveryBatchRecord | null;
  listBatches(limit?: number): DiscoveryBatchRecord[];
  getCandidate(candidateId: string): SourceCandidateRecord | null;
  listCandidates(filters?: SourceCandidateListFilters): SourceCandidateListResult;
  reviewCandidate(candidateId: string, input: ReviewCandidateInput): SourceCandidateRecord;
}

export class DiscoveryBatchNotFoundError extends RegistryError {
  constructor(batchId: string) {
    super("DISCOVERY_BATCH_NOT_FOUND", `Discovery batch ${batchId} was not found`, { batchId });
  }
}

export class SourceCandidateNotFoundError extends RegistryError {
  constructor(candidateId: string) {
    super("SOURCE_CANDIDATE_NOT_FOUND", `Source candidate ${candidateId} was not found`, {
      candidateId,
    });
  }
}

function normalizeLocator(locator: string): string {
  const trimmed = locator.trim();
  if (!trimmed) throw new RegistryValidationError("Discovery locator is required");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new RegistryValidationError("Discovery locator must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RegistryValidationError("Discovery locator must use http or https");
  }
  url.hash = "";
  return url.toString();
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(limit, MAX_LIMIT);
}

function normalizeOffset(offset: number | undefined): number {
  if (offset === undefined) return 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RegistryValidationError("offset must be a non-negative integer");
  }
  return offset;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}

function parseSeed(row: Record<string, unknown>): DiscoverySeedRecord {
  const metadata = parseJsonRecord(row.metadata_json);
  return {
    seedId: String(row.seed_id),
    locator: String(row.locator),
    status: String(row.status) as DiscoverySeedStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(metadata ? { metadata } : {}),
  };
}

function parseBatch(row: Record<string, unknown>): DiscoveryBatchRecord {
  const batch = JSON.parse(String(row.document_json)) as SourceDiscoveryBatch;
  return {
    batch,
    status: String(row.status) as DiscoveryBatchStatus,
    candidateCount: Number(row.candidate_count),
    ...(row.completed_at ? { completedAt: String(row.completed_at) } : {}),
    ...(row.error_message ? { errorMessage: String(row.error_message) } : {}),
  };
}

function parseCandidate(row: Record<string, unknown>): SourceCandidateRecord {
  const candidate = JSON.parse(String(row.document_json)) as SourceCandidate;
  const decision = row.review_decision
    ? (String(row.review_decision) as CandidateReviewDecision)
    : undefined;
  const review: CandidateReview | undefined = decision
    ? {
        decision,
        reviewedAt: String(row.reviewed_at),
        ...(row.reviewer ? { reviewer: String(row.reviewer) } : {}),
        ...(row.review_note ? { note: String(row.review_note) } : {}),
        ...(row.accepted_source_id ? { acceptedSourceId: String(row.accepted_source_id) } : {}),
        ...(row.collection_plan_id ? { collectionPlanId: String(row.collection_plan_id) } : {}),
      }
    : undefined;
  return {
    batchId: String(row.last_batch_id),
    candidate,
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    ...(review ? { review } : {}),
  };
}

function ensureDiscoveryMigration(database: DatabaseSync): void {
  initializeRegistry(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS discovery_seeds (
        seed_id TEXT PRIMARY KEY,
        locator TEXT NOT NULL UNIQUE,
        metadata_json TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS discovery_batches (
        batch_id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        status TEXT NOT NULL,
        candidate_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS source_candidates (
        candidate_id TEXT PRIMARY KEY,
        locator TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        document_json TEXT NOT NULL,
        first_batch_id TEXT NOT NULL,
        last_batch_id TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        review_decision TEXT,
        reviewed_at TEXT,
        reviewer TEXT,
        review_note TEXT,
        accepted_source_id TEXT,
        collection_plan_id TEXT,
        FOREIGN KEY (first_batch_id) REFERENCES discovery_batches(batch_id),
        FOREIGN KEY (last_batch_id) REFERENCES discovery_batches(batch_id),
        FOREIGN KEY (accepted_source_id) REFERENCES source_definitions(id),
        FOREIGN KEY (collection_plan_id) REFERENCES collection_plans(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_discovery_batches_created
        ON discovery_batches(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_source_candidates_status_seen
        ON source_candidates(status, last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_source_candidates_batch
        ON source_candidates(last_batch_id, last_seen_at DESC);
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

export class SqliteSourceDiscoveryRepository implements SourceDiscoveryRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureDiscoveryMigration(database);
  }

  createSeed(input: {
    seedId?: string;
    locator: string;
    metadata?: Record<string, unknown>;
  }): DiscoverySeedRecord {
    const locator = normalizeLocator(input.locator);
    const existing = this.database
      .prepare("SELECT * FROM discovery_seeds WHERE locator = ?")
      .get(locator) as Record<string, unknown> | undefined;
    if (existing) return parseSeed(existing);

    const timestamp = this.clock().toISOString();
    const seedId = input.seedId?.trim() || `seed_${randomUUID().replaceAll("-", "")}`;
    this.database
      .prepare(
        `INSERT INTO discovery_seeds (
           seed_id, locator, metadata_json, status, created_at, updated_at
         ) VALUES (?, ?, ?, 'ACTIVE', ?, ?)`,
      )
      .run(seedId, locator, input.metadata ? JSON.stringify(input.metadata) : null, timestamp, timestamp);

    return {
      seedId,
      locator,
      status: "ACTIVE",
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
  }

  listSeeds(): DiscoverySeedRecord[] {
    return this.database
      .prepare("SELECT * FROM discovery_seeds ORDER BY updated_at DESC, seed_id DESC")
      .all()
      .map((row) => parseSeed(row as Record<string, unknown>));
  }

  createBatch(batch: SourceDiscoveryBatch): DiscoveryBatchRecord {
    if (!batch.batchId.trim()) throw new RegistryValidationError("Discovery batch id is required");
    if (batch.seeds.length === 0) {
      throw new RegistryValidationError("Discovery batch requires at least one seed");
    }
    this.database
      .prepare(
        `INSERT INTO discovery_batches (
           batch_id, document_json, status, candidate_count, created_at
         ) VALUES (?, ?, 'RUNNING', 0, ?)`,
      )
      .run(batch.batchId, JSON.stringify(batch), batch.createdAt);
    return { batch, status: "RUNNING", candidateCount: 0 };
  }

  completeBatch(batchId: string, candidates: SourceCandidate[]): DiscoveryBatchRecord {
    const current = this.getBatch(batchId);
    if (!current) throw new DiscoveryBatchNotFoundError(batchId);
    if (current.status !== "RUNNING") {
      throw new RegistryConflictError(
        "DISCOVERY_BATCH_TERMINAL",
        `Discovery batch ${batchId} is already ${current.status}`,
      );
    }

    const completedAt = this.clock().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      for (const candidate of candidates) {
        const locator = normalizeLocator(candidate.locator);
        const existing = this.database
          .prepare("SELECT * FROM source_candidates WHERE candidate_id = ? OR locator = ?")
          .get(candidate.candidateId, locator) as Record<string, unknown> | undefined;

        if (!existing) {
          const normalized: SourceCandidate = { ...candidate, locator };
          this.database
            .prepare(
              `INSERT INTO source_candidates (
                 candidate_id, locator, status, document_json, first_batch_id, last_batch_id,
                 first_seen_at, last_seen_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              normalized.candidateId,
              normalized.locator,
              normalized.status,
              JSON.stringify(normalized),
              batchId,
              batchId,
              normalized.discoveredAt,
              completedAt,
            );
          continue;
        }

        const existingRecord = parseCandidate(existing);
        const terminal =
          existingRecord.candidate.status === "ACCEPTED" ||
          existingRecord.candidate.status === "REJECTED";
        const nextCandidate = terminal
          ? existingRecord.candidate
          : ({ ...candidate, locator } satisfies SourceCandidate);
        this.database
          .prepare(
            `UPDATE source_candidates
             SET status = ?, document_json = ?, last_batch_id = ?, last_seen_at = ?
             WHERE candidate_id = ?`,
          )
          .run(
            nextCandidate.status,
            JSON.stringify(nextCandidate),
            batchId,
            completedAt,
            existingRecord.candidate.candidateId,
          );
      }

      this.database
        .prepare(
          `UPDATE discovery_batches
           SET status = 'COMPLETED', candidate_count = ?, completed_at = ?
           WHERE batch_id = ?`,
        )
        .run(candidates.length, completedAt, batchId);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }

    return { ...current, status: "COMPLETED", candidateCount: candidates.length, completedAt };
  }

  failBatch(batchId: string, errorMessage: string): DiscoveryBatchRecord {
    const current = this.getBatch(batchId);
    if (!current) throw new DiscoveryBatchNotFoundError(batchId);
    if (current.status !== "RUNNING") return current;
    const completedAt = this.clock().toISOString();
    this.database
      .prepare(
        `UPDATE discovery_batches
         SET status = 'FAILED', error_message = ?, completed_at = ?
         WHERE batch_id = ?`,
      )
      .run(errorMessage.slice(0, 1000), completedAt, batchId);
    return {
      ...current,
      status: "FAILED",
      completedAt,
      errorMessage: errorMessage.slice(0, 1000),
    };
  }

  getBatch(batchId: string): DiscoveryBatchRecord | null {
    const row = this.database
      .prepare("SELECT * FROM discovery_batches WHERE batch_id = ?")
      .get(batchId) as Record<string, unknown> | undefined;
    return row ? parseBatch(row) : null;
  }

  listBatches(limit = 20): DiscoveryBatchRecord[] {
    const normalizedLimit = normalizeLimit(limit);
    return this.database
      .prepare("SELECT * FROM discovery_batches ORDER BY created_at DESC, batch_id DESC LIMIT ?")
      .all(normalizedLimit)
      .map((row) => parseBatch(row as Record<string, unknown>));
  }

  getCandidate(candidateId: string): SourceCandidateRecord | null {
    const row = this.database
      .prepare("SELECT * FROM source_candidates WHERE candidate_id = ?")
      .get(candidateId) as Record<string, unknown> | undefined;
    return row ? parseCandidate(row) : null;
  }

  listCandidates(filters: SourceCandidateListFilters = {}): SourceCandidateListResult {
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const clauses: string[] = [];
    const values: SQLInputValue[] = [];

    if (filters.status) {
      clauses.push("status = ?");
      values.push(filters.status);
    }
    if (filters.batchId?.trim()) {
      clauses.push("last_batch_id = ?");
      values.push(filters.batchId.trim());
    }
    if (filters.q?.trim()) {
      clauses.push("lower(locator) LIKE ?");
      values.push(`%${filters.q.trim().toLowerCase()}%`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const items = this.database
      .prepare(
        `SELECT * FROM source_candidates ${where}
         ORDER BY last_seen_at DESC, candidate_id DESC LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset)
      .map((row) => parseCandidate(row as Record<string, unknown>));
    const totalRow = this.database
      .prepare(`SELECT COUNT(*) AS count FROM source_candidates ${where}`)
      .get(...values) as { count: number };
    const summaryRows = this.database
      .prepare("SELECT status, COUNT(*) AS count FROM source_candidates GROUP BY status")
      .all() as Array<{ status: SourceCandidateStatus; count: number }>;
    const summary: Record<SourceCandidateStatus, number> = {
      DISCOVERED: 0,
      REVIEWED: 0,
      ACCEPTED: 0,
      REJECTED: 0,
    };
    for (const row of summaryRows) summary[row.status] = Number(row.count);

    return {
      items,
      total: Number(totalRow.count),
      limit,
      offset,
      summary: {
        ...summary,
        total: Object.values(summary).reduce((sum, count) => sum + count, 0),
      },
    };
  }

  reviewCandidate(candidateId: string, input: ReviewCandidateInput): SourceCandidateRecord {
    const current = this.getCandidate(candidateId);
    if (!current) throw new SourceCandidateNotFoundError(candidateId);

    if (current.candidate.status === "ACCEPTED" || current.candidate.status === "REJECTED") {
      if (current.candidate.status === input.decision) return current;
      throw new RegistryConflictError(
        "SOURCE_CANDIDATE_REVIEW_CONFLICT",
        `Candidate ${candidateId} is already ${current.candidate.status}`,
      );
    }

    if (input.decision === "ACCEPTED" && (!input.acceptedSourceId || !input.collectionPlanId)) {
      throw new RegistryValidationError(
        "Accepted candidates require an accepted source id and collection plan id",
      );
    }

    const reviewedAt = this.clock().toISOString();
    const nextCandidate: SourceCandidate = {
      ...current.candidate,
      status: input.decision,
    };
    this.database
      .prepare(
        `UPDATE source_candidates SET
           status = ?, document_json = ?, review_decision = ?, reviewed_at = ?, reviewer = ?,
           review_note = ?, accepted_source_id = ?, collection_plan_id = ?
         WHERE candidate_id = ?`,
      )
      .run(
        input.decision,
        JSON.stringify(nextCandidate),
        input.decision,
        reviewedAt,
        input.reviewer?.trim() || null,
        input.note?.trim() || null,
        input.acceptedSourceId ?? null,
        input.collectionPlanId ?? null,
        candidateId,
      );

    return {
      ...current,
      candidate: nextCandidate,
      review: {
        decision: input.decision,
        reviewedAt,
        ...(input.reviewer?.trim() ? { reviewer: input.reviewer.trim() } : {}),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        ...(input.acceptedSourceId ? { acceptedSourceId: input.acceptedSourceId } : {}),
        ...(input.collectionPlanId ? { collectionPlanId: input.collectionPlanId } : {}),
      },
    };
  }
}

export type DiscoveryRunInput = {
  locator: string;
  constraints?: SourceDiscoveryConstraints;
  metadata?: Record<string, unknown>;
};
