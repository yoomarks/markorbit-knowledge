import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  ACQUISITION_SEED_PLAYBOOKS,
  isAllowedAcquisitionPromotionTransition,
  type AcquisitionPrimitive,
  type AcquisitionStrategyCandidateTransition,
  type AcquisitionStrategyGovernanceActor,
  type AcquisitionStrategyReevaluationRequest,
  type AcquisitionRunEvidence,
  type RunLesson,
  type StrategyCandidate,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export type PersistedAcquisitionStrategyCandidate = {
  candidate: StrategyCandidate;
  evidenceCount: number;
  updatedAt: string;
};

export type AcquisitionGovernanceLearningResult = {
  strategyCandidate: PersistedAcquisitionStrategyCandidate | null;
  reevaluationRequest: AcquisitionStrategyReevaluationRequest | null;
};

type CandidateObservation = {
  candidateId: string;
  runId: string;
  sourceId: string;
  observedAt: string;
  confidence: number;
  lessonRefs: string[];
  rationale: string[];
};

const REEVALUATION_LESSON_TYPES = new Set<RunLesson["lessonType"]>([
  "COVERAGE_REGRESSION",
  "INCOMPLETE_ENUMERATOR",
]);

export function ensureAcquisitionStrategyGovernanceRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS acquisition_strategy_candidates (
      id TEXT PRIMARY KEY,
      playbook_id TEXT NOT NULL,
      proposed_revision INTEGER NOT NULL,
      stage TEXT NOT NULL CHECK (
        stage IN ('OBSERVED', 'CANDIDATE', 'VALIDATED', 'PROMOTED', 'ACTIVE', 'DEPRECATED')
      ),
      confidence REAL NOT NULL,
      evidence_count INTEGER NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS acquisition_strategy_candidates_playbook_idx
      ON acquisition_strategy_candidates(playbook_id, proposed_revision, stage, updated_at DESC);

    CREATE TABLE IF NOT EXISTS acquisition_strategy_candidate_observations (
      candidate_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      confidence REAL NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(candidate_id, run_id),
      FOREIGN KEY(candidate_id) REFERENCES acquisition_strategy_candidates(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS acquisition_strategy_candidate_observations_source_idx
      ON acquisition_strategy_candidate_observations(source_id, observed_at DESC);

    CREATE TABLE IF NOT EXISTS acquisition_strategy_candidate_transitions (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      from_stage TEXT NOT NULL,
      to_stage TEXT NOT NULL,
      transitioned_at TEXT NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(candidate_id) REFERENCES acquisition_strategy_candidates(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS acquisition_strategy_candidate_transitions_candidate_idx
      ON acquisition_strategy_candidate_transitions(candidate_id, transitioned_at, id);

    CREATE TABLE IF NOT EXISTS acquisition_strategy_reevaluations (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      source_id TEXT NOT NULL,
      playbook_id TEXT NOT NULL,
      playbook_revision INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'RESOLVED')),
      requested_at TEXT NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS acquisition_strategy_reevaluations_pending_idx
      ON acquisition_strategy_reevaluations(status, requested_at DESC, source_id);
  `);
  INITIALIZED_DATABASES.add(database);
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32)}`;
}

function lessonRef(lesson: RunLesson): string {
  return [
    "lesson",
    lesson.runId,
    lesson.lessonType,
    lesson.affectedSurface ?? "none",
    lesson.recommendedPrimitive ?? "none",
  ].join(":");
}

function currentPlaybook(evidence: AcquisitionRunEvidence) {
  return (
    ACQUISITION_SEED_PLAYBOOKS.find(
      (playbook) =>
        playbook.id === evidence.playbookId && playbook.revision === evidence.playbookRevision,
    ) ?? null
  );
}

function novelRecommendedPrimitives(
  evidence: AcquisitionRunEvidence,
  lessons: readonly RunLesson[],
): AcquisitionPrimitive[] {
  const existing = new Set(currentPlaybook(evidence)?.primitives ?? []);
  return [
    ...new Set(
      lessons
        .map((lesson) => lesson.recommendedPrimitive)
        .filter((primitive): primitive is AcquisitionPrimitive => Boolean(primitive))
        .filter((primitive) => !existing.has(primitive)),
    ),
  ].sort();
}

function candidateObservation(
  evidence: AcquisitionRunEvidence,
  lessons: readonly RunLesson[],
): { candidate: StrategyCandidate; observation: CandidateObservation } | null {
  const recommendedPrimitives = novelRecommendedPrimitives(evidence, lessons);
  if (recommendedPrimitives.length === 0) return null;

  const relevantLessons = lessons.filter(
    (lesson) =>
      lesson.recommendedPrimitive !== undefined &&
      recommendedPrimitives.includes(lesson.recommendedPrimitive),
  );
  const proposedRevision = evidence.playbookRevision + 1;
  const candidateId = stableId("asc", {
    playbookId: evidence.playbookId,
    proposedRevision,
    recommendedPrimitives,
  });
  const refs = [...new Set(relevantLessons.map(lessonRef))].sort();
  const confidence = Math.max(...relevantLessons.map((lesson) => lesson.confidence), 0.5);
  const rationale = [
    `Observed reusable acquisition evidence for ${evidence.playbookId}@${evidence.playbookRevision}.`,
    `Candidate revision ${proposedRevision} should evaluate adding: ${recommendedPrimitives.join(", ")}.`,
    "Observation does not promote, activate, or grant collection authority.",
  ];
  const candidate: StrategyCandidate = {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_STRATEGY_CANDIDATE",
    id: candidateId,
    playbookId: evidence.playbookId,
    proposedRevision,
    stage: "OBSERVED",
    createdAt: evidence.finishedAt,
    sourceScope: [evidence.sourceId],
    lessonRefs: refs,
    confidence,
    rationale,
    boundaries: {
      autoActivated: false,
      requiresPromotionEvidence: true,
    },
  };
  return {
    candidate,
    observation: {
      candidateId,
      runId: evidence.runId,
      sourceId: evidence.sourceId,
      observedAt: evidence.finishedAt,
      confidence,
      lessonRefs: refs,
      rationale,
    },
  };
}

function parseCandidate(value: string): StrategyCandidate {
  const parsed = JSON.parse(value) as StrategyCandidate;
  if (
    parsed?.protocolVersion !== ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION ||
    parsed?.objectType !== "ACQUISITION_STRATEGY_CANDIDATE" ||
    typeof parsed.id !== "string" ||
    typeof parsed.playbookId !== "string" ||
    !Number.isInteger(parsed.proposedRevision) ||
    parsed.proposedRevision <= 0 ||
    parsed.boundaries?.autoActivated !== false ||
    parsed.boundaries?.requiresPromotionEvidence !== true
  ) {
    throw new RegistryValidationError("Stored StrategyCandidate is invalid");
  }
  return parsed;
}

function parseReevaluation(value: string): AcquisitionStrategyReevaluationRequest {
  const parsed = JSON.parse(value) as AcquisitionStrategyReevaluationRequest;
  if (
    parsed?.protocolVersion !== ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION ||
    parsed?.objectType !== "ACQUISITION_STRATEGY_REEVALUATION_REQUEST" ||
    parsed.boundaries?.autoDispatchApplied !== false ||
    parsed.boundaries?.autoPromotionApplied !== false ||
    parsed.boundaries?.collectionAuthorityGranted !== false
  ) {
    throw new RegistryValidationError("Stored acquisition strategy reevaluation is invalid");
  }
  return parsed;
}

function combinedConfidence(observations: readonly CandidateObservation[]): number {
  let remainingUncertainty = 1;
  for (const observation of observations) {
    remainingUncertainty *= 1 - Math.max(0, Math.min(1, observation.confidence)) * 0.35;
  }
  return Math.min(0.99, Math.max(0, 1 - remainingUncertainty));
}

export class SqliteAcquisitionStrategyGovernanceRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureAcquisitionStrategyGovernanceRegistry(database);
  }

  private observationRows(candidateId: string): CandidateObservation[] {
    const rows = this.database
      .prepare(
        `SELECT document_json FROM acquisition_strategy_candidate_observations
         WHERE candidate_id = ?
         ORDER BY observed_at, run_id`,
      )
      .all(candidateId) as Array<{ document_json: string }>;
    return rows.map((row) => JSON.parse(row.document_json) as CandidateObservation);
  }

  private recordCandidateObservation(
    candidate: StrategyCandidate,
    observation: CandidateObservation,
  ): PersistedAcquisitionStrategyCandidate {
    const existingRow = this.database
      .prepare(
        `SELECT document_json, created_at FROM acquisition_strategy_candidates WHERE id = ?`,
      )
      .get(candidate.id) as { document_json: string; created_at: string } | undefined;
    const existingCandidate = existingRow ? parseCandidate(existingRow.document_json) : null;

    if (!existingCandidate) {
      this.database
        .prepare(
          `INSERT INTO acquisition_strategy_candidates (
             id, playbook_id, proposed_revision, stage, confidence, evidence_count,
             document_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          candidate.id,
          candidate.playbookId,
          candidate.proposedRevision,
          candidate.stage,
          candidate.confidence,
          0,
          JSON.stringify(candidate),
          candidate.createdAt,
          candidate.createdAt,
        );
    } else if (
      existingCandidate.playbookId !== candidate.playbookId ||
      existingCandidate.proposedRevision !== candidate.proposedRevision
    ) {
      throw new RegistryConflictError(
        "ACQUISITION_STRATEGY_CANDIDATE_IDENTITY_CONFLICT",
        `Candidate ${candidate.id} already identifies another playbook revision`,
      );
    }

    const existingObservation = this.database
      .prepare(
        `SELECT document_json FROM acquisition_strategy_candidate_observations
         WHERE candidate_id = ? AND run_id = ?`,
      )
      .get(candidate.id, observation.runId) as { document_json: string } | undefined;
    if (existingObservation) {
      if (existingObservation.document_json !== JSON.stringify(observation)) {
        throw new RegistryConflictError(
          "ACQUISITION_STRATEGY_CANDIDATE_OBSERVATION_CONFLICT",
          `Candidate ${candidate.id} already has different evidence for run ${observation.runId}`,
        );
      }
    } else {
      this.database
        .prepare(
          `INSERT INTO acquisition_strategy_candidate_observations (
             candidate_id, run_id, source_id, observed_at, confidence, document_json
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          candidate.id,
          observation.runId,
          observation.sourceId,
          observation.observedAt,
          observation.confidence,
          JSON.stringify(observation),
        );
    }

    const observations = this.observationRows(candidate.id);
    const baseline = existingCandidate ?? candidate;
    const nextCandidate: StrategyCandidate = {
      ...baseline,
      sourceScope: [...new Set(observations.map((item) => item.sourceId))].sort(),
      lessonRefs: [...new Set(observations.flatMap((item) => item.lessonRefs))].sort(),
      confidence: combinedConfidence(observations),
      rationale: [...new Set(observations.flatMap((item) => item.rationale))],
    };
    const updatedAt = observations.at(-1)?.observedAt ?? baseline.createdAt;
    this.database
      .prepare(
        `UPDATE acquisition_strategy_candidates
         SET stage = ?, confidence = ?, evidence_count = ?, document_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        nextCandidate.stage,
        nextCandidate.confidence,
        observations.length,
        JSON.stringify(nextCandidate),
        updatedAt,
        nextCandidate.id,
      );
    return {
      candidate: nextCandidate,
      evidenceCount: observations.length,
      updatedAt,
    };
  }

  getCandidate(candidateId: string): PersistedAcquisitionStrategyCandidate | null {
    const row = this.database
      .prepare(
        `SELECT document_json, evidence_count, updated_at
         FROM acquisition_strategy_candidates WHERE id = ?`,
      )
      .get(candidateId.trim()) as
      | { document_json: string; evidence_count: number; updated_at: string }
      | undefined;
    if (!row) return null;
    return {
      candidate: parseCandidate(row.document_json),
      evidenceCount: Number(row.evidence_count),
      updatedAt: row.updated_at,
    };
  }

  listCandidates(limit = 100): PersistedAcquisitionStrategyCandidate[] {
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.database
      .prepare(
        `SELECT document_json, evidence_count, updated_at
         FROM acquisition_strategy_candidates
         ORDER BY updated_at DESC, id
         LIMIT ?`,
      )
      .all(boundedLimit) as Array<{
      document_json: string;
      evidence_count: number;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      candidate: parseCandidate(row.document_json),
      evidenceCount: Number(row.evidence_count),
      updatedAt: row.updated_at,
    }));
  }

  private recordReevaluation(
    evidence: AcquisitionRunEvidence,
    lessons: readonly RunLesson[],
  ): AcquisitionStrategyReevaluationRequest | null {
    const relevant = lessons.filter((lesson) => REEVALUATION_LESSON_TYPES.has(lesson.lessonType));
    if (relevant.length === 0) return null;

    const playbook = currentPlaybook(evidence);
    const request: AcquisitionStrategyReevaluationRequest = {
      protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
      objectType: "ACQUISITION_STRATEGY_REEVALUATION_REQUEST",
      id: stableId("asr", { runId: evidence.runId }),
      runId: evidence.runId,
      sourceId: evidence.sourceId,
      playbookId: evidence.playbookId,
      playbookRevision: evidence.playbookRevision,
      requestedAt: evidence.finishedAt,
      status: "PENDING",
      lessonTypes: [...new Set(relevant.map((lesson) => lesson.lessonType))].sort(),
      reasonCodes: [...new Set(relevant.flatMap((lesson) => lesson.reasonCodes))].sort(),
      fallbackPlaybookIds: [...(playbook?.fallbackPlaybookIds ?? [])],
      evidenceRefs: [...new Set(relevant.flatMap((lesson) => lesson.evidenceRefs))].sort(),
      boundaries: {
        autoDispatchApplied: false,
        autoPromotionApplied: false,
        collectionAuthorityGranted: false,
      },
    };
    const existing = this.database
      .prepare(`SELECT document_json FROM acquisition_strategy_reevaluations WHERE run_id = ?`)
      .get(evidence.runId) as { document_json: string } | undefined;
    if (existing) {
      const parsed = parseReevaluation(existing.document_json);
      if (JSON.stringify(parsed) !== JSON.stringify(request)) {
        throw new RegistryConflictError(
          "ACQUISITION_STRATEGY_REEVALUATION_CONFLICT",
          `Run ${evidence.runId} already has a different reevaluation request`,
        );
      }
      return parsed;
    }
    this.database
      .prepare(
        `INSERT INTO acquisition_strategy_reevaluations (
           id, run_id, source_id, playbook_id, playbook_revision, status,
           requested_at, document_json, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        request.id,
        request.runId,
        request.sourceId,
        request.playbookId,
        request.playbookRevision,
        request.status,
        request.requestedAt,
        JSON.stringify(request),
        request.requestedAt,
      );
    return request;
  }

  observeLearningRun(
    evidence: AcquisitionRunEvidence,
    lessons: readonly RunLesson[],
  ): AcquisitionGovernanceLearningResult {
    const observation = candidateObservation(evidence, lessons);
    const strategyCandidate = observation
      ? this.recordCandidateObservation(observation.candidate, observation.observation)
      : null;
    const reevaluationRequest = this.recordReevaluation(evidence, lessons);
    return { strategyCandidate, reevaluationRequest };
  }

  transitionCandidate(input: {
    candidateId: string;
    toStage: StrategyCandidate["stage"];
    actor: AcquisitionStrategyGovernanceActor;
    evidenceRefs?: string[];
    rationale: string;
    transitionedAt?: string;
  }): AcquisitionStrategyCandidateTransition {
    const persisted = this.getCandidate(input.candidateId);
    if (!persisted) {
      throw new RegistryValidationError(`StrategyCandidate ${input.candidateId} was not found`);
    }
    const fromStage = persisted.candidate.stage;
    if (!isAllowedAcquisitionPromotionTransition(fromStage, input.toStage)) {
      throw new RegistryConflictError(
        "ACQUISITION_STRATEGY_TRANSITION_INVALID",
        `StrategyCandidate ${input.candidateId} cannot transition ${fromStage} -> ${input.toStage}`,
      );
    }
    const rationale = input.rationale.trim();
    if (!rationale) throw new RegistryValidationError("Candidate transition rationale is required");
    const evidenceRefs = [...new Set(input.evidenceRefs ?? [])].sort();
    if (["VALIDATED", "PROMOTED", "ACTIVE"].includes(input.toStage) && evidenceRefs.length === 0) {
      throw new RegistryValidationError(
        `${input.toStage} transition requires explicit validation or promotion evidence`,
      );
    }
    if (input.toStage === "ACTIVE" && input.actor.actorType !== "HUMAN") {
      throw new RegistryConflictError(
        "ACQUISITION_STRATEGY_ACTIVATION_REQUIRES_HUMAN",
        "ACTIVE acquisition strategy promotion requires an explicit human actor",
      );
    }
    if (!input.actor.actorId.trim()) {
      throw new RegistryValidationError("Candidate transition actorId is required");
    }
    const transitionedAt = new Date(input.transitionedAt ?? Date.now()).toISOString();
    const transition: AcquisitionStrategyCandidateTransition = {
      protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
      objectType: "ACQUISITION_STRATEGY_CANDIDATE_TRANSITION",
      id: randomUUID(),
      candidateId: persisted.candidate.id,
      playbookId: persisted.candidate.playbookId,
      proposedRevision: persisted.candidate.proposedRevision,
      fromStage,
      toStage: input.toStage,
      transitionedAt,
      actor: {
        actorType: input.actor.actorType,
        actorId: input.actor.actorId.trim(),
      },
      evidenceRefs,
      rationale,
      boundaries: {
        autoPromotionApplied: false,
        collectionAuthorityGranted: false,
      },
    };
    const nextCandidate: StrategyCandidate = {
      ...persisted.candidate,
      stage: input.toStage,
    };
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `UPDATE acquisition_strategy_candidates
           SET stage = ?, document_json = ?, updated_at = ? WHERE id = ?`,
        )
        .run(input.toStage, JSON.stringify(nextCandidate), transitionedAt, nextCandidate.id);
      this.database
        .prepare(
          `INSERT INTO acquisition_strategy_candidate_transitions (
             id, candidate_id, from_stage, to_stage, transitioned_at, document_json
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          transition.id,
          transition.candidateId,
          transition.fromStage,
          transition.toStage,
          transition.transitionedAt,
          JSON.stringify(transition),
        );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return transition;
  }

  listTransitions(candidateId: string): AcquisitionStrategyCandidateTransition[] {
    const rows = this.database
      .prepare(
        `SELECT document_json FROM acquisition_strategy_candidate_transitions
         WHERE candidate_id = ? ORDER BY transitioned_at, id`,
      )
      .all(candidateId.trim()) as Array<{ document_json: string }>;
    return rows.map((row) => JSON.parse(row.document_json) as AcquisitionStrategyCandidateTransition);
  }

  listPendingReevaluations(limit = 100): AcquisitionStrategyReevaluationRequest[] {
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.database
      .prepare(
        `SELECT document_json FROM acquisition_strategy_reevaluations
         WHERE status = 'PENDING'
         ORDER BY requested_at DESC, id
         LIMIT ?`,
      )
      .all(boundedLimit) as Array<{ document_json: string }>;
    return rows.map((row) => parseReevaluation(row.document_json));
  }
}
