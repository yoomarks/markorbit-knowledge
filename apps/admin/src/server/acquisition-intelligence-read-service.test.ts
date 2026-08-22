import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  ACQUISITION_SEED_PLAYBOOKS,
  selectAcquisitionPlaybook,
  type AcquisitionRunEvidence,
  type SourceFingerprint,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteAcquisitionIntelligenceRepository } from "@markorbit/persistence/acquisition-intelligence";
import { SqliteAcquisitionLearningLoopRepository } from "@markorbit/persistence/acquisition-learning-loop";
import { AcquisitionIntelligenceReadService } from "./acquisition-intelligence-read-service";

const SOURCE_ID = "src_read_surface";

function fingerprint(): SourceFingerprint {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "SOURCE_FINGERPRINT",
    sourceId: SOURCE_ID,
    observedAt: "2026-08-23T00:00:00.000Z",
    architecture: "STATIC_HTML",
    discoverySurfaces: ["INDEX_PAGE"],
    renderRequirement: "NONE",
    localeStructure: "SINGLE",
    supportsHttpValidators: true,
    attachmentKinds: ["HTML"],
    confidence: 0.9,
    evidenceRefs: ["probe:read-surface"],
  };
}

function evidence(input: {
  runId: string;
  finishedAt: string;
  accepted: number;
  outcome: AcquisitionRunEvidence["outcome"];
  renderingProbe?: boolean;
}): AcquisitionRunEvidence {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_RUN_EVIDENCE",
    runId: input.runId,
    sourceId: SOURCE_ID,
    playbookId: "official-static-index-tree",
    playbookRevision: 1,
    startedAt: "2026-08-23T00:00:00.000Z",
    finishedAt: input.finishedAt,
    outcome: input.outcome,
    counts: {
      discovered: 100,
      attempted: 100,
      fetched: input.accepted,
      accepted: input.accepted,
      duplicates: 0,
      retries: input.outcome === "DEGRADED" ? 2 : 0,
    },
    coverage: {
      knownCorpus: 100,
      ratio: input.accepted / 100,
      previousRatio: null,
    },
    httpStatusCounts:
      input.outcome === "DEGRADED" ? { "200": input.accepted, "429": 2 } : { "200": 100 },
    failureSignatures: input.outcome === "DEGRADED" ? [{ code: "HTTP_429", count: 2 }] : [],
    surfaceOutcomes: [
      {
        surface: "INDEX_PAGE",
        discovered: input.accepted,
        accepted: input.accepted,
        knownCorpus: 100,
      },
    ],
    rendering: input.renderingProbe
      ? {
          used: true,
          comparativeProbe: { staticAccepted: 50, renderedAccepted: input.accepted },
        }
      : { used: false },
    changeDetection: {
      etagObserved: true,
      lastModifiedObserved: true,
      validator304Count: 1,
      digestChanges: 0,
    },
    performance: {
      durationMs: 60_000,
      bytes: input.accepted * 1024,
    },
    evidenceRefs: [`run:${input.runId}`],
    boundaries: {
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
  };
}

describe("AcquisitionIntelligenceReadService", () => {
  it("reconstructs source learning history, selection, candidates and re-evaluation", () => {
    const database = new DatabaseSync(":memory:");
    try {
      const intelligence = new SqliteAcquisitionIntelligenceRepository(database);
      const loop = new SqliteAcquisitionLearningLoopRepository(database);
      const sourceFingerprint = fingerprint();
      intelligence.saveFingerprint(sourceFingerprint);
      intelligence.recordStrategySelection(
        selectAcquisitionPlaybook({
          fingerprint: sourceFingerprint,
          playbooks: ACQUISITION_SEED_PLAYBOOKS,
        }),
        "2026-08-23T00:00:01.000Z",
      );

      loop.recordLearningRun(
        evidence({
          runId: "run_read_1",
          finishedAt: "2026-08-23T00:01:00.000Z",
          accepted: 100,
          outcome: "SUCCESS",
        }),
      );
      loop.recordLearningRun(
        evidence({
          runId: "run_read_2",
          finishedAt: "2026-08-23T00:02:00.000Z",
          accepted: 80,
          outcome: "DEGRADED",
          renderingProbe: true,
        }),
      );

      const service = new AcquisitionIntelligenceReadService(database);
      const source = service.source({ sourceId: SOURCE_ID });

      expect(source.fingerprint?.sourceId).toBe(SOURCE_ID);
      expect(source.runs.map((item) => item.runId)).toEqual(["run_read_2", "run_read_1"]);
      expect(source.runs[0]?.coverage.previousRatio).toBe(1);
      expect(source.lessons.map((item) => item.lessonType)).toEqual(
        expect.arrayContaining([
          "COVERAGE_REGRESSION",
          "INCOMPLETE_ENUMERATOR",
          "FAILURE_SIGNATURE",
        ]),
      );
      expect(source.latestSelection?.selection.selectedPlaybookId).toBe(
        "official-static-index-tree",
      );
      expect(source.strategyCandidates).toHaveLength(1);
      expect(source.strategyCandidates[0]?.candidate.rationale.join(" ")).toContain(
        "JS_RENDERED_FETCH",
      );
      expect(source.pendingReevaluations).toHaveLength(1);
      expect(source.pendingReevaluations[0]?.runId).toBe("run_read_2");

      const run = service.run("run_read_2");
      expect(run.evidence?.coverage.previousRatio).toBe(1);
      expect(run.lessons.map((item) => item.lessonType)).toContain("COVERAGE_REGRESSION");
      expect(run.pendingReevaluation?.status).toBe("PENDING");
    } finally {
      database.close();
    }
  });

  it("returns an empty read model for an unseen source or run", () => {
    const database = new DatabaseSync(":memory:");
    try {
      const service = new AcquisitionIntelligenceReadService(database);
      expect(service.source({ sourceId: "src_unseen" })).toMatchObject({
        sourceId: "src_unseen",
        fingerprint: null,
        runs: [],
        lessons: [],
        latestSelection: null,
        strategyCandidates: [],
        pendingReevaluations: [],
      });
      expect(service.run("run_unseen")).toMatchObject({
        runId: "run_unseen",
        evidence: null,
        lessons: [],
        pendingReevaluation: null,
      });
    } finally {
      database.close();
    }
  });

  it("rejects invalid read limits before querying SQLite", () => {
    const database = new DatabaseSync(":memory:");
    try {
      const service = new AcquisitionIntelligenceReadService(database);
      expect(() => service.source({ sourceId: SOURCE_ID, runsLimit: Number.NaN })).toThrow(
        RegistryValidationError,
      );
      expect(() => service.source({ sourceId: SOURCE_ID, lessonsLimit: 501 })).toThrow(
        RegistryValidationError,
      );
    } finally {
      database.close();
    }
  });
});
