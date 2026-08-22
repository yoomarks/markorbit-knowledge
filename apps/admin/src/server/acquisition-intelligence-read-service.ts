import type { DatabaseSync } from "node:sqlite";
import type {
  AcquisitionRunEvidence,
  AcquisitionStrategyReevaluationRequest,
  RunLesson,
  SourceFingerprint,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  SqliteAcquisitionIntelligenceRepository,
  type PersistedAcquisitionStrategySelection,
} from "@markorbit/persistence/acquisition-intelligence";
import {
  SqliteAcquisitionStrategyGovernanceRepository,
  type PersistedAcquisitionStrategyCandidate,
} from "@markorbit/persistence/acquisition-strategy-governance";

export const ACQUISITION_INTELLIGENCE_READ_SURFACE_VERSION =
  "ACQUISITION_INTELLIGENCE_READ_SURFACE_V1" as const;

export type AcquisitionSourceLearningRead = {
  version: typeof ACQUISITION_INTELLIGENCE_READ_SURFACE_VERSION;
  sourceId: string;
  fingerprint: SourceFingerprint | null;
  runs: AcquisitionRunEvidence[];
  lessons: RunLesson[];
  latestSelection: PersistedAcquisitionStrategySelection | null;
  strategyCandidates: PersistedAcquisitionStrategyCandidate[];
  pendingReevaluations: AcquisitionStrategyReevaluationRequest[];
};

export type AcquisitionRunLearningRead = {
  version: typeof ACQUISITION_INTELLIGENCE_READ_SURFACE_VERSION;
  runId: string;
  evidence: AcquisitionRunEvidence | null;
  lessons: RunLesson[];
  pendingReevaluation: AcquisitionStrategyReevaluationRequest | null;
};

function normalizedId(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function boundedLimit(value: number | undefined, fallback: number, field: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 500) {
    throw new RegistryValidationError(`${field} must be an integer between 1 and 500`);
  }
  return resolved;
}

function parseReevaluation(documentJson: string): AcquisitionStrategyReevaluationRequest {
  return JSON.parse(documentJson) as AcquisitionStrategyReevaluationRequest;
}

export class AcquisitionIntelligenceReadService {
  private readonly intelligence: SqliteAcquisitionIntelligenceRepository;
  private readonly governance: SqliteAcquisitionStrategyGovernanceRepository;

  constructor(private readonly database: DatabaseSync) {
    this.intelligence = new SqliteAcquisitionIntelligenceRepository(database);
    this.governance = new SqliteAcquisitionStrategyGovernanceRepository(database);
  }

  private candidatesForSource(sourceId: string): PersistedAcquisitionStrategyCandidate[] {
    const rows = this.database
      .prepare(
        `SELECT candidate_id, MAX(observed_at) AS latest_observed_at
         FROM acquisition_strategy_candidate_observations
         WHERE source_id = ?
         GROUP BY candidate_id
         ORDER BY latest_observed_at DESC, candidate_id
         LIMIT 500`,
      )
      .all(sourceId) as Array<{ candidate_id: string }>;
    return rows
      .map((row) => this.governance.getCandidate(row.candidate_id))
      .filter((item): item is PersistedAcquisitionStrategyCandidate => item !== null);
  }

  private pendingReevaluationsForSource(
    sourceId: string,
  ): AcquisitionStrategyReevaluationRequest[] {
    const rows = this.database
      .prepare(
        `SELECT document_json FROM acquisition_strategy_reevaluations
         WHERE status = 'PENDING' AND source_id = ?
         ORDER BY requested_at DESC, id
         LIMIT 500`,
      )
      .all(sourceId) as Array<{ document_json: string }>;
    return rows.map((row) => parseReevaluation(row.document_json));
  }

  private pendingReevaluationForRun(runId: string): AcquisitionStrategyReevaluationRequest | null {
    const row = this.database
      .prepare(
        `SELECT document_json FROM acquisition_strategy_reevaluations
         WHERE status = 'PENDING' AND run_id = ?
         LIMIT 1`,
      )
      .get(runId) as { document_json: string } | undefined;
    return row ? parseReevaluation(row.document_json) : null;
  }

  source(input: {
    sourceId: string;
    runsLimit?: number;
    lessonsLimit?: number;
  }): AcquisitionSourceLearningRead {
    const sourceId = normalizedId(input.sourceId, "sourceId");
    const runsLimit = boundedLimit(input.runsLimit, 50, "runsLimit");
    const lessonsLimit = boundedLimit(input.lessonsLimit, 100, "lessonsLimit");

    return {
      version: ACQUISITION_INTELLIGENCE_READ_SURFACE_VERSION,
      sourceId,
      fingerprint: this.intelligence.latestFingerprintForSource(sourceId),
      runs: this.intelligence.listRunEvidenceForSource(sourceId, runsLimit),
      lessons: this.intelligence.listLessonsForSource(sourceId, lessonsLimit),
      latestSelection: this.intelligence.latestStrategySelectionForSource(sourceId),
      strategyCandidates: this.candidatesForSource(sourceId),
      pendingReevaluations: this.pendingReevaluationsForSource(sourceId),
    };
  }

  run(runIdInput: string): AcquisitionRunLearningRead {
    const runId = normalizedId(runIdInput, "runId");
    return {
      version: ACQUISITION_INTELLIGENCE_READ_SURFACE_VERSION,
      runId,
      evidence: this.intelligence.getRunEvidence(runId),
      lessons: this.intelligence.listLessonsForRun(runId),
      pendingReevaluation: this.pendingReevaluationForRun(runId),
    };
  }
}
