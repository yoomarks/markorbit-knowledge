import { describe, expect, it } from "vitest";

import {
  claimJob,
  completeJob,
  failJob,
  markCredentialBlocked,
  markRunning,
  requeueJob,
} from "./adk-knowledge-job-queue";

const job = {
  id: "job-1",
  assignmentId: "assignment-1",
  provider: "openai",
  status: "QUEUED" as const,
  attempts: 0,
  maxAttempts: 3,
  executionKey: "assignment-1:openai",
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  artifactIds: [],
};

describe("ADK knowledge job queue", () => {
  it("claims queued jobs and starts runtime execution", () => {
    const claimed = claimJob(job);
    const running = markRunning(claimed);

    expect(claimed.status).toBe("CLAIMED");
    expect(running.status).toBe("RUNNING");
  });

  it("blocks claimed or running jobs when provider credentials are missing", () => {
    const claimed = claimJob(job);
    const blockedBeforeRun = markCredentialBlocked(claimed, "missing key");
    const running = markRunning(claimed);
    const blockedDuringRun = markCredentialBlocked(running, "missing key");

    expect(blockedBeforeRun.status).toBe("BLOCKED_CREDENTIAL");
    expect(blockedDuringRun.status).toBe("BLOCKED_CREDENTIAL");
    expect(blockedDuringRun.attempts).toBe(0);
  });

  it("requeues retryable failures before max attempts", () => {
    const running = markRunning(claimJob(job));
    const failed = failJob(running, "provider timeout");
    const requeued = requeueJob(failed);

    expect(failed.status).toBe("RETRY_PENDING");
    expect(failed.attempts).toBe(1);
    expect(requeued.status).toBe("QUEUED");
    expect(requeued.attempts).toBe(1);
  });

  it("moves exhausted failures into the terminal failed state", () => {
    const running = markRunning(
      claimJob({
        ...job,
        attempts: 2,
      }),
    );
    const failed = failJob(running, "provider timeout");

    expect(failed.status).toBe("FAILED");
    expect(failed.attempts).toBe(3);
  });

  it("moves non-retryable failures directly into the terminal failed state", () => {
    const running = markRunning(claimJob(job));
    const failed = failJob(running, "invalid provider response", { retryable: false });

    expect(failed.status).toBe("FAILED");
    expect(failed.attempts).toBe(1);
  });

  it("requires a running job and artifact lineage for success", () => {
    const running = markRunning(claimJob(job));
    const succeeded = completeJob(running, ["artifact-1"]);

    expect(succeeded.status).toBe("SUCCEEDED");
    expect(succeeded.artifactIds).toEqual(["artifact-1"]);
    expect(() => completeJob(running, [])).toThrow(/at least one artifact/u);
  });

  it("rejects invalid lifecycle transitions", () => {
    expect(() => markRunning(job)).toThrow(/Only claimed jobs/u);
    expect(() => failJob(job, "boom")).toThrow(/Only running jobs/u);
    expect(() => requeueJob(job)).toThrow(/Only retry-pending jobs/u);
  });
});
