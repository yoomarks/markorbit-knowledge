import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  type CaseCandidateV1,
} from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "./case-candidate-intake";
import { RegistryConflictError } from "./index";

const id = "case-candidate_read_attestation";

function value(overrides: Partial<CaseCandidateV1> = {}): CaseCandidateV1 {
  return {
    protocolVersion: CASE_CANDIDATE_PROTOCOL_VERSION,
    objectType: CASE_CANDIDATE_OBJECT_TYPE,
    candidateId: id,
    sourceSystem: CASE_CANDIDATE_SOURCE_SYSTEM,
    sourceMatterId: "formal-matter_read_attestation",
    sourceMatterVersion: 1,
    sourceSnapshotSha256: "a".repeat(64),
    sourceRetrievalRef: "markreg:authorized-ref:read-attestation",
    promotedBy: "operator:test",
    promotedAt: "2026-08-31T02:00:00.000Z",
    accessScope: {
      sourceWorkspaceId: "workspace:read-attestation",
      classification: "CONFIDENTIAL",
    },
    idempotencyKey: "case-candidate-read-attestation-001",
    ...overrides,
  };
}

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function setup() {
  const database = new DatabaseSync(":memory:");
  const repository = new SqliteCaseCandidateIntakeRepository(database);
  repository.acceptCandidate(value(), "2026-08-31T02:01:00.000Z");
  return { database, repository };
}

function expectCode(run: () => unknown, code: string): void {
  expect(run).toThrowError(RegistryConflictError);
  try {
    run();
  } catch (error) {
    expect((error as RegistryConflictError).code).toBe(code);
  }
}

describe("Case Candidate read attestation", () => {
  it("rejects stored document hash drift", () => {
    const f = setup();
    const changed = JSON.stringify(value({ promotedBy: "operator:changed" }));
    f.database
      .prepare("UPDATE case_candidates SET document_json = ? WHERE candidate_id = ?")
      .run(changed, id);

    expectCode(() => f.repository.getCandidate(id), "CASE_CANDIDATE_STORAGE_HASH_MISMATCH");
  });

  it("rejects stored natural source identity drift", () => {
    const f = setup();
    const changed = JSON.stringify(
      value({
        accessScope: {
          sourceWorkspaceId: "workspace:changed",
          classification: "CONFIDENTIAL",
        },
      }),
    );
    f.database
      .prepare(
        "UPDATE case_candidates SET document_json = ?, document_sha256 = ? WHERE candidate_id = ?",
      )
      .run(changed, hash(changed), id);

    expectCode(
      () => f.repository.getCandidate(id),
      "CASE_CANDIDATE_STORAGE_SOURCE_IDENTITY_MISMATCH",
    );
  });

  it("uses the originating intake command to reject retrieval-semantic drift", () => {
    const f = setup();
    const changed = JSON.stringify(
      value({ sourceRetrievalRef: "markreg:authorized-ref:changed" }),
    );
    f.database
      .prepare(
        "UPDATE case_candidates SET document_json = ?, document_sha256 = ? WHERE candidate_id = ?",
      )
      .run(changed, hash(changed), id);

    expectCode(() => f.repository.getCandidate(id), "CASE_CANDIDATE_INTAKE_COMMAND_MISMATCH");
  });

  it("rejects collection-ticket source identity drift", () => {
    const f = setup();
    f.database
      .prepare(
        "UPDATE case_candidate_collection_tickets SET source_identity_sha256 = ? WHERE candidate_id = ?",
      )
      .run("f".repeat(64), id);

    expectCode(
      () => f.repository.getIntake(id),
      "CASE_CANDIDATE_COLLECTION_TICKET_IDENTITY_MISMATCH",
    );
  });

  it("rejects originating intake request hash drift", () => {
    const f = setup();
    f.database
      .prepare(
        "UPDATE case_candidate_intake_commands SET request_sha256 = ? WHERE idempotency_key = ?",
      )
      .run("f".repeat(64), value().idempotencyKey);

    expectCode(() => f.repository.getCandidate(id), "CASE_CANDIDATE_INTAKE_COMMAND_MISMATCH");
  });

  it("rejects a Candidate document ID that disagrees with the durable row ID", () => {
    const f = setup();
    const changed = JSON.stringify(
      value({ candidateId: "case-candidate_read_attestation_changed" }),
    );
    f.database
      .prepare(
        "UPDATE case_candidates SET document_json = ?, document_sha256 = ? WHERE candidate_id = ?",
      )
      .run(changed, hash(changed), id);

    expectCode(() => f.repository.getCandidate(id), "CASE_CANDIDATE_STORAGE_ID_MISMATCH");
  });
});
