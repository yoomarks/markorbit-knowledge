import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { AiGroundedPreparedExecutionEvidenceV1 } from "@markorbit/contracts";
import type { AiKnowledgeProviderAdapter } from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import type { AiKnowledgeProvider } from "@markorbit/worker-runtime/ai-production-pilot";
import {
  ADK_GROUNDED_PREPARED_EXECUTION_MODE,
  ADK_GROUNDED_PREPARED_PROVIDER,
  enqueueAdkGroundedPreparedExecution,
} from "./adk-grounded-queue-admission";
import {
  MemoryAiKnowledgeJobStore,
  SqliteAiKnowledgeJobStore,
} from "./adk-knowledge-job-queue-store";
import {
  enqueueAdkKnowledgeJobs,
  processNextAdkKnowledgeJob,
  recoverAdkKnowledgeJobs,
} from "./adk-knowledge-job-worker";

const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const EXECUTION_SHA = "a".repeat(64);
const PROMPT_SHA = "b".repeat(64);
const RECEIPTS_SHA = "c".repeat(64);
const SOURCE_SHA = "d".repeat(64);

function evidence(): AiGroundedPreparedExecutionEvidenceV1 {
  return {
    protocolVersion: "1.0",
    objectType: "AI_GROUNDED_PREPARED_EXECUTION_EVIDENCE",
    executionInputSha256: EXECUTION_SHA,
    assignmentId: "kas_grounded_queue_test",
    bindingId: "asb_grounded_queue_test",
    sourcePackId: "asp_grounded_queue_test",
    sourcePackRevision: 1,
    rendererVersion: "1.0.0",
    renderedPromptSha256: PROMPT_SHA,
    sourceReceiptsSha256: RECEIPTS_SHA,
    sourceReceipts: [
      {
        sourceId: `src_${ULID}`,
        artifactId: `art_${ULID}`,
        canonicalUri: "https://www.uspto.gov/trademarks",
        mediaType: "text/html",
        contentSha256: SOURCE_SHA,
        sizeBytes: 128,
      },
    ],
    promptArtifact: {
      artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      workspaceId: `wsp_${ULID}`,
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      contentSha256: PROMPT_SHA,
      sizeBytes: 512,
      canonicalUri: `ai+markorbit://grounded-executions/${EXECUTION_SHA}/prompt`,
      sourceUri: `ai+markorbit://grounded-executions/${EXECUTION_SHA}/rendered-prompt`,
    },
    canonicalPreparedAt: "2026-08-24T11:00:00.000Z",
    persistedAt: "2026-08-24T11:01:00.000Z",
    providerCallAuthorized: false,
    providerCallExecuted: false,
    externalBrowsingAllowed: false,
    legalTruthVerified: false,
    executionAuthorityGranted: false,
  };
}

describe("grounded PREPARED queue admission", () => {
  it("deduplicates by immutable executionInputSha256", () => {
    const store = new MemoryAiKnowledgeJobStore();
    const first = enqueueAdkGroundedPreparedExecution({
      store,
      evidence: evidence(),
      now: () => new Date("2026-08-24T11:02:00.000Z"),
    });
    const replay = enqueueAdkGroundedPreparedExecution({
      store,
      evidence: evidence(),
      now: () => new Date("2026-08-24T11:05:00.000Z"),
    });

    expect(replay).toEqual(first);
    expect(store.list()).toHaveLength(1);
    expect(first).toMatchObject({
      assignmentId: "kas_grounded_queue_test",
      provider: ADK_GROUNDED_PREPARED_PROVIDER,
      executionMode: ADK_GROUNDED_PREPARED_EXECUTION_MODE,
      groundedExecutionInputSha256: EXECUTION_SHA,
      executionKey: `grounded-prepared:${EXECUTION_SHA}`,
      status: "QUEUED",
      attempts: 0,
      maxAttempts: 1,
      artifactIds: [],
    });
  });

  it("preserves idempotent replay for legacy jobs written before executionMode existed", () => {
    const store = new MemoryAiKnowledgeJobStore();
    const legacyJob = {
      id: "akj_legacy_upgrade_test",
      assignmentId: "assignment-legacy",
      provider: "OPENAI",
      status: "QUEUED" as const,
      attempts: 0,
      maxAttempts: 3,
      executionKey: "assignment-legacy:OPENAI:r1",
      createdAt: "2026-08-23T12:00:00.000Z",
      updatedAt: "2026-08-23T12:00:00.000Z",
      artifactIds: [],
    };
    store.put(legacyJob);

    const replay = enqueueAdkKnowledgeJobs({
      store,
      assignmentIds: [legacyJob.assignmentId],
      providers: ["OPENAI"],
      now: () => new Date("2026-08-24T12:00:00.000Z"),
    });

    expect(replay).toEqual([legacyJob]);
    expect(store.list()).toEqual([legacyJob]);
  });

  it("persists grounded queue identity through SQLite and rejects identity mutation", () => {
    const database = new DatabaseSync(":memory:");
    const store = new SqliteAiKnowledgeJobStore(database);
    const job = enqueueAdkGroundedPreparedExecution({ store, evidence: evidence() });

    expect(store.get(job.id)).toEqual(job);
    expect(() =>
      store.save({
        ...job,
        groundedExecutionInputSha256: "e".repeat(64),
      }),
    ).toThrow(/immutable identity changed/u);
    database.close();
  });

  it("blocks before RUNNING and never touches assignment, adapter, or sink", async () => {
    const store = new MemoryAiKnowledgeJobStore();
    enqueueAdkGroundedPreparedExecution({ store, evidence: evidence() });
    const getAssignment = vi.fn(() => null);
    const acquire = vi.fn(async () => {
      throw new Error("grounded queue job must never call a provider adapter");
    });
    const sink = vi.fn(async () => {
      throw new Error("grounded queue job must never persist provider output");
    });
    const adapters = new Map<AiKnowledgeProvider, AiKnowledgeProviderAdapter>([
      [
        "DEEPSEEK",
        {
          provider: "DEEPSEEK",
          acquire,
        },
      ],
    ]);

    const result = await processNextAdkKnowledgeJob({
      store,
      assignments: { getAssignment },
      adapters,
      sink,
    });

    expect(result).toMatchObject({
      status: "BLOCKED_EXECUTION",
      attempts: 0,
      error: "AI_GROUNDED_PROVIDER_EXECUTION_DISABLED",
    });
    expect(getAssignment).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
    expect(sink).not.toHaveBeenCalled();
  });

  it("does not automatically recover execution-blocked grounded jobs", async () => {
    const store = new MemoryAiKnowledgeJobStore();
    enqueueAdkGroundedPreparedExecution({ store, evidence: evidence() });
    await processNextAdkKnowledgeJob({
      store,
      assignments: { getAssignment: () => null },
      adapters: new Map<AiKnowledgeProvider, AiKnowledgeProviderAdapter>(),
      sink: async () => {
        throw new Error("sink must not run");
      },
    });

    const recovered = recoverAdkKnowledgeJobs({
      store,
      staleBefore: new Date("2100-01-01T00:00:00.000Z"),
      requeueRetryPending: true,
      requeueCredentialBlocked: true,
    });

    expect(recovered).toEqual({
      requeuedRetryPending: [],
      requeuedCredentialBlocked: [],
      requeuedStaleClaimed: [],
      blockedStaleRunning: [],
    });
    expect(store.list()[0]?.status).toBe("BLOCKED_EXECUTION");
  });
});
