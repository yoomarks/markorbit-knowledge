const BASE_URL = "https://euipo.europa.eu/ec2";

export const TMCLASS_DATA_LANGUAGES = [
  "sq",
  "ar",
  "bs",
  "bg",
  "km",
  "zh",
  "hr",
  "cs",
  "da",
  "nl",
  "en",
  "et",
  "fi",
  "fr",
  "ka",
  "de",
  "el",
  "he",
  "hu",
  "is",
  "it",
  "ja",
  "ko",
  "lo",
  "lv",
  "lt",
  "mk",
  "mt",
  "me",
  "no",
  "pl",
  "pt",
  "ro",
  "ru",
  "sr",
  "sk",
  "sl",
  "es",
  "sv",
  "th",
  "tr",
] as const;

export type TmclassDataLanguage = (typeof TMCLASS_DATA_LANGUAGES)[number];

export type TmclassSearchResult = {
  totalResults: number;
  totalPages: number;
  termIds: string[];
  elasticMaxResults: boolean;
};

export type TmclassDetailLinks = {
  termIds: string[];
  conceptIds: string[];
  conceptLanguageRoutes: string[];
};

export type TmclassHarEntry = {
  sourceUri: string;
  observedAt: string;
  html: string;
};

function attributes(tag: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gu)) {
    result.set(match[1]!.toLowerCase(), match[3]!);
  }
  return result;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

export function parseTmclassOfficeCodes(html: string): string[] {
  const codes: string[] = [];
  for (const match of html.matchAll(/<input\b[^>]*>/giu)) {
    const input = attributes(match[0]);
    if (input.get("name") !== "officeList") continue;
    const code = input.get("value")?.trim();
    if (code && /^[A-Z0-9]{2,8}$/u.test(code)) codes.push(code);
  }
  return uniqueSorted(codes);
}

function inputValue(html: string, name: string): string | undefined {
  for (const match of html.matchAll(/<input\b[^>]*>/giu)) {
    const input = attributes(match[0]);
    if (input.get("name") === name) return input.get("value");
  }
  return undefined;
}

export function parseTmclassSearchResult(html: string, pageSize = 100): TmclassSearchResult {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error("TMCLASS_SEARCH_PAGE_SIZE_INVALID");
  }
  const totalRaw = inputValue(html, "totalResults");
  if (!totalRaw || !/^\d+$/u.test(totalRaw)) {
    throw new Error("TMCLASS_SEARCH_TOTAL_RESULTS_MISSING");
  }
  const totalResults = Number(totalRaw);
  const termIds = uniqueSorted(
    [
      ...html.matchAll(
        /(?:href=["'](?:https:\/\/euipo\.europa\.eu)?\/ec2)?\/term\/(\d+)(?:[?"'#<\s]|$)/giu,
      ),
    ].map((match) => match[1]!),
  );
  const elasticRaw = inputValue(html, "elasticMaxResults");
  const elasticMaxResults =
    elasticRaw?.toLowerCase() === "true" || /[?&]elasticMaxResults=true(?:&|["'])/iu.test(html);
  return {
    totalResults,
    totalPages: totalResults === 0 ? 0 : Math.ceil(totalResults / pageSize),
    termIds,
    elasticMaxResults,
  };
}

export function parseTmclassDetailLinks(html: string): TmclassDetailLinks {
  const termIds = new Set<string>();
  const conceptIds = new Set<string>();
  const conceptLanguageRoutes = new Set<string>();
  for (const match of html.matchAll(
    /(?:https:\/\/euipo\.europa\.eu)?\/ec2\/(term|concept)\/(\d+)(?:\/([a-z]{2,3}))?(?=[?"'#<\s]|$)/giu,
  )) {
    const [, kind, id, language] = match;
    if (kind?.toLowerCase() === "term") {
      termIds.add(id!);
    } else {
      conceptIds.add(id!);
      if (language) conceptLanguageRoutes.add(`/ec2/concept/${id}/${language.toLowerCase()}`);
    }
  }
  return {
    termIds: uniqueSorted(termIds),
    conceptIds: uniqueSorted(conceptIds),
    conceptLanguageRoutes: uniqueSorted(conceptLanguageRoutes),
  };
}

export function tmclassOfficeConfigurationUrl(language: string): string {
  return `${BASE_URL}/search/ajax_headingsofficesources/${encodeURIComponent(language)}`;
}

export function tmclassSearchUrl(input: {
  language: string;
  officeCodes: readonly string[];
  page: number;
  niceClass?: string;
}): string {
  if (!Number.isSafeInteger(input.page) || input.page < 1) {
    throw new Error("TMCLASS_SEARCH_PAGE_INVALID");
  }
  const query = new URLSearchParams({
    language: input.language,
    text: "",
    niceClass: input.niceClass ?? "1-45",
    size: "100",
    page: String(input.page),
    harmonised: "true",
    searchMode: "WORDSPREFIX",
    sortBy: "relevance",
    showOnlyMasterOrRep: "false",
  });
  for (const officeCode of uniqueSorted(input.officeCodes)) {
    query.append("officeList", officeCode);
  }
  return `${BASE_URL}/search/ajaxSearch?${query.toString()}`;
}

export function tmclassRouteUrl(route: string): string {
  if (!/^\/ec2\/(?:term\/\d+|concept\/\d+(?:\/[a-z]{2,3})?)$/u.test(route)) {
    throw new Error("TMCLASS_DETAIL_ROUTE_INVALID");
  }
  return `https://euipo.europa.eu${route}`;
}

export function tmclassHar(entries: readonly TmclassHarEntry[]): object {
  return {
    log: {
      version: "1.2",
      creator: { name: "MarkOrbit Knowledge TMclass live corpus capture", version: "1.0.0" },
      entries: entries.map((entry) => ({
        startedDateTime: entry.observedAt,
        request: { method: "GET", url: entry.sourceUri },
        response: {
          status: 200,
          content: {
            size: Buffer.byteLength(entry.html, "utf8"),
            mimeType: "text/html;charset=UTF-8",
            text: entry.html,
          },
        },
      })),
    },
  };
}

export function assertTmclassRobotsAllowsPublicEc2(robots: string): void {
  let applies = false;
  for (const rawLine of robots.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      applies = value === "*";
      continue;
    }
    if (applies && field === "disallow" && /^\/ec2(?:\/|$)/u.test(value)) {
      throw new Error("TMCLASS_ROBOTS_DISALLOWS_PUBLIC_EC2");
    }
  }
}
