import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  CASE_CANDIDATE_INTAKE_OBJECT_TYPE,
  CASE_CANDIDATE_INTAKE_PROTOCOL_VERSION,
  caseCandidateSourceIdentityKeyV1,
  isCaseCandidateIntakeV1,
  isCaseCandidateV1,
  type CaseCandidateIntakeV1,
  type CaseCandidateV1,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export type CaseCandidateIntakeResultV1 = {
  candidate: CaseCandidateV1;
  intake: CaseCandidateIntakeV1;
};

type StoredCaseCandidateRow = {
  candidate_id: string;
  source_identity_sha256: string;
  document_sha256: string;
  document_json: string;
};

type IntakeRow = {
  candidate_id: string;
  source_identity_sha256: string;
  collection_state: "PENDING" | "WAITING_SOURCE";
  source_error_code: string | null;
  source_error_message: string | null;
  source_error_observed_at: string | null;
  collection_ref: string | null;
  collected_at: string | null;
  accepted_at: string;
  updated_at: string;
};

export function ensureCaseCandidateIntakeRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS case_candidates (
      candidate_id TEXT PRIMARY KEY,
      source_identity_sha256 TEXT NOT NULL UNIQUE CHECK (length(source_identity_sha256) = 64),
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      accepted_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS case_candidate_intake_commands (
      idempotency_key TEXT PRIMARY KEY,
      request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64),
      candidate_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(candidate_id) REFERENCES case_candidates(candidate_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS case_candidate_collection_tickets (
      candidate_id TEXT PRIMARY KEY,
      source_identity_sha256 TEXT NOT NULL CHECK (length(source_identity_sha256) = 64),
      collection_state TEXT NOT NULL CHECK (collection_state IN ('PENDING', 'WAITING_SOURCE')),
      source_error_code TEXT,
      source_error_message TEXT,
      source_error_observed_at TEXT,
      collection_ref TEXT,
      collected_at TEXT,
      accepted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(candidate_id) REFERENCES case_candidates(candidate_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS case_candidate_collection_state_idx
      ON case_candidate_collection_tickets(collection_state, updated_at ASC, candidate_id ASC);
  `);

  const columns = new Set(
    (
      database.prepare("PRAGMA table_info(case_candidate_collection_tickets)").all() as {
        name: string;
      }[]
    ).map((row) => row.name),
  );
  if (!columns.has("collection_ref")) {
    database.exec("ALTER TABLE case_candidate_collection_tickets ADD COLUMN collection_ref TEXT;");
  }
  if (!columns.has("collected_at")) {
    database.exec("ALTER TABLE case_candidate_collection_tickets ADD COLUMN collected_at TEXT;");
  }

  INITIALIZED_DATABASES.add(database);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function documentSha256(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function parseCandidate(value: string): CaseCandidateV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isCaseCandidateV1(parsed)) {
    throw new RegistryValidationError("Stored Case Candidate is invalid");
  }
  return parsed;
}

function assertCompatibleSourceSemantics(
  existing: CaseCandidateV1,
  incoming: CaseCandidateV1,
): void {
  if (
    existing.sourceRetrievalRef !== incoming.sourceRetrievalRef ||
    existing.accessScope.classification !== incoming.accessScope.classification
  ) {
    throw new RegistryConflictError(
      "CASE_CANDIDATE_SOURCE_SEMANTICS_CONFLICT",
      "The same MarkReg source snapshot was promoted with different retrieval or access semantics",
      { existingCandidateId: existing.candidateId },
    );
  }
}

function parseIntake(row: IntakeRow): CaseCandidateIntakeV1 {
  const semanticallyCollected = row.collection_ref !== null || row.collected_at !== null;
  const value: CaseCandidateIntakeV1 = {
    protocolVersion: CASE_CANDIDATE_INTAKE_PROTOCOL_VERSION,
    objectType: CASE_CANDIDATE_INTAKE_OBJECT_TYPE,
    candidateId: row.candidate_id,
    sourceIdentitySha256: row.source_identity_sha256,
    collectionState: semanticallyCollected ? "COLLECTED" : row.collection_state,
    acceptedAt: row.accepted_at,
    updatedAt: row.updated_at,
    ...(semanticallyCollected
      ? {
          collectionRef: row.collection_ref ?? undefined,
          collectedAt: row.collected_at ?? undefined,
        }
      : row.collection_state === "WAITING_SOURCE"
        ? {
            sourceUnavailable: {
              code: row.source_error_code ?? "SOURCE_UNAVAILABLE",
              message: row.source_error_message ?? "Case source is temporarily unavailable",
              observedAt: row.source_error_observed_at ?? row.updated_at,
              retryable: true as const,
            },
          }
        : {}),
  };
  if (!isCaseCandidateIntakeV1(value)) {
    throw new RegistryValidationError("Stored Case Candidate intake state is invalid");
  }
  return value;
}

export class SqliteCaseCandidateIntakeRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureCaseCandidateIntakeRegistry(database);
  }

  acceptCandidate(
    value: CaseCandidateV1,
    acceptedAt = new Date().toISOString(),
  ): CaseCandidateIntakeResultV1 {
    if (!isCaseCandidateV1(value)) {
      throw new RegistryValidationError("Case Candidate is invalid");
    }
    if (Number.isNaN(Date.parse(acceptedAt))) {
      throw new RegistryValidationError("acceptedAt must be a valid timestamp");
    }

    const requestSha256 = documentSha256(value);
    const sourceIdentitySha256 = sha256(caseCandidateSourceIdentityKeyV1(value));

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const replay = this.database
        .prepare(
          `SELECT request_sha256, candidate_id
             FROM case_candidate_intake_commands
            WHERE idempotency_key = ?`,
        )
        .get(value.idempotencyKey) as { request_sha256: string; candidate_id: string } | undefined;
      if (replay) {
        if (replay.request_sha256 !== requestSha256) {
          throw new RegistryConflictError(
            "CASE_CANDIDATE_IDEMPOTENCY_CONFLICT",
            "Case Candidate idempotency key was replayed with different input",
          );
        }
        const result = this.requireResult(replay.candidate_id);
        this.database.exec("COMMIT;");
        return result;
      }

      const existingBySource = this.database
        .prepare(
          `SELECT candidate_id
             FROM case_candidates
            WHERE source_identity_sha256 = ?`,
        )
        .get(sourceIdentitySha256) as { candidate_id: string } | undefined;
      if (existingBySource) {
        const existing = this.getCandidate(existingBySource.candidate_id);
        if (!existing) {
          throw new RegistryConflictError(
            "CASE_CANDIDATE_STORAGE_MISSING",
            `Case Candidate ${existingBySource.candidate_id} disappeared during source replay`,
          );
        }
        assertCompatibleSourceSemantics(existing, value);
        this.database
          .prepare(
            `INSERT INTO case_candidate_intake_commands(
              idempotency_key, request_sha256, candidate_id, created_at
            ) VALUES (?, ?, ?, ?)`,
          )
          .run(value.idempotencyKey, requestSha256, existingBySource.candidate_id, acceptedAt);
        const result = this.requireResult(existingBySource.candidate_id);
        this.database.exec("COMMIT;");
        return result;
      }

      const json = JSON.stringify(value);
      const candidateDocumentSha256 = documentSha256(value);
      const existingById = this.database
        .prepare(
          `SELECT candidate_id, source_identity_sha256, document_sha256, document_json
             FROM case_candidates
            WHERE candidate_id = ?`,
        )
        .get(value.candidateId) as StoredCaseCandidateRow | undefined;
      if (existingById) {
        const stored = this.attestStoredCandidate(existingById);
        if (
          existingById.document_sha256 !== candidateDocumentSha256 ||
          existingById.document_json !== json ||
          stored.candidateId !== value.candidateId
        ) {
          throw new RegistryConflictError(
            "CASE_CANDIDATE_IMMUTABLE_CONFLICT",
            `Case Candidate ${value.candidateId} already exists with different content`,
          );
        }
      } else {
        this.database
          .prepare(
            `INSERT INTO case_candidates(
              candidate_id, source_identity_sha256, document_sha256, document_json, accepted_at
            ) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(value.candidateId, sourceIdentitySha256, candidateDocumentSha256, json, acceptedAt);
        this.database
          .prepare(
            `INSERT INTO case_candidate_collection_tickets(
              candidate_id, source_identity_sha256, collection_state,
              accepted_at, updated_at
            ) VALUES (?, ?, 'PENDING', ?, ?)`,
          )
          .run(value.candidateId, sourceIdentitySha256, acceptedAt, acceptedAt);
      }

      this.database
        .prepare(
          `INSERT INTO case_candidate_intake_commands(
            idempotency_key, request_sha256, candidate_id, created_at
          ) VALUES (?, ?, ?, ?)`,
        )
        .run(value.idempotencyKey, requestSha256, value.candidateId, acceptedAt);
      const result = this.requireResult(value.candidateId);
      this.database.exec("COMMIT;");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getCandidate(candidateId: string): CaseCandidateV1 | null {
    const row = this.database
      .prepare(
        `SELECT candidate_id, source_identity_sha256, document_sha256, document_json
           FROM case_candidates
          WHERE candidate_id = ?`,
      )
      .get(candidateId) as StoredCaseCandidateRow | undefined;
    return row ? this.attestStoredCandidate(row) : null;
  }

  getIntake(candidateId: string): CaseCandidateIntakeV1 | null {
    const row = this.database
      .prepare(
        `SELECT candidate_id, source_identity_sha256, collection_state,
                source_error_code, source_error_message, source_error_observed_at,
                collection_ref, collected_at, accepted_at, updated_at
           FROM case_candidate_collection_tickets
          WHERE candidate_id = ?`,
      )
      .get(candidateId) as IntakeRow | undefined;
    if (!row) return null;
    const intake = parseIntake(row);
    const candidate = this.getCandidate(candidateId);
    if (!candidate) {
      throw new RegistryConflictError(
        "CASE_CANDIDATE_COLLECTION_TICKET_ORPHANED",
        `Case Candidate collection ticket ${candidateId} has no durable Candidate`,
      );
    }
    return intake;
  }

  listPending(limit = 25): CaseCandidateIntakeResultV1[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RegistryValidationError("limit must be an integer between 1 and 100");
    }
    const rows = this.database
      .prepare(
        `SELECT candidate_id
           FROM case_candidate_collection_tickets
          WHERE collection_state = 'PENDING'
            AND collected_at IS NULL
          ORDER BY updated_at ASC, candidate_id ASC
          LIMIT ?`,
      )
      .all(limit) as { candidate_id: string }[];
    return rows.map((row) => this.requireResult(row.candidate_id));
  }

  recordSourceUnavailable(
    candidateId: string,
    input: { code: string; message: string; observedAt?: string },
  ): CaseCandidateIntakeV1 {
    const code = input.code.trim();
    const message = input.message.trim();
    const observedAt = input.observedAt ?? new Date().toISOString();
    if (!code || !message || Number.isNaN(Date.parse(observedAt))) {
      throw new RegistryValidationError(
        "A source-unavailable code, message and timestamp are required",
      );
    }
    if (!this.getCandidate(candidateId)) {
      throw new RegistryValidationError(`Case Candidate ${candidateId} does not exist`);
    }
    const current = this.requireIntake(candidateId);
    if (current.collectionState === "COLLECTED") {
      throw new RegistryConflictError(
        "CASE_CANDIDATE_ALREADY_COLLECTED",
        `Case Candidate ${candidateId} already has completed evidence collection`,
      );
    }
    this.database
      .prepare(
        `UPDATE case_candidate_collection_tickets
            SET collection_state = 'WAITING_SOURCE',
                source_error_code = ?, source_error_message = ?,
                source_error_observed_at = ?, updated_at = ?
          WHERE candidate_id = ?`,
      )
      .run(code, message, observedAt, observedAt, candidateId);
    return this.requireIntake(candidateId);
  }

  recordCollectionComplete(
    candidateId: string,
    collectionRef: string,
    collectedAt = new Date().toISOString(),
  ): CaseCandidateIntakeV1 {
    const ref = collectionRef.trim();
    if (!ref || Number.isNaN(Date.parse(collectedAt))) {
      throw new RegistryValidationError("A collection reference and valid timestamp are required");
    }
    if (!this.getCandidate(candidateId)) {
      throw new RegistryValidationError(`Case Candidate ${candidateId} does not exist`);
    }
    const current = this.requireIntake(candidateId);
    if (current.collectionState === "COLLECTED") {
      if (current.collectionRef !== ref) {
        throw new RegistryConflictError(
          "CASE_CANDIDATE_COLLECTION_CONFLICT",
          `Case Candidate ${candidateId} already points at a different evidence collection`,
        );
      }
      return current;
    }
    this.database
      .prepare(
        `UPDATE case_candidate_collection_tickets
            SET collection_state = 'PENDING',
                source_error_code = NULL, source_error_message = NULL,
                source_error_observed_at = NULL,
                collection_ref = ?, collected_at = ?, updated_at = ?
          WHERE candidate_id = ?`,
      )
      .run(ref, collectedAt, collectedAt, candidateId);
    return this.requireIntake(candidateId);
  }

  requeueCandidate(
    candidateId: string,
    requeuedAt = new Date().toISOString(),
  ): CaseCandidateIntakeV1 {
    if (Number.isNaN(Date.parse(requeuedAt))) {
      throw new RegistryValidationError("requeuedAt must be a valid timestamp");
    }
    if (!this.getCandidate(candidateId)) {
      throw new RegistryValidationError(`Case Candidate ${candidateId} does not exist`);
    }
    const current = this.requireIntake(candidateId);
    if (current.collectionState === "COLLECTED") {
      throw new RegistryConflictError(
        "CASE_CANDIDATE_ALREADY_COLLECTED",
        `Case Candidate ${candidateId} already has completed evidence collection`,
      );
    }
    this.database
      .prepare(
        `UPDATE case_candidate_collection_tickets
            SET collection_state = 'PENDING',
                source_error_code = NULL, source_error_message = NULL,
                source_error_observed_at = NULL,
                collection_ref = NULL, collected_at = NULL, updated_at = ?
          WHERE candidate_id = ?`,
      )
      .run(requeuedAt, candidateId);
    return this.requireIntake(candidateId);
  }

  private attestStoredCandidate(row: StoredCaseCandidateRow): CaseCandidateV1 {
    if (sha256(row.document_json) !== row.document_sha256) {
      throw new RegistryConflictError(
        "CASE_CANDIDATE_STORAGE_HASH_MISMATCH",
        "Stored Case Candidate document does not match its durable hash",
      );
    }
    const candidate = parseCandidate(row.document_json);
    if (candidate.candidateId !== row.candidate_id) {
      throw new RegistryConflictError(
        "CASE_CANDIDATE_STORAGE_ID_MISMATCH",
        "Stored Case Candidate document does not match its durable candidate ID",
      );
    }
    const expectedSourceIdentity = sha256(caseCandidateSourceIdentityKeyV1(candidate));
    if (expectedSourceIdentity !== row.source_identity_sha256) {
      throw new RegistryConflictError(
        "CASE_CANDIDATE_STORAGE_SOURCE_IDENTITY_MISMATCH",
        "Stored Case Candidate document does not match its durable source identity",
      );
    }

    const ticket = this.database
      .prepare(
        `SELECT source_identity_sha256
           FROM case_candidate_collection_tickets
          WHERE candidate_id = ?`,
      )
      .get(row.candidate_id) as { source_identity_sha256: string } | undefined;
    if (!ticket) {
      throw new RegistryConflictError(
        "CASE_CANDIDATE_COLLECTION_TICKET_MISSING",
        `Stored Case Candidate ${row.candidate_id} has no durable collection ticket`,
      );
    }
    if (ticket.source_identity_sha256 !== row.source_identity_sha256) {
      throw new RegistryConflictError(
        "CASE_CANDIDATE_COLLECTION_TICKET_IDENTITY_MISMATCH",
        "Stored Case Candidate and collection ticket disagree on source identity",
      );
    }

    const command = this.database
      .prepare(
        `SELECT request_sha256, candidate_id
           FROM case_candidate_intake_commands
          WHERE idempotency_key = ?`,
      )
      .get(candidate.idempotencyKey) as
      { request_sha256: string; candidate_id: string } | undefined;
    if (!command) {
      throw new RegistryConflictError(
        "CASE_CANDIDATE_INTAKE_COMMAND_MISSING",
        `Stored Case Candidate ${row.candidate_id} has no durable originating intake command`,
      );
    }
    if (
      command.candidate_id !== row.candidate_id ||
      command.request_sha256 !== row.document_sha256
    ) {
      throw new RegistryConflictError(
        "CASE_CANDIDATE_INTAKE_COMMAND_MISMATCH",
        "Stored Case Candidate does not match its originating intake command",
      );
    }
    return candidate;
  }

  private requireIntake(candidateId: string): CaseCandidateIntakeV1 {
    const intake = this.getIntake(candidateId);
    if (!intake) {
      throw new RegistryValidationError(`Case Candidate ${candidateId} has no collection ticket`);
    }
    return intake;
  }

  private requireResult(candidateId: string): CaseCandidateIntakeResultV1 {
    const candidate = this.getCandidate(candidateId);
    if (!candidate) {
      throw new RegistryValidationError(`Case Candidate ${candidateId} is missing`);
    }
    return { candidate, intake: this.requireIntake(candidateId) };
  }
}
