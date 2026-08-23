import { createHash } from "node:crypto";
import {
  isAiProductionPilotPlanV1,
  type AiKnowledgeAssignmentV1,
  type AiKnowledgeProvider,
  type AiProductionPilotCellReceiptV1,
  type AiProductionPilotPlanV1,
  type AiProductionPilotRunV1,
} from "@markorbit/contracts";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
} from "./ai-distilled-knowledge-acquirer";

export { isAiProductionPilotPlanV1 } from "@markorbit/contracts";
export type { AiProductionPilotPlanV1 } from "@markorbit/contracts";

export type AiProductionPilotExecutionInput = {
  plan: AiProductionPilotPlanV1;
  assignments: ReadonlyMap<string, AiKnowledgeAssignmentV1>;
  adapters: ReadonlyMap<AiKnowledgeProvider, AiKnowledgeProviderAdapter>;
};

export type AiProductionPilotExecutionResult = {
  run: AiProductionPilotRunV1;
  acquisitions: AiKnowledgeAcquisition[];
};

function stableRunId(plan: AiProductionPilotPlanV1, startedAt: string): string {
  const hash = createHash("sha256")
    .update(
      `${plan.pilotId}:${startedAt}:${plan.assignmentIds.join(":")}:${plan.providers.join(":")}`,
    )
    .digest("hex");
  return `apr_${hash.slice(0, 32)}`;
}

export async function runAiProductionPilot(
  input: AiProductionPilotExecutionInput,
  now: () => Date = () => new Date(),
): Promise<AiProductionPilotExecutionResult> {
  if (!isAiProductionPilotPlanV1(input.plan)) {
    throw new TypeError("Invalid AiProductionPilotPlanV1");
  }

  for (const assignmentId of input.plan.assignmentIds) {
    if (!input.assignments.has(assignmentId)) {
      throw new Error(`Pilot assignment ${assignmentId} was not supplied`);
    }
  }

  const startedAt = now().toISOString();
  const receipts: AiProductionPilotCellReceiptV1[] = [];
  const acquisitions: AiKnowledgeAcquisition[] = [];

  for (const assignmentId of input.plan.assignmentIds) {
    const assignment = input.assignments.get(assignmentId)!;
    for (const provider of input.plan.providers) {
      const adapter = input.adapters.get(provider);
      if (!adapter) {
        receipts.push({
          assignmentId,
          provider,
          status: "BLOCKED_ADAPTER",
          errorCode: "AI_PROVIDER_ADAPTER_MISSING",
          retryable: false,
        });
        continue;
      }
      if (adapter.provider !== provider) {
        throw new Error(`Adapter provider mismatch for ${provider}`);
      }

      try {
        const acquisition = await adapter.acquire({ assignment });
        acquisitions.push(acquisition);
        receipts.push({
          assignmentId,
          provider,
          status: "EXECUTED",
          submissionId: acquisition.submission.submissionId,
          artifactId: acquisition.artifact.artifactId,
        });
      } catch (error) {
        if (error instanceof AiKnowledgeAcquisitionError) {
          receipts.push({
            assignmentId,
            provider,
            status:
              error.code === "AI_PROVIDER_CREDENTIAL_MISSING" ? "BLOCKED_CREDENTIAL" : "FAILED",
            errorCode: error.code,
            retryable: error.retryable,
          });
          continue;
        }
        throw error;
      }
    }
  }

  const completedAt = now().toISOString();
  return {
    run: {
      protocolVersion: "1.0",
      objectType: "AI_PRODUCTION_PILOT_RUN",
      runId: stableRunId(input.plan, startedAt),
      pilotId: input.plan.pilotId,
      startedAt,
      completedAt,
      receipts,
      boundaries: {
        providerRankingProduced: false,
        legalTruthVerified: false,
        candidateAutoActivationApplied: false,
      },
    },
    acquisitions,
  };
}
