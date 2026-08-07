import type { StagingDocumentDescriptor, StagingValidationOutcome } from "@markorbit/contracts";
import { RegistryConflictError, RegistryError, RegistryValidationError } from "./index";
import type {
  ConversionRuntimeTransitionRepository,
  ConversionRuntimeTransitionResult,
} from "./conversion-runtime-transitions";
import type { StagingContentRegistryRepository } from "./staging-content-registry";
import {
  BUILTIN_STAGING_VERIFIER,
  type StagingVerificationEvidence,
  type StagingVerificationRepository,
} from "./staging-verification";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export type FinalizeVerifiedStagingInput = {
  workspaceId: string;
  stagingDocumentId: string;
  idempotencyKey: string;
};

export type VerifiedStagingFinalizationResult = {
  decision: "COMPLETED" | "FAILED";
  verification: StagingVerificationEvidence;
  transition: ConversionRuntimeTransitionResult;
};

export interface VerifiedStagingFinalizationRepository {
  finalize(input: FinalizeVerifiedStagingInput): VerifiedStagingFinalizationResult;
}

function assertOutcomeBinding(
  descriptor: StagingDocumentDescriptor,
  evidence: StagingVerificationEvidence,
): void {
  if (
    evidence.verifier.verifierId !== BUILTIN_STAGING_VERIFIER.verifierId ||
    evidence.verifier.version !== BUILTIN_STAGING_VERIFIER.version
  ) {
    throw new RegistryConflictError(
      "STAGING_FINALIZATION_VERIFIER_MISMATCH",
      "Staging verification evidence was not produced by the locked built-in verifier",
    );
  }
  if (
    evidence.workspaceId !== descriptor.workspaceId ||
    evidence.stagingDocumentId !== descriptor.id ||
    evidence.conversionRunId !== descriptor.conversionRunId ||
    evidence.contentSha256 !== descriptor.contentHash.value
  ) {
    throw new RegistryConflictError(
      "STAGING_FINALIZATION_EVIDENCE_MISMATCH",
      "Staging verification evidence does not match the immutable descriptor",
    );
  }
  if (
    evidence.outcome !== descriptor.validation.outcome ||
    evidence.checks.length !== descriptor.validation.checks.length ||
    evidence.warnings.length !== descriptor.validation.warnings.length
  ) {
    throw new RegistryConflictError(
      "STAGING_FINALIZATION_DECISION_MISMATCH",
      "Staging verification decision does not match the registered descriptor",
    );
  }
}

function completionOutcome(outcome: StagingValidationOutcome): boolean {
  return outcome === "PASS" || outcome === "PASS_WITH_WARNINGS";
}

export class ControlPlaneVerifiedStagingFinalizer implements VerifiedStagingFinalizationRepository {
  constructor(
    private readonly staging: StagingContentRegistryRepository,
    private readonly verifications: StagingVerificationRepository,
    private readonly transitions: ConversionRuntimeTransitionRepository,
  ) {}

  finalize(input: FinalizeVerifiedStagingInput): VerifiedStagingFinalizationResult {
    if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
      throw new RegistryValidationError("Invalid Staging finalization idempotency key");
    }
    const record = this.staging.getDocument(input.stagingDocumentId, input.workspaceId);
    if (!record) {
      throw new RegistryError(
        "STAGING_DOCUMENT_NOT_FOUND",
        `Staging document ${input.stagingDocumentId} was not found`,
      );
    }
    const evidence = this.verifications.getByDocument(input.stagingDocumentId, input.workspaceId);
    if (!evidence) {
      throw new RegistryConflictError(
        "STAGING_FINALIZATION_VERIFICATION_MISSING",
        "Staging document has no persisted verification evidence",
      );
    }
    const descriptor = record.descriptor;
    assertOutcomeBinding(descriptor, evidence);

    const verifierId = BUILTIN_STAGING_VERIFIER.verifierId;
    const transitionKey = `${input.idempotencyKey}:${BUILTIN_STAGING_VERIFIER.version}`;

    if (descriptor.status === "READY" && completionOutcome(evidence.outcome)) {
      return {
        decision: "COMPLETED",
        verification: evidence,
        transition: this.transitions.completeVerification({
          workspaceId: input.workspaceId,
          verifierId,
          idempotencyKey: transitionKey,
          stagingDocument: descriptor,
        }),
      };
    }

    if (descriptor.status === "BLOCKED" && evidence.outcome === "FAIL") {
      return {
        decision: "FAILED",
        verification: evidence,
        transition: this.transitions.failVerification({
          workspaceId: input.workspaceId,
          verifierId,
          idempotencyKey: transitionKey,
          conversionRunId: descriptor.conversionRunId,
          code: "STAGING_VERIFICATION_FAILED",
          message: `Staging verification ${evidence.id} blocked the generated document`,
        }),
      };
    }

    throw new RegistryConflictError(
      "STAGING_FINALIZATION_STATUS_INVALID",
      "Finalization requires READY/PASS or BLOCKED/FAIL persisted verification evidence",
    );
  }
}
