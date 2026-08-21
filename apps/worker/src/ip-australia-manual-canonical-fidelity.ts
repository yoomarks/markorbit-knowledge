import { normalizeHtmlToMarkdown } from "@markorbit/worker-runtime";
import {
  IP_AUSTRALIA_MANUAL_FIDELITY_SAMPLES,
  parseIpAustraliaManualArticle,
  type IpAustraliaManualArticle,
} from "./ip-australia-manual-article-fidelity";

export type IpAustraliaBodyAnchorEvidence = {
  text: string;
  matched: boolean;
};

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
  bodyAnchorCount: number;
  matchedBodyAnchorCount: number;
  bodyAnchors: IpAustraliaBodyAnchorEvidence[];
  amendmentsPreserved: boolean;
  controlledNoticePreserved: boolean;
  error?: string;
};

function plainText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[`*_>#\[\]()|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function words(value: string): string[] {
  return plainText(value)
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
}

function bodyAnchors(article: IpAustraliaManualArticle): string[] {
  const tokens = words(article.bodyText);
  if (tokens.length < 32) return [];

  // Skip the publication-date/link-heavy header. Sample several independent windows across the
  // substantive body so Markdown link targets or minor structural punctuation cannot create a
  // false fidelity failure while actual body loss still fails closed.
  const start = Math.min(32, Math.max(0, tokens.length - 12));
  const available = tokens.length - start;
  const anchorCount = Math.min(5, Math.max(1, Math.floor(available / 12)));
  const anchors: string[] = [];
  for (let index = 0; index < anchorCount; index += 1) {
    const ratio = anchorCount === 1 ? 0 : index / (anchorCount - 1);
    const offset = start + Math.floor(Math.max(0, available - 10) * ratio);
    const anchor = tokens.slice(offset, offset + 10).join(" ");
    if (anchor.split(" ").length >= 8 && !anchors.includes(anchor)) anchors.push(anchor);
  }
  return anchors;
}

function emptyOutcome(uri: string, error: string): IpAustraliaCanonicalFidelityOutcome {
  return {
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
    bodyAnchorCount: 0,
    matchedBodyAnchorCount: 0,
    bodyAnchors: [],
    amendmentsPreserved: false,
    controlledNoticePreserved: false,
    error,
  };
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
  const anchors = bodyAnchors(source);
  const anchorEvidence = anchors.map((text) => ({ text, matched: searchable.includes(text) }));
  const matchedBodyAnchorCount = anchorEvidence.filter((anchor) => anchor.matched).length;
  const bodyEvidencePreserved = anchors.length >= 3 && matchedBodyAnchorCount === anchors.length;
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
    bodyAnchorCount: anchors.length,
    matchedBodyAnchorCount,
    bodyAnchors: anchorEvidence,
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
          ...emptyOutcome(uri, `${uri} returned HTTP ${response.status}`),
          status: response.status,
          contentType,
        });
        continue;
      }
      const evaluated = evaluateIpAustraliaCanonicalFidelity(uri, await response.text());
      outcomes.push({ ...evaluated, status: response.status, contentType });
    } catch (error) {
      outcomes.push(
        emptyOutcome(uri, error instanceof Error ? error.message : String(error)),
      );
    }
  }
  return outcomes;
}
