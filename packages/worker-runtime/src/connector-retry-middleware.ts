import type { RetryPolicyPort } from "./retry-policy-port";

export type ConnectorFailure = {
  code: string;
  retryable: boolean;
};

export interface ConnectorRetryMiddleware {
  shouldRetry(failure: ConnectorFailure, attempt: number): boolean;
}

export class DefaultConnectorRetryMiddleware implements ConnectorRetryMiddleware {
  constructor(private readonly retryPolicy: RetryPolicyPort) {}

  shouldRetry(failure: ConnectorFailure, attempt: number): boolean {
    if (!failure.retryable) return false;
    return this.retryPolicy.shouldRetry(attempt);
  }
}
