import {
  WIPO_TRADEMARK_CORPUS_SEEDS,
  extractWipoTrademarkLinks,
  summarizeWipoDomains,
  type WipoCorpusSeed,
  type WipoDiscoveredLink,
  type WipoTrademarkDomain,
} from "./wipo-public-corpus-discovery";

export type WipoAssetKind = "PDF" | "XML" | "CSV" | "ZIP" | "DOCX" | "XLSX" | "OTHER";

export type WipoReferencedAsset = {
  uri: string;
  label: string;
  kind: WipoAssetKind;
  sourceSeedUri: string;
};

export type WipoSeedOutcome = {
  seed: WipoCorpusSeed;
  ok: boolean;
  status?: number;
  contentType?: string;
  discoveredLinkCount: number;
  referencedAssetCount: number;
  error?: string;
};

export type WipoIntegrationStage = {
  domain: WipoTrademarkDomain;
  seedReachable: boolean;
  discoveredLinkCount: number;
  state: "PRESENT" | "GAP";
};

export type WipoCorpusReconciliationReport = {
  seedCount: number;
  successfulSeedCount: number;
  failedSeedCount: number;
  discoveredLinkCount: number;
  referencedAssetCount: number;
  domainCounts: Record<WipoTrademarkDomain, number>;
  assetKindCounts: Record<WipoAssetKind, number>;
  integrationChain: WipoIntegrationStage[];
  outcomes: WipoSeedOutcome[];
  links: WipoDiscoveredLink[];
  assets: WipoReferencedAsset[];
};

const VIENNA_CURRENT_URI = "https://www.wipo.int/en/web/classification-vienna/index";
const EMADRID_FIND_MONITOR_URI = "https://www.wipo.int/en/web/emadrid/find-and-monitor";

export const WIPO_RECONCILIATION_SEEDS: readonly WipoCorpusSeed[] =
  WIPO_TRADEMARK_CORPUS_SEEDS.map((seed) => {
    if (seed.domain === "VIENNA") return { ...seed, uri: VIENNA_CURRENT_URI };
    if (seed.domain === "FIND_MONITOR") return { ...seed, uri: EMADRID_FIND_MONITOR_URI };
    return seed;
  });

const INTEGRATION_CHAIN_DOMAINS: readonly WipoTrademarkDomain[] = [
  "MEMBERS",
  "DECLARATIONS",
  "MEMBER_PROFILES",
  "LEGAL_TEXTS",
  "FEES",
  "FORMS",
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

function assetKind(url: URL): WipoAssetKind | null {
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".pdf")) return "PDF";
  if (path.endsWith(".xml")) return "XML";
  if (path.endsWith(".csv")) return "CSV";
  if (path.endsWith(".zip")) return "ZIP";
  if (path.endsWith(".docx")) return "DOCX";
  if (path.endsWith(".xlsx")) return "XLSX";
  return null;
}

export function extractWipoReferencedAssets(
  html: string,
  sourceSeedUri: string,
): WipoReferencedAsset[] {
  const base = new URL(sourceSeedUri);
  const assets = new Map<string, WipoReferencedAsset>();
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
    if (host !== "wipo.int" && !host.endsWith(".wipo.int")) continue;

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

function summarizeAssetKinds(assets: readonly WipoReferencedAsset[]): Record<WipoAssetKind, number> {
  const counts: Record<WipoAssetKind, number> = {
    PDF: 0,
    XML: 0,
    CSV: 0,
    ZIP: 0,
    DOCX: 0,
    XLSX: 0,
    OTHER: 0,
  };
  for (const asset of assets) counts[asset.kind] += 1;
  return counts;
}

function buildIntegrationChain(
  outcomes: readonly WipoSeedOutcome[],
  domainCounts: Record<WipoTrademarkDomain, number>,
): WipoIntegrationStage[] {
  return INTEGRATION_CHAIN_DOMAINS.map((domain) => {
    const seedReachable = outcomes.some((outcome) => outcome.seed.domain === domain && outcome.ok);
    const discoveredLinkCount = domainCounts[domain];
    return {
      domain,
      seedReachable,
      discoveredLinkCount,
      state: seedReachable && discoveredLinkCount > 0 ? "PRESENT" : "GAP",
    };
  });
}

export async function reconcileWipoCorpus(
  fetcher: typeof fetch = fetch,
): Promise<WipoCorpusReconciliationReport> {
  const discovered = new Map<string, WipoDiscoveredLink>();
  const assets = new Map<string, WipoReferencedAsset>();
  const outcomes: WipoSeedOutcome[] = [];

  for (const seed of WIPO_RECONCILIATION_SEEDS) {
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
      const links = extractWipoTrademarkLinks(html, seed.uri);
      const referencedAssets = extractWipoReferencedAssets(html, seed.uri);
      for (const link of links) if (!discovered.has(link.uri)) discovered.set(link.uri, link);
      for (const asset of referencedAssets) if (!assets.has(asset.uri)) assets.set(asset.uri, asset);

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
  const domainCounts = summarizeWipoDomains(links);
  const failedSeedCount = outcomes.filter((outcome) => !outcome.ok).length;

  return {
    seedCount: WIPO_RECONCILIATION_SEEDS.length,
    successfulSeedCount: outcomes.length - failedSeedCount,
    failedSeedCount,
    discoveredLinkCount: links.length,
    referencedAssetCount: referencedAssets.length,
    domainCounts,
    assetKindCounts: summarizeAssetKinds(referencedAssets),
    integrationChain: buildIntegrationChain(outcomes, domainCounts),
    outcomes,
    links,
    assets: referencedAssets,
  };
}
