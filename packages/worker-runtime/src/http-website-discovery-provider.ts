import { createHash } from "node:crypto";
import type {
  SourceCandidate,
  SourceDiscoveryBatch,
  SourceDiscoveryConstraints,
  SourceDiscoverySeed,
} from "@markorbit/contracts";
import type { SourceDiscoveryProvider } from "./source-discovery-runner";

const DEFAULT_MAX_DEPTH = 1;
const DEFAULT_MAX_CANDIDATES = 250;
const MAX_MAX_DEPTH = 4;
const MAX_MAX_CANDIDATES = 5_000;

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function normalizeUrl(locator: string, base?: string): URL | null {
  try {
    const url = base ? new URL(locator, base) : new URL(locator);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    // Common campaign parameters create duplicate acquisition candidates without
    // changing the underlying professional evidence.
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase();
      if (normalized.startsWith("utm_") || normalized === "gclid" || normalized === "fbclid") {
        url.searchParams.delete(key);
      }
    }

    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url;
  } catch {
    return null;
  }
}

function extractLinks(html: string): string[] {
  const links: string[] = [];
  const pattern = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const href = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (href) links.push(href.replaceAll("&amp;", "&"));
  }

  return links;
}

function isDenied(url: URL, patterns: string[] | undefined) {
  if (!patterns?.length) return false;
  const locator = url.toString().toLowerCase();
  return patterns.some((pattern) => locator.includes(pattern.toLowerCase()));
}

function canDiscover(url: URL, seed: URL, constraints: SourceDiscoveryConstraints) {
  if (isDenied(url, constraints.deniedUrlPatterns)) return false;

  const allowedHosts = constraints.allowedHosts?.map((host) => host.toLowerCase());
  if (allowedHosts?.length && !allowedHosts.includes(url.hostname)) return false;

  if ((constraints.sameHostOnly ?? true) && url.hostname !== seed.hostname) return false;

  return true;
}

function candidateId(locator: string) {
  return `cand_${createHash("sha256").update(locator).digest("hex").slice(0, 24)}`;
}

function candidateKind(url: URL) {
  const path = url.pathname.toLowerCase();
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|zip|xml|json)$/.test(path)) return "DOCUMENT";
  if (/\.(rss|atom)$/.test(path)) return "FEED";
  return "PAGE";
}

type QueueItem = {
  locator: string;
  depth: number;
  seed: SourceDiscoverySeed;
  seedUrl: URL;
};

/**
 * First production-shaped website discovery provider.
 *
 * It performs bounded HTML-link discovery from one or more seed URLs. It does
 * not make legal relevance decisions and it does not automatically register
 * candidates as trusted SourceDefinitions. The output remains behind the
 * SourceCandidate review boundary.
 *
 * robots.txt, sitemap indexes, durable frontiers and distributed crawl budgets
 * intentionally remain follow-up work before autonomous large-scale crawling.
 */
export class HttpWebsiteDiscoveryProvider implements SourceDiscoveryProvider {
  constructor(private readonly fetcher: typeof globalThis.fetch = globalThis.fetch) {}

  async discover(input: SourceDiscoveryBatch): Promise<SourceCandidate[]> {
    const constraints = input.constraints ?? {};
    const maxDepth = clampInteger(constraints.maxDepth, DEFAULT_MAX_DEPTH, 0, MAX_MAX_DEPTH);
    const maxCandidates = clampInteger(
      constraints.maxCandidates,
      DEFAULT_MAX_CANDIDATES,
      1,
      MAX_MAX_CANDIDATES,
    );

    const candidates: SourceCandidate[] = [];
    const seen = new Set<string>();
    const queued = new Set<string>();
    const queue: QueueItem[] = [];

    for (const seed of input.seeds) {
      const seedUrl = normalizeUrl(seed.locator);
      if (!seedUrl) continue;
      const locator = seedUrl.toString();
      seen.add(locator);
      queued.add(locator);
      queue.push({ locator, depth: 0, seed, seedUrl });
    }

    while (queue.length > 0 && candidates.length < maxCandidates) {
      const current = queue.shift();
      if (!current || current.depth >= maxDepth) continue;

      let response: Response;
      try {
        response = await this.fetcher(current.locator, {
          redirect: "follow",
          headers: {
            accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          },
        });
      } catch {
        continue;
      }

      if (!response.ok) continue;
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        continue;
      }

      const html = await response.text();
      for (const href of extractLinks(html)) {
        if (candidates.length >= maxCandidates) break;

        const discoveredUrl = normalizeUrl(href, response.url || current.locator);
        if (!discoveredUrl || !canDiscover(discoveredUrl, current.seedUrl, constraints)) continue;

        const locator = discoveredUrl.toString();
        if (seen.has(locator)) continue;
        seen.add(locator);

        const depth = current.depth + 1;
        candidates.push({
          candidateId: candidateId(locator),
          locator,
          discoveredAt: new Date().toISOString(),
          status: "DISCOVERED",
          discoveredFrom: current.locator,
          discoveryMethod: "HTML_LINK",
          depth,
          metadata: {
            kind: candidateKind(discoveredUrl),
            seedId: current.seed.seedId,
            seedLocator: current.seed.locator,
            host: discoveredUrl.hostname,
          },
        });

        if (depth < maxDepth && !queued.has(locator)) {
          queued.add(locator);
          queue.push({ locator, depth, seed: current.seed, seedUrl: current.seedUrl });
        }
      }
    }

    return candidates;
  }
}
