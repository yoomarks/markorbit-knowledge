import { createHash } from "node:crypto";
import {
  isAiGroundedPreparedExecutionEvidenceV1,
  type AiGroundedPreparedExecutionEvidenceV1,
} from "@markorbit/contracts";
import { executionModeOf, type AiKnowledgeJob } from "./adk-knowledge-job-queue";
import type { AiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";

export const ADK_GROUNDED_PREPARED_PROVIDER = "PROVIDER_DISABLED" as const;
export const ADK_GROUNDED_PREPARED_EXECUTION_MODE = "GROUNDED_PREPARED" as const;

function jobId(executionKey: string): string {
  return `akj_${createHash("sha256").update(executionKey).digest("hex").slice(0, 32)}`;
}

function executionKey(executionInputSha256: string): string {
  return `grounded-prepared:${executionInputSha256}`;
}

function assertExistingMatches(
  existing: AiKnowledgeJob,
  evidence: AiGroundedPreparedExecutionEvidenceV1,
): void {
  if (
    executionModeOf(existing) !== ADK_GROUNDED_PREPARED_EXECUTION_MODE ||
    existing.provider !== ADK_GROUNDED_PREPARED_PROVIDER ||
    existing.assignmentId !== evidence.assignmentId ||
    existing.groundedExecutionInputSha256 !== evidence.executionInputSha256 ||
    existing.executionKey !== executionKey(evidence.executionInputSha256)
  ) {
    throw new Error(
      `Grounded PREPARED execution ${evidence.executionInputSha256} conflicts with an existing ADK queue job`,
    );
  }
}

export function enqueueAdkGroundedPreparedExecution(input: {
  store: AiKnowledgeJobStore;
  evidence: AiGroundedPreparedExecutionEvidenceV1;
  now?: () => Date;
}): AiKnowledgeJob {
  if (!isAiGroundedPreparedExecutionEvidenceV1(input.evidence)) {
    throw new Error("Invalid AiGroundedPreparedExecutionEvidenceV1");
  }

  const key = executionKey(input.evidence.executionInputSha256);
  const existing = input.store.getByExecutionKey(key);
  if (existing) {
    assertExistingMatches(existing, input.evidence);
    return existing;
  }

  const timestamp = (input.now ?? (() => new Date()))().toISOString();
  const job: AiKnowledgeJob = {
    id: jobId(key),
    assignmentId: input.evidence.assignmentId,
    provider: ADK_GROUNDED_PREPARED_PROVIDER,
    executionMode: ADK_GROUNDED_PREPARED_EXECUTION_MODE,
    groundedExecutionInputSha256: input.evidence.executionInputSha256,
    status: "QUEUED",
    attempts: 0,
    maxAttempts: 1,
    executionKey: key,
    createdAt: timestamp,
    updatedAt: timestamp,
    artifactIds: [],
  };
  return input.store.put(job);
}
