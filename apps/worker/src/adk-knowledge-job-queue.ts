export type AiKnowledgeJobStatus =
  | "QUEUED"
  | "CLAIMED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "BLOCKED_CREDENTIAL";

export type AiKnowledgeJob = {
  id: string;
  assignmentId: string;
  provider: string;
  status: AiKnowledgeJobStatus;
  attempts: number;
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

export function completeJob(job: AiKnowledgeJob, artifactIds: string[]): AiKnowledgeJob {
  return {
    ...job,
    status: "SUCCEEDED",
    artifactIds,
    updatedAt: new Date().toISOString(),
  };
}
