import type { SourceCompatibilityObservation } from "@markorbit/contracts";
import type { ProductionValidationManifest } from "./production-validation-discovery-intake";
import type { ProductionValidationExecutionStatus } from "./production-validation-execution-status";
import type { ProductionValidationOnboardingStatus } from "./production-validation-onboarding-status";
import type { ProductionValidationPipelineStatus } from "./production-validation-pipeline-status";

export type ProductionValidationCompatibilityTelemetry = {
  state: "PASS" | "DEGRADED" | "BLOCKED" | "UNOBSERVED";
  observedAt: string | null;
  primaryUri: string | null;
  renderJavascriptObserved: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type ProductionValidationUnknownTelemetry = {
  httpFailureCount: null;
  wafDetected: null;
  renderingRequired: null;
  retryCount: null;
  manualInterventionRequired: null;
  adapterRequired: null;
  secondRunValidated: null;
};

export type ProductionValidationScorecardResult = {
  targetId: string;
  jurisdiction: string;
  authority: string;
  canonicalUri: string;
  onboardingState: ProductionValidationOnboardingStatus["items"][number]["state"];
  registered: boolean;
  sourceId?: string;
  executionState: ProductionValidationExecutionStatus["items"][number]["state"];
  runCount: number;
  completedRunCount: number;
  failedRunCount: number;
  collectionSucceeded: boolean;
  secondRunObserved: boolean;
  pipelineState: ProductionValidationPipelineStatus["items"][number]["state"];
  artifactCount: number;
  artifactBytes: number;
  conversionRunCount: number;
  stagingDocumentCount: number;
  knowledgeVisible: boolean;
  compatibility: ProductionValidationCompatibilityTelemetry;
  telemetry: ProductionValidationUnknownTelemetry;
};

export type ProductionValidationScorecard = {
  reportVersion: "1.0";
  waveId: string;
  workspaceId: string;
  generatedAt: string;
  summary: {
    targets: number;
    onboarded: number;
    collectionSucceeded: number;
    knowledgeVisible: number;
    secondRunObserved: number;
    compatibilityObserved: number;
    compatibilityPass: number;
    compatibilityDegraded: number;
    compatibilityBlocked: number;
    secondRunValidated: null;
    manualInterventionRequired: null;
    adapterRequired: null;
  };
  results: ProductionValidationScorecardResult[];
};

export type ProductionValidationScorecardInput = {
  manifest: ProductionValidationManifest;
  onboarding: ProductionValidationOnboardingStatus;
  execution: ProductionValidationExecutionStatus;
  pipeline: ProductionValidationPipelineStatus;
  compatibility?: ReadonlyMap<string, SourceCompatibilityObservation>;
};

function byTargetId<T extends { targetId: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.targetId, item]));
}

function assertAligned(input: ProductionValidationScorecardInput): void {
  const { manifest, onboarding, execution, pipeline } = input;
  if (
    onboarding.waveId !== manifest.waveId ||
    execution.waveId !== manifest.waveId ||
    pipeline.waveId !== manifest.waveId
  ) {
    throw new Error("Production validation scorecard inputs must use the same waveId");
  }
  if (
    onboarding.workspaceId !== execution.workspaceId ||
    onboarding.workspaceId !== pipeline.workspaceId
  ) {
    throw new Error("Production validation scorecard inputs must use the same workspaceId");
  }
}

function compatibilityTelemetry(
  observation: SourceCompatibilityObservation | undefined,
): ProductionValidationCompatibilityTelemetry {
  if (!observation) {
    return {
      state: "UNOBSERVED",
      observedAt: null,
      primaryUri: null,
      renderJavascriptObserved: null,
      errorCode: null,
      errorMessage: null,
    };
  }
  return {
    state: observation.state,
    observedAt: observation.observedAt,
    primaryUri: observation.primaryUri,
    renderJavascriptObserved: observation.renderJavascript,
    errorCode: observation.errorCode ?? null,
    errorMessage: observation.errorMessage ?? null,
  };
}

export function buildProductionValidationScorecard(
  input: ProductionValidationScorecardInput,
  clock: () => Date = () => new Date(),
): ProductionValidationScorecard {
  assertAligned(input);
  const onboardingByTarget = byTargetId(input.onboarding.items);
  const executionByTarget = byTargetId(input.execution.items);
  const pipelineByTarget = byTargetId(input.pipeline.items);

  const results = input.manifest.targets.map((target): ProductionValidationScorecardResult => {
    const onboarding = onboardingByTarget.get(target.id);
    const execution = executionByTarget.get(target.id);
    const pipeline = pipelineByTarget.get(target.id);
    if (!onboarding || !execution || !pipeline) {
      throw new Error(`Production validation scorecard is missing facts for target ${target.id}`);
    }

    return {
      targetId: target.id,
      jurisdiction: target.jurisdiction,
      authority: target.authority,
      canonicalUri: target.canonicalUri,
      onboardingState: onboarding.state,
      registered: onboarding.state === "REGISTERED",
      ...(onboarding.sourceId ? { sourceId: onboarding.sourceId } : {}),
      executionState: execution.state,
      runCount: execution.runCount,
      completedRunCount: execution.completedRunCount,
      failedRunCount: execution.failedRunCount,
      collectionSucceeded: execution.completedRunCount > 0,
      secondRunObserved: execution.secondRunObserved,
      pipelineState: pipeline.state,
      artifactCount: pipeline.artifactCount,
      artifactBytes: pipeline.artifactBytes,
      conversionRunCount: pipeline.conversionRunCount,
      stagingDocumentCount: pipeline.stagingDocumentCount,
      knowledgeVisible: pipeline.knowledgeVisible,
      compatibility: compatibilityTelemetry(input.compatibility?.get(target.id)),
      telemetry: {
        httpFailureCount: null,
        wafDetected: null,
        renderingRequired: null,
        retryCount: null,
        manualInterventionRequired: null,
        adapterRequired: null,
        secondRunValidated: null,
      },
    };
  });

  return {
    reportVersion: "1.0",
    waveId: input.manifest.waveId,
    workspaceId: input.onboarding.workspaceId,
    generatedAt: clock().toISOString(),
    summary: {
      targets: results.length,
      onboarded: results.filter((result) => result.registered).length,
      collectionSucceeded: results.filter((result) => result.collectionSucceeded).length,
      knowledgeVisible: results.filter((result) => result.knowledgeVisible).length,
      secondRunObserved: results.filter((result) => result.secondRunObserved).length,
      compatibilityObserved: results.filter((result) => result.compatibility.state !== "UNOBSERVED")
        .length,
      compatibilityPass: results.filter((result) => result.compatibility.state === "PASS").length,
      compatibilityDegraded: results.filter((result) => result.compatibility.state === "DEGRADED")
        .length,
      compatibilityBlocked: results.filter((result) => result.compatibility.state === "BLOCKED")
        .length,
      secondRunValidated: null,
      manualInterventionRequired: null,
      adapterRequired: null,
    },
    results,
  };
}
