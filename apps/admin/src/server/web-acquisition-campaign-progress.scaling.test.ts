import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import { readWebAcquisitionCampaignProgress } from "./web-acquisition-campaign-progress";

const WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CAMPAIGN = "scale-bench";

function databaseFor(sourceCount: number) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE source_definitions (id TEXT PRIMARY KEY, workspace_id TEXT, slug TEXT, name TEXT, source_type TEXT, document_json TEXT);
    CREATE TABLE collection_runs (id TEXT PRIMARY KEY, workspace_id TEXT, source_id TEXT, status TEXT, requested_at TEXT, updated_at TEXT, created_at TEXT, document_json TEXT);
    CREATE TABLE raw_artifacts (id TEXT PRIMARY KEY, run_id TEXT, artifact_kind TEXT, canonical_uri TEXT);
    CREATE TABLE retrieval_documents (raw_artifact_id TEXT, source_id TEXT, target_path TEXT, is_current INTEGER);
    CREATE TABLE staging_documents (id TEXT PRIMARY KEY, raw_artifact_id TEXT, conversion_run_id TEXT);
    CREATE TABLE conversion_runs (id TEXT PRIMARY KEY, raw_artifact_id TEXT, status TEXT, document_json TEXT);
    CREATE TABLE execution_attempts (run_id TEXT, status TEXT, document_json TEXT);
    CREATE TABLE conversion_attempts (conversion_run_id TEXT, status TEXT, document_json TEXT);
  `);
  return { db, sourceCount };
}
function populate(db: DatabaseSync, sourceCount: number) {
  const sourceStmt = db.prepare("INSERT INTO source_definitions VALUES (?, ?, ?, ?, 'WEB', ?)");
  const runStmt = db.prepare(
    "INSERT INTO collection_runs VALUES (?, ?, ?, 'COMPLETED', ?, ?, ?, ?)",
  );
  const artifactStmt = db.prepare("INSERT INTO raw_artifacts VALUES (?, ?, 'MARKDOWN', ?)");
  const retrievalStmt = db.prepare("INSERT INTO retrieval_documents VALUES (?, ?, ?, 1)");
  const conversionStmt = db.prepare("INSERT INTO conversion_runs VALUES (?, ?, 'COMPLETED', ?)");
  const stagingStmt = db.prepare("INSERT INTO staging_documents VALUES (?, ?, ?)");
  const attemptStmt = db.prepare("INSERT INTO execution_attempts VALUES (?, 'COMPLETED', ?)");
  const now = "2026-09-10T00:00:00.000Z";
  for (let index = 0; index < sourceCount; index += 1) {
    const key = `source-${index}`;
    const sourceId = `src_${index}`;
    const runId = `run_${index}`;
    const refreshRunId = `refresh_${index}`;
    const artifactId = `art_${index}`;
    const conversionId = `cvr_${index}`;
    const sourceJson = JSON.stringify({
      extensions: {
        "x-markorbit-campaign-id": CAMPAIGN,
        "x-markorbit-campaign-source-key": key,
        "x-markorbit-source-class": "PEER_PROFESSIONAL",
        "x-markorbit-discovery-mode": "SITEMAP",
        "x-markorbit-inventory-count": 1,
        "x-markorbit-discovered-count": 1,
        "x-markorbit-excluded-count": 0,
        "x-markorbit-duplicate-count": 0,
        "x-markorbit-inventory-error-count": 0,
      },
    });
    const runJson = JSON.stringify({
      planSnapshot: {
        extensions: {
          "x-markorbit-campaign-id": CAMPAIGN,
          "x-markorbit-plan-role": "INITIAL_COLLECTION",
        },
      },
    });
    const refreshRunJson = JSON.stringify({
      planSnapshot: {
        extensions: {
          "x-markorbit-campaign-id": CAMPAIGN,
          "x-markorbit-plan-role": "REFRESH_WATCH",
        },
        schedule: { mode: "CHANGE_WATCH" },
        policy: { fetchAttachments: false },
      },
    });
    sourceStmt.run(sourceId, WORKSPACE, `campaign-${CAMPAIGN}-${key}`, key, sourceJson);
    runStmt.run(runId, WORKSPACE, sourceId, now, now, now, runJson);
    runStmt.run(refreshRunId, WORKSPACE, sourceId, now, now, now, refreshRunJson);
    artifactStmt.run(artifactId, runId, `https://example${index}.com/page`);
    const profileName = `Bulk Web ${CAMPAIGN} Markdown Auto — ${key}`;
    conversionStmt.run(
      conversionId,
      artifactId,
      JSON.stringify({
        conversionProfileSnapshot: { name: profileName },
      }),
    );
    stagingStmt.run(`std_${index}`, artifactId, conversionId);
    retrievalStmt.run(artifactId, sourceId, `sources/web/${CAMPAIGN}/${key}/${artifactId}.md`);
    attemptStmt.run(
      refreshRunId,
      JSON.stringify({ receipt: { itemsObserved: 1, metadataOnly: true } }),
    );
  }
}

test("campaign progress batching stays constant at 100 sources", () => {
  const { db, sourceCount } = databaseFor(100);
  populate(db, sourceCount);
  let prepares = 0;
  const wrapped = new Proxy(db, {
    get(target, property, receiver) {
      if (property === "prepare") {
        return (sql: string) => {
          prepares += 1;
          return target.prepare(sql);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const result = readWebAcquisitionCampaignProgress(wrapped as DatabaseSync, {
    workspaceId: WORKSPACE,
    campaignId: CAMPAIGN,
    observedAt: "2026-09-10T00:01:00.000Z",
  });
  expect(result.sources).toHaveLength(sourceCount);
  expect(result.currentRetrievalDocuments).toBe(sourceCount);
  expect(result.urls.changed).toBe(0);
  expect(result.urls.unchanged).toBe(sourceCount);
  expect(result.refreshAccounting).toMatchObject({
    changedUnchangedAvailable: true,
    accountedSources: sourceCount,
  });
  expect(prepares).toBe(10);
  db.close();
});
