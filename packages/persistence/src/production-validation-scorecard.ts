import type { SourceCompatibilityObservation } from "@markorbit/contracts";
import type { ProductionValidationManifest } from "./production-validation-discovery-intake";
import type { ProductionValidationExecutionStatus } from "./production-validation-execution-status";
import {
  classifyProductionValidationFailure,
  type ProductionValidationFailureClass,
} from "./production-validation-failure-taxonomy";
import type { ProductionValidationOnboardingStatus } from "./production-validation-onboarding-status";
import type { ProductionValidationPipelineStatus } from "./production-validation-pipeline-status";

export type ProductionValidationArtifactContractTelemetry = {
  observed: boolean;
  complete: boolean | null;
  expectedArtifactKinds: string[];
  missingExpectedArtifactKinds: string[];
};

export type ProductionValidationCompatibilityTelemetry = {
  state: "PASS" | "DEGRADED" | "BLOCKED" | "UNOBSERVED";
  observedAt: string | null;
  primaryUri: string | null;
  renderJavascriptObserved: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
  failureClass: ProductionValidationFailureClass;
  failureObserved: boolean;
  adapterRequiredObserved: boolean | null;
  artifactContract: ProductionValidationArtifactContractTelemetry;
};

export type ProductionValidationStructuredRemediationTelemetry = {
  state: "UNOBSERVED" | "UNPREPARED" | "PREPARED_AWAITING_WORKER_BINDING" | "INVALID";
  requiredArtifactKinds: string[];
  sourceId: string | null;
  planId: string | null;
  endpointBinding: string | null;
  workerEndpointBindingState: "UNOBSERVED" | "EXTERNAL_UNVERIFIED";
  collectionAuthorization: "NONE";
  automaticExecution: false;
};

export type ProductionValidationUnknownTelemetry = {
  httpFailureCount: null;
  wafDetected: null;
  renderingRequired: null;
  retryCount: null;
  manualInterventionRequired: null;
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
  structuredRemediation: ProductionValidationStructuredRemediationTelemetry;
  telemetry: ProductionValidationUnknownTelemetry;
};

export type ProductionValidationScorecard = {
  reportVersion: "1.2";
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
    failureObserved: number;
    adapterRequiredObserved: number;
    artifactContractObserved: number;
    artifactContractGapObserved: number;
    structuredRemediationObserved: number;
    structuredRemediationRequired: number;
    structuredRemediationPrepared: number;
    structuredRemediationInvalid: number;
    structuredRemediationAwaitingWorkerBinding: number;
    secondRunValidated: null;
    manualInterventionRequired: null;
  };
  results: ProductionValidationScorecardResult[];
};

export type ProductionValidationScorecardInput = {
  manifest: ProductionValidationManifest;
  onboarding: ProductionValidationOnboardingStatus;
  execution: ProductionValidationExecutionStatus;
  pipeline: ProductionValidationPipelineStatus;
  compatibility?: ReadonlyMap<string, SourceCompatibilityObservation>;
  structuredRemediation?: ReadonlyMap<string, ProductionValidationStructuredRemediationTelemetry>;
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function artifactContractTelemetry(
  observation: SourceCompatibilityObservation | undefined,
): ProductionValidationArtifactContractTelemetry {
  if (!observation) {
    return {
      observed: false,
      complete: null,
      expectedArtifactKinds: [],
      missingExpectedArtifactKinds: [],
    };
  }
  const details =
    observation.details &&
    typeof observation.details === "object" &&
    !Array.isArray(observation.details)
      ? (observation.details as Record<string, unknown>)
      : null;
  const expectedArtifactKinds = stringArray(details?.expectedArtifactKinds);
  const missingExpectedArtifactKinds = stringArray(details?.missingExpectedArtifactKinds);
  const observed =
    details !== null &&
    (Object.prototype.hasOwnProperty.call(details, "expectedArtifactKinds") ||
      Object.prototype.hasOwnProperty.call(details, "missingExpectedArtifactKinds"));
  return {
    observed,
    complete: observed ? missingExpectedArtifactKinds.length === 0 : null,
    expectedArtifactKinds,
    missingExpectedArtifactKinds,
  };
}

function compatibilityTelemetry(
  observation: SourceCompatibilityObservation | undefined,
): ProductionValidationCompatibilityTelemetry {
  const failure = classifyProductionValidationFailure(observation);
  const artifactContract = artifactContractTelemetry(observation);
  if (!observation) {
    return {
      state: "UNOBSERVED",
      observedAt: null,
      primaryUri: null,
      renderJavascriptObserved: null,
      errorCode: null,
      errorMessage: null,
      failureClass: failure.class,
      failureObserved: failure.observed,
      adapterRequiredObserved: failure.adapterRequired,
      artifactContract,
    };
  }
  return {
    state: observation.state,
    observedAt: observation.observedAt,
    primaryUri: observation.primaryUri,
    renderJavascriptObserved: observation.renderJavascript,
    errorCode: observation.errorCode ?? null,
    errorMessage: observation.errorMessage ?? null,
    failureClass: failure.class,
    failureObserved: failure.observed && failure.class !== "NONE",
    adapterRequiredObserved: failure.adapterRequired,
    artifactContract,
  };
}

function unobservedStructuredRemediation(): ProductionValidationStructuredRemediationTelemetry {
  return {
    state: "UNOBSERVED",
    requiredArtifactKinds: [],
    sourceId: null,
    planId: null,
    endpointBinding: null,
    workerEndpointBindingState: "UNOBSERVED",
    collectionAuthorization: "NONE",
    automaticExecution: false,
  };
}

function structuredRemediationTelemetry(
  value: ProductionValidationStructuredRemediationTelemetry | undefined,
): ProductionValidationStructuredRemediationTelemetry {
  if (!value) return unobservedStructuredRemediation();
  if (value.collectionAuthorization !== "NONE" || value.automaticExecution !== false) {
    throw new Error("Production validation structured remediation must remain non-authorizing");
  }
  if (value.state !== "UNOBSERVED" && value.workerEndpointBindingState !== "EXTERNAL_UNVERIFIED") {
    throw new Error("Observed structured remediation must keep Worker binding external-unverified");
  }
  if (value.state !== "UNOBSERVED" && value.requiredArtifactKinds.length === 0) {
    throw new Error("Observed structured remediation requires artifact kinds");
  }
  return {
    ...value,
    requiredArtifactKinds: [...value.requiredArtifactKinds],
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
      structuredRemediation: structuredRemediationTelemetry(
        input.structuredRemediation?.get(target.id),
      ),
      telemetry: {
        httpFailureCount: null,
        wafDetected: null,
        renderingRequired: null,
        retryCount: null,
        manualInterventionRequired: null,
        secondRunValidated: null,
      },
    };
  });

  return {
    reportVersion: "1.2",
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
      failureObserved: results.filter((result) => result.compatibility.failureObserved).length,
      adapterRequiredObserved: results.filter(
        (result) => result.compatibility.adapterRequiredObserved === true,
      ).length,
      artifactContractObserved: results.filter(
        (result) => result.compatibility.artifactContract.observed,
      ).length,
      artifactContractGapObserved: results.filter(
        (result) => result.compatibility.artifactContract.complete === false,
      ).length,
      structuredRemediationObserved: results.filter(
        (result) => result.structuredRemediation.state !== "UNOBSERVED",
      ).length,
      structuredRemediationRequired: results.filter(
        (result) =>
          result.structuredRemediation.state === "UNPREPARED" ||
          result.structuredRemediation.state === "PREPARED_AWAITING_WORKER_BINDING" ||
          result.structuredRemediation.state === "INVALID",
      ).length,
      structuredRemediationPrepared: results.filter(
        (result) => result.structuredRemediation.state === "PREPARED_AWAITING_WORKER_BINDING",
      ).length,
      structuredRemediationInvalid: results.filter(
        (result) => result.structuredRemediation.state === "INVALID",
      ).length,
      structuredRemediationAwaitingWorkerBinding: results.filter(
        (result) => result.structuredRemediation.state === "PREPARED_AWAITING_WORKER_BINDING",
      ).length,
      secondRunValidated: null,
      manualInterventionRequired: null,
    },
    results,
  };
}
