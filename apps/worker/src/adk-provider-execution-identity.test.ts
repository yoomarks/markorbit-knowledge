import { describe, expect, it } from "vitest";
import type {
  AiKnowledgeAcquisition,
  AiKnowledgeProviderAdapter,
  AiKnowledgeProviderRequest,
} from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import { MemoryAiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";
import {
  enqueueAdkKnowledgeJobs,
  processNextAdkKnowledgeJob,
  type AdkAssignment,
} from "./adk-knowledge-job-worker";

const assignment = { assignmentId: "assignment-managed-ai-identity" } as AdkAssignment;

describe("ADK provider execution identity", () => {
  it("passes the durable queue executionKey to the provider adapter unchanged", async () => {
    const store = new MemoryAiKnowledgeJobStore();
    const queued = enqueueAdkKnowledgeJobs({
      store,
      assignmentIds: [assignment.assignmentId],
      providers: ["OPENAI"],
      executionScope: "pilot:managed-ai-http",
      now: () => new Date("2026-08-25T10:20:00.000Z"),
    })[0];
    let capturedExecutionKey: string | undefined;
    const adapter: AiKnowledgeProviderAdapter = {
      provider: "OPENAI",
      acquire: async (request: AiKnowledgeProviderRequest) => {
        capturedExecutionKey = (request as AiKnowledgeProviderRequest & { executionKey?: string })
          .executionKey;
        return {
          assignment,
          submission: { provider: "OPENAI" },
          artifact: { artifactId: "adk-managed-ai-identity", provider: "OPENAI" },
          rawResponse: new Uint8Array(),
        } as AiKnowledgeAcquisition;
      },
    };

    const result = await processNextAdkKnowledgeJob({
      store,
      assignments: { getAssignment: () => assignment },
      adapters: new Map([["OPENAI", adapter]]),
      sink: async () => ({
        rawProviderArtifactId: "raw-provider-managed-ai-identity",
        markdownRawArtifactId: "raw-markdown-managed-ai-identity",
      }),
    });

    expect(result?.status).toBe("SUCCEEDED");
    expect(capturedExecutionKey).toBe(queued?.executionKey);
    expect(capturedExecutionKey).toBe(
      "assignment-managed-ai-identity:OPENAI:pilot:managed-ai-http",
    );
  });
});
