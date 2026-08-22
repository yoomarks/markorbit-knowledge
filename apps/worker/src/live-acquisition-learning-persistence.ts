import { DatabaseSync } from "node:sqlite";
import { SqliteAcquisitionIntelligenceRepository } from "@markorbit/persistence/acquisition-intelligence";
import { SqliteAcquisitionLearningLoopRepository } from "@markorbit/persistence/acquisition-learning-loop";
import type { LiveAcquisitionProfileEvidence } from "./live-acquisition-profile-evidence";

export type LiveAcquisitionLearningPersistenceResult = {
  databasePath: string;
  runId: string;
  sourceId: string;
  fingerprintObservedAt: string;
  lessonTypes: string[];
  playbookRuns: number;
  playbookSuccessRate: number;
  playbookAverageCoverage: number | null;
  strategyCandidateId: string | null;
  reevaluationRequestId: string | null;
};

/**
 * Persists canary/live structural acquisition observations into the same governed
 * learning history used by authenticated Worker intake. The caller supplies the
 * isolated registry path; absence of a path means observation-only mode.
 */
export function persistLiveAcquisitionProfileEvidence(
  learning: LiveAcquisitionProfileEvidence,
  databasePath = process.env.MARKORBIT_KNOWLEDGE_DB_PATH?.trim(),
): LiveAcquisitionLearningPersistenceResult | null {
  if (!databasePath) return null;

  const database = new DatabaseSync(databasePath);
  try {
    const intelligence = new SqliteAcquisitionIntelligenceRepository(database);
    intelligence.saveFingerprint(learning.fingerprint);

    const loop = new SqliteAcquisitionLearningLoopRepository(database);
    const learned = loop.recordLearningRun(learning.evidence);

    return {
      databasePath,
      runId: learned.evidence.runId,
      sourceId: learned.evidence.sourceId,
      fingerprintObservedAt: learning.fingerprint.observedAt,
      lessonTypes: [...new Set(learned.lessons.map((lesson) => lesson.lessonType))].sort(),
      playbookRuns: learned.playbookHistory.runs,
      playbookSuccessRate: learned.playbookHistory.successRate,
      playbookAverageCoverage: learned.playbookHistory.averageCoverage,
      strategyCandidateId: learned.strategyCandidate?.candidate.id ?? null,
      reevaluationRequestId: learned.reevaluationRequest?.id ?? null,
    };
  } finally {
    database.close();
  }
}
