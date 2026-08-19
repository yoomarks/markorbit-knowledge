import { describe, expect, it } from "vitest";
import type { ProductionValidationManifest } from "./production-validation-discovery-intake";
import { inspectProductionValidationExecution } from "./production-validation-execution-status";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function manifest(): ProductionValidationManifest {
  return {
    manifestVersion: "1.0",
    waveId: "official-wave-test",
    governance: {
      collectionAuthorizationRequired: true,
      discoveryDoesNotActivateSource: true,
      noAutomaticProductionScheduling: true,
      realObservationsOnly: true,
    },
    targets: [
      {
        id: "us-uspto-trademarks",
        jurisdiction: "US",
        authority: "United States Patent and Trademark Office",
        canonicalUri: "https://www.uspto.gov/trademarks",
        sourceClass: "OFFICIAL_AUTHORITY",
        priority: "P0",
        validationState: "PENDING_REAL_RUN",
      },
    ],
  };
}

function sourceRepository(items: unknown[]) {
  return {
    list() {
      return {
        items,
        total: items.length,
        limit: 100,
        offset: 0,
        summary: {} as never,
      };
    },
  } as never;
}

function executionRepository(items: unknown[]) {
  return {
    list(filters: { limit?: number; offset?: number }) {
      const limit = filters.limit ?? 100;
      const offset = filters.offset ?? 0;
      return {
        items: items.slice(offset, offset + limit),
        total: items.length,
        limit,
        offset,
        summary: {} as never,
      };
    },
  } as never;
}

describe("production validation execution status", () => {
  it("distinguishes targets that have not reached the Source registry", () => {
    const status = inspectProductionValidationExecution(
      { workspaceId, manifest: manifest() },
      {
        sources: sourceRepository([]),
        runs: executionRepository([]),
      },
    );

    expect(status.items[0]).toMatchObject({
      state: "NOT_REGISTERED",
      runCount: 0,
      secondRunObserved: false,
    });
    expect(status.summary).toMatchObject({
      NOT_REGISTERED: 1,
      AWAITING_AUTHORIZATION: 0,
      RUN_OBSERVED: 0,
      runsObserved: 0,
    });
  });

  it("distinguishes registered Sources that have not crossed explicit collection authorization", () => {
    const status = inspectProductionValidationExecution(
      { workspaceId, manifest: manifest() },
      {
        sources: sourceRepository([
          {
            id: "src_uspto",
            canonicalUri: "https://www.uspto.gov/trademarks",
            entrypoints: [],
          },
        ]),
        runs: executionRepository([]),
      },
    );

    expect(status.items[0]).toMatchObject({
      state: "AWAITING_AUTHORIZATION",
      sourceId: "src_uspto",
      runCount: 0,
    });
    expect(status.summary.AWAITING_AUTHORIZATION).toBe(1);
  });

  it("projects real run history and second-run evidence without inventing success", () => {
    const status = inspectProductionValidationExecution(
      { workspaceId, manifest: manifest() },
      {
        sources: sourceRepository([
          {
            id: "src_uspto",
            canonicalUri: "https://www.uspto.gov/trademarks",
            entrypoints: [],
          },
        ]),
        runs: executionRepository([
          {
            run: {
              id: "run_old",
              status: "FAILED",
              requestedAt: "2026-08-19T03:00:00Z",
            },
            jobs: [{ status: "FAILED" }],
          },
          {
            run: {
              id: "run_new",
              status: "COMPLETED",
              requestedAt: "2026-08-19T04:00:00Z",
            },
            jobs: [{ status: "SUCCEEDED" }],
          },
        ]),
      },
    );

    expect(status.items[0]).toMatchObject({
      state: "RUN_OBSERVED",
      sourceId: "src_uspto",
      runCount: 2,
      completedRunCount: 1,
      failedRunCount: 1,
      secondRunObserved: true,
      latestRunId: "run_new",
      latestRunStatus: "COMPLETED",
      latestRequestedAt: "2026-08-19T04:00:00Z",
      latestJobStatuses: ["SUCCEEDED"],
    });
    expect(status.summary).toMatchObject({
      RUN_OBSERVED: 1,
      runsObserved: 2,
      completedRuns: 1,
      failedRuns: 1,
      targetsWithSecondRun: 1,
    });
  });
});
