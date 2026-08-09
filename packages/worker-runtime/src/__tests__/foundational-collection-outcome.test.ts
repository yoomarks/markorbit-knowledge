import { describe, expect, it } from "vitest";
import {
  assembleFoundationalCollectionOutcome,
  deriveFoundationalCollectionOutcomeState,
  deriveFoundationalCollectionRetryDisposition,
} from "../foundational-collection-outcome";

describe("foundational collection outcome", () => {
  it("treats pending and running collection runs as active and non-retryable", () => {
    expect(deriveFoundationalCollectionOutcomeState("PENDING")).toBe("ACTIVE");
    expect(deriveFoundationalCollectionOutcomeState("RUNNING")).toBe("ACTIVE");
    expect(
      deriveFoundationalCollectionRetryDisposition({
        state: "ACTIVE",
        currentCollectionActionRequired: true,
      }),
    ).toEqual({ retryDisposition: "BLOCKED_ACTIVE_RUN", requiresNewIntent: false });
  });

  it("requires a fresh approval after a failed or cancelled run when COLLECT is still required", () => {
    expect(
      deriveFoundationalCollectionRetryDisposition({
        state: "FAILED",
        currentCollectionActionRequired: true,
      }),
    ).toEqual({ retryDisposition: "REQUIRES_NEW_APPROVAL", requiresNewIntent: true });
    expect(
      deriveFoundationalCollectionRetryDisposition({
        state: "CANCELLED",
        currentCollectionActionRequired: true,
      }),
    ).toEqual({ retryDisposition: "REQUIRES_NEW_APPROVAL", requiresNewIntent: true });
  });

  it("marks completed-but-still-COLLECT runs for review instead of automatic retry", () => {
    const outcome = assembleFoundationalCollectionOutcome({
      executionId: "fae_example",
      intentId: "fai_example",
      workspaceId: "wsp_example",
      jurisdiction: "US",
      targetId: "us-uspto-trademarks-root",
      runId: "run_example",
      runStatus: "COMPLETED",
      runUpdatedAt: "2026-08-10T04:00:00.000Z",
      currentCollectionActionRequired: true,
      observedAt: "2026-08-10T04:01:00.000Z",
    });
    expect(outcome.state).toBe("COMPLETED");
    expect(outcome.retryDisposition).toBe("REVIEW_COMPLETED_COLLECTION");
    expect(outcome.requiresNewIntent).toBe(true);
    expect(outcome.automaticRetry).toBe(false);
  });

  it("does not propose another intent when current readiness no longer requires collection", () => {
    expect(
      deriveFoundationalCollectionRetryDisposition({
        state: "COMPLETED",
        currentCollectionActionRequired: false,
      }),
    ).toEqual({ retryDisposition: "NO_ACTION_REQUIRED", requiresNewIntent: false });
  });

  it("blocks retries when the execution ledger references a missing CollectionRun", () => {
    expect(deriveFoundationalCollectionOutcomeState(null)).toBe("MISSING_RUN");
    expect(
      deriveFoundationalCollectionRetryDisposition({
        state: "MISSING_RUN",
        currentCollectionActionRequired: true,
      }),
    ).toEqual({ retryDisposition: "BLOCKED_MISSING_RUN", requiresNewIntent: false });
  });
});
