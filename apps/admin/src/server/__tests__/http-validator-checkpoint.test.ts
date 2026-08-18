import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteHttpValidatorCheckpointRepository } from "../http-validator-checkpoint";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fixture() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE source_definitions (id TEXT PRIMARY KEY) STRICT;
    CREATE TABLE worker_definitions (
      id TEXT PRIMARY KEY,
      desired_state TEXT NOT NULL
    ) STRICT;
    CREATE TABLE worker_credentials (
      worker_id TEXT PRIMARY KEY,
      credential_digest TEXT NOT NULL
    ) STRICT;
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL
    ) STRICT;
    CREATE TABLE job_leases (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      token_digest TEXT NOT NULL,
      expires_at TEXT NOT NULL
    ) STRICT;
  `);
  database.prepare("INSERT INTO source_definitions (id) VALUES (?)").run("src_one");
  database
    .prepare("INSERT INTO worker_definitions (id, desired_state) VALUES (?, ?)")
    .run("wrk_one", "ACTIVE");
  database
    .prepare("INSERT INTO worker_credentials (worker_id, credential_digest) VALUES (?, ?)")
    .run("wrk_one", sha256("worker-secret"));
  database
    .prepare("INSERT INTO jobs (id, workspace_id, source_id) VALUES (?, ?, ?)")
    .run("job_one", "wsp_one", "src_one");
  database
    .prepare(
      `INSERT INTO job_leases (
         id, worker_id, workspace_id, job_id, status, token_digest, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "lse_one",
      "wrk_one",
      "wsp_one",
      "job_one",
      "ACTIVE",
      sha256("lease-secret"),
      "2026-08-18T20:00:00.000Z",
    );
  const repository = new SqliteHttpValidatorCheckpointRepository(
    database,
    () => new Date("2026-08-18T12:00:00.000Z"),
  );
  const auth = {
    workerId: "wrk_one",
    credential: "worker-secret",
    leaseId: "lse_one",
    leaseToken: "lease-secret",
  };
  return { database, repository, auth };
}

describe("HTTP validator checkpoints", () => {
  it("persists ETag and Last-Modified under the active lease source scope", () => {
    const env = fixture();
    try {
      const written = env.repository.write({
        ...env.auth,
        canonicalUri: "https://example.com/feed#fragment",
        etag: 'W/"feed-v1"',
        lastModified: "Tue, 18 Aug 2026 10:00:00 GMT",
      });
      expect(written).toMatchObject({
        workspaceId: "wsp_one",
        sourceId: "src_one",
        canonicalUri: "https://example.com/feed",
        etag: 'W/"feed-v1"',
        lastModified: "Tue, 18 Aug 2026 10:00:00 GMT",
      });
      expect(
        env.repository.read({ ...env.auth, canonicalUri: "https://example.com/feed" }),
      ).toEqual(written);
    } finally {
      env.database.close();
    }
  });

  it("upserts validators for the same source endpoint without creating duplicates", () => {
    const env = fixture();
    try {
      env.repository.write({
        ...env.auth,
        canonicalUri: "https://example.com/api",
        etag: '"v1"',
      });
      const updated = env.repository.write({
        ...env.auth,
        canonicalUri: "https://example.com/api",
        etag: '"v2"',
      });
      expect(updated.etag).toBe('"v2"');
      const count = env.database
        .prepare("SELECT COUNT(*) AS count FROM http_validator_checkpoints")
        .get() as { count: number };
      expect(Number(count.count)).toBe(1);
    } finally {
      env.database.close();
    }
  });

  it("rejects invalid Worker or lease credentials before checkpoint access", () => {
    const env = fixture();
    try {
      expect(() =>
        env.repository.read({
          ...env.auth,
          credential: "wrong",
          canonicalUri: "https://example.com/feed",
        }),
      ).toThrow(/invalid/i);
      expect(() =>
        env.repository.read({
          ...env.auth,
          leaseToken: "wrong",
          canonicalUri: "https://example.com/feed",
        }),
      ).toThrow(/invalid/i);
    } finally {
      env.database.close();
    }
  });

  it("rejects expired leases and non-HTTP validator targets", () => {
    const env = fixture();
    try {
      env.database
        .prepare("UPDATE job_leases SET expires_at = ? WHERE id = ?")
        .run("2026-08-18T11:59:59.000Z", "lse_one");
      expect(() =>
        env.repository.read({ ...env.auth, canonicalUri: "https://example.com/feed" }),
      ).toThrow(/expired/i);
      env.database
        .prepare("UPDATE job_leases SET expires_at = ? WHERE id = ?")
        .run("2026-08-18T20:00:00.000Z", "lse_one");
      expect(() =>
        env.repository.write({
          ...env.auth,
          canonicalUri: "file:///tmp/feed.xml",
          etag: '"v1"',
        }),
      ).toThrow(/http/i);
    } finally {
      env.database.close();
    }
  });
});
