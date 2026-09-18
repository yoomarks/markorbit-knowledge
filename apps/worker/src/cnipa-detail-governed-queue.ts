import type {
  ClaimGovernedCnipaDetailResult,
  PersistCnipaDetailAttemptTransitionInput,
  SqliteCnipaDetailEnrichmentQueueRepository,
} from "@markorbit/persistence/cnipa-detail-enrichment-queue";
import type { CnipaDetailQueuePort } from "./cnipa-detail-worker";

export type CnipaDetailLaneGovernancePolicy = {
  budgetWindowKey: string;
  minIntervalMs: number;
  maxRequestsPerBudgetWindow: number;
};

export type GovernedCnipaDetailQueuePort = CnipaDetailQueuePort & {
  lastClaimDecision(): ClaimGovernedCnipaDetailResult | null;
};

export function createGovernedCnipaDetailQueuePort(input: {
  repository: SqliteCnipaDetailEnrichmentQueueRepository;
  policy: CnipaDetailLaneGovernancePolicy;
}): GovernedCnipaDetailQueuePort {
  let lastDecision: ClaimGovernedCnipaDetailResult | null = null;

  return {
    claimNext(claim) {
      const decision = input.repository.claimNextGoverned({
        ...claim,
        budgetWindowKey: input.policy.budgetWindowKey,
        minIntervalMs: input.policy.minIntervalMs,
        maxRequestsPerBudgetWindow: input.policy.maxRequestsPerBudgetWindow,
      });
      lastDecision = decision;
      return decision.status === "CLAIMED" ? decision.record : null;
    },
    persistAttemptTransition(transition: PersistCnipaDetailAttemptTransitionInput) {
      return input.repository.persistAttemptTransition(transition);
    },
    lastClaimDecision() {
      return lastDecision;
    },
  };
}
