import { createHash } from "node:crypto";
import type {
  SourceCandidate,
  SourceDiscoveryBatch,
  SourceDiscoverySeed,
} from "@markorbit/contracts";
import type { SourceDiscoveryProvider } from "./source-discovery-runner";

const DEFAULT_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_MAX_CANDIDATES = 50;
const DEFAULT_MAX_FETCHES = 10;
const MAX_RESULTS_PER_REQUEST = 20;

export class TavilyDiscoveryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "TavilyDiscoveryError";
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type TavilyWebsiteDiscoveryProviderOptions = {
  apiToken: string;
  endpoint?: string;
  fetcher?: FetchLike;
  now?: () => Date;
};

type TavilySearchResult = { url?: unknown; title?: unknown };
type TavilySearchResponse = { results?: unknown };

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function host(value: string): string | null {
  const normalized = normalizeHttpUrl(value);
  return normalized ? new URL(normalized).hostname.toLowerCase() : null;
}

function candidateId(locator: string): string {
  return `tavily-${createHash("sha256").update(locator).digest("hex").slice(0, 24)}`;
}

function queryForSeed(seed: SourceDiscoverySeed): string {
  const configured = seed.metadata?.discoveryQuery;
  if (typeof configured === "string" && configured.trim()) return configured.trim().slice(0, 400);
  const normalized = normalizeHttpUrl(seed.locator);
  if (!normalized) return seed.locator.slice(0, 400);
  const url = new URL(normalized);
  const pathTerms = decodeURIComponent(url.pathname)
    .split(/[\/._-]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
  return [`site:${url.hostname}`, pathTerms].filter(Boolean).join(" ");
}

function denied(locator: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, "u").test(locator);
    } catch {
      return locator.includes(pattern);
    }
  });
}

function allowedResult(
  locator: string,
  seed: SourceDiscoverySeed,
  batch: SourceDiscoveryBatch,
): boolean {
  const candidateHost = host(locator);
  const seedHost = host(seed.locator);
  if (!candidateHost) return false;
  const constraints = batch.constraints;
  const allowedHosts = constraints?.allowedHosts?.map((item) => item.toLowerCase()) ?? [];
  if (allowedHosts.length > 0 && !allowedHosts.includes(candidateHost)) return false;
  if ((constraints?.sameHostOnly ?? true) && seedHost && candidateHost !== seedHost) return false;
  if (denied(locator, constraints?.deniedUrlPatterns ?? [])) return false;
  return true;
}

function includeDomains(seed: SourceDiscoverySeed, batch: SourceDiscoveryBatch): string[] {
  const seedHost = host(seed.locator);
  const configured = batch.constraints?.allowedHosts?.map((item) => item.toLowerCase()) ?? [];
  if (configured.length > 0) return [...new Set(configured)].slice(0, 20);
  return seedHost ? [seedHost] : [];
}

function parseResults(payload: unknown): TavilySearchResult[] {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return [];
  const results = (payload as TavilySearchResponse).results;
  return Array.isArray(results) ? (results as TavilySearchResult[]) : [];
}

/**
 * Optional Source Discovery provider. Tavily is used only to discover structural
 * URL candidates. Provider scores/content/answers are deliberately ignored so
 * Knowledge does not turn a search vendor ranking into source authority or truth.
 */
export class TavilyWebsiteDiscoveryProvider implements SourceDiscoveryProvider {
  private readonly apiToken: string;
  private readonly endpoint: string;
  private readonly fetcher: FetchLike;
  private readonly now: () => Date;

  constructor(options: TavilyWebsiteDiscoveryProviderOptions) {
    this.apiToken = options.apiToken.trim();
    if (!this.apiToken) throw new Error("Tavily apiToken is required");
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async discover(batch: SourceDiscoveryBatch): Promise<SourceCandidate[]> {
    const maxCandidates = Math.max(
      0,
      Math.min(batch.constraints?.maxCandidates ?? DEFAULT_MAX_CANDIDATES, 5_000),
    );
    const maxFetches = Math.max(
      0,
      Math.min(batch.constraints?.maxFetches ?? DEFAULT_MAX_FETCHES, 1_000),
    );
    if (maxCandidates === 0 || maxFetches === 0 || batch.seeds.length === 0) return [];

    const candidates = new Map<string, SourceCandidate>();
    let fetches = 0;

    for (const seed of batch.seeds) {
      if (fetches >= maxFetches || candidates.size >= maxCandidates) break;
      const normalizedSeed = normalizeHttpUrl(seed.locator);
      if (!normalizedSeed) continue;
      const remaining = maxCandidates - candidates.size;
      const maxResults = Math.min(MAX_RESULTS_PER_REQUEST, remaining);
      if (maxResults <= 0) break;

      fetches += 1;
      let response: Response;
      try {
        response = await this.fetcher(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: queryForSeed(seed),
            search_depth: "basic",
            max_results: maxResults,
            include_answer: false,
            include_raw_content: false,
            include_images: false,
            include_image_descriptions: false,
            include_favicon: false,
            include_usage: false,
            auto_parameters: false,
            include_domains: includeDomains(seed, batch),
          }),
        });
      } catch {
        throw new TavilyDiscoveryError(
          "TAVILY_DELIVERY_UNKNOWN",
          "Tavily request delivery state is unknown; automatic replay is disabled",
          false,
        );
      }

      if (!response.ok) {
        const quotaOrPayment =
          response.status === 402 || response.status === 432 || response.status === 433;
        const rateLimited = response.status === 429;
        throw new TavilyDiscoveryError(
          quotaOrPayment
            ? "TAVILY_QUOTA_OR_PAYMENT_REQUIRED"
            : rateLimited
              ? "TAVILY_RATE_LIMITED"
              : `TAVILY_HTTP_${response.status}`,
          quotaOrPayment
            ? "Tavily free allowance or provider-side payment boundary was reached"
            : rateLimited
              ? "Tavily rate limit was reached; provider layer will not retry automatically"
              : `Tavily search failed with HTTP ${response.status}`,
          false,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new TavilyDiscoveryError(
          "TAVILY_RESPONSE_INVALID",
          "Tavily returned an invalid JSON response",
          false,
        );
      }

      for (const result of parseResults(payload)) {
        if (typeof result.url !== "string") continue;
        const locator = normalizeHttpUrl(result.url);
        if (!locator || !allowedResult(locator, seed, batch) || candidates.has(locator)) continue;
        const discoveredAt = this.now().toISOString();
        candidates.set(locator, {
          candidateId: candidateId(locator),
          locator,
          ...(typeof result.title === "string" && result.title.trim()
            ? { title: result.title.trim().slice(0, 500) }
            : {}),
          discoveredAt,
          status: "DISCOVERED",
          discoveredFrom: normalizedSeed,
          discoveryMethod: "RELATED_SOURCE",
          depth: 1,
          metadata: {
            kind: "search_result",
            provider: "tavily",
            seedId: seed.seedId,
            seedLocator: normalizedSeed,
            host: host(locator),
          },
        });
        if (candidates.size >= maxCandidates) break;
      }
    }

    return [...candidates.values()];
  }
}
