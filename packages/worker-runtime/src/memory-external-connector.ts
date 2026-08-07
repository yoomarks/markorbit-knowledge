import type {
  ExternalConnectorPort,
  ExternalConnectorRequest,
  ExternalConnectorResult,
} from "./external-connector-port";

export class MemoryExternalConnector<T = unknown>
  implements ExternalConnectorPort<T>
{
  readonly connectorId = "memory-external-connector";

  constructor(private readonly items: T[] = []) {}

  async fetch(
    request: ExternalConnectorRequest,
  ): Promise<ExternalConnectorResult<T>> {
    const limit = request.limit ?? this.items.length;
    const start = Number(request.cursor ?? 0);

    return {
      items: this.items.slice(start, start + limit),
      nextCursor:
        start + limit < this.items.length
          ? String(start + limit)
          : undefined,
      fetchedAt: new Date().toISOString(),
    };
  }
}
