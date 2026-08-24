import { describe, expect, it } from "vitest";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
} from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import type { AiKnowledgeProvider } from "@markorbit/worker-runtime/ai-production-pilot";
import {
  blockJobForRecovery,
  type AiKnowledgeJob,
  type AiKnowledgeJobStatus,
} from "./adk-knowledge-job-queue";
import { MemoryAiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";
import {
  enqueueAdkKnowledgeJobs,
  processNextAdkKnowledgeJob,
  type AdkAssignment,
  type AdkAssignmentRepository,
} from "./adk-knowledge-job-worker";

const assignment = { assignmentId: "assignment-safety" } as AdkAssignment;

function assignments(): AdkAssignmentRepository {
  return { getAssignment: () => assignment };
}

function adapters(adapter: AiKnowledgeProviderAdapter) {
  return new Map<AiKnowledgeProvider, AiKnowledgeProviderAdapter>([[adapter.provider, adapter]]);
}

function enqueue(store: MemoryAiKnowledgeJobStore): AiKnowledgeJob {
  return enqueueAdkKnowledgeJobs({
    store,
    assignmentIds: [assignment.assignmentId],
    providers: ["OPENAI"],
    executionScope: "safety:test",
    now: () => new Date("2026-08-24T07:00:00.000Z"),
  })[0];
}

function acquisition(): AiKnowledgeAcquisition {
  return {
    assignment,
    submission: { provider: "OPENAI" },
    artifact: { artifactId: "adk-safety", provider: "OPENAI" },
    rawResponse: new Uint8Array(),
  } as AiKnowledgeAcquisition;
}

class RecoverBeforeRunningStore extends MemoryAiKnowledgeJobStore {
  private intercepted = false;

  override saveIfStatus(
    job: AiKnowledgeJob,
    expectedStatus: AiKnowledgeJobStatus,
  ): AiKnowledgeJob | undefined {
    if (!this.intercepted && expectedStatus === "CLAIMED") {
      this.intercepted = true;
      const current = this.get(job.id);
      if (current?.status === "CLAIMED") {
        this.save({
          ...current,
          status: "QUEUED",
          updatedAt: "2026-08-24T07:05:00.000Z",
        });
      }
    }
    return super.saveIfStatus(job, expectedStatus);
  }
}

describe("ADK knowledge job worker safety", () => {
  it.each(["AI_PROVIDER_TIMEOUT", "AI_PROVIDER_NETWORK_ERROR"])(
    "quarantines %s because provider delivery may already have happened",
    async (code) => {
      const store = new MemoryAiKnowledgeJobStore();
      enqueue(store);
      const adapter: AiKnowledgeProviderAdapter = {
        provider: "OPENAI",
        acquire: async () => {
          throw new AiKnowledgeAcquisitionError(code, "delivery uncertain", true);
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

      expect(result?.status).toBe("BLOCKED_RECOVERY");
      expect(result?.attempts).toBe(0);
      expect(result?.error).toMatch(/AI_PROVIDER_DELIVERY_UNCERTAIN/u);
    },
  );

  it("quarantines ungoverned adapter exceptions instead of guessing that replay is safe", async () => {
    const store = new MemoryAiKnowledgeJobStore();
    enqueue(store);
    const adapter: AiKnowledgeProviderAdapter = {
      provider: "OPENAI",
      acquire: async () => {
        throw new Error("unexpected adapter failure");
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

    expect(result?.status).toBe("BLOCKED_RECOVERY");
    expect(result?.attempts).toBe(0);
    expect(result?.error).toMatch(/AI_PROVIDER_EXECUTION_UNCERTAIN/u);
  });

  it("does not start provider execution when recovery wins the CLAIMED to RUNNING race", async () => {
    const store = new RecoverBeforeRunningStore();
    enqueue(store);
    let providerCalls = 0;
    const adapter: AiKnowledgeProviderAdapter = {
      provider: "OPENAI",
      acquire: async () => {
        providerCalls += 1;
        return acquisition();
      },
    };

    const result = await processNextAdkKnowledgeJob({
      store,
      assignments: assignments(),
      adapters: adapters(adapter),
      sink: async () => ({
        rawProviderArtifactId: "raw-safety",
        markdownRawArtifactId: "markdown-safety",
      }),
    });

    expect(providerCalls).toBe(0);
    expect(result?.status).toBe("QUEUED");
  });

  it("does not let a stale worker completion overwrite a recovery quarantine", async () => {
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
      sink: async ({ job }) => {
        store.save(blockJobForRecovery(job, "operator recovery won"));
        return {
          rawProviderArtifactId: "raw-safety",
          markdownRawArtifactId: "markdown-safety",
        };
      },
    });

    expect(result?.status).toBe("BLOCKED_RECOVERY");
    expect(result?.error).toBe("operator recovery won");
    expect(result?.artifactIds).toEqual([]);
    expect(store.get(result!.id)?.status).toBe("BLOCKED_RECOVERY");
  });
});
