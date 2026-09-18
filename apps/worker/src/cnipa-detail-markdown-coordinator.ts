import type { CnipaKnowledgeDocumentSeedV1 } from "@markorbit/worker-runtime/cnipa-list-materializer";
import {
  enrichCnipaMarkdownFromDetail,
  type CnipaDetailMarkdownDecisionV1,
  type CnipaDetailMarkdownEnrichmentV1,
} from "@markorbit/worker-runtime/cnipa-detail-markdown-enrichment";
import type { CnipaEnrichedMarkdownIngestionResult } from "./cnipa-enriched-markdown-ingestion";

export type CnipaDetailMarkdownPersistenceSink = (
  enrichment: CnipaDetailMarkdownEnrichmentV1,
) => Promise<CnipaEnrichedMarkdownIngestionResult>;

export type CnipaDetailMarkdownCoordinatorResult =
  | {
      status: "SKIPPED_NO_MATERIAL_DELTA";
      decision: Extract<CnipaDetailMarkdownDecisionV1, { material: false }>;
      persisted: null;
    }
  | {
      status: "CREATED";
      decision: Extract<CnipaDetailMarkdownDecisionV1, { material: true }>;
      persisted: CnipaEnrichedMarkdownIngestionResult;
    };

export async function coordinateCnipaDetailMarkdownEnrichment(input: {
  documentSeed: CnipaKnowledgeDocumentSeedV1;
  listRawArtifactId: string;
  listMarkdownArtifactId: string;
  detailRawArtifactId: string;
  detailBody: Uint8Array;
  sink: CnipaDetailMarkdownPersistenceSink;
}): Promise<CnipaDetailMarkdownCoordinatorResult> {
  const decision = enrichCnipaMarkdownFromDetail({
    documentSeed: input.documentSeed,
    listArtifactId: input.listRawArtifactId,
    listMarkdownArtifactId: input.listMarkdownArtifactId,
    detailArtifactId: input.detailRawArtifactId,
    detailBody: input.detailBody,
  });

  if (!decision.material) {
    return {
      status: "SKIPPED_NO_MATERIAL_DELTA",
      decision,
      persisted: null,
    };
  }

  const persisted = await input.sink(decision.enrichment);
  return {
    status: "CREATED",
    decision,
    persisted,
  };
}
