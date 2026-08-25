import type { DatabaseSync } from "node:sqlite";
import type { CaseEvidenceCollectionV1 } from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "@markorbit/persistence/case-candidate-intake";
import { SqliteCaseEvidenceCollectionRepository } from "@markorbit/persistence/case-evidence-collections";
import {
  MarkRegCaseEvidenceCollector,
  type AuthorizedMarkRegCaseSourceResolver,
  type MarkRegCaseSourceTransport,
} from "@markorbit/worker-runtime/markreg-case-evidence-collector";
import { getRegistryDatabase } from "./source-registry";

export class CaseEvidenceCollectionServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CaseEvidenceCollectionServiceError";
  }
}

export type CaseEvidenceCollectionServiceOptions = {
  resolver: AuthorizedMarkRegCaseSourceResolver;
  database?: DatabaseSync;
  transport?: MarkRegCaseSourceTransport;
  timeoutMs?: number;
  maxResponseBytes?: number;
  now?: () => Date;
};

/**
 * Knowledge-side composition boundary for K-CASE-004.
 *
 * The trusted resolver is mandatory and externally supplied. This service never
 * derives MarkReg credentials, decodes sourceRetrievalRef, or reads MarkReg
 * persistence directly. It only composes the durable candidate registry, exact
 * evidence snapshot repository and authenticated HTTP collector.
 */
export class CaseEvidenceCollectionService {
  private readonly candidates: SqliteCaseCandidateIntakeRepository;
  private readonly evidence: SqliteCaseEvidenceCollectionRepository;
  private readonly collector: MarkRegCaseEvidenceCollector;

  constructor(options: CaseEvidenceCollectionServiceOptions) {
    const database = options.database ?? getRegistryDatabase();
    this.candidates = new SqliteCaseCandidateIntakeRepository(database);
    this.evidence = new SqliteCaseEvidenceCollectionRepository(database);
    this.collector = new MarkRegCaseEvidenceCollector({
      resolver: options.resolver,
      evidenceSink: this.evidence,
      stateSink: this.candidates,
      ...(options.transport ? { transport: options.transport } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.maxResponseBytes !== undefined
        ? { maxResponseBytes: options.maxResponseBytes }
        : {}),
      ...(options.now ? { now: options.now } : {}),
    });
  }

  async collectCandidate(candidateId: string): Promise<CaseEvidenceCollectionV1> {
    const candidate = this.candidates.getCandidate(candidateId);
    if (!candidate) {
      throw new CaseEvidenceCollectionServiceError(
        "CASE_CANDIDATE_NOT_FOUND",
        `Case Candidate ${candidateId} does not exist`,
      );
    }

    const intake = this.candidates.getIntake(candidateId);
    if (intake?.collectionState === "COLLECTED" && intake.collectionRef) {
      const existing = this.evidence.getCollection(intake.collectionRef);
      if (!existing) {
        throw new CaseEvidenceCollectionServiceError(
          "CASE_EVIDENCE_COLLECTION_MISSING",
          `Collected Case Candidate ${candidateId} references missing evidence ${intake.collectionRef}`,
        );
      }
      return existing;
    }

    return this.collector.collect(candidate);
  }

  getCollection(collectionId: string): CaseEvidenceCollectionV1 | null {
    return this.evidence.getCollection(collectionId);
  }

  listCollectionsForCandidate(candidateId: string): CaseEvidenceCollectionV1[] {
    return this.evidence.listCollectionsForCandidate(candidateId);
  }
}

export function createCaseEvidenceCollectionService(
  options: Omit<CaseEvidenceCollectionServiceOptions, "database">,
): CaseEvidenceCollectionService {
  return new CaseEvidenceCollectionService(options);
}
