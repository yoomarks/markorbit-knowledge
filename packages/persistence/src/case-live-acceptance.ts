import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isCaseLiveAcceptanceReceiptV1,
  type CaseLiveAcceptancePrivacyReceiptV1,
  type CaseLiveAcceptanceReceiptV1,
  type CaseLiveAcceptanceState,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export type CaseLiveAcceptanceReceiptEventV1 = {
  runId: string;
  revision: number;
  documentSha256: string;
  recordedAt: string;
  receipt: CaseLiveAcceptanceReceiptV1;
};

export type CaseLiveAcceptanceSaveResultV1 = {
  receipt: CaseLiveAcceptanceReceiptV1;
  revision: number;
  replayed: boolean;
};

type CurrentRow = {
  revision: number;
  document_sha256: string;
  document_json: string;
};

type EventRow = {
  run_id: string;
  revision: number;
  document_sha256: string;
  document_json: string;
  recorded_at: string;
};

export function ensureCaseLiveAcceptanceRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS case_live_acceptance_runs (
      run_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL CHECK (revision >= 1),
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS case_live_acceptance_run_events (
      run_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision >= 1),
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY(run_id, revision),
      FOREIGN KEY(run_id) REFERENCES case_live_acceptance_runs(run_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS case_live_acceptance_events_idx
      ON case_live_acceptance_run_events(run_id, revision ASC);
  `);
  INITIALIZED_DATABASES.add(database);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseReceipt(value: string): CaseLiveAcceptanceReceiptV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isCaseLiveAcceptanceReceiptV1(parsed)) {
    throw new RegistryValidationError("Stored Case live acceptance receipt is invalid");
  }
  return parsed;
}

function same(value: unknown, other: unknown): boolean {
  return canonical(value) === canonical(other);
}

function transitionAllowed(from: CaseLiveAcceptanceState, to: CaseLiveAcceptanceState): boolean {
  if (from === to) return true;
  if (from === "STARTED") {
    return to === "WAITING_SOURCE" || to === "PRIVACY_REVIEW_REQUIRED" || to === "FAILED";
  }
  if (from === "WAITING_SOURCE") {
    return to === "PRIVACY_REVIEW_REQUIRED" || to === "FAILED";
  }
  if (from === "PRIVACY_REVIEW_REQUIRED") {
    return to === "FINALIZED" || to === "FAILED";
  }
  return false;
}

function privacyProgressionAllowed(
  from: CaseLiveAcceptancePrivacyReceiptV1 | undefined,
  to: CaseLiveAcceptancePrivacyReceiptV1 | undefined,
): boolean {
  if (!from) return true;
  if (!to || from.reviewId !== to.reviewId) return false;
  if (from.state === to.state) return true;
  if (from.state === "REVIEW_REQUIRED") {
    return to.state === "NEEDS_REDACTION" || to.state === "FINALIZED";
  }
  if (from.state === "NEEDS_REDACTION") return to.state === "FINALIZED";
  return false;
}

function assertStableLineage(
  current: CaseLiveAcceptanceReceiptV1,
  next: CaseLiveAcceptanceReceiptV1,
): void {
  if (
    current.runId !== next.runId ||
    current.runMode !== next.runMode ||
    current.transportMode !== next.transportMode ||
    current.producerPromotionRef !== next.producerPromotionRef ||
    current.startedAt !== next.startedAt ||
    !same(current.candidate, next.candidate) ||
    !same(current.privacyPlan, next.privacyPlan)
  ) {
    throw new RegistryConflictError(
      "CASE_LIVE_ACCEPTANCE_LINEAGE_CONFLICT",
      "Case live acceptance run identity, producer/source lineage or privacy plan changed after creation",
    );
  }
  if (!transitionAllowed(current.state, next.state)) {
    throw new RegistryConflictError(
      "CASE_LIVE_ACCEPTANCE_STATE_CONFLICT",
      `Case live acceptance state cannot transition from ${current.state} to ${next.state}`,
    );
  }
  if (current.evidence && !same(current.evidence, next.evidence)) {
    throw new RegistryConflictError(
      "CASE_LIVE_ACCEPTANCE_EVIDENCE_CONFLICT",
      "Case live acceptance evidence receipt is immutable once recorded",
    );
  }
  if (current.assembledDossier && !same(current.assembledDossier, next.assembledDossier)) {
    throw new RegistryConflictError(
      "CASE_LIVE_ACCEPTANCE_DOSSIER_CONFLICT",
      "Case live acceptance assembled Dossier receipt is immutable once recorded",
    );
  }
  if (!privacyProgressionAllowed(current.privacyReview, next.privacyReview)) {
    throw new RegistryConflictError(
      "CASE_LIVE_ACCEPTANCE_PRIVACY_CONFLICT",
      "Case live acceptance privacy review identity or state regressed",
    );
  }
  if (current.finalized && !same(current.finalized, next.finalized)) {
    throw new RegistryConflictError(
      "CASE_LIVE_ACCEPTANCE_FINALIZED_CONFLICT",
      "Case live acceptance finalized receipt is immutable once recorded",
    );
  }
}

export class SqliteCaseLiveAcceptanceRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureCaseLiveAcceptanceRegistry(database);
  }

  saveReceipt(value: CaseLiveAcceptanceReceiptV1): CaseLiveAcceptanceSaveResultV1 {
    if (!isCaseLiveAcceptanceReceiptV1(value)) {
      throw new RegistryValidationError("Case live acceptance receipt is invalid");
    }
    const json = canonical(value);
    const documentSha256 = sha256(json);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const currentRow = this.database
        .prepare(
          `SELECT revision, document_sha256, document_json
             FROM case_live_acceptance_runs
            WHERE run_id = ?`,
        )
        .get(value.runId) as CurrentRow | undefined;

      if (!currentRow) {
        if (value.state !== "STARTED") {
          throw new RegistryConflictError(
            "CASE_LIVE_ACCEPTANCE_INITIAL_STATE_INVALID",
            "A Case live acceptance run must begin in STARTED state",
          );
        }
        this.database
          .prepare(
            `INSERT INTO case_live_acceptance_runs(
              run_id, revision, document_sha256, document_json, created_at, updated_at
            ) VALUES (?, 1, ?, ?, ?, ?)`,
          )
          .run(value.runId, documentSha256, json, value.startedAt, value.updatedAt);
        this.database
          .prepare(
            `INSERT INTO case_live_acceptance_run_events(
              run_id, revision, document_sha256, document_json, recorded_at
            ) VALUES (?, 1, ?, ?, ?)`,
          )
          .run(value.runId, documentSha256, json, value.updatedAt);
        this.database.exec("COMMIT;");
        return { receipt: value, revision: 1, replayed: false };
      }

      if (currentRow.document_sha256 === documentSha256 && currentRow.document_json === json) {
        const receipt = parseReceipt(currentRow.document_json);
        this.database.exec("COMMIT;");
        return { receipt, revision: currentRow.revision, replayed: true };
      }

      const current = parseReceipt(currentRow.document_json);
      assertStableLineage(current, value);
      if (Date.parse(value.updatedAt) < Date.parse(current.updatedAt)) {
        throw new RegistryConflictError(
          "CASE_LIVE_ACCEPTANCE_TIME_REGRESSION",
          "Case live acceptance updatedAt cannot move backwards",
        );
      }

      const revision = currentRow.revision + 1;
      this.database
        .prepare(
          `UPDATE case_live_acceptance_runs
              SET revision = ?, document_sha256 = ?, document_json = ?, updated_at = ?
            WHERE run_id = ?`,
        )
        .run(revision, documentSha256, json, value.updatedAt, value.runId);
      this.database
        .prepare(
          `INSERT INTO case_live_acceptance_run_events(
            run_id, revision, document_sha256, document_json, recorded_at
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(value.runId, revision, documentSha256, json, value.updatedAt);
      this.database.exec("COMMIT;");
      return { receipt: value, revision, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getReceipt(runId: string): CaseLiveAcceptanceSaveResultV1 | null {
    const row = this.database
      .prepare(
        `SELECT revision, document_sha256, document_json
           FROM case_live_acceptance_runs
          WHERE run_id = ?`,
      )
      .get(runId) as CurrentRow | undefined;
    if (!row) return null;
    return { receipt: parseReceipt(row.document_json), revision: row.revision, replayed: false };
  }

  listEvents(runId: string): CaseLiveAcceptanceReceiptEventV1[] {
    const rows = this.database
      .prepare(
        `SELECT run_id, revision, document_sha256, document_json, recorded_at
           FROM case_live_acceptance_run_events
          WHERE run_id = ?
          ORDER BY revision ASC`,
      )
      .all(runId) as EventRow[];
    return rows.map((row) => ({
      runId: row.run_id,
      revision: row.revision,
      documentSha256: row.document_sha256,
      recordedAt: row.recorded_at,
      receipt: parseReceipt(row.document_json),
    }));
  }
}
