import {
  IP_AUSTRALIA_TRADEMARK_CORPUS_SEEDS,
  extractIpAustraliaTrademarkLinks,
  summarizeIpAustraliaDomains,
  type IpAustraliaCorpusSeed,
  type IpAustraliaDiscoveredLink,
  type IpAustraliaTrademarkDomain,
} from "./ip-australia-trademark-corpus-discovery";

export type IpAustraliaAssetKind = "PDF" | "DOCX" | "XLSX" | "CSV" | "ZIP" | "OTHER";

export type IpAustraliaReferencedAsset = {
  uri: string;
  label: string;
  kind: IpAustraliaAssetKind;
  sourceSeedUri: string;
};

export type IpAustraliaSeedOutcome = {
  seed: IpAustraliaCorpusSeed;
  ok: boolean;
  status?: number;
  contentType?: string;
  discoveredLinkCount: number;
  referencedAssetCount: number;
  error?: string;
};

export type IpAustraliaJourneyStage = {
  domain: IpAustraliaTrademarkDomain;
  seedReachable: boolean;
  discoveredLinkCount: number;
  state: "PRESENT" | "GAP";
};

export type IpAustraliaCorpusReconciliationReport = {
  seedCount: number;
  successfulSeedCount: number;
  failedSeedCount: number;
  discoveredLinkCount: number;
  referencedAssetCount: number;
  domainCounts: Record<IpAustraliaTrademarkDomain, number>;
  assetKindCounts: Record<IpAustraliaAssetKind, number>;
  journey: IpAustraliaJourneyStage[];
  outcomes: IpAustraliaSeedOutcome[];
  links: IpAustraliaDiscoveredLink[];
  assets: IpAustraliaReferencedAsset[];
};

const JOURNEY_DOMAINS: readonly IpAustraliaTrademarkDomain[] = [
  "TRADEMARK_BASICS",
  "SEARCH",
  "TIMEFRAMES_FEES",
  "APPLY",
  "TM_HEADSTART_CHECKER",
  "EXAMINATION",
  "OPPOSITION",
  "REGISTRATION_RENEWAL",
  "OWNERSHIP_COMMERCIALISATION",
  "NON_USE_CHALLENGE",
  "FORMS_SYSTEMS",
  "PRACTICE_MANUAL",
] as const;

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function assetKind(url: URL): IpAustraliaAssetKind | null {
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".pdf")) return "PDF";
  if (path.endsWith(".docx")) return "DOCX";
  if (path.endsWith(".xlsx")) return "XLSX";
  if (path.endsWith(".csv")) return "CSV";
  if (path.endsWith(".zip")) return "ZIP";
  return null;
}

export function extractIpAustraliaReferencedAssets(
  html: string,
  sourceSeedUri: string,
): IpAustraliaReferencedAsset[] {
  const base = new URL(sourceSeedUri);
  const assets = new Map<string, IpAustraliaReferencedAsset>();
  const anchor = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchor)) {
    const href = decodeHtml(match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) continue;

    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }

    const host = url.hostname.toLowerCase();
    if (host !== "ipaustralia.gov.au" && !host.endsWith(".ipaustralia.gov.au")) continue;
    if (host.includes(".dev.")) continue;

    const kind = assetKind(url);
    if (!kind) continue;

    url.hash = "";
    const uri = url.toString();
    if (!assets.has(uri)) {
      assets.set(uri, {
        uri,
        label: cleanText(match[4] ?? "") || uri,
        kind,
        sourceSeedUri,
      });
    }
  }

  return [...assets.values()].sort((left, right) => left.uri.localeCompare(right.uri));
}

function summarizeAssetKinds(
  assets: readonly IpAustraliaReferencedAsset[],
): Record<IpAustraliaAssetKind, number> {
  const counts: Record<IpAustraliaAssetKind, number> = {
    PDF: 0,
    DOCX: 0,
    XLSX: 0,
    CSV: 0,
    ZIP: 0,
    OTHER: 0,
  };
  for (const asset of assets) counts[asset.kind] += 1;
  return counts;
}

function buildJourney(
  outcomes: readonly IpAustraliaSeedOutcome[],
  domainCounts: Record<IpAustraliaTrademarkDomain, number>,
): IpAustraliaJourneyStage[] {
  return JOURNEY_DOMAINS.map((domain) => {
    const seedReachable = outcomes.some((outcome) => outcome.seed.domain === domain && outcome.ok);
    return {
      domain,
      seedReachable,
      discoveredLinkCount: domainCounts[domain],
      state: seedReachable ? "PRESENT" : "GAP",
    };
  });
}

export async function reconcileIpAustraliaCorpus(
  fetcher: typeof fetch = fetch,
): Promise<IpAustraliaCorpusReconciliationReport> {
  const discovered = new Map<string, IpAustraliaDiscoveredLink>();
  const assets = new Map<string, IpAustraliaReferencedAsset>();
  const outcomes: IpAustraliaSeedOutcome[] = [];

  for (const seed of IP_AUSTRALIA_TRADEMARK_CORPUS_SEEDS) {
    try {
      const response = await fetcher(seed.uri, {
        headers: {
          "user-agent": "MarkOrbit-Knowledge/1.0 corpus-reconciliation",
          accept: "text/html,application/xhtml+xml",
        },
      });
      const contentType = response.headers.get("content-type") ?? undefined;
      if (!response.ok) {
        outcomes.push({
          seed,
          ok: false,
          status: response.status,
          contentType,
          discoveredLinkCount: 0,
          referencedAssetCount: 0,
          error: `${seed.uri} returned HTTP ${response.status}`,
        });
        continue;
      }

      const html = await response.text();
      const links = extractIpAustraliaTrademarkLinks(html, seed.uri);
      const referencedAssets = extractIpAustraliaReferencedAssets(html, seed.uri);
      for (const link of links) if (!discovered.has(link.uri)) discovered.set(link.uri, link);
      for (const asset of referencedAssets)
        if (!assets.has(asset.uri)) assets.set(asset.uri, asset);

      outcomes.push({
        seed,
        ok: true,
        status: response.status,
        contentType,
        discoveredLinkCount: links.length,
        referencedAssetCount: referencedAssets.length,
      });
    } catch (error) {
      outcomes.push({
        seed,
        ok: false,
        discoveredLinkCount: 0,
        referencedAssetCount: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const links = [...discovered.values()].sort((left, right) => left.uri.localeCompare(right.uri));
  const referencedAssets = [...assets.values()].sort((left, right) =>
    left.uri.localeCompare(right.uri),
  );
  const domainCounts = summarizeIpAustraliaDomains(links);
  const failedSeedCount = outcomes.filter((outcome) => !outcome.ok).length;

  return {
    seedCount: IP_AUSTRALIA_TRADEMARK_CORPUS_SEEDS.length,
    successfulSeedCount: outcomes.length - failedSeedCount,
    failedSeedCount,
    discoveredLinkCount: links.length,
    referencedAssetCount: referencedAssets.length,
    domainCounts,
    assetKindCounts: summarizeAssetKinds(referencedAssets),
    journey: buildJourney(outcomes, domainCounts),
    outcomes,
    links,
    assets: referencedAssets,
  };
}
