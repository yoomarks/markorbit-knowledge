import type { CnipaAuthenticatedSessionExecutorFactory } from "@markorbit/worker-runtime/cnipa-artifact-acquirer";
import type { CnipaDetailRetryPolicy } from "@markorbit/worker-runtime/cnipa-detail-enrichment-state";
import type {
  CnipaDetailRawArtifactSink,
  ProcessNextCnipaDetailResult,
} from "./cnipa-detail-worker";
import { processNextCnipaDetail } from "./cnipa-detail-worker";
import type { GovernedCnipaDetailQueuePort } from "./cnipa-detail-governed-queue";

export type CnipaDetailRunStopReason =
  "RUN_CAP_REACHED" | "EMPTY" | "PACING_BLOCKED" | "BUDGET_EXHAUSTED" | "AUTH_SECURITY_HOLD";

export type RunGovernedCnipaDetailInput = {
  queue: GovernedCnipaDetailQueuePort;
  workspaceId: string;
  sessionFactory: CnipaAuthenticatedSessionExecutorFactory;
  rawArtifactSink: CnipaDetailRawArtifactSink;
  maxRequestsPerRun: number;
  queueLeaseIdFactory: (ordinal: number) => string;
  now?: () => Date;
  queueLeaseMs?: number;
  retryPolicy?: Partial<CnipaDetailRetryPolicy>;
  processOne?: typeof processNextCnipaDetail;
};

export type RunGovernedCnipaDetailResult = {
  processedCount: number;
  outcomes: ProcessNextCnipaDetailResult["outcome"][];
  stopReason: CnipaDetailRunStopReason;
};

function maxRequestsPerRun(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 10_000) {
    throw new Error("maxRequestsPerRun must be an integer in 1..10000");
  }
  return value;
}

function nullStopReason(queue: GovernedCnipaDetailQueuePort): CnipaDetailRunStopReason {
  const decision = queue.lastClaimDecision();
  switch (decision?.status) {
    case "PACING_BLOCKED":
      return "PACING_BLOCKED";
    case "BUDGET_EXHAUSTED":
      return "BUDGET_EXHAUSTED";
    case "EMPTY":
    case undefined:
      return "EMPTY";
    case "CLAIMED":
      throw new Error("CNIPA DETAIL worker returned null after a governed claim");
  }
}

export async function runGovernedCnipaDetail(
  input: RunGovernedCnipaDetailInput,
): Promise<RunGovernedCnipaDetailResult> {
  const cap = maxRequestsPerRun(input.maxRequestsPerRun);
  const processOne = input.processOne ?? processNextCnipaDetail;
  const outcomes: ProcessNextCnipaDetailResult["outcome"][] = [];

  for (let ordinal = 1; ordinal <= cap; ordinal += 1) {
    const queueLeaseId = input.queueLeaseIdFactory(ordinal).trim();
    if (!queueLeaseId) throw new Error("queueLeaseIdFactory returned an empty lease id");

    const result = await processOne({
      queue: input.queue,
      workspaceId: input.workspaceId,
      queueLeaseId,
      sessionFactory: input.sessionFactory,
      rawArtifactSink: input.rawArtifactSink,
      ...(input.now ? { now: input.now } : {}),
      ...(input.queueLeaseMs ? { queueLeaseMs: input.queueLeaseMs } : {}),
      ...(input.retryPolicy ? { retryPolicy: input.retryPolicy } : {}),
    });

    if (!result) {
      return {
        processedCount: outcomes.length,
        outcomes,
        stopReason: nullStopReason(input.queue),
      };
    }

    outcomes.push(result.outcome);
    if (result.pauseLane) {
      return {
        processedCount: outcomes.length,
        outcomes,
        stopReason: "AUTH_SECURITY_HOLD",
      };
    }
  }

  return {
    processedCount: outcomes.length,
    outcomes,
    stopReason: "RUN_CAP_REACHED",
  };
}
