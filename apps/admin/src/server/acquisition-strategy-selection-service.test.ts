import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  type AcquisitionRunEvidence,
  type SourceFingerprint,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteAcquisitionIntelligenceRepository } from "@markorbit/persistence/acquisition-intelligence";
import {
  ACQUISITION_STRATEGY_AUTO_SELECTION_VERSION,
  AcquisitionStrategySelectionService,
} from "./acquisition-strategy-selection-service";

function staticIndexFingerprint(sourceId: string): SourceFingerprint {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "SOURCE_FINGERPRINT",
    sourceId,
    observedAt: "2026-08-23T00:00:00.000Z",
    architecture: "STATIC_HTML",
    discoverySurfaces: ["INDEX_PAGE"],
    renderRequirement: "NONE",
    localeStructure: "SINGLE",
    supportsHttpValidators: false,
    attachmentKinds: ["HTML"],
    confidence: 0.94,
    evidenceRefs: [`probe:${sourceId}`],
  };
}

function successfulStaticRun(runId: string, sourceId: string, minute: number): AcquisitionRunEvidence {
  const startedAt = `2026-08-22T23:${String(minute).padStart(2, "0")}:00.000Z`;
  const finishedAt = `2026-08-22T23:${String(minute).padStart(2, "0")}:30.000Z`;
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_RUN_EVIDENCE",
    runId,
    sourceId,
    playbookId: "official-static-index-tree",
    playbookRevision: 1,
    startedAt,
    finishedAt,
    outcome: "SUCCESS",
    counts: {
      discovered: 100,
      attempted: 100,
      fetched: 100,
      accepted: 100,
      duplicates: 0,
      retries: 0,
    },
    coverage: {
      knownCorpus: 100,
      ratio: 1,
      previousRatio: null,
    },
    httpStatusCounts: { "200": 100 },
    failureSignatures: [],
    surfaceOutcomes: [
      {
        surface: "INDEX_PAGE",
        discovered: 100,
        accepted: 100,
        knownCorpus: 100,
      },
    ],
    rendering: { used: false },
    changeDetection: {
      etagObserved: false,
      lastModifiedObserved: false,
      validator304Count: 0,
      digestChanges: 0,
    },
    performance: {
      durationMs: 30_000,
      bytes: 1_000_000,
    },
    evidenceRefs: [`run:${runId}`],
    boundaries: {
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
  };
}

describe("AcquisitionStrategySelectionService", () => {
  it("transfers repeated playbook outcomes to a new structurally similar source", () => {
    const database = new DatabaseSync(":memory:");
    try {
      const repository = new SqliteAcquisitionIntelligenceRepository(database);
      for (let index = 0; index < 5; index += 1) {
        repository.recordLearningRun(
          successfulStaticRun(`run_history_${index}`, "source-established-static", index),
        );
      }
      const fingerprint = staticIndexFingerprint("source-new-structural-peer");
      repository.saveFingerprint(fingerprint);

      const service = new AcquisitionStrategySelectionService(database);
      const result = service.selectAndRecord({
        sourceId: fingerprint.sourceId,
        selectedAt: "2026-08-23T00:05:00.000Z",
      });

      expect(result.version).toBe(ACQUISITION_STRATEGY_AUTO_SELECTION_VERSION);
      expect(result.persisted.selection.selectedPlaybookId).toBe("official-static-index-tree");
      expect(result.persisted.selection.selectedRevision).toBe(1);
      expect(result.persisted.selection.boundaries).toEqual({
        selectionGrantsCollectionAuthority: false,
        autoPromotionApplied: false,
      });
      const selectedRank = result.persisted.selection.ranked.find(
        (item) => item.playbookId === "official-static-index-tree",
      );
      expect(selectedRank?.reasonCodes).toEqual(
        expect.arrayContaining(["HISTORICAL_OUTCOMES_APPLIED", "REPEATED_EVIDENCE_AVAILABLE"]),
      );
      expect(result.historiesApplied["official-static-index-tree@1"]).toMatchObject({
        runs: 5,
        successRate: 1,
        averageCoverage: 1,
      });
      expect(
        repository.latestStrategySelectionForSource(fingerprint.sourceId)?.selection
          .selectedPlaybookId,
      ).toBe("official-static-index-tree");
    } finally {
      database.close();
    }
  });

  it("selects by structure rather than source name", () => {
    const database = new DatabaseSync(":memory:");
    try {
      const repository = new SqliteAcquisitionIntelligenceRepository(database);
      const fingerprint: SourceFingerprint = {
        ...staticIndexFingerprint("source-arbitrary-unseen-name"),
        discoverySurfaces: ["COUNTRY_INDEX"],
        localeStructure: "JURISDICTION_GRAPH",
        confidence: 0.88,
      };
      repository.saveFingerprint(fingerprint);

      const result = new AcquisitionStrategySelectionService(database).selectAndRecord({
        sourceId: fingerprint.sourceId,
      });

      expect(result.persisted.selection.selectedPlaybookId).toBe("official-jurisdiction-index");
      expect(result.persisted.selection.rationale.join(" ")).toContain(
        "structural fingerprint compatibility",
      );
    } finally {
      database.close();
    }
  });

  it("refuses to guess a strategy before structural evidence exists", () => {
    const database = new DatabaseSync(":memory:");
    try {
      const service = new AcquisitionStrategySelectionService(database);
      expect(() => service.selectAndRecord({ sourceId: "source-without-fingerprint" })).toThrow(
        RegistryValidationError,
      );
    } finally {
      database.close();
    }
  });
});
