import type { AuthProviderPort } from "./auth-provider-port";
import type { RateLimitPolicyPort } from "./rate-limit-policy-port";

export type ConnectorRequest = {
  url: string;
  headers?: Record<string, string>;
};

export type ConnectorRequestContext = {
  connectorId: string;
};

export interface ConnectorRequestMiddleware {
  prepare(request: ConnectorRequest, context: ConnectorRequestContext): Promise<ConnectorRequest>;
}

export class DefaultConnectorRequestMiddleware implements ConnectorRequestMiddleware {
  constructor(
    private readonly auth: AuthProviderPort,
    private readonly rateLimit: RateLimitPolicyPort,
  ) {}

  async prepare(
    request: ConnectorRequest,
    context: ConnectorRequestContext,
  ): Promise<ConnectorRequest> {
    await this.rateLimit.acquire(context.connectorId);
    const headers = await this.auth.headers(context.connectorId);
    return { ...request, headers: { ...(request.headers ?? {}), ...headers } };
  }
}
