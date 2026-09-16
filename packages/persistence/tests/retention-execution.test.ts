import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CONVERSION_EXECUTION_VERSION,
  SCHEMA_V1_VERSION,
  type RawArtifact,
  type StagingDocumentDescriptor,
} from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, openRegistryDatabase } from "../src/index";
import { executeRetentionPolicy } from "../src/retention-execution";

const WORKSPACE = DEFAULT_WORKSPACE.id;
const SOURCE = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OLD = "2026-09-01T00:00:00.000Z";
const NOW = new Date("2026-09-16T00:00:00.000Z");

function raw(id: string): RawArtifact {
  return {
    schemaVersion: SCHEMA_V1_VERSION,
    objectType: "RAW_ARTIFACT",
    id,
    workspaceId: WORKSPACE,
    sourceId: SOURCE,
    version: 1,
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: "fixture.html",
    canonicalUri: "https://example.com/fixture",
    storage: { provider: "LOCAL", uri: `file:///tmp/${id}.html` },
    binaryHash: { algorithm: "SHA-256", value: "a".repeat(64) },
    sizeBytes: 128,
    capturedAt: OLD,
    collector: { connectorId: "crawl4ai-web", connectorVersion: "1.0.0" },
    provenance: { sourceUri: "https://example.com/fixture" },
    status: "READY_FOR_CONVERSION",
    createdAt: OLD,
  };
}

function staging(id: string, rawArtifactId: string): StagingDocumentDescriptor {
  const digest = "b".repeat(64);
  return {
    contractVersion: CONVERSION_EXECUTION_VERSION,
    objectType: "STAGING_DOCUMENT_DESCRIPTOR",
    id,
    workspaceId: WORKSPACE,
    sourceId: SOURCE,
    rawArtifactId,
    conversionRunId: "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    title: "Retention fixture",
    targetPath: "fixtures/retention.md",
    outputFormat: "MARKDOWN",
    contentHash: { algorithm: "SHA-256", value: digest },
    sizeBytes: 64,
    contentAddressedRef: `cas:sha256:${digest}`,
    frontmatterSummary: { fieldCount: 0, fields: [] },
    converter: { converterId: "fixture-converter", version: "1.0.0" },
    generatedAt: OLD,
    validation: { outcome: "PASS", checks: [], warnings: [] },
    status: "READY",
  };
}

function database(): DatabaseSync {
  const db = openRegistryDatabase(":memory:");
  const workspace = {
    ...DEFAULT_WORKSPACE,
    retentionPolicy: { rawArtifactDays: 1, derivedDocumentDays: 1 },
  };
  db.prepare("UPDATE workspaces SET document_json = ? WHERE id = ?").run(
    JSON.stringify(workspace),
    WORKSPACE,
  );
  db.exec(`
    CREATE TABLE raw_artifacts (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT NOT NULL,
      created_at TEXT NOT NULL, document_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE staging_documents (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, raw_artifact_id TEXT NOT NULL,
      conversion_run_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, document_json TEXT NOT NULL
    ) STRICT;
  `);
  return db;
}

function insertRaw(db: DatabaseSync, artifact: RawArtifact): void {
  db.prepare(
    `INSERT INTO raw_artifacts (id, workspace_id, status, created_at, document_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    artifact.id,
    artifact.workspaceId,
    artifact.status,
    artifact.createdAt,
    JSON.stringify(artifact),
  );
}

function insertStaging(db: DatabaseSync, descriptor: StagingDocumentDescriptor): void {
  db.prepare(
    `INSERT INTO staging_documents
     (id, workspace_id, raw_artifact_id, conversion_run_id, status, created_at, updated_at, document_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    descriptor.id,
    descriptor.workspaceId,
    descriptor.rawArtifactId,
    descriptor.conversionRunId,
    descriptor.status,
    OLD,
    OLD,
    JSON.stringify(descriptor),
  );
}

describe("retention execution", () => {
  it("dry-runs first, then archives only unheld governed evidence with durable audit", () => {
    const db = database();
    const rawArtifact = raw("art_01ARZ3NDEKTSV4RRFFQ69G5FAV");
    const derived = staging("std_01ARZ3NDEKTSV4RRFFQ69G5FAV", "art_01ARZ3NDEKTSV4RRFFQ69G5FAW");
    insertRaw(db, rawArtifact);
    insertStaging(db, derived);

    const dryRun = executeRetentionPolicy(db, { mode: "DRY_RUN", observedAt: NOW });
    expect(dryRun).toMatchObject({ scanned: 2, actionable: 2, held: 0, applied: 0 });
    expect(db.prepare("SELECT status FROM raw_artifacts WHERE id = ?").get(rawArtifact.id)).toEqual(
      {
        status: "READY_FOR_CONVERSION",
      },
    );

    const applied = executeRetentionPolicy(db, { mode: "APPLY", observedAt: NOW });
    expect(applied).toMatchObject({ scanned: 2, actionable: 2, held: 0, applied: 2 });
    expect(db.prepare("SELECT status FROM raw_artifacts WHERE id = ?").get(rawArtifact.id)).toEqual(
      {
        status: "ARCHIVED",
      },
    );
    expect(db.prepare("SELECT status FROM staging_documents WHERE id = ?").get(derived.id)).toEqual(
      {
        status: "ARCHIVED",
      },
    );
    expect(db.prepare("SELECT COUNT(*) AS count FROM retention_execution_audits").get()).toEqual({
      count: 2,
    });
    db.close();
  });

  it("fails closed with explicit protection holds for lineage and governed consumers", () => {
    const db = database();
    const rawArtifact = raw("art_01ARZ3NDEKTSV4RRFFQ69G5FAV");
    const derived = staging("std_01ARZ3NDEKTSV4RRFFQ69G5FAV", rawArtifact.id);
    insertRaw(db, rawArtifact);
    insertStaging(db, derived);
    db.exec(`
      CREATE TABLE conversion_runs (id TEXT PRIMARY KEY, raw_artifact_id TEXT NOT NULL, status TEXT NOT NULL) STRICT;
      CREATE TABLE ready_packages (raw_artifact_id TEXT NOT NULL, staging_document_id TEXT NOT NULL) STRICT;
      CREATE TABLE retrieval_documents (
        raw_artifact_id TEXT NOT NULL, staging_document_id TEXT NOT NULL,
        is_current INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE evidence_sets (document_json TEXT NOT NULL) STRICT;
    `);
    db.prepare("INSERT INTO conversion_runs VALUES (?, ?, 'RUNNING')").run(
      derived.conversionRunId,
      rawArtifact.id,
    );
    db.prepare("INSERT INTO ready_packages VALUES (?, ?)").run(rawArtifact.id, derived.id);
    db.prepare("INSERT INTO retrieval_documents VALUES (?, ?, 1)").run(rawArtifact.id, derived.id);
    db.prepare("INSERT INTO evidence_sets VALUES (?)").run(
      JSON.stringify({
        members: [{ rawArtifactId: rawArtifact.id, stagingDocumentId: derived.id }],
      }),
    );

    const result = executeRetentionPolicy(db, { mode: "APPLY", observedAt: NOW });
    expect(result).toMatchObject({ scanned: 2, actionable: 0, held: 2, applied: 0 });
    const rawCandidate = result.candidates.find((item) => item.action === "ARCHIVE_RAW_ARTIFACT")!;
    expect(rawCandidate.holdReasons).toEqual(
      [
        "ACTIVE_CONVERSION_REFERENCE",
        "ACTIVE_STAGING_REFERENCE",
        "CURRENT_RETRIEVAL_REFERENCE",
        "EVIDENCE_SET_REFERENCE",
        "READY_PACKAGE_REFERENCE",
      ].sort(),
    );
    const derivedCandidate = result.candidates.find(
      (item) => item.action === "ARCHIVE_DERIVED_DOCUMENT",
    )!;
    expect(derivedCandidate.holdReasons).toEqual(
      [
        "ACTIVE_CONVERSION_REFERENCE",
        "CURRENT_RETRIEVAL_REFERENCE",
        "EVIDENCE_SET_REFERENCE",
        "READY_PACKAGE_REFERENCE",
      ].sort(),
    );
    expect(db.prepare("SELECT status FROM raw_artifacts WHERE id = ?").get(rawArtifact.id)).toEqual(
      {
        status: "READY_FOR_CONVERSION",
      },
    );
    expect(db.prepare("SELECT status FROM staging_documents WHERE id = ?").get(derived.id)).toEqual(
      {
        status: "READY",
      },
    );
    db.close();
  });
});
