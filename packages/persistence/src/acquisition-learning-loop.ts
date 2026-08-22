import type { DatabaseSync } from "node:sqlite";
import type { AcquisitionRunEvidence } from "@markorbit/contracts";
import {
  SqliteAcquisitionIntelligenceRepository,
  type AcquisitionLearningRecordResult,
} from "./acquisition-intelligence-registry";
import {
  SqliteAcquisitionStrategyGovernanceRepository,
  type AcquisitionGovernanceLearningResult,
} from "./acquisition-strategy-governance";

export type GovernedAcquisitionLearningRecordResult = AcquisitionLearningRecordResult &
  AcquisitionGovernanceLearningResult;

const PREVIOUS_RUN_REF_PREFIX = "previous-acquisition-run:";

function previousRunReference(runId: string): string {
  return `${PREVIOUS_RUN_REF_PREFIX}${runId}`;
}

function previousRunEvidence(
  database: DatabaseSync,
  evidence: AcquisitionRunEvidence,
): AcquisitionRunEvidence | null {
  const row = database
    .prepare(
      `SELECT document_json FROM acquisition_run_evidence
       WHERE source_id = ?
         AND run_id <> ?
         AND (finished_at < ? OR (finished_at = ? AND run_id < ?))
       ORDER BY finished_at DESC, run_id DESC
       LIMIT 1`,
    )
    .get(
      evidence.sourceId,
      evidence.runId,
      evidence.finishedAt,
      evidence.finishedAt,
      evidence.runId,
    ) as { document_json?: string } | undefined;
  return row?.document_json ? (JSON.parse(row.document_json) as AcquisitionRunEvidence) : null;
}

function enrichPreviousCoverage(
  evidence: AcquisitionRunEvidence,
  previous: AcquisitionRunEvidence | null,
): AcquisitionRunEvidence {
  if (evidence.coverage.previousRatio !== null || previous?.coverage.ratio === null || !previous) {
    return evidence;
  }
  return {
    ...evidence,
    coverage: {
      ...evidence.coverage,
      previousRatio: previous.coverage.ratio,
    },
    evidenceRefs: [
      ...new Set([...evidence.evidenceRefs, previousRunReference(previous.runId)]),
    ].sort(),
  };
}

function normalizeRawReplay(
  evidence: AcquisitionRunEvidence,
  existing: AcquisitionRunEvidence,
): AcquisitionRunEvidence {
  if (evidence.coverage.previousRatio !== null || existing.coverage.previousRatio === null) {
    return evidence;
  }
  const derivedReference = existing.evidenceRefs.find((reference) =>
    reference.startsWith(PREVIOUS_RUN_REF_PREFIX),
  );
  if (!derivedReference) return evidence;
  return {
    ...evidence,
    coverage: {
      ...evidence.coverage,
      previousRatio: existing.coverage.previousRatio,
    },
    evidenceRefs: [...new Set([...evidence.evidenceRefs, derivedReference])].sort(),
  };
}

/**
 * Completes the evidence -> lesson -> governed strategy feedback loop.
 * Candidate observation and re-evaluation are derived outputs only: neither
 * changes collection authority nor automatically promotes a production playbook.
 *
 * When a Worker does not supply previous coverage, the loop links the immediately
 * preceding run for the same Source and feeds its measured coverage ratio into
 * deterministic lesson extraction. This lets recurring production runs detect a
 * real coverage regression without making Workers own durable history.
 */
export class SqliteAcquisitionLearningLoopRepository {
  private readonly learning: SqliteAcquisitionIntelligenceRepository;
  private readonly governance: SqliteAcquisitionStrategyGovernanceRepository;

  constructor(private readonly database: DatabaseSync) {
    this.learning = new SqliteAcquisitionIntelligenceRepository(database);
    this.governance = new SqliteAcquisitionStrategyGovernanceRepository(database);
  }

  getRunEvidence(runId: string): AcquisitionRunEvidence | null {
    return this.learning.getRunEvidence(runId);
  }

  recordLearningRun(evidence: AcquisitionRunEvidence): GovernedAcquisitionLearningRecordResult {
    const existing = this.learning.getRunEvidence(evidence.runId);
    const normalized = existing
      ? normalizeRawReplay(evidence, existing)
      : enrichPreviousCoverage(evidence, previousRunEvidence(this.database, evidence));
    const learned = this.learning.recordLearningRun(normalized);
    const governed = this.governance.observeLearningRun(learned.evidence, learned.lessons);
    return {
      ...learned,
      ...governed,
    };
  }
}
