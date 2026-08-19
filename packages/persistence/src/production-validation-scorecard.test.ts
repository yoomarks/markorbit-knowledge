import { describe, expect, it } from "vitest";
import type { ProductionValidationManifest } from "./production-validation-discovery-intake";
import type { ProductionValidationExecutionStatus } from "./production-validation-execution-status";
import type { ProductionValidationOnboardingStatus } from "./production-validation-onboarding-status";
import type { ProductionValidationPipelineStatus } from "./production-validation-pipeline-status";
import { buildProductionValidationScorecard } from "./production-validation-scorecard";

const manifest: ProductionValidationManifest = {
  manifestVersion: "1.0",
  waveId: "wave-1",
  governance: {
    collectionAuthorizationRequired: true,
    discoveryDoesNotActivateSource: true,
    noAutomaticProductionScheduling: true,
    realObservationsOnly: true,
  },
  targets: [
    {
      id: "target-a",
      jurisdiction: "US",
      authority: "Authority A",
      canonicalUri: "https://example.com/a",
      sourceClass: "OFFICIAL_AUTHORITY",
      priority: "P0",
      validationState: "PENDING_REAL_RUN",
    },
    {
      id: "target-b",
      jurisdiction: "JP",
      authority: "Authority B",
      canonicalUri: "https://example.com/b",
      sourceClass: "OFFICIAL_AUTHORITY",
      priority: "P1",
      validationState: "PENDING_REAL_RUN",
    },
  ],
};

const onboarding: ProductionValidationOnboardingStatus = {
  workspaceId: "workspace-1",
  waveId: "wave-1",
  items: [
    {
      targetId: "target-a",
      jurisdiction: "US",
      authority: "Authority A",
      canonicalUri: "https://example.com/a",
      state: "REGISTERED",
      sourceId: "source-a",
    },
    {
      targetId: "target-b",
      jurisdiction: "JP",
      authority: "Authority B",
      canonicalUri: "https://example.com/b",
      state: "IN_DISCOVERY",
      candidateId: "candidate-b",
    },
  ],
  summary: { NOT_QUEUED: 0, IN_DISCOVERY: 1, REGISTERED: 1, total: 2 },
};

const execution: ProductionValidationExecutionStatus = {
  workspaceId: "workspace-1",
  waveId: "wave-1",
  items: [
    {
      targetId: "target-a",
      jurisdiction: "US",
      authority: "Authority A",
      state: "RUN_OBSERVED",
      sourceId: "source-a",
      runCount: 2,
      completedRunCount: 1,
      failedRunCount: 1,
      secondRunObserved: true,
    },
    {
      targetId: "target-b",
      jurisdiction: "JP",
      authority: "Authority B",
      state: "NOT_REGISTERED",
      runCount: 0,
      completedRunCount: 0,
      failedRunCount: 0,
      secondRunObserved: false,
    },
  ],
  summary: {
    NOT_REGISTERED: 1,
    AWAITING_AUTHORIZATION: 0,
    RUN_OBSERVED: 1,
    total: 2,
    runsObserved: 2,
    completedRuns: 1,
    failedRuns: 1,
    targetsWithSecondRun: 1,
  },
};

const pipeline: ProductionValidationPipelineStatus = {
  workspaceId: "workspace-1",
  waveId: "wave-1",
  items: [
    {
      targetId: "target-a",
      jurisdiction: "US",
      authority: "Authority A",
      state: "KNOWLEDGE_VISIBLE",
      sourceId: "source-a",
      artifactCount: 3,
      artifactBytes: 1200,
      readyForConversionArtifactCount: 1,
      conversionRunCount: 2,
      completedConversionRunCount: 1,
      failedConversionRunCount: 1,
      stagingDocumentCount: 1,
      readyStagingDocumentCount: 1,
      blockedStagingDocumentCount: 0,
      knowledgeVisible: true,
    },
    {
      targetId: "target-b",
      jurisdiction: "JP",
      authority: "Authority B",
      state: "NOT_REGISTERED",
      artifactCount: 0,
      artifactBytes: 0,
      readyForConversionArtifactCount: 0,
      conversionRunCount: 0,
      completedConversionRunCount: 0,
      failedConversionRunCount: 0,
      stagingDocumentCount: 0,
      readyStagingDocumentCount: 0,
      blockedStagingDocumentCount: 0,
      knowledgeVisible: false,
    },
  ],
  summary: {
    NOT_REGISTERED: 1,
    AWAITING_ARTIFACT: 0,
    ARTIFACT_OBSERVED: 0,
    CONVERSION_OBSERVED: 0,
    KNOWLEDGE_VISIBLE: 1,
    total: 2,
    artifactsObserved: 3,
    artifactBytes: 1200,
    conversionRunsObserved: 2,
    completedConversionRuns: 1,
    failedConversionRuns: 1,
    stagingDocumentsObserved: 1,
    knowledgeVisibleTargets: 1,
  },
};

describe("buildProductionValidationScorecard", () => {
  it("aggregates only observed facts and leaves unsupported telemetry unknown", () => {
    const scorecard = buildProductionValidationScorecard(
      { manifest, onboarding, execution, pipeline },
      () => new Date("2026-08-19T06:00:00.000Z"),
    );

    expect(scorecard.summary).toEqual({
      targets: 2,
      onboarded: 1,
      collectionSucceeded: 1,
      knowledgeVisible: 1,
      secondRunObserved: 1,
      secondRunValidated: null,
      manualInterventionRequired: null,
      adapterRequired: null,
    });
    expect(scorecard.results[0]).toMatchObject({
      targetId: "target-a",
      registered: true,
      collectionSucceeded: true,
      secondRunObserved: true,
      artifactCount: 3,
      knowledgeVisible: true,
      telemetry: {
        httpFailureCount: null,
        wafDetected: null,
        renderingRequired: null,
        retryCount: null,
        manualInterventionRequired: null,
        adapterRequired: null,
        secondRunValidated: null,
      },
    });
    expect(scorecard.generatedAt).toBe("2026-08-19T06:00:00.000Z");
  });

  it("rejects mixed wave or workspace facts", () => {
    expect(() =>
      buildProductionValidationScorecard({
        manifest,
        onboarding,
        execution: { ...execution, waveId: "other-wave" },
        pipeline,
      }),
    ).toThrow("same waveId");

    expect(() =>
      buildProductionValidationScorecard({
        manifest,
        onboarding,
        execution,
        pipeline: { ...pipeline, workspaceId: "other-workspace" },
      }),
    ).toThrow("same workspaceId");
  });
});
