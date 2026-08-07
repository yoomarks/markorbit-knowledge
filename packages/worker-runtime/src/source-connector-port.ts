export type SourceFetchRequest = {
  sourceId: string;
  targetUri: string;
  metadata?: Record<string, unknown>;
};

export type SourceFetchResult = {
  sourceId: string;
  targetUri: string;
  artifactCandidates: Array<{
    uri: string;
    contentType?: string;
    metadata?: Record<string, unknown>;
  }>;
};

/**
 * Runtime boundary for source acquisition connectors.
 * Connectors discover/fetch external material; they do not own artifact state.
 */
export interface SourceConnectorPort {
  fetch(request: SourceFetchRequest): Promise<SourceFetchResult>;
}
