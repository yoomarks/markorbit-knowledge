import type { DatabaseSync } from "node:sqlite";
import {
  isSourceIntelligenceAssessment,
  type SourceIntelligenceAssessment,
} from "@markorbit/contracts";

export interface SourceIntelligenceRepository {
  save(assessment: SourceIntelligenceAssessment): SourceIntelligenceAssessment;
  get(id: string): SourceIntelligenceAssessment | null;
  getByFingerprint(sourceId: string, inputFingerprint: string): SourceIntelligenceAssessment | null;
  latestForSource(sourceId: string): SourceIntelligenceAssessment | null;
  listLatest(workspaceId: string, limit?: number): SourceIntelligenceAssessment[];
}

export class SqliteSourceIntelligenceRepository implements SourceIntelligenceRepository {
  constructor(private readonly database: DatabaseSync) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS source_intelligence_assessments (
        assessment_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        input_fingerprint TEXT NOT NULL,
        assessed_at TEXT NOT NULL,
        operational_tier TEXT NOT NULL,
        priority_score INTEGER NOT NULL,
        document_json TEXT NOT NULL,
        UNIQUE (source_id, input_fingerprint)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_latest
        ON source_intelligence_assessments(source_id, assessed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_tier
        ON source_intelligence_assessments(workspace_id, operational_tier, priority_score DESC);
    `);
  }

  save(assessment: SourceIntelligenceAssessment): SourceIntelligenceAssessment {
    if (!isSourceIntelligenceAssessment(assessment)) {
      throw new Error("Invalid SourceIntelligenceAssessment");
    }
    const existing = this.getByFingerprint(assessment.sourceId, assessment.inputFingerprint);
    if (existing) return existing;
    this.database
      .prepare(`
        INSERT INTO source_intelligence_assessments (
          assessment_id, workspace_id, source_id, input_fingerprint, assessed_at,
          operational_tier, priority_score, document_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        assessment.id,
        assessment.workspaceId,
        assessment.sourceId,
        assessment.inputFingerprint,
        assessment.assessedAt,
        assessment.operationalTier,
        assessment.priorityScore,
        JSON.stringify(assessment),
      );
    return assessment;
  }

  get(id: string): SourceIntelligenceAssessment | null {
    const row = this.database
      .prepare(
        "SELECT document_json FROM source_intelligence_assessments WHERE assessment_id = ?",
      )
      .get(id) as { document_json: string } | undefined;
    return row ? this.parse(row.document_json) : null;
  }

  getByFingerprint(
    sourceId: string,
    inputFingerprint: string,
  ): SourceIntelligenceAssessment | null {
    const row = this.database
      .prepare(
        "SELECT document_json FROM source_intelligence_assessments WHERE source_id = ? AND input_fingerprint = ?",
      )
      .get(sourceId, inputFingerprint) as { document_json: string } | undefined;
    return row ? this.parse(row.document_json) : null;
  }

  latestForSource(sourceId: string): SourceIntelligenceAssessment | null {
    const row = this.database
      .prepare(`
        SELECT document_json FROM source_intelligence_assessments
        WHERE source_id = ? ORDER BY assessed_at DESC, assessment_id DESC LIMIT 1
      `)
      .get(sourceId) as { document_json: string } | undefined;
    return row ? this.parse(row.document_json) : null;
  }

  listLatest(workspaceId: string, limit = 100): SourceIntelligenceAssessment[] {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const rows = this.database
      .prepare(`
        SELECT a.document_json
        FROM source_intelligence_assessments a
        JOIN (
          SELECT source_id, MAX(assessed_at) AS max_assessed_at
          FROM source_intelligence_assessments
          WHERE workspace_id = ? GROUP BY source_id
        ) latest ON latest.source_id = a.source_id AND latest.max_assessed_at = a.assessed_at
        WHERE a.workspace_id = ?
        ORDER BY a.priority_score DESC, a.source_id ASC
        LIMIT ?
      `)
      .all(workspaceId, workspaceId, safeLimit) as Array<{ document_json: string }>;
    return rows.map((row) => this.parse(row.document_json));
  }

  private parse(documentJson: string): SourceIntelligenceAssessment {
    const value: unknown = JSON.parse(documentJson);
    if (!isSourceIntelligenceAssessment(value)) {
      throw new Error("Persisted SourceIntelligenceAssessment is invalid");
    }
    return value;
  }
}
