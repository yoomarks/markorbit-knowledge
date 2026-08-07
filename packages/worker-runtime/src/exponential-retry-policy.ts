import type { FailureContext, RetryDecision, RetryPolicyPort } from "./retry-policy-port";

export class ExponentialRetryPolicy implements RetryPolicyPort {
  constructor(
    private readonly maxAttempts = 5,
    private readonly baseDelayMs = 1000,
  ) {}

  decide(context: FailureContext): RetryDecision {
    if (!context.retryable || context.attempt >= this.maxAttempts) {
      return {
        retry: false,
        delayMs: 0,
        reason: "retry limit reached or failure is not retryable",
      };
    }

    return {
      retry: true,
      delayMs: this.baseDelayMs * 2 ** context.attempt,
      reason: "exponential backoff retry",
    };
  }
}
