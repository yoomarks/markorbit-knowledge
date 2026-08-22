import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  type AcquisitionRunEvidence,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "../src/index";
import { SqliteAcquisitionLearningLoopRepository } from "../src/acquisition-learning-loop";
import { SqliteAcquisitionStrategyGovernanceRepository } from "../src/acquisition-strategy-governance";

function evidence(input: {
  runId: string;
  finishedAt: string;
  renderingRequired?: boolean;
  regression?: boolean;
}): AcquisitionRunEvidence {
  const regression = input.regression ?? false;
  const renderingRequired = input.renderingRequired ?? false;
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_RUN_EVIDENCE",
    runId: input.runId,
    sourceId: "src_structural_manual",
    playbookId: "official-static-index-tree",
    playbookRevision: 1,
    startedAt: "2026-08-22T00:00:00.000Z",
    finishedAt: input.finishedAt,
    outcome: regression ? "DEGRADED" : "SUCCESS",
    counts: {
      discovered: 100,
      attempted: 100,
      fetched: regression ? 82 : 100,
      accepted: regression ? 80 : 100,
      duplicates: regression ? 2 : 0,
      retries: regression ? 3 : 0,
    },
    coverage: {
      knownCorpus: 100,
      ratio: regression ? 0.8 : 1,
      previousRatio: 1,
    },
    httpStatusCounts: regression ? { "200": 82, "429": 3 } : { "200": 100 },
    failureSignatures: regression ? [{ code: "HTTP_429", count: 3 }] : [],
    surfaceOutcomes: [
      {
        surface: regression ? "SITEMAP" : "INDEX_PAGE",
        discovered: regression ? 80 : 100,
        accepted: regression ? 80 : 100,
        knownCorpus: 100,
      },
    ],
    rendering: {
      used: renderingRequired,
      comparativeProbe: renderingRequired
        ? { staticAccepted: 60, renderedAccepted: 100 }
        : { staticAccepted: 100, renderedAccepted: 100 },
    },
    changeDetection: {
      etagObserved: true,
      lastModifiedObserved: true,
      validator304Count: 5,
      digestChanges: 0,
    },
    performance: {
      durationMs: 120_000,
      bytes: 5_000_000,
    },
    evidenceRefs: [`run:${input.runId}`],
    boundaries: {
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
  };
}

describe("acquisition strategy governance", () => {
  it("does not invent a candidate when a successful run only confirms existing primitives", () => {
    const database = new DatabaseSync(":memory:");
    const loop = new SqliteAcquisitionLearningLoopRepository(database);

    const learned = loop.recordLearningRun(
      evidence({ runId: "run_success", finishedAt: "2026-08-22T00:02:00.000Z" }),
    );

    expect(learned.strategyCandidate).toBeNull();
    expect(learned.reevaluationRequest).toBeNull();
    database.close();
  });

  it("accumulates independent evidence without silently promoting the candidate", () => {
    const database = new DatabaseSync(":memory:");
    const loop = new SqliteAcquisitionLearningLoopRepository(database);

    const first = loop.recordLearningRun(
      evidence({
        runId: "run_render_1",
        finishedAt: "2026-08-22T00:02:00.000Z",
        renderingRequired: true,
      }),
    );
    const second = loop.recordLearningRun(
      evidence({
        runId: "run_render_2",
        finishedAt: "2026-08-23T00:02:00.000Z",
        renderingRequired: true,
      }),
    );

    expect(first.strategyCandidate?.candidate.stage).toBe("OBSERVED");
    expect(first.strategyCandidate?.evidenceCount).toBe(1);
    expect(second.strategyCandidate?.candidate.id).toBe(first.strategyCandidate?.candidate.id);
    expect(second.strategyCandidate?.candidate.stage).toBe("OBSERVED");
    expect(second.strategyCandidate?.evidenceCount).toBe(2);
    expect(second.strategyCandidate!.candidate.confidence).toBeGreaterThan(
      first.strategyCandidate!.candidate.confidence,
    );
    expect(second.strategyCandidate?.candidate.rationale.join(" ")).toContain("JS_RENDERED_FETCH");
    expect(second.strategyCandidate?.candidate.boundaries.autoActivated).toBe(false);
    database.close();
  });

  it("requires sequential governed transitions and explicit human activation", () => {
    const database = new DatabaseSync(":memory:");
    const loop = new SqliteAcquisitionLearningLoopRepository(database);
    const governance = new SqliteAcquisitionStrategyGovernanceRepository(database);
    const learned = loop.recordLearningRun(
      evidence({
        runId: "run_transition",
        finishedAt: "2026-08-22T00:02:00.000Z",
        renderingRequired: true,
      }),
    );
    const candidateId = learned.strategyCandidate!.candidate.id;

    expect(() =>
      governance.transitionCandidate({
        candidateId,
        toStage: "VALIDATED",
        actor: { actorType: "SYSTEM", actorId: "test" },
        rationale: "skip stage",
        evidenceRefs: ["test:validation"],
      }),
    ).toThrow(RegistryConflictError);

    governance.transitionCandidate({
      candidateId,
      toStage: "CANDIDATE",
      actor: { actorType: "SYSTEM", actorId: "candidate-review" },
      rationale: "Promote observation to a reviewable candidate.",
    });
    expect(() =>
      governance.transitionCandidate({
        candidateId,
        toStage: "VALIDATED",
        actor: { actorType: "SYSTEM", actorId: "validator" },
        rationale: "Validate without evidence.",
      }),
    ).toThrow(RegistryValidationError);
    governance.transitionCandidate({
      candidateId,
      toStage: "VALIDATED",
      actor: { actorType: "SYSTEM", actorId: "validator" },
      rationale: "Regression fixture passed.",
      evidenceRefs: ["test:regression-suite"],
    });
    governance.transitionCandidate({
      candidateId,
      toStage: "PROMOTED",
      actor: { actorType: "SYSTEM", actorId: "promotion-review" },
      rationale: "Canary acceptance passed.",
      evidenceRefs: ["test:canary"],
    });
    expect(() =>
      governance.transitionCandidate({
        candidateId,
        toStage: "ACTIVE",
        actor: { actorType: "SYSTEM", actorId: "automatic-activator" },
        rationale: "Automatic activation must be rejected.",
        evidenceRefs: ["test:canary"],
      }),
    ).toThrow(RegistryConflictError);
    governance.transitionCandidate({
      candidateId,
      toStage: "ACTIVE",
      actor: { actorType: "HUMAN", actorId: "reviewer@example.test" },
      rationale: "Explicit human approval after validation and canary evidence.",
      evidenceRefs: ["test:human-approval"],
    });

    expect(governance.getCandidate(candidateId)?.candidate.stage).toBe("ACTIVE");
    expect(governance.listTransitions(candidateId).map((transition) => transition.toStage)).toEqual([
      "CANDIDATE",
      "VALIDATED",
      "PROMOTED",
      "ACTIVE",
    ]);
    expect(
      governance.listTransitions(candidateId).every(
        (transition) =>
          transition.boundaries.autoPromotionApplied === false &&
          transition.boundaries.collectionAuthorityGranted === false,
      ),
    ).toBe(true);
    database.close();
  });

  it("turns coverage regression into a durable fallback re-evaluation without dispatch authority", () => {
    const database = new DatabaseSync(":memory:");
    const loop = new SqliteAcquisitionLearningLoopRepository(database);
    const governance = new SqliteAcquisitionStrategyGovernanceRepository(database);

    const learned = loop.recordLearningRun(
      evidence({
        runId: "run_regression",
        finishedAt: "2026-08-22T00:02:00.000Z",
        regression: true,
      }),
    );

    expect(learned.reevaluationRequest?.status).toBe("PENDING");
    expect(learned.reevaluationRequest?.lessonTypes).toEqual(
      expect.arrayContaining(["COVERAGE_REGRESSION", "INCOMPLETE_ENUMERATOR"]),
    );
    expect(learned.reevaluationRequest?.fallbackPlaybookIds).toContain("official-toc-graph");
    expect(learned.reevaluationRequest?.boundaries).toEqual({
      autoDispatchApplied: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    });
    expect(governance.listPendingReevaluations()).toHaveLength(1);
    database.close();
  });
});
