import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { automaticConversionRecoveryCandidateIds } from "../raw-artifact-auto-conversion";

const WORKSPACE = "wsp_01H00000000000000000000000";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE raw_artifacts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      artifact_kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      status TEXT NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE conversion_profiles (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT,
      status TEXT NOT NULL,
      converter_id TEXT NOT NULL,
      converter_version TEXT NOT NULL,
      auto_convert INTEGER NOT NULL,
      document_json TEXT NOT NULL
    );
    CREATE TABLE converter_manifests (
      converter_id TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      output_format TEXT NOT NULL,
      PRIMARY KEY (converter_id, version)
    );
    CREATE TABLE conversion_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      raw_artifact_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL
    );
  `);
  return db;
}

function insertManifest(db: DatabaseSync, id: string): void {
  db.prepare(
    "INSERT INTO converter_manifests (converter_id, version, status, output_format) VALUES (?, '1.0.0', 'ACTIVE', 'MARKDOWN')",
  ).run(id);
}

function insertProfile(
  db: DatabaseSync,
  input: {
    id: string;
    sourceId: string | null;
    converterId: string;
    autoConvert: boolean;
    artifactKinds: string[];
    mimePatterns: string[];
  },
): void {
  db.prepare(
    `INSERT INTO conversion_profiles
      (id, workspace_id, source_id, status, converter_id, converter_version, auto_convert, document_json)
     VALUES (?, ?, ?, 'ACTIVE', ?, '1.0.0', ?, ?)`,
  ).run(
    input.id,
    WORKSPACE,
    input.sourceId,
    input.converterId,
    input.autoConvert ? 1 : 0,
    JSON.stringify({
      input: {
        artifactKinds: input.artifactKinds,
        mimePatterns: input.mimePatterns,
      },
    }),
  );
}

function insertArtifact(
  db: DatabaseSync,
  input: {
    id: string;
    sourceId?: string;
    artifactKind: string;
    mimeType: string;
    status: string;
    createdAt: string;
    authorizedProfileId?: string;
  },
): void {
  db.prepare(
    `INSERT INTO raw_artifacts
      (id, workspace_id, source_id, artifact_kind, mime_type, status, document_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    WORKSPACE,
    input.sourceId ?? "src_uspto",
    input.artifactKind,
    input.mimeType,
    input.status,
    JSON.stringify(
      input.authorizedProfileId
        ? { extensions: { "x-conversion-profile-id": input.authorizedProfileId } }
        : {},
    ),
    input.createdAt,
  );
}

describe("automatic conversion recovery candidate selection", () => {
  it("recovers orphaned automatic work without taking over raw-only or manually authorized artifacts", () => {
    const db = database();
    insertManifest(db, "markdown-converter");
    insertManifest(db, "text-converter");

    insertProfile(db, {
      id: "auto-markdown",
      sourceId: "src_uspto",
      converterId: "markdown-converter",
      autoConvert: true,
      artifactKinds: ["MARKDOWN"],
      mimePatterns: ["text/markdown"],
    });
    insertProfile(db, {
      id: "manual-markdown",
      sourceId: "src_uspto",
      converterId: "markdown-converter",
      autoConvert: false,
      artifactKinds: ["MARKDOWN"],
      mimePatterns: ["text/markdown"],
    });
    insertProfile(db, {
      id: "auto-text-global",
      sourceId: null,
      converterId: "text-converter",
      autoConvert: true,
      artifactKinds: ["TEXT"],
      mimePatterns: ["text/*"],
    });

    insertArtifact(db, {
      id: "ready-auto",
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      status: "READY_FOR_CONVERSION",
      authorizedProfileId: "auto-markdown",
      createdAt: "2026-08-09T00:10:00.000Z",
    });
    insertArtifact(db, {
      id: "ready-manual",
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      status: "READY_FOR_CONVERSION",
      authorizedProfileId: "manual-markdown",
      createdAt: "2026-08-09T00:00:00.000Z",
    });
    insertArtifact(db, {
      id: "ready-without-profile",
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      status: "READY_FOR_CONVERSION",
      createdAt: "2026-08-09T00:00:30.000Z",
    });
    insertArtifact(db, {
      id: "raw-html-evidence",
      artifactKind: "HTML",
      mimeType: "text/html",
      status: "REGISTERED",
      createdAt: "2026-08-09T00:01:00.000Z",
    });
    insertArtifact(db, {
      id: "global-text-wildcard",
      artifactKind: "TEXT",
      mimeType: "text/plain",
      status: "REGISTERED",
      createdAt: "2026-08-09T00:02:00.000Z",
    });
    insertArtifact(db, {
      id: "duplicate-markdown",
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      status: "DUPLICATE_CHECKED",
      createdAt: "2026-08-09T00:03:00.000Z",
    });
    insertArtifact(db, {
      id: "registered-markdown",
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      status: "REGISTERED",
      createdAt: "2026-08-09T00:04:00.000Z",
    });
    insertArtifact(db, {
      id: "already-enqueued",
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      status: "READY_FOR_CONVERSION",
      authorizedProfileId: "auto-markdown",
      createdAt: "2026-08-09T00:05:00.000Z",
    });
    db.prepare(
      "INSERT INTO conversion_runs (id, workspace_id, raw_artifact_id, trigger_type) VALUES ('run_existing', ?, 'already-enqueued', 'AUTO_PROFILE')",
    ).run(WORKSPACE);

    expect(automaticConversionRecoveryCandidateIds(db, WORKSPACE, 20)).toEqual([
      "ready-auto",
      "global-text-wildcard",
      "duplicate-markdown",
      "registered-markdown",
    ]);
  });

  it("keeps recovery batches bounded and deterministic", () => {
    const db = database();
    insertManifest(db, "markdown-converter");
    insertProfile(db, {
      id: "auto-markdown",
      sourceId: "src_uspto",
      converterId: "markdown-converter",
      autoConvert: true,
      artifactKinds: ["MARKDOWN"],
      mimePatterns: ["text/markdown"],
    });
    insertArtifact(db, {
      id: "ready-first",
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      status: "READY_FOR_CONVERSION",
      authorizedProfileId: "auto-markdown",
      createdAt: "2026-08-09T00:03:00.000Z",
    });
    insertArtifact(db, {
      id: "registered-oldest",
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      status: "REGISTERED",
      createdAt: "2026-08-09T00:01:00.000Z",
    });
    insertArtifact(db, {
      id: "registered-newer",
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown",
      status: "REGISTERED",
      createdAt: "2026-08-09T00:02:00.000Z",
    });

    expect(automaticConversionRecoveryCandidateIds(db, WORKSPACE, 2)).toEqual([
      "ready-first",
      "registered-oldest",
    ]);
  });
});
