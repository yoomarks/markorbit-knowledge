import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CaseCandidateV1 } from "@markorbit/contracts";
import { RegistryConflictError } from "@markorbit/persistence";
import { SqliteCaseCandidateIntakeRepository } from "@markorbit/persistence/case-candidate-intake";
import { KnowledgeFederatedCaseReader } from "./knowledge-federated-case-reader";

function candidate(
  candidateId: string,
  workspaceId: string,
  sourceMatterId: string,
  snapshot = "a",
): CaseCandidateV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CASE_CANDIDATE",
    candidateId,
    sourceSystem: "MARKREG",
    sourceMatterId,
    sourceMatterVersion: 1,
    sourceSnapshotSha256: snapshot.repeat(64),
    sourceRetrievalRef: `markreg:/v1/formal-matters/${sourceMatterId}`,
    promotedBy: "operator:test",
    promotedAt: "2026-08-31T00:00:00.000Z",
    accessScope: {
      sourceWorkspaceId: workspaceId,
      classification: "CONFIDENTIAL",
    },
    idempotencyKey: `intake-${candidateId}`,
  };
}

describe("KnowledgeFederatedCaseReader", () => {
  it("returns only Case candidates belonging to the authorized workspace", () => {
    const database = new DatabaseSync(":memory:");
    const intake = new SqliteCaseCandidateIntakeRepository(database);
    intake.acceptCandidate(
      candidate("case-candidate_workspace-a", "workspace:a", "formal-matter_a", "a"),
      "2026-08-31T00:01:00.000Z",
    );
    intake.acceptCandidate(
      candidate("case-candidate_workspace-b", "workspace:b", "formal-matter_b", "b"),
      "2026-08-31T00:02:00.000Z",
    );

    const reader = new KnowledgeFederatedCaseReader(database);
    expect(reader.search({ workspaceId: "workspace:a" }).map((item) => item.candidateId)).toEqual([
      "case-candidate_workspace-a",
    ]);
    expect(reader.search({ workspaceId: "workspace:b" }).map((item) => item.candidateId)).toEqual([
      "case-candidate_workspace-b",
    ]);
  });

  it("supports exact Case identity filters inside the workspace", () => {
    const database = new DatabaseSync(":memory:");
    const intake = new SqliteCaseCandidateIntakeRepository(database);
    intake.acceptCandidate(
      candidate("case-candidate_001", "workspace:test", "formal-matter_001", "a"),
      "2026-08-31T00:01:00.000Z",
    );
    intake.acceptCandidate(
      candidate("case-candidate_002", "workspace:test", "formal-matter_002", "b"),
      "2026-08-31T00:02:00.000Z",
    );

    const reader = new KnowledgeFederatedCaseReader(database);
    expect(
      reader.search({ workspaceId: "workspace:test", sourceMatterId: "formal-matter_001" }),
    ).toMatchObject([{ candidateId: "case-candidate_001" }]);
    expect(
      reader.search({ workspaceId: "workspace:test", candidateId: "case-candidate_002" }),
    ).toMatchObject([{ sourceMatterId: "formal-matter_002" }]);
  });

  it("fails closed if durable Case candidate content no longer matches its stored hash", () => {
    const database = new DatabaseSync(":memory:");
    const intake = new SqliteCaseCandidateIntakeRepository(database);
    intake.acceptCandidate(
      candidate("case-candidate_001", "workspace:test", "formal-matter_001", "a"),
      "2026-08-31T00:01:00.000Z",
    );
    database
      .prepare(
        "UPDATE case_candidates SET document_json = json_set(document_json, '$.promotedBy', ?) WHERE candidate_id = ?",
      )
      .run("operator:tampered", "case-candidate_001");

    const reader = new KnowledgeFederatedCaseReader(database);
    expect(() => reader.search({ workspaceId: "workspace:test" })).toThrowError(
      RegistryConflictError,
    );
  });
});
