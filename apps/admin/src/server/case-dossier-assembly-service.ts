import type { DatabaseSync } from "node:sqlite";
import type { CaseDossierV1 } from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "@markorbit/persistence/case-candidate-intake";
import { SqliteCaseDossierRepository } from "@markorbit/persistence/case-dossiers";
import { SqliteCaseEvidenceCollectionRepository } from "@markorbit/persistence/case-evidence-collections";
import { assembleCaseDossierV1 } from "@markorbit/worker-runtime/case-dossier-assembler";
import { getRegistryDatabase } from "./source-registry";

export class CaseDossierAssemblyServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CaseDossierAssemblyServiceError";
  }
}

/**
 * K-CASE-006 composition boundary.
 *
 * This service has no MarkReg transport or credentials. It only assembles an
 * objective Dossier from a Candidate whose immutable evidence collection has
 * already completed under K-CASE-004, then persists the validated result.
 */
export class CaseDossierAssemblyService {
  private readonly candidates: SqliteCaseCandidateIntakeRepository;
  private readonly evidence: SqliteCaseEvidenceCollectionRepository;
  private readonly dossiers: SqliteCaseDossierRepository;

  constructor(database: DatabaseSync = getRegistryDatabase()) {
    this.candidates = new SqliteCaseCandidateIntakeRepository(database);
    this.evidence = new SqliteCaseEvidenceCollectionRepository(database);
    this.dossiers = new SqliteCaseDossierRepository(database);
  }

  assembleCandidate(candidateId: string): CaseDossierV1 {
    const candidate = this.candidates.getCandidate(candidateId);
    if (!candidate) {
      throw new CaseDossierAssemblyServiceError(
        "CASE_CANDIDATE_NOT_FOUND",
        `Case Candidate ${candidateId} does not exist`,
      );
    }
    const intake = this.candidates.getIntake(candidateId);
    if (!intake || intake.collectionState !== "COLLECTED" || !intake.collectionRef) {
      throw new CaseDossierAssemblyServiceError(
        "CASE_EVIDENCE_NOT_COLLECTED",
        `Case Candidate ${candidateId} does not have a completed evidence collection`,
      );
    }
    const collection = this.evidence.getCollection(intake.collectionRef);
    if (!collection) {
      throw new CaseDossierAssemblyServiceError(
        "CASE_EVIDENCE_COLLECTION_MISSING",
        `Case Candidate ${candidateId} references missing evidence ${intake.collectionRef}`,
      );
    }

    const assembled = assembleCaseDossierV1(candidate, collection);
    return this.dossiers.saveDossier(assembled).dossier;
  }

  getDossier(dossierId: string, version?: number): CaseDossierV1 | null {
    return this.dossiers.getDossier(dossierId, version);
  }

  listDossiersForCandidate(candidateId: string): CaseDossierV1[] {
    return this.dossiers.listDossiersForCandidate(candidateId);
  }
}

export function createCaseDossierAssemblyService(): CaseDossierAssemblyService {
  return new CaseDossierAssemblyService();
}
