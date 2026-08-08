import type {
  ExternalConnectorPort,
  ExternalConnectorRequest,
  ExternalConnectorResult,
} from "./external-connector-port";

export type HttpExternalConnectorOptions = {
  baseUrl: string;
  headers?: Record<string, string>;
  connectorId?: string;
};

export class HttpExternalConnector implements ExternalConnectorPort<unknown> {
  readonly connectorId: string;

  constructor(private readonly options: HttpExternalConnectorOptions) {
    this.connectorId = options.connectorId ?? "http-external-connector";
  }

  async fetch(request: ExternalConnectorRequest): Promise<ExternalConnectorResult<unknown>> {
    const url = new URL(this.options.baseUrl);
    url.searchParams.set("sourceId", request.sourceId);
    if (request.cursor) url.searchParams.set("cursor", request.cursor);
    if (request.limit !== undefined) url.searchParams.set("limit", String(request.limit));

    const response = await fetch(url, {
      headers: this.options.headers,
    });

    if (!response.ok) {
      throw new Error(`External connector request failed: ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (Array.isArray(payload)) {
      return { items: payload, fetchedAt: new Date().toISOString() };
    }

    if (typeof payload === "object" && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (Array.isArray(record.items)) {
        return {
          items: record.items,
          nextCursor: typeof record.nextCursor === "string" ? record.nextCursor : undefined,
          fetchedAt: new Date().toISOString(),
        };
      }
    }

    return { items: [payload], fetchedAt: new Date().toISOString() };
  }
}
