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

export function markCredentialBlocked(
  job: AiKnowledgeJob,
  error: string,
): AiKnowledgeJob {
  if (job.status !== "CLAIMED") {
    throw new Error("Only claimed jobs can be credential-blocked");
  }

  return {
    ...job,
    status: "BLOCKED_CREDENTIAL",
    error,
    updatedAt: new Date().toISOString(),
  };
}

export function markRunning(job: AiKnowledgeJob): AiKnowledgeJob {
  if (job.status !== "CLAIMED") {
    throw new Error("Only claimed jobs can start running");
  }

  return {
    ...job,
    status: "RUNNING",
    updatedAt: new Date().toISOString(),
  };
}

export function failJob(job: AiKnowledgeJob, error: string): AiKnowledgeJob {
  if (job.status !== "RUNNING") {
    throw new Error("Only running jobs can fail");
  }

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

export function requeueJob(job: AiKnowledgeJob): AiKnowledgeJob {
  if (job.status !== "RETRY_PENDING") {
    throw new Error("Only retry-pending jobs can be requeued");
  }

  return {
    ...job,
    status: "QUEUED",
    updatedAt: new Date().toISOString(),
  };
}

export function completeJob(
  job: AiKnowledgeJob,
  artifactIds: string[],
): AiKnowledgeJob {
  if (job.status !== "RUNNING") {
    throw new Error("Only running jobs can complete");
  }

  if (artifactIds.length === 0) {
    throw new Error("Successful jobs require at least one artifact");
  }

  return {
    ...job,
    status: "SUCCEEDED",
    artifactIds,
    error: undefined,
    updatedAt: new Date().toISOString(),
  };
}
