import { createHash } from "node:crypto";
import type {
  SourceCandidate,
  SourceDiscoveryBatch,
  SourceDiscoveryConstraints,
  SourceDiscoveryMethod,
  SourceDiscoverySeed,
} from "@markorbit/contracts";
import type { SourceDiscoveryProvider } from "./source-discovery-runner";

const DEFAULT_MAX_DEPTH = 1;
const DEFAULT_MAX_CANDIDATES = 250;
const DEFAULT_MAX_FETCHES = 50;
const MAX_MAX_DEPTH = 4;
const MAX_MAX_CANDIDATES = 5_000;
const MAX_MAX_FETCHES = 1_000;
const MAX_SITEMAP_INDEX_DEPTH = 3;
const MAX_REDIRECTS = 5;
const DISCOVERY_USER_AGENT = "MarkOrbitKnowledgeDiscovery/1.0";

type RobotsRule = {
  allow: boolean;
  path: string;
};

type RobotsPolicy = {
  locator: string;
  rules: RobotsRule[];
  sitemaps: string[];
};

type QueueItem = {
  locator: string;
  depth: number;
  seed: SourceDiscoverySeed;
  seedUrl: URL;
};

type SitemapQueueItem = {
  locator: string;
  discoveredFrom: string;
  indexDepth: number;
};

type FetchResult = {
  locator: string;
  response: Response;
  text: string;
};

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function normalizeUrl(locator: string, base?: string): URL | null {
  try {
    const url = base ? new URL(locator, base) : new URL(locator);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    const parameters = [...url.searchParams.entries()]
      .filter(([key]) => {
        const normalized = key.toLowerCase();
        return !(
          normalized.startsWith("utm_") ||
          normalized === "gclid" ||
          normalized === "fbclid"
        );
      })
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
        const keyOrder = leftKey.localeCompare(rightKey);
        return keyOrder === 0 ? leftValue.localeCompare(rightValue) : keyOrder;
      });
    url.search = "";
    for (const [key, value] of parameters) url.searchParams.append(key, value);

    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url;
  } catch {
    return null;
  }
}

function normalizedHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function sameWebsiteHost(left: string, right: string): boolean {
  return normalizedHost(left) === normalizedHost(right);
}

function extractLinks(html: string): string[] {
  const links: string[] = [];
  const pattern = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const href = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (href) links.push(decodeMarkup(href));
  }

  return links;
}

function decodeMarkup(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function extractXmlLocators(xml: string): string[] {
  const locators: string[] = [];
  const pattern = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const locator = decodeMarkup((match[1] ?? "").trim());
    if (locator) locators.push(locator);
  }
  return locators;
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex\b/i.test(xml);
}

function isDenied(url: URL, patterns: string[] | undefined): boolean {
  if (!patterns?.length) return false;
  const locator = url.toString().toLowerCase();
  return patterns.some((pattern) => locator.includes(pattern.toLowerCase()));
}

function isHostAllowed(url: URL, seed: URL, constraints: SourceDiscoveryConstraints): boolean {
  const allowedHosts = constraints.allowedHosts?.map(normalizedHost);
  if (allowedHosts?.length && !allowedHosts.includes(normalizedHost(url.hostname))) return false;

  if ((constraints.sameHostOnly ?? true) && !sameWebsiteHost(url.hostname, seed.hostname)) {
    return false;
  }

  return true;
}

function canDiscover(url: URL, seed: URL, constraints: SourceDiscoveryConstraints): boolean {
  return isHostAllowed(url, seed, constraints) && !isDenied(url, constraints.deniedUrlPatterns);
}

function candidateId(locator: string): string {
  return `cand_${createHash("sha256").update(locator).digest("hex").slice(0, 24)}`;
}

function candidateKind(url: URL): "DOCUMENT" | "FEED" | "PAGE" {
  const path = url.pathname.toLowerCase();
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|zip|xml|json)$/.test(path)) return "DOCUMENT";
  if (/\.(rss|atom)$/.test(path)) return "FEED";
  return "PAGE";
}

function parseRobots(locator: string, text: string): RobotsPolicy {
  const rules: RobotsRule[] = [];
  const sitemaps: string[] = [];
  let currentAgents: string[] = [];
  let groupHasRules = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const withoutComment = rawLine.replace(/#.*$/, "").trim();
    if (!withoutComment) continue;

    const separator = withoutComment.indexOf(":");
    if (separator < 0) continue;
    const directive = withoutComment.slice(0, separator).trim().toLowerCase();
    const value = withoutComment.slice(separator + 1).trim();

    if (directive === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }

    if (directive === "user-agent") {
      if (groupHasRules) {
        currentAgents = [];
        groupHasRules = false;
      }
      if (value) currentAgents.push(value.toLowerCase());
      continue;
    }

    if (directive !== "allow" && directive !== "disallow") continue;
    groupHasRules = true;
    if (!currentAgents.includes("*") || !value) continue;
    rules.push({ allow: directive === "allow", path: value });
  }

  return { locator, rules, sitemaps };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function robotsRuleMatches(target: string, rule: string): boolean {
  const anchored = rule.endsWith("$");
  const core = anchored ? rule.slice(0, -1) : rule;
  const expression = core.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(target);
}

function robotsAllows(policy: RobotsPolicy | null, url: URL): boolean {
  if (!policy || policy.rules.length === 0) return true;
  const target = `${url.pathname}${url.search}`;
  let selected: RobotsRule | undefined;

  for (const rule of policy.rules) {
    if (!robotsRuleMatches(target, rule.path)) continue;
    if (!selected || rule.path.length > selected.path.length) selected = rule;
    else if (rule.path.length === selected.path.length && rule.allow) selected = rule;
  }

  return selected?.allow ?? true;
}

/**
 * Production website discovery provider for the first Controlled Autonomous
 * Discovery vertical slice.
 *
 * The provider discovers structure; it does not trust or register what it
 * finds. Every output remains a DISCOVERED SourceCandidate behind the human
 * review boundary. Network work and review-queue growth are independently
 * bounded, robots rules prevent blocked pages from being fetched, and
 * same-site redirects are enforced before the next request is made.
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
    const maxFetches = clampInteger(
      constraints.maxFetches,
      DEFAULT_MAX_FETCHES,
      1,
      MAX_MAX_FETCHES,
    );
    const respectRobots = constraints.respectRobots ?? true;
    const discoverSitemaps = constraints.discoverSitemaps ?? true;

    const candidates: SourceCandidate[] = [];
    const candidateLocators = new Set<string>();
    const seedLocators = new Set<string>();
    let fetchCount = 0;

    const fetchText = async (
      locator: string,
      accept: string,
      seedUrl: URL,
    ): Promise<FetchResult | null> => {
      let current = locator;

      for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        if (fetchCount >= maxFetches) return null;
        const currentUrl = normalizeUrl(current);
        if (!currentUrl || !isHostAllowed(currentUrl, seedUrl, constraints)) return null;

        fetchCount += 1;
        let response: Response;
        try {
          response = await this.fetcher(currentUrl.toString(), {
            redirect: "manual",
            headers: {
              accept,
              "user-agent": DISCOVERY_USER_AGENT,
            },
          });
        } catch {
          return null;
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location || redirectCount === MAX_REDIRECTS) return null;
          const redirected = normalizeUrl(location, currentUrl.toString());
          if (!redirected || !isHostAllowed(redirected, seedUrl, constraints)) return null;
          current = redirected.toString();
          continue;
        }

        if (!response.ok) return null;
        const finalUrl = normalizeUrl(response.url || currentUrl.toString());
        if (!finalUrl || !isHostAllowed(finalUrl, seedUrl, constraints)) return null;

        try {
          return {
            locator: finalUrl.toString(),
            response,
            text: await response.text(),
          };
        } catch {
          return null;
        }
      }

      return null;
    };

    for (const seed of input.seeds) {
      if (candidates.length >= maxCandidates || fetchCount >= maxFetches || maxDepth === 0) break;

      const seedUrl = normalizeUrl(seed.locator);
      if (!seedUrl || !isHostAllowed(seedUrl, seedUrl, constraints)) continue;
      const normalizedSeedLocator = seedUrl.toString();
      seedLocators.add(normalizedSeedLocator);

      let robots: RobotsPolicy | null = null;
      const robotsUrl = new URL("/robots.txt", seedUrl.origin).toString();
      if (respectRobots || discoverSitemaps) {
        const robotsResult = await fetchText(
          robotsUrl,
          "text/plain,text/*;q=0.9,*/*;q=0.1",
          seedUrl,
        );
        if (robotsResult) robots = parseRobots(robotsResult.locator, robotsResult.text);
      }

      const queuedPages = new Set<string>([normalizedSeedLocator]);
      const visitedPages = new Set<string>();
      const pageQueue: QueueItem[] = [
        { locator: normalizedSeedLocator, depth: 0, seed, seedUrl },
      ];

      const addCandidate = (
        url: URL,
        discoveredFrom: string,
        discoveryMethod: SourceDiscoveryMethod,
        depth: number,
      ): SourceCandidate | null => {
        if (candidates.length >= maxCandidates || depth > maxDepth) return null;
        if (!canDiscover(url, seedUrl, constraints)) return null;

        const locator = url.toString();
        if (seedLocators.has(locator) || candidateLocators.has(locator)) return null;

        const kind = candidateKind(url);
        const robotsAllowed = !respectRobots || robotsAllows(robots, url);
        const candidate: SourceCandidate = {
          candidateId: candidateId(locator),
          locator,
          discoveredAt: new Date().toISOString(),
          status: "DISCOVERED",
          discoveredFrom,
          discoveryMethod,
          depth,
          metadata: {
            kind,
            seedId: seed.seedId,
            seedLocator: seed.locator,
            host: url.hostname,
            robotsAllowed,
          },
        };

        candidateLocators.add(locator);
        candidates.push(candidate);

        if (kind === "PAGE" && robotsAllowed && depth < maxDepth && !queuedPages.has(locator)) {
          queuedPages.add(locator);
          pageQueue.push({ locator, depth, seed, seedUrl });
        }

        return candidate;
      };

      const visitNextPage = async (): Promise<void> => {
        const current = pageQueue.shift();
        if (!current || current.depth >= maxDepth || visitedPages.has(current.locator)) return;
        if (respectRobots && !robotsAllows(robots, new URL(current.locator))) return;

        visitedPages.add(current.locator);
        const result = await fetchText(
          current.locator,
          "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          current.seedUrl,
        );
        if (!result) return;
        const resultUrl = normalizeUrl(result.locator);
        if (!resultUrl || !canDiscover(resultUrl, current.seedUrl, constraints)) return;

        const contentType = result.response.headers.get("content-type")?.toLowerCase() ?? "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
          return;
        }

        for (const href of extractLinks(result.text)) {
          if (candidates.length >= maxCandidates) break;
          const discoveredUrl = normalizeUrl(href, result.locator);
          if (!discoveredUrl) continue;
          addCandidate(discoveredUrl, result.locator, "HTML_LINK", current.depth + 1);
        }
      };

      // The homepage/navigation is intentionally sampled before sitemap expansion
      // so a huge sitemap cannot consume the entire review-queue budget first.
      await visitNextPage();

      if (discoverSitemaps && candidates.length < maxCandidates && fetchCount < maxFetches) {
        const declaredSitemaps = (robots?.sitemaps ?? [])
          .map((locator) => normalizeUrl(locator, robots?.locator ?? normalizedSeedLocator))
          .filter((url): url is URL => !!url && isHostAllowed(url, seedUrl, constraints));
        const defaultSitemap = normalizeUrl("/sitemap.xml", seedUrl.origin);
        const initialSitemaps =
          declaredSitemaps.length > 0
            ? declaredSitemaps
            : defaultSitemap
              ? [defaultSitemap]
              : [];
        const sitemapQueue: SitemapQueueItem[] = initialSitemaps.map((url) => ({
          locator: url.toString(),
          discoveredFrom: robots?.locator ?? normalizedSeedLocator,
          indexDepth: 0,
        }));
        const visitedSitemaps = new Set<string>();

        while (
          sitemapQueue.length > 0 &&
          candidates.length < maxCandidates &&
          fetchCount < maxFetches
        ) {
          const sitemap = sitemapQueue.shift();
          if (!sitemap || visitedSitemaps.has(sitemap.locator)) continue;
          visitedSitemaps.add(sitemap.locator);

          const result = await fetchText(
            sitemap.locator,
            "application/xml,text/xml,text/plain;q=0.9,*/*;q=0.1",
            seedUrl,
          );
          if (!result) continue;

          const xmlLocators = extractXmlLocators(result.text);
          if (isSitemapIndex(result.text)) {
            if (sitemap.indexDepth >= MAX_SITEMAP_INDEX_DEPTH) continue;
            for (const locator of xmlLocators) {
              const nested = normalizeUrl(locator, result.locator);
              if (!nested || !isHostAllowed(nested, seedUrl, constraints)) continue;
              const normalized = nested.toString();
              if (visitedSitemaps.has(normalized)) continue;
              sitemapQueue.push({
                locator: normalized,
                discoveredFrom: result.locator,
                indexDepth: sitemap.indexDepth + 1,
              });
            }
            continue;
          }

          const sitemapLocators =
            xmlLocators.length > 0
              ? xmlLocators
              : result.text
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter((line) => /^https?:\/\//i.test(line));

          for (const locator of sitemapLocators) {
            if (candidates.length >= maxCandidates) break;
            const discoveredUrl = normalizeUrl(locator, result.locator);
            if (!discoveredUrl) continue;
            addCandidate(discoveredUrl, result.locator, "SITEMAP", 1);
          }
        }
      }

      while (
        pageQueue.length > 0 &&
        candidates.length < maxCandidates &&
        fetchCount < maxFetches
      ) {
        await visitNextPage();
      }
    }

    return candidates;
  }
}
