import { describe, expect, it } from "vitest";

import type { AiKnowledgeJob } from "./adk-knowledge-job-queue";
import { MemoryAiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";

const job: AiKnowledgeJob = {
  id: "job-store-1",
  assignmentId: "assignment-1",
  provider: "openai",
  status: "QUEUED",
  attempts: 0,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  artifactIds: [],
};

describe("ADK knowledge job store", () => {
  it("persists and returns isolated job copies", () => {
    const store = new MemoryAiKnowledgeJobStore();

    store.put(job);
    const loaded = store.get(job.id);

    expect(loaded).toEqual(job);
    expect(loaded).not.toBe(job);
  });

  it("claims queued jobs through the queue boundary", () => {
    const store = new MemoryAiKnowledgeJobStore();

    store.put(job);
    const claimed = store.claimNext();

    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("CLAIMED");
    expect(store.get(job.id)?.status).toBe("CLAIMED");
  });
});
