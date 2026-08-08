import type { RetryDecision } from "./retry-policy-port";

export interface FailureRecoveryContext {
  jobId: string;
  attempt: number;
  errorCode: string;
  errorMessage: string;
}

export interface FailureRecoveryResult {
  action: "RETRY" | "STOP";
  decision?: RetryDecision;
}

export interface FailureRecoveryOrchestrator {
  recover(context: FailureRecoveryContext): Promise<FailureRecoveryResult>;
}

export class DefaultFailureRecoveryOrchestrator implements FailureRecoveryOrchestrator {
  constructor(private readonly retryPolicy: { decide(attempt: number): RetryDecision }) {}

  async recover(context: FailureRecoveryContext): Promise<FailureRecoveryResult> {
    const decision = this.retryPolicy.decide(context.attempt);
    return decision.retry ? { action: "RETRY", decision } : { action: "STOP", decision };
  }
}
