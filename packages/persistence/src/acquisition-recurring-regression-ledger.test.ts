import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { AcquisitionRecurringRegressionResultV1 } from "@markorbit/contracts";
import { RegistryConflictError } from "./index";
import {
  SqliteAcquisitionRecurringRegressionLedger,
  type AcquisitionBaselineAdvancementAuthorization,
} from "./acquisition-recurring-regression-ledger";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const path of tempDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "markorbit-regression-ledger-"));
  tempDirectories.push(directory);
  return join(directory, "knowledge.sqlite");
}

function regression(
  overrides: Partial<AcquisitionRecurringRegressionResultV1> = {},
): AcquisitionRecurringRegressionResultV1 {
  return {
    version: "ACQUISITION_RECURRING_REGRESSION_V1",
    sourceId: "src-country-index",
    playbookId: "official-jurisdiction-index",
    playbookRevision: 1,
    baselineRunId: "run-001",
    baselineFinishedAt: "2026-08-28T01:00:00.000Z",
    currentRunId: "run-002",
    currentFinishedAt: "2026-08-28T02:00:00.000Z",
    state: "UNCHANGED",
    reasonCodes: ["OBJECTIVE_ACQUISITION_SIGNALS_STABLE"],
    deltas: {
      coverageRatio: 0,
      accepted: 0,
      duplicateRatio: 0,
      failures: 0,
      httpErrorRatio: 0,
      digestChanges: 0,
    },
    evidenceRefs: [
      "acquisition-run:run-001",
      "acquisition-run:run-002",
      "artifact:baseline",
      "artifact:current",
    ],
    reevaluationRequest: null,
    boundaries: {
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
      legalTruthVerified: false,
    },
    ...overrides,
  };
}

function authorization(
  overrides: Partial<AcquisitionBaselineAdvancementAuthorization> = {},
): AcquisitionBaselineAdvancementAuthorization {
  return {
    decision: "APPROVED",
    authorizationRef: "governance-approval:001",
    actor: { actorType: "HUMAN", actorId: "reviewer-1" },
    rationale:
      "Reviewed exact recurring acquisition evidence and accepted the current run as baseline.",
    advancedAt: "2026-08-28T02:05:00.000Z",
    evidenceRefs: ["review:001"],
    ...overrides,
  };
}

const identity = {
  sourceId: "src-country-index",
  playbookId: "official-jurisdiction-index",
  playbookRevision: 1,
};

describe("SqliteAcquisitionRecurringRegressionLedger", () => {
  it("persists deterministic snapshots idempotently without silently advancing baseline", () => {
    const database = new DatabaseSync(databasePath());
    const ledger = new SqliteAcquisitionRecurringRegressionLedger(database);
    const first = ledger.recordSnapshot(regression());
    const replay = ledger.recordSnapshot(regression());

    expect(replay.id).toBe(first.id);
    expect(replay.result).toEqual(first.result);
    expect(ledger.listHistory(identity)).toHaveLength(1);
    expect(ledger.getAcceptedBaseline(identity)).toBeNull();
    database.close();
  });

  it("rejects conflicting replay for the same baseline/current identity", () => {
    const database = new DatabaseSync(databasePath());
    const ledger = new SqliteAcquisitionRecurringRegressionLedger(database);
    ledger.recordSnapshot(regression());

    expect(() =>
      ledger.recordSnapshot(
        regression({
          state: "EXPECTED_CHANGE",
          reasonCodes: ["CONTENT_DIGEST_CHANGE_WITHOUT_ACQUISITION_REGRESSION"],
          deltas: {
            coverageRatio: 0,
            accepted: 0,
            duplicateRatio: 0,
            failures: 0,
            httpErrorRatio: 0,
            digestChanges: 1,
          },
        }),
      ),
    ).toThrow(RegistryConflictError);
    database.close();
  });

  it("requires exact run evidence refs before accepting a durable snapshot", () => {
    const database = new DatabaseSync(databasePath());
    const ledger = new SqliteAcquisitionRecurringRegressionLedger(database);
    expect(() => ledger.recordSnapshot(regression({ evidenceRefs: ["artifact:only"] }))).toThrow(
      RegistryConflictError,
    );
    database.close();
  });

  it("advances baseline only through an explicit governed action and replays idempotently", () => {
    const database = new DatabaseSync(databasePath());
    const ledger = new SqliteAcquisitionRecurringRegressionLedger(database);
    const snapshot = ledger.recordSnapshot(regression());
    const first = ledger.advanceBaseline(snapshot.id, authorization());

    expect(first.replayed).toBe(false);
    expect(first.baseline.runId).toBe("run-002");
    expect(first.baseline.version).toBe(1);
    expect(first.event.previousBaselineRunId).toBeNull();
    expect(first.event.newBaselineRunId).toBe("run-002");
    expect(first.event.boundaries).toEqual({
      autoDispatchApplied: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
      activePlaybookRewritten: false,
    });

    const replay = ledger.advanceBaseline(snapshot.id, authorization());
    expect(replay.replayed).toBe(true);
    expect(replay.event.id).toBe(first.event.id);
    expect(ledger.listBaselineAdvancements(identity)).toHaveLength(1);
    database.close();
  });

  it("fails closed without explicit governance authorization", () => {
    const database = new DatabaseSync(databasePath());
    const ledger = new SqliteAcquisitionRecurringRegressionLedger(database);
    const snapshot = ledger.recordSnapshot(regression());

    expect(() =>
      ledger.advanceBaseline(snapshot.id, {
        ...authorization(),
        decision: "REJECTED",
      } as unknown as AcquisitionBaselineAdvancementAuthorization),
    ).toThrow(RegistryConflictError);
    expect(ledger.getAcceptedBaseline(identity)).toBeNull();
    database.close();
  });

  it("preserves immutable regression and advancement history across restart", () => {
    const path = databasePath();
    let database = new DatabaseSync(path);
    let ledger = new SqliteAcquisitionRecurringRegressionLedger(database);

    const firstSnapshot = ledger.recordSnapshot(regression());
    ledger.advanceBaseline(firstSnapshot.id, authorization());

    const materialRegression = regression({
      baselineRunId: "run-002",
      baselineFinishedAt: "2026-08-28T02:00:00.000Z",
      currentRunId: "run-003",
      currentFinishedAt: "2026-08-28T03:00:00.000Z",
      state: "COVERAGE_DEGRADED",
      reasonCodes: ["COVERAGE_DROP_GTE_5_POINTS"],
      deltas: {
        coverageRatio: -0.08,
        accepted: -8,
        duplicateRatio: 0,
        failures: 0,
        httpErrorRatio: 0,
        digestChanges: 0,
      },
      evidenceRefs: [
        "acquisition-run:run-002",
        "acquisition-run:run-003",
        "artifact:baseline-2",
        "artifact:current-3",
      ],
      reevaluationRequest: {
        protocolVersion: "1.0",
        objectType: "ACQUISITION_STRATEGY_REEVALUATION_REQUEST",
        id: "recurring-regression:run-003:COVERAGE_DEGRADED",
        runId: "run-003",
        sourceId: "src-country-index",
        playbookId: "official-jurisdiction-index",
        playbookRevision: 1,
        requestedAt: "2026-08-28T03:00:00.000Z",
        status: "PENDING",
        lessonTypes: ["COVERAGE_REGRESSION"],
        reasonCodes: ["COVERAGE_DROP_GTE_5_POINTS"],
        fallbackPlaybookIds: [],
        evidenceRefs: ["acquisition-run:run-002", "acquisition-run:run-003"],
        boundaries: {
          autoDispatchApplied: false,
          autoPromotionApplied: false,
          collectionAuthorityGranted: false,
        },
      },
    });
    const secondSnapshot = ledger.recordSnapshot(materialRegression);

    expect(ledger.getAcceptedBaseline(identity)?.runId).toBe("run-002");
    expect(ledger.listHistory(identity).map((item) => item.result.state)).toEqual([
      "UNCHANGED",
      "COVERAGE_DEGRADED",
    ]);

    ledger.advanceBaseline(
      secondSnapshot.id,
      authorization({
        authorizationRef: "governance-approval:002",
        advancedAt: "2026-08-28T03:10:00.000Z",
        evidenceRefs: ["review:002"],
      }),
    );
    database.close();

    database = new DatabaseSync(path);
    ledger = new SqliteAcquisitionRecurringRegressionLedger(database);
    expect(ledger.getAcceptedBaseline(identity)).toMatchObject({
      runId: "run-003",
      version: 2,
    });
    expect(ledger.listHistory(identity).map((item) => item.id)).toEqual([
      firstSnapshot.id,
      secondSnapshot.id,
    ]);
    expect(ledger.listHistory(identity)[1]?.result.state).toBe("COVERAGE_DEGRADED");
    expect(ledger.listBaselineAdvancements(identity)).toHaveLength(2);
    database.close();
  });
});
