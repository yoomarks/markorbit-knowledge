import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import {
  buildCnipaGazetteCheckpoint,
  planCnipaGazettePageRanges,
  type CnipaGazetteCheckpoint,
  type CnipaGazettePageRange,
} from "./cnipa-gazette-checkpoint-runtime";
import {
  acquireCnipaGazettePageWithEvidence,
  CnipaGazetteSourceError,
  type CnipaGazetteJsonTransport,
} from "./cnipa-gazette-page-acquirer";

export const CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA =
  "CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_V1" as const;
export const CNIPA_GAZETTE_DEFAULT_PAGES_PER_CHECKPOINT = 25 as const;
export const CNIPA_GAZETTE_DEFAULT_MAX_ATTEMPTS = 3 as const;
export const CNIPA_GAZETTE_DEFAULT_RETRY_DELAY_MS = 1_000 as const;

export type CnipaGazetteCheckpointAcquisitionResult = {
  checkpoint: CnipaGazetteCheckpoint;
  checkpointArtifact: AcquiredCollectionArtifact;
  pageArtifacts: readonly AcquiredCollectionArtifact[];
  plannedRanges: readonly CnipaGazettePageRange[];
};

export type CnipaGazetteCheckpointRetryPolicy = {
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function validateRange(range: CnipaGazettePageRange): CnipaGazettePageRange {
  const startPage = positiveInteger(range.startPage, "range.startPage");
  const endPage = positiveInteger(range.endPage, "range.endPage");
  if (endPage < startPage) throw new Error("range.endPage must be >= range.startPage");
  if (endPage - startPage + 1 > 100) {
    throw new Error("Gazette checkpoint range cannot exceed 100 pages");
  }
  return { startPage, endPage };
}

function retryPolicy(input: CnipaGazetteCheckpointRetryPolicy | undefined) {
  const maxAttempts = input?.maxAttempts ?? CNIPA_GAZETTE_DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = input?.retryDelayMs ?? CNIPA_GAZETTE_DEFAULT_RETRY_DELAY_MS;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("maxAttempts must be an integer from 1 to 10");
  }
  if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 60_000) {
    throw new Error("retryDelayMs must be an integer from 0 to 60000");
  }
  return {
    maxAttempts,
    retryDelayMs,
    sleep:
      input?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
  };
}

async function acquirePageWithRetry(input: {
  announcementIssue: number;
  pageIndex: number;
  requestTemplate: Readonly<Record<string, unknown>>;
  transport: CnipaGazetteJsonTransport;
  policy: ReturnType<typeof retryPolicy>;
}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= input.policy.maxAttempts; attempt += 1) {
    try {
      return await acquireCnipaGazettePageWithEvidence({
        announcementIssue: input.announcementIssue,
        pageIndex: input.pageIndex,
        requestTemplate: input.requestTemplate,
        transport: input.transport,
      });
    } catch (error) {
      lastError = error;
      const retryable = error instanceof CnipaGazetteSourceError && error.retryable;
      if (!retryable || attempt >= input.policy.maxAttempts) throw error;
      if (input.policy.retryDelayMs > 0) {
        await input.policy.sleep(input.policy.retryDelayMs);
      }
    }
  }
  throw lastError;
}

export async function acquireCnipaGazetteCheckpointRange(input: {
  announcementIssue: number;
  range: CnipaGazettePageRange;
  requestTemplate: Readonly<Record<string, unknown>>;
  transport: CnipaGazetteJsonTransport;
  pagesPerCheckpoint?: number;
  expectedSourceTotal?: number;
  expectedSourcePages?: number;
  expectedAnnouncementDate?: string;
  retry?: CnipaGazetteCheckpointRetryPolicy;
}): Promise<CnipaGazetteCheckpointAcquisitionResult> {
  const announcementIssue = positiveInteger(input.announcementIssue, "announcementIssue");
  const range = validateRange(input.range);
  const pagesPerCheckpoint = input.pagesPerCheckpoint ?? CNIPA_GAZETTE_DEFAULT_PAGES_PER_CHECKPOINT;
  positiveInteger(pagesPerCheckpoint, "pagesPerCheckpoint");
  if (pagesPerCheckpoint > 100) {
    throw new Error("pagesPerCheckpoint cannot exceed 100");
  }
  const expectedMetadataSupplied =
    input.expectedSourceTotal !== undefined ||
    input.expectedSourcePages !== undefined ||
    input.expectedAnnouncementDate !== undefined;
  if (
    expectedMetadataSupplied &&
    (input.expectedSourceTotal === undefined ||
      input.expectedSourcePages === undefined ||
      input.expectedAnnouncementDate === undefined)
  ) {
    throw new Error(
      "expectedSourceTotal, expectedSourcePages and expectedAnnouncementDate must be supplied together",
    );
  }
  if (!expectedMetadataSupplied && range.startPage !== 1) {
    throw new Error("non-first checkpoint requires expected source total/pages/date");
  }
  if (input.expectedSourceTotal !== undefined) {
    if (!Number.isSafeInteger(input.expectedSourceTotal) || input.expectedSourceTotal < 0) {
      throw new Error("expectedSourceTotal must be a non-negative safe integer");
    }
    positiveInteger(input.expectedSourcePages!, "expectedSourcePages");
  }

  const policy = retryPolicy(input.retry);
  const pages = [];
  const pageArtifacts: AcquiredCollectionArtifact[] = [];
  let sourceTotal = input.expectedSourceTotal;
  let sourcePages = input.expectedSourcePages;
  let announcementDate = input.expectedAnnouncementDate;

  for (let pageIndex = range.startPage; pageIndex <= range.endPage; pageIndex += 1) {
    const acquired = await acquirePageWithRetry({
      announcementIssue,
      pageIndex,
      requestTemplate: input.requestTemplate,
      transport: input.transport,
      policy,
    });

    if (sourceTotal === undefined) {
      sourceTotal = acquired.page.sourceTotal;
      sourcePages = acquired.page.sourcePages;
      announcementDate = acquired.page.announcementDate ?? undefined;
      if (!announcementDate) {
        throw new Error("non-empty Gazette issue requires announcementDate");
      }
      if (range.endPage > sourcePages) {
        throw new Error(
          `checkpoint end page ${range.endPage} exceeds discovered sourcePages=${sourcePages}`,
        );
      }
    } else if (
      acquired.page.sourceTotal !== sourceTotal ||
      acquired.page.sourcePages !== sourcePages ||
      acquired.page.announcementDate !== announcementDate
    ) {
      throw new Error(
        `Gazette source total/pages/date drifted: expected ${sourceTotal}/${sourcePages}/${announcementDate}, got ${acquired.page.sourceTotal}/${acquired.page.sourcePages}/${acquired.page.announcementDate}`,
      );
    }

    pages.push(acquired.page);
    pageArtifacts.push(acquired.rawArtifact, acquired.projectionArtifact);
  }

  if (sourceTotal === undefined || sourcePages === undefined || announcementDate === undefined) {
    throw new Error("checkpoint acquisition produced no source metadata");
  }

  const checkpoint = buildCnipaGazetteCheckpoint({
    announcementIssue,
    range,
    pages,
  });
  if (checkpoint.sourceTotal !== sourceTotal || checkpoint.sourcePages !== sourcePages) {
    throw new Error("checkpoint source metadata does not match acquisition metadata");
  }

  const plannedRanges = planCnipaGazettePageRanges({
    sourcePages,
    pagesPerCheckpoint,
  });
  const parentCanonicalUris = pageArtifacts
    .filter((artifact) => artifact.canonicalUri?.endsWith("/projection"))
    .map((artifact) => artifact.canonicalUri!)
    .sort();

  const checkpointCanonicalUri = `cnipa://trademark-gazette/issue/${announcementIssue}/checkpoint/${range.startPage}-${range.endPage}`;
  const sourceUri =
    pageArtifacts.find((artifact) => artifact.sourceUri)?.sourceUri ?? checkpointCanonicalUri;
  const checkpointArtifact: AcquiredCollectionArtifact = {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `cnipa-gazette-issue-${announcementIssue}-checkpoint-${range.startPage}-${range.endPage}.json`,
    sourceUri,
    canonicalUri: checkpointCanonicalUri,
    parentCanonicalUris,
    content: new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
        sourceOwner: "MARKORBIT_KNOWLEDGE",
        sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
        queryScope: {
          announcementTypeSelection: "ALL",
          anncType: "",
        },
        announcementIssue,
        sourceTotal,
        sourcePages,
        announcementDate,
        pageSize: 100,
        range,
        checkpoint,
        plannedRanges,
      }),
    ),
  };

  return {
    checkpoint,
    checkpointArtifact,
    pageArtifacts,
    plannedRanges,
  };
}
