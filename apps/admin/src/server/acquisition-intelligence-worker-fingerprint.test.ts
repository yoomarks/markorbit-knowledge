import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  type AcquisitionRunEvidence,
  type SourceFingerprint,
} from "@markorbit/contracts";
import { SqliteAcquisitionIntelligenceRepository } from "@markorbit/persistence/acquisition-intelligence";
import { recordAcquisitionIntelligenceWorkerIntake } from "./acquisition-intelligence-worker-intake";

function evidence(): AcquisitionRunEvidence {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_RUN_EVIDENCE",
    runId: "run_profile_live",
    sourceId: "src_profile_live",
    playbookId: "official-static-index-tree",
    playbookRevision: 1,
    startedAt: "2026-08-22T00:00:05.000Z",
    finishedAt: "2026-08-22T00:00:09.000Z",
    outcome: "SUCCESS",
    counts: {
      discovered: 8,
      attempted: 8,
      fetched: 8,
      accepted: 8,
      duplicates: 0,
      retries: 0,
    },
    coverage: { knownCorpus: null, ratio: null, previousRatio: null },
    httpStatusCounts: { "200": 8 },
    failureSignatures: [],
    surfaceOutcomes: [{ surface: "INDEX_PAGE", discovered: 8, accepted: 8, knownCorpus: null }],
    rendering: { used: false },
    changeDetection: {
      etagObserved: false,
      lastModifiedObserved: false,
      validator304Count: 0,
      digestChanges: 0,
    },
    performance: { durationMs: 4_000, bytes: 10 },
    evidenceRefs: ["acquisition-learning-profile:static-index-html-v1"],
    boundaries: {
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
  };
}

function fingerprint(sourceId = "src_profile_live"): SourceFingerprint {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "SOURCE_FINGERPRINT",
    sourceId,
    observedAt: "2026-08-22T00:00:09.000Z",
    architecture: "STATIC_HTML",
    discoverySurfaces: ["INDEX_PAGE"],
    renderRequirement: "NONE",
    localeStructure: "SINGLE",
    supportsHttpValidators: true,
    attachmentKinds: ["HTML"],
    confidence: 0.9,
    evidenceRefs: ["profile:static-index-html-v1"],
  };
}

function dependencies(database: DatabaseSync) {
  return {
    database,
    workers: {
      verifyCredential() {
        return { workspaceId: "wsp_public" } as never;
      },
    },
    runs: {
      getById() {
        return {
          run: {
            id: "run_profile_live",
            workspaceId: "wsp_public",
            sourceId: "src_profile_live",
            status: "COMPLETED",
          },
          jobs: [],
        } as never;
      },
    },
    executions: {
      listForRun() {
        return [
          {
            attempt: {
              id: "exa_profile_live",
              workspaceId: "wsp_public",
              runId: "run_profile_live",
              workerId: "worker-profile",
              status: "COMPLETED",
              startedAt: "2026-08-22T00:00:00.000Z",
              completedAt: "2026-08-22T00:00:10.000Z",
              updatedAt: "2026-08-22T00:00:10.000Z",
              receipt: { bytesPrepared: 2048 },
            },
            events: [],
          },
        ] as never;
      },
    },
  };
}

describe("acquisition Worker fingerprint intake", () => {
  it("anchors fingerprint time and provenance to the terminal execution", () => {
    const database = new DatabaseSync(":memory:");
    const result = recordAcquisitionIntelligenceWorkerIntake(
      {
        workerId: "worker-profile",
        credential: "credential-profile",
        evidence: evidence(),
        fingerprint: fingerprint(),
      },
      dependencies(database),
    );

    expect(result.fingerprintRecorded).toBe(true);
    const stored = new SqliteAcquisitionIntelligenceRepository(database).latestFingerprintForSource(
      "src_profile_live",
    );
    expect(stored?.observedAt).toBe("2026-08-22T00:00:10.000Z");
    expect(stored?.evidenceRefs).toEqual(
      expect.arrayContaining([
        "execution-attempt:exa_profile_live",
        "worker:worker-profile",
        "profile:static-index-html-v1",
      ]),
    );
    database.close();
  });

  it("rejects a fingerprint for a different source", () => {
    const database = new DatabaseSync(":memory:");
    expect(() =>
      recordAcquisitionIntelligenceWorkerIntake(
        {
          workerId: "worker-profile",
          credential: "credential-profile",
          evidence: evidence(),
          fingerprint: fingerprint("src_wrong"),
        },
        dependencies(database),
      ),
    ).toThrow("SourceFingerprint sourceId must match");
    database.close();
  });
});
