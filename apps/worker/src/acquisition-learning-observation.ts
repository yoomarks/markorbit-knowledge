import type {
  AcquisitionLearningObservation,
  ControlledCollectionCompletion,
} from "@markorbit/worker-runtime";

export function buildReceiptAcquisitionLearningObservation(
  completion: ControlledCollectionCompletion,
): AcquisitionLearningObservation | null {
  const receipt = completion.receipt;
  if (!receipt) return null;
  const observed = receipt.itemsObserved;
  return {
    runId: completion.context.job.runId,
    sourceId: completion.context.job.sourceId,
    startedAt: completion.startedAt,
    finishedAt: completion.finishedAt,
    outcome: "SUCCESS",
    counts: {
      discovered: observed,
      attempted: observed,
      fetched: observed,
      accepted: observed,
      duplicates: 0,
      retries: 0,
    },
    knownCorpus: null,
    httpStatusCounts: {},
    failureSignatures: [],
    bytes: receipt.bytesPrepared,
    evidenceRefs: [
      `collection-run:${completion.context.job.runId}`,
      `collection-plan:${completion.context.job.planId}`,
      `executor:${receipt.executor.executorId}@${receipt.executor.version}`,
      `execution-receipt-mode:${receipt.metadataOnly ? "metadata-only" : "artifact-backed"}`,
      "observation-scope:bounded-execution-receipt",
      "http-status-observation:unmeasured",
    ],
  };
}
