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

/**
 * Completes the evidence -> lesson -> governed strategy feedback loop.
 * Candidate observation and re-evaluation are derived outputs only: neither
 * changes collection authority nor automatically promotes a production playbook.
 */
export class SqliteAcquisitionLearningLoopRepository {
  private readonly learning: SqliteAcquisitionIntelligenceRepository;
  private readonly governance: SqliteAcquisitionStrategyGovernanceRepository;

  constructor(database: DatabaseSync) {
    this.learning = new SqliteAcquisitionIntelligenceRepository(database);
    this.governance = new SqliteAcquisitionStrategyGovernanceRepository(database);
  }

  getRunEvidence(runId: string): AcquisitionRunEvidence | null {
    return this.learning.getRunEvidence(runId);
  }

  recordLearningRun(evidence: AcquisitionRunEvidence): GovernedAcquisitionLearningRecordResult {
    const learned = this.learning.recordLearningRun(evidence);
    const governed = this.governance.observeLearningRun(learned.evidence, learned.lessons);
    return {
      ...learned,
      ...governed,
    };
  }
}
