import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  type AcquisitionRunEvidence,
} from "@markorbit/contracts";
import { RegistryConflictError } from "../src/index";
import { SqliteAcquisitionLearningLoopRepository } from "../src/acquisition-learning-loop";

function evidence(input: {
  runId: string;
  finishedAt: string;
  coverage: number | null;
  previousRatio?: number | null;
}): AcquisitionRunEvidence {
  const knownCorpus = input.coverage === null ? null : 100;
  const accepted = input.coverage === null ? 10 : Math.round(100 * input.coverage);
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_RUN_EVIDENCE",
    runId: input.runId,
    sourceId: "src_recurring_manual",
    playbookId: "official-static-index-tree",
    playbookRevision: 1,
    startedAt: "2026-08-22T00:00:00.000Z",
    finishedAt: input.finishedAt,
    outcome: input.coverage !== null && input.coverage < 1 ? "DEGRADED" : "SUCCESS",
    counts: {
      discovered: knownCorpus ?? accepted,
      attempted: knownCorpus ?? accepted,
      fetched: accepted,
      accepted,
      duplicates: 0,
      retries: 0,
    },
    coverage: {
      knownCorpus,
      ratio: input.coverage,
      previousRatio: input.previousRatio ?? null,
    },
    httpStatusCounts: { "200": accepted },
    failureSignatures: [],
    surfaceOutcomes: [
      {
        surface: "INDEX_PAGE",
        discovered: knownCorpus ?? accepted,
        accepted,
        knownCorpus,
      },
    ],
    rendering: { used: false },
    changeDetection: {
      etagObserved: true,
      lastModifiedObserved: false,
      validator304Count: 0,
      digestChanges: 0,
    },
    performance: { durationMs: 1000, bytes: 1000 },
    evidenceRefs: [`run:${input.runId}`],
    boundaries: {
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
  };
}

describe("acquisition learning previous coverage feedback", () => {
  it("feeds the previous production run into regression lessons and governed re-evaluation", () => {
    const database = new DatabaseSync(":memory:");
    const loop = new SqliteAcquisitionLearningLoopRepository(database);

    const first = loop.recordLearningRun(
      evidence({
        runId: "run_001",
        finishedAt: "2026-08-22T00:01:00.000Z",
        coverage: 1,
      }),
    );
    expect(first.evidence.coverage.previousRatio).toBeNull();

    const rawSecond = evidence({
      runId: "run_002",
      finishedAt: "2026-08-23T00:01:00.000Z",
      coverage: 0.8,
    });
    const second = loop.recordLearningRun(rawSecond);

    expect(second.evidence.coverage.previousRatio).toBe(1);
    expect(second.evidence.evidenceRefs).toContain("previous-acquisition-run:run_001");
    expect(second.lessons.map((lesson) => lesson.lessonType)).toContain("COVERAGE_REGRESSION");
    expect(second.reevaluationRequest?.status).toBe("PENDING");
    expect(second.reevaluationRequest?.lessonTypes).toContain("COVERAGE_REGRESSION");
    expect(second.reevaluationRequest?.boundaries).toEqual({
      autoDispatchApplied: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    });

    const replay = loop.recordLearningRun(rawSecond);
    expect(replay.evidence).toEqual(second.evidence);
    expect(replay.reevaluationRequest?.id).toBe(second.reevaluationRequest?.id);
    database.close();
  });

  it("uses chronological Source history rather than insertion order", () => {
    const database = new DatabaseSync(":memory:");
    const loop = new SqliteAcquisitionLearningLoopRepository(database);

    loop.recordLearningRun(
      evidence({
        runId: "run_later",
        finishedAt: "2026-08-24T00:00:00.000Z",
        coverage: 0.7,
      }),
    );
    loop.recordLearningRun(
      evidence({
        runId: "run_earlier",
        finishedAt: "2026-08-22T00:00:00.000Z",
        coverage: 1,
      }),
    );
    const middle = loop.recordLearningRun(
      evidence({
        runId: "run_middle",
        finishedAt: "2026-08-23T00:00:00.000Z",
        coverage: 0.95,
      }),
    );

    expect(middle.evidence.coverage.previousRatio).toBe(1);
    expect(middle.evidence.evidenceRefs).toContain("previous-acquisition-run:run_earlier");
    expect(middle.evidence.evidenceRefs).not.toContain("previous-acquisition-run:run_later");
    database.close();
  });

  it("preserves an explicitly reported previous ratio and rejects contradictory replay", () => {
    const database = new DatabaseSync(":memory:");
    const loop = new SqliteAcquisitionLearningLoopRepository(database);

    loop.recordLearningRun(
      evidence({
        runId: "run_baseline",
        finishedAt: "2026-08-22T00:00:00.000Z",
        coverage: 1,
      }),
    );
    const explicit = loop.recordLearningRun(
      evidence({
        runId: "run_explicit",
        finishedAt: "2026-08-23T00:00:00.000Z",
        coverage: 0.9,
        previousRatio: 0.92,
      }),
    );
    expect(explicit.evidence.coverage.previousRatio).toBe(0.92);
    expect(explicit.evidence.evidenceRefs.some((ref) => ref.startsWith("previous-acquisition-run:"))).toBe(
      false,
    );

    expect(() =>
      loop.recordLearningRun(
        evidence({
          runId: "run_explicit",
          finishedAt: "2026-08-23T00:00:00.000Z",
          coverage: 0.9,
          previousRatio: 0.8,
        }),
      ),
    ).toThrow(RegistryConflictError);
    database.close();
  });
});
