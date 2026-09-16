import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

function rowsArgument(argv) {
  const index = argv.indexOf("--rows");
  const value = index >= 0 ? Number(argv[index + 1]) : 800_000;
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_000_000) {
    throw new Error("--rows must be an integer in 1..2000000");
  }
  return value;
}

const rowCount = rowsArgument(process.argv.slice(2));
const root = mkdtempSync(join(tmpdir(), "markorbit-knowledge-storage-envelope-"));
const databasePath = join(root, "frontier.sqlite");
const backupPath = join(root, "frontier.backup.sqlite");
const restoredPath = join(root, "frontier.restored.sqlite");
const startedAt = new Date().toISOString();

try {
  const database = new DatabaseSync(databasePath, { timeout: 5_000 });
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA wal_autocheckpoint = 0;
    CREATE TABLE web_url_catalog_benchmark (
      workspace_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      source_key TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      discovery_rank INTEGER NOT NULL,
      status TEXT NOT NULL,
      first_discovered_at TEXT NOT NULL,
      last_discovered_at TEXT NOT NULL,
      collection_eligible INTEGER NOT NULL,
      temperature TEXT NOT NULL,
      PRIMARY KEY (workspace_id, campaign_id, source_key, canonical_url)
    ) STRICT;
    CREATE INDEX idx_web_url_catalog_benchmark_queue
      ON web_url_catalog_benchmark(workspace_id, campaign_id, source_key, status, discovery_rank);
    CREATE INDEX idx_web_url_catalog_benchmark_temperature
      ON web_url_catalog_benchmark(temperature, status, last_discovered_at);
  `);
  const insert = database.prepare(`
    INSERT INTO web_url_catalog_benchmark (
      workspace_id, campaign_id, source_key, canonical_url, discovery_rank,
      status, first_discovered_at, last_discovered_at, collection_eligible, temperature
    ) VALUES (?, ?, ?, ?, ?, 'DISCOVERED', ?, ?, ?, ?)
  `);
  const observedAt = "2026-09-16T00:00:00.000Z";
  const insertStarted = performance.now();
  database.exec("BEGIN IMMEDIATE;");
  for (let index = 0; index < rowCount; index += 1) {
    const eligible = index % 5 === 0 ? 0 : 1;
    insert.run(
      "wsp_benchmark",
      "bulk-web-800k",
      `source-${String(index % 32).padStart(2, "0")}`,
      `https://example.com/knowledge/${String(index).padStart(7, "0")}`,
      index,
      observedAt,
      observedAt,
      eligible,
      eligible ? "HOT" : "COLD",
    );
  }
  database.exec("COMMIT;");
  const insertDurationSeconds = (performance.now() - insertStarted) / 1_000;
  const walPath = `${databasePath}-wal`;
  const walBytesBeforeCheckpoint = existsSync(walPath) ? statSync(walPath).size : 0;
  const pageCount = Number(database.prepare("PRAGMA page_count").get().page_count);
  const pageSize = Number(database.prepare("PRAGMA page_size").get().page_size);
  const freePages = Number(database.prepare("PRAGMA freelist_count").get().freelist_count);
  database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  database.close();

  const databaseBytes = statSync(databasePath).size;
  const backupStarted = performance.now();
  copyFileSync(databasePath, backupPath);
  const backupDurationSeconds = (performance.now() - backupStarted) / 1_000;
  const backupBytes = statSync(backupPath).size;

  const restoreStarted = performance.now();
  copyFileSync(backupPath, restoredPath);
  const restored = new DatabaseSync(restoredPath, { readOnly: true });
  const integrity = restored.prepare("PRAGMA integrity_check").get().integrity_check;
  const restoredRows = Number(
    restored.prepare("SELECT COUNT(*) AS count FROM web_url_catalog_benchmark").get().count,
  );
  restored.close();
  const restoreDurationSeconds = (performance.now() - restoreStarted) / 1_000;
  const restoreThroughputMiBPerSecond =
    backupBytes / 1024 ** 2 / Math.max(restoreDurationSeconds, 0.001);

  const result = {
    schemaVersion: 1,
    objectType: "KNOWLEDGE_STORAGE_OPERATING_ENVELOPE_BENCHMARK",
    startedAt,
    completedAt: new Date().toISOString(),
    rowCount,
    insert: {
      durationSeconds: Number(insertDurationSeconds.toFixed(3)),
      rowsPerSecond: Math.round(rowCount / Math.max(insertDurationSeconds, 0.001)),
    },
    sqlite: {
      pageCount,
      pageSize,
      freePages,
      databaseBytes,
      walBytesBeforeCheckpoint,
    },
    backup: {
      bytes: backupBytes,
      durationSeconds: Number(backupDurationSeconds.toFixed(3)),
    },
    restore: {
      durationSeconds: Number(restoreDurationSeconds.toFixed(3)),
      throughputMiBPerSecond: Number(restoreThroughputMiBPerSecond.toFixed(2)),
      integrityCheck: integrity,
      restoredRows,
    },
  };
  if (integrity !== "ok" || restoredRows !== rowCount) {
    throw new Error(`restore validation failed: integrity=${integrity}, rows=${restoredRows}`);
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (process.env.MARKORBIT_KEEP_STORAGE_BENCHMARK !== "1") {
    rmSync(root, { recursive: true, force: true });
  } else {
    console.error(`benchmark retained at ${root}`);
  }
}
