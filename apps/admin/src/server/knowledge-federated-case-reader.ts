import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isCaseCandidateV1, type CaseCandidateV1 } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { ensureCaseCandidateIntakeRegistry } from "@markorbit/persistence/case-candidate-intake";

export type KnowledgeFederatedCaseSearchV1 = {
  workspaceId: string;
  candidateId?: string;
  sourceMatterId?: string;
  limit?: number;
};

type StoredCandidateRow = {
  candidate_id: string;
  document_sha256: string;
  document_json: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export class KnowledgeFederatedCaseReader {
  constructor(private readonly database: DatabaseSync) {
    ensureCaseCandidateIntakeRegistry(database);
  }

  search(input: KnowledgeFederatedCaseSearchV1): CaseCandidateV1[] {
    const workspaceId = input.workspaceId.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    const candidateId = input.candidateId?.trim();
    const sourceMatterId = input.sourceMatterId?.trim();
    const limit = input.limit ?? 25;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RegistryValidationError("limit must be an integer between 1 and 100");
    }

    const clauses = ["json_extract(document_json, '$.accessScope.sourceWorkspaceId') = ?"];
    const params: Array<string | number> = [workspaceId];
    if (candidateId) {
      clauses.push("candidate_id = ?");
      params.push(candidateId);
    }
    if (sourceMatterId) {
      clauses.push("json_extract(document_json, '$.sourceMatterId') = ?");
      params.push(sourceMatterId);
    }
    params.push(limit);

    const rows = this.database
      .prepare(
        `SELECT candidate_id, document_sha256, document_json
           FROM case_candidates
          WHERE ${clauses.join(" AND ")}
          ORDER BY accepted_at DESC, candidate_id ASC
          LIMIT ?`,
      )
      .all(...params) as StoredCandidateRow[];

    return rows.map((row) => {
      if (sha256(row.document_json) !== row.document_sha256) {
        throw new RegistryConflictError(
          "CASE_CANDIDATE_STORAGE_HASH_MISMATCH",
          `Stored Case Candidate ${row.candidate_id} failed integrity verification`,
        );
      }
      const parsed = JSON.parse(row.document_json) as unknown;
      if (!isCaseCandidateV1(parsed) || parsed.candidateId !== row.candidate_id) {
        throw new RegistryConflictError(
          "CASE_CANDIDATE_STORAGE_INVALID",
          `Stored Case Candidate ${row.candidate_id} is invalid`,
        );
      }
      if (parsed.accessScope.sourceWorkspaceId !== workspaceId) {
        throw new RegistryConflictError(
          "CASE_CANDIDATE_WORKSPACE_SCOPE_MISMATCH",
          `Stored Case Candidate ${row.candidate_id} escaped its workspace scope`,
        );
      }
      return parsed;
    });
  }
}
