import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isAiInstructionSetV1,
  isAiKnowledgeAssignmentV1,
  type AiInstructionSetV1,
  type AiKnowledgeAssignmentV1,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export function ensureAiKnowledgeAssignmentRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_instruction_sets (
      instruction_set_id TEXT NOT NULL CHECK (instruction_set_id LIKE 'kis_%'),
      revision INTEGER NOT NULL CHECK (revision > 0),
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(instruction_set_id, revision)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_instruction_sets_latest_idx
      ON ai_instruction_sets(instruction_set_id, revision DESC);

    CREATE TABLE IF NOT EXISTS ai_knowledge_assignments (
      assignment_id TEXT PRIMARY KEY CHECK (assignment_id LIKE 'kas_%'),
      instruction_set_id TEXT NOT NULL,
      instruction_set_revision INTEGER NOT NULL,
      jurisdiction TEXT NOT NULL,
      domain TEXT NOT NULL,
      topic TEXT NOT NULL,
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(instruction_set_id, instruction_set_revision)
        REFERENCES ai_instruction_sets(instruction_set_id, revision)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_knowledge_assignments_topic_idx
      ON ai_knowledge_assignments(jurisdiction, domain, topic, created_at DESC);
  `);
  INITIALIZED_DATABASES.add(database);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function parseInstructionSet(value: string): AiInstructionSetV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isAiInstructionSetV1(parsed)) {
    throw new RegistryValidationError("Stored AI instruction set is invalid");
  }
  return parsed;
}

function parseAssignment(value: string): AiKnowledgeAssignmentV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isAiKnowledgeAssignmentV1(parsed)) {
    throw new RegistryValidationError("Stored AI knowledge assignment is invalid");
  }
  return parsed;
}

export class SqliteAiKnowledgeAssignmentRepository {
  constructor(private readonly database: DatabaseSync) {
    this.database.exec("PRAGMA foreign_keys = ON;");
    ensureAiKnowledgeAssignmentRegistry(database);
  }

  saveInstructionSet(value: AiInstructionSetV1): AiInstructionSetV1 {
    if (!isAiInstructionSetV1(value)) {
      throw new RegistryValidationError("AI instruction set is invalid");
    }
    const json = JSON.stringify(value);
    const sha256 = digest(value);
    const existing = this.database
      .prepare(
        `SELECT document_sha256, document_json
         FROM ai_instruction_sets
         WHERE instruction_set_id = ? AND revision = ?`,
      )
      .get(value.instructionSetId, value.revision) as
      { document_sha256: string; document_json: string } | undefined;
    if (existing) {
      if (existing.document_sha256 !== sha256 || existing.document_json !== json) {
        throw new RegistryConflictError(
          "AI_INSTRUCTION_SET_IMMUTABLE_CONFLICT",
          `Instruction set ${value.instructionSetId} revision ${value.revision} already exists with different content`,
        );
      }
      return parseInstructionSet(existing.document_json);
    }
    const latest = this.database
      .prepare(
        `SELECT MAX(revision) AS revision
         FROM ai_instruction_sets
         WHERE instruction_set_id = ?`,
      )
      .get(value.instructionSetId) as { revision: number | null };
    if (latest.revision !== null && value.revision !== latest.revision + 1) {
      throw new RegistryConflictError(
        "AI_INSTRUCTION_SET_REVISION_GAP",
        `Instruction set ${value.instructionSetId} must advance from revision ${latest.revision} to ${latest.revision + 1}`,
      );
    }
    if (latest.revision === null && value.revision !== 1) {
      throw new RegistryConflictError(
        "AI_INSTRUCTION_SET_FIRST_REVISION_INVALID",
        `Instruction set ${value.instructionSetId} must begin at revision 1`,
      );
    }
    this.database
      .prepare(
        `INSERT INTO ai_instruction_sets(
          instruction_set_id, revision, document_sha256, document_json, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(value.instructionSetId, value.revision, sha256, json, value.createdAt);
    return value;
  }

  saveAssignment(value: AiKnowledgeAssignmentV1): AiKnowledgeAssignmentV1 {
    if (!isAiKnowledgeAssignmentV1(value)) {
      throw new RegistryValidationError("AI knowledge assignment is invalid");
    }
    const instructionSet = this.getInstructionSet(
      value.instructionSetId,
      value.instructionSetRevision,
    );
    if (!instructionSet) {
      throw new RegistryValidationError(
        `Assignment references missing instruction set ${value.instructionSetId}@${value.instructionSetRevision}`,
      );
    }
    const json = JSON.stringify(value);
    const sha256 = digest(value);
    const existing = this.database
      .prepare(
        `SELECT document_sha256, document_json
         FROM ai_knowledge_assignments
         WHERE assignment_id = ?`,
      )
      .get(value.assignmentId) as { document_sha256: string; document_json: string } | undefined;
    if (existing) {
      if (existing.document_sha256 !== sha256 || existing.document_json !== json) {
        throw new RegistryConflictError(
          "AI_ASSIGNMENT_IMMUTABLE_CONFLICT",
          `Assignment ${value.assignmentId} already exists with different content`,
        );
      }
      return parseAssignment(existing.document_json);
    }
    this.database
      .prepare(
        `INSERT INTO ai_knowledge_assignments(
          assignment_id, instruction_set_id, instruction_set_revision,
          jurisdiction, domain, topic, document_sha256, document_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.assignmentId,
        value.instructionSetId,
        value.instructionSetRevision,
        value.jurisdiction,
        value.domain,
        value.topic,
        sha256,
        json,
        value.createdAt,
      );
    return value;
  }

  getInstructionSet(instructionSetId: string, revision: number): AiInstructionSetV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
         FROM ai_instruction_sets
         WHERE instruction_set_id = ? AND revision = ?`,
      )
      .get(instructionSetId, revision) as { document_json: string } | undefined;
    return row ? parseInstructionSet(row.document_json) : null;
  }

  getLatestInstructionSet(instructionSetId: string): AiInstructionSetV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
         FROM ai_instruction_sets
         WHERE instruction_set_id = ?
         ORDER BY revision DESC
         LIMIT 1`,
      )
      .get(instructionSetId) as { document_json: string } | undefined;
    return row ? parseInstructionSet(row.document_json) : null;
  }

  getAssignment(assignmentId: string): AiKnowledgeAssignmentV1 | null {
    const row = this.database
      .prepare(`SELECT document_json FROM ai_knowledge_assignments WHERE assignment_id = ?`)
      .get(assignmentId) as { document_json: string } | undefined;
    return row ? parseAssignment(row.document_json) : null;
  }

  listAssignmentsByTopic(input: {
    jurisdiction: string;
    domain: string;
    topic: string;
  }): AiKnowledgeAssignmentV1[] {
    const rows = this.database
      .prepare(
        `SELECT document_json
         FROM ai_knowledge_assignments
         WHERE jurisdiction = ? AND domain = ? AND topic = ?
         ORDER BY created_at ASC, assignment_id ASC`,
      )
      .all(input.jurisdiction, input.domain, input.topic) as { document_json: string }[];
    return rows.map((row) => parseAssignment(row.document_json));
  }
}
