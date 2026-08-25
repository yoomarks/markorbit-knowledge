import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  type CaseCandidateV1,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";
import { SqliteCaseCandidateIntakeRepository } from "./case-candidate-intake";

function candidate(overrides: Partial<CaseCandidateV1> = {}): CaseCandidateV1 {
  return {
    protocolVersion: CASE_CANDIDATE_PROTOCOL_VERSION,
    objectType: CASE_CANDIDATE_OBJECT_TYPE,
    candidateId: "case-candidate_01",
    sourceSystem: CASE_CANDIDATE_SOURCE_SYSTEM,
    sourceMatterId: "formal-matter_12345678",
    sourceMatterVersion: 1,
    sourceSnapshotSha256: "a".repeat(64),
    sourceRetrievalRef: "markreg:/v1/formal-matters/formal-matter_12345678",
    promotedBy: "operator:test",
    promotedAt: "2026-08-25T03:20:00.000Z",
    operatorCaseValueNote: "Strong source evidence",
    accessScope: {
      sourceWorkspaceId: "workspace:test",
      classification: "CONFIDENTIAL",
    },
    idempotencyKey: "case-intake-001",
    ...overrides,
  };
}

describe("SqliteCaseCandidateIntakeRepository", () => {
  it("durably accepts a Case Candidate and starts a pending collection ticket", () => {
    const database = new DatabaseSync(":memory:");
    const first = new SqliteCaseCandidateIntakeRepository(database);
    const accepted = first.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");

    expect(accepted.candidate.candidateId).toBe("case-candidate_01");
    expect(accepted.intake.collectionState).toBe("PENDING");
    expect(first.listPending()).toHaveLength(1);

    const restarted = new SqliteCaseCandidateIntakeRepository(database);
    expect(restarted.getCandidate("case-candidate_01")).toEqual(accepted.candidate);
    expect(restarted.getIntake("case-candidate_01")).toEqual(accepted.intake);
  });

  it("replays the same idempotency key without creating another candidate", () => {
    const repository = new SqliteCaseCandidateIntakeRepository(new DatabaseSync(":memory:"));
    const first = repository.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");
    const replay = repository.acceptCandidate(candidate(), "2026-08-25T03:22:00.000Z");

    expect(replay).toEqual(first);
    expect(repository.listPending()).toHaveLength(1);
  });

  it("deduplicates the same source snapshot across a new promotion identity", () => {
    const repository = new SqliteCaseCandidateIntakeRepository(new DatabaseSync(":memory:"));
    const first = repository.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");
    const duplicate = repository.acceptCandidate(
      candidate({
        candidateId: "case-candidate_02",
        idempotencyKey: "case-intake-002",
        promotedAt: "2026-08-25T03:24:00.000Z",
        operatorCaseValueNote: "Second promotion attempt",
      }),
      "2026-08-25T03:24:00.000Z",
    );

    expect(duplicate.candidate).toEqual(first.candidate);
    expect(repository.getCandidate("case-candidate_02")).toBeNull();
    expect(repository.listPending()).toHaveLength(1);
  });

  it("fails closed when the same source snapshot changes retrieval or access semantics", () => {
    const repository = new SqliteCaseCandidateIntakeRepository(new DatabaseSync(":memory:"));
    repository.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");

    const changedRef = candidate({
      candidateId: "case-candidate_02",
      idempotencyKey: "case-intake-002",
      sourceRetrievalRef: "markreg:/different-authorized-ref",
    });
    expect(() => repository.acceptCandidate(changedRef, "2026-08-25T03:24:00.000Z")).toThrowError(
      RegistryConflictError,
    );
    try {
      repository.acceptCandidate(changedRef, "2026-08-25T03:24:00.000Z");
    } catch (error) {
      expect((error as RegistryConflictError).code).toBe(
        "CASE_CANDIDATE_SOURCE_SEMANTICS_CONFLICT",
      );
    }

    const changedAccess = candidate({
      candidateId: "case-candidate_03",
      idempotencyKey: "case-intake-003",
      accessScope: {
        sourceWorkspaceId: "workspace:test",
        classification: "RESTRICTED",
      },
    });
    expect(() =>
      repository.acceptCandidate(changedAccess, "2026-08-25T03:25:00.000Z"),
    ).toThrowError(RegistryConflictError);
    expect(repository.listPending()).toHaveLength(1);
  });

  it("fails closed when an idempotency key is reused with changed input", () => {
    const repository = new SqliteCaseCandidateIntakeRepository(new DatabaseSync(":memory:"));
    repository.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");

    expect(() =>
      repository.acceptCandidate(
        candidate({ sourceSnapshotSha256: "b".repeat(64) }),
        "2026-08-25T03:22:00.000Z",
      ),
    ).toThrowError(RegistryConflictError);

    try {
      repository.acceptCandidate(
        candidate({ sourceSnapshotSha256: "b".repeat(64) }),
        "2026-08-25T03:22:00.000Z",
      );
    } catch (error) {
      expect((error as RegistryConflictError).code).toBe("CASE_CANDIDATE_IDEMPOTENCY_CONFLICT");
    }
  });

  it("keeps the candidate durable while its source is temporarily unavailable and can requeue", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteCaseCandidateIntakeRepository(database);
    repository.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");

    const waiting = repository.recordSourceUnavailable("case-candidate_01", {
      code: "MARKREG_UNAVAILABLE",
      message: "MarkReg could not be reached",
      observedAt: "2026-08-25T03:25:00.000Z",
    });
    expect(waiting.collectionState).toBe("WAITING_SOURCE");
    expect(waiting.sourceUnavailable?.retryable).toBe(true);
    expect(repository.getCandidate("case-candidate_01")).not.toBeNull();
    expect(repository.listPending()).toHaveLength(0);

    const restarted = new SqliteCaseCandidateIntakeRepository(database);
    expect(restarted.getIntake("case-candidate_01")).toEqual(waiting);

    const requeued = restarted.requeueCandidate("case-candidate_01", "2026-08-25T03:30:00.000Z");
    expect(requeued.collectionState).toBe("PENDING");
    expect(requeued.sourceUnavailable).toBeUndefined();
    expect(restarted.listPending()).toHaveLength(1);
  });

  it("records collection completion durably and makes completion immutable", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteCaseCandidateIntakeRepository(database);
    repository.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");

    const completed = repository.recordCollectionComplete(
      "case-candidate_01",
      "case-evidence_abc123",
      "2026-08-25T03:35:00.000Z",
    );
    expect(completed).toMatchObject({
      collectionState: "COLLECTED",
      collectionRef: "case-evidence_abc123",
      collectedAt: "2026-08-25T03:35:00.000Z",
    });
    expect(repository.listPending()).toHaveLength(0);

    const restarted = new SqliteCaseCandidateIntakeRepository(database);
    expect(restarted.getIntake("case-candidate_01")).toEqual(completed);
    expect(
      restarted.recordCollectionComplete(
        "case-candidate_01",
        "case-evidence_abc123",
        "2026-08-25T03:40:00.000Z",
      ),
    ).toEqual(completed);
    expect(() =>
      restarted.recordCollectionComplete("case-candidate_01", "case-evidence_other"),
    ).toThrowError(RegistryConflictError);
    expect(() =>
      restarted.recordSourceUnavailable("case-candidate_01", {
        code: "MARKREG_UNAVAILABLE",
        message: "Late transport failure",
      }),
    ).toThrowError(RegistryConflictError);
    expect(() =>
      restarted.requeueCandidate("case-candidate_01", "2026-08-25T03:45:00.000Z"),
    ).toThrowError(RegistryConflictError);
    expect(restarted.getIntake("case-candidate_01")).toEqual(completed);
    expect(restarted.listPending()).toHaveLength(0);
  });

  it("migrates pre-K-CASE-004 collection tickets without rebuilding prior state", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE case_candidates (
        candidate_id TEXT PRIMARY KEY,
        source_identity_sha256 TEXT NOT NULL UNIQUE CHECK (length(source_identity_sha256) = 64),
        document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
        document_json TEXT NOT NULL,
        accepted_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE case_candidate_intake_commands (
        idempotency_key TEXT PRIMARY KEY,
        request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64),
        candidate_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(candidate_id) REFERENCES case_candidates(candidate_id)
      ) STRICT;
      CREATE TABLE case_candidate_collection_tickets (
        candidate_id TEXT PRIMARY KEY,
        source_identity_sha256 TEXT NOT NULL CHECK (length(source_identity_sha256) = 64),
        collection_state TEXT NOT NULL CHECK (collection_state IN ('PENDING', 'WAITING_SOURCE')),
        source_error_code TEXT,
        source_error_message TEXT,
        source_error_observed_at TEXT,
        accepted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(candidate_id) REFERENCES case_candidates(candidate_id)
      ) STRICT;
    `);

    const repository = new SqliteCaseCandidateIntakeRepository(database);
    repository.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");
    expect(
      repository.recordCollectionComplete("case-candidate_01", "case-evidence_migrated").collectionState,
    ).toBe("COLLECTED");
    const columns = database.prepare("PRAGMA table_info(case_candidate_collection_tickets)").all() as {
      name: string;
    }[];
    expect(columns.map((row) => row.name)).toEqual(
      expect.arrayContaining(["collection_ref", "collected_at"]),
    );
  });

  it("rejects invalid candidates and invalid collection updates", () => {
    const repository = new SqliteCaseCandidateIntakeRepository(new DatabaseSync(":memory:"));
    expect(() =>
      repository.acceptCandidate({
        ...candidate(),
        sourceMatterId: "guessed-matter",
      } as CaseCandidateV1),
    ).toThrowError(RegistryValidationError);
    expect(() =>
      repository.recordSourceUnavailable("case-candidate_missing", {
        code: "MARKREG_UNAVAILABLE",
        message: "Unavailable",
      }),
    ).toThrowError(RegistryValidationError);
    expect(() => repository.listPending(0)).toThrowError(RegistryValidationError);
  });
});
