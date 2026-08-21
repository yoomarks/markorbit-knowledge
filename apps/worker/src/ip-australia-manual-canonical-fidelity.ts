import { normalizeHtmlToMarkdown } from "@markorbit/worker-runtime";
import {
  IP_AUSTRALIA_MANUAL_FIDELITY_SAMPLES,
  parseIpAustraliaManualArticle,
  type IpAustraliaManualArticle,
} from "./ip-australia-manual-article-fidelity";

export type IpAustraliaCanonicalFidelityOutcome = {
  uri: string;
  ok: boolean;
  status?: number;
  contentType?: string;
  source: IpAustraliaManualArticle;
  markdownLength: number;
  titlePreserved: boolean;
  publishedDatePreserved: boolean;
  bodyEvidencePreserved: boolean;
  amendmentsPreserved: boolean;
  controlledNoticePreserved: boolean;
  error?: string;
};

function plainText(value: string): string {
  return value
    .replace(/[`*_>#\[\]()|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function bodyProbe(article: IpAustraliaManualArticle): string {
  const text = plainText(article.bodyText);
  return text.slice(0, Math.min(120, text.length));
}

export function evaluateIpAustraliaCanonicalFidelity(
  uri: string,
  html: string,
): IpAustraliaCanonicalFidelityOutcome {
  const source = parseIpAustraliaManualArticle(html, uri);
  const markdown = normalizeHtmlToMarkdown(new TextEncoder().encode(html));
  const searchable = plainText(markdown);
  const titlePreserved = source.title.length > 0 && searchable.includes(plainText(source.title));
  const publishedDatePreserved =
    source.datePublished !== null && searchable.includes(plainText(source.datePublished));
  const probe = bodyProbe(source);
  const bodyEvidencePreserved = probe.length >= 40 && searchable.includes(probe);
  const amendmentsPreserved =
    source.amendments.length > 0 &&
    source.amendments.every(
      (amendment) =>
        searchable.includes(plainText(amendment.reason)) &&
        searchable.includes(plainText(amendment.dateAmended)),
    );
  const controlledNoticePreserved =
    source.controlledDocumentNotice && searchable.includes("this document is controlled");
  const ok =
    titlePreserved &&
    publishedDatePreserved &&
    bodyEvidencePreserved &&
    amendmentsPreserved &&
    controlledNoticePreserved;

  return {
    uri,
    ok,
    source,
    markdownLength: markdown.length,
    titlePreserved,
    publishedDatePreserved,
    bodyEvidencePreserved,
    amendmentsPreserved,
    controlledNoticePreserved,
    ...(!ok ? { error: "Canonical Markdown did not preserve all required Manual evidence fields" } : {}),
  };
}

export async function auditIpAustraliaManualCanonicalFidelity(
  fetcher: typeof fetch = fetch,
  uris: readonly string[] = IP_AUSTRALIA_MANUAL_FIDELITY_SAMPLES,
): Promise<IpAustraliaCanonicalFidelityOutcome[]> {
  const outcomes: IpAustraliaCanonicalFidelityOutcome[] = [];
  for (const uri of uris) {
    try {
      const response = await fetcher(uri, {
        headers: {
          "user-agent": "MarkOrbit-Knowledge/1.0 canonical-fidelity",
          accept: "text/html,application/xhtml+xml",
        },
      });
      const contentType = response.headers.get("content-type") ?? undefined;
      if (!response.ok) {
        outcomes.push({
          uri,
          ok: false,
          status: response.status,
          contentType,
          source: {
            uri,
            title: "",
            datePublished: null,
            bodyText: "",
            amendments: [],
            controlledDocumentNotice: false,
          },
          markdownLength: 0,
          titlePreserved: false,
          publishedDatePreserved: false,
          bodyEvidencePreserved: false,
          amendmentsPreserved: false,
          controlledNoticePreserved: false,
          error: `${uri} returned HTTP ${response.status}`,
        });
        continue;
      }
      const evaluated = evaluateIpAustraliaCanonicalFidelity(uri, await response.text());
      outcomes.push({ ...evaluated, status: response.status, contentType });
    } catch (error) {
      outcomes.push({
        uri,
        ok: false,
        source: {
          uri,
          title: "",
          datePublished: null,
          bodyText: "",
          amendments: [],
          controlledDocumentNotice: false,
        },
        markdownLength: 0,
        titlePreserved: false,
        publishedDatePreserved: false,
        bodyEvidencePreserved: false,
        amendmentsPreserved: false,
        controlledNoticePreserved: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return outcomes;
}
