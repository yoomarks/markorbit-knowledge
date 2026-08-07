import {
  type ConversionClaimRequest,
  type ConversionClaimResult,
  type StagingValidationOutcome,
} from "@markorbit/contracts";
import {
  FixtureTextMarkdownExecutor,
  type FixtureConversionContext,
  type FixtureConversionRuntimeClient,
  type FixtureRawArtifactReader,
  type FixtureStagingUploader,
  type FixtureUploadEvidence,
} from "./conversion-fixture";

const PIPELINE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export type ControlledFixturePipelineInput = {
  claimRequest: ConversionClaimRequest;
  executionKey: string;
};

export type ControlledFixturePipelineIngestInput = {
  context: FixtureConversionContext;
  evidence: FixtureUploadEvidence;
  markdown: Uint8Array;
  idempotencyKey: string;
};

export type ControlledFixturePipelineVerificationResult = {
  stagingDocumentId: string;
  status: "READY" | "BLOCKED";
  outcome: StagingValidationOutcome;
  replayed: boolean;
};

export type ControlledFixturePipelineFinalizationResult = {
  conversionRunId: string;
  decision: "COMPLETED" | "FAILED";
  replayed: boolean;
};

export interface ControlledFixturePipelineControlPlane {
  claim(
    request: ConversionClaimRequest,
  ): Promise<{ result: ConversionClaimResult; replayed: boolean }>;
  sourceIdForRun(workspaceId: string, conversionRunId: string): Promise<string>;
  ingestGenerated(
    input: ControlledFixturePipelineIngestInput,
  ): Promise<{ stagingDocumentId: string; status: "GENERATED"; replayed: boolean }>;
  verifyGenerated(input: {
    workspaceId: string;
    stagingDocumentId: string;
    idempotencyKey: string;
  }): Promise<ControlledFixturePipelineVerificationResult>;
  finalizeVerified(input: {
    workspaceId: string;
    stagingDocumentId: string;
    idempotencyKey: string;
  }): Promise<ControlledFixturePipelineFinalizationResult>;
}

export type ControlledFixturePipelineResult =
  | {
      status: "NO_COMPATIBLE_WORK";
      claim: ConversionClaimResult;
      claimReplayed: boolean;
    }
  | {
      status: "WORKER_FAILED";
      claim: ConversionClaimResult;
      claimReplayed: boolean;
      conversionRunId: string;
    }
  | {
      status: "COMPLETED" | "FAILED";
      claim: ConversionClaimResult;
      claimReplayed: boolean;
      conversionRunId: string;
      stagingDocumentId: string;
      verificationOutcome: StagingValidationOutcome;
      finalizationReplayed: boolean;
    };

function assertClaimed(result: ConversionClaimResult): asserts result is ConversionClaimResult & {
  result: "CLAIMED";
  lease: NonNullable<ConversionClaimResult["lease"]>;
  executionSummary: NonNullable<ConversionClaimResult["executionSummary"]>;
  converter: NonNullable<ConversionClaimResult["converter"]>;
  rawArtifactReadGrant: NonNullable<ConversionClaimResult["rawArtifactReadGrant"]>;
  stagingOutputUploadGrant: NonNullable<ConversionClaimResult["stagingOutputUploadGrant"]>;
} {
  if (
    result.result !== "CLAIMED" ||
    !result.lease ||
    !result.executionSummary ||
    !result.converter ||
    !result.rawArtifactReadGrant ||
    !result.stagingOutputUploadGrant
  ) {
    throw new Error("CONTROLLED_FIXTURE_CLAIM_INCOMPLETE");
  }
}

function assertVerificationDecision(
  verification: ControlledFixturePipelineVerificationResult,
): void {
  const completion =
    verification.status === "READY" &&
    (verification.outcome === "PASS" || verification.outcome === "PASS_WITH_WARNINGS");
  const failure = verification.status === "BLOCKED" && verification.outcome === "FAIL";
  if (!completion && !failure) {
    throw new Error("CONTROLLED_FIXTURE_VERIFICATION_DECISION_INVALID");
  }
}

export class ControlledFixturePipeline {
  constructor(
    private readonly controlPlane: ControlledFixturePipelineControlPlane,
    private readonly reader: FixtureRawArtifactReader,
    private readonly uploader: FixtureStagingUploader,
    private readonly runtimeClient: FixtureConversionRuntimeClient,
    private readonly executor: FixtureTextMarkdownExecutor = new FixtureTextMarkdownExecutor(),
  ) {}

  async execute(input: ControlledFixturePipelineInput): Promise<ControlledFixturePipelineResult> {
    if (!PIPELINE_KEY.test(input.executionKey)) {
      throw new Error("CONTROLLED_FIXTURE_PIPELINE_KEY_INVALID");
    }

    const claimed = await this.controlPlane.claim(input.claimRequest);
    if (claimed.result.result === "NO_COMPATIBLE_WORK") {
      return {
        status: "NO_COMPATIBLE_WORK",
        claim: claimed.result,
        claimReplayed: claimed.replayed,
      };
    }

    assertClaimed(claimed.result);
    const summary = claimed.result.executionSummary;
    const sourceId = await this.controlPlane.sourceIdForRun(
      claimed.result.workspaceId,
      summary.conversionRunId,
    );
    const context: FixtureConversionContext = {
      workspaceId: claimed.result.workspaceId,
      workerId: claimed.result.workerId,
      conversionRunId: summary.conversionRunId,
      conversionAttemptId: claimed.result.lease.conversionAttemptId,
      rawArtifactId: summary.rawArtifactId,
      sourceId,
      lease: claimed.result.lease,
      converter: claimed.result.converter,
      inputGrant: claimed.result.rawArtifactReadGrant,
      outputGrant: claimed.result.stagingOutputUploadGrant,
    };

    const execution = await this.executor.execute(
      context,
      this.reader,
      this.uploader,
      this.runtimeClient,
    );
    if (!execution) {
      return {
        status: "WORKER_FAILED",
        claim: claimed.result,
        claimReplayed: claimed.replayed,
        conversionRunId: summary.conversionRunId,
      };
    }

    const ingested = await this.controlPlane.ingestGenerated({
      context,
      evidence: execution.evidence,
      markdown: execution.markdown,
      idempotencyKey: `${input.executionKey}:ingest`,
    });
    if (ingested.status !== "GENERATED") {
      throw new Error("CONTROLLED_FIXTURE_INGEST_STATUS_INVALID");
    }

    const verification = await this.controlPlane.verifyGenerated({
      workspaceId: context.workspaceId,
      stagingDocumentId: ingested.stagingDocumentId,
      idempotencyKey: `${input.executionKey}:verify`,
    });
    if (verification.stagingDocumentId !== ingested.stagingDocumentId) {
      throw new Error("CONTROLLED_FIXTURE_VERIFICATION_DOCUMENT_MISMATCH");
    }
    assertVerificationDecision(verification);

    const finalization = await this.controlPlane.finalizeVerified({
      workspaceId: context.workspaceId,
      stagingDocumentId: ingested.stagingDocumentId,
      idempotencyKey: `${input.executionKey}:finalize`,
    });
    if (finalization.conversionRunId !== context.conversionRunId) {
      throw new Error("CONTROLLED_FIXTURE_FINALIZATION_RUN_MISMATCH");
    }
    const expectedDecision = verification.status === "READY" ? "COMPLETED" : "FAILED";
    if (finalization.decision !== expectedDecision) {
      throw new Error("CONTROLLED_FIXTURE_FINALIZATION_DECISION_MISMATCH");
    }

    return {
      status: finalization.decision,
      claim: claimed.result,
      claimReplayed: claimed.replayed,
      conversionRunId: context.conversionRunId,
      stagingDocumentId: ingested.stagingDocumentId,
      verificationOutcome: verification.outcome,
      finalizationReplayed: finalization.replayed,
    };
  }
}
