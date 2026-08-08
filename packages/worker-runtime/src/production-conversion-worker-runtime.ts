import {
  CONVERSION_RUNTIME_VERSION,
  type ConversionClaimRequest,
  type ConversionClaimResult,
} from "@markorbit/contracts";
import {
  HttpProductionConversionClient,
  productionRuntimeId,
} from "./http-production-conversion-client";
import {
  PRODUCTION_MARKDOWN_STAGING_CONVERTER,
  ProductionMarkdownStagingExecutor,
  type ProductionMarkdownStagingContext,
  type ProductionMarkdownStagingResult,
} from "./production-markdown-staging";

export type ProductionConversionWorkerRuntimeOptions = {
  capabilityRevision?: number;
  requestedLeaseDurationSeconds?: number;
  onResult?: (result: ProductionMarkdownStagingResult | null) => void;
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
    throw new Error("PRODUCTION_CONVERSION_CLAIM_INCOMPLETE");
  }
}

export class ProductionConversionWorkerRuntime {
  private readonly capabilityRevision: number;
  private readonly requestedLeaseDurationSeconds: number;
  private readonly executor = new ProductionMarkdownStagingExecutor();

  constructor(
    private readonly client: HttpProductionConversionClient,
    private readonly workspaceId: string,
    private readonly options: ProductionConversionWorkerRuntimeOptions = {},
  ) {
    this.capabilityRevision = options.capabilityRevision ?? 1;
    this.requestedLeaseDurationSeconds = options.requestedLeaseDurationSeconds ?? 300;
    if (!Number.isInteger(this.capabilityRevision) || this.capabilityRevision <= 0) {
      throw new Error("PRODUCTION_CONVERSION_CAPABILITY_REVISION_INVALID");
    }
    if (
      !Number.isInteger(this.requestedLeaseDurationSeconds) ||
      this.requestedLeaseDurationSeconds < 30 ||
      this.requestedLeaseDurationSeconds > 3600
    ) {
      throw new Error("PRODUCTION_CONVERSION_LEASE_DURATION_INVALID");
    }
  }

  async runOnce(): Promise<boolean> {
    const request = this.claimRequest();
    const claimed = await this.client.claim(request);
    if (claimed.result.result === "NO_COMPATIBLE_WORK") return false;
    assertClaimed(claimed.result);

    const summary = claimed.result.executionSummary;
    if (
      claimed.result.workspaceId !== this.workspaceId ||
      claimed.result.workerId !== this.client.workerId ||
      claimed.result.converter.converterId !== PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId ||
      claimed.result.converter.version !== PRODUCTION_MARKDOWN_STAGING_CONVERTER.version
    ) {
      throw new Error("PRODUCTION_CONVERSION_CLAIM_SCOPE_MISMATCH");
    }
    const runContext = await this.client.runContext(summary.conversionRunId);
    if (
      runContext.workspaceId !== this.workspaceId ||
      runContext.conversionRunId !== summary.conversionRunId ||
      runContext.rawArtifactId !== summary.rawArtifactId
    ) {
      throw new Error("PRODUCTION_CONVERSION_RUN_CONTEXT_MISMATCH");
    }

    const context: ProductionMarkdownStagingContext = {
      workspaceId: this.workspaceId,
      workerId: this.client.workerId,
      conversionRunId: summary.conversionRunId,
      conversionAttemptId: claimed.result.lease.conversionAttemptId,
      rawArtifactId: summary.rawArtifactId,
      sourceId: runContext.sourceId,
      lease: claimed.result.lease,
      converter: claimed.result.converter,
      inputGrant: claimed.result.rawArtifactReadGrant,
      outputGrant: claimed.result.stagingOutputUploadGrant,
    };
    const result = await this.executor.execute(context, this.client, this.client, this.client);
    this.options.onResult?.(result);
    return true;
  }

  private claimRequest(): ConversionClaimRequest {
    const id = productionRuntimeId("ccr");
    return {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_CLAIM_REQUEST",
      id,
      workspaceId: this.workspaceId,
      workerId: this.client.workerId,
      workerCredentialId: `worker-ref:${this.client.workerId}`,
      capabilityRevision: this.capabilityRevision,
      supportedConverters: [
        {
          converterId: PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId,
          versions: [PRODUCTION_MARKDOWN_STAGING_CONVERTER.version],
        },
      ],
      maxAcceptedWork: 1,
      idempotencyKey: `conversion-claim:${id}`,
      requestedLeaseDurationSeconds: this.requestedLeaseDurationSeconds,
    };
  }
}
