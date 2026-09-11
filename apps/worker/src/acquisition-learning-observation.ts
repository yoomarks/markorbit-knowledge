import type {
  AcquisitionLearningObservation,
  ControlledCollectionCompletion,
  ControlledCollectionFailure,
  Crawl4AiAcquisitionDiagnostics,
} from "@markorbit/worker-runtime";

export function buildReceiptAcquisitionLearningObservation(
  completion: ControlledCollectionCompletion,
  diagnostics?: Crawl4AiAcquisitionDiagnostics | null,
): AcquisitionLearningObservation | null {
  const receipt = completion.receipt;
  if (!receipt) return null;
  const observed = receipt.itemsObserved;
  const attempted = diagnostics
    ? diagnostics.pagesAttempted + diagnostics.attachmentsAttempted
    : observed;
  const discovered = diagnostics
    ? Math.max(attempted, diagnostics.internalLinksDiscovered)
    : observed;
  return {
    runId: completion.context.job.runId,
    sourceId: completion.context.job.sourceId,
    startedAt: completion.startedAt,
    finishedAt: completion.finishedAt,
    outcome: "SUCCESS",
    counts: {
      discovered,
      attempted,
      fetched: diagnostics ? diagnostics.pagesSucceeded : observed,
      accepted: observed,
      duplicates: 0,
      retries: 0,
    },
    knownCorpus: null,
    httpStatusCounts: diagnostics ? { ...diagnostics.httpStatusCounts } : {},
    failureSignatures:
      diagnostics && diagnostics.pagesFailed > 0
        ? [{ code: "CRAWL4AI_PAGE_FAILURE", count: diagnostics.pagesFailed }]
        : [],
    bytes: receipt.bytesPrepared,
    evidenceRefs: [
      `collection-run:${completion.context.job.runId}`,
      `collection-plan:${completion.context.job.planId}`,
      `executor:${receipt.executor.executorId}@${receipt.executor.version}`,
      `execution-receipt-mode:${receipt.metadataOnly ? "metadata-only" : "artifact-backed"}`,
      "observation-scope:bounded-execution-receipt",
      ...(diagnostics
        ? [
            `crawl4ai:pages-attempted:${diagnostics.pagesAttempted}`,
            `crawl4ai:pages-succeeded:${diagnostics.pagesSucceeded}`,
            `crawl4ai:pages-failed:${diagnostics.pagesFailed}`,
            `crawl4ai:redirects:${diagnostics.redirects}`,
            `crawl4ai:internal-links:${diagnostics.internalLinksDiscovered}`,
            `crawl4ai:max-depth:${diagnostics.maxDepthObserved}`,
            "http-status-observation:measured",
          ]
        : ["http-status-observation:unmeasured"]),
    ],
  };
}

function failureCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const value = (error as { code?: unknown }).code;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return error instanceof Error && error.name ? error.name : "PRODUCTION_COLLECTION_FAILED";
}

export function buildFailedAcquisitionLearningObservation(
  failure: ControlledCollectionFailure,
): AcquisitionLearningObservation {
  const code = failureCode(failure.error);
  return {
    runId: failure.context.job.runId,
    sourceId: failure.context.job.sourceId,
    startedAt: failure.startedAt,
    finishedAt: failure.finishedAt,
    outcome: "FAILED",
    counts: {
      discovered: 0,
      attempted: 0,
      fetched: 0,
      accepted: 0,
      duplicates: 0,
      retries: 0,
    },
    knownCorpus: null,
    httpStatusCounts: {},
    failureSignatures: [{ code, count: 1 }],
    bytes: 0,
    evidenceRefs: [
      `collection-run:${failure.context.job.runId}`,
      `collection-plan:${failure.context.job.planId}`,
      `failure-signature:${code}`,
      "observation-scope:failed-controlled-execution",
      "http-status-observation:unmeasured",
    ],
  };
}
