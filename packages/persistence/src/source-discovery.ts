import type { DatabaseSync } from "node:sqlite";
import type {
  SourceDiscoveryMethod,
  SourceDiscoveryOrigin,
  SourceDiscoveryProvenance,
} from "@markorbit/contracts";
import {
  SqliteSourceDiscoveryRepository as BaseSqliteSourceDiscoveryRepository,
  type CandidateReviewDecision,
  type CandidateReview,
  type DiscoveryBatchRecord,
  type DiscoveryBatchStatus,
  type DiscoverySeedRecord,
  type DiscoverySeedStatus,
  type ReviewCandidateInput,
  type SourceCandidateListFilters,
  type SourceCandidateListResult,
  type SourceCandidateRecord,
  type SourceDiscoveryRepository,
} from "./source-discovery-registry";
import {
  DiscoveryBatchNotFoundError,
  SourceCandidateNotFoundError,
} from "./source-discovery-registry";
import { SqliteSourceRegistryV2Repository } from "./source-registry-v2-registry";

export type {
  CandidateReviewDecision,
  CandidateReview,
  DiscoveryBatchRecord,
  DiscoveryBatchStatus,
  DiscoverySeedRecord,
  DiscoverySeedStatus,
  ReviewCandidateInput,
  SourceCandidateListFilters,
  SourceCandidateListResult,
  SourceCandidateRecord,
  SourceDiscoveryRepository,
};
export { DiscoveryBatchNotFoundError, SourceCandidateNotFoundError };

function discoveryOriginFor(method: SourceDiscoveryMethod | undefined): SourceDiscoveryOrigin {
  switch (method) {
    case "HTML_LINK":
      return "EXTERNAL_LINK";
    case "SITEMAP":
      return "SITEMAP";
    case "FEED":
      return "RSS_FEED";
    case "CITATION":
      return "CITATION";
    case "SEED":
    case "MANUAL":
    case undefined:
      return "MANUAL_SEED";
  }
}

function discoveryEvidenceUrl(candidate: SourceCandidateRecord["candidate"]): string {
  if (candidate.discoveryMethod === "SEED" || candidate.discoveryMethod === "MANUAL") {
    return candidate.locator;
  }
  return candidate.discoveredFrom ?? candidate.locator;
}

/**
 * Production discovery repository.
 *
 * The existing discovery review ledger remains authoritative for candidate
 * lifecycle. This adapter adds only source-level structural discovery
 * provenance when a candidate is explicitly accepted into an already-created
 * SourceDefinition.
 */
export class SqliteSourceDiscoveryRepository extends BaseSqliteSourceDiscoveryRepository {
  private readonly sourceRegistryV2: SqliteSourceRegistryV2Repository;

  constructor(database: DatabaseSync, clock: () => Date = () => new Date()) {
    super(database, clock);
    this.sourceRegistryV2 = new SqliteSourceRegistryV2Repository(database, clock);
  }

  override reviewCandidate(
    candidateId: string,
    input: ReviewCandidateInput,
  ): SourceCandidateRecord {
    const reviewed = super.reviewCandidate(candidateId, input);
    if (input.decision !== "ACCEPTED" || !reviewed.review?.acceptedSourceId) {
      return reviewed;
    }

    const candidate = reviewed.candidate;
    const provenance: SourceDiscoveryProvenance = {
      origin: discoveryOriginFor(candidate.discoveryMethod),
      discoveredAt: candidate.discoveredAt,
      ...(candidate.discoveredFrom ? { discoveredFromUrl: candidate.discoveredFrom } : {}),
      evidenceUrl: discoveryEvidenceUrl(candidate),
    };
    this.sourceRegistryV2.recordDiscovery(reviewed.review.acceptedSourceId, provenance);
    return reviewed;
  }
}
