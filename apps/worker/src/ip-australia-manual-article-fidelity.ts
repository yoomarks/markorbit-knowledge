export type IpAustraliaManualAmendment = {
  reason: string;
  dateAmended: string;
};

export type IpAustraliaManualArticle = {
  uri: string;
  title: string;
  datePublished: string | null;
  bodyText: string;
  amendments: IpAustraliaManualAmendment[];
  controlledDocumentNotice: boolean;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function mainHtml(html: string): string {
  const match = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  return match?.[1] ?? html;
}

function extractTitle(html: string): string {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return cleanText(h1?.[1] ?? "");
}

function extractDatePublished(text: string): string | null {
  const match = text.match(/Date\s+Published\s+([0-3]?\d\s+[A-Za-z]{3,9}\s+20\d{2})/i);
  return match?.[1]?.trim() ?? null;
}

function extractAmendments(html: string): IpAustraliaManualAmendment[] {
  const heading = /<h[1-6]\b[^>]*>\s*Amended\s+Reasons\s*<\/h[1-6]>/i.exec(html);
  if (!heading) return [];
  const tail = html.slice((heading.index ?? 0) + heading[0].length);
  const boundary = tail.search(/<h[1-6]\b|Back\s+to\s+top|This\s+document\s+is\s+controlled/i);
  const section = boundary >= 0 ? tail.slice(0, boundary) : tail;
  const rows = [...section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const amendments: IpAustraliaManualAmendment[] = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      cleanText(cell[1]),
    );
    if (cells.length < 2) continue;
    if (/amended\s+reason/i.test(cells[0]) && /date\s+amended/i.test(cells[1])) continue;
    const reason = cells[0];
    const dateAmended = cells[1];
    if (!reason && !dateAmended) continue;
    amendments.push({ reason, dateAmended });
  }
  return amendments;
}

export function parseIpAustraliaManualArticle(html: string, uri: string): IpAustraliaManualArticle {
  const scoped = mainHtml(html);
  const title = extractTitle(scoped);
  const fullText = cleanText(scoped);
  const pageText = cleanText(html);
  const amendmentsIndex = fullText.toLowerCase().indexOf("amended reasons");
  const bodyStart = fullText.toLowerCase().indexOf("date published");
  const afterPublished = bodyStart >= 0 ? fullText.slice(bodyStart) : fullText;
  const bodyText =
    amendmentsIndex >= 0
      ? cleanText(afterPublished.slice(0, afterPublished.toLowerCase().indexOf("amended reasons")))
      : afterPublished;

  return {
    uri,
    title,
    datePublished: extractDatePublished(fullText),
    bodyText,
    amendments: extractAmendments(scoped),
    controlledDocumentNotice: /This\s+document\s+is\s+controlled/i.test(pageText),
  };
}

export type IpAustraliaManualFidelityOutcome = IpAustraliaManualArticle & {
  ok: boolean;
  status?: number;
  contentType?: string;
  error?: string;
};

export const IP_AUSTRALIA_MANUAL_FIDELITY_SAMPLES = [
  "https://manuals.ipaustralia.gov.au/trademark/3.-amendment-before-particulars-of-an-application-are-published-section-64",
  "https://manuals.ipaustralia.gov.au/trademark/4.-amendment-after-particulars-of-an-application-have-been-published-sections-63-65-and-65a",
  "https://manuals.ipaustralia.gov.au/trademark/1.-introduction7",
] as const;

export async function auditIpAustraliaManualFidelity(
  fetcher: typeof fetch = fetch,
  uris: readonly string[] = IP_AUSTRALIA_MANUAL_FIDELITY_SAMPLES,
): Promise<IpAustraliaManualFidelityOutcome[]> {
  const outcomes: IpAustraliaManualFidelityOutcome[] = [];
  for (const uri of uris) {
    try {
      const response = await fetcher(uri, {
        headers: {
          "user-agent": "MarkOrbit-Knowledge/1.0 manual-fidelity",
          accept: "text/html,application/xhtml+xml",
        },
      });
      const contentType = response.headers.get("content-type") ?? undefined;
      if (!response.ok) {
        outcomes.push({
          uri,
          title: "",
          datePublished: null,
          bodyText: "",
          amendments: [],
          controlledDocumentNotice: false,
          ok: false,
          status: response.status,
          contentType,
          error: `${uri} returned HTTP ${response.status}`,
        });
        continue;
      }
      const article = parseIpAustraliaManualArticle(await response.text(), uri);
      const ok =
        article.title.length > 0 &&
        article.datePublished !== null &&
        article.bodyText.length >= 100 &&
        article.amendments.length > 0 &&
        article.controlledDocumentNotice;
      outcomes.push({
        ...article,
        ok,
        status: response.status,
        contentType,
        ...(!ok ? { error: "Required manual fidelity fields were incomplete" } : {}),
      });
    } catch (error) {
      outcomes.push({
        uri,
        title: "",
        datePublished: null,
        bodyText: "",
        amendments: [],
        controlledDocumentNotice: false,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return outcomes;
}
