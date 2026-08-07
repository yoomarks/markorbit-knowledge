export type SourceCandidateStatus =
  | "DISCOVERED"
  | "REVIEWED"
  | "ACCEPTED"
  | "REJECTED";

export interface SourceCandidate {
  candidateId: string;
  locator: string;
  discoveredAt: string;
  status: SourceCandidateStatus;
  metadata?: Record<string, unknown>;
}

export interface DiscoveryBatch {
  batchId: string;
  candidates: SourceCandidate[];
  createdAt: string;
}
