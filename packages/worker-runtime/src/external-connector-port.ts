export type ExternalConnectorRequest = {
  sourceId: string;
  cursor?: string;
  limit?: number;
};

export type ExternalConnectorResult<T = unknown> = {
  items: T[];
  nextCursor?: string;
  fetchedAt: string;
};

export interface ExternalConnectorPort<T = unknown> {
  readonly connectorId: string;
  fetch(request: ExternalConnectorRequest): Promise<ExternalConnectorResult<T>>;
}
