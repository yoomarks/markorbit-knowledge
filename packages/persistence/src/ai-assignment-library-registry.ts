import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isAiAssignmentLibraryV1,
  isAiKnowledgeAssignmentV1,
  type AiAssignmentLibraryV1,
  type AiKnowledgeAssignmentV1,
} from "@markorbit/contracts";
import { ensureAiKnowledgeAssignmentRegistry } from "./ai-knowledge-assignment-registry";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export function ensureAiAssignmentLibraryRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  ensureAiKnowledgeAssignmentRegistry(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_assignment_libraries (
      library_id TEXT NOT NULL CHECK (library_id LIKE 'kal_%'),
      revision INTEGER NOT NULL CHECK (revision > 0),
      jurisdiction TEXT NOT NULL,
      domain TEXT NOT NULL,
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(library_id, revision)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_assignment_libraries_scope_idx
      ON ai_assignment_libraries(jurisdiction, domain, revision DESC);

    CREATE TABLE IF NOT EXISTS ai_assignment_library_entries (
      library_id TEXT NOT NULL,
      library_revision INTEGER NOT NULL,
      sequence INTEGER NOT NULL CHECK (sequence > 0),
      workflow TEXT NOT NULL,
      assignment_id TEXT NOT NULL,
      PRIMARY KEY(library_id, library_revision, assignment_id),
      UNIQUE(library_id, library_revision, sequence),
      FOREIGN KEY(library_id, library_revision)
        REFERENCES ai_assignment_libraries(library_id, revision),
      FOREIGN KEY(assignment_id)
        REFERENCES ai_knowledge_assignments(assignment_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_assignment_library_entries_workflow_idx
      ON ai_assignment_library_entries(library_id, library_revision, workflow, sequence);
  `);
  INITIALIZED_DATABASES.add(database);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function parseLibrary(value: string): AiAssignmentLibraryV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isAiAssignmentLibraryV1(parsed)) {
    throw new RegistryValidationError("Stored AI assignment library is invalid");
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

export class SqliteAiAssignmentLibraryRepository {
  constructor(private readonly database: DatabaseSync) {
    this.database.exec("PRAGMA foreign_keys = ON;");
    ensureAiAssignmentLibraryRegistry(database);
  }

  saveLibrary(value: AiAssignmentLibraryV1): AiAssignmentLibraryV1 {
    if (!isAiAssignmentLibraryV1(value)) {
      throw new RegistryValidationError("AI assignment library is invalid");
    }

    for (const entry of value.entries) {
      const assignment = this.getAssignment(entry.assignmentId);
      if (!assignment) {
        throw new RegistryValidationError(
          `Assignment library references missing assignment ${entry.assignmentId}`,
        );
      }
      if (assignment.jurisdiction !== value.jurisdiction || assignment.domain !== value.domain) {
        throw new RegistryConflictError(
          "AI_ASSIGNMENT_LIBRARY_SCOPE_MISMATCH",
          `Assignment ${entry.assignmentId} does not match library scope ${value.jurisdiction}/${value.domain}`,
        );
      }
    }

    const json = JSON.stringify(value);
    const sha256 = digest(value);
    const existing = this.database
      .prepare(
        `SELECT document_sha256, document_json
         FROM ai_assignment_libraries
         WHERE library_id = ? AND revision = ?`,
      )
      .get(value.libraryId, value.revision) as
      | { document_sha256: string; document_json: string }
      | undefined;
    if (existing) {
      if (existing.document_sha256 !== sha256 || existing.document_json !== json) {
        throw new RegistryConflictError(
          "AI_ASSIGNMENT_LIBRARY_IMMUTABLE_CONFLICT",
          `Assignment library ${value.libraryId} revision ${value.revision} already exists with different content`,
        );
      }
      return parseLibrary(existing.document_json);
    }

    const latest = this.database
      .prepare(
        `SELECT MAX(revision) AS revision
         FROM ai_assignment_libraries
         WHERE library_id = ?`,
      )
      .get(value.libraryId) as { revision: number | null };
    if (latest.revision === null && value.revision !== 1) {
      throw new RegistryConflictError(
        "AI_ASSIGNMENT_LIBRARY_FIRST_REVISION_INVALID",
        `Assignment library ${value.libraryId} must begin at revision 1`,
      );
    }
    if (latest.revision !== null && value.revision !== latest.revision + 1) {
      throw new RegistryConflictError(
        "AI_ASSIGNMENT_LIBRARY_REVISION_GAP",
        `Assignment library ${value.libraryId} must advance from revision ${latest.revision} to ${latest.revision + 1}`,
      );
    }

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO ai_assignment_libraries(
            library_id, revision, jurisdiction, domain, document_sha256, document_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          value.libraryId,
          value.revision,
          value.jurisdiction,
          value.domain,
          sha256,
          json,
          value.createdAt,
        );
      const insertEntry = this.database.prepare(
        `INSERT INTO ai_assignment_library_entries(
          library_id, library_revision, sequence, workflow, assignment_id
        ) VALUES (?, ?, ?, ?, ?)`,
      );
      for (const entry of value.entries) {
        insertEntry.run(
          value.libraryId,
          value.revision,
          entry.sequence,
          entry.workflow,
          entry.assignmentId,
        );
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return value;
  }

  getLibrary(libraryId: string, revision: number): AiAssignmentLibraryV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
         FROM ai_assignment_libraries
         WHERE library_id = ? AND revision = ?`,
      )
      .get(libraryId, revision) as { document_json: string } | undefined;
    return row ? parseLibrary(row.document_json) : null;
  }

  getLatestLibrary(libraryId: string): AiAssignmentLibraryV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
         FROM ai_assignment_libraries
         WHERE library_id = ?
         ORDER BY revision DESC
         LIMIT 1`,
      )
      .get(libraryId) as { document_json: string } | undefined;
    return row ? parseLibrary(row.document_json) : null;
  }

  listLatestLibrariesByScope(input: {
    jurisdiction: string;
    domain: string;
  }): AiAssignmentLibraryV1[] {
    const rows = this.database
      .prepare(
        `SELECT library.document_json
         FROM ai_assignment_libraries library
         JOIN (
           SELECT library_id, MAX(revision) AS revision
           FROM ai_assignment_libraries
           WHERE jurisdiction = ? AND domain = ?
           GROUP BY library_id
         ) latest
           ON latest.library_id = library.library_id AND latest.revision = library.revision
         ORDER BY library.library_id ASC`,
      )
      .all(input.jurisdiction, input.domain) as { document_json: string }[];
    return rows.map((row) => parseLibrary(row.document_json));
  }

  listAssignmentsByWorkflow(input: {
    libraryId: string;
    revision: number;
    workflow: string;
  }): AiKnowledgeAssignmentV1[] {
    const rows = this.database
      .prepare(
        `SELECT assignment.document_json
         FROM ai_assignment_library_entries entry
         JOIN ai_knowledge_assignments assignment ON assignment.assignment_id = entry.assignment_id
         WHERE entry.library_id = ? AND entry.library_revision = ? AND entry.workflow = ?
         ORDER BY entry.sequence ASC, entry.assignment_id ASC`,
      )
      .all(input.libraryId, input.revision, input.workflow) as { document_json: string }[];
    return rows.map((row) => parseAssignment(row.document_json));
  }

  private getAssignment(assignmentId: string): AiKnowledgeAssignmentV1 | null {
    const row = this.database
      .prepare(`SELECT document_json FROM ai_knowledge_assignments WHERE assignment_id = ?`)
      .get(assignmentId) as { document_json: string } | undefined;
    return row ? parseAssignment(row.document_json) : null;
  }
}
