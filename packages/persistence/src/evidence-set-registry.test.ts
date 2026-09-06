import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { RawArtifact } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, initializeRegistry, SqliteSourceRepository } from "./index";
import { ensureRetrievalIndex } from "./retrieval-index";
import { SqliteEvidenceSetRegistryRepository } from "./evidence-set-registry";

const WORKSPACE_ID = DEFAULT_WORKSPACE.id;
const OTHER_WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAA";
const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const DOC_ID = "doc_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RAW_1 = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RAW_2 = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const SHA_1 = "1".repeat(64);
const SHA_2 = "2".repeat(64);
const RAW_SHA_1 = "a".repeat(64);
const RAW_SHA_2 = "b".repeat(64);

function rawArtifact(id: string, version: number, digest: string): RawArtifact {
  return {
    schemaVersion: "1.0",
    objectType: "RAW_ARTIFACT",
    id,
    workspaceId: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    logicalDocumentId: DOC_ID,
    version,
    ...(version > 1 ? { supersedesArtifactId: RAW_1 } : {}),
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: `rules-v${version}.html`,
    canonicalUri: "https://example.test/rules",
    storage: { provider: "LOCAL", uri: `artifact+local://sha256/${digest}` },
    binaryHash: { algorithm: "SHA-256", value: digest },
    contentHash: { algorithm: "SHA-256", value: digest },
    sizeBytes: 100 + version,
    capturedAt: `2026-09-0${version}T10:00:00.000Z`,
    publishedAt: `2026-09-0${version}T09:00:00.000Z`,
    collector: { connectorId: "crawl4ai-web", connectorVersion: "1.0.0" },
    provenance: { sourceUri: "https://example.test/rules" },
    status: "REGISTERED",
    createdAt: `2026-09-0${version}T10:00:00.000Z`,
  };
}

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initializeRegistry(db);
  ensureRetrievalIndex(db);
  new SqliteSourceRepository(
    db,
    () => new Date("2026-09-01T08:00:00.000Z"),
    () => SOURCE_ID,
  ).create({
    workspaceId: WORKSPACE_ID,
    name: "Example Office",
    slug: "example-office",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://example.test/rules",
    entrypoints: [{ uri: "https://example.test/rules" }],
  });
  db.exec(`
    CREATE TABLE raw_artifacts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      document_json TEXT NOT NULL
    ) STRICT;
  `);
  insertRaw(db, rawArtifact(RAW_1, 1, RAW_SHA_1));
  insertRetrieval(db, {
    stagingDocumentId: "std_stage_v1",
    rawArtifactId: RAW_1,
    artifactVersion: 1,
    contentSha256: SHA_1,
    isCurrent: true,
  });
  return db;
}

function insertRaw(db: DatabaseSync, artifact: RawArtifact): void {
  db.prepare("INSERT INTO raw_artifacts (id, workspace_id, document_json) VALUES (?, ?, ?)").run(
    artifact.id,
    artifact.workspaceId,
    JSON.stringify(artifact),
  );
}

function insertRetrieval(
  db: DatabaseSync,
  input: {
    stagingDocumentId: string;
    rawArtifactId: string;
    artifactVersion: number;
    contentSha256: string;
    isCurrent: boolean;
    documentId?: string;
  },
): void {
  db.prepare(
    `
    INSERT INTO retrieval_documents (
      staging_document_id, workspace_id, document_id, source_id, ready_package_id,
      raw_artifact_id, logical_document_id, artifact_version, title, target_path,
      canonical_uri, source_uri, source_name, source_category, authority_level,
      jurisdictions_json, languages_json, captured_at, published_at, content_sha256,
      keywords_json, chunk_count, indexed_at, is_current
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    input.stagingDocumentId,
    WORKSPACE_ID,
    input.documentId ?? DOC_ID,
    SOURCE_ID,
    `pkg_fixture_${input.artifactVersion}`,
    input.rawArtifactId,
    DOC_ID,
    input.artifactVersion,
    "Official rules",
    `rules-v${input.artifactVersion}.md`,
    "https://example.test/rules",
    "https://example.test/rules",
    "Example Office",
    "OFFICIAL_AUTHORITY",
    "PRIMARY_OFFICIAL",
    JSON.stringify(["US"]),
    JSON.stringify(["en"]),
    `2026-09-0${input.artifactVersion}T10:00:00.000Z`,
    `2026-09-0${input.artifactVersion}T09:00:00.000Z`,
    input.contentSha256,
    JSON.stringify(["rules"]),
    1,
    `2026-09-0${input.artifactVersion}T10:05:00.000Z`,
    input.isCurrent ? 1 : 0,
  );
}

function input(
  overrides: Partial<Parameters<SqliteEvidenceSetRegistryRepository["create"]>[0]> = {},
) {
  return {
    workspaceId: WORKSPACE_ID,
    title: "September rules review",
    note: "Frozen for operator review",
    stagingDocumentIds: ["std_stage_v1"],
    idempotencyKey: "review-2026-09-06",
    creator: {
      userId: "usr_fixture",
      membershipId: "mem_fixture",
      role: "ADMIN",
    },
    ...overrides,
  };
}

describe("Evidence Set registry", () => {
  it("freezes exact selected evidence and exposes a stable downstream export", () => {
    const db = database();
    const repository = new SqliteEvidenceSetRegistryRepository(
      db,
      () => new Date("2026-09-06T12:00:00.000Z"),
      () => "evs_01K4TEST000000000000000001",
    );

    const created = repository.create(input());

    expect(created.replayed).toBe(false);
    expect(created.evidenceSet.schemaVersion).toBe("1.0");
    expect(created.evidenceSet.members).toEqual([
      expect.objectContaining({
        ordinal: 1,
        documentId: DOC_ID,
        stagingDocumentId: "std_stage_v1",
        rawArtifactId: RAW_1,
        artifactVersion: 1,
        stagingContentSha256: SHA_1,
        rawBinarySha256: RAW_SHA_1,
        sourceId: SOURCE_ID,
        sourceUri: "https://example.test/rules",
      }),
    ]);
    expect(created.evidenceSet.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(repository.exportById(WORKSPACE_ID, created.evidenceSet.evidenceSetId)).toEqual({
      schemaVersion: "1.0",
      contractVersion: "1.0",
      objectType: "EVIDENCE_SET_EXPORT",
      evidenceSetId: created.evidenceSet.evidenceSetId,
      revision: 1,
      workspaceId: WORKSPACE_ID,
      title: created.evidenceSet.title,
      digest: created.evidenceSet.digest,
      ordering: "EXPLICIT",
      members: created.evidenceSet.members,
      createdAt: created.evidenceSet.createdAt,
    });
    db.close();
  });

  it("replays the exact same idempotent create and rejects key reuse with different selection", () => {
    const db = database();
    const repository = new SqliteEvidenceSetRegistryRepository(db);
    const first = repository.create(input());
    const replay = repository.create(input());

    expect(replay.replayed).toBe(true);
    expect(replay.evidenceSet).toEqual(first.evidenceSet);
    expect(() => repository.create(input({ title: "Different frozen context" }))).toThrowError(
      /idempotency key was reused/u,
    );
    expect(repository.list(WORKSPACE_ID)).toEqual([first.evidenceSet]);
    db.close();
  });

  it("detects silent persisted membership changes through the immutable set digest", () => {
    const db = database();
    const repository = new SqliteEvidenceSetRegistryRepository(db);
    const created = repository.create(input()).evidenceSet;
    const tampered = { ...created, title: "Silently changed" };
    db.prepare("UPDATE evidence_sets SET document_json = ? WHERE id = ?").run(
      JSON.stringify(tampered),
      created.evidenceSetId,
    );

    expect(() => repository.getById(WORKSPACE_ID, created.evidenceSetId)).toThrowError(
      /digest does not match/u,
    );
    db.close();
  });

  it("reports a newer current version without changing the frozen set", () => {
    const db = database();
    const repository = new SqliteEvidenceSetRegistryRepository(
      db,
      () => new Date("2026-09-06T12:00:00.000Z"),
      () => "evs_01K4TEST000000000000000001",
    );
    const frozen = repository.create(input()).evidenceSet;

    db.prepare("UPDATE retrieval_documents SET is_current = 0 WHERE staging_document_id = ?").run(
      "std_stage_v1",
    );
    insertRaw(db, rawArtifact(RAW_2, 2, RAW_SHA_2));
    insertRetrieval(db, {
      stagingDocumentId: "std_stage_v2",
      rawArtifactId: RAW_2,
      artifactVersion: 2,
      contentSha256: SHA_2,
      isCurrent: true,
    });

    const drift = repository.drift(WORKSPACE_ID, frozen.evidenceSetId);
    expect(drift.changedCount).toBe(1);
    expect(drift.members[0]).toEqual(
      expect.objectContaining({
        state: "NEWER_VERSION_AVAILABLE",
        frozenArtifactVersion: 1,
        currentArtifactVersion: 2,
        currentStagingDocumentId: "std_stage_v2",
      }),
    );
    expect(repository.getById(WORKSPACE_ID, frozen.evidenceSetId)).toEqual(frozen);
    db.close();
  });

  it("reports objective source archived/missing drift without mutating the frozen set", () => {
    const db = database();
    const repository = new SqliteEvidenceSetRegistryRepository(db);
    const frozen = repository.create(input()).evidenceSet;

    db.prepare("UPDATE source_definitions SET status = 'ARCHIVED' WHERE id = ?").run(SOURCE_ID);
    expect(repository.drift(WORKSPACE_ID, frozen.evidenceSetId).members[0]?.state).toBe(
      "SOURCE_ARCHIVED",
    );

    db.prepare("DELETE FROM source_definitions WHERE id = ?").run(SOURCE_ID);
    expect(repository.drift(WORKSPACE_ID, frozen.evidenceSetId).members[0]?.state).toBe(
      "SOURCE_MISSING",
    );
    expect(repository.getById(WORKSPACE_ID, frozen.evidenceSetId)).toEqual(frozen);
    db.close();
  });

  it("fails closed when exact indexed or RawArtifact lineage is missing", () => {
    const db = database();
    const repository = new SqliteEvidenceSetRegistryRepository(db);

    expect(() =>
      repository.create(
        input({
          stagingDocumentIds: ["std_missing"],
          idempotencyKey: "missing-indexed-lineage",
        }),
      ),
    ).toThrowError(/exact indexed evidence lineage/u);

    db.prepare("DELETE FROM raw_artifacts WHERE id = ?").run(RAW_1);
    expect(() => repository.create(input({ idempotencyKey: "missing-raw-lineage" }))).toThrowError(
      /missing RawArtifact/u,
    );
    db.close();
  });

  it("fails closed on cross-workspace selection injection", () => {
    const db = database();
    const repository = new SqliteEvidenceSetRegistryRepository(db);

    expect(() =>
      repository.create(
        input({
          workspaceId: OTHER_WORKSPACE_ID,
          idempotencyKey: "cross-workspace",
        }),
      ),
    ).toThrowError(/another Workspace/u);
    expect(repository.list(WORKSPACE_ID)).toHaveLength(0);
    db.close();
  });
});
