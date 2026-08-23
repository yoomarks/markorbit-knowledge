import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ProductionValidationScorecard } from "./production-validation-scorecard";
import { SqliteProductionValidationScorecardSnapshotRepository } from "./production-validation-scorecard-snapshots";

function scorecard(generatedAt = "2026-08-23T00:00:00.000Z"): ProductionValidationScorecard {
  return {
    reportVersion: "1.2",
    waveId: "wave-1",
    workspaceId: "workspace-1",
    generatedAt,
    summary: {
      targets: 0, onboarded: 0, collectionSucceeded: 0, knowledgeVisible: 0,
      secondRunObserved: 0, compatibilityObserved: 0, compatibilityPass: 0,
      compatibilityDegraded: 0, compatibilityBlocked: 0, failureObserved: 0,
      adapterRequiredObserved: 0, artifactContractObserved: 0,
      artifactContractGapObserved: 0, structuredRemediationObserved: 0,
      structuredRemediationRequired: 0, structuredRemediationPrepared: 0,
      structuredRemediationInvalid: 0, structuredRemediationAwaitingWorkerBinding: 0,
      secondRunValidated: null, manualInterventionRequired: null,
    },
    results: [],
  };
}

describe("production validation scorecard snapshots", () => {
  it("persists immutable, digest-addressed evidence and replays an idempotency key", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteProductionValidationScorecardSnapshotRepository(database);
    const first = repository.capture(
      { scorecard: scorecard(), idempotencyKey: "operator-run-1" },
      () => new Date("2026-08-23T01:00:00.000Z"),
    );
    const replay = repository.capture(
      { scorecard: scorecard("2026-08-23T02:00:00.000Z"), idempotencyKey: "operator-run-1" },
      () => new Date("2026-08-23T02:00:00.000Z"),
    );

    expect(replay).toEqual(first);
    expect(first.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(repository.list({ workspaceId: "workspace-1", waveId: "wave-1" })).toEqual([first]);
  });

  it("keeps independently keyed captures as append-only history", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteProductionValidationScorecardSnapshotRepository(database);
    repository.capture({ scorecard: scorecard(), idempotencyKey: "run-1" });
    repository.capture({ scorecard: scorecard("2026-08-23T03:00:00.000Z"), idempotencyKey: "run-2" });
    expect(repository.list({ workspaceId: "workspace-1", waveId: "wave-1" })).toHaveLength(2);
  });
});
