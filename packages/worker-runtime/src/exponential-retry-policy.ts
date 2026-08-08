import type { FailureContext, RetryDecision, RetryPolicyPort } from "./retry-policy-port";

export type ExponentialRetryPolicyOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
};

export class ExponentialRetryPolicy implements RetryPolicyPort {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(
    maxAttemptsOrOptions: number | ExponentialRetryPolicyOptions = 5,
    baseDelayMs = 1000,
  ) {
    if (typeof maxAttemptsOrOptions === "number") {
      this.maxAttempts = maxAttemptsOrOptions;
      this.baseDelayMs = baseDelayMs;
    } else {
      this.maxAttempts = maxAttemptsOrOptions.maxAttempts ?? 5;
      this.baseDelayMs = maxAttemptsOrOptions.baseDelayMs ?? 1000;
    }
  }

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

  evaluate(input: {
    attempt: number;
    failure: { code: string; retryable: boolean };
    jobId?: string;
  }): RetryDecision {
    return this.decide({
      jobId: input.jobId ?? "legacy-retry-evaluation",
      attempt: input.attempt,
      errorCode: input.failure.code,
      retryable: input.failure.retryable,
    });
  }
}
