import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { readWebAcquisitionCampaignProgress } from "./web-acquisition-campaign-progress";

const WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE source_definitions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, slug TEXT NOT NULL,
      name TEXT NOT NULL, source_type TEXT NOT NULL, document_json TEXT NOT NULL
    );
    CREATE TABLE collection_runs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_id TEXT NOT NULL,
      status TEXT NOT NULL, requested_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL, document_json TEXT NOT NULL
    );
    CREATE TABLE raw_artifacts (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, artifact_kind TEXT NOT NULL,
      canonical_uri TEXT
    );
    CREATE TABLE retrieval_documents (
      raw_artifact_id TEXT NOT NULL, source_id TEXT NOT NULL, target_path TEXT NOT NULL,
      is_current INTEGER NOT NULL
    );
    CREATE TABLE staging_documents (
      id TEXT PRIMARY KEY, raw_artifact_id TEXT NOT NULL, conversion_run_id TEXT NOT NULL
    );
    CREATE TABLE conversion_runs (
      id TEXT PRIMARY KEY, raw_artifact_id TEXT NOT NULL, status TEXT NOT NULL,
      document_json TEXT NOT NULL
    );
    CREATE TABLE execution_attempts (
      run_id TEXT NOT NULL, status TEXT NOT NULL, document_json TEXT NOT NULL
    );
    CREATE TABLE conversion_attempts (
      conversion_run_id TEXT NOT NULL, status TEXT NOT NULL, document_json TEXT NOT NULL
    );
  `);
  return db;
}

function campaignRunDocument(campaignId: string, role?: "INITIAL_COLLECTION" | "REFRESH_WATCH") {
  return JSON.stringify({
    planSnapshot: {
      extensions: {
        "x-markorbit-campaign-id": campaignId,
        ...(role ? { "x-markorbit-plan-role": role } : {}),
      },
      ...(role === "REFRESH_WATCH"
        ? {
            schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 86_400 },
            policy: { fetchAttachments: false },
          }
        : {}),
    },
  });
}

function sourceDocument(input: {
  campaignId: string;
  sourceKey: string;
  sourceClass: string;
  selected: number;
  discovered?: number;
  excluded?: number;
  duplicates?: number;
  errors?: number;
  discoveryMode?: string;
}) {
  return JSON.stringify({
    extensions: {
      "x-markorbit-campaign-id": input.campaignId,
      "x-markorbit-campaign-source-key": input.sourceKey,
      "x-markorbit-source-class": input.sourceClass,
      "x-markorbit-discovery-mode": input.discoveryMode ?? "SITEMAP",
      "x-markorbit-inventory-count": input.selected,
      ...(input.discovered === undefined
        ? {}
        : { "x-markorbit-discovered-count": input.discovered }),
      ...(input.excluded === undefined ? {} : { "x-markorbit-excluded-count": input.excluded }),
      ...(input.duplicates === undefined
        ? {}
        : { "x-markorbit-duplicate-count": input.duplicates }),
      ...(input.errors === undefined ? {} : { "x-markorbit-inventory-error-count": input.errors }),
    },
  });
}

describe("web acquisition campaign progress", () => {
  it("projects durable campaign domain, inventory, artifact, retrieval, failure and throughput facts", () => {
    const db = database();
    try {
      db.prepare("INSERT INTO source_definitions VALUES (?, ?, ?, ?, ?, ?)").run(
        "src_official",
        WORKSPACE,
        "campaign-wave-one-official",
        "Official",
        "WEB",
        sourceDocument({
          campaignId: "wave-one",
          sourceKey: "official",
          sourceClass: "OFFICIAL_AUTHORITY",
          selected: 2,
          discovered: 4,
          excluded: 1,
          duplicates: 1,
          errors: 0,
        }),
      );
      db.prepare("INSERT INTO source_definitions VALUES (?, ?, ?, ?, ?, ?)").run(
        "src_peer",
        WORKSPACE,
        "campaign-wave-one-peer",
        "Peer",
        "WEB",
        sourceDocument({
          campaignId: "wave-one",
          sourceKey: "peer",
          sourceClass: "PEER_PROFESSIONAL",
          selected: 1,
          discovered: 1,
          excluded: 0,
          duplicates: 0,
          errors: 1,
        }),
      );
      const insertRun = db.prepare("INSERT INTO collection_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      insertRun.run(
        "run_official",
        WORKSPACE,
        "src_official",
        "COMPLETED",
        "2026-09-09T10:00:00.000Z",
        "2026-09-09T10:02:00.000Z",
        "2026-09-09T10:00:00.000Z",
        campaignRunDocument("wave-one"),
      );
      insertRun.run(
        "run_peer",
        WORKSPACE,
        "src_peer",
        "FAILED",
        "2026-09-09T10:00:00.000Z",
        "2026-09-09T10:01:00.000Z",
        "2026-09-09T10:00:00.000Z",
        campaignRunDocument("wave-one"),
      );
      insertRun.run(
        "run_unrelated_newer",
        WORKSPACE,
        "src_official",
        "FAILED",
        "2026-09-09T10:04:00.000Z",
        "2026-09-09T10:05:00.000Z",
        "2026-09-09T10:04:00.000Z",
        campaignRunDocument("different-wave"),
      );
      const insertArtifact = db.prepare("INSERT INTO raw_artifacts VALUES (?, ?, ?, ?)");
      insertArtifact.run("art_one", "run_official", "MARKDOWN", "https://official.example/one");
      insertArtifact.run("art_two", "run_official", "MARKDOWN", "https://official.example/two");
      const profileName = "Bulk Web wave-one Markdown Auto — official";
      const campaignConversion = JSON.stringify({
        conversionProfileSnapshot: { name: profileName },
      });
      const backgroundConversion = JSON.stringify({
        conversionProfileSnapshot: { name: "Background Markdown" },
      });
      db.prepare("INSERT INTO retrieval_documents VALUES (?, ?, ?, 1)").run(
        "art_one",
        "src_official",
        "sources/web/wave-one/official/art_one.md",
      );
      db.prepare("INSERT INTO retrieval_documents VALUES (?, ?, ?, 1)").run(
        "art_two",
        "src_official",
        "sources/web/wave-one/official/art_two.md",
      );
      db.prepare("INSERT INTO retrieval_documents VALUES (?, ?, ?, 1)").run(
        "art_other",
        "src_official",
        "sources/other/art_other.md",
      );
      db.prepare("INSERT INTO conversion_runs VALUES (?, ?, ?, ?)").run(
        "cvr_one",
        "art_one",
        "COMPLETED",
        campaignConversion,
      );
      db.prepare("INSERT INTO conversion_runs VALUES (?, ?, ?, ?)").run(
        "cvr_two",
        "art_two",
        "COMPLETED",
        campaignConversion,
      );
      db.prepare("INSERT INTO conversion_runs VALUES (?, ?, ?, ?)").run(
        "cvr_background",
        "art_one",
        "FAILED",
        backgroundConversion,
      );
      db.prepare("INSERT INTO staging_documents VALUES (?, ?, ?)").run(
        "stg_one",
        "art_one",
        "cvr_one",
      );
      db.prepare("INSERT INTO staging_documents VALUES (?, ?, ?)").run(
        "stg_two",
        "art_two",
        "cvr_two",
      );
      db.prepare("INSERT INTO staging_documents VALUES (?, ?, ?)").run(
        "stg_background",
        "art_one",
        "cvr_background",
      );
      db.prepare("INSERT INTO execution_attempts VALUES (?, ?, ?)").run(
        "run_peer",
        "FAILED",
        JSON.stringify({ failure: { code: "SOURCE_BLOCKED" } }),
      );

      const progress = readWebAcquisitionCampaignProgress(db, {
        workspaceId: WORKSPACE,
        campaignId: "wave-one",
        observedAt: "2026-09-09T10:03:00.000Z",
      });

      expect(progress.domains).toMatchObject({
        total: 2,
        completed: 1,
        failed: 1,
        blocked: 1,
        withFetchedPages: 1,
      });
      expect(progress.urls).toMatchObject({
        selected: 3,
        discovered: 5,
        discoveredKnown: 5,
        fetched: 2,
        excluded: 1,
        duplicateDiscovery: 1,
        unmaterialized: 1,
        changed: null,
        unchanged: null,
        detailedInventorySources: 2,
      });
      expect(progress.rawArtifactsCreated).toBe(2);
      expect(progress.normalizedDocumentsCreated).toBe(2);
      expect(progress.currentRetrievalDocuments).toBe(2);
      expect(progress.sources.find((source) => source.sourceKey === "official")?.runId).toBe(
        "run_official",
      );
      expect(progress.conversionRuns).toEqual({ COMPLETED: 2 });
      expect(progress.collectionFailureCodes).toEqual({ SOURCE_BLOCKED: 1 });
      expect(progress.sourceClasses.OFFICIAL_AUTHORITY).toMatchObject({
        domains: 1,
        fetchedUrls: 2,
        currentRetrievalDocuments: 2,
      });
      expect(progress.throughput.effectiveFetchedPagesPerMinute).toBe(1);
      expect(progress.throughput.estimatedMinutesRemaining).toBeNull();
      expect(progress.urls.failed).toBeNull();
      expect(progress.throughput.finiteInventoryEstimate).toBe(true);
      expect(progress.refreshAccounting.failedUrlAccountingAvailable).toBe(false);
      expect(progress.refreshAccounting.changedUnchangedAvailable).toBe(false);
    } finally {
      db.close();
    }
  });

  it("keeps initial collection progress stable while exposing latest structured refresh accounting", () => {
    const db = database();
    try {
      db.prepare("INSERT INTO source_definitions VALUES (?, ?, ?, ?, ?, ?)").run(
        "src_refresh",
        WORKSPACE,
        "campaign-refresh-wave-official",
        "Refresh Official",
        "WEB",
        sourceDocument({
          campaignId: "refresh-wave",
          sourceKey: "official",
          sourceClass: "OFFICIAL_AUTHORITY",
          selected: 2,
          discovered: 2,
          excluded: 0,
          duplicates: 0,
          errors: 0,
        }),
      );
      const insertRun = db.prepare("INSERT INTO collection_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      insertRun.run(
        "run_initial",
        WORKSPACE,
        "src_refresh",
        "COMPLETED",
        "2026-09-09T10:00:00.000Z",
        "2026-09-09T10:02:00.000Z",
        "2026-09-09T10:00:00.000Z",
        campaignRunDocument("refresh-wave", "INITIAL_COLLECTION"),
      );
      insertRun.run(
        "run_refresh",
        WORKSPACE,
        "src_refresh",
        "COMPLETED",
        "2026-09-10T10:00:00.000Z",
        "2026-09-10T10:01:00.000Z",
        "2026-09-10T10:00:00.000Z",
        campaignRunDocument("refresh-wave", "REFRESH_WATCH"),
      );
      const insertArtifact = db.prepare("INSERT INTO raw_artifacts VALUES (?, ?, ?, ?)");
      insertArtifact.run(
        "art_initial_one",
        "run_initial",
        "MARKDOWN",
        "https://official.example/one",
      );
      insertArtifact.run(
        "art_initial_two",
        "run_initial",
        "MARKDOWN",
        "https://official.example/two",
      );
      db.prepare("INSERT INTO execution_attempts VALUES (?, ?, ?)").run(
        "run_refresh",
        "COMPLETED",
        JSON.stringify({
          receipt: {
            itemsObserved: 2,
            metadataOnly: false,
            artifactReceiptIds: ["air_refresh_changed"],
          },
        }),
      );

      const progress = readWebAcquisitionCampaignProgress(db, {
        workspaceId: WORKSPACE,
        campaignId: "refresh-wave",
        observedAt: "2026-09-10T10:02:00.000Z",
      });

      expect(progress.sources[0]).toMatchObject({
        runId: "run_initial",
        runStatus: "COMPLETED",
        fetchedUrls: 2,
        changedUrls: 1,
        unchangedUrls: 1,
      });
      expect(progress.urls).toMatchObject({ fetched: 2, changed: 1, unchanged: 1 });
      expect(progress.refreshAccounting).toMatchObject({
        changedUnchangedAvailable: true,
        accountedSources: 1,
        totalSources: 1,
      });
    } finally {
      db.close();
    }
  });

  it("does not invent detailed discovery counts for sources created before summary persistence", () => {
    const db = database();
    try {
      db.prepare("INSERT INTO source_definitions VALUES (?, ?, ?, ?, ?, ?)").run(
        "src_legacy",
        WORKSPACE,
        "campaign-legacy-wave-official",
        "Legacy Official",
        "WEB",
        sourceDocument({
          campaignId: "legacy-wave",
          sourceKey: "official",
          sourceClass: "OFFICIAL_AUTHORITY",
          selected: 7,
        }),
      );
      db.prepare("INSERT INTO retrieval_documents VALUES (?, ?, ?, 1)").run(
        "art_existing",
        "src_legacy",
        "sources/web/legacy-wave/official/art_existing.md",
      );
      const progress = readWebAcquisitionCampaignProgress(db, {
        workspaceId: WORKSPACE,
        campaignId: "legacy-wave",
        observedAt: "2026-09-09T10:03:00.000Z",
      });
      expect(progress.urls).toMatchObject({
        selected: 7,
        discovered: null,
        discoveredKnown: 0,
        excluded: null,
        duplicateDiscovery: null,
        detailedInventorySources: 0,
        totalSources: 1,
      });
      expect(progress.domains.notDispatched).toBe(1);
      expect(progress.currentRetrievalDocuments).toBe(1);
      expect(progress.throughput.finiteInventoryEstimate).toBe(true);
    } finally {
      db.close();
    }
  });
});
