import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  observeWebAcquisitionCampaign,
  type CampaignResult,
} from "../src/verify-web-acquisition-campaign";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE collection_runs (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE raw_artifacts (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL, run_id TEXT NOT NULL,
      artifact_kind TEXT NOT NULL, canonical_uri TEXT
    );
    CREATE TABLE retrieval_documents (
      source_id TEXT NOT NULL, raw_artifact_id TEXT NOT NULL, is_current INTEGER NOT NULL
    );
    CREATE TABLE conversion_runs (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL, status TEXT NOT NULL,
      conversion_profile_id TEXT NOT NULL, raw_artifact_id TEXT NOT NULL
    );
    CREATE TABLE conversion_attempts (
      conversion_run_id TEXT NOT NULL, document_json TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE execution_attempts (
      run_id TEXT NOT NULL, document_json TEXT NOT NULL, status TEXT NOT NULL
    );
  `);
  return db;
}
function campaign(): CampaignResult {
  return {
    campaignId: "scope-fixture",
    workspaceId: "wsp_scope_fixture",
    sources: [
      {
        sourceKey: "source-one",
        sourceId: "src-1",
        runId: "run-current",
        conversionProfileId: "profile-current",
      },
    ],
  };
}

function insertRaw(db: DatabaseSync, id: string, runId: string, canonicalUri: string): void {
  db.prepare("INSERT INTO raw_artifacts VALUES (?, 'src-1', ?, 'MARKDOWN', ?)").run(
    id,
    runId,
    canonicalUri,
  );
}

describe("Bulk Web campaign verification", () => {
  it("scopes acquisition and conversion evidence to the dispatched campaign run", () => {
    const db = database();
    db.prepare("INSERT INTO collection_runs VALUES ('run-current', 'src-1', 'COMPLETED')").run();
    db.prepare("INSERT INTO collection_runs VALUES ('run-old', 'src-1', 'FAILED')").run();
    db.prepare("INSERT INTO execution_attempts VALUES ('run-current', ?, 'FAILED')").run(
      JSON.stringify({ failure: { code: "CURRENT_COLLECTION_FAIL" } }),
    );
    db.prepare("INSERT INTO execution_attempts VALUES ('run-old', ?, 'FAILED')").run(
      JSON.stringify({ failure: { code: "HIST_COLLECTION_FAIL" } }),
    );
    insertRaw(db, "raw-current-1", "run-current", "https://example.com/current-1");
    insertRaw(db, "raw-current-2", "run-current", "https://example.com/current-2");
    for (let index = 0; index < 5; index += 1) {
      insertRaw(db, `raw-old-${index}`, "run-old", `https://example.com/old-${index}`);
    }
    db.prepare("INSERT INTO retrieval_documents VALUES ('src-1', 'raw-current-1', 1)").run();
    for (let index = 0; index < 5; index += 1) {
      db.prepare("INSERT INTO retrieval_documents VALUES ('src-1', ?, 1)").run(`raw-old-${index}`);
    }
    db.prepare(
      "INSERT INTO conversion_runs VALUES ('conv-current', 'src-1', 'FAILED', 'profile-current', 'raw-current-2')",
    ).run();
    db.prepare("INSERT INTO conversion_attempts VALUES ('conv-current', ?, 'FAILED')").run(
      JSON.stringify({ failure: { code: "CURRENT_FAIL" } }),
    );
    for (let index = 0; index < 3; index += 1) {
      db.prepare(
        "INSERT INTO conversion_runs VALUES (?, 'src-1', 'FAILED', 'profile-current', ?)",
      ).run(`conv-old-${index}`, `raw-old-${index}`);
      db.prepare("INSERT INTO conversion_attempts VALUES (?, ?, 'FAILED')").run(
        `conv-old-${index}`,
        JSON.stringify({ failure: { code: "HIST_FAIL" } }),
      );
    }
    db.prepare(
      "INSERT INTO conversion_runs VALUES ('bg-current', 'src-1', 'COMPLETED', 'profile-background', 'raw-current-1')",
    ).run();
    for (let index = 1; index < 5; index += 1) {
      db.prepare(
        "INSERT INTO conversion_runs VALUES (?, 'src-1', 'FAILED', 'profile-background', ?)",
      ).run(`bg-old-${index}`, `raw-old-${index}`);
    }

    const observed = observeWebAcquisitionCampaign(db, campaign());
    db.close();

    expect(observed.markdownPages).toBe(2);
    expect(observed.rawMarkdownArtifacts).toBe(2);
    expect(observed.currentRetrievalDocuments).toBe(1);
    expect(observed.conversionRuns).toEqual({ FAILED: 1 });
    expect(observed.conversionFailureCodes).toEqual({ CURRENT_FAIL: 1 });
    expect(observed.collectionFailureCodes).toEqual({ CURRENT_COLLECTION_FAIL: 1 });
    expect(observed.backgroundConversionRuns).toEqual({ COMPLETED: 1 });
    expect(observed.sources[0]).toMatchObject({
      markdownPages: 2,
      rawMarkdownArtifacts: 2,
      retrievalDocuments: 1,
      conversionRuns: { FAILED: 1 },
      conversionFailureCodes: { CURRENT_FAIL: 1 },
      collectionFailureCodes: { CURRENT_COLLECTION_FAIL: 1 },
      backgroundConversionRuns: { COMPLETED: 1 },
    });
  });
});
