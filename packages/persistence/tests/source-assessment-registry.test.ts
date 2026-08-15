import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { SourceAssessmentRecord } from "../src/source-assessment-registry";
import { SqliteSourceAssessmentRepository } from "../src/source-assessment-registry";

function record(input: {
  id: string;
  sourceId: string;
  assessedAt: string;
  score: number;
}): SourceAssessmentRecord {
  return {
    id: input.id,
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sourceId: input.sourceId,
    assessedAt: input.assessedAt,
    request: {
      version: "1.0",
      capability: "source-assessment",
      locale: "zh-CN",
      objective: "Assess source acquisition value without granting collection authority.",
      source: {
        sourceId: input.sourceId,
        name: "Official source",
        sourceType: "WEB",
        category: "OFFICIAL_AUTHORITY",
        authorityLevel: "PRIMARY_OFFICIAL",
        status: "ACTIVE",
        entrypoints: ["https://example.test/"],
        jurisdictions: ["US"],
        languages: ["en"],
        tags: [],
        acquisition: {
          graphNodeCount: 10,
          contentNodeCount: 8,
          provenanceNodeCount: 6,
          rawArtifactCount: 4,
          distinctArtifactHashCount: 4,
          latestCapturedAt: "2026-08-15T00:00:00.000Z",
        },
      },
    },
    response: {
      version: "1.0",
      capability: "source-assessment",
      provider: { providerId: "fixture" },
      generatedAt: input.assessedAt,
      sourceValue: {
        score: input.score,
        priority: input.score >= 90 ? "VERY_HIGH" : "HIGH",
        confidence: "HIGH",
        summary: "Useful acquisition source.",
        reason: "The shared capability assessed the supplied source facts.",
        valuePoints: ["Authoritative public material"],
      },
      boundaries: {
        legalTruthVerified: false,
        professionalQualityVerified: false,
        grantsCollectionAuthority: false,
      },
    },
  };
}

describe("SqliteSourceAssessmentRepository", () => {
  it("retains source value history and returns one latest result per source", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteSourceAssessmentRepository(database);
    const firstSource = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const secondSource = "src_01ARZ3NDEKTSV4RRFFQ69G5FB0";
    const first = record({
      id: `sar_${"a".repeat(24)}`,
      sourceId: firstSource,
      assessedAt: "2026-08-14T00:00:00.000Z",
      score: 88,
    });
    const newer = record({
      id: `sar_${"b".repeat(24)}`,
      sourceId: firstSource,
      assessedAt: "2026-08-15T00:00:00.000Z",
      score: 96,
    });
    const other = record({
      id: `sar_${"c".repeat(24)}`,
      sourceId: secondSource,
      assessedAt: "2026-08-15T01:00:00.000Z",
      score: 93,
    });

    expect(repository.save(first)).toEqual(first);
    expect(repository.save(first)).toEqual(first);
    repository.save(newer);
    repository.save(other);

    expect(repository.latestForSource(firstSource)?.id).toBe(newer.id);
    expect(repository.listForSource(firstSource).map((item) => item.id)).toEqual([
      newer.id,
      first.id,
    ]);
    expect(
      repository
        .listLatestForSources([firstSource, secondSource])
        .map((item) => [item.sourceId, item.id]),
    ).toEqual([
      [firstSource, newer.id],
      [secondSource, other.id],
    ]);
    database.close();
  });
});
