import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  extractAcquisitionRunLessons,
  isAcquisitionRunEvidence,
  isSourceFingerprint,
  type AcquisitionPlaybookHistory,
  type AcquisitionRunEvidence,
  type AcquisitionStrategySelection,
  type RunLesson,
  type SourceFingerprint,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export type PersistedAcquisitionStrategySelection = {
  id: string;
  selectedAt: string;
  selection: AcquisitionStrategySelection;
};

export type AcquisitionLearningRecordResult = {
  evidence: AcquisitionRunEvidence;
  lessons: RunLesson[];
  playbookHistory: AcquisitionPlaybookHistory;
};

export function ensureAcquisitionIntelligenceRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS acquisition_source_fingerprints (
      source_id TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      confidence REAL NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(source_id, observed_at)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS acquisition_source_fingerprints_latest_idx
      ON acquisition_source_fingerprints(source_id, observed_at DESC, created_at DESC);

    CREATE TABLE IF NOT EXISTS acquisition_run_evidence (
      run_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      playbook_id TEXT NOT NULL,
      playbook_revision INTEGER NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'DEGRADED', 'FAILED')),
      finished_at TEXT NOT NULL,
      coverage_ratio REAL,
      duration_ms INTEGER NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    CREATE INDEX IF NOT EXISTS acquisition_run_evidence_source_idx
      ON acquisition_run_evidence(source_id, finished_at DESC, run_id DESC);
    CREATE INDEX IF NOT EXISTS acquisition_run_evidence_playbook_idx
      ON acquisition_run_evidence(playbook_id, playbook_revision, finished_at DESC);

    CREATE TABLE IF NOT EXISTS acquisition_run_lessons (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      lesson_type TEXT NOT NULL,
      scope TEXT NOT NULL,
      confidence REAL NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(run_id) REFERENCES acquisition_run_evidence(run_id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS acquisition_run_lessons_run_idx
      ON acquisition_run_lessons(run_id, lesson_type, id);
    CREATE INDEX IF NOT EXISTS acquisition_run_lessons_source_idx
      ON acquisition_run_lessons(source_id, created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS acquisition_strategy_selections (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      selected_at TEXT NOT NULL,
      selected_playbook_id TEXT,
      selected_revision INTEGER,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    CREATE INDEX IF NOT EXISTS acquisition_strategy_selections_source_idx
      ON acquisition_strategy_selections(source_id, selected_at DESC, created_at DESC);
  `);
  INITIALIZED_DATABASES.add(database);
}

function requireTimestamp(value: string, field: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new RegistryValidationError(`${field} must be an ISO timestamp`);
  }
  return timestamp.toISOString();
}

function parseFingerprint(value: string): SourceFingerprint {
  const parsed = JSON.parse(value) as unknown;
  if (!isSourceFingerprint(parsed)) {
    throw new RegistryValidationError("Stored SourceFingerprint is invalid");
  }
  return parsed;
}

function parseRunEvidence(value: string): AcquisitionRunEvidence {
  const parsed = JSON.parse(value) as unknown;
  if (!isAcquisitionRunEvidence(parsed)) {
    throw new RegistryValidationError("Stored AcquisitionRunEvidence is invalid");
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLesson(value: string): RunLesson {
  const parsed = JSON.parse(value) as unknown;
  if (
    !isRecord(parsed) ||
    parsed.protocolVersion !== ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION ||
    parsed.objectType !== "ACQUISITION_RUN_LESSON" ||
    typeof parsed.runId !== "string" ||
    typeof parsed.sourceId !== "string" ||
    typeof parsed.lessonType !== "string" ||
    typeof parsed.scope !== "string" ||
    typeof parsed.statement !== "string" ||
    typeof parsed.confidence !== "number"
  ) {
    throw new RegistryValidationError("Stored RunLesson is invalid");
  }
  return parsed as RunLesson;
}

function parseSelection(value: string): AcquisitionStrategySelection {
  const parsed = JSON.parse(value) as unknown;
  if (
    !isRecord(parsed) ||
    parsed.protocolVersion !== ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION ||
    parsed.objectType !== "ACQUISITION_STRATEGY_SELECTION" ||
    typeof parsed.sourceId !== "string" ||
    !isRecord(parsed.boundaries) ||
    parsed.boundaries.selectionGrantsCollectionAuthority !== false ||
    parsed.boundaries.autoPromotionApplied !== false
  ) {
    throw new RegistryValidationError("Stored AcquisitionStrategySelection is invalid");
  }
  return parsed as AcquisitionStrategySelection;
}

function stableLessonId(lesson: RunLesson): string {
  const identity = JSON.stringify({
    runId: lesson.runId,
    sourceId: lesson.sourceId,
    lessonType: lesson.lessonType,
    scope: lesson.scope,
    reasonCodes: lesson.reasonCodes,
    recommendedPrimitive: lesson.recommendedPrimitive ?? null,
    affectedSurface: lesson.affectedSurface ?? null,
  });
  return `acl_${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

function historiesEqual(left: string, right: unknown): boolean {
  return left === JSON.stringify(right);
}

export class SqliteAcquisitionIntelligenceRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureAcquisitionIntelligenceRegistry(database);
  }

  saveFingerprint(fingerprint: SourceFingerprint): SourceFingerprint {
    if (!isSourceFingerprint(fingerprint)) {
      throw new RegistryValidationError("SourceFingerprint is invalid");
    }
    const existing = this.database
      .prepare(
        `SELECT document_json FROM acquisition_source_fingerprints
         WHERE source_id = ? AND observed_at = ?`,
      )
      .get(fingerprint.sourceId, fingerprint.observedAt) as { document_json?: string } | undefined;
    if (existing?.document_json) {
      if (!historiesEqual(existing.document_json, fingerprint)) {
        throw new RegistryConflictError(
          "ACQUISITION_FINGERPRINT_CONFLICT",
          "A different SourceFingerprint already exists for this source and observedAt",
        );
      }
      return parseFingerprint(existing.document_json);
    }
    this.database
      .prepare(
        `INSERT INTO acquisition_source_fingerprints
           (source_id, observed_at, confidence, document_json)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        fingerprint.sourceId,
        requireTimestamp(fingerprint.observedAt, "fingerprint.observedAt"),
        fingerprint.confidence,
        JSON.stringify(fingerprint),
      );
    return fingerprint;
  }

  latestFingerprintForSource(sourceId: string): SourceFingerprint | null {
    const row = this.database
      .prepare(
        `SELECT document_json FROM acquisition_source_fingerprints
         WHERE source_id = ?
         ORDER BY observed_at DESC, created_at DESC
         LIMIT 1`,
      )
      .get(sourceId.trim()) as { document_json?: string } | undefined;
    return row?.document_json ? parseFingerprint(row.document_json) : null;
  }

  recordRunEvidence(evidence: AcquisitionRunEvidence): AcquisitionRunEvidence {
    if (!isAcquisitionRunEvidence(evidence)) {
      throw new RegistryValidationError("AcquisitionRunEvidence is invalid");
    }
    const existing = this.database
      .prepare(`SELECT document_json FROM acquisition_run_evidence WHERE run_id = ?`)
      .get(evidence.runId) as { document_json?: string } | undefined;
    if (existing?.document_json) {
      if (!historiesEqual(existing.document_json, evidence)) {
        throw new RegistryConflictError(
          "ACQUISITION_RUN_EVIDENCE_CONFLICT",
          `Different acquisition evidence already exists for run ${evidence.runId}`,
        );
      }
      return parseRunEvidence(existing.document_json);
    }
    this.database
      .prepare(
        `INSERT INTO acquisition_run_evidence (
           run_id, source_id, playbook_id, playbook_revision, outcome,
           finished_at, coverage_ratio, duration_ms, document_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        evidence.runId,
        evidence.sourceId,
        evidence.playbookId,
        evidence.playbookRevision,
        evidence.outcome,
        requireTimestamp(evidence.finishedAt, "evidence.finishedAt"),
        evidence.coverage.ratio,
        evidence.performance.durationMs,
        JSON.stringify(evidence),
      );
    return evidence;
  }

  getRunEvidence(runId: string): AcquisitionRunEvidence | null {
    const row = this.database
      .prepare(`SELECT document_json FROM acquisition_run_evidence WHERE run_id = ?`)
      .get(runId.trim()) as { document_json?: string } | undefined;
    return row?.document_json ? parseRunEvidence(row.document_json) : null;
  }

  listRunEvidenceForSource(sourceId: string, limit = 50): AcquisitionRunEvidence[] {
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.database
      .prepare(
        `SELECT document_json FROM acquisition_run_evidence
         WHERE source_id = ?
         ORDER BY finished_at DESC, run_id DESC
         LIMIT ?`,
      )
      .all(sourceId.trim(), boundedLimit) as Array<{ document_json: string }>;
    return rows.map((row) => parseRunEvidence(row.document_json));
  }

  recordLessons(lessons: readonly RunLesson[]): RunLesson[] {
    if (lessons.length === 0) return [];
    const statement = this.database.prepare(
      `INSERT INTO acquisition_run_lessons
         (id, run_id, source_id, lesson_type, scope, confidence, document_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    );
    for (const lesson of lessons) {
      statement.run(
        stableLessonId(lesson),
        lesson.runId,
        lesson.sourceId,
        lesson.lessonType,
        lesson.scope,
        lesson.confidence,
        JSON.stringify(lesson),
      );
    }
    return this.listLessonsForRun(lessons[0]!.runId);
  }

  listLessonsForRun(runId: string): RunLesson[] {
    const rows = this.database
      .prepare(
        `SELECT document_json FROM acquisition_run_lessons
         WHERE run_id = ?
         ORDER BY lesson_type, id`,
      )
      .all(runId.trim()) as Array<{ document_json: string }>;
    return rows.map((row) => parseLesson(row.document_json));
  }

  listLessonsForSource(sourceId: string, limit = 100): RunLesson[] {
    const boundedLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
    const rows = this.database
      .prepare(
        `SELECT document_json FROM acquisition_run_lessons
         WHERE source_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .all(sourceId.trim(), boundedLimit) as Array<{ document_json: string }>;
    return rows.map((row) => parseLesson(row.document_json));
  }

  playbookHistory(playbookId: string, revision: number): AcquisitionPlaybookHistory {
    const row = this.database
      .prepare(
        `SELECT
           COUNT(*) AS runs,
           AVG(CASE WHEN outcome = 'SUCCESS' THEN 1.0 ELSE 0.0 END) AS success_rate,
           AVG(coverage_ratio) AS average_coverage,
           AVG(duration_ms) AS average_duration_ms
         FROM acquisition_run_evidence
         WHERE playbook_id = ? AND playbook_revision = ?`,
      )
      .get(playbookId.trim(), revision) as Record<string, unknown>;
    const runs = Number(row.runs ?? 0);
    return {
      runs,
      successRate: runs > 0 ? Number(row.success_rate ?? 0) : 0,
      averageCoverage: row.average_coverage === null ? null : Number(row.average_coverage),
      averageDurationMs: row.average_duration_ms === null ? null : Number(row.average_duration_ms),
    };
  }

  recordStrategySelection(
    selection: AcquisitionStrategySelection,
    selectedAt = new Date().toISOString(),
  ): PersistedAcquisitionStrategySelection {
    const normalizedSelectedAt = requireTimestamp(selectedAt, "selectedAt");
    const id = randomUUID();
    this.database
      .prepare(
        `INSERT INTO acquisition_strategy_selections (
           id, source_id, selected_at, selected_playbook_id, selected_revision, document_json
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        selection.sourceId,
        normalizedSelectedAt,
        selection.selectedPlaybookId,
        selection.selectedRevision,
        JSON.stringify(selection),
      );
    return { id, selectedAt: normalizedSelectedAt, selection };
  }

  latestStrategySelectionForSource(sourceId: string): PersistedAcquisitionStrategySelection | null {
    const row = this.database
      .prepare(
        `SELECT id, selected_at, document_json FROM acquisition_strategy_selections
         WHERE source_id = ?
         ORDER BY selected_at DESC, created_at DESC
         LIMIT 1`,
      )
      .get(sourceId.trim()) as
      { id: string; selected_at: string; document_json: string } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      selectedAt: row.selected_at,
      selection: parseSelection(row.document_json),
    };
  }

  recordLearningRun(evidence: AcquisitionRunEvidence): AcquisitionLearningRecordResult {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const recordedEvidence = this.recordRunEvidence(evidence);
      const lessons = this.recordLessons(extractAcquisitionRunLessons(recordedEvidence));
      const playbookHistory = this.playbookHistory(
        recordedEvidence.playbookId,
        recordedEvidence.playbookRevision,
      );
      this.database.exec("COMMIT");
      return { evidence: recordedEvidence, lessons, playbookHistory };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
