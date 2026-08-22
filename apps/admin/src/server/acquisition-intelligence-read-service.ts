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

export class AcquisitionIntelligenceReadService {
  private readonly intelligence: SqliteAcquisitionIntelligenceRepository;
  private readonly governance: SqliteAcquisitionStrategyGovernanceRepository;

  constructor(database: DatabaseSync) {
    this.intelligence = new SqliteAcquisitionIntelligenceRepository(database);
    this.governance = new SqliteAcquisitionStrategyGovernanceRepository(database);
  }

  source(input: {
    sourceId: string;
    runsLimit?: number;
    lessonsLimit?: number;
  }): AcquisitionSourceLearningRead {
    const sourceId = normalizedId(input.sourceId, "sourceId");
    const runsLimit = boundedLimit(input.runsLimit, 50, "runsLimit");
    const lessonsLimit = boundedLimit(input.lessonsLimit, 100, "lessonsLimit");
    const runs = this.intelligence.listRunEvidenceForSource(sourceId, runsLimit);
    const lessons = this.intelligence.listLessonsForSource(sourceId, lessonsLimit);
    const strategyCandidates = this.governance
      .listCandidates(500)
      .filter((item) => item.candidate.sourceScope.includes(sourceId));
    const pendingReevaluations = this.governance
      .listPendingReevaluations(500)
      .filter((item) => item.sourceId === sourceId);

    return {
      version: ACQUISITION_INTELLIGENCE_READ_SURFACE_VERSION,
      sourceId,
      fingerprint: this.intelligence.latestFingerprintForSource(sourceId),
      runs,
      lessons,
      latestSelection: this.intelligence.latestStrategySelectionForSource(sourceId),
      strategyCandidates,
      pendingReevaluations,
    };
  }

  run(runIdInput: string): AcquisitionRunLearningRead {
    const runId = normalizedId(runIdInput, "runId");
    const evidence = this.intelligence.getRunEvidence(runId);
    return {
      version: ACQUISITION_INTELLIGENCE_READ_SURFACE_VERSION,
      runId,
      evidence,
      lessons: this.intelligence.listLessonsForRun(runId),
      pendingReevaluation:
        this.governance.listPendingReevaluations(500).find((item) => item.runId === runId) ?? null,
    };
  }
}
