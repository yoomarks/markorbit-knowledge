export type ArtifactUploadRequest = {
  artifactId: string;
  sourceId: string;
  contentHash: string;
  contentLength: number;
  mimeType: string;
  provenance: Record<string, unknown>;
};

export type ArtifactIngestionResult = {
  receiptId: string;
  artifactId: string;
  status: "ACCEPTED" | "VERIFIED" | "FINALIZED" | "FAILED";
};

/**
 * Runtime boundary between connectors and artifact persistence.
 * Worker runtime depends on this port only.
 */
export interface ArtifactIngestionPort {
  ingest(request: ArtifactUploadRequest): Promise<ArtifactIngestionResult>;
}
