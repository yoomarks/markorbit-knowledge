import type {
  SourceCandidate,
  SourceDiscoveryBatch,
  SourceDiscoveryConstraints,
  SourceDiscoverySeed,
} from "@markorbit/contracts";
import { HttpWebsiteDiscoveryProvider } from "./http-website-discovery-provider";
import type { SourceDiscoveryProvider } from "./source-discovery-runner";

const DEFAULT_TOTAL_CANDIDATES = 250;
const DEFAULT_TOTAL_FETCHES = 50;
const DEFAULT_MAX_EXTERNAL_CANDIDATES = 25;
const MAX_EXTERNAL_CANDIDATES = 250;
const DEFAULT_EXTERNAL_SCAN_CANDIDATES = 500;
const EXTERNAL_FETCHES_PER_SEED = 2;

function boundedPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function canonicalOrigin(locator: string): string | null {
  try {
    const url = new URL(locator);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

function externalCandidate(
  candidate: SourceCandidate,
  seed: SourceDiscoverySeed,
): SourceCandidate | null {
  const candidateOrigin = canonicalOrigin(candidate.locator);
  const seedOrigin = canonicalOrigin(seed.locator);
  if (!candidateOrigin || !seedOrigin || candidateOrigin === seedOrigin) return null;

  const metadata = { ...(candidate.metadata ?? {}) };
  // The originating site's robots policy says nothing about an external host.
  // Remove that field rather than carrying a structurally false observation.
  delete metadata.robotsAllowed;

  return {
    ...candidate,
    metadata: {
      ...metadata,
      externalToSeed: true,
      discoveryScope: "EXTERNAL_ONE_HOP",
      seedOrigin,
      fetchEligibleInOriginatingRun: false,
    },
  };
}

function withCandidateBudget(
  constraints: SourceDiscoveryConstraints | undefined,
  maxCandidates: number,
  maxFetches: number,
): SourceDiscoveryConstraints {
  return {
    ...(constraints ?? {}),
    maxCandidates,
    maxFetches,
  };
}

/**
 * Adds a bounded, one-hop structural source expansion pass to normal website
 * discovery.
 *
 * The primary provider remains same-host and may crawl to the operator's
 * configured depth. When `discoverExternalLinks` is enabled, this wrapper
 * reserves a small part of the same candidate/fetch budgets for a second pass
 * that reads only the originating page (plus robots.txt) and emits cross-origin
 * links as review candidates. External targets are never fetched during the
 * originating run.
 */
export class ExpandingWebsiteDiscoveryProvider implements SourceDiscoveryProvider {
  constructor(
    private readonly primary: SourceDiscoveryProvider = new HttpWebsiteDiscoveryProvider(),
    private readonly externalProbe: SourceDiscoveryProvider = new HttpWebsiteDiscoveryProvider(),
  ) {}

  async discover(input: SourceDiscoveryBatch): Promise<SourceCandidate[]> {
    const constraints = input.constraints ?? {};
    if (!constraints.discoverExternalLinks || input.seeds.length === 0) {
      return this.primary.discover(input);
    }

    const totalCandidateBudget = boundedPositiveInteger(
      constraints.maxCandidates,
      DEFAULT_TOTAL_CANDIDATES,
    );
    const requestedExternalBudget = Math.min(
      MAX_EXTERNAL_CANDIDATES,
      boundedPositiveInteger(constraints.maxExternalCandidates, DEFAULT_MAX_EXTERNAL_CANDIDATES),
    );
    const externalCandidateBudget = Math.min(
      requestedExternalBudget,
      Math.max(0, totalCandidateBudget - 1),
    );

    const totalFetchBudget = boundedPositiveInteger(constraints.maxFetches, DEFAULT_TOTAL_FETCHES);
    const desiredExternalFetchBudget = input.seeds.length * EXTERNAL_FETCHES_PER_SEED;
    const externalFetchBudget =
      totalFetchBudget > desiredExternalFetchBudget
        ? desiredExternalFetchBudget
        : Math.max(0, totalFetchBudget - 1);

    if (externalCandidateBudget === 0 || externalFetchBudget < EXTERNAL_FETCHES_PER_SEED) {
      return this.primary.discover(input);
    }

    const primaryCandidateBudget = totalCandidateBudget - externalCandidateBudget;
    const primaryFetchBudget = totalFetchBudget - externalFetchBudget;
    const primary = await this.primary.discover({
      ...input,
      constraints: withCandidateBudget(
        constraints,
        primaryCandidateBudget,
        Math.max(1, primaryFetchBudget),
      ),
    });

    const seen = new Set(primary.map((candidate) => candidate.locator));
    const external: SourceCandidate[] = [];
    const fetchesPerSeed = Math.floor(externalFetchBudget / input.seeds.length);

    for (const seed of input.seeds) {
      if (external.length >= externalCandidateBudget || fetchesPerSeed < EXTERNAL_FETCHES_PER_SEED) {
        break;
      }

      const probed = await this.externalProbe.discover({
        ...input,
        seeds: [seed],
        constraints: {
          ...constraints,
          maxDepth: 1,
          maxCandidates: Math.max(DEFAULT_EXTERNAL_SCAN_CANDIDATES, externalCandidateBudget * 4),
          maxFetches: EXTERNAL_FETCHES_PER_SEED,
          sameHostOnly: false,
          discoverSitemaps: false,
          discoverExternalLinks: false,
          maxExternalCandidates: undefined,
        },
      });

      for (const candidate of probed) {
        if (external.length >= externalCandidateBudget) break;
        if (seen.has(candidate.locator)) continue;
        const expanded = externalCandidate(candidate, seed);
        if (!expanded) continue;
        seen.add(expanded.locator);
        external.push(expanded);
      }
    }

    return [...primary, ...external].slice(0, totalCandidateBudget);
  }
}
