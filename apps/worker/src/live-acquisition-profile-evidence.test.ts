import { describe, expect, it } from "vitest";
import { buildLiveAcquisitionProfileEvidence } from "./live-acquisition-profile-evidence";

describe("live acquisition profile evidence", () => {
  it("represents a jurisdiction index without source-name logic", () => {
    const result = buildLiveAcquisitionProfileEvidence({
      profileId: "jurisdiction-index-html-v1",
      runId: "canary_country_index_1",
      sourceId: "source-family-fixture",
      startedAt: "2026-08-22T00:00:00.000Z",
      finishedAt: "2026-08-22T00:00:01.000Z",
      discovered: 1,
      attempted: 1,
      fetched: 1,
      accepted: 1,
      knownCorpus: 1,
      bytes: 1024,
      httpStatusCounts: { "200": 1 },
      surfaceOutcomes: [
        { surface: "COUNTRY_INDEX", discovered: 42, accepted: 42, knownCorpus: null },
      ],
      evidenceRefs: ["fixture:country-index"],
    });

    expect(result.profileId).toBe("jurisdiction-index-html-v1");
    expect(result.evidence.playbookId).toBe("official-jurisdiction-index");
    expect(result.evidence.outcome).toBe("SUCCESS");
    expect(result.evidence.surfaceOutcomes[0]).toMatchObject({
      surface: "COUNTRY_INDEX",
      discovered: 42,
      accepted: 42,
    });
    expect(result.fingerprint).toMatchObject({
      architecture: "STATIC_HTML",
      discoverySurfaces: ["COUNTRY_INDEX"],
      localeStructure: "JURISDICTION_GRAPH",
    });
  });

  it("turns a partial TOC canary into degraded evidence with exact failures", () => {
    const result = buildLiveAcquisitionProfileEvidence({
      profileId: "toc-graph-html-v1",
      runId: "canary_wipo_1",
      sourceId: "another-source-family-fixture",
      startedAt: "2026-08-22T00:00:00.000Z",
      finishedAt: "2026-08-22T00:00:02.000Z",
      discovered: 10,
      attempted: 10,
      fetched: 9,
      accepted: 9,
      knownCorpus: 10,
      bytes: 4096,
      httpStatusCounts: { "200": 9, "503": 1 },
      failureSignatures: [{ code: "HTTP_503", count: 1, sample: "seed unavailable" }],
      evidenceRefs: ["fixture:wipo-toc"],
    });

    expect(result.evidence.outcome).toBe("DEGRADED");
    expect(result.evidence.coverage.ratio).toBe(0.9);
    expect(result.evidence.failureSignatures).toEqual([
      { code: "HTTP_503", count: 1, sample: "seed unavailable" },
    ]);
    expect(result.evidence.boundaries.collectionAuthorityGranted).toBe(false);
  });
});
