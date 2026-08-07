export type SourceCandidateStatus =
  | "DISCOVERED"
  | "REVIEWED"
  | "ACCEPTED"
  | "REJECTED";

export type SourceDiscoveryMethod =
  | "SEED"
  | "HTML_LINK"
  | "SITEMAP"
  | "FEED"
  | "CITATION"
  | "MANUAL";

export interface SourceDiscoverySeed {
  seedId: string;
  locator: string;
  metadata?: Record<string, unknown>;
}

export interface SourceDiscoveryConstraints {
  maxDepth?: number;
  maxCandidates?: number;
  sameHostOnly?: boolean;
  allowedHosts?: string[];
  deniedUrlPatterns?: string[];
}

export interface SourceDiscoveryBatch {
  batchId: string;
  seeds: SourceDiscoverySeed[];
  createdAt: string;
  constraints?: SourceDiscoveryConstraints;
}

export interface SourceCandidate {
  candidateId: string;
  locator: string;
  discoveredAt: string;
  status: SourceCandidateStatus;
  discoveredFrom?: string;
  discoveryMethod?: SourceDiscoveryMethod;
  depth?: number;
  metadata?: Record<string, unknown>;
}

/**
 * A review-oriented batch of candidates. This remains separate from the
 * SourceDiscoveryBatch execution request so candidate review does not mutate
 * discovery intent.
 */
export interface DiscoveryBatch {
  batchId: string;
  candidates: SourceCandidate[];
  createdAt: string;
}
