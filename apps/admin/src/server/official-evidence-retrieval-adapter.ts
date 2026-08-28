import type { RetrievalChunk, RetrievalDocument } from "@markorbit/contracts";
import type {
  OfficialEvidenceConflictStatus,
  OfficialEvidenceItem,
  OfficialEvidenceRole,
  OfficialEvidenceTemporalStatus,
} from "./official-evidence-admissibility";

export type OfficialEvidenceTemporalNormalization = {
  effectiveAt: string | null;
  expiresAt: string | null;
  conflictStatus: OfficialEvidenceConflictStatus;
};

export type BuildOfficialEvidenceFromRetrievalInput = {
  role: OfficialEvidenceRole;
  document: RetrievalDocument;
  chunk: RetrievalChunk;
  normalization?: OfficialEvidenceTemporalNormalization;
  asOf?: string;
};

function temporalStatus(
  normalization: OfficialEvidenceTemporalNormalization | undefined,
  asOf: string,
): OfficialEvidenceTemporalStatus {
  if (!normalization?.effectiveAt) return "UNRESOLVED";
  const effectiveAt = Date.parse(normalization.effectiveAt);
  const observedAt = Date.parse(asOf);
  if (Number.isNaN(effectiveAt) || Number.isNaN(observedAt) || effectiveAt > observedAt) {
    return "UNRESOLVED";
  }
  if (normalization.expiresAt !== null) {
    const expiresAt = Date.parse(normalization.expiresAt);
    if (Number.isNaN(expiresAt)) return "UNRESOLVED";
    if (expiresAt <= observedAt) return "STALE";
  }
  return "CURRENT";
}

function assertExactRetrievalLineage(document: RetrievalDocument, chunk: RetrievalChunk): void {
  if (
    chunk.documentId !== document.documentId ||
    chunk.stagingDocumentId !== document.stagingDocumentId ||
    chunk.artifactVersion !== document.artifactVersion
  ) {
    throw new Error("Retrieval document/chunk lineage mismatch");
  }
}

/**
 * Maps already-indexed retrieval evidence into the provider-neutral admissibility
 * contract. Publication time is deliberately not promoted to an effective date:
 * callers must supply separately evidenced temporal normalization.
 */
export function buildOfficialEvidenceFromRetrieval(
  input: BuildOfficialEvidenceFromRetrievalInput,
): OfficialEvidenceItem {
  assertExactRetrievalLineage(input.document, input.chunk);
  const asOf = input.asOf ?? new Date().toISOString();
  const normalization = input.normalization;

  return {
    role: input.role,
    sourceUri: input.document.sourceUri,
    documentId: input.document.documentId,
    documentContentSha256: input.document.contentSha256,
    chunkId: input.chunk.chunkId,
    chunkContentSha256: input.chunk.contentSha256,
    indexedAt: input.document.indexedAt,
    effectiveAt: normalization?.effectiveAt ?? null,
    expiresAt: normalization?.expiresAt ?? null,
    supersedesDocumentId: null,
    temporalStatus: temporalStatus(normalization, asOf),
    conflictStatus: normalization?.conflictStatus ?? "UNRESOLVED",
    supersessionStatus: input.document.isCurrent ? "CURRENT" : "SUPERSEDED",
  };
}
