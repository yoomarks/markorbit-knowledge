const MANUAL_ROOT = "https://manuals.ipaustralia.gov.au/trademark";

export type IpAustraliaManualPage = {
  uri: string;
  label: string;
  listingPages: number[];
};

export type IpAustraliaManualListingOutcome = {
  page: number;
  uri: string;
  ok: boolean;
  status?: number;
  discoveredManualPageCount: number;
  error?: string;
};

export type IpAustraliaManualInventoryReport = {
  rootUri: string;
  highestListingPage: number;
  listingPageCount: number;
  successfulListingPageCount: number;
  failedListingPageCount: number;
  uniqueManualPageCount: number;
  duplicateReferenceCount: number;
  outcomes: IpAustraliaManualListingOutcome[];
  pages: IpAustraliaManualPage[];
  acceptanceBoundary: string;
};

type ParsedListing = {
  highestListingPage: number;
  pages: Array<{ uri: string; label: string }>;
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

export function parseIpAustraliaManualListing(html: string, sourceUri: string): ParsedListing {
  const base = new URL(sourceUri);
  const pages = new Map<string, { uri: string; label: string }>();
  let highestListingPage = 0;
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

    if (url.hostname.toLowerCase() !== "manuals.ipaustralia.gov.au") continue;
    if (url.pathname.toLowerCase() === "/trademark" || url.pathname.toLowerCase() === "/trademark/") {
      const page = Number.parseInt(url.searchParams.get("page") ?? "0", 10);
      if (Number.isFinite(page) && page >= 0) highestListingPage = Math.max(highestListingPage, page);
      continue;
    }

    if (!isManualArticle(url)) continue;
    url.hash = "";
    const uri = url.toString();
    if (!pages.has(uri)) pages.set(uri, { uri, label: cleanText(match[4] ?? "") || uri });
  }

  return {
    highestListingPage,
    pages: [...pages.values()].sort((left, right) => left.uri.localeCompare(right.uri)),
  };
}

function listingUri(page: number): string {
  return page === 0 ? MANUAL_ROOT : `${MANUAL_ROOT}?page=${page}`;
}

async function fetchListingPage(
  page: number,
  fetcher: typeof fetch,
): Promise<{ outcome: IpAustraliaManualListingOutcome; parsed?: ParsedListing }> {
  const uri = listingUri(page);
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
          discoveredManualPageCount: 0,
          error: `${uri} returned HTTP ${response.status}`,
        },
      };
    }
    const parsed = parseIpAustraliaManualListing(await response.text(), uri);
    return {
      outcome: {
        page,
        uri,
        ok: true,
        status: response.status,
        discoveredManualPageCount: parsed.pages.length,
      },
      parsed,
    };
  } catch (error) {
    return {
      outcome: {
        page,
        uri,
        ok: false,
        discoveredManualPageCount: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function inventoryIpAustraliaManual(
  fetcher: typeof fetch = fetch,
): Promise<IpAustraliaManualInventoryReport> {
  const root = await fetchListingPage(0, fetcher);
  if (!root.parsed) {
    return {
      rootUri: MANUAL_ROOT,
      highestListingPage: 0,
      listingPageCount: 1,
      successfulListingPageCount: 0,
      failedListingPageCount: 1,
      uniqueManualPageCount: 0,
      duplicateReferenceCount: 0,
      outcomes: [root.outcome],
      pages: [],
      acceptanceBoundary:
        "Listing inventory only. Manual corpus readiness additionally requires article acquisition, metadata fidelity, version/change evidence, and freshness checks.",
    };
  }

  const highestListingPage = root.parsed.highestListingPage;
  const remainingPages = Array.from({ length: highestListingPage }, (_, index) => index + 1);
  const results = [root];

  for (let offset = 0; offset < remainingPages.length; offset += 4) {
    const batch = remainingPages.slice(offset, offset + 4);
    results.push(...(await Promise.all(batch.map((page) => fetchListingPage(page, fetcher)))));
  }

  const pages = new Map<string, IpAustraliaManualPage>();
  let referenceCount = 0;
  for (const result of results) {
    if (!result.parsed) continue;
    for (const page of result.parsed.pages) {
      referenceCount += 1;
      const existing = pages.get(page.uri);
      if (existing) {
        if (!existing.listingPages.includes(result.outcome.page)) {
          existing.listingPages.push(result.outcome.page);
          existing.listingPages.sort((left, right) => left - right);
        }
      } else {
        pages.set(page.uri, {
          ...page,
          listingPages: [result.outcome.page],
        });
      }
    }
  }

  const outcomes = results.map((result) => result.outcome).sort((left, right) => left.page - right.page);
  const uniquePages = [...pages.values()].sort((left, right) => left.uri.localeCompare(right.uri));
  const failedListingPageCount = outcomes.filter((outcome) => !outcome.ok).length;

  return {
    rootUri: MANUAL_ROOT,
    highestListingPage,
    listingPageCount: highestListingPage + 1,
    successfulListingPageCount: outcomes.length - failedListingPageCount,
    failedListingPageCount,
    uniqueManualPageCount: uniquePages.length,
    duplicateReferenceCount: Math.max(0, referenceCount - uniquePages.length),
    outcomes,
    pages: uniquePages,
    acceptanceBoundary:
      "Listing inventory only. Manual corpus readiness additionally requires article acquisition, metadata fidelity, version/change evidence, and freshness checks.",
  };
}
