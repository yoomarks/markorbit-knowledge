import { describe, expect, it } from "vitest";
import { summarizeSourceCollectionHealth } from "../source-collection-health";

describe("source collection health", () => {
  it("distinguishes never-run, healthy, collecting and cancelled sources", () => {
    expect(summarizeSourceCollectionHealth([]).state).toBe("NEVER_RUN");
    expect(
      summarizeSourceCollectionHealth([
        {
          sourceId: "src_a",
          status: "COMPLETED",
          updatedAt: "2026-08-15T12:00:00.000Z",
          retrying: false,
          jobFailureAt: null,
        },
      ]).state,
    ).toBe("HEALTHY");
    expect(
      summarizeSourceCollectionHealth([
        {
          sourceId: "src_a",
          status: "RUNNING",
          updatedAt: "2026-08-15T12:00:00.000Z",
          retrying: false,
          jobFailureAt: null,
        },
      ]).state,
    ).toBe("COLLECTING");
    expect(
      summarizeSourceCollectionHealth([
        {
          sourceId: "src_a",
          status: "CANCELLED",
          updatedAt: "2026-08-15T12:00:00.000Z",
          retrying: false,
          jobFailureAt: null,
        },
      ]).state,
    ).toBe("CANCELLED");
  });

  it("surfaces durable retry state before terminal failure", () => {
    const health = summarizeSourceCollectionHealth([
      {
        sourceId: "src_a",
        status: "PENDING",
        updatedAt: "2026-08-15T12:00:10.000Z",
        retrying: true,
        jobFailureAt: "2026-08-15T12:00:09.000Z",
      },
      {
        sourceId: "src_a",
        status: "COMPLETED",
        updatedAt: "2026-08-15T11:00:00.000Z",
        retrying: false,
        jobFailureAt: null,
      },
    ]);
    expect(health).toMatchObject({
      state: "RETRYING",
      latestRunStatus: "PENDING",
      lastFailureAt: "2026-08-15T12:00:09.000Z",
      consecutiveFailures: 0,
      failedRuns: 0,
    });
  });

  it("aggregates consecutive and recent terminal failures", () => {
    const health = summarizeSourceCollectionHealth([
      {
        sourceId: "src_a",
        status: "FAILED",
        updatedAt: "2026-08-15T12:00:00.000Z",
        retrying: false,
        jobFailureAt: "2026-08-15T11:59:59.000Z",
      },
      {
        sourceId: "src_a",
        status: "FAILED",
        updatedAt: "2026-08-15T11:00:00.000Z",
        retrying: false,
        jobFailureAt: null,
      },
      {
        sourceId: "src_a",
        status: "COMPLETED",
        updatedAt: "2026-08-15T10:00:00.000Z",
        retrying: false,
        jobFailureAt: null,
      },
      {
        sourceId: "src_a",
        status: "FAILED",
        updatedAt: "2026-08-15T09:00:00.000Z",
        retrying: false,
        jobFailureAt: null,
      },
    ]);
    expect(health).toMatchObject({
      state: "FAILING",
      consecutiveFailures: 2,
      failedRuns: 3,
      lastFailureAt: "2026-08-15T11:59:59.000Z",
    });
  });
});
