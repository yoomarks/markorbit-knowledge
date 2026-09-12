import type {
  CaseCandidateIntakeV1,
  CaseCandidateV1,
  CaseDossierV1,
  CaseEvidenceCollectionV1,
} from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "@markorbit/persistence/case-candidate-intake";
import { SqliteCaseDossierRepository } from "@markorbit/persistence/case-dossiers";
import { SqliteCaseEvidenceCollectionRepository } from "@markorbit/persistence/case-evidence-collections";
import { getRegistryDatabase } from "./source-registry";

export type CaseEvidenceInventoryItem = {
  candidate: CaseCandidateV1;
  intake: CaseCandidateIntakeV1;
  collections: CaseEvidenceCollectionV1[];
  dossiers: CaseDossierV1[];
};

export type CaseEvidenceInventoryView = {
  items: CaseEvidenceInventoryItem[];
  summary: {
    total: number;
    pending: number;
    waitingSource: number;
    collected: number;
    evidenceCollections: number;
    dossiers: number;
  };
};
export function getCaseEvidenceInventoryView(
  workspaceId: string,
  limit = 100,
): CaseEvidenceInventoryView {
  const database = getRegistryDatabase();
  const candidates = new SqliteCaseCandidateIntakeRepository(database);
  const evidence = new SqliteCaseEvidenceCollectionRepository(database);
  const dossiers = new SqliteCaseDossierRepository(database);

  const items = candidates.listAllForWorkspace(workspaceId, limit).map(({ candidate, intake }) => ({
    candidate,
    intake,
    collections: evidence.listCollectionsForCandidate(candidate.candidateId),
    dossiers: dossiers.listDossiersForCandidate(candidate.candidateId),
  }));

  return {
    items,
    summary: {
      total: items.length,
      pending: items.filter((item) => item.intake.collectionState === "PENDING").length,
      waitingSource: items.filter((item) => item.intake.collectionState === "WAITING_SOURCE")
        .length,
      collected: items.filter((item) => item.intake.collectionState === "COLLECTED").length,
      evidenceCollections: items.reduce((sum, item) => sum + item.collections.length, 0),
      dossiers: items.reduce((sum, item) => sum + item.dossiers.length, 0),
    },
  };
}
