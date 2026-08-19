import type { SourceCompatibilityObservation } from "@markorbit/contracts";

export const PRODUCTION_VALIDATION_FAILURE_CLASSES = [
  "NONE",
  "ADAPTER_REQUIRED",
  "AUTHORITY_BLOCKED",
  "EVIDENCE_INCOMPLETE",
  "RUNNER_FAILURE",
  "ACQUISITION_FAILURE",
] as const;

export type ProductionValidationFailureClass =
  (typeof PRODUCTION_VALIDATION_FAILURE_CLASSES)[number];

export type ProductionValidationFailureClassification = {
  class: ProductionValidationFailureClass;
  observed: boolean;
  sourceErrorCode: string | null;
  sourceErrorMessage: string | null;
  adapterRequired: boolean | null;
};

export function classifyProductionValidationFailure(
  observation: SourceCompatibilityObservation | undefined,
): ProductionValidationFailureClassification {
  if (!observation) {
    return {
      class: "NONE",
      observed: false,
      sourceErrorCode: null,
      sourceErrorMessage: null,
      adapterRequired: null,
    };
  }

  if (observation.state === "PASS") {
    return {
      class: "NONE",
      observed: true,
      sourceErrorCode: observation.errorCode ?? null,
      sourceErrorMessage: observation.errorMessage ?? null,
      adapterRequired: false,
    };
  }

  const errorCode = observation.errorCode ?? null;
  const errorMessage = observation.errorMessage ?? null;
  if (errorCode === "CANARY_ADAPTER_REQUIRED") {
    return {
      class: "ADAPTER_REQUIRED",
      observed: true,
      sourceErrorCode: errorCode,
      sourceErrorMessage: errorMessage,
      adapterRequired: true,
    };
  }
  if (errorCode === "CANARY_AUTHORITY_BASELINE_FAILED") {
    return {
      class: "AUTHORITY_BLOCKED",
      observed: true,
      sourceErrorCode: errorCode,
      sourceErrorMessage: errorMessage,
      adapterRequired: null,
    };
  }
  if (errorCode === "CANARY_EVIDENCE_INCOMPLETE") {
    return {
      class: "EVIDENCE_INCOMPLETE",
      observed: true,
      sourceErrorCode: errorCode,
      sourceErrorMessage: errorMessage,
      adapterRequired: null,
    };
  }
  if (errorCode === "CANARY_RUNNER_FAILED") {
    return {
      class: "RUNNER_FAILURE",
      observed: true,
      sourceErrorCode: errorCode,
      sourceErrorMessage: errorMessage,
      adapterRequired: null,
    };
  }
  return {
    class: "ACQUISITION_FAILURE",
    observed: true,
    sourceErrorCode: errorCode,
    sourceErrorMessage: errorMessage,
    adapterRequired: null,
  };
}
