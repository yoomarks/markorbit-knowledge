import { describe, expect, it } from "vitest";
import eventFixture from "../../../fixtures/contracts/execution-lifecycle/v1/job-execution-event.valid.json";
import {
  canTransitionJob,
  deriveRunStatusFromJob,
  isExecutionLifecycleInput,
  isJobExecutionEvent,
  targetStatusForExecutionEvent,
} from "../src/execution-lifecycle-v1";

const startedInput = {
  contractVersion: "1.0",
  workerId: "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAA",
  jobId: "job_01ARZ3NDEKTSV4RRFFQ69G5FAD",
  runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAE",
  leaseId: "lse_01ARZ3NDEKTSV4RRFFQ69G5FAC",
  sequence: 1,
  eventType: "STARTED",
  observedAt: "2026-07-16T02:02:30Z",
} as const;

describe("Execution Lifecycle Protocol v1", () => {
  it("accepts the canonical execution event fixture", () => {
    expect(isJobExecutionEvent(eventFixture)).toBe(true);
  });

  it("accepts legal lifecycle input and rejects unknown fields", () => {
    expect(isExecutionLifecycleInput(startedInput)).toBe(true);
    expect(isExecutionLifecycleInput({ ...startedInput, unexpected: true })).toBe(false);
  });

  it("requires event-specific fields", () => {
    expect(
      isExecutionLifecycleInput({
        ...startedInput,
        sequence: 2,
        eventType: "PROGRESS_REPORTED",
        progressPercent: 42.5,
      }),
    ).toBe(true);
    expect(
      isExecutionLifecycleInput({
        ...startedInput,
        sequence: 2,
        eventType: "PROGRESS_REPORTED",
      }),
    ).toBe(false);
    expect(
      isExecutionLifecycleInput({
        ...startedInput,
        sequence: 3,
        eventType: "COMPLETED",
        outputSummary: {
          outputCount: 1,
          outputTypes: ["text/html"],
          contentHashes: ["a".repeat(64)],
        },
      }),
    ).toBe(true);
  });

  it("rejects secret-bearing metadata", () => {
    expect(
      isExecutionLifecycleInput({
        ...startedInput,
        metadata: {
          "x-markorbit-auth": {
            apiKey: "not-allowed",
          },
        },
      }),
    ).toBe(false);
  });

  it("locks the legal Job transition matrix", () => {
    expect(canTransitionJob("LEASED", "RUNNING")).toBe(true);
    expect(canTransitionJob("RUNNING", "RUNNING")).toBe(true);
    expect(canTransitionJob("RUNNING", "UPLOADING")).toBe(true);
    expect(canTransitionJob("UPLOADING", "VERIFYING")).toBe(true);
    expect(canTransitionJob("VERIFYING", "COMPLETED")).toBe(true);
    expect(canTransitionJob("RUNNING", "FAILED")).toBe(true);
    expect(canTransitionJob("PENDING", "RUNNING")).toBe(false);
    expect(canTransitionJob("COMPLETED", "RUNNING")).toBe(false);
    expect(canTransitionJob("FAILED", "RETRY")).toBe(false);
  });

  it("maps event types and derives single-Job CollectionRun status", () => {
    expect(targetStatusForExecutionEvent("STARTED")).toBe("RUNNING");
    expect(targetStatusForExecutionEvent("UPLOAD_READY")).toBe("UPLOADING");
    expect(targetStatusForExecutionEvent("VERIFICATION_READY")).toBe("VERIFYING");
    expect(targetStatusForExecutionEvent("COMPLETED")).toBe("COMPLETED");
    expect(deriveRunStatusFromJob("LEASED")).toBe("PENDING");
    expect(deriveRunStatusFromJob("UPLOADING")).toBe("RUNNING");
    expect(deriveRunStatusFromJob("COMPLETED")).toBe("COMPLETED");
    expect(deriveRunStatusFromJob("FAILED")).toBe("FAILED");
  });

  it("rejects inconsistent persisted events", () => {
    expect(
      isJobExecutionEvent({
        ...eventFixture,
        toStatus: "COMPLETED",
      }),
    ).toBe(false);
    expect(
      isJobExecutionEvent({
        ...eventFixture,
        fromStatus: "PENDING",
      }),
    ).toBe(false);
  });
});
