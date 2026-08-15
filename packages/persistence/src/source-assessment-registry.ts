import type { DatabaseSync } from "node:sqlite";
import {
  isSourceAssessmentResponseV1,
  type SourceAssessmentRequestV1,
  type SourceAssessmentResponseV1,
} from "@markorbit/contracts";

export type SourceAssessmentRecord = {
  id: string;
  workspaceId: string;
  sourceId: string;
  assessedAt: string;
  request: SourceAssessmentRequestV1;
  response: SourceAssessmentResponseV1;
};

export interface SourceAssessmentRepository {
  save(record: SourceAssessmentRecord): SourceAssessmentRecord;
  get(id: string): SourceAssessmentRecord | null;
  latestForSource(sourceId: string): SourceAssessmentRecord | null;
  listForSource(sourceId: string, limit?: number): SourceAssessmentRecord[];
  listLatestForSources(sourceIds: string[]): SourceAssessmentRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSourceAssessmentRequestV1(value: unknown): value is SourceAssessmentRequestV1 {
  return (
    isRecord(value) &&
    value.version === "1.0" &&
    value.capability === "source-assessment" &&
    typeof value.locale === "string" &&
    typeof value.objective === "string" &&
    isRecord(value.source) &&
    typeof value.source.sourceId === "string"
  );
}

function isSourceAssessmentRecord(value: unknown): value is SourceAssessmentRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^sar_[a-f0-9]{24}$/.test(value.id) &&
    typeof value.workspaceId === "string" &&
    typeof value.sourceId === "string" &&
    typeof value.assessedAt === "string" &&
    Number.isFinite(Date.parse(value.assessedAt)) &&
    isSourceAssessmentRequestV1(value.request) &&
    value.request.source.sourceId === value.sourceId &&
    isSourceAssessmentResponseV1(value.response)
  );
}

export class SqliteSourceAssessmentRepository implements SourceAssessmentRepository {
  constructor(private readonly database: DatabaseSync) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS source_assessment_capability_runs (
        assessment_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        assessed_at TEXT NOT NULL,
        priority TEXT NOT NULL,
        score REAL NOT NULL,
        document_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_assessment_latest
        ON source_assessment_capability_runs(source_id, assessed_at DESC, assessment_id DESC);
      CREATE INDEX IF NOT EXISTS idx_source_assessment_priority
        ON source_assessment_capability_runs(workspace_id, priority, score DESC);
    `);
  }

  save(record: SourceAssessmentRecord): SourceAssessmentRecord {
    if (!isSourceAssessmentRecord(record)) {
      throw new Error("Invalid SourceAssessmentRecord");
    }
    const existing = this.get(record.id);
    if (existing) return existing;
    this.database
      .prepare(
        `
          INSERT INTO source_assessment_capability_runs (
            assessment_id, workspace_id, source_id, assessed_at, priority, score, document_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        record.id,
        record.workspaceId,
        record.sourceId,
        record.assessedAt,
        record.response.sourceValue.priority,
        record.response.sourceValue.score,
        JSON.stringify(record),
      );
    return record;
  }

  get(id: string): SourceAssessmentRecord | null {
    const row = this.database
      .prepare(
        "SELECT document_json FROM source_assessment_capability_runs WHERE assessment_id = ?",
      )
      .get(id) as { document_json: string } | undefined;
    return row ? this.parse(row.document_json) : null;
  }

  latestForSource(sourceId: string): SourceAssessmentRecord | null {
    const row = this.database
      .prepare(
        `
          SELECT document_json
          FROM source_assessment_capability_runs
          WHERE source_id = ?
          ORDER BY assessed_at DESC, assessment_id DESC
          LIMIT 1
        `,
      )
      .get(sourceId) as { document_json: string } | undefined;
    return row ? this.parse(row.document_json) : null;
  }

  listForSource(sourceId: string, limit = 20): SourceAssessmentRecord[] {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = this.database
      .prepare(
        `
          SELECT document_json
          FROM source_assessment_capability_runs
          WHERE source_id = ?
          ORDER BY assessed_at DESC, assessment_id DESC
          LIMIT ?
        `,
      )
      .all(sourceId, safeLimit) as Array<{ document_json: string }>;
    return rows.map((row) => this.parse(row.document_json));
  }

  listLatestForSources(sourceIds: string[]): SourceAssessmentRecord[] {
    const uniqueIds = [...new Set(sourceIds.filter(Boolean))];
    if (uniqueIds.length === 0) return [];
    if (uniqueIds.length > 500) throw new Error("Too many source ids for assessment lookup");
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = this.database
      .prepare(
        `
          SELECT current.document_json
          FROM source_assessment_capability_runs current
          WHERE current.source_id IN (${placeholders})
            AND current.assessment_id = (
              SELECT latest.assessment_id
              FROM source_assessment_capability_runs latest
              WHERE latest.source_id = current.source_id
              ORDER BY latest.assessed_at DESC, latest.assessment_id DESC
              LIMIT 1
            )
          ORDER BY current.source_id ASC
        `,
      )
      .all(...uniqueIds) as Array<{ document_json: string }>;
    return rows.map((row) => this.parse(row.document_json));
  }

  private parse(documentJson: string): SourceAssessmentRecord {
    const value: unknown = JSON.parse(documentJson);
    if (!isSourceAssessmentRecord(value)) {
      throw new Error("Persisted SourceAssessmentRecord is invalid");
    }
    return value;
  }
}
