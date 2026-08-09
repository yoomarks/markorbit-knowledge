import {
  buildFoundationalRemediationQueue,
  type FoundationalRemediationQueue,
} from "@markorbit/worker-runtime/foundational-remediation-queue";
import {
  operateFoundationalBatch,
  type FoundationalOperatorBatchResult,
  type OperateFoundationalBatchOptions,
} from "./source-foundational-readiness";

export {
  FOUNDATIONAL_REMEDIATION_QUEUE_PROTOCOL_VERSION,
  buildFoundationalRemediationQueue,
} from "@markorbit/worker-runtime/foundational-remediation-queue";
export type {
  FoundationalRemediationAction,
  FoundationalRemediationActionCode,
  FoundationalRemediationExecutionPath,
  FoundationalRemediationQueue,
  FoundationalRemediationQueueItem,
} from "@markorbit/worker-runtime/foundational-remediation-queue";

export type FoundationalOperatorResultWithRemediation = FoundationalOperatorBatchResult & {
  remediationQueue: FoundationalRemediationQueue;
};

export async function operateFoundationalWithRemediationQueue(
  options: OperateFoundationalBatchOptions,
): Promise<FoundationalOperatorResultWithRemediation> {
  const result = await operateFoundationalBatch(options);
  return {
    ...result,
    remediationQueue: buildFoundationalRemediationQueue(result.readiness, options.workspaceId),
  };
}
