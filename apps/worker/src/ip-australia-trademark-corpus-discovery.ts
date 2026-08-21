export type IpAustraliaTrademarkDomain =
  | "TRADEMARK_BASICS"
  | "SEARCH"
  | "TIMEFRAMES_FEES"
  | "APPLY"
  | "TM_HEADSTART_CHECKER"
  | "EXAMINATION"
  | "OPPOSITION"
  | "REGISTRATION_RENEWAL"
  | "OWNERSHIP_COMMERCIALISATION"
  | "NON_USE_CHALLENGE"
  | "FORMS_SYSTEMS"
  | "PRACTICE_MANUAL"
  | "NEWS_SERVICE_LEVELS";

export type IpAustraliaCorpusSeed = {
  domain: IpAustraliaTrademarkDomain;
  uri: string;
  label: string;
};

export type IpAustraliaDiscoveredLink = {
  domain: IpAustraliaTrademarkDomain;
  uri: string;
  label: string;
};

export const IP_AUSTRALIA_TRADEMARK_CORPUS_SEEDS: readonly IpAustraliaCorpusSeed[] = [
  {
    domain: "TRADEMARK_BASICS",
    uri: "https://www.ipaustralia.gov.au/trade-marks",
    label: "Trade marks",
  },
  {
    domain: "SEARCH",
    uri: "https://www.ipaustralia.gov.au/trade-marks/search-existing-trade-marks",
    label: "Search existing trade marks",
  },
  {
    domain: "TIMEFRAMES_FEES",
    uri: "https://www.ipaustralia.gov.au/trade-marks/timeframes-and-fees",
    label: "Trade mark timeframes and fees",
  },
  {
    domain: "APPLY",
    uri: "https://www.ipaustralia.gov.au/trade-marks/how-to-apply-for-a-trade-mark",
    label: "How to apply for a trade mark",
  },
  {
    domain: "TM_HEADSTART_CHECKER",
    uri: "https://www.ipaustralia.gov.au/trade-marks/search-existing-trade-marks/tm-checker/options",
    label: "TM Checker application options",
  },
  {
    domain: "EXAMINATION",
    uri: "https://www.ipaustralia.gov.au/trade-marks/how-to-respond-to-an-examination-report",
    label: "Respond to an examination report",
  },
  {
    domain: "OPPOSITION",
    uri: "https://www.ipaustralia.gov.au/trade-marks/how-to-respond-to-an-opposition",
    label: "Respond to a trade mark opposition",
  },
  {
    domain: "REGISTRATION_RENEWAL",
    uri: "https://www.ipaustralia.gov.au/manage-my-ip/how-to-renew-my-ip-right",
    label: "Renew my IP right",
  },
  {
    domain: "OWNERSHIP_COMMERCIALISATION",
    uri: "https://www.ipaustralia.gov.au/manage-my-ip/how-to-update-my-ip-right-details/how-to-assign-ownership-of-a-trade-mark",
    label: "Assign ownership of a trade mark",
  },
  {
    domain: "NON_USE_CHALLENGE",
    uri: "https://www.ipaustralia.gov.au/tools-and-research/forms/application-for-removal-cessation-of-protection-for-non-use",
    label: "Removal or cessation for non-use",
  },
  {
    domain: "FORMS_SYSTEMS",
    uri: "https://www.ipaustralia.gov.au/tools-and-research/forms",
    label: "IP Australia forms",
  },
  {
    domain: "PRACTICE_MANUAL",
    uri: "https://manuals.ipaustralia.gov.au/trademark",
    label: "Trade Marks Manual of Practice and Procedure",
  },
  {
    domain: "NEWS_SERVICE_LEVELS",
    uri: "https://www.ipaustralia.gov.au/about-us/customer-service-charter/timeliness",
    label: "IP Australia timeliness and service levels",
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

function classify(url: URL, label: string): IpAustraliaTrademarkDomain | null {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const text = label.toLowerCase();

  if (host === "manuals.ipaustralia.gov.au" && path.startsWith("/trademark"))
    return "PRACTICE_MANUAL";

  // Generic navigation labels such as "How to apply" and "Timeframes and fees"
  // also appear under patents, designs and PBR. A trademark corpus must not admit
  // those pages merely because the anchor text looks relevant.
  if (
    path.startsWith("/patents") ||
    path.startsWith("/design-rights") ||
    path.startsWith("/plant-breeders-rights")
  )
    return null;

  if (path.includes("tm-checker") || text.includes("tm checker") || text.includes("headstart"))
    return "TM_HEADSTART_CHECKER";
  if (path.includes("timeframes-and-fees") || text.includes("timeframes and fees"))
    return "TIMEFRAMES_FEES";
  if (
    path.includes("how-to-respond-to-an-examination-report") ||
    text.includes("examination report")
  )
    return "EXAMINATION";
  if (path.includes("opposition") || text.includes("opposition")) return "OPPOSITION";
  if (path.includes("non-use") || text.includes("non-use")) return "NON_USE_CHALLENGE";
  if (path.includes("how-to-renew-my-ip-right") || text.includes("renew your trade mark"))
    return "REGISTRATION_RENEWAL";
  if (
    path.includes("assign-ownership-of-a-trade-mark") ||
    path.includes("how-to-commercialise-my-ip") ||
    path.includes("how-to-license-my-ip") ||
    text.includes("assign ownership") ||
    text.includes("license my ip")
  )
    return "OWNERSHIP_COMMERCIALISATION";
  if (
    path.includes("tools-and-research/forms") ||
    text === "online services" ||
    text.includes("form")
  )
    return "FORMS_SYSTEMS";
  if (path.includes("customer-service-charter/timeliness") || path.includes("/news"))
    return "NEWS_SERVICE_LEVELS";
  if (path.includes("search-existing-trade-marks") || text.includes("trade mark search"))
    return "SEARCH";
  if (path.includes("how-to-apply-for-a-trade-mark") || text.includes("how to apply"))
    return "APPLY";
  if (path === "/trade-marks" || path === "/trade-marks/") return "TRADEMARK_BASICS";
  return null;
}

export function extractIpAustraliaTrademarkLinks(
  html: string,
  sourceUri: string,
): IpAustraliaDiscoveredLink[] {
  const base = new URL(sourceUri);
  const discovered = new Map<string, IpAustraliaDiscoveredLink>();
  const anchor = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchor)) {
    const href = decodeHtml(match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (
      !href ||
      /^['"]+$/.test(href) ||
      href.startsWith("#") ||
      href.toLowerCase().startsWith("javascript:")
    )
      continue;

    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }

    const host = url.hostname.toLowerCase();
    if (host !== "ipaustralia.gov.au" && !host.endsWith(".ipaustralia.gov.au")) continue;
    if (host.includes(".dev.")) continue;

    const label = cleanText(match[4] ?? "") || url.toString();
    const domain = classify(url, label);
    if (!domain) continue;

    url.hash = "";
    const uri = url.toString();
    if (!discovered.has(uri)) discovered.set(uri, { domain, uri, label });
  }

  return [...discovered.values()].sort((left, right) => left.uri.localeCompare(right.uri));
}

export function summarizeIpAustraliaDomains(
  links: readonly IpAustraliaDiscoveredLink[],
): Record<IpAustraliaTrademarkDomain, number> {
  const counts: Record<IpAustraliaTrademarkDomain, number> = {
    TRADEMARK_BASICS: 0,
    SEARCH: 0,
    TIMEFRAMES_FEES: 0,
    APPLY: 0,
    TM_HEADSTART_CHECKER: 0,
    EXAMINATION: 0,
    OPPOSITION: 0,
    REGISTRATION_RENEWAL: 0,
    OWNERSHIP_COMMERCIALISATION: 0,
    NON_USE_CHALLENGE: 0,
    FORMS_SYSTEMS: 0,
    PRACTICE_MANUAL: 0,
    NEWS_SERVICE_LEVELS: 0,
  };
  for (const link of links) counts[link.domain] += 1;
  return counts;
}
