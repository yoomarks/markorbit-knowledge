import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  openRegistryDatabase,
  RegistryConflictError,
  RegistryValidationError,
  SqliteSourceRepository,
} from "@markorbit/persistence";
import {
  SqliteManualUploadRequestRepository,
  manualUploadRequestFingerprint,
} from "@markorbit/persistence/manual-uploads";
import { MANUAL_UPLOAD_MAX_BYTES, manualUploadPolicy } from "../manual-upload-service";

const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("K-EXT-A manual upload", () => {
  it("accepts bounded supported files and rejects path/content-type abuse", () => {
    expect(manualUploadPolicy({ name: "brief.md", type: "text/markdown", size: 12 })).toEqual({
      originalName: "brief.md",
      mimeType: "text/markdown",
      artifactKind: "MARKDOWN",
    });
    expect(() =>
      manualUploadPolicy({ name: "../brief.md", type: "text/markdown", size: 12 }),
    ).toThrow(RegistryValidationError);
    expect(() => manualUploadPolicy({ name: "brief.pdf", type: "text/plain", size: 12 })).toThrow(
      RegistryValidationError,
    );
    expect(() =>
      manualUploadPolicy({ name: "brief.exe", type: "application/octet-stream", size: 12 }),
    ).toThrow(RegistryValidationError);
    expect(() =>
      manualUploadPolicy({
        name: "brief.md",
        type: "text/markdown",
        size: MANUAL_UPLOAD_MAX_BYTES + 1,
      }),
    ).toThrow(RegistryValidationError);
  });

  it("persists exact replay and rejects idempotency drift after reopen", () => {
    const root = mkdtempSync(join(tmpdir(), "markorbit-manual-upload-"));
    roots.push(root);
    const dbPath = join(root, "knowledge.sqlite");
    const db = openRegistryDatabase(dbPath);
    const source = new SqliteSourceRepository(db).create({
      name: "Test source",
      slug: "manual-upload-ledger-test",
      sourceType: "WEB",
      category: "USER_PROVIDED",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: [],
      languages: [],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      entrypoints: [{ uri: "https://example.test/" }],
    });
    const repository = new SqliteManualUploadRequestRepository(db);
    const base = {
      workspaceId: source.workspaceId,
      sourceId: source.id,
      idempotencyKey: "upload-1",
      fileSha256: "a".repeat(64),
      fileSizeBytes: 12,
      originalName: "brief.md",
      mimeType: "text/markdown",
      artifactKind: "MARKDOWN" as const,
      actorType: "LOCAL_ADMIN" as const,
      actorId: "operator-1",
    };
    const requestSha256 = manualUploadRequestFingerprint(base);
    const first = repository.prepare({ ...base, requestSha256 });
    const replay = repository.prepare({ ...base, requestSha256 });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.record.requestId).toBe(first.record.requestId);
    db.close();

    const reopened = openRegistryDatabase(dbPath);
    const afterRestart = new SqliteManualUploadRequestRepository(reopened);
    expect(afterRestart.getByIdempotency(base.workspaceId, base.idempotencyKey)?.requestId).toBe(
      first.record.requestId,
    );
    expect(() =>
      afterRestart.prepare({ ...base, fileSha256: "b".repeat(64), requestSha256: "c".repeat(64) }),
    ).toThrow(RegistryConflictError);
    reopened.close();
  });
});
