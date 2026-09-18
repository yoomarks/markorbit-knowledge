import type { CnipaEnrichedMarkdownInput } from "@markorbit/persistence/cnipa-detail-markdown-ingestion";
import type { CnipaDetailDocumentKind } from "@markorbit/persistence/cnipa-detail-enrichment-queue";
import {
  materializeCnipaDetailMarkdownEnrichmentBytes,
  type CnipaDetailMarkdownEnrichmentV1,
} from "@markorbit/worker-runtime/cnipa-detail-markdown-enrichment";

export type CnipaDetailMarkdownEvidence = {
  documentKind: CnipaDetailDocumentKind;
  sourceRecordId: string;
  detailCanonicalUri: string;
  listMarkdownArtifactId: string;
  listRawArtifactId: string;
  detailRawArtifactId: string;
  listMarkdownContent: Uint8Array;
  detailContent: Uint8Array;
};

export type CnipaDetailMarkdownPersisted = {
  artifactId: string;
  sha256: string;
};

export type CnipaDetailMarkdownSink = (
  input: CnipaEnrichedMarkdownInput,
) => Promise<CnipaDetailMarkdownPersisted>;

export type CnipaDetailMarkdownEnrichmentResult =
  | {
      status: "SKIPPED_NO_MATERIAL_DELTA";
      enrichment: null;
      persisted: null;
    }
  | {
      status: "CREATED";
      enrichment: CnipaDetailMarkdownEnrichmentV1;
      persisted: CnipaDetailMarkdownPersisted;
    };

export async function enrichCnipaDetailMarkdown(input: {
  evidence: CnipaDetailMarkdownEvidence;
  sink: CnipaDetailMarkdownSink;
}): Promise<CnipaDetailMarkdownEnrichmentResult> {
  const enrichment = materializeCnipaDetailMarkdownEnrichmentBytes({
    documentKind: input.evidence.documentKind,
    sourceRecordId: input.evidence.sourceRecordId,
    listMarkdownContent: input.evidence.listMarkdownContent,
    detailContent: input.evidence.detailContent,
  });
  if (!enrichment) {
    return {
      status: "SKIPPED_NO_MATERIAL_DELTA",
      enrichment: null,
      persisted: null,
    };
  }

  const persisted = await input.sink({
    documentKind: input.evidence.documentKind,
    sourceRecordId: input.evidence.sourceRecordId,
    detailCanonicalUri: input.evidence.detailCanonicalUri,
    logicalDocumentUri: enrichment.logicalDocumentUri,
    listMarkdownArtifactId: input.evidence.listMarkdownArtifactId,
    listRawArtifactId: input.evidence.listRawArtifactId,
    detailRawArtifactId: input.evidence.detailRawArtifactId,
    markdownContent: new TextEncoder().encode(enrichment.markdownBody),
  });

  return {
    status: "CREATED",
    enrichment,
    persisted,
  };
}
