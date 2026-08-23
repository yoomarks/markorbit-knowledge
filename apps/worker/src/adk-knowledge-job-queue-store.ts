import type { AiKnowledgeJob } from "./adk-knowledge-job-queue";

export interface AiKnowledgeJobStore {
  put(job: AiKnowledgeJob): void;
  get(id: string): AiKnowledgeJob | undefined;
  list(): AiKnowledgeJob[];
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
}
