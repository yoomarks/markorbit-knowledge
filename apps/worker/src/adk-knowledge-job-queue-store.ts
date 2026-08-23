import type { AiKnowledgeJob } from "./adk-knowledge-job-queue";

export interface AiKnowledgeJobStore {
  put(job: AiKnowledgeJob): void;
  get(id: string): AiKnowledgeJob | undefined;
  list(): AiKnowledgeJob[];
  claimNext(): AiKnowledgeJob | undefined;
}

export class MemoryAiKnowledgeJobStore implements AiKnowledgeJobStore {
  private readonly jobs = new Map<string, AiKnowledgeJob>();

  put(job: AiKnowledgeJob): void {
    this.jobs.set(job.id, structuredClone(job));
  }

  get(id: string): AiKnowledgeJob | undefined {
    const job = this.jobs.get(id);
    return job ? structuredClone(job) : undefined;
  }

  list(): AiKnowledgeJob[] {
    return [...this.jobs.values()].map((job) => structuredClone(job));
  }

  claimNext(): AiKnowledgeJob | undefined {
    const next = [...this.jobs.values()].find((job) => job.status === "QUEUED");

    if (!next) {
      return undefined;
    }

    const claimed: AiKnowledgeJob = {
      ...next,
      status: "CLAIMED",
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(claimed.id, claimed);
    return structuredClone(claimed);
  }
}
