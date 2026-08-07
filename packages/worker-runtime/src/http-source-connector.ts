import type { SourceConnectorPort, SourceFetchRequest, SourceFetchResult } from "./source-connector-port";

/**
 * Basic HTTP source connector.
 * This connector only acquires external content metadata and leaves artifact
 * ownership to the ingestion boundary.
 */
export class HttpSourceConnector implements SourceConnectorPort {
  async fetch(request: SourceFetchRequest): Promise<SourceFetchResult> {
    const response = await globalThis.fetch(request.targetUri);

    if (!response.ok) {
      throw new Error(`Source fetch failed: ${response.status}`);
    }

    return {
      sourceId: request.sourceId,
      targetUri: request.targetUri,
      artifactCandidates: [
        {
          uri: request.targetUri,
          contentType: response.headers.get("content-type") ?? undefined,
          metadata: {
            status: response.status,
          },
        },
      ],
    };
  }
}
