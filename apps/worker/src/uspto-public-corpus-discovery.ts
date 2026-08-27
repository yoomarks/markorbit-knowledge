export type UsptoTrademarkDomain =
  | "ROOT"
  | "BASICS"
  | "FILING"
  | "FEE"
  | "EXAMINATION"
  | "TMEP"
  | "TMEP_ARCHIVE"
  | "EXAMINATION_GUIDES"
  | "POST_REGISTRATION"
  | "TTAB_TBMP"
  | "MADRID"
  | "FORMS_SYSTEMS"
  | "FAQ"
  | "TRAINING_VIDEO"
  | "LAWS_POLICY";

export type UsptoCorpusSeed = {
  domain: UsptoTrademarkDomain;
  uri: string;
  label: string;
};

export type UsptoDiscoveredLink = {
  domain: UsptoTrademarkDomain;
  uri: string;
  label: string;
};

export const USPTO_TRADEMARK_CORPUS_SEEDS: readonly UsptoCorpusSeed[] = [
  { domain: "ROOT", uri: "https://www.uspto.gov/trademarks", label: "Trademarks home" },
  { domain: "BASICS", uri: "https://www.uspto.gov/trademarks/basics", label: "Trademark basics" },
  {
    domain: "FILING",
    uri: "https://www.uspto.gov/trademarks/apply",
    label: "Apply for a trademark",
  },
  {
    domain: "FILING",
    uri: "https://www.uspto.gov/trademarks/apply/base-application-requirements",
    label: "Base application requirements",
  },
  {
    domain: "FEE",
    uri: "https://www.uspto.gov/trademarks/trademark-fee-information",
    label: "Trademark fee information",
  },
  {
    domain: "TMEP",
    uri: "https://www.uspto.gov/trademarks/guides-and-manuals/manuals-guides-official-gazette",
    label: "Guides, manuals, and resources",
  },
  {
    domain: "TMEP_ARCHIVE",
    uri: "https://www.uspto.gov/trademarks/guides-and-manuals/tmep-archives",
    label: "TMEP files and archives",
  },
  {
    domain: "EXAMINATION_GUIDES",
    uri: "https://www.uspto.gov/trademarks/guides-and-manuals/trademark-examination-guides",
    label: "Trademark examination guides",
  },
  {
    domain: "POST_REGISTRATION",
    uri: "https://www.uspto.gov/trademarks/maintain",
    label: "Maintain your registration",
  },
  {
    domain: "FAQ",
    uri: "https://www.uspto.gov/trademarks/maintain/post-registration-faqs",
    label: "Post-registration FAQs",
  },
  {
    domain: "TTAB_TBMP",
    uri: "https://www.uspto.gov/trademarks/trademark-trial-and-appeal-board",
    label: "Trademark Trial and Appeal Board",
  },
  {
    domain: "MADRID",
    uri: "https://www.uspto.gov/trademarks/laws/madrid-protocol",
    label: "Madrid Protocol",
  },
  {
    domain: "FORMS_SYSTEMS",
    uri: "https://www.uspto.gov/trademarks/apply/trademark-center-updates-and-training",
    label: "Trademark Center updates and training",
  },
  {
    domain: "TRAINING_VIDEO",
    uri: "https://www.uspto.gov/trademarks/videos",
    label: "Trademark videos",
  },
  {
    domain: "LAWS_POLICY",
    uri: "https://www.uspto.gov/trademarks/laws",
    label: "Trademark laws and regulations",
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

function classify(url: URL, label: string): UsptoTrademarkDomain | null {
  const hostname = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const text = label.toLowerCase();

  if (hostname === "tmep.uspto.gov") return "TMEP";
  if (path.includes("tmep-archives")) return "TMEP_ARCHIVE";
  if (path.includes("trademark-examination-guides") || text.includes("examination guide"))
    return "EXAMINATION_GUIDES";
  if (path.includes("guides-and-manuals") && (text.includes("tmep") || text.includes("manual")))
    return "TMEP";
  if (path.includes("trial-and-appeal") || text.includes("tbmp") || text.includes("ttab"))
    return "TTAB_TBMP";
  if (path.includes("madrid") || text.includes("madrid protocol")) return "MADRID";
  if (path.includes("trademark-fee-information") || text.includes("trademark fee information"))
    return "FEE";
  if (
    path.includes("post-registration") ||
    path.includes("/maintain") ||
    text.includes("section 8")
  )
    return "POST_REGISTRATION";
  if (path.includes("faq") || text.includes("frequently asked")) return "FAQ";
  if (path.includes("/videos") || text.includes("webinar") || text.includes("training video"))
    return "TRAINING_VIDEO";
  if (
    path.includes("trademark-center") ||
    path.includes("/forms") ||
    text.includes("trademark center")
  )
    return "FORMS_SYSTEMS";
  if (path.includes("/laws") || path.includes("federal-register") || text.includes("rule making"))
    return "LAWS_POLICY";
  if (
    path.includes("office-action") ||
    text.includes("office action") ||
    text.includes("examination")
  )
    return "EXAMINATION";
  if (
    path.includes("/apply") ||
    text.includes("application requirement") ||
    text.includes("filing basis")
  )
    return "FILING";
  if (path.includes("/basics")) return "BASICS";
  if (path === "/trademarks" || path === "/trademarks/") return "ROOT";
  return null;
}

export function extractUsptoTrademarkLinks(html: string, sourceUri: string): UsptoDiscoveredLink[] {
  const base = new URL(sourceUri);
  const discovered = new Map<string, UsptoDiscoveredLink>();
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
    if (!url.pathname.toLowerCase().includes("trademark") && hostname !== "tmep.uspto.gov")
      continue;

    const label = cleanText(match[4] ?? "") || url.toString();
    const domain = classify(url, label);
    if (!domain) continue;

    url.hash = "";
    const uri = url.toString();
    if (!discovered.has(uri)) discovered.set(uri, { domain, uri, label });
  }

  return [...discovered.values()].sort((left, right) => left.uri.localeCompare(right.uri));
}

export function summarizeUsptoDomains(
  links: readonly UsptoDiscoveredLink[],
): Record<UsptoTrademarkDomain, number> {
  const counts: Record<UsptoTrademarkDomain, number> = {
    ROOT: 0,
    BASICS: 0,
    FILING: 0,
    FEE: 0,
    EXAMINATION: 0,
    TMEP: 0,
    TMEP_ARCHIVE: 0,
    EXAMINATION_GUIDES: 0,
    POST_REGISTRATION: 0,
    TTAB_TBMP: 0,
    MADRID: 0,
    FORMS_SYSTEMS: 0,
    FAQ: 0,
    TRAINING_VIDEO: 0,
    LAWS_POLICY: 0,
  };
  for (const link of links) counts[link.domain] += 1;
  return counts;
}
