import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  SourceIntelligenceObservationFlagKind,
  SourceIntelligenceObservationReviewRecordV2,
  SourceIntelligenceObservationReviewStatus,
} from "@markorbit/contracts";
import { RegistryValidationError } from "./index";

const MAX_KEYS = 500;
const MAX_NOTE_LENGTH = 2000;
const MAX_REVIEWER_LENGTH = 120;
const REVIEW_KEY = /^sir_[0-9a-f]{32}$/;
const REVIEW_STATUSES = new Set<SourceIntelligenceObservationReviewStatus>([
  "PENDING",
  "ACKNOWLEDGED",
  "IGNORED",
]);
const FLAG_KINDS = new Set<SourceIntelligenceObservationFlagKind>([
  "HIGH_VALUE_UNOBSERVED",
  "EVIDENCE_MATURITY_REGRESSION",
  "SOURCE_VALUE_BAND_CHANGED",
  "ACQUISITION_COST_INCREASED",
]);

export type SaveSourceIntelligenceObservationReviewInput = {
  observationKey: string;
  sourceId: string;
  flagKind: SourceIntelligenceObservationFlagKind;
  currentAssessmentId: string;
  previousAssessmentId?: string;
  status: SourceIntelligenceObservationReviewStatus;
  reviewer: string;
  note?: string;
};

export interface SourceIntelligenceObservationReviewRepository {
  get(observationKey: string): SourceIntelligenceObservationReviewRecordV2 | null;
  listByObservationKeys(observationKeys: string[]): SourceIntelligenceObservationReviewRecordV2[];
  save(input: SaveSourceIntelligenceObservationReviewInput): SourceIntelligenceObservationReviewRecordV2;
}

function requiredText(value: string, field: string, maxLength = 500): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  if (normalized.length > maxLength) {
    throw new RegistryValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function normalizedKey(value: string): string {
  const normalized = requiredText(value, "observationKey", 100);
  if (!REVIEW_KEY.test(normalized)) {
    throw new RegistryValidationError("observationKey must be a D2.9 review occurrence key");
  }
  return normalized;
}

function normalizedNote(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > MAX_NOTE_LENGTH) {
    throw new RegistryValidationError(`note must be at most ${MAX_NOTE_LENGTH} characters`);
  }
  return normalized;
}

function parseReview(row: Record<string, unknown>): SourceIntelligenceObservationReviewRecordV2 {
  return {
    observationKey: String(row.observation_key),
    sourceId: String(row.source_id),
    flagKind: String(row.flag_kind) as SourceIntelligenceObservationFlagKind,
    currentAssessmentId: String(row.current_assessment_id),
    ...(row.previous_assessment_id
      ? { previousAssessmentId: String(row.previous_assessment_id) }
      : {}),
    status: String(row.status) as SourceIntelligenceObservationReviewStatus,
    reviewer: String(row.reviewer),
    ...(row.note ? { note: String(row.note) } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class SqliteSourceIntelligenceObservationReviewRepository
  implements SourceIntelligenceObservationReviewRepository
{
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS source_intelligence_observation_reviews (
        observation_key TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        flag_kind TEXT NOT NULL,
        current_assessment_id TEXT NOT NULL,
        previous_assessment_id TEXT,
        status TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_review_source
        ON source_intelligence_observation_reviews(source_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_source_intelligence_review_status
        ON source_intelligence_observation_reviews(status, updated_at DESC);
    `);
  }

  get(observationKey: string): SourceIntelligenceObservationReviewRecordV2 | null {
    const key = normalizedKey(observationKey);
    const row = this.database
      .prepare("SELECT * FROM source_intelligence_observation_reviews WHERE observation_key = ?")
      .get(key) as Record<string, unknown> | undefined;
    return row ? parseReview(row) : null;
  }

  listByObservationKeys(observationKeys: string[]): SourceIntelligenceObservationReviewRecordV2[] {
    const keys = [...new Set(observationKeys.map(normalizedKey))];
    if (keys.length === 0) return [];
    if (keys.length > MAX_KEYS) {
      throw new RegistryValidationError(`At most ${MAX_KEYS} observation keys may be read at once`);
    }
    const placeholders = keys.map(() => "?").join(", ");
    return this.database
      .prepare(
        `SELECT * FROM source_intelligence_observation_reviews
         WHERE observation_key IN (${placeholders})
         ORDER BY updated_at DESC, observation_key ASC`,
      )
      .all(...(keys as SQLInputValue[]))
      .map((row) => parseReview(row as Record<string, unknown>));
  }

  save(
    input: SaveSourceIntelligenceObservationReviewInput,
  ): SourceIntelligenceObservationReviewRecordV2 {
    const observationKey = normalizedKey(input.observationKey);
    const sourceId = requiredText(input.sourceId, "sourceId");
    const currentAssessmentId = requiredText(input.currentAssessmentId, "currentAssessmentId");
    const previousAssessmentId = input.previousAssessmentId
      ? requiredText(input.previousAssessmentId, "previousAssessmentId")
      : undefined;
    if (!FLAG_KINDS.has(input.flagKind)) {
      throw new RegistryValidationError("flagKind is not supported by D2.9");
    }
    if (!REVIEW_STATUSES.has(input.status)) {
      throw new RegistryValidationError("status must be PENDING, ACKNOWLEDGED, or IGNORED");
    }
    const reviewer = requiredText(input.reviewer, "reviewer", MAX_REVIEWER_LENGTH);
    const note = normalizedNote(input.note);
    const timestamp = this.clock().toISOString();

    this.database
      .prepare(
        `INSERT INTO source_intelligence_observation_reviews (
           observation_key, source_id, flag_kind, current_assessment_id, previous_assessment_id,
           status, reviewer, note, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(observation_key) DO UPDATE SET
           source_id = excluded.source_id,
           flag_kind = excluded.flag_kind,
           current_assessment_id = excluded.current_assessment_id,
           previous_assessment_id = excluded.previous_assessment_id,
           status = excluded.status,
           reviewer = excluded.reviewer,
           note = excluded.note,
           updated_at = excluded.updated_at`,
      )
      .run(
        observationKey,
        sourceId,
        input.flagKind,
        currentAssessmentId,
        previousAssessmentId ?? null,
        input.status,
        reviewer,
        note ?? null,
        timestamp,
        timestamp,
      );

    const saved = this.get(observationKey);
    if (!saved) throw new Error(`Failed to persist observation review ${observationKey}`);
    return saved;
  }
}
