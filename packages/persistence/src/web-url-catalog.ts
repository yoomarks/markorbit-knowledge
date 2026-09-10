import type { DatabaseSync } from "node:sqlite";
import { initializeRegistry, RegistryValidationError } from "./index";

const MIGRATION_ID = "1031_web_url_catalog";

export type WebUrlCatalogStatus = "DISCOVERED" | "QUEUED" | "FETCHED" | "FAILED" | "COLD";

export type WebUrlCatalogRow = {
  workspaceId: string;
  campaignId: string;
  sourceKey: string;
  sourceId: string | null;
  canonicalUrl: string;
  discoveryMode: string;
  discoveryRank: number;
  status: WebUrlCatalogStatus;
  firstDiscoveredAt: string;
  lastDiscoveredAt: string;
  queuedRunId: string | null;
  lastFetchedAt: string | null;
  contentDigest: string | null;
  title: string | null;
  summary: string | null;
};
function ensureMigration(database: DatabaseSync): void {
  initializeRegistry(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS web_url_catalog (
        workspace_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        source_key TEXT NOT NULL,
        source_id TEXT,
        canonical_url TEXT NOT NULL,
        discovery_mode TEXT NOT NULL,
        discovery_rank INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('DISCOVERED','QUEUED','FETCHED','FAILED','COLD')),
        first_discovered_at TEXT NOT NULL,
        last_discovered_at TEXT NOT NULL,
        queued_run_id TEXT,
        last_fetched_at TEXT,
        content_digest TEXT,
        title TEXT,
        summary TEXT,
        PRIMARY KEY (workspace_id, campaign_id, source_key, canonical_url)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_web_url_catalog_queue
        ON web_url_catalog(workspace_id, campaign_id, source_key, status, discovery_rank);
      CREATE INDEX IF NOT EXISTS idx_web_url_catalog_source
        ON web_url_catalog(source_id, status, last_discovered_at DESC);
    `);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function normalizeUrl(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError("canonicalUrl is required");
  const parsed = new URL(normalized);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new RegistryValidationError("canonicalUrl must be http(s)");
  }
  return normalized;
}

export class SqliteWebUrlCatalogRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureMigration(database);
  }

  upsertDiscovered(input: {
    workspaceId: string;
    campaignId: string;
    sourceKey: string;
    sourceId?: string | null;
    discoveryMode: string;
    urls: readonly string[];
  }): { discovered: number; inserted: number } {
    const now = this.clock().toISOString();
    const unique = [...new Set(input.urls.map(normalizeUrl))];
    const statement = this.database.prepare(`
      INSERT INTO web_url_catalog (
        workspace_id, campaign_id, source_key, source_id, canonical_url,
        discovery_mode, discovery_rank, status, first_discovered_at, last_discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DISCOVERED', ?, ?)
      ON CONFLICT(workspace_id, campaign_id, source_key, canonical_url) DO UPDATE SET
        source_id = COALESCE(excluded.source_id, web_url_catalog.source_id),
        discovery_mode = excluded.discovery_mode,
        discovery_rank = excluded.discovery_rank,
        last_discovered_at = excluded.last_discovered_at
    `);
    const countStatement = this.database.prepare(
      `SELECT COUNT(*) AS count FROM web_url_catalog
       WHERE workspace_id = ? AND campaign_id = ? AND source_key = ?`,
    );
    const before = countStatement.get(input.workspaceId, input.campaignId, input.sourceKey) as {
      count: number;
    };
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      unique.forEach((url, index) => {
        statement.run(
          input.workspaceId,
          input.campaignId,
          input.sourceKey,
          input.sourceId ?? null,
          url,
          input.discoveryMode,
          index,
          now,
          now,
        );
      });
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    const after = countStatement.get(input.workspaceId, input.campaignId, input.sourceKey) as {
      count: number;
    };
    return { discovered: unique.length, inserted: Number(after.count) - Number(before.count) };
  }

  bindSource(input: {
    workspaceId: string;
    campaignId: string;
    sourceKey: string;
    sourceId: string;
  }): number {
    const result = this.database
      .prepare(
        `
      UPDATE web_url_catalog
      SET source_id = ?
      WHERE workspace_id = ? AND campaign_id = ? AND source_key = ?
        AND (source_id IS NULL OR source_id <> ?)
    `,
      )
      .run(input.sourceId, input.workspaceId, input.campaignId, input.sourceKey, input.sourceId);
    return Number(result.changes);
  }

  reconcile(input: { workspaceId: string; campaignId: string; sourceKey: string }): {
    fetched: number;
    released: number;
    failed: number;
  } {
    let fetched = 0;
    let released = 0;
    let failed = 0;
    const hasRawArtifacts = Boolean(
      this.database
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='raw_artifacts'")
        .get(),
    );
    const hasRuns = Boolean(
      this.database
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='collection_runs'")
        .get(),
    );
    if (hasRawArtifacts) {
      const result = this.database
        .prepare(
          `
        UPDATE web_url_catalog
        SET status = 'FETCHED',
            last_fetched_at = (
              SELECT MAX(r.created_at) FROM raw_artifacts r
              WHERE r.source_id = web_url_catalog.source_id
                AND r.canonical_uri = web_url_catalog.canonical_url
            ),
            content_digest = (
              SELECT r.content_digest FROM raw_artifacts r
              WHERE r.source_id = web_url_catalog.source_id
                AND r.canonical_uri = web_url_catalog.canonical_url
              ORDER BY r.created_at DESC, r.id DESC LIMIT 1
            )
        WHERE workspace_id = ? AND campaign_id = ? AND source_key = ?
          AND source_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM raw_artifacts r
            WHERE r.source_id = web_url_catalog.source_id
              AND r.canonical_uri = web_url_catalog.canonical_url
          )
      `,
        )
        .run(input.workspaceId, input.campaignId, input.sourceKey);
      fetched = Number(result.changes);
    }
    if (hasRuns) {
      const result = this.database
        .prepare(
          `
        UPDATE web_url_catalog
        SET status = 'DISCOVERED', queued_run_id = NULL
        WHERE workspace_id = ? AND campaign_id = ? AND source_key = ?
          AND status = 'QUEUED' AND queued_run_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM collection_runs r
            WHERE r.id = web_url_catalog.queued_run_id
              AND r.status IN ('FAILED', 'CANCELLED')
          )
      `,
        )
        .run(input.workspaceId, input.campaignId, input.sourceKey);
      released = Number(result.changes);
      const completedWithoutArtifact = this.database
        .prepare(
          `
        UPDATE web_url_catalog
        SET status = 'FAILED'
        WHERE workspace_id = ? AND campaign_id = ? AND source_key = ?
          AND status = 'QUEUED' AND queued_run_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM collection_runs r
            WHERE r.id = web_url_catalog.queued_run_id AND r.status = 'COMPLETED'
          )
      `,
        )
        .run(input.workspaceId, input.campaignId, input.sourceKey);
      failed = Number(completedWithoutArtifact.changes);
    }
    return { fetched, released, failed };
  }

  nextBatch(input: {
    workspaceId: string;
    campaignId: string;
    sourceKey: string;
    limit: number;
  }): string[] {
    if (!Number.isInteger(input.limit) || input.limit <= 0 || input.limit > 500) {
      throw new RegistryValidationError("batch limit must be an integer in 1..500");
    }
    const rows = this.database
      .prepare(
        `
      SELECT canonical_url
      FROM web_url_catalog
      WHERE workspace_id = ? AND campaign_id = ? AND source_key = ?
        AND status = 'DISCOVERED'
      ORDER BY discovery_rank ASC, canonical_url ASC
      LIMIT ?
    `,
      )
      .all(input.workspaceId, input.campaignId, input.sourceKey, input.limit) as Array<{
      canonical_url: string;
    }>;
    return rows.map((row) => row.canonical_url);
  }

  markQueued(input: {
    workspaceId: string;
    campaignId: string;
    sourceKey: string;
    runId: string;
    urls: readonly string[];
  }): number {
    if (input.urls.length === 0) return 0;
    const statement = this.database.prepare(`
      UPDATE web_url_catalog
      SET status = 'QUEUED', queued_run_id = ?
      WHERE workspace_id = ? AND campaign_id = ? AND source_key = ?
        AND canonical_url = ? AND status = 'DISCOVERED'
    `);
    let changes = 0;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      for (const url of input.urls) {
        changes += Number(
          statement.run(
            input.runId,
            input.workspaceId,
            input.campaignId,
            input.sourceKey,
            normalizeUrl(url),
          ).changes,
        );
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return changes;
  }

  counts(input: {
    workspaceId: string;
    campaignId: string;
    sourceKey: string;
  }): Record<string, number> {
    const rows = this.database
      .prepare(
        `
      SELECT status, COUNT(*) AS count
      FROM web_url_catalog
      WHERE workspace_id = ? AND campaign_id = ? AND source_key = ?
      GROUP BY status
    `,
      )
      .all(input.workspaceId, input.campaignId, input.sourceKey) as Array<{
      status: string;
      count: number;
    }>;
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
  }
}
