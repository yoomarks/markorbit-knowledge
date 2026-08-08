import { createHash } from "node:crypto";
import type {
  ArtifactIngestionReceipt,
  ArtifactIngestionSession,
  ArtifactKind,
  ArtifactUploadDescriptor,
  ExecutionAttempt,
  ExecutionExecutor,
  ExecutionReceipt,
  Job,
  JobLease,
} from "@markorbit/contracts";

export type ArtifactBackedExecutionContext = {
  workerId: string;
  job: Job;
  lease: JobLease;
  leaseToken: string;
};

export type AcquiredCollectionArtifact = {
  artifactKind: ArtifactKind;
  mimeType: string;
  originalName: string;
  sourceUri: string;
  canonicalUri?: string;
  publishedAt?: string;
  content: Uint8Array;
};

export class CollectionAcquisitionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CollectionAcquisitionError";
  }
}

export interface CollectionArtifactAcquirer {
  readonly executor: ExecutionExecutor;
  acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]>;
}

export interface ArtifactBackedExecutionClient {
  start(
    context: ArtifactBackedExecutionContext,
    executor: ExecutionExecutor,
    idempotencyKey: string,
  ): Promise<ExecutionAttempt>;
  uploading(context: ArtifactBackedExecutionContext, idempotencyKey: string): Promise<void>;
  createArtifactSession(
    context: ArtifactBackedExecutionContext,
    descriptor: ArtifactUploadDescriptor,
    idempotencyKey: string,
  ): Promise<ArtifactIngestionSession>;
  uploadArtifactContent(
    context: ArtifactBackedExecutionContext,
    sessionId: string,
    content: Uint8Array,
  ): Promise<void>;
  finalizeArtifact(
    context: ArtifactBackedExecutionContext,
    sessionId: string,
  ): Promise<ArtifactIngestionReceipt>;
  verifying(context: ArtifactBackedExecutionContext, idempotencyKey: string): Promise<void>;
  complete(
    context: ArtifactBackedExecutionContext,
    receipt: ExecutionReceipt,
    idempotencyKey: string,
  ): Promise<void>;
  fail(
    context: ArtifactBackedExecutionContext,
    failure: { code: string; message: string; retryable: boolean },
    idempotencyKey: string,
  ): Promise<void>;
}

function digest(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function failureFrom(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof CollectionAcquisitionError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  return {
    code: "PRODUCTION_COLLECTION_FAILED",
    message: error instanceof Error ? error.message : "Production collection failed",
    retryable: false,
  };
}

function assertArtifactAllowed(job: Job, artifact: AcquiredCollectionArtifact): void {
  if (!job.planSnapshot.output.artifactKinds.includes(artifact.artifactKind)) {
    throw new CollectionAcquisitionError(
      "ARTIFACT_KIND_NOT_AUTHORIZED",
      `Artifact kind ${artifact.artifactKind} is outside the immutable CollectionPlan snapshot`,
      false,
    );
  }
  if (artifact.content.byteLength <= 0) {
    throw new CollectionAcquisitionError(
      "EMPTY_ARTIFACT_NOT_ALLOWED",
      "Artifact-backed collection cannot finalize empty content",
      false,
    );
  }
}

/**
 * Executes an already-claimed Job behind the Worker lease boundary.
 *
 * This class deliberately does not claim Jobs and does not know how a Connector
 * acquires content. Lease ownership stays in Worker Protocol v1, while a reviewed
 * Connector implementation is injected through CollectionArtifactAcquirer.
 */
export class ArtifactBackedCollectionExecutor {
  constructor(
    private readonly acquirer: CollectionArtifactAcquirer,
    private readonly client: ArtifactBackedExecutionClient,
  ) {}

  async execute(context: ArtifactBackedExecutionContext): Promise<ExecutionReceipt | null> {
    if (!context.leaseToken) {
      throw new CollectionAcquisitionError(
        "LEASE_TOKEN_REQUIRED",
        "Artifact-backed execution requires a Worker lease token",
        false,
      );
    }

    const prefix = `artifact-${context.lease.id}`;
    let started = false;
    try {
      await this.client.start(context, this.acquirer.executor, `${prefix}-start`);
      started = true;

      const acquired = await this.acquirer.acquire(context);
      if (acquired.length === 0) {
        throw new CollectionAcquisitionError(
          "NO_ARTIFACTS_PRODUCED",
          "Connector completed without producing artifact evidence",
          false,
        );
      }
      acquired.forEach((artifact) => assertArtifactAllowed(context.job, artifact));

      await this.client.uploading(context, `${prefix}-uploading`);
      const receipts: ArtifactIngestionReceipt[] = [];
      let bytesPrepared = 0;

      for (const [index, artifact] of acquired.entries()) {
        const descriptor: ArtifactUploadDescriptor = {
          artifactKind: artifact.artifactKind,
          mimeType: artifact.mimeType,
          originalName: artifact.originalName,
          expectedSizeBytes: artifact.content.byteLength,
          expectedSha256: digest(artifact.content),
          sourceUri: artifact.sourceUri,
          ...(artifact.canonicalUri ? { canonicalUri: artifact.canonicalUri } : {}),
          ...(artifact.publishedAt ? { publishedAt: artifact.publishedAt } : {}),
        };
        const session = await this.client.createArtifactSession(
          context,
          descriptor,
          `${prefix}-artifact-${index + 1}`,
        );
        await this.client.uploadArtifactContent(context, session.id, artifact.content);
        receipts.push(await this.client.finalizeArtifact(context, session.id));
        bytesPrepared += artifact.content.byteLength;
      }

      await this.client.verifying(context, `${prefix}-verifying`);
      const receipt: ExecutionReceipt = {
        executor: this.acquirer.executor,
        outputKinds: [...new Set(acquired.map((artifact) => artifact.artifactKind))],
        itemsObserved: acquired.length,
        bytesPrepared,
        metadataOnly: false,
        artifactReceiptIds: receipts.map((item) => item.id),
        summary: `Artifact-backed collection finalized ${receipts.length} immutable artifact receipt(s).`,
      };
      await this.client.complete(context, receipt, `${prefix}-complete`);
      return receipt;
    } catch (error) {
      if (started) {
        const failure = failureFrom(error);
        try {
          await this.client.fail(context, failure, `${prefix}-fail`);
        } catch {
          // Preserve the original execution error. The control plane remains the
          // authority for terminal-state reconciliation if failure reporting itself fails.
        }
      }
      throw error;
    }
  }
}
