import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { isAiAssignmentGraphV1, type AiAssignmentGraphV1 } from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";
import { ensureAiKnowledgeAssignmentRegistry } from "./ai-knowledge-assignment-registry";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export function ensureAiAssignmentGraphRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec("PRAGMA foreign_keys = ON;");
  ensureAiKnowledgeAssignmentRegistry(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_assignment_graphs (
      graph_id TEXT NOT NULL CHECK (graph_id LIKE 'kag_%'),
      revision INTEGER NOT NULL CHECK (revision > 0),
      jurisdiction TEXT NOT NULL,
      domain TEXT NOT NULL,
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(graph_id, revision)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_assignment_graphs_scope_idx
      ON ai_assignment_graphs(jurisdiction, domain, graph_id, revision DESC);

    CREATE TABLE IF NOT EXISTS ai_assignment_graph_nodes (
      graph_id TEXT NOT NULL,
      graph_revision INTEGER NOT NULL,
      assignment_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ROOT', 'FOLLOW_UP')),
      PRIMARY KEY(graph_id, graph_revision, assignment_id),
      FOREIGN KEY(graph_id, graph_revision)
        REFERENCES ai_assignment_graphs(graph_id, revision) ON DELETE CASCADE,
      FOREIGN KEY(assignment_id)
        REFERENCES ai_knowledge_assignments(assignment_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_assignment_graph_nodes_assignment_idx
      ON ai_assignment_graph_nodes(assignment_id, graph_id, graph_revision DESC);

    CREATE TABLE IF NOT EXISTS ai_assignment_graph_edges (
      graph_id TEXT NOT NULL,
      graph_revision INTEGER NOT NULL,
      from_assignment_id TEXT NOT NULL,
      to_assignment_id TEXT NOT NULL,
      relation TEXT NOT NULL CHECK (relation IN ('DECOMPOSES', 'DEPENDS_ON', 'SUPPORTS')),
      PRIMARY KEY(graph_id, graph_revision, from_assignment_id, to_assignment_id, relation),
      FOREIGN KEY(graph_id, graph_revision, from_assignment_id)
        REFERENCES ai_assignment_graph_nodes(graph_id, graph_revision, assignment_id)
        ON DELETE CASCADE,
      FOREIGN KEY(graph_id, graph_revision, to_assignment_id)
        REFERENCES ai_assignment_graph_nodes(graph_id, graph_revision, assignment_id)
        ON DELETE CASCADE
    ) STRICT;
  `);
  INITIALIZED_DATABASES.add(database);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function parseGraph(value: string): AiAssignmentGraphV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isAiAssignmentGraphV1(parsed)) {
    throw new RegistryValidationError("Stored AI Assignment Graph is invalid");
  }
  return parsed;
}

export class SqliteAiAssignmentGraphRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureAiAssignmentGraphRegistry(database);
  }

  saveGraph(value: AiAssignmentGraphV1): AiAssignmentGraphV1 {
    if (!isAiAssignmentGraphV1(value)) {
      throw new RegistryValidationError("AI Assignment Graph is invalid");
    }

    const json = JSON.stringify(value);
    const sha256 = digest(value);
    const existing = this.database
      .prepare(
        `SELECT document_sha256, document_json
           FROM ai_assignment_graphs
          WHERE graph_id = ? AND revision = ?`,
      )
      .get(value.graphId, value.revision) as
      { document_sha256: string; document_json: string } | undefined;

    if (existing) {
      if (existing.document_sha256 !== sha256 || existing.document_json !== json) {
        throw new RegistryConflictError(
          "AI_ASSIGNMENT_GRAPH_IMMUTABLE_CONFLICT",
          `Assignment Graph ${value.graphId} revision ${value.revision} already exists with different content`,
        );
      }
      return parseGraph(existing.document_json);
    }

    const latest = this.database
      .prepare(
        `SELECT MAX(revision) AS revision
           FROM ai_assignment_graphs
          WHERE graph_id = ?`,
      )
      .get(value.graphId) as { revision: number | null };

    if (latest.revision === null && value.revision !== 1) {
      throw new RegistryConflictError(
        "AI_ASSIGNMENT_GRAPH_FIRST_REVISION_INVALID",
        `Assignment Graph ${value.graphId} must begin at revision 1`,
      );
    }
    if (latest.revision !== null && value.revision !== latest.revision + 1) {
      throw new RegistryConflictError(
        "AI_ASSIGNMENT_GRAPH_REVISION_GAP",
        `Assignment Graph ${value.graphId} must advance from revision ${latest.revision} to ${latest.revision + 1}`,
      );
    }

    for (const node of value.nodes) {
      const assignment = this.database
        .prepare(
          `SELECT jurisdiction, domain
             FROM ai_knowledge_assignments
            WHERE assignment_id = ?`,
        )
        .get(node.assignmentId) as { jurisdiction: string; domain: string } | undefined;
      if (!assignment) {
        throw new RegistryValidationError(
          `Assignment Graph references missing assignment ${node.assignmentId}`,
        );
      }
      if (assignment.jurisdiction !== value.jurisdiction || assignment.domain !== value.domain) {
        throw new RegistryConflictError(
          "AI_ASSIGNMENT_GRAPH_SCOPE_MISMATCH",
          `Assignment ${node.assignmentId} is outside graph scope ${value.jurisdiction}/${value.domain}`,
          {
            assignmentId: node.assignmentId,
            graphJurisdiction: value.jurisdiction,
            graphDomain: value.domain,
            assignmentJurisdiction: assignment.jurisdiction,
            assignmentDomain: assignment.domain,
          },
        );
      }
    }

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO ai_assignment_graphs(
            graph_id, revision, jurisdiction, domain,
            document_sha256, document_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          value.graphId,
          value.revision,
          value.jurisdiction,
          value.domain,
          sha256,
          json,
          value.createdAt,
        );

      const insertNode = this.database.prepare(
        `INSERT INTO ai_assignment_graph_nodes(
          graph_id, graph_revision, assignment_id, role
        ) VALUES (?, ?, ?, ?)`,
      );
      for (const node of value.nodes) {
        insertNode.run(value.graphId, value.revision, node.assignmentId, node.role);
      }

      const insertEdge = this.database.prepare(
        `INSERT INTO ai_assignment_graph_edges(
          graph_id, graph_revision, from_assignment_id, to_assignment_id, relation
        ) VALUES (?, ?, ?, ?, ?)`,
      );
      for (const edge of value.edges) {
        insertEdge.run(
          value.graphId,
          value.revision,
          edge.fromAssignmentId,
          edge.toAssignmentId,
          edge.relation,
        );
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }

    return value;
  }

  getGraph(graphId: string, revision: number): AiAssignmentGraphV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
           FROM ai_assignment_graphs
          WHERE graph_id = ? AND revision = ?`,
      )
      .get(graphId, revision) as { document_json: string } | undefined;
    return row ? parseGraph(row.document_json) : null;
  }

  getLatestGraph(graphId: string): AiAssignmentGraphV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
           FROM ai_assignment_graphs
          WHERE graph_id = ?
          ORDER BY revision DESC
          LIMIT 1`,
      )
      .get(graphId) as { document_json: string } | undefined;
    return row ? parseGraph(row.document_json) : null;
  }

  listLatestGraphsByScope(input: { jurisdiction: string; domain: string }): AiAssignmentGraphV1[] {
    const rows = this.database
      .prepare(
        `SELECT g.document_json
           FROM ai_assignment_graphs AS g
           JOIN (
             SELECT graph_id, MAX(revision) AS revision
               FROM ai_assignment_graphs
              WHERE jurisdiction = ? AND domain = ?
              GROUP BY graph_id
           ) AS latest
             ON latest.graph_id = g.graph_id AND latest.revision = g.revision
          ORDER BY g.graph_id ASC`,
      )
      .all(input.jurisdiction, input.domain) as { document_json: string }[];
    return rows.map((row) => parseGraph(row.document_json));
  }
}
