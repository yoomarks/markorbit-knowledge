import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SCHEMA_V1_VERSION, type RawArtifact } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, openRegistryDatabase } from "../src/index";
import { executeRetentionPolicy } from "../src/retention-execution";
import { SqliteWebUrlCatalogRepository } from "../src/web-url-catalog";

const WORKSPACE = DEFAULT_WORKSPACE.id;
const SOURCE = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OLD = "2026-08-01T00:00:00.000Z";
const NOW = new Date("2026-09-16T00:00:00.000Z");

function artifact(): RawArtifact {
  return {
    schemaVersion: SCHEMA_V1_VERSION,
    objectType: "RAW_ARTIFACT",
    id: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId: WORKSPACE,
    sourceId: SOURCE,
    version: 1,
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: "retention-recovery.html",
    canonicalUri: "https://example.com/evidence",
    storage: { provider: "LOCAL", uri: "file:///tmp/retention-recovery.html" },
    binaryHash: { algorithm: "SHA-256", value: "a".repeat(64) },
    sizeBytes: 128,
    capturedAt: OLD,
    collector: { connectorId: "crawl4ai-web", connectorVersion: "1.0.0" },
    provenance: { sourceUri: "https://example.com/evidence" },
    status: "READY_FOR_CONVERSION",
    createdAt: OLD,
  };
}

describe("retention and acquisition recovery", () => {
  it("restores archived evidence, URL history and audits after lifecycle compaction", () => {
    const root = mkdtempSync(join(tmpdir(), "markorbit-retention-recovery-"));
    const livePath = join(root, "live.sqlite");
    const backupPath = join(root, "backup.sqlite");
    try {
      const db = openRegistryDatabase(livePath);
      const workspace = {
        ...DEFAULT_WORKSPACE,
        retentionPolicy: { rawArtifactDays: 1, derivedDocumentDays: null },
      };
      db.prepare("UPDATE workspaces SET document_json = ? WHERE id = ?").run(
        JSON.stringify(workspace),
        WORKSPACE,
      );
      db.exec(`
        CREATE TABLE raw_artifacts (
          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_id TEXT NOT NULL,
          status TEXT NOT NULL, canonical_uri TEXT, content_digest TEXT NOT NULL,
          created_at TEXT NOT NULL, document_json TEXT NOT NULL
        ) STRICT;
      `);
      const raw = artifact();
      db.prepare(
        `INSERT INTO raw_artifacts (
           id, workspace_id, source_id, status, canonical_uri, content_digest, created_at, document_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        raw.id,
        raw.workspaceId,
        raw.sourceId,
        raw.status,
        raw.canonicalUri ?? null,
        raw.binaryHash.value,
        raw.createdAt,
        JSON.stringify(raw),
      );

      const scope = { workspaceId: WORKSPACE, campaignId: "recovery-v1", sourceKey: "official" };
      const catalog = new SqliteWebUrlCatalogRepository(db, () => new Date(OLD));
      catalog.upsertDiscovered({
        ...scope,
        discoveryMode: "SITEMAP",
        urls: ["https://example.com/a", "https://example.com/b"],
      });
      catalog.closeCampaign(scope);
      catalog.archiveCampaign(scope);
      expect(catalog.pruneArchived({ ...scope, before: NOW, limit: 100 })).toEqual({
        movedToHistory: 2,
        remaining: 0,
      });
      expect(executeRetentionPolicy(db, { mode: "APPLY", observedAt: NOW })).toMatchObject({
        applied: 1,
        held: 0,
      });
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();

      copyFileSync(livePath, backupPath);
      const restored = openRegistryDatabase(backupPath);
      expect(restored.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
      expect(restored.prepare("SELECT status FROM raw_artifacts WHERE id = ?").get(raw.id)).toEqual(
        {
          status: "ARCHIVED",
        },
      );
      expect(
        restored.prepare("SELECT COUNT(*) AS count FROM web_url_catalog_history").get(),
      ).toEqual({
        count: 2,
      });
      expect(
        restored.prepare("SELECT COUNT(*) AS count FROM retention_execution_audits").get(),
      ).toEqual({
        count: 1,
      });
      const restoredCatalog = new SqliteWebUrlCatalogRepository(restored);
      expect(restoredCatalog.campaignState(scope)).toBe("ARCHIVED");
      expect(restoredCatalog.reconcile(scope)).toEqual({ fetched: 0, released: 0, failed: 0 });
      restored.close();
    } finally {
      if (process.platform !== "win32") {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
});
