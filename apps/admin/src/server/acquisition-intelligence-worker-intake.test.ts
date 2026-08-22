import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  type AcquisitionRunEvidence,
} from "@markorbit/contracts";
import { SqliteAcquisitionIntelligenceRepository } from "@markorbit/persistence/acquisition-intelligence";
import { recordAcquisitionIntelligenceWorkerIntake } from "./acquisition-intelligence-worker-intake";

function evidence(overrides: Partial<AcquisitionRunEvidence> = {}): AcquisitionRunEvidence {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_RUN_EVIDENCE",
    runId: "run_ip_au_577",
    sourceId: "src_ip_au_manual",
    playbookId: "official-static-index-tree",
    playbookRevision: 1,
    startedAt: "2026-08-22T00:00:05.000Z",
    finishedAt: "2026-08-22T00:04:55.000Z",
    outcome: "SUCCESS",
    counts: {
      discovered: 577,
      attempted: 577,
      fetched: 577,
      accepted: 577,
      duplicates: 0,
      retries: 0,
    },
    coverage: {
      knownCorpus: 577,
      ratio: 1,
      previousRatio: null,
    },
    httpStatusCounts: { "200": 577 },
    failureSignatures: [],
    surfaceOutcomes: [
      {
        surface: "INDEX_PAGE",
        discovered: 577,
        accepted: 577,
        knownCorpus: 577,
      },
    ],
    rendering: {
      used: false,
      comparativeProbe: { staticAccepted: 20, renderedAccepted: 20 },
    },
    changeDetection: {
      etagObserved: false,
      lastModifiedObserved: false,
      validator304Count: 0,
      digestChanges: 0,
    },
    performance: {
      durationMs: 290_000,
      bytes: 1,
    },
    evidenceRefs: ["workflow:ip-australia-live"],
    boundaries: {
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
    ...overrides,
  };
}

function dependencies(database: DatabaseSync) {
  return {
    database,
    workers: {
      verifyCredential(workerId: string, credential: string) {
        expect(workerId).toBe("worker-1");
        expect(credential).toBe("credential-1");
        return { workspaceId: "wsp_public" } as never;
      },
    },
    runs: {
      getById(runId: string) {
        expect(runId).toBe("run_ip_au_577");
        return {
          run: {
            id: runId,
            workspaceId: "wsp_public",
            sourceId: "src_ip_au_manual",
            status: "COMPLETED",
          },
          jobs: [],
        } as never;
      },
    },
    executions: {
      listForRun(runId: string) {
        expect(runId).toBe("run_ip_au_577");
        return [
          {
            attempt: {
              id: "exa_ip_au_577",
              workspaceId: "wsp_public",
              runId,
              workerId: "worker-1",
              status: "COMPLETED",
              startedAt: "2026-08-22T00:00:00.000Z",
              completedAt: "2026-08-22T00:05:00.000Z",
              updatedAt: "2026-08-22T00:05:00.000Z",
              receipt: {
                bytesPrepared: 10_000_000,
              },
            },
            events: [],
          },
        ] as never;
      },
    },
  };
}

describe("authenticated acquisition intelligence Worker intake", () => {
  it("authenticates before parsing evidence or initializing the learning registry", () => {
    const database = new DatabaseSync(":memory:");
    const input = dependencies(database);
    input.workers.verifyCredential = (() => {
      throw new Error("authentication rejected");
    }) as never;

    expect(() =>
      recordAcquisitionIntelligenceWorkerIntake(
        { workerId: "worker-1", credential: "wrong", evidence: { malformed: true } },
        input,
      ),
    ).toThrow("authentication rejected");

    const table = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'acquisition_run_evidence'",
      )
      .get();
    expect(table).toBeUndefined();
    database.close();
  });

  it("anchors Worker observations to trusted control-plane execution facts and learns idempotently", () => {
    const database = new DatabaseSync(":memory:");
    const input = dependencies(database);

    const first = recordAcquisitionIntelligenceWorkerIntake(
      { workerId: "worker-1", credential: "credential-1", evidence: evidence() },
      input,
    );
    expect(first).toMatchObject({
      version: "ACQUISITION_INTELLIGENCE_WORKER_INTAKE_V1",
      workerId: "worker-1",
      runId: "run_ip_au_577",
      sourceId: "src_ip_au_manual",
      executionAttemptId: "exa_ip_au_577",
      replayed: false,
      playbookHistory: {
        runs: 1,
        successRate: 1,
        averageCoverage: 1,
        averageDurationMs: 300_000,
      },
    });
    expect(first.lessonsRecorded).toBeGreaterThan(0);

    const stored = new SqliteAcquisitionIntelligenceRepository(database).getRunEvidence(
      "run_ip_au_577",
    );
    expect(stored).toMatchObject({
      startedAt: "2026-08-22T00:00:00.000Z",
      finishedAt: "2026-08-22T00:05:00.000Z",
      performance: {
        durationMs: 300_000,
        bytes: 10_000_000,
      },
    });
    expect(stored?.evidenceRefs).toEqual(
      expect.arrayContaining([
        "execution-attempt:exa_ip_au_577",
        "worker:worker-1",
        "workflow:ip-australia-live",
      ]),
    );

    const replay = recordAcquisitionIntelligenceWorkerIntake(
      { workerId: "worker-1", credential: "credential-1", evidence: evidence() },
      input,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.playbookHistory.runs).toBe(1);
    database.close();
  });

  it("rejects learning when the governed run and Worker observation disagree", () => {
    const database = new DatabaseSync(":memory:");
    const input = dependencies(database);

    expect(() =>
      recordAcquisitionIntelligenceWorkerIntake(
        {
          workerId: "worker-1",
          credential: "credential-1",
          evidence: evidence({ sourceId: "src_wrong" }),
        },
        input,
      ),
    ).toThrow("sourceId does not match");

    expect(() =>
      recordAcquisitionIntelligenceWorkerIntake(
        {
          workerId: "worker-1",
          credential: "credential-1",
          evidence: evidence({ outcome: "FAILED" }),
        },
        input,
      ),
    ).toThrow("only accepts SUCCESS or DEGRADED");
    database.close();
  });
});
