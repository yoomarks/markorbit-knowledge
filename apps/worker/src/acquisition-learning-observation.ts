import type {
  AcquisitionLearningObservation,
  ControlledCollectionCompletion,
} from "@markorbit/worker-runtime";

export function buildReceiptAcquisitionLearningObservation(
  completion: ControlledCollectionCompletion,
): AcquisitionLearningObservation | null {
  const receipt = completion.receipt;
  if (!receipt) return null;
  const accepted = receipt.artifactsPrepared;
  return {
    runId: completion.context.job.runId,
    sourceId: completion.context.job.sourceId,
    startedAt: completion.startedAt,
    finishedAt: completion.finishedAt,
    counts: {
      discovered: accepted,
      attempted: accepted,
      fetched: accepted,
      accepted,
      duplicates: 0,
      retries: 0,
    },
    knownCorpus: null,
    httpStatusCounts: accepted > 0 ? { "200": accepted } : {},
    failureSignatures: [],
    bytes: receipt.bytesPrepared,
    evidenceRefs: [
      `collection-run:${completion.context.job.runId}`,
      `collection-plan:${completion.context.job.planId}`,
      `executor:${receipt.executor.executorId}@${receipt.executor.version}`,
      "observation-scope:bounded-execution-receipt",
    ],
  };
}
