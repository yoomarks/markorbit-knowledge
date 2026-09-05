import type { DocumentChangeEvidence } from "@markorbit/contracts";

export const EVIDENCE_INSPECTOR_SECTIONS = [
  { id: "inspector-content", label: "Content" },
  { id: "evidence-change-review", label: "Changes" },
  { id: "inspector-provenance", label: "Provenance" },
  { id: "inspector-relations", label: "Relations" },
  { id: "inspector-history", label: "History" },
] as const;

export type EvidenceHistoryRow = {
  evidenceId: string;
  sequence: number;
  changeKind: DocumentChangeEvidence["changeKind"];
  observedAt: string;
  documentId: string;
  stagingDocumentId: string;
  rawArtifactId: string;
  artifactVersion: number;
  sourceUri: string;
};

export function buildEvidenceHistoryRows(evidence: DocumentChangeEvidence[]): EvidenceHistoryRow[] {
  return [...evidence]
    .sort((left, right) => right.sequence - left.sequence)
    .map((item) => ({
      evidenceId: item.id,
      sequence: item.sequence,
      changeKind: item.changeKind,
      observedAt: item.observedAt,
      documentId: item.documentId,
      stagingDocumentId: item.after.stagingDocumentId,
      rawArtifactId: item.after.rawArtifactId,
      artifactVersion: item.after.artifactVersion,
      sourceUri: item.after.sourceUri,
    }));
}
