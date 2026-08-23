import { describe, expect, it } from "vitest";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
} from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import type {
  AiKnowledgeProvider,
  AiProductionPilotPlanV1,
} from "@markorbit/worker-runtime/ai-production-pilot";
import { MemoryAiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";
import {
  enqueueAdkKnowledgeJobs,
  enqueueAdkProductionPilot,
  processNextAdkKnowledgeJob,
  recoverAdkKnowledgeJobs,
  type AdkAssignment,
  type AdkAssignmentRepository,
} from "./adk-knowledge-job-worker";

const assignment = {
  assignmentId: "assignment-1",
} as AdkAssignment;

const pilotPlan: AiProductionPilotPlanV1 = {
  protocolVersion: "1.0",
  objectType: "AI_PRODUCTION_PILOT_PLAN",
  pilotId: "app_adk_queue_pilot",
  assignmentIds: ["kas_assignment_one", "kas_assignment_two", "kas_assignment_three"],
  providers: ["DEEPSEEK", "OPENAI"],
  approvalRef: "approval://adk/queue-pilot",
  liveProviderCallsAuthorized: true,
  boundaries: {
    compareProviderQuality: false,
    legalTruthVerified: false,
    candidateAutoActivation: false,
  },
  createdAt: "2026-08-23T12:00:00.000Z",
};

function assignments(value: AdkAssignment | null = assignment): AdkAssignmentRepository {
  return {
    getAssignment: () => value,
  };
}

function pilotAssignments(missingId?: string): AdkAssignmentRepository {
  const ids = new Set<string>(pilotPlan.assignmentIds);
  return {
    getAssignment: (assignmentId) =>
      ids.has(assignmentId) && assignmentId !== missingId
        ? ({ ...assignment, assignmentId } as AdkAssignment)
        : null,
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

  it("uses explicit execution scopes without mixing them with revision scopes", () => {
    const store = new MemoryAiKnowledgeJobStore();
    const now = () => new Date("2026-08-23T12:00:00.000Z");

    const first = enqueueAdkKnowledgeJobs({
      store,
      assignmentIds: [assignment.assignmentId],
      providers: ["OPENAI"],
      executionScope: "pilot:app_scope_one",
      now,
    })[0];
    const replayed = enqueueAdkKnowledgeJobs({
      store,
      assignmentIds: [assignment.assignmentId],
      providers: ["OPENAI"],
      executionScope: "pilot:app_scope_one",
      now,
    })[0];
    const nextScope = enqueueAdkKnowledgeJobs({
      store,
      assignmentIds: [assignment.assignmentId],
      providers: ["OPENAI"],
      executionScope: "pilot:app_scope_two",
      now,
    })[0];

    expect(first.id).toBe(replayed.id);
    expect(first.executionKey).toBe("assignment-1:OPENAI:pilot:app_scope_one");
    expect(nextScope.id).not.toBe(first.id);
    expect(store.list()).toHaveLength(2);
    expect(() =>
      enqueueAdkKnowledgeJobs({
        store,
        assignmentIds: [assignment.assignmentId],
        providers: ["OPENAI"],
        executionScope: "pilot:app_scope_three",
        executionRevision: 2,
      }),
    ).toThrow(/cannot both be supplied/u);
  });

  it("materializes a governed production pilot once per pilot identity", () => {
    const store = new MemoryAiKnowledgeJobStore();
    const now = () => new Date("2026-08-23T12:00:00.000Z");

    const first = enqueueAdkProductionPilot({
      store,
      assignments: pilotAssignments(),
      plan: pilotPlan,
      now,
    });
    const replayed = enqueueAdkProductionPilot({
      store,
      assignments: pilotAssignments(),
      plan: pilotPlan,
      now,
    });

    expect(first).toHaveLength(6);
    expect(replayed.map((job) => job.id)).toEqual(first.map((job) => job.id));
    expect(store.list()).toHaveLength(6);
    expect(first.every((job) => job.executionKey?.endsWith("pilot:app_adk_queue_pilot"))).toBe(
      true,
    );

    const nextPilot = enqueueAdkProductionPilot({
      store,
      assignments: pilotAssignments(),
      plan: {
        ...pilotPlan,
        pilotId: "app_adk_queue_pilot_two",
        approvalRef: "approval://adk/queue-pilot-two",
      },
      now,
    });

    expect(nextPilot).toHaveLength(6);
    expect(nextPilot[0].id).not.toBe(first[0].id);
    expect(store.list()).toHaveLength(12);
  });

  it("fails closed before queue writes for unsupported providers or missing pilot assignments", () => {
    const unsupportedStore = new MemoryAiKnowledgeJobStore();
    expect(() =>
      enqueueAdkProductionPilot({
        store: unsupportedStore,
        assignments: pilotAssignments(),
        plan: {
          ...pilotPlan,
          providers: ["DEEPSEEK", "KIMI"],
        },
      }),
    ).toThrow(/does not support providers: KIMI/u);
    expect(unsupportedStore.list()).toHaveLength(0);

    const missingAssignmentStore = new MemoryAiKnowledgeJobStore();
    expect(() =>
      enqueueAdkProductionPilot({
        store: missingAssignmentStore,
        assignments: pilotAssignments("kas_assignment_two"),
        plan: pilotPlan,
      }),
    ).toThrow(/kas_assignment_two was not found/u);
    expect(missingAssignmentStore.list()).toHaveLength(0);
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
    expect(result?.artifactIds).toEqual(["adk-artifact-1", "raw-provider-1", "raw-markdown-1"]);
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

  it("quarantines persistence uncertainty after provider success instead of replaying provider work", async () => {
    const store = new MemoryAiKnowledgeJobStore();
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
      sink: async () => {
        throw new Error("storage temporarily unavailable");
      },
    });

    expect(result?.status).toBe("BLOCKED_RECOVERY");
    expect(result?.error).toMatch(/AI_ARTIFACT_PERSISTENCE_UNCERTAIN/u);
    expect(providerCalls).toBe(1);
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
    expect(providerCalls).toBe(1);
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

  it("rejects mismatched lineage and quarantines duplicate persisted lineage", async () => {
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
    expect(duplicate?.status).toBe("BLOCKED_RECOVERY");
    expect(duplicate?.error).toBe("AI_ACQUISITION_LINEAGE_REQUIRES_RECONCILIATION");
  });

  it("recovers only explicitly safe queue states and quarantines stale running work", () => {
    const store = new MemoryAiKnowledgeJobStore();
    const retryPending = enqueueAdkKnowledgeJobs({
      store,
      assignmentIds: [assignment.assignmentId],
      providers: ["OPENAI"],
      executionScope: "recovery:retry",
      now: () => new Date("2026-08-23T10:00:00.000Z"),
    })[0];
    store.save({
      ...retryPending,
      status: "RETRY_PENDING",
      attempts: 1,
      error: "timeout",
      updatedAt: "2026-08-23T10:05:00.000Z",
    });

    const credentialBlocked = enqueueAdkKnowledgeJobs({
      store,
      assignmentIds: [assignment.assignmentId],
      providers: ["OPENAI"],
      executionScope: "recovery:credential",
      now: () => new Date("2026-08-23T10:00:00.000Z"),
    })[0];
    store.save({
      ...credentialBlocked,
      status: "BLOCKED_CREDENTIAL",
      error: "missing key",
      updatedAt: "2026-08-23T10:05:00.000Z",
    });

    const staleClaimed = enqueueAdkKnowledgeJobs({
      store,
      assignmentIds: [assignment.assignmentId],
      providers: ["OPENAI"],
      executionScope: "recovery:claimed",
      now: () => new Date("2026-08-23T10:00:00.000Z"),
    })[0];
    store.save({
      ...staleClaimed,
      status: "CLAIMED",
      updatedAt: "2026-08-23T10:05:00.000Z",
    });

    const staleRunning = enqueueAdkKnowledgeJobs({
      store,
      assignmentIds: [assignment.assignmentId],
      providers: ["OPENAI"],
      executionScope: "recovery:running",
      now: () => new Date("2026-08-23T10:00:00.000Z"),
    })[0];
    store.save({
      ...staleRunning,
      status: "RUNNING",
      updatedAt: "2026-08-23T10:05:00.000Z",
    });

    const result = recoverAdkKnowledgeJobs({
      store,
      staleBefore: new Date("2026-08-23T11:00:00.000Z"),
      requeueRetryPending: true,
      requeueCredentialBlocked: true,
    });

    expect(result.requeuedRetryPending).toEqual([retryPending.id]);
    expect(result.requeuedCredentialBlocked).toEqual([credentialBlocked.id]);
    expect(result.requeuedStaleClaimed).toEqual([staleClaimed.id]);
    expect(result.blockedStaleRunning).toEqual([staleRunning.id]);
    expect(store.get(retryPending.id)?.status).toBe("QUEUED");
    expect(store.get(credentialBlocked.id)?.status).toBe("QUEUED");
    expect(store.get(staleClaimed.id)?.status).toBe("QUEUED");
    expect(store.get(staleRunning.id)?.status).toBe("BLOCKED_RECOVERY");
    expect(store.get(staleRunning.id)?.error).toBe("AI_STALE_RUNNING_REQUIRES_RECONCILIATION");
  });
});
