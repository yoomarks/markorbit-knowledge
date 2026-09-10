import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { CollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { applyAdaptiveRecrawlAfterCompletion } from "../adaptive-recrawl-completion";

const plans = {} as CollectionPlanRepository;
const transition = {
  replayed: false,
  attempt: {
    jobId: "job_watch",
    completedAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-10T12:00:00.000Z",
  },
};

function appliedResult() {
  return {
    planId: "pln_watch",
    sourceClass: "OFFICIAL_AUTHORITY" as const,
    enabled: true,
    applied: true,
    evaluatedAt: "2026-09-10T12:00:00.000Z",
    decision: "SLOWER" as const,
    currentIntervalSeconds: 86_400,
    recommendedIntervalSeconds: 172_800,
    evidenceRuns: 8,
    metadataOnlyRuns: 8,
    noChangeRatePercent: 100,
    cooldownUntil: null,
  };
}

describe("adaptive recrawl completion hook", () => {
  it("skips idempotent completion replays", () => {
    const database = new DatabaseSync(":memory:");
    const evaluator = vi.fn(() => appliedResult());
    const result = applyAdaptiveRecrawlAfterCompletion({
      database,
      plans,
      transition: { ...transition, replayed: true },
      evaluator,
    });
    expect(result).toBeNull();
    expect(evaluator).not.toHaveBeenCalled();
    database.close();
  });

  it("keeps worker completion successful when adaptive evaluation fails", () => {
    const database = new DatabaseSync(":memory:");
    const evaluator = vi.fn(() => {
      throw new Error("policy failure");
    });
    const logger = { warn: vi.fn() };
    const result = applyAdaptiveRecrawlAfterCompletion({
      database,
      plans,
      transition,
      evaluator,
      logger,
    });
    expect(result).toBeNull();
    expect(evaluator).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "Adaptive recrawl cadence evaluation failed",
      expect.objectContaining({ jobId: "job_watch", error: "policy failure" }),
    );
    database.close();
  });

  it("uses the durable completion timestamp for one evaluation", () => {
    const database = new DatabaseSync(":memory:");
    const evaluator = vi.fn(() => appliedResult());
    const result = applyAdaptiveRecrawlAfterCompletion({ database, plans, transition, evaluator });
    expect(result).toMatchObject({ applied: true, decision: "SLOWER" });
    expect(evaluator).toHaveBeenCalledWith(
      database,
      plans,
      "job_watch",
      new Date("2026-09-10T12:00:00.000Z"),
    );
    database.close();
  });
});
