import type {
  EvidenceMaturityStage,
  SourceIntelligenceAssessmentV2,
  SourceIntelligenceDimension,
  SourceSupplyHealthRecord,
} from "@markorbit/contracts";
import { SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import type { SourceSupplyHealthListResult } from "@markorbit/persistence/source-supply-health";
import { describe, expect, it } from "vitest";
import {
  enrichSourceSupplyHealthWithEvidenceMaturity,
  projectSourceSupplyEvidenceMaturity,
} from "../source-supply-evidence-maturity";

const observedAt = "2026-08-19T12:00:00.000Z";

function dimension(score: number | null = 50): SourceIntelligenceDimension {
  return { score, confidence: "MEDIUM", reasonCodes: [] };
}

function assessment(
  sourceId: string,
  stage: EvidenceMaturityStage,
  assessedAt: string,
  workspaceId = DEFAULT_WORKSPACE.id,
): SourceIntelligenceAssessmentV2 {
  return {
    protocolVersion: "2.0",
    objectType: "SOURCE_INTELLIGENCE_DUAL_AXIS_ASSESSMENT",
    id: `si2_${sourceId.replace(/[^a-f0-9]/giu, "a").toLowerCase().padEnd(24, "a").slice(0, 24)}`,
    workspaceId,
    sourceId,
    assessedAt,
    evaluator: { name: "test-source-intelligence", version: "1.0.0" },
    inputFingerprint: "a".repeat(64),
    sourceValuePriority: {
      score: 50,
      band: "MEDIUM",
      confidence: "MEDIUM",
      signals: { relevance: dimension(), authority: dimension() },
      reasonCodes: [],
    },
    evidenceMaturity: {
      score: stage === "UNOBSERVED" ? null : 50,
      stage,
      confidence: stage === "UNOBSERVED" ? "LOW" : "MEDIUM",
      signals: {
        freshness: dimension(stage === "UNOBSERVED" ? null : 50),
        evidenceability: dimension(stage === "UNOBSERVED" ? null : 50),
        novelty: dimension(stage === "UNOBSERVED" ? null : 50),
      },
      reasonCodes: [],
    },
    decisionContext: { observedAcquisitionCost: dimension() },
    compatibility: {
      projectionMode: "V1_READ_COMPATIBLE",
      legacyProtocolVersion: "1.0",
      legacyAssessmentId: `sia_${"b".repeat(24)}`,
      legacyPriorityScore: 50,
      legacyOperationalTier: "B",
      legacyRecommendedRescan: { mode: "MANUAL", reasonCodes: [] },
    },
    scheduling: { policyStatus: "NOT_AUTHORIZED_UNCALIBRATED" },
    reasonCodes: [],
    boundaries: {
      legalTruthVerified: false,
      authorityInferred: false,
      professionalQualityVerified: false,
      identityVerified: false,
      autoScheduleApplied: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
    },
  };
}

function supplyItem(
  targetId: string,
  sourceIds: string[],
  state: SourceSupplyHealthRecord["state"] = "DEGRADED",
): SourceSupplyHealthRecord {
  return {
    protocolVersion: SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
    objectType: "SOURCE_SUPPLY_HEALTH",
    targetId,
    workspaceId: DEFAULT_WORKSPACE.id,
    jurisdiction: "US",
    family: "PORTAL",
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    changeSensitivity: "HIGH",
    displayName: targetId,
    canonicalUri: "https://example.test/",
    registrationState: sourceIds.length > 0 ? "REGISTERED" : "UNREGISTERED",
    sourceIds,
    latestRun: null,
    acquisition: { artifactCount: 0, artifactKinds: [], latestArtifactAt: null },
    normalization: {
      stagingDocumentCount: 0,
      readyDocumentCount: 0,
      latestDocumentAt: null,
      latestStatus: null,
    },
    retrieval: {
      indexedDocumentCount: 0,
      currentDocumentCount: 0,
      currentArtifactVersion: null,
      currentChunkCount: 0,
      latestIndexedAt: null,
    },
    freshness: { state: "UNOBSERVED", lastObservedAt: null, ageHours: null, maxAgeHours: 48 },
    compatibility: {
      state: "UNOBSERVED",
      freshness: "UNOBSERVED",
      observedAt: null,
      ageHours: null,
      maxAgeHours: 48,
      primaryUri: null,
      renderJavascript: null,
      errorCode: null,
      errorMessage: null,
      baselineTargetId: null,
      baselineState: null,
    },
    operationalTopology: {
      projectionState: sourceIds.length > 0 ? "COMPLETE" : "UNREGISTERED",
      registeredSourceCount: sourceIds.length,
      projectedSourceCount: sourceIds.length,
      unprojectableSourceIds: [],
      sourceRegistryV2ObservedSourceCount: 0,
      sourceGraphObservedSourceCount: 0,
      explicitParentageObservedSourceCount: 0,
      explicitAuthorityObservedSourceCount: 0,
      entrypointCount: sourceIds.length,
      graphMappedEntrypointCount: 0,
      artifactLinkedEntrypointCount: 0,
      rawArtifactCount: 0,
      discoveryProvenanceCount: 0,
      relationshipCount: 0,
      familyRootSourceIds: [...sourceIds],
    },
    gaps: sourceIds.length > 0 ? ["NO_ACQUISITION_EVIDENCE"] : ["SOURCE_UNREGISTERED"],
    state,
    observedAt,
  };
}

describe("source supply evidence maturity", () => {
  it("aggregates persisted V2 evidence-maturity stages without inventing missing assessments", () => {
    const assessments = new Map([
      ["source-a", assessment("source-a", "CURRENT_TRACEABLE", "2026-08-19T10:00:00.000Z")],
      ["source-b", assessment("source-b", "CAPTURED", "2026-08-19T11:00:00.000Z")],
    ]);
    const projected = projectSourceSupplyEvidenceMaturity(
      DEFAULT_WORKSPACE.id,
      ["source-c", "source-a", "source-b", "source-a"],
      { latestV2: (sourceId) => assessments.get(sourceId) ?? null },
    );

    expect(projected).toEqual({
      coverageState: "PARTIAL",
      registeredSourceCount: 3,
      assessedSourceCount: 2,
      unassessedSourceIds: ["source-c"],
      latestAssessedAt: "2026-08-19T11:00:00.000Z",
      byStage: {
        UNOBSERVED: 0,
        CAPTURED: 1,
        TRACEABLE: 0,
        CURRENT_TRACEABLE: 1,
      },
    });
  });

  it("fails closed when an assessment does not match the requested source scope", () => {
    expect(() =>
      projectSourceSupplyEvidenceMaturity(DEFAULT_WORKSPACE.id, ["source-a"], {
        latestV2: () => assessment("source-other", "TRACEABLE", observedAt),
      }),
    ).toThrow("does not match");
  });

  it("enriches the read model without changing supply state, gaps, compatibility or topology", () => {
    const registered = supplyItem("target-registered", ["source-a"], "DEGRADED");
    const unregistered = supplyItem("target-unregistered", [], "BLOCKED");
    const originalRegistered = structuredClone(registered);
    const originalUnregistered = structuredClone(unregistered);
    const result: SourceSupplyHealthListResult = {
      protocolVersion: SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
      observedAt,
      items: [registered, unregistered],
      summary: {
        total: 2,
        byState: { READY: 0, DEGRADED: 1, BLOCKED: 1 },
        registered: 1,
        acquisitionObserved: 0,
        normalizedAvailable: 0,
        retrievalAvailable: 0,
        byFreshness: { FRESH: 0, STALE: 0, UNOBSERVED: 2 },
        byCompatibility: { PASS: 0, DEGRADED: 0, BLOCKED: 0, UNOBSERVED: 2 },
        byCompatibilityFreshness: { FRESH: 0, STALE: 0, UNOBSERVED: 2 },
        byTopologyProjection: { UNREGISTERED: 1, COMPLETE: 1, PARTIAL: 0, FAILED: 0 },
        topologySourceRegistryV2Observed: 0,
        topologySourceGraphObserved: 0,
        topologyExplicitParentageObserved: 0,
        topologyExplicitAuthorityObserved: 0,
        gapCounts: { NO_ACQUISITION_EVIDENCE: 1, SOURCE_UNREGISTERED: 1 },
      },
    };

    const enriched = enrichSourceSupplyHealthWithEvidenceMaturity(result, {
      latestV2: (sourceId) =>
        sourceId === "source-a" ? assessment(sourceId, "TRACEABLE", observedAt) : null,
    });

    expect(enriched.items[0]).toMatchObject({
      state: originalRegistered.state,
      gaps: originalRegistered.gaps,
      compatibility: originalRegistered.compatibility,
      operationalTopology: originalRegistered.operationalTopology,
      evidenceMaturity: {
        coverageState: "COMPLETE",
        registeredSourceCount: 1,
        assessedSourceCount: 1,
        unassessedSourceIds: [],
        byStage: {
          UNOBSERVED: 0,
          CAPTURED: 0,
          TRACEABLE: 1,
          CURRENT_TRACEABLE: 0,
        },
      },
    });
    expect(enriched.items[1]).toMatchObject({
      state: originalUnregistered.state,
      gaps: originalUnregistered.gaps,
      compatibility: originalUnregistered.compatibility,
      operationalTopology: originalUnregistered.operationalTopology,
      evidenceMaturity: {
        coverageState: "UNREGISTERED",
        registeredSourceCount: 0,
        assessedSourceCount: 0,
      },
    });
    expect(enriched.summary.byState).toEqual(result.summary.byState);
    expect(enriched.summary.gapCounts).toEqual(result.summary.gapCounts);
    expect(enriched.summary.byIntelligenceCoverage).toEqual({
      UNREGISTERED: 1,
      UNASSESSED: 0,
      PARTIAL: 0,
      COMPLETE: 1,
    });
  });
});
