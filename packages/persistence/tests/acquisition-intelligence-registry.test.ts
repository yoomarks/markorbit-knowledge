import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  ACQUISITION_SEED_PLAYBOOKS,
  selectAcquisitionPlaybook,
  type AcquisitionRunEvidence,
  type SourceFingerprint,
} from "@markorbit/contracts";
import { RegistryConflictError } from "../src/index";
import { SqliteAcquisitionIntelligenceRepository } from "../src/acquisition-intelligence-registry";

function fingerprint(observedAt: string): SourceFingerprint {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "SOURCE_FINGERPRINT",
    sourceId: "src_ip_manual",
    observedAt,
    architecture: "STATIC_HTML",
    discoverySurfaces: ["INDEX_PAGE", "TOC"],
    renderRequirement: "NONE",
    localeStructure: "SINGLE",
    supportsHttpValidators: true,
    attachmentKinds: ["HTML"],
    confidence: 0.95,
    evidenceRefs: ["run:probe"],
  };
}

function evidence(input: {
  runId: string;
  finishedAt: string;
  outcome?: AcquisitionRunEvidence["outcome"];
  coverage?: number;
  durationMs?: number;
}): AcquisitionRunEvidence {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_RUN_EVIDENCE",
    runId: input.runId,
    sourceId: "src_ip_manual",
    playbookId: "official-static-index-tree",
    playbookRevision: 1,
    startedAt: "2026-08-22T00:00:00.000Z",
    finishedAt: input.finishedAt,
    outcome: input.outcome ?? "SUCCESS",
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
      ratio: input.coverage ?? 1,
      previousRatio: 1,
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
      etagObserved: true,
      lastModifiedObserved: true,
      validator304Count: 10,
      digestChanges: 0,
    },
    performance: {
      durationMs: input.durationMs ?? 300_000,
      bytes: 10_000_000,
    },
    evidenceRefs: ["raw-artifact:577", "workflow:live"],
    boundaries: {
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
  };
}

describe("SqliteAcquisitionIntelligenceRepository", () => {
  it("persists fingerprint history and returns the latest source traits", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteAcquisitionIntelligenceRepository(database);
    const first = fingerprint("2026-08-21T00:00:00.000Z");
    const second = {
      ...fingerprint("2026-08-22T00:00:00.000Z"),
      confidence: 0.98,
    };

    expect(repository.saveFingerprint(first)).toEqual(first);
    expect(repository.saveFingerprint(second)).toEqual(second);
    expect(repository.latestFingerprintForSource(first.sourceId)).toEqual(second);
    expect(repository.saveFingerprint(second)).toEqual(second);
    database.close();
  });

  it("turns each persisted run into durable lessons and reusable playbook history", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteAcquisitionIntelligenceRepository(database);
    const first = evidence({
      runId: "run_001",
      finishedAt: "2026-08-22T00:05:00.000Z",
      durationMs: 300_000,
    });
    const firstResult = repository.recordLearningRun(first);

    expect(firstResult.lessons.map((lesson) => lesson.lessonType)).toEqual(
      expect.arrayContaining([
        "AUTHORITATIVE_ENUMERATOR",
        "RENDERING_UNNECESSARY",
        "HTTP_VALIDATORS_EFFECTIVE",
        "PLAYBOOK_SUCCESS",
      ]),
    );
    expect(firstResult.playbookHistory).toEqual({
      runs: 1,
      successRate: 1,
      averageCoverage: 1,
      averageDurationMs: 300_000,
    });

    const secondResult = repository.recordLearningRun(
      evidence({
        runId: "run_002",
        finishedAt: "2026-08-23T00:05:00.000Z",
        outcome: "DEGRADED",
        coverage: 0.8,
        durationMs: 500_000,
      }),
    );
    expect(secondResult.playbookHistory.runs).toBe(2);
    expect(secondResult.playbookHistory.successRate).toBe(0.5);
    expect(secondResult.playbookHistory.averageCoverage).toBeCloseTo(0.9);
    expect(secondResult.playbookHistory.averageDurationMs).toBe(400_000);
    expect(repository.listRunEvidenceForSource(first.sourceId).map((run) => run.runId)).toEqual([
      "run_002",
      "run_001",
    ]);
    database.close();
  });

  it("is idempotent for exact run replays and rejects conflicting evidence", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteAcquisitionIntelligenceRepository(database);
    const run = evidence({ runId: "run_replay", finishedAt: "2026-08-22T00:05:00.000Z" });

    const first = repository.recordLearningRun(run);
    const replay = repository.recordLearningRun(run);
    expect(replay.lessons).toEqual(first.lessons);
    expect(repository.playbookHistory(run.playbookId, run.playbookRevision).runs).toBe(1);

    expect(() =>
      repository.recordRunEvidence({
        ...run,
        outcome: "FAILED",
      }),
    ).toThrow(RegistryConflictError);
    database.close();
  });

  it("persists explainable selection while preserving collection-authority guardrails", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteAcquisitionIntelligenceRepository(database);
    const sourceFingerprint = fingerprint("2026-08-22T00:00:00.000Z");
    repository.saveFingerprint(sourceFingerprint);
    repository.recordLearningRun(
      evidence({ runId: "run_selection", finishedAt: "2026-08-22T00:05:00.000Z" }),
    );

    const playbook = ACQUISITION_SEED_PLAYBOOKS.find(
      (candidate) => candidate.id === "official-static-index-tree",
    )!;
    const selection = selectAcquisitionPlaybook({
      fingerprint: sourceFingerprint,
      playbooks: ACQUISITION_SEED_PLAYBOOKS,
      history: {
        [`${playbook.id}@${playbook.revision}`]: repository.playbookHistory(
          playbook.id,
          playbook.revision,
        ),
      },
    });
    const persisted = repository.recordStrategySelection(
      selection,
      "2026-08-22T00:06:00.000Z",
    );

    expect(persisted.selection.selectedPlaybookId).toBe("official-static-index-tree");
    expect(persisted.selection.boundaries.selectionGrantsCollectionAuthority).toBe(false);
    expect(repository.latestStrategySelectionForSource(sourceFingerprint.sourceId)).toEqual(
      persisted,
    );
    database.close();
  });
});
