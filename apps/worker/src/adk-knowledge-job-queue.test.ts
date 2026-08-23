import { describe, expect, it } from "vitest";

import {
  claimJob,
  completeJob,
  failJob,
  markCredentialBlocked,
  markRunning,
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
  it("claims queued jobs", () => {
    expect(claimJob(job).status).toBe("CLAIMED");
  });

  it("moves claimed jobs into runtime execution", () => {
    expect(markRunning(claimJob(job)).status).toBe("RUNNING");
  });

  it("blocks missing credentials without success", () => {
    expect(markCredentialBlocked(job, "missing key").status).toBe(
      "BLOCKED_CREDENTIAL",
    );
  });

  it("retries failed executions before max attempts", () => {
    const failed = failJob(markRunning(claimJob(job)), "provider timeout");

    expect(failed.status).toBe("RETRY_PENDING");
    expect(failed.attempts).toBe(1);
  });

  it("requires artifacts for successful completion output", () => {
    expect(completeJob(job, ["artifact-1"]).artifactIds).toEqual([
      "artifact-1",
    ]);
  });
});
