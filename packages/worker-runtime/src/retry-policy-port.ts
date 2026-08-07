export type RetryDecision = {
  retry: boolean;
  delayMs: number;
  reason: string;
};

export type FailureContext = {
  jobId: string;
  attempt: number;
  errorCode: string;
  retryable: boolean;
};

export interface RetryPolicyPort {
  decide(context: FailureContext): RetryDecision;
}
