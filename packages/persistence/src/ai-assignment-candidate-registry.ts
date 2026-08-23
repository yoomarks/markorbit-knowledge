import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isAiAssignmentCandidateV1,
  type AiAssignmentCandidateV1,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";
import { ensureAiAssignmentGraphRegistry } from "./ai-assignment-graph-registry";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export function ensureAiAssignmentCandidateRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec("PRAGMA foreign_keys = ON;");
  ensureAiAssignmentGraphRegistry(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_assignment_candidates (
      candidate_id TEXT PRIMARY KEY CHECK (candidate_id LIKE 'kac_%'),
      graph_id TEXT NOT NULL,
      graph_revision INTEGER NOT NULL,
      parent_assignment_id TEXT NOT NULL,
      instruction_set_id TEXT NOT NULL,
      instruction_set_revision INTEGER NOT NULL,
      jurisdiction TEXT NOT NULL,
      domain TEXT NOT NULL,
      topic TEXT NOT NULL,
      discovery_method TEXT NOT NULL CHECK (
        discovery_method IN ('EVIDENCE_GAP', 'STRUCTURE_EXPANSION', 'AI_FOLLOW_UP')
      ),
      identity_sha256 TEXT NOT NULL UNIQUE CHECK (length(identity_sha256) = 64),
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(graph_id, graph_revision)
        REFERENCES ai_assignment_graphs(graph_id, revision),
      FOREIGN KEY(graph_id, graph_revision, parent_assignment_id)
        REFERENCES ai_assignment_graph_nodes(graph_id, graph_revision, assignment_id),
      FOREIGN KEY(instruction_set_id, instruction_set_revision)
        REFERENCES ai_instruction_sets(instruction_set_id, revision)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_assignment_candidates_graph_idx
      ON ai_assignment_candidates(graph_id, graph_revision, created_at DESC, candidate_id ASC);
    CREATE INDEX IF NOT EXISTS ai_assignment_candidates_scope_idx
      ON ai_assignment_candidates(jurisdiction, domain, topic, created_at DESC);
  `);
  INITIALIZED_DATABASES.add(database);
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function documentHash(value: unknown): string {
  return hashText(JSON.stringify(value));
}

function candidateIdentity(value: AiAssignmentCandidateV1): string {
  return hashText(
    JSON.stringify({
      graphId: value.graphId,
      graphRevision: value.graphRevision,
      parentAssignmentId: value.parentAssignmentId,
      suggestedRelation: value.suggestedRelation,
      jurisdiction: value.jurisdiction,
      domain: value.domain,
      topic: value.topic,
      title: value.title,
      instructionSetId: value.instructionSetId,
      instructionSetRevision: value.instructionSetRevision,
      language: value.language,
      proposedPrompt: value.proposedPrompt,
      discoveryMethod: value.discoveryMethod,
      evidence: value.evidence
        .map((entry) => ({
          evidenceRef: entry.evidenceRef,
          evidenceClass: entry.evidenceClass,
          sha256: entry.sha256,
        }))
        .sort((left, right) =>
          `${left.evidenceRef}\u0000${left.sha256}`.localeCompare(
            `${right.evidenceRef}\u0000${right.sha256}`,
          ),
        ),
    }),
  );
}

function parseCandidate(value: string): AiAssignmentCandidateV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isAiAssignmentCandidateV1(parsed)) {
    throw new RegistryValidationError("Stored AI Assignment Candidate is invalid");
  }
  return parsed;
}

export class SqliteAiAssignmentCandidateRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureAiAssignmentCandidateRegistry(database);
  }

  saveCandidate(value: AiAssignmentCandidateV1): AiAssignmentCandidateV1 {
    if (!isAiAssignmentCandidateV1(value)) {
      throw new RegistryValidationError("AI Assignment Candidate is invalid");
    }

    const graph = this.database
      .prepare(
        `SELECT jurisdiction, domain
           FROM ai_assignment_graphs
          WHERE graph_id = ? AND revision = ?`,
      )
      .get(value.graphId, value.graphRevision) as
      | { jurisdiction: string; domain: string }
      | undefined;
    if (!graph) {
      throw new RegistryValidationError(
        `Candidate references missing Assignment Graph ${value.graphId}@${value.graphRevision}`,
      );
    }
    if (graph.jurisdiction !== value.jurisdiction || graph.domain !== value.domain) {
      throw new RegistryConflictError(
        "AI_ASSIGNMENT_CANDIDATE_SCOPE_MISMATCH",
        `Candidate scope ${value.jurisdiction}/${value.domain} does not match Assignment Graph scope ${graph.jurisdiction}/${graph.domain}`,
      );
    }

    const parent = this.database
      .prepare(
        `SELECT 1 AS present
           FROM ai_assignment_graph_nodes
          WHERE graph_id = ? AND graph_revision = ? AND assignment_id = ?`,
      )
      .get(value.graphId, value.graphRevision, value.parentAssignmentId) as
      | { present: number }
      | undefined;
    if (!parent) {
      throw new RegistryValidationError(
        `Candidate parent ${value.parentAssignmentId} is not a node in ${value.graphId}@${value.graphRevision}`,
      );
    }

    const instructionSet = this.database
      .prepare(
        `SELECT 1 AS present
           FROM ai_instruction_sets
          WHERE instruction_set_id = ? AND revision = ?`,
      )
      .get(value.instructionSetId, value.instructionSetRevision) as
      | { present: number }
      | undefined;
    if (!instructionSet) {
      throw new RegistryValidationError(
        `Candidate references missing instruction set ${value.instructionSetId}@${value.instructionSetRevision}`,
      );
    }

    const json = JSON.stringify(value);
    const sha256 = documentHash(value);
    const identitySha256 = candidateIdentity(value);
    const existingById = this.database
      .prepare(
        `SELECT document_sha256, document_json
           FROM ai_assignment_candidates
          WHERE candidate_id = ?`,
      )
      .get(value.candidateId) as
      | { document_sha256: string; document_json: string }
      | undefined;
    if (existingById) {
      if (existingById.document_sha256 !== sha256 || existingById.document_json !== json) {
        throw new RegistryConflictError(
          "AI_ASSIGNMENT_CANDIDATE_IMMUTABLE_CONFLICT",
          `Assignment Candidate ${value.candidateId} already exists with different content`,
        );
      }
      return parseCandidate(existingById.document_json);
    }

    const duplicate = this.database
      .prepare(
        `SELECT candidate_id
           FROM ai_assignment_candidates
          WHERE identity_sha256 = ?`,
      )
      .get(identitySha256) as { candidate_id: string } | undefined;
    if (duplicate) {
      throw new RegistryConflictError(
        "AI_ASSIGNMENT_CANDIDATE_DUPLICATE",
        `Equivalent Assignment Candidate already exists as ${duplicate.candidate_id}`,
        { existingCandidateId: duplicate.candidate_id },
      );
    }

    this.database
      .prepare(
        `INSERT INTO ai_assignment_candidates(
          candidate_id, graph_id, graph_revision, parent_assignment_id,
          instruction_set_id, instruction_set_revision, jurisdiction, domain,
          topic, discovery_method, identity_sha256, document_sha256,
          document_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.candidateId,
        value.graphId,
        value.graphRevision,
        value.parentAssignmentId,
        value.instructionSetId,
        value.instructionSetRevision,
        value.jurisdiction,
        value.domain,
        value.topic,
        value.discoveryMethod,
        identitySha256,
        sha256,
        json,
        value.createdAt,
      );
    return value;
  }

  getCandidate(candidateId: string): AiAssignmentCandidateV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
           FROM ai_assignment_candidates
          WHERE candidate_id = ?`,
      )
      .get(candidateId) as { document_json: string } | undefined;
    return row ? parseCandidate(row.document_json) : null;
  }

  listByGraph(graphId: string, graphRevision: number): AiAssignmentCandidateV1[] {
    const rows = this.database
      .prepare(
        `SELECT document_json
           FROM ai_assignment_candidates
          WHERE graph_id = ? AND graph_revision = ?
          ORDER BY created_at ASC, candidate_id ASC`,
      )
      .all(graphId, graphRevision) as { document_json: string }[];
    return rows.map((row) => parseCandidate(row.document_json));
  }
}
