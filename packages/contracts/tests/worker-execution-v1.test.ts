import { describe, expect, it } from "vitest";
import {
  isExecutionAttempt,
  isExecutionEvent,
  isExecutionFailure,
  isExecutionReceipt,
  type ExecutionAttempt,
  type ExecutionEvent,
  type ExecutionFailure,
  type ExecutionReceipt,
} from "../src/worker-execution-v1";

const executor = {
  executorId: "fixture-connector-runtime",
  version: "1.0.0",
  mode: "FIXTURE" as const,
};

const receipt: ExecutionReceipt = {
  executor,
  outputKinds: ["HTML", "MARKDOWN"],
  itemsObserved: 3,
  bytesPrepared: 1024,
  metadataOnly: true,
  summary: "Fixture execution only.",
};

const failure: ExecutionFailure = {
  code: "FIXTURE_EXECUTION_FAILED",
  message: "Deterministic failure.",
  retryable: false,
  occurredAt: "2026-07-16T08:00:04Z",
};

const attempt: ExecutionAttempt = {
  contractVersion: "1.0",
  objectType: "EXECUTION_ATTEMPT",
  id: "exa_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  jobId: "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  jobAttempt: 1,
  leaseId: "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  workerId: "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  connector: { connectorId: "fixture-web", version: "1.0.0" },
  executor,
  status: "RUNNING",
  startedAt: "2026-07-16T08:00:00Z",
  updatedAt: "2026-07-16T08:00:00Z",
};

const event: ExecutionEvent = {
  contractVersion: "1.0",
  objectType: "EXECUTION_EVENT",
  id: "eve_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  attemptId: attempt.id,
  sequence: 1,
  eventType: "STARTED",
  toStatus: "RUNNING",
  idempotencyKey: "fixture-start",
  payloadHash: "a".repeat(64),
  recordedAt: "2026-07-16T08:00:00Z",
};

describe("Worker Execution Protocol v1", () => {
  it("accepts strict nonterminal and terminal objects", () => {
    expect(isExecutionAttempt(attempt)).toBe(true);
    expect(
      isExecutionAttempt({
        ...attempt,
        status: "COMPLETED",
        updatedAt: "2026-07-16T08:00:04Z",
        completedAt: "2026-07-16T08:00:04Z",
        receipt,
      }),
    ).toBe(true);
    expect(
      isExecutionAttempt({
        ...attempt,
        status: "FAILED",
        updatedAt: "2026-07-16T08:00:04Z",
        completedAt: "2026-07-16T08:00:04Z",
        failure,
      }),
    ).toBe(true);
    expect(isExecutionEvent(event)).toBe(true);
    expect(isExecutionReceipt(receipt)).toBe(true);
    expect(isExecutionFailure(failure)).toBe(true);
  });

  it("rejects unknown fields and invalid terminal evidence", () => {
    expect(isExecutionAttempt({ ...attempt, unknown: true })).toBe(false);
    expect(isExecutionEvent({ ...event, command: "curl example.com" })).toBe(false);
    expect(
      isExecutionAttempt({
        ...attempt,
        status: "COMPLETED",
        completedAt: "2026-07-16T08:00:04Z",
      }),
    ).toBe(false);
    expect(isExecutionReceipt({ ...receipt, metadataOnly: false })).toBe(false);
    expect(
      isExecutionReceipt({
        ...receipt,
        metadataOnly: false,
        artifactReceiptIds: ["air_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
      }),
    ).toBe(true);
    expect(isExecutionFailure({ ...failure, code: "bad-code" })).toBe(false);
  });

  it("requires immutable matching executor evidence", () => {
    expect(
      isExecutionAttempt({
        ...attempt,
        status: "COMPLETED",
        completedAt: "2026-07-16T08:00:04Z",
        updatedAt: "2026-07-16T08:00:04Z",
        receipt: {
          ...receipt,
          executor: { ...executor, version: "2.0.0" },
        },
      }),
    ).toBe(false);
  });
});
