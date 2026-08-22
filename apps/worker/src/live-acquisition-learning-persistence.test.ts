import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { persistLiveAcquisitionProfileEvidence } from "./live-acquisition-learning-persistence";
import { buildLiveAcquisitionProfileEvidence } from "./live-acquisition-profile-evidence";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("persistLiveAcquisitionProfileEvidence", () => {
  it("records fingerprint, run evidence and lessons idempotently in an isolated registry", () => {
    const directory = mkdtempSync(join(tmpdir(), "markorbit-acquisition-learning-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "learning.sqlite");
    const learning = buildLiveAcquisitionProfileEvidence({
      profileId: "jurisdiction-index-html-v1",
      runId: "canary_country_index_test_1",
      sourceId: "country-index-public-test",
      startedAt: "2026-08-23T00:00:00.000Z",
      finishedAt: "2026-08-23T00:00:01.000Z",
      discovered: 12,
      attempted: 12,
      fetched: 12,
      accepted: 12,
      knownCorpus: 12,
      bytes: 4096,
      httpStatusCounts: { "200": 12 },
      changeDetection: {
        etagObserved: null,
        lastModifiedObserved: null,
        validator304Count: 0,
        digestChanges: 0,
      },
      evidenceRefs: ["country-index:test-fixture"],
    });

    const first = persistLiveAcquisitionProfileEvidence(learning, databasePath);
    const replay = persistLiveAcquisitionProfileEvidence(learning, databasePath);

    expect(first).not.toBeNull();
    expect(replay).toEqual(first);
    expect(first?.lessonTypes).toContain("AUTHORITATIVE_ENUMERATOR");
    expect(first?.lessonTypes).toContain("PLAYBOOK_SUCCESS");
    expect(first?.playbookRuns).toBe(1);
    expect(first?.playbookSuccessRate).toBe(1);
    expect(first?.playbookAverageCoverage).toBe(1);

    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const fingerprintCount = database
        .prepare(
          "SELECT COUNT(*) AS count FROM acquisition_source_fingerprints WHERE source_id = ?",
        )
        .get(learning.evidence.sourceId) as { count: number };
      const evidenceCount = database
        .prepare("SELECT COUNT(*) AS count FROM acquisition_run_evidence WHERE run_id = ?")
        .get(learning.evidence.runId) as { count: number };
      const lessonCount = database
        .prepare("SELECT COUNT(*) AS count FROM acquisition_run_lessons WHERE run_id = ?")
        .get(learning.evidence.runId) as { count: number };

      expect(fingerprintCount.count).toBe(1);
      expect(evidenceCount.count).toBe(1);
      expect(lessonCount.count).toBeGreaterThanOrEqual(2);
    } finally {
      database.close();
    }
  });

  it("stays observation-only when no registry path is configured", () => {
    const learning = buildLiveAcquisitionProfileEvidence({
      profileId: "toc-graph-html-v1",
      runId: "canary_wipo_test_no_registry",
      sourceId: "wipo-public-test",
      startedAt: "2026-08-23T00:00:00.000Z",
      finishedAt: "2026-08-23T00:00:01.000Z",
      discovered: 1,
      attempted: 1,
      fetched: 1,
      accepted: 1,
      knownCorpus: 1,
      bytes: 1024,
      evidenceRefs: ["wipo:test-fixture"],
    });

    expect(persistLiveAcquisitionProfileEvidence(learning, "")).toBeNull();
  });
});
