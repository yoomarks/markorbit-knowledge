import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, SqliteSourceRepository, openRegistryDatabase } from "../src/index";
import {
  SqliteSourceSupplyHealthRepository,
  deriveSourceSupplyFreshness,
  deriveSourceSupplyGaps,
  deriveSourceSupplyState,
} from "../src/source-supply-health";

const workspaceId = DEFAULT_WORKSPACE.id;
const fixedNow = new Date("2026-08-09T12:00:00Z");

function createSource(database: DatabaseSync, canonicalUri = "https://www.uspto.gov/trademarks") {
  return new SqliteSourceRepository(database, () => fixedNow).create({
    workspaceId,
    name: "USPTO Trademarks",
    slug: `health-uspto-${Math.random().toString(36).slice(2)}`,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: { renderJavascript: false, maxDepth: 0 },
    canonicalUri,
    entrypoints: [{ uri: canonicalUri }],
    tags: ["source-coverage", "foundational"],
  });
}

function seedReadyPipeline(database: DatabaseSync, sourceId: string): void {
  const capturedAt = "2026-08-09T11:00:00Z";
  const digest = "a".repeat(64);
  database.exec("PRAGMA foreign_keys = OFF;");
  database
    .prepare(
      `INSERT INTO raw_artifacts (
         id, workspace_id, source_id, run_id, job_id, job_attempt, execution_attempt_id,
         session_id, receipt_id, content_digest, artifact_kind, mime_type, status,
         canonical_uri, document_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "art_health0000000000000000000001",
      workspaceId,
      sourceId,
      "run_health0000000000000000000001",
      "job_health0000000000000000000001",
      1,
      "exa_health0000000000000000000001",
      "ing_health0000000000000000000001",
      "air_health0000000000000000000001",
      digest,
      "HTML",
      "text/html",
      "REGISTERED",
      "https://www.uspto.gov/trademarks",
      "{}",
      capturedAt,
    );
  database
    .prepare(
      `INSERT INTO staging_documents (
         id, workspace_id, source_id, raw_artifact_id, conversion_run_id, target_path,
         content_sha256, size_bytes, status, document_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "std_health0000000000000000000001",
      workspaceId,
      sourceId,
      "art_health0000000000000000000001",
      "cvr_health0000000000000000000001",
      "US/USPTO/Trademarks.md",
      digest,
      1234,
      "READY",
      "{}",
      capturedAt,
      capturedAt,
    );
  database
    .prepare(
      `INSERT INTO retrieval_documents (
         staging_document_id, workspace_id, document_id, source_id, ready_package_id,
         raw_artifact_id, logical_document_id, artifact_version, title, target_path,
         canonical_uri, source_uri, source_name, source_category, authority_level,
         jurisdictions_json, languages_json, captured_at, published_at, content_sha256,
         keywords_json, chunk_count, indexed_at, is_current
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "std_health0000000000000000000001",
      workspaceId,
      "doc_health_uspto_trademarks",
      sourceId,
      "rdy_health0000000000000000000001",
      "art_health0000000000000000000001",
      null,
      3,
      "USPTO Trademarks",
      "US/USPTO/Trademarks.md",
      "https://www.uspto.gov/trademarks",
      "https://www.uspto.gov/trademarks",
      "USPTO Trademarks",
      "OFFICIAL_AUTHORITY",
      "PRIMARY_OFFICIAL",
      JSON.stringify(["US"]),
      JSON.stringify(["en-US"]),
      capturedAt,
      null,
      digest,
      JSON.stringify(["trademark", "uspto"]),
      4,
      capturedAt,
      1,
    );
  database.exec("PRAGMA foreign_keys = ON;");
}

describe("Source Supply Health", () => {
  it("reports registered sources without pipeline evidence as blocked", () => {
    const database = openRegistryDatabase(":memory:");
    createSource(database);
    const repository = new SqliteSourceSupplyHealthRepository(database, () => fixedNow);
    const result = repository.list({
      workspaceId,
      jurisdiction: "US",
      coverageTier: "FOUNDATIONAL",
      targetId: "us-uspto-trademarks-root",
    });

    expect(result.items).toHaveLength(1);
    const [item] = result.items;
    expect(item.registrationState).toBe("REGISTERED");
    expect(item.state).toBe("BLOCKED");
    expect(item.acquisition.artifactCount).toBe(0);
    expect(item.freshness.state).toBe("UNOBSERVED");
    expect(item.gaps).toEqual(
      expect.arrayContaining([
        "NO_ACQUISITION_EVIDENCE",
        "NO_NORMALIZED_DOCUMENT",
        "NO_RETRIEVAL_DOCUMENT",
      ]),
    );
    database.close();
  });

  it("reports a fully evidenced current source as ready", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteSourceSupplyHealthRepository(database, () => fixedNow);
    const source = createSource(database);
    seedReadyPipeline(database, source.id);

    const result = repository.list({
      workspaceId,
      jurisdiction: "US",
      coverageTier: "FOUNDATIONAL",
      targetId: "us-uspto-trademarks-root",
    });
    const [item] = result.items;

    expect(item.state).toBe("READY");
    expect(item.gaps).toEqual([]);
    expect(item.acquisition).toMatchObject({ artifactCount: 1, artifactKinds: ["HTML"] });
    expect(item.normalization).toMatchObject({ stagingDocumentCount: 1, readyDocumentCount: 1 });
    expect(item.retrieval).toMatchObject({
      indexedDocumentCount: 1,
      currentDocumentCount: 1,
      currentArtifactVersion: 3,
      currentChunkCount: 4,
    });
    expect(item.freshness).toMatchObject({ state: "FRESH", ageHours: 1, maxAgeHours: 48 });
    expect(result.summary.byState.READY).toBe(1);
    database.close();
  });

  it("keeps unregistered coverage distinct from low-quality evidence", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteSourceSupplyHealthRepository(database, () => fixedNow);
    const result = repository.list({
      workspaceId,
      jurisdiction: "US",
      coverageTier: "FOUNDATIONAL",
      targetId: "us-uspto-tmep-current",
    });
    const [item] = result.items;
    expect(item.registrationState).toBe("UNREGISTERED");
    expect(item.state).toBe("BLOCKED");
    expect(item.gaps).toContain("SOURCE_UNREGISTERED");
    expect(item.gaps).not.toContain("NO_ACQUISITION_EVIDENCE");
    database.close();
  });

  it("derives freshness and degraded gaps without authorizing collection", () => {
    const freshness = deriveSourceSupplyFreshness(
      "2026-08-06T00:00:00Z",
      "HIGH",
      fixedNow,
    );
    expect(freshness).toMatchObject({ state: "STALE", maxAgeHours: 48 });

    const acquisition = {
      artifactCount: 2,
      artifactKinds: ["HTML"] as const,
      latestArtifactAt: freshness.lastObservedAt,
    };
    const gaps = deriveSourceSupplyGaps({
      registered: true,
      latestRun: null,
      acquisition: { ...acquisition, artifactKinds: [...acquisition.artifactKinds] },
      normalization: {
        stagingDocumentCount: 1,
        readyDocumentCount: 1,
        latestDocumentAt: "2026-08-06T00:00:00Z",
        latestStatus: "READY",
      },
      retrieval: {
        indexedDocumentCount: 1,
        currentDocumentCount: 1,
        currentArtifactVersion: 1,
        currentChunkCount: 2,
        latestIndexedAt: "2026-08-06T00:00:00Z",
      },
      freshness,
    });
    expect(gaps).toEqual(["STALE_ACQUISITION"]);
    expect(deriveSourceSupplyState(true, { ...acquisition, artifactKinds: ["HTML"] }, gaps)).toBe(
      "DEGRADED",
    );
  });
});
