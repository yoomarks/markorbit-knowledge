/**
 * Core -> Knowledge Discovery Proposal V1
 *
 * Core may use semantic reasoning to suggest a source surface. Knowledge must
 * treat the suggestion as an untrusted acquisition candidate: it records the
 * proposal, performs no semantic interpretation, does not fetch the proposed
 * URL before review, and reuses the normal discovery review/promotion path.
 */
export const CORE_DISCOVERY_PROPOSAL_VERSION = "1.0" as const;
export const CORE_DISCOVERY_PROPOSER = "MARKORBIT_CORE" as const;

export interface CoreDiscoveryProposalV1 {
  version: typeof CORE_DISCOVERY_PROPOSAL_VERSION;
  proposalId: string;
  proposedBy: typeof CORE_DISCOVERY_PROPOSER;
  proposedAt: string;
  locator: string;
  proposedFromSourceId?: string;
  evidenceUrl?: string;
  /** Opaque Core-side reference only. Knowledge must not interpret its meaning. */
  opaqueContextRef?: string;
}

export interface CoreDiscoveryProposalReceiptV1 {
  version: typeof CORE_DISCOVERY_PROPOSAL_VERSION;
  proposalId: string;
  batchId: string;
  candidateId: string;
  candidateStatus: "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";
  fetchedBeforeReview: false;
}
