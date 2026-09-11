import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteWebUrlCatalogRepository } from "../src/web-url-catalog";

const scope = {
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  campaignId: "official-core-v1",
  sourceKey: "uspto",
};

function repository(clock: () => Date = () => new Date("2026-09-11T00:00:00.000Z")) {
  const database = new DatabaseSync(":memory:");
  const repo = new SqliteWebUrlCatalogRepository(database, clock);
  return { database, repo };
}

describe("web URL catalog", () => {
  it("persists the complete discovery inventory while selecting bounded batches", () => {
    const { database, repo } = repository();
    const urls = Array.from(
      { length: 1_000 },
      (_, index) => `https://www.uspto.gov/trademarks/page-${String(index).padStart(4, "0")}`,
    );
    expect(repo.upsertDiscovered({ ...scope, discoveryMode: "SITEMAP", urls })).toEqual({
      discovered: 1_000,
      inserted: 1_000,
    });
    const firstBatch = repo.nextBatch({ ...scope, limit: 100 });
    expect(firstBatch).toHaveLength(100);
    repo.markQueued({ ...scope, runId: "run_batch_1", urls: firstBatch });
    const secondBatch = repo.nextBatch({ ...scope, limit: 100 });
    expect(secondBatch).toHaveLength(100);
    expect(secondBatch[0]).not.toBe(firstBatch[0]);
    expect(repo.counts(scope)).toEqual({ DISCOVERED: 900, QUEUED: 100 });
    database.close();
  });
  it("does not rewrite unchanged catalog rows on repeated discovery", () => {
    let observedAt = new Date("2026-09-11T00:00:00.000Z");
    const { database, repo } = repository(() => observedAt);
    const url = "https://www.uspto.gov/trademarks/apply";
    repo.upsertDiscovered({ ...scope, discoveryMode: "SITEMAP", urls: [url] });
    const first = database
      .prepare("SELECT last_discovered_at FROM web_url_catalog WHERE canonical_url = ?")
      .get(url) as { last_discovered_at: string };
    observedAt = new Date("2026-09-11T01:00:00.000Z");
    repo.upsertDiscovered({ ...scope, discoveryMode: "SITEMAP", urls: [url] });
    const second = database
      .prepare("SELECT last_discovered_at FROM web_url_catalog WHERE canonical_url = ?")
      .get(url) as { last_discovered_at: string };
    expect(second.last_discovered_at).toBe(first.last_discovered_at);
    database.close();
  });

  it("keeps non-eligible discovered URLs cold while queueing only eligible URLs", () => {
    const { database, repo } = repository();
    const hot = "https://www.uspto.gov/trademarks/apply";
    const cold = "https://www.uspto.gov/patents/search";
    repo.upsertDiscovered({
      ...scope,
      discoveryMode: "SITEMAP",
      urls: [hot, cold],
      eligibleUrls: [hot],
    });
    expect(repo.counts(scope)).toEqual({ DISCOVERED: 2 });
    const classified = database
      .prepare(
        "SELECT canonical_url, collection_eligible, temperature FROM web_url_catalog ORDER BY canonical_url",
      )
      .all();
    expect(classified).toEqual([
      { canonical_url: cold, collection_eligible: 0, temperature: "COLD" },
      { canonical_url: hot, collection_eligible: 1, temperature: "HOT" },
    ]);
    expect(repo.nextBatch({ ...scope, limit: 100 })).toEqual([hot]);
    database.close();
  });

  it("binds source identity only to eligible collection candidates", () => {
    const { database, repo } = repository();
    const hot = "https://www.uspto.gov/trademarks/apply";
    const cold = "https://www.uspto.gov/patents/search";
    repo.upsertDiscovered({
      ...scope,
      discoveryMode: "SITEMAP",
      urls: [hot, cold],
      eligibleUrls: [hot],
    });
    expect(repo.bindSource({ ...scope, sourceId: "src_USPTO" })).toBe(1);
    const rows = database
      .prepare("SELECT canonical_url, source_id FROM web_url_catalog ORDER BY canonical_url")
      .all();
    expect(rows).toEqual([
      { canonical_url: cold, source_id: null },
      { canonical_url: hot, source_id: "src_USPTO" },
    ]);
    database.close();
  });

  it("only queues URLs after a run exists and releases failed runs", () => {
    const { database, repo } = repository();
    const urls = ["https://www.uspto.gov/trademarks/a", "https://www.uspto.gov/trademarks/b"];
    repo.upsertDiscovered({ ...scope, discoveryMode: "SITEMAP", urls });
    database.exec(
      "CREATE TABLE collection_runs (id TEXT PRIMARY KEY, status TEXT NOT NULL) STRICT;",
    );
    database
      .prepare("INSERT INTO collection_runs (id, status) VALUES (?, ?)")
      .run("run_1", "FAILED");
    expect(repo.markQueued({ ...scope, runId: "run_1", urls: [urls[0]!] })).toBe(1);
    expect(repo.counts(scope)).toEqual({ DISCOVERED: 1, QUEUED: 1 });
    expect(repo.reconcile(scope)).toEqual({ fetched: 0, released: 1, failed: 0 });
    expect(repo.counts(scope)).toEqual({ DISCOVERED: 2 });
    database.close();
  });

  it("marks completed runs without RawArtifact evidence as failed", () => {
    const { database, repo } = repository();
    const url = "https://www.uspto.gov/trademarks/missing";
    repo.upsertDiscovered({ ...scope, discoveryMode: "SITEMAP", urls: [url] });
    database.exec(
      "CREATE TABLE collection_runs (id TEXT PRIMARY KEY, status TEXT NOT NULL) STRICT;",
    );
    database
      .prepare("INSERT INTO collection_runs (id, status) VALUES (?, ?)")
      .run("run_2", "COMPLETED");
    repo.markQueued({ ...scope, runId: "run_2", urls: [url] });
    expect(repo.reconcile(scope)).toEqual({ fetched: 0, released: 0, failed: 1 });
    expect(repo.counts(scope)).toEqual({ FAILED: 1 });
    database.close();
  });

  it("reconciles fetched URLs from immutable RawArtifact evidence", () => {
    const { database, repo } = repository();
    const url = "https://www.uspto.gov/trademarks/apply";
    repo.upsertDiscovered({ ...scope, discoveryMode: "SITEMAP", urls: [url] });
    expect(repo.bindSource({ ...scope, sourceId: "src_USPTO" })).toBe(1);
    expect(repo.bindSource({ ...scope, sourceId: "src_USPTO" })).toBe(0);
    database.exec(`
      CREATE TABLE raw_artifacts (
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL, canonical_uri TEXT,
        content_digest TEXT NOT NULL, created_at TEXT NOT NULL
      ) STRICT;
    `);
    database
      .prepare(
        "INSERT INTO raw_artifacts (id, source_id, canonical_uri, content_digest, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("art_1", "src_USPTO", url, "a".repeat(64), "2026-09-11T01:00:00.000Z");
    expect(repo.reconcile(scope)).toEqual({ fetched: 1, released: 0, failed: 0 });
    expect(repo.counts(scope)).toEqual({ FETCHED: 1 });
    expect(repo.nextBatch({ ...scope, limit: 100 })).toEqual([]);
    database.close();
  });
});
