import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  inventoryIpAustraliaManual,
  type IpAustraliaManualPage,
} from "./ip-australia-manual-inventory";
import {
  parseIpAustraliaManualArticle,
  type IpAustraliaManualAmendment,
} from "./ip-australia-manual-article-fidelity";

export type IpAustraliaManualEvidenceProfile =
  | "STANDARD_ARTICLE"
  | "SPECIAL_EVIDENCE_PAGE"
  | "SOURCE_UNAVAILABLE"
  | "INCOMPLETE_EVIDENCE";

export type IpAustraliaManualAcquiredPage = {
  uri: string;
  inventoryLabel: string;
  currentNavigation: boolean;
  updateHistoryPages: number[];
  ok: boolean;
  evidenceProfile: IpAustraliaManualEvidenceProfile;
  status?: number;
  contentType?: string;
  title: string;
  datePublished: string | null;
  bodyText: string;
  amendments: IpAustraliaManualAmendment[];
  controlledDocumentNotice: boolean;
  contentSha256: string | null;
  error?: string;
};

export type IpAustraliaManualFullAcquisitionReport = {
  inventoryPageCount: number;
  acquiredPageCount: number;
  failedPageCount: number;
  sourceUnavailablePageCount: number;
  incompleteEvidencePageCount: number;
  standardArticleCount: number;
  specialEvidencePageCount: number;
  currentNavigationPageCount: number;
  updateHistoryOnlyPageCount: number;
  pagesWithPublishedDateCount: number;
  pagesWithAmendmentHistoryCount: number;
  pagesWithControlledNoticeCount: number;
  totalBodyCharacters: number;
  inventoryFailures: number;
  concurrency: number;
  interBatchDelayMs: number;
  pages: IpAustraliaManualAcquiredPage[];
  acceptanceBoundary: string;
};

export type IpAustraliaManualAcquisitionOptions = {
  concurrency?: number;
  interBatchDelayMs?: number;
};

function hashContent(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function evidenceProfile(
  article: ReturnType<typeof parseIpAustraliaManualArticle>,
): IpAustraliaManualEvidenceProfile {
  const baseEvidencePresent = article.title.length > 0 && article.controlledDocumentNotice;
  if (!baseEvidencePresent) return "INCOMPLETE_EVIDENCE";

  if (article.datePublished !== null && article.bodyText.length >= 100) {
    return "STANDARD_ARTICLE";
  }

  const specialEvidencePresent =
    article.datePublished !== null || article.bodyText.length >= 100 || article.amendments.length > 0;
  return specialEvidencePresent ? "SPECIAL_EVIDENCE_PAGE" : "INCOMPLETE_EVIDENCE";
}

async function acquirePage(
  page: IpAustraliaManualPage,
  fetcher: typeof fetch,
): Promise<IpAustraliaManualAcquiredPage> {
  try {
    const response = await fetcher(page.uri, {
      headers: {
        "user-agent": "MarkOrbit-Knowledge/1.0 manual-full-acquisition",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const contentType = response.headers.get("content-type") ?? undefined;
    if (!response.ok) {
      return {
        ...page,
        inventoryLabel: page.label,
        ok: false,
        evidenceProfile: response.status === 404 ? "SOURCE_UNAVAILABLE" : "INCOMPLETE_EVIDENCE",
        status: response.status,
        contentType,
        title: "",
        datePublished: null,
        bodyText: "",
        amendments: [],
        controlledDocumentNotice: false,
        contentSha256: null,
        error: `${page.uri} returned HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const article = parseIpAustraliaManualArticle(html, page.uri);
    const profile = evidenceProfile(article);
    const completeEvidence = profile === "STANDARD_ARTICLE" || profile === "SPECIAL_EVIDENCE_PAGE";

    return {
      ...page,
      inventoryLabel: page.label,
      ok: completeEvidence,
      evidenceProfile: profile,
      status: response.status,
      contentType,
      title: article.title,
      datePublished: article.datePublished,
      bodyText: article.bodyText,
      amendments: article.amendments,
      controlledDocumentNotice: article.controlledDocumentNotice,
      contentSha256: hashContent(html),
      ...(!completeEvidence ? { error: "Required manual source evidence was incomplete" } : {}),
    };
  } catch (error) {
    return {
      ...page,
      inventoryLabel: page.label,
      ok: false,
      evidenceProfile: "INCOMPLETE_EVIDENCE",
      title: "",
      datePublished: null,
      bodyText: "",
      amendments: [],
      controlledDocumentNotice: false,
      contentSha256: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function acquireIpAustraliaManualCorpus(
  fetcher: typeof fetch = fetch,
  options: IpAustraliaManualAcquisitionOptions = {},
): Promise<IpAustraliaManualFullAcquisitionReport> {
  const concurrency = Math.max(1, Math.min(4, Math.trunc(options.concurrency ?? 2)));
  const interBatchDelayMs = Math.max(0, Math.trunc(options.interBatchDelayMs ?? 500));
  const inventory = await inventoryIpAustraliaManual(fetcher);
  const acquired: IpAustraliaManualAcquiredPage[] = [];

  for (let offset = 0; offset < inventory.pages.length; offset += concurrency) {
    const batch = inventory.pages.slice(offset, offset + concurrency);
    acquired.push(...(await Promise.all(batch.map((page) => acquirePage(page, fetcher)))));
    if (offset + concurrency < inventory.pages.length && interBatchDelayMs > 0) {
      await delay(interBatchDelayMs);
    }
  }

  acquired.sort((left, right) => left.uri.localeCompare(right.uri));
  const sourceUnavailablePageCount = acquired.filter(
    (page) => page.evidenceProfile === "SOURCE_UNAVAILABLE",
  ).length;
  const incompleteEvidencePageCount = acquired.filter(
    (page) => page.evidenceProfile === "INCOMPLETE_EVIDENCE",
  ).length;
  const failedPageCount = sourceUnavailablePageCount + incompleteEvidencePageCount;

  return {
    inventoryPageCount: inventory.totalUniqueManualPageCount,
    acquiredPageCount: acquired.length - failedPageCount,
    failedPageCount,
    sourceUnavailablePageCount,
    incompleteEvidencePageCount,
    standardArticleCount: acquired.filter((page) => page.evidenceProfile === "STANDARD_ARTICLE").length,
    specialEvidencePageCount: acquired.filter(
      (page) => page.evidenceProfile === "SPECIAL_EVIDENCE_PAGE",
    ).length,
    currentNavigationPageCount: inventory.currentNavigationPageCount,
    updateHistoryOnlyPageCount: inventory.updateHistoryOnlyPageCount,
    pagesWithPublishedDateCount: acquired.filter((page) => page.datePublished !== null).length,
    pagesWithAmendmentHistoryCount: acquired.filter((page) => page.amendments.length > 0).length,
    pagesWithControlledNoticeCount: acquired.filter((page) => page.controlledDocumentNotice).length,
    totalBodyCharacters: acquired.reduce((total, page) => total + page.bodyText.length, 0),
    inventoryFailures: inventory.failedUpdateHistoryPageCount,
    concurrency,
    interBatchDelayMs,
    pages: acquired,
    acceptanceBoundary:
      "Full public Manual acquisition and source-field fidelity only. SOURCE_UNAVAILABLE records official navigation gaps without reclassifying them as acquisition/parser failures. CORPUS READY additionally requires persisted RawArtifacts/versions, change-watch evidence, and freshness validation.",
  };
}
