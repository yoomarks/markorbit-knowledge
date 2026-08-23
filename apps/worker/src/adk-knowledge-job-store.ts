import type { AiKnowledgeJob } from "./adk-knowledge-job-queue";

export type AiKnowledgeJobStore = {
  save(job: AiKnowledgeJob): AiKnowledgeJob;
  get(id: string): AiKnowledgeJob | undefined;
  claimNext(): AiKnowledgeJob | undefined;
};

export class InMemoryAiKnowledgeJobStore implements AiKnowledgeJobStore {
  private readonly jobs = new Map<string, AiKnowledgeJob>();

  save(job: AiKnowledgeJob): AiKnowledgeJob {
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): AiKnowledgeJob | undefined {
    return this.jobs.get(id);
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
    return claimed;
  }
}
