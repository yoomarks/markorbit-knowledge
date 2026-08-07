import type { ExternalConnectorPort } from "./external-connector-port";

export type HttpExternalConnectorOptions = {
  baseUrl: string;
  headers?: Record<string, string>;
};

export class HttpExternalConnector implements ExternalConnectorPort {
  constructor(private readonly options: HttpExternalConnectorOptions) {}

  async fetch(cursor?: string): Promise<unknown> {
    const url = new URL(this.options.baseUrl);
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: this.options.headers,
    });

    if (!response.ok) {
      throw new Error(`External connector request failed: ${response.status}`);
    }

    return response.json();
  }
}
