export type AiKnowledgeJobStatus =
  | "QUEUED"
  | "CLAIMED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "RETRY_PENDING"
  | "BLOCKED_CREDENTIAL";

export type AiKnowledgeJob = {
  id: string;
  assignmentId: string;
  provider: string;
  status: AiKnowledgeJobStatus;
  attempts: number;
  maxAttempts?: number;
  executionKey?: string;
  createdAt: string;
  updatedAt: string;
  artifactIds: string[];
  error?: string;
};

export function claimJob(job: AiKnowledgeJob): AiKnowledgeJob {
  if (job.status !== "QUEUED") {
    throw new Error("Only queued jobs can be claimed");
  }

  return {
    ...job,
    status: "CLAIMED",
    updatedAt: new Date().toISOString(),
  };
}

export function markCredentialBlocked(job: AiKnowledgeJob, error: string): AiKnowledgeJob {
  return {
    ...job,
    status: "BLOCKED_CREDENTIAL",
    error,
    updatedAt: new Date().toISOString(),
  };
}

export function markRunning(job: AiKnowledgeJob): AiKnowledgeJob {
  return {
    ...job,
    status: "RUNNING",
    updatedAt: new Date().toISOString(),
  };
}

export function failJob(job: AiKnowledgeJob, error: string): AiKnowledgeJob {
  const attempts = job.attempts + 1;
  const maxAttempts = job.maxAttempts ?? 3;

  return {
    ...job,
    attempts,
    status: attempts < maxAttempts ? "RETRY_PENDING" : "FAILED",
    error,
    updatedAt: new Date().toISOString(),
  };
}

export function completeJob(job: AiKnowledgeJob, artifactIds: string[]): AiKnowledgeJob {
  return {
    ...job,
    status: "SUCCEEDED",
    artifactIds,
    updatedAt: new Date().toISOString(),
  };
}
