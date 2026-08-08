import { describe, expect, it } from "vitest";
import {
  evaluateSourceIntelligence,
  projectSourceIntelligenceV2,
} from "../src/source-intelligence-evaluator";

const base = {
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  profileId: "sgp_aaaaaaaaaaaaaaaaaaaaaaaa",
  assessedAt: "2026-08-08T08:00:00.000Z",
} as const;

function project(snapshot: Parameters<typeof evaluateSourceIntelligence>[0]["snapshot"]) {
  return projectSourceIntelligenceV2(evaluateSourceIntelligence({ ...base, snapshot }));
}

describe("Source Intelligence D2.5 calibration invariants", () => {
  it("distinguishes CAPTURED, TRACEABLE and CURRENT_TRACEABLE without changing the vocabulary", () => {
    const common = {
      sourceCategory: "LAW_FIRM" as const,
      sourceStatus: "ACTIVE" as const,
      explicitAuthorityLevel: "PROFESSIONAL" as const,
      graphNodeCount: 10,
      contentNodeCount: 8,
      relevantContentNodeCount: 6,
      retainedNodeCount: 0,
      rawArtifactCount: 1,
      distinctArtifactHashCount: 1,
      rawArtifactBytes: 65_536,
      previousGraphNodeCount: 10,
      previousDistinctArtifactHashCount: 1,
    };

    const captured = project({
      ...common,
      rawProvenanceNodeCount: 0,
      latestCapturedAt: "2026-08-08T07:00:00.000Z",
    });
    const traceable = project({
      ...common,
      rawProvenanceNodeCount: 2,
      latestCapturedAt: "2026-04-01T00:00:00.000Z",
    });
    const currentTraceable = project({
      ...common,
      rawProvenanceNodeCount: 2,
      latestCapturedAt: "2026-08-08T07:00:00.000Z",
    });

    expect(captured.evidenceMaturity.stage).toBe("CAPTURED");
    expect(traceable.evidenceMaturity.stage).toBe("TRACEABLE");
    expect(currentTraceable.evidenceMaturity.stage).toBe("CURRENT_TRACEABLE");
  });

  it("keeps Source Value stable when held graph relevance changes", () => {
    const common = {
      sourceCategory: "OFFICIAL_AUTHORITY" as const,
      sourceStatus: "ACTIVE" as const,
      explicitAuthorityLevel: "PRIMARY_OFFICIAL" as const,
      retainedNodeCount: 0,
      rawProvenanceNodeCount: 0,
      rawArtifactCount: 0,
      distinctArtifactHashCount: 0,
      rawArtifactBytes: 0,
    };

    const discoveryOnly = project({
      ...common,
      graphNodeCount: 40,
      contentNodeCount: 39,
      relevantContentNodeCount: 0,
    });
    const topicRichGraph = project({
      ...common,
      graphNodeCount: 80,
      contentNodeCount: 70,
      relevantContentNodeCount: 60,
    });

    expect(discoveryOnly.sourceValuePriority).toEqual(topicRichGraph.sourceValuePriority);
    expect(discoveryOnly.sourceValuePriority).toMatchObject({
      score: 94,
      band: "VERY_HIGH",
      signals: {
        relevance: {
          score: 85,
          reasonCodes: expect.arrayContaining(["SOURCE_VALUE_RELEVANCE_EXCLUDES_GRAPH_EVIDENCE"]),
        },
      },
    });
  });

  it("keeps acquisition cost outside both dual-axis scores", () => {
    const common = {
      sourceCategory: "OFFICIAL_AUTHORITY" as const,
      sourceStatus: "ACTIVE" as const,
      explicitAuthorityLevel: "PRIMARY_OFFICIAL" as const,
      graphNodeCount: 10,
      contentNodeCount: 8,
      relevantContentNodeCount: 7,
      retainedNodeCount: 0,
      rawProvenanceNodeCount: 8,
      rawArtifactCount: 2,
      distinctArtifactHashCount: 2,
      latestCapturedAt: "2026-08-08T07:00:00.000Z",
      previousGraphNodeCount: 10,
      previousDistinctArtifactHashCount: 2,
    };

    const lowFootprint = project({ ...common, rawArtifactBytes: 65_536 });
    const highFootprint = project({ ...common, rawArtifactBytes: 16_777_216 });

    expect(highFootprint.decisionContext.observedAcquisitionCost.score).not.toBe(
      lowFootprint.decisionContext.observedAcquisitionCost.score,
    );
    expect(highFootprint.sourceValuePriority).toEqual(lowFootprint.sourceValuePriority);
    expect(highFootprint.evidenceMaturity).toEqual(lowFootprint.evidenceMaturity);
  });

  it("keeps scheduler and authority boundaries closed throughout calibration projections", () => {
    const assessment = project({
      sourceCategory: "OFFICIAL_AUTHORITY",
      sourceStatus: "ACTIVE",
      explicitAuthorityLevel: "PRIMARY_OFFICIAL",
      graphNodeCount: 5,
      contentNodeCount: 4,
      relevantContentNodeCount: 4,
      retainedNodeCount: 0,
      rawProvenanceNodeCount: 0,
      rawArtifactCount: 0,
      distinctArtifactHashCount: 0,
      rawArtifactBytes: 0,
    });

    expect(assessment.sourceValuePriority.band).toBe("VERY_HIGH");
    expect(assessment.evidenceMaturity.stage).toBe("UNOBSERVED");
    expect(assessment.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
    expect(assessment.boundaries).toMatchObject({
      authorityInferred: false,
      legalTruthVerified: false,
      autoScheduleApplied: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
    });
  });
});
