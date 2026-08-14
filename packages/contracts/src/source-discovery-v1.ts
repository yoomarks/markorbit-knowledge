export type SourceCandidateStatus = "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";

export type SourceDiscoveryMethod =
  | "SEED"
  | "HTML_LINK"
  | "SITEMAP"
  | "FEED"
  | "CITATION"
  | "MANUAL"
  | "RELATED_SOURCE"
  | "CORE_PROPOSAL";

export interface SourceDiscoverySeed {
  seedId: string;
  locator: string;
  metadata?: Record<string, unknown>;
}

/**
 * Structural lineage for a governed discovery batch.
 *
 * generation identifies the registered source generation being traversed:
 * 0 is a root/manual seed source, 1 is a source discovered from generation 0,
 * and so on. These fields describe acquisition lineage only; they do not imply
 * semantic relatedness, authority, relevance or content meaning.
 */
export interface SourceDiscoveryLineage {
  generation: number;
  parentBatchId?: string;
  parentSourceId?: string;
  rootSourceId?: string;
}

/**
 * Operator-controlled bounds for one discovery run.
 *
 * maxCandidates bounds what may enter the human review queue, while maxFetches
 * independently bounds network work. External-link discovery is a one-hop
 * structural expansion only: external URLs may enter the candidate queue when
 * explicitly enabled, but they are never fetched as part of the originating
 * website run. maxExternalCandidates independently caps that expansion.
 * maxExpansionGeneration is the hard source-network generation ceiling.
 */
export interface SourceDiscoveryConstraints {
  maxDepth?: number;
  maxCandidates?: number;
  maxFetches?: number;
  sameHostOnly?: boolean;
  allowedHosts?: string[];
  deniedUrlPatterns?: string[];
  respectRobots?: boolean;
  discoverSitemaps?: boolean;
  discoverExternalLinks?: boolean;
  maxExternalCandidates?: number;
  maxExpansionGeneration?: number;
}

export interface SourceDiscoveryBatch {
  batchId: string;
  seeds: SourceDiscoverySeed[];
  createdAt: string;
  constraints?: SourceDiscoveryConstraints;
  lineage?: SourceDiscoveryLineage;
}

export interface SourceCandidate {
  candidateId: string;
  locator: string;
  title?: string;
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
