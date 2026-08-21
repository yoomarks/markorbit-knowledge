const MANUAL_ROOT = "https://manuals.ipaustralia.gov.au/trademark";

export type IpAustraliaManualPage = {
  uri: string;
  label: string;
  currentNavigation: boolean;
  updateHistoryPages: number[];
};

export type IpAustraliaManualUpdateOutcome = {
  page: number;
  uri: string;
  ok: boolean;
  status?: number;
  discoveredUpdateItemCount: number;
  error?: string;
};

export type IpAustraliaManualInventoryReport = {
  rootUri: string;
  highestUpdateHistoryPage: number;
  updateHistoryPageCount: number;
  successfulUpdateHistoryPageCount: number;
  failedUpdateHistoryPageCount: number;
  currentNavigationPageCount: number;
  updateHistoryOnlyPageCount: number;
  totalUniqueManualPageCount: number;
  duplicateUpdateReferenceCount: number;
  outcomes: IpAustraliaManualUpdateOutcome[];
  pages: IpAustraliaManualPage[];
  acceptanceBoundary: string;
};

type ManualLink = { uri: string; label: string };

type ParsedManualScreen = {
  highestUpdateHistoryPage: number;
  navigationPages: ManualLink[];
  updatePages: ManualLink[];
};

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

function isManualArticle(url: URL): boolean {
  if (url.hostname.toLowerCase() !== "manuals.ipaustralia.gov.au") return false;
  if (!url.pathname.toLowerCase().startsWith("/trademark/")) return false;
  if (url.pathname.toLowerCase() === "/trademark/") return false;
  return !url.searchParams.has("page");
}

function parseManualLinks(html: string, sourceUri: string): ManualLink[] {
  const base = new URL(sourceUri);
  const pages = new Map<string, ManualLink>();
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
    if (!isManualArticle(url)) continue;

    url.hash = "";
    const uri = url.toString();
    if (!pages.has(uri)) pages.set(uri, { uri, label: cleanText(match[4] ?? "") || uri });
  }

  return [...pages.values()].sort((left, right) => left.uri.localeCompare(right.uri));
}

function splitRecentUpdates(html: string): { navigationHtml: string; updatesHtml: string } {
  const match = /recent\s+updates/i.exec(html);
  if (!match || match.index <= 0) return { navigationHtml: html, updatesHtml: "" };
  return {
    navigationHtml: html.slice(0, match.index),
    updatesHtml: html.slice(match.index),
  };
}

export function parseIpAustraliaManualScreen(
  html: string,
  sourceUri: string,
): ParsedManualScreen {
  const { navigationHtml, updatesHtml } = splitRecentUpdates(html);
  let highestUpdateHistoryPage = 0;
  const base = new URL(sourceUri);
  const anchor = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of updatesHtml.matchAll(anchor)) {
    const href = decodeHtml(match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!href) continue;
    try {
      const url = new URL(href, base);
      if (url.hostname.toLowerCase() !== "manuals.ipaustralia.gov.au") continue;
      if (url.pathname.toLowerCase() !== "/trademark" && url.pathname.toLowerCase() !== "/trademark/")
        continue;
      const page = Number.parseInt(url.searchParams.get("page") ?? "0", 10);
      if (Number.isFinite(page) && page >= 0) {
        highestUpdateHistoryPage = Math.max(highestUpdateHistoryPage, page);
      }
    } catch {
      continue;
    }
  }

  return {
    highestUpdateHistoryPage,
    navigationPages: parseManualLinks(navigationHtml, sourceUri),
    updatePages: parseManualLinks(updatesHtml, sourceUri),
  };
}

function updateHistoryUri(page: number): string {
  return page === 0 ? MANUAL_ROOT : `${MANUAL_ROOT}?page=${page}`;
}

async function fetchManualScreen(
  page: number,
  fetcher: typeof fetch,
): Promise<{ outcome: IpAustraliaManualUpdateOutcome; parsed?: ParsedManualScreen }> {
  const uri = updateHistoryUri(page);
  try {
    const response = await fetcher(uri, {
      headers: {
        "user-agent": "MarkOrbit-Knowledge/1.0 manual-inventory",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      return {
        outcome: {
          page,
          uri,
          ok: false,
          status: response.status,
          discoveredUpdateItemCount: 0,
          error: `${uri} returned HTTP ${response.status}`,
        },
      };
    }
    const parsed = parseIpAustraliaManualScreen(await response.text(), uri);
    return {
      outcome: {
        page,
        uri,
        ok: true,
        status: response.status,
        discoveredUpdateItemCount: parsed.updatePages.length,
      },
      parsed,
    };
  } catch (error) {
    return {
      outcome: {
        page,
        uri,
        ok: false,
        discoveredUpdateItemCount: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function inventoryIpAustraliaManual(
  fetcher: typeof fetch = fetch,
): Promise<IpAustraliaManualInventoryReport> {
  const root = await fetchManualScreen(0, fetcher);
  if (!root.parsed) {
    return {
      rootUri: MANUAL_ROOT,
      highestUpdateHistoryPage: 0,
      updateHistoryPageCount: 1,
      successfulUpdateHistoryPageCount: 0,
      failedUpdateHistoryPageCount: 1,
      currentNavigationPageCount: 0,
      updateHistoryOnlyPageCount: 0,
      totalUniqueManualPageCount: 0,
      duplicateUpdateReferenceCount: 0,
      outcomes: [root.outcome],
      pages: [],
      acceptanceBoundary:
        "Manual navigation and update-history inventory only. Corpus readiness additionally requires article acquisition, metadata fidelity, version/change evidence, and freshness checks.",
    };
  }

  const highestUpdateHistoryPage = root.parsed.highestUpdateHistoryPage;
  const remainingPages = Array.from({ length: highestUpdateHistoryPage }, (_, index) => index + 1);
  const results = [root];
  for (let offset = 0; offset < remainingPages.length; offset += 4) {
    const batch = remainingPages.slice(offset, offset + 4);
    results.push(...(await Promise.all(batch.map((page) => fetchManualScreen(page, fetcher)))));
  }

  const pages = new Map<string, IpAustraliaManualPage>();
  for (const page of root.parsed.navigationPages) {
    pages.set(page.uri, { ...page, currentNavigation: true, updateHistoryPages: [] });
  }

  let updateReferenceCount = 0;
  const uniqueUpdateReferences = new Set<string>();
  for (const result of results) {
    if (!result.parsed) continue;
    for (const page of result.parsed.updatePages) {
      updateReferenceCount += 1;
      uniqueUpdateReferences.add(`${result.outcome.page}\n${page.uri}`);
      const existing = pages.get(page.uri);
      if (existing) {
        if (!existing.updateHistoryPages.includes(result.outcome.page)) {
          existing.updateHistoryPages.push(result.outcome.page);
          existing.updateHistoryPages.sort((left, right) => left - right);
        }
      } else {
        pages.set(page.uri, {
          ...page,
          currentNavigation: false,
          updateHistoryPages: [result.outcome.page],
        });
      }
    }
  }

  const outcomes = results.map((result) => result.outcome).sort((left, right) => left.page - right.page);
  const uniquePages = [...pages.values()].sort((left, right) => left.uri.localeCompare(right.uri));
  const failedUpdateHistoryPageCount = outcomes.filter((outcome) => !outcome.ok).length;

  return {
    rootUri: MANUAL_ROOT,
    highestUpdateHistoryPage,
    updateHistoryPageCount: highestUpdateHistoryPage + 1,
    successfulUpdateHistoryPageCount: outcomes.length - failedUpdateHistoryPageCount,
    failedUpdateHistoryPageCount,
    currentNavigationPageCount: root.parsed.navigationPages.length,
    updateHistoryOnlyPageCount: uniquePages.filter((page) => !page.currentNavigation).length,
    totalUniqueManualPageCount: uniquePages.length,
    duplicateUpdateReferenceCount: Math.max(0, updateReferenceCount - uniqueUpdateReferences.size),
    outcomes,
    pages: uniquePages,
    acceptanceBoundary:
      "Manual navigation and update-history inventory only. Corpus readiness additionally requires article acquisition, metadata fidelity, version/change evidence, and freshness checks.",
  };
}
