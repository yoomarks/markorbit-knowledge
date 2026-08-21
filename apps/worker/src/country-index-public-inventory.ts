export type CountryIndexInventoryKind =
  "COUNTRY_SURVEY" | "MULTINATIONAL_AGREEMENT" | "NEWS" | "IP_OFFICE_ADDRESSES" | "COUNTRY_CODES";

export type CountryIndexInventoryItem = {
  kind: CountryIndexInventoryKind;
  label: string;
  uri: string;
};

export type CountryIndexInventory = {
  sourceUri: string;
  itemCount: number;
  counts: Record<CountryIndexInventoryKind, number>;
  items: CountryIndexInventoryItem[];
};

const EMPTY_COUNTS: Record<CountryIndexInventoryKind, number> = {
  COUNTRY_SURVEY: 0,
  MULTINATIONAL_AGREEMENT: 0,
  NEWS: 0,
  IP_OFFICE_ADDRESSES: 0,
  COUNTRY_CODES: 0,
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function text(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function classify(url: URL): CountryIndexInventoryKind | null {
  const path = url.pathname.toLowerCase();
  if (path.endsWith("/country_surveys.aspx") && url.searchParams.has("ID")) return "COUNTRY_SURVEY";
  if (path.endsWith("/agreement.aspx") && url.searchParams.has("ID"))
    return "MULTINATIONAL_AGREEMENT";
  if (path.endsWith("/newsletter.aspx")) return "NEWS";
  if (path.endsWith("/general_info_offices.aspx")) return "IP_OFFICE_ADDRESSES";
  if (path.endsWith("/general_info_iso.aspx")) return "COUNTRY_CODES";
  return null;
}

export function extractCountryIndexPublicInventory(
  html: string,
  sourceUri = "https://www.country-index.com/",
): CountryIndexInventory {
  const base = new URL(sourceUri);
  const discovered = new Map<string, CountryIndexInventoryItem>();
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
    if (url.hostname.toLowerCase() !== base.hostname.toLowerCase()) continue;
    const kind = classify(url);
    if (!kind) continue;
    url.hash = "";
    const uri = url.toString();
    if (discovered.has(uri)) continue;
    discovered.set(uri, {
      kind,
      label: text(match[4] ?? "") || uri,
      uri,
    });
  }

  const items = [...discovered.values()].sort((left, right) => left.uri.localeCompare(right.uri));
  const counts = { ...EMPTY_COUNTS };
  for (const item of items) counts[item.kind] += 1;
  return { sourceUri: base.toString(), itemCount: items.length, counts, items };
}
