import {
  assertTmclassSourcePageV1,
  type TmclassSourcePageV1,
  type TmclassTaxonomyNodeV1,
} from "@markorbit/contracts";

export const TMCLASS_ORIGIN = "https://euipo.europa.eu";

export type TmclassDomLink = {
  text: string;
  href: string;
};

export type TmclassDomCell = {
  text: string;
  links: TmclassDomLink[];
  marker: boolean;
};

export type TmclassDomRow = {
  className: string;
  cells: TmclassDomCell[];
};

export type TmclassDomTable = {
  headers: string[];
  rows: TmclassDomRow[];
};

export type TmclassDomProjection = {
  heading: string;
  title: string;
  status: string;
  details: Record<string, string>;
  scopeTitle: string;
  taxonomyText: string;
  acceptedOfficeTexts: string[];
  tables: TmclassDomTable[];
  footerText: string;
};

type TmclassRoute =
  | { pageKind: "TERM"; termId: string }
  | { pageKind: "CONCEPT_OVERVIEW"; conceptId: string }
  | { pageKind: "CONCEPT_LANGUAGE"; conceptId: string; languageCode: string };

const LANGUAGE_CODES: Readonly<Record<string, string>> = {
  albanian: "sq",
  arabic: "ar",
  bosnian: "bs",
  bulgarian: "bg",
  catalan: "ca",
  chinese: "zh",
  croatian: "hr",
  czech: "cs",
  danish: "da",
  dutch: "nl",
  english: "en",
  estonian: "et",
  finnish: "fi",
  french: "fr",
  georgian: "ka",
  german: "de",
  greek: "el",
  hebrew: "he",
  hungarian: "hu",
  icelandic: "is",
  irish: "ga",
  italian: "it",
  japanese: "ja",
  korean: "ko",
  latvian: "lv",
  lithuanian: "lt",
  macedonian: "mk",
  maltese: "mt",
  montenegrin: "me",
  norwegian: "no",
  polish: "pl",
  portuguese: "pt",
  romanian: "ro",
  russian: "ru",
  serbian: "sr",
  slovak: "sk",
  slovenian: "sl",
  spanish: "es",
  swedish: "sv",
  turkish: "tr",
  ukrainian: "uk",
};

function text(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function label(value: string): string {
  return text(value).replace(/:\s*$/u, "").toLowerCase();
}

function required(value: string | undefined, name: string): string {
  const normalized = text(value ?? "");
  if (!normalized) throw new Error(`TMCLASS_DOM_${name}_MISSING`);
  return normalized;
}

function integer(value: string | undefined, name: string): number {
  const normalized = required(value, name);
  if (!/^\d+$/u.test(normalized)) throw new Error(`TMCLASS_DOM_${name}_INVALID`);
  return Number(normalized);
}

export function tmclassRoute(sourceUri: string): TmclassRoute {
  const url = new URL(sourceUri);
  if (
    url.origin !== TMCLASS_ORIGIN ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("TMCLASS_SOURCE_URI_INVALID");
  }
  let match = /^\/ec2\/term\/(\d+)$/u.exec(url.pathname);
  if (match) return { pageKind: "TERM", termId: match[1] };
  match = /^\/ec2\/concept\/(\d+)$/u.exec(url.pathname);
  if (match) return { pageKind: "CONCEPT_OVERVIEW", conceptId: match[1] };
  match = /^\/ec2\/concept\/(\d+)\/([a-z]{2,3}(?:-[A-Z]{2})?)$/u.exec(url.pathname);
  if (match) {
    return {
      pageKind: "CONCEPT_LANGUAGE",
      conceptId: match[1],
      languageCode: match[2],
    };
  }
  throw new Error("TMCLASS_SOURCE_ROUTE_UNSUPPORTED");
}

function detail(projection: TmclassDomProjection, name: string): string | undefined {
  const wanted = label(name);
  const entry = Object.entries(projection.details).find(([key]) => label(key) === wanted);
  return entry ? text(entry[1]) : undefined;
}

function table(projection: TmclassDomProjection, headers: string[]): TmclassDomTable {
  const wanted = headers.map(label);
  const found = projection.tables.find((candidate) => {
    const actual = candidate.headers.map(label);
    return wanted.every((header, index) => actual[index] === header);
  });
  if (!found) throw new Error(`TMCLASS_DOM_TABLE_MISSING_${wanted.join("_")}`);
  return found;
}

function linkedId(link: TmclassDomLink | undefined, segment: "term" | "concept"): string {
  if (!link) throw new Error(`TMCLASS_DOM_${segment.toUpperCase()}_LINK_MISSING`);
  const url = new URL(link.href, TMCLASS_ORIGIN);
  if (url.origin !== TMCLASS_ORIGIN || url.search || url.hash) {
    throw new Error(`TMCLASS_DOM_${segment.toUpperCase()}_LINK_INVALID`);
  }
  const match = new RegExp(`^/ec2/${segment}/(\\d+)$`, "u").exec(url.pathname);
  if (!match) throw new Error(`TMCLASS_DOM_${segment.toUpperCase()}_LINK_INVALID`);
  return match[1];
}

function taxonomy(value: string, niceClass: number): TmclassTaxonomyNodeV1[] {
  const labels = value.split(">").map(text).filter(Boolean);
  if (labels.length === 0) labels.push(`Class ${niceClass}`);
  if (!new RegExp(`^Class\\s+${niceClass}$`, "iu").test(labels[0])) {
    labels.unshift(`Class ${niceClass}`);
  }
  return labels.map((nodeLabel) => ({ label: nodeLabel, sourceNodeId: null }));
}

function conceptIdentity(
  projection: TmclassDomProjection,
  route: Exclude<TmclassRoute, { pageKind: "TERM" }>,
) {
  const niceClass = integer(detail(projection, "Class"), "NICE_CLASS");
  return {
    conceptId: route.conceptId,
    title: required(projection.title, "TITLE"),
    status: required(projection.status, "STATUS"),
    niceClass,
    sourceName: required(detail(projection, "Source"), "SOURCE"),
    sourceDateText:
      text(detail(projection, "common.date") ?? detail(projection, "Date") ?? "") || null,
    referenceId: required(detail(projection, "Reference ID"), "REFERENCE_ID"),
    scopeStatus: required(projection.scopeTitle || detail(projection, "Scope"), "SCOPE"),
    taxonomy: taxonomy(projection.taxonomyText, niceClass),
  };
}

function office(value: string): { name: string; code: string | null } {
  const normalized = required(value, "OFFICE");
  const match = /^(.*?)\s*\(([^()]+)\)$/u.exec(normalized);
  return match
    ? { name: required(match[1], "OFFICE_NAME"), code: required(match[2], "OFFICE_CODE") }
    : { name: normalized, code: null };
}

function termPage(
  projection: TmclassDomProjection,
  route: Extract<TmclassRoute, { pageKind: "TERM" }>,
) {
  const niceClass = integer(detail(projection, "Class"), "NICE_CLASS");
  const languageLabel = required(detail(projection, "Language"), "LANGUAGE");
  const languageCode = LANGUAGE_CODES[languageLabel.toLowerCase()];
  if (!languageCode) throw new Error(`TMCLASS_DOM_LANGUAGE_UNSUPPORTED:${languageLabel}`);
  const translations = table(projection, ["Language", "Nice Class", "Text", "Quality"]);
  const sources = table(projection, ["Source", "Concept reference"]);
  return {
    pageKind: "TERM" as const,
    termId: route.termId,
    text: required(projection.title, "TITLE"),
    niceClass,
    languageCode,
    languageLabel,
    acceptedBy: projection.acceptedOfficeTexts.map(office),
    taxonomy: taxonomy(projection.taxonomyText, niceClass),
    translationTargets: translations.rows.map((row) => ({
      termId: linkedId(row.cells[2]?.links[0], "term"),
      languageCode: required(row.cells[0]?.text, "TRANSLATION_LANGUAGE"),
      niceClass: integer(row.cells[1]?.text, "TRANSLATION_CLASS"),
      text: required(row.cells[2]?.text, "TRANSLATION_TEXT"),
      quality: required(row.cells[3]?.text, "TRANSLATION_QUALITY"),
    })),
    sources: sources.rows.map((row) => ({
      conceptId: linkedId(row.cells[1]?.links[0], "concept"),
      sourceName: required(row.cells[0]?.text, "TERM_SOURCE"),
      referenceId: required(row.cells[1]?.text, "TERM_SOURCE_REFERENCE"),
    })),
  };
}

function overviewPage(
  projection: TmclassDomProjection,
  route: Extract<TmclassRoute, { pageKind: "CONCEPT_OVERVIEW" }>,
) {
  const languages = table(projection, [
    "Language",
    "Master term",
    "No. of variants",
    "No. of total terms",
  ]);
  const counts = /No\.\s*of\s*masters:\s*(\d+)\s*\|\s*No\.\s*of\s*variants:\s*(\d+)/iu.exec(
    text(projection.footerText),
  );
  if (!counts) throw new Error("TMCLASS_DOM_CONCEPT_COUNTS_MISSING");
  return {
    pageKind: "CONCEPT_OVERVIEW" as const,
    ...conceptIdentity(projection, route),
    languages: languages.rows.map((row) => ({
      languageCode: required(row.cells[0]?.text, "CONCEPT_LANGUAGE"),
      masterTermId: linkedId(row.cells[1]?.links[0], "term"),
      masterTermText: required(row.cells[1]?.text, "MASTER_TERM"),
      variantCount: integer(row.cells[2]?.text, "VARIANT_COUNT"),
      totalTermCount: integer(row.cells[3]?.text, "TOTAL_TERM_COUNT"),
    })),
    masterCount: Number(counts[1]),
    variantCount: Number(counts[2]),
  };
}

function languagePage(
  projection: TmclassDomProjection,
  route: Extract<TmclassRoute, { pageKind: "CONCEPT_LANGUAGE" }>,
) {
  const terms = table(projection, ["Term", "Master term", "Variant"]);
  return {
    pageKind: "CONCEPT_LANGUAGE" as const,
    ...conceptIdentity(projection, route),
    languageCode: route.languageCode,
    terms: terms.rows.map((row, index) => {
      const role: "MASTER" | "VARIANT" | null =
        row.className.split(/\s+/u).includes("master") || row.cells[1]?.marker
          ? "MASTER"
          : row.className.split(/\s+/u).includes("equivalent") || row.cells[2]?.marker
            ? "VARIANT"
            : null;
      if (!role) throw new Error("TMCLASS_DOM_CONCEPT_TERM_ROLE_MISSING");
      return {
        termId: linkedId(row.cells[0]?.links[0], "term"),
        text: required(row.cells[0]?.text, "CONCEPT_TERM"),
        role,
        ordinal: index + 1,
      };
    }),
  };
}

export function tmclassSourcePageFromDomProjection(
  sourceUri: string,
  projection: TmclassDomProjection,
): TmclassSourcePageV1 {
  const route = tmclassRoute(sourceUri);
  const page =
    route.pageKind === "TERM"
      ? termPage(projection, route)
      : route.pageKind === "CONCEPT_OVERVIEW"
        ? overviewPage(projection, route)
        : languagePage(projection, route);
  assertTmclassSourcePageV1(page);
  return page;
}
