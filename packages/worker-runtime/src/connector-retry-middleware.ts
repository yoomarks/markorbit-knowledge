import type { RetryPolicyPort } from "./retry-policy-port";

export type ConnectorFailure = {
  code: string;
  retryable: boolean;
  jobId?: string;
};

export interface ConnectorRetryMiddleware {
  shouldRetry(failure: ConnectorFailure, attempt: number): boolean;
}

export class DefaultConnectorRetryMiddleware implements ConnectorRetryMiddleware {
  constructor(private readonly retryPolicy: RetryPolicyPort) {}

  shouldRetry(failure: ConnectorFailure, attempt: number): boolean {
    return this.retryPolicy.decide({
      jobId: failure.jobId ?? "connector-request",
      attempt,
      errorCode: failure.code,
      retryable: failure.retryable,
    }).retry;
  }
}
