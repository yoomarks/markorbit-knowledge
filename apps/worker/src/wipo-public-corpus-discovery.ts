export type WipoTrademarkDomain =
  | "MADRID_SYSTEM"
  | "MEMBERS"
  | "DECLARATIONS"
  | "MEMBER_PROFILES"
  | "LEGAL_TEXTS"
  | "FEES"
  | "FORMS"
  | "FIND_MONITOR"
  | "GLOBAL_BRAND_DATABASE"
  | "NICE"
  | "VIENNA"
  | "GUIDES_HELP"
  | "NEWS_NOTICES";

export type WipoCorpusSeed = {
  domain: WipoTrademarkDomain;
  uri: string;
  label: string;
};

export type WipoDiscoveredLink = {
  domain: WipoTrademarkDomain;
  uri: string;
  label: string;
};

export const WIPO_TRADEMARK_CORPUS_SEEDS: readonly WipoCorpusSeed[] = [
  {
    domain: "MADRID_SYSTEM",
    uri: "https://www.wipo.int/en/web/madrid-system/",
    label: "Madrid System",
  },
  {
    domain: "MEMBERS",
    uri: "https://www.wipo.int/en/web/madrid-system/members/index",
    label: "Madrid System members",
  },
  {
    domain: "DECLARATIONS",
    uri: "https://www.wipo.int/en/web/madrid-system/members/declarations",
    label: "Member declarations and notifications",
  },
  {
    domain: "MEMBER_PROFILES",
    uri: "https://www.wipo.int/madrid/memberprofiles/",
    label: "Madrid Member Profiles",
  },
  {
    domain: "LEGAL_TEXTS",
    uri: "https://www.wipo.int/en/web/madrid-system/legal_texts/index",
    label: "Madrid legal texts",
  },
  {
    domain: "FEES",
    uri: "https://www.wipo.int/en/web/madrid-system/fees/sched",
    label: "Madrid schedule of fees",
  },
  {
    domain: "FORMS",
    uri: "https://www.wipo.int/en/web/madrid-system/forms/index",
    label: "Madrid forms",
  },
  {
    domain: "FIND_MONITOR",
    uri: "https://www.wipo.int/en/web/emadrid/find-and-monitor",
    label: "eMadrid find and monitor",
  },
  {
    domain: "GLOBAL_BRAND_DATABASE",
    uri: "https://www.wipo.int/en/web/global-brand-database",
    label: "Global Brand Database",
  },
  {
    domain: "NICE",
    uri: "https://www.wipo.int/en/web/classification-nice/index",
    label: "Nice Classification",
  },
  {
    domain: "VIENNA",
    uri: "https://www.wipo.int/en/web/classification-vienna",
    label: "Vienna Classification",
  },
  {
    domain: "GUIDES_HELP",
    uri: "https://www.wipo.int/en/web/madrid-system/how_to",
    label: "Madrid guides and how-to",
  },
  {
    domain: "NEWS_NOTICES",
    uri: "https://www.wipo.int/en/web/madrid-system/notices",
    label: "Madrid information notices",
  },
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

function classify(url: URL, label: string): WipoTrademarkDomain | null {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const text = label.toLowerCase();

  if (path.includes("memberprofiles")) return "MEMBER_PROFILES";
  if (path.includes("members/declarations") || text.includes("declarations and notifications"))
    return "DECLARATIONS";
  if (path.includes("madrid-system/members")) return "MEMBERS";
  if (path.includes("legal_texts") || text.includes("legal texts")) return "LEGAL_TEXTS";
  if (path.includes("/fees/") || (host === "madrid.wipo.int" && path.includes("feecalcapp")))
    return "FEES";
  if (path.includes("/forms/")) return "FORMS";
  if (path.includes("find-and-monitor") || text.includes("madrid monitor")) return "FIND_MONITOR";
  if (host === "branddb.wipo.int" || path.includes("global-brand-database"))
    return "GLOBAL_BRAND_DATABASE";
  if (host === "nclpub.wipo.int" || path.includes("classification-nice")) return "NICE";
  if (path.includes("classification-vienna") || text.includes("vienna classification"))
    return "VIENNA";
  if (path.includes("/how_to") || text.includes("how to") || text.includes("guide"))
    return "GUIDES_HELP";
  if (path.includes("/notices") || path.includes("/news") || text.includes("information notice"))
    return "NEWS_NOTICES";
  if (path.includes("madrid-system")) return "MADRID_SYSTEM";
  return null;
}

export function extractWipoTrademarkLinks(html: string, sourceUri: string): WipoDiscoveredLink[] {
  const base = new URL(sourceUri);
  const discovered = new Map<string, WipoDiscoveredLink>();
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

    const label = cleanText(match[4] ?? "") || url.toString();
    const domain = classify(url, label);
    if (!domain) continue;

    url.hash = "";
    const uri = url.toString();
    if (!discovered.has(uri)) discovered.set(uri, { domain, uri, label });
  }

  return [...discovered.values()].sort((left, right) => left.uri.localeCompare(right.uri));
}

export function summarizeWipoDomains(
  links: readonly WipoDiscoveredLink[],
): Record<WipoTrademarkDomain, number> {
  const counts: Record<WipoTrademarkDomain, number> = {
    MADRID_SYSTEM: 0,
    MEMBERS: 0,
    DECLARATIONS: 0,
    MEMBER_PROFILES: 0,
    LEGAL_TEXTS: 0,
    FEES: 0,
    FORMS: 0,
    FIND_MONITOR: 0,
    GLOBAL_BRAND_DATABASE: 0,
    NICE: 0,
    VIENNA: 0,
    GUIDES_HELP: 0,
    NEWS_NOTICES: 0,
  };
  for (const link of links) counts[link.domain] += 1;
  return counts;
}
