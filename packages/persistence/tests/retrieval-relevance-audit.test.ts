import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CanonicalMarkdownMetadataV1 } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, SqliteSourceRepository } from "../src/index";
import { SqliteRetrievalIndexRepository } from "../src/retrieval-index";
import {
  FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES,
  SqliteRetrievalRelevanceAuditRepository,
} from "../src/retrieval-relevance-audit";
import { listSourceCoverageTargets } from "../src/source-coverage-catalog";

const encoder = new TextEncoder();

function canonicalMarkdown(body: string): Uint8Array {
  return encoder.encode(`---\nmarkorbit:\n  schemaVersion: "1.0"\n---\n\n${body}\n`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createTmepSource(database: DatabaseSync) {
  return new SqliteSourceRepository(database).create({
    workspaceId: DEFAULT_WORKSPACE.id,
    name: "USPTO TMEP Current",
    slug: "uspto-tmep-current-m18",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    canonicalUri: "https://tmep.uspto.gov/RDMS/TMEP/current",
    entrypoints: [{ uri: "https://tmep.uspto.gov/RDMS/TMEP/current" }],
  });
}

function indexDocument(
  database: DatabaseSync,
  sourceId: string,
  body: string,
  title = "Current examination manual",
) {
  const markdown = canonicalMarkdown(body);
  const metadata: CanonicalMarkdownMetadataV1 = {
    schemaVersion: "1.0",
    objectType: "CANONICAL_MARKDOWN_METADATA",
    documentId: "doc-m18-tmep",
    workspaceId: DEFAULT_WORKSPACE.id,
    sourceId,
    sourceName: "USPTO TMEP Current",
    sourceCategory: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US"],
    languages: ["en-US"],
    rawArtifactId: "art_01H00000000000000000000001",
    logicalDocumentId: "doc-m18-tmep",
    artifactVersion: 1,
    artifactKind: "HTML",
    originalName: "tmep.html",
    canonicalUri: "https://tmep.uspto.gov/RDMS/TMEP/current",
    sourceUri: "https://tmep.uspto.gov/RDMS/TMEP/current",
    capturedAt: "2026-08-10T00:00:00.000Z",
    publishedAt: null,
    conversionRunId: "cvr_01H00000000000000000000001",
    converterId: "builtin-html-markdown",
    converterVersion: "1.0.0",
    inputSha256: "a".repeat(64),
  };
  return new SqliteRetrievalIndexRepository(database).indexVerified({
    metadata,
    stagingDocumentId: "std_01H00000000000000000000001",
    readyPackageId: "rdp_01H00000000000000000000001",
    title,
    targetPath: "US/USPTO/tmep-current.md",
    contentSha256: sha256(markdown),
    canonicalMarkdown: markdown,
  });
}

describe("retrieval relevance smoke audit", () => {
  it("configures an explicit deterministic probe for every active foundational target", () => {
    const targets = listSourceCoverageTargets({
      coverageTier: "FOUNDATIONAL",
      catalogState: "ACTIVE",
    });
    const targetIds = new Set(
      FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES.map((probe) => probe.targetId),
    );
    expect(targets).toHaveLength(549);
    expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(549);
    expect(new Set(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES.map((probe) => probe.id)).size).toBe(
      549,
    );
    expect(targets.every((target) => targetIds.has(target.id))).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "EU", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "SG", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "DE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "IN", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "FR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "BR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "MX", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "NZ", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "ES", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "IT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "CH", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "SE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "NO", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "DK", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "FI", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "AT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "IE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "PT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "PL", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "CZ", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "SK", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "HU", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "RO", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "BG", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "HR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "SI", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "GR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "CY", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "MT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "EE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "LV", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "LT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "TR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "RS", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "SA", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "AE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "QA", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "OM", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "BH", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "KW", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "JO", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "BD", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "NP", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "MY", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "PH", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "ID", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "VN", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "LK", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "TH", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "ZA", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "CL", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "CO", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "IS", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "MA", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "AR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "PE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "KE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "HK", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "IL", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "UA", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "TW", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "KZ", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "GE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "MD", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "AM", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "AZ", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "NG", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
  });

  it("marks a target READY when its curated query retrieves the expected current source", () => {
    const database = new DatabaseSync(":memory:");
    const source = createTmepSource(database);
    indexDocument(
      database,
      source.id,
      "# TMEP\n\nThe TMEP is the current Trademark Manual of Examining Procedure.",
      "TMEP current manual",
    );

    const audit = new SqliteRetrievalRelevanceAuditRepository(
      database,
      () => new Date("2026-08-10T00:05:00.000Z"),
    ).list({
      workspaceId: DEFAULT_WORKSPACE.id,
      targetId: "us-uspto-tmep-current",
      topK: 5,
    });

    expect(audit.scoringMode).toBe("SQLITE_FTS5_BM25_DETERMINISTIC_SMOKE");
    expect(audit.semanticJudgment).toBe(false);
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0].state).toBe("READY");
    expect(audit.items[0].gaps).toEqual([]);
    expect(audit.items[0].probes[0]).toMatchObject({
      probeId: "us-tmep-name",
      state: "READY",
      expectedSourceInGlobalTopK: true,
    });
    database.close();
  });

  it("blocks query readiness when the expected source cannot answer its own curated smoke query", () => {
    const database = new DatabaseSync(":memory:");
    const source = createTmepSource(database);
    indexDocument(
      database,
      source.id,
      "# Examination manual\n\nOfficial examination guidance for trademark applications.",
      "Current examination manual",
    );

    const audit = new SqliteRetrievalRelevanceAuditRepository(database).list({
      workspaceId: DEFAULT_WORKSPACE.id,
      targetId: "us-uspto-tmep-current",
    });

    expect(audit.items[0].state).toBe("BLOCKED");
    expect(audit.items[0].gaps).toContain("SOURCE_FILTERED_QUERY_MISS");
    expect(audit.items[0].probes[0].sourceFilteredHitCount).toBe(0);
    database.close();
  });

  it("keeps missing retrieval supply out of relevance scoring instead of duplicating the supply gate", () => {
    const database = new DatabaseSync(":memory:");
    createTmepSource(database);

    const audit = new SqliteRetrievalRelevanceAuditRepository(database).list({
      workspaceId: DEFAULT_WORKSPACE.id,
      targetId: "us-uspto-tmep-current",
    });

    expect(audit.items[0].state).toBe("NOT_APPLICABLE");
    expect(audit.items[0].gaps).toEqual(["NO_CURRENT_RETRIEVAL_DOCUMENT"]);
    expect(audit.items[0].probes).toEqual([]);
    database.close();
  });
});
