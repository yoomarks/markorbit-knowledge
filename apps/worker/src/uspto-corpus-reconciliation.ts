import {
  USPTO_TRADEMARK_CORPUS_SEEDS,
  extractUsptoTrademarkLinks,
  summarizeUsptoDomains,
  type UsptoCorpusSeed,
  type UsptoDiscoveredLink,
  type UsptoTrademarkDomain,
} from "./uspto-public-corpus-discovery";

export type UsptoAssetKind = "PDF" | "ZIP" | "DOCX" | "XLSX" | "PPTX" | "OTHER";

export type UsptoReferencedAsset = {
  uri: string;
  label: string;
  kind: UsptoAssetKind;
  sourceSeedUri: string;
};

export type UsptoSeedOutcome = {
  seed: UsptoCorpusSeed;
  ok: boolean;
  status?: number;
  contentType?: string;
  discoveredLinkCount: number;
  referencedAssetCount: number;
  error?: string;
};

export type UsptoCorpusReconciliationReport = {
  seedCount: number;
  successfulSeedCount: number;
  failedSeedCount: number;
  discoveredLinkCount: number;
  referencedAssetCount: number;
  domainCounts: Record<UsptoTrademarkDomain, number>;
  assetKindCounts: Record<UsptoAssetKind, number>;
  outcomes: UsptoSeedOutcome[];
  links: UsptoDiscoveredLink[];
  assets: UsptoReferencedAsset[];
};

const CURRENT_MADRID_URI =
  "https://www.uspto.gov/ip-policy/international-protection/madrid-protocol";
const TBMP_ARCHIVES_URI = "https://www.uspto.gov/trademarks/ttab/tbmp-archives";

export const USPTO_RECONCILIATION_SEEDS: readonly UsptoCorpusSeed[] = [
  ...USPTO_TRADEMARK_CORPUS_SEEDS.map((seed) =>
    seed.domain === "MADRID" ? { ...seed, uri: CURRENT_MADRID_URI } : seed,
  ),
  { domain: "TTAB_TBMP", uri: TBMP_ARCHIVES_URI, label: "TBMP archives" },
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

function assetKind(url: URL): UsptoAssetKind | null {
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".pdf")) return "PDF";
  if (path.endsWith(".zip")) return "ZIP";
  if (path.endsWith(".docx")) return "DOCX";
  if (path.endsWith(".xlsx")) return "XLSX";
  if (path.endsWith(".pptx")) return "PPTX";
  return null;
}

export function extractUsptoReferencedAssets(
  html: string,
  sourceSeedUri: string,
): UsptoReferencedAsset[] {
  const base = new URL(sourceSeedUri);
  const assets = new Map<string, UsptoReferencedAsset>();
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

    const hostname = url.hostname.toLowerCase();
    if (hostname !== "uspto.gov" && !hostname.endsWith(".uspto.gov")) continue;

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
  assets: readonly UsptoReferencedAsset[],
): Record<UsptoAssetKind, number> {
  const counts: Record<UsptoAssetKind, number> = {
    PDF: 0,
    ZIP: 0,
    DOCX: 0,
    XLSX: 0,
    PPTX: 0,
    OTHER: 0,
  };
  for (const asset of assets) counts[asset.kind] += 1;
  return counts;
}

export async function reconcileUsptoCorpus(
  fetcher: typeof fetch = fetch,
): Promise<UsptoCorpusReconciliationReport> {
  const discovered = new Map<string, UsptoDiscoveredLink>();
  const assets = new Map<string, UsptoReferencedAsset>();
  const outcomes: UsptoSeedOutcome[] = [];

  for (const seed of USPTO_RECONCILIATION_SEEDS) {
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
      const links = extractUsptoTrademarkLinks(html, seed.uri);
      const referencedAssets = extractUsptoReferencedAssets(html, seed.uri);
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
  const failedSeedCount = outcomes.filter((outcome) => !outcome.ok).length;

  return {
    seedCount: USPTO_RECONCILIATION_SEEDS.length,
    successfulSeedCount: outcomes.length - failedSeedCount,
    failedSeedCount,
    discoveredLinkCount: links.length,
    referencedAssetCount: referencedAssets.length,
    domainCounts: summarizeUsptoDomains(links),
    assetKindCounts: summarizeAssetKinds(referencedAssets),
    outcomes,
    links,
    assets: referencedAssets,
  };
}
