import type { CnipaAuthenticatedHttpSessionExecutorFactory } from "./cnipa-artifact-acquirer";
import type {
  CnipaGazetteJsonTransport,
  CnipaGazetteJsonTransportResponse,
} from "./cnipa-gazette-page-acquirer";

export class CnipaGazetteAuthenticatedTransport implements CnipaGazetteJsonTransport {
  private session:
    Awaited<ReturnType<CnipaAuthenticatedHttpSessionExecutorFactory["create"]>> | undefined;

  constructor(private readonly factory: CnipaAuthenticatedHttpSessionExecutorFactory) {}

  private async executor() {
    this.session ??= await this.factory.create();
    return this.session;
  }

  async postJson(input: {
    path: string;
    body: Readonly<Record<string, string | number>>;
  }): Promise<CnipaGazetteJsonTransportResponse> {
    const response = await (
      await this.executor()
    ).execute({
      method: "POST",
      path: input.path,
      jsonBody: input.body,
    });
    return {
      httpStatus: response.status,
      rawBody: new Uint8Array(response.body),
      observedAt: response.observedAt,
      contentType: response.contentType,
    };
  }

  async close(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    await session?.close();
  }
}

export function cnipaGazetteAuthenticatedTransportDescriptor() {
  return Object.freeze({
    transport: "CNIPA_AUTHENTICATED_BROWSER_SESSION" as const,
    credentialsCrossPort: false as const,
    requestMethod: "POST" as const,
    responseBytesSanitized: true as const,
    persistentSessionClosedAfterJob: true as const,
  });
}
