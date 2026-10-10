import { assertTmclassSourceEvidenceV1, type TmclassSourceEvidenceV1 } from "@markorbit/contracts";
import type { TmclassHarPageCapture } from "./tmclass-har-extractor.js";

export type TmclassKnowledgeArtifactLineage = {
  workspaceId: string;
  sourceDefinitionId: string;
  collectionRunId: string;
  rawArtifactId: string;
  artifactVersion: number;
  canonicalUri: string;
  sha256: string;
};

export function tmclassEvidenceFromHarCapture(
  capture: TmclassHarPageCapture,
  lineage: TmclassKnowledgeArtifactLineage,
): TmclassSourceEvidenceV1 {
  if (lineage.canonicalUri !== capture.sourceUri || lineage.sha256 !== capture.responseSha256) {
    throw new Error("TMCLASS_HAR_RAW_ARTIFACT_LINEAGE_MISMATCH");
  }
  const evidence: TmclassSourceEvidenceV1 = {
    contractVersion: "TMCLASS_SOURCE_EVIDENCE_V1",
    objectType: "TMCLASS_SOURCE_EVIDENCE",
    sourceOwner: "MARKORBIT_KNOWLEDGE",
    sourceId: "EUIPO_TMCLASS",
    observedAt: capture.observedAt,
    evidence: {
      workspaceId: lineage.workspaceId,
      sourceDefinitionId: lineage.sourceDefinitionId,
      collectionRunId: lineage.collectionRunId,
      rawArtifactId: lineage.rawArtifactId,
      artifactVersion: lineage.artifactVersion,
      canonicalUri: lineage.canonicalUri,
      sourceUri: capture.sourceUri,
      sha256: lineage.sha256,
    },
    page: capture.page,
  };
  assertTmclassSourceEvidenceV1(evidence);
  return evidence;
}
