import { describe, expect, it } from "vitest";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
} from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import type { AiKnowledgeProvider } from "@markorbit/worker-runtime/ai-production-pilot";
import { MemoryAiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";
import {
  enqueueAdkKnowledgeJobs,
  processNextAdkKnowledgeJob,
  type AdkAssignment,
  type AdkAssignmentRepository,
} from "./adk-knowledge-job-worker";

const assignment = {
  assignmentId: "assignment-1",
} as AdkAssignment;

function assignments(value: AdkAssignment | null = assignment): AdkAssignmentRepository {
  return {
    getAssignment: () => value,
  };
}

function acquisition(provider: AiKnowledgeProvider = "OPENAI"): AiKnowledgeAcquisition {
  return {
    assignment,
    submission: {
      provider,
    },
    artifact: {
      artifactId: "adk-artifact-1",
      provider,
    },
    rawResponse: new Uint8Array(),
  } as AiKnowledgeAcquisition;
}

function adapters(adapter?: AiKnowledgeProviderAdapter) {
  const values = new Map<AiKnowledgeProvider, AiKnowledgeProviderAdapter>();
  if (adapter) values.set(adapter.provider, adapter);
  return values;
}

function enqueue(store: MemoryAiKnowledgeJobStore, provider: AiKnowledgeProvider = "OPENAI") {
  return enqueueAdkKnowledgeJobs({
    store,
    assignmentIds: [assignment.assignmentId],
    providers: [provider],
    now: () => new Date("2026-08-23T12:00:00.000Z"),
  })[0];
}

describe("ADK knowledge job worker", () => {
  it("materializes assignment/provider work idempotently", () => {
    const store = new MemoryAiKnowledgeJobStore();

    const first = enqueue(store);
    const second = enqueue(store);

    expect(first.id).toBe(second.id);
    expect(first.executionKey).toBe("assignment-1:OPENAI:r1");
    expect(store.list()).toHaveLength(1);
  });

  it("executes one job and commits distilled plus RawArtifact lineage", async () => {
    const store = new MemoryAiKnowledgeJobStore();
    enqueue(store);
    const adapter: AiKnowledgeProviderAdapter = {
      provider: "OPENAI",
      acquire: async () => acquisition(),
    };

    const result = await processNextAdkKnowledgeJob({
      store,
      assignments: assignments(),
      adapters: adapters(adapter),
      sink: async () => ({
        rawProviderArtifactId: "raw-provider-1",
        markdownRawArtifactId: "raw-markdown-1",
      }),
    });

    expect(result?.status).toBe("SUCCEEDED");
    expect(result?.artifactIds).toEqual([
      "adk-artifact-1",
      "raw-provider-1",
      "raw-markdown-1",
    ]);
    expect(
      await processNextAdkKnowledgeJob({
        store,
        assignments: assignments(),
        adapters: adapters(adapter),
        sink: async () => ({
          rawProviderArtifactId: "raw-provider-1",
          markdownRawArtifactId: "raw-markdown-1",
        }),
      }),
    ).toBeUndefined();
  });

  it("blocks without consuming an attempt when provider credentials are missing", async () => {
    const store = new MemoryAiKnowledgeJobStore();
    enqueue(store);
    const adapter: AiKnowledgeProviderAdapter = {
      provider: "OPENAI",
      acquire: async () => {
        throw new AiKnowledgeAcquisitionError(
          "AI_PROVIDER_CREDENTIAL_MISSING",
          "OPENAI_API_KEY is missing",
          false,
        );
      },
    };

    const result = await processNextAdkKnowledgeJob({
      store,
      assignments: assignments(),
      adapters: adapters(adapter),
      sink: async () => {
        throw new Error("sink must not run");
      },
    });

    expect(result?.status).toBe("BLOCKED_CREDENTIAL");
    expect(result?.attempts).toBe(0);
  });

  it("keeps retryable provider failures retry-pending", async () => {
    const store = new MemoryAiKnowledgeJobStore();
    enqueue(store);
    const adapter: AiKnowledgeProviderAdapter = {
      provider: "OPENAI",
      acquire: async () => {
        throw new AiKnowledgeAcquisitionError("AI_PROVIDER_TIMEOUT", "timeout", true);
      },
    };

    const result = await processNextAdkKnowledgeJob({
      store,
      assignments: assignments(),
      adapters: adapters(adapter),
      sink: async () => {
        throw new Error("sink must not run");
      },
    });

    expect(result?.status).toBe("RETRY_PENDING");
    expect(result?.attempts).toBe(1);
  });

  it("fails non-retryable provider errors immediately", async () => {
    const store = new MemoryAiKnowledgeJobStore();
    enqueue(store);
    const adapter: AiKnowledgeProviderAdapter = {
      provider: "OPENAI",
      acquire: async () => {
        throw new AiKnowledgeAcquisitionError("AI_PROVIDER_REJECTED", "HTTP 400", false);
      },
    };

    const result = await processNextAdkKnowledgeJob({
      store,
      assignments: assignments(),
      adapters: adapters(adapter),
      sink: async () => {
        throw new Error("sink must not run");
      },
    });

    expect(result?.status).toBe("FAILED");
    expect(result?.attempts).toBe(1);
  });

  it("fails missing assignments and adapters without provider execution", async () => {
    const missingAssignmentStore = new MemoryAiKnowledgeJobStore();
    enqueue(missingAssignmentStore);
    const missingAssignment = await processNextAdkKnowledgeJob({
      store: missingAssignmentStore,
      assignments: assignments(null),
      adapters: adapters(),
      sink: async () => {
        throw new Error("sink must not run");
      },
    });
    expect(missingAssignment?.status).toBe("FAILED");
    expect(missingAssignment?.error).toMatch(/AI_ASSIGNMENT_NOT_FOUND/u);

    const missingAdapterStore = new MemoryAiKnowledgeJobStore();
    enqueue(missingAdapterStore);
    const missingAdapter = await processNextAdkKnowledgeJob({
      store: missingAdapterStore,
      assignments: assignments(),
      adapters: adapters(),
      sink: async () => {
        throw new Error("sink must not run");
      },
    });
    expect(missingAdapter?.status).toBe("FAILED");
    expect(missingAdapter?.error).toMatch(/AI_PROVIDER_ADAPTER_MISSING/u);
  });

  it("rejects mismatched or duplicate lineage before success", async () => {
    const mismatchStore = new MemoryAiKnowledgeJobStore();
    enqueue(mismatchStore);
    const mismatchedAdapter: AiKnowledgeProviderAdapter = {
      provider: "OPENAI",
      acquire: async () => acquisition("DEEPSEEK"),
    };
    const mismatch = await processNextAdkKnowledgeJob({
      store: mismatchStore,
      assignments: assignments(),
      adapters: adapters(mismatchedAdapter),
      sink: async () => ({
        rawProviderArtifactId: "raw-provider-1",
        markdownRawArtifactId: "raw-markdown-1",
      }),
    });
    expect(mismatch?.status).toBe("FAILED");
    expect(mismatch?.error).toBe("AI_ACQUISITION_LINEAGE_MISMATCH");

    const duplicateStore = new MemoryAiKnowledgeJobStore();
    enqueue(duplicateStore);
    const adapter: AiKnowledgeProviderAdapter = {
      provider: "OPENAI",
      acquire: async () => acquisition(),
    };
    const duplicate = await processNextAdkKnowledgeJob({
      store: duplicateStore,
      assignments: assignments(),
      adapters: adapters(adapter),
      sink: async () => ({
        rawProviderArtifactId: "adk-artifact-1",
        markdownRawArtifactId: "raw-markdown-1",
      }),
    });
    expect(duplicate?.status).toBe("FAILED");
    expect(duplicate?.error).toBe("AI_ACQUISITION_LINEAGE_NOT_UNIQUE");
  });
});
