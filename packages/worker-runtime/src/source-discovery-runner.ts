import type { SourceCandidate, SourceDiscoveryBatch } from "@markorbit/contracts";

export type SourceDiscoveryProvider = {
  discover(input: SourceDiscoveryBatch): Promise<SourceCandidate[]>;
};

/**
 * @deprecated Discovery candidates must stay structural-only in Knowledge.
 *
 * Kept as an identity adapter for compatibility with callers that imported the
 * previous helper. Semantic topic/relevance/priority inference belongs in Core
 * and must not be added to Knowledge discovery candidates.
 */
export function enrichDiscoveryCandidate(candidate: SourceCandidate): SourceCandidate {
  return candidate;
}

export class SourceDiscoveryRunner {
  constructor(private readonly provider: SourceDiscoveryProvider) {}

  async run(batch: SourceDiscoveryBatch): Promise<SourceCandidate[]> {
    // Knowledge discovery is structural-only. The provider may report observed
    // fetch/link/sitemap metadata, but semantic authority/content inference and
    // candidate relevance scoring belong in Core.
    return this.provider.discover(batch);
  }
}
