export type AiKnowledgeJobStatus =
  | "QUEUED"
  | "CLAIMED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "RETRY_PENDING"
  | "BLOCKED_CREDENTIAL"
  | "BLOCKED_RECOVERY"
  | "BLOCKED_EXECUTION";

export type AiKnowledgeJobExecutionMode = "LEGACY_PROVIDER" | "GROUNDED_PREPARED";

export type AiKnowledgeJob = {
  id: string;
  assignmentId: string;
  provider: string;
  executionMode?: AiKnowledgeJobExecutionMode;
  groundedExecutionInputSha256?: string;
  status: AiKnowledgeJobStatus;
  attempts: number;
  maxAttempts?: number;
  executionKey?: string;
  createdAt: string;
  updatedAt: string;
  artifactIds: string[];
  error?: string;
};

export type AiKnowledgeFailureOptions = {
  retryable?: boolean;
};

export function executionModeOf(job: AiKnowledgeJob): AiKnowledgeJobExecutionMode {
  return job.executionMode ?? "LEGACY_PROVIDER";
}

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
  if (job.status !== "CLAIMED" && job.status !== "RUNNING") {
    throw new Error("Only claimed or running jobs can be credential-blocked");
  }

  return {
    ...job,
    status: "BLOCKED_CREDENTIAL",
    error,
    updatedAt: new Date().toISOString(),
  };
}

export function markExecutionBlocked(job: AiKnowledgeJob, error: string): AiKnowledgeJob {
  if (job.status !== "CLAIMED") {
    throw new Error("Only claimed jobs can be execution-blocked");
  }

  return {
    ...job,
    status: "BLOCKED_EXECUTION",
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

export function failJob(
  job: AiKnowledgeJob,
  error: string,
  options: AiKnowledgeFailureOptions = {},
): AiKnowledgeJob {
  if (job.status !== "RUNNING") {
    throw new Error("Only running jobs can fail");
  }

  const attempts = job.attempts + 1;
  const maxAttempts = job.maxAttempts ?? 3;
  const retryable = options.retryable ?? true;

  return {
    ...job,
    attempts,
    status: retryable && attempts < maxAttempts ? "RETRY_PENDING" : "FAILED",
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
    error: undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function requeueCredentialBlockedJob(job: AiKnowledgeJob): AiKnowledgeJob {
  if (job.status !== "BLOCKED_CREDENTIAL") {
    throw new Error("Only credential-blocked jobs can be requeued");
  }

  return {
    ...job,
    status: "QUEUED",
    error: undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function recoverClaimedJob(job: AiKnowledgeJob): AiKnowledgeJob {
  if (job.status !== "CLAIMED") {
    throw new Error("Only claimed jobs can be recovered safely");
  }

  return {
    ...job,
    status: "QUEUED",
    error: undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function blockJobForRecovery(job: AiKnowledgeJob, error: string): AiKnowledgeJob {
  if (job.status !== "RUNNING") {
    throw new Error("Only running jobs can be blocked for recovery");
  }

  return {
    ...job,
    status: "BLOCKED_RECOVERY",
    error,
    updatedAt: new Date().toISOString(),
  };
}

export function completeJob(job: AiKnowledgeJob, artifactIds: string[]): AiKnowledgeJob {
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
