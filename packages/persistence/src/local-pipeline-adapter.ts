import { createHash } from "node:crypto";
import type {
  ConversionClaimRequest,
  RawArtifactReadGrant,
  StagingOutputUploadGrant,
  StagingValidationOutcome,
} from "@markorbit/contracts";
import type { ConversionRunLedgerRepository } from "./conversion-run-ledger";
import type { ConversionRuntimePersistenceRepository } from "./conversion-runtime-persistence";
import type { StagingContentRegistryRepository } from "./staging-content-registry";
import type { StagingVerificationRepository } from "./staging-verification";
import type { VerifiedStagingFinalizationRepository } from "./verified-staging-finalization";

export type LocalFixtureContext = {
  workspaceId: string;
  workerId: string;
  conversionRunId: string;
  conversionAttemptId: string;
  rawArtifactId: string;
};

export type LocalFixtureUploadEvidence = {
  uploadGrantId: string;
  targetPath: string;
  sha256: string;
  sizeBytes: number;
  mediaType: "text/markdown";
};

export class PersistenceControlledFixtureControlPlane {
  constructor(
    private readonly claims: ConversionRuntimePersistenceRepository,
    private readonly runs: ConversionRunLedgerRepository,
    private readonly staging: StagingContentRegistryRepository,
    private readonly verifications: StagingVerificationRepository,
    private readonly finalizer: VerifiedStagingFinalizationRepository,
  ) {}

  async claim(request: ConversionClaimRequest) {
    return this.claims.claim(request);
  }

  async sourceIdForRun(workspaceId: string, conversionRunId: string): Promise<string> {
    const record = this.runs.getById(conversionRunId, workspaceId);
    if (!record) throw new Error("LOCAL_PIPELINE_CONVERSION_RUN_NOT_FOUND");
    return record.run.sourceId;
  }

  async ingestGenerated(input: {
    context: LocalFixtureContext;
    evidence: LocalFixtureUploadEvidence;
    markdown: Uint8Array;
    idempotencyKey: string;
  }) {
    const result = this.staging.ingestGenerated({
      workspaceId: input.context.workspaceId,
      workerId: input.context.workerId,
      conversionRunId: input.context.conversionRunId,
      conversionAttemptId: input.context.conversionAttemptId,
      uploadGrantId: input.evidence.uploadGrantId,
      idempotencyKey: input.idempotencyKey,
      title: `Converted ${input.context.rawArtifactId}`,
      content: input.markdown,
    });
    if (result.record.descriptor.status !== "GENERATED") {
      throw new Error("LOCAL_PIPELINE_INGEST_STATUS_INVALID");
    }
    return {
      stagingDocumentId: result.record.descriptor.id,
      status: "GENERATED" as const,
      replayed: result.replayed,
    };
  }

  async verifyGenerated(input: {
    workspaceId: string;
    stagingDocumentId: string;
    idempotencyKey: string;
  }): Promise<{
    stagingDocumentId: string;
    status: "READY" | "BLOCKED";
    outcome: StagingValidationOutcome;
    replayed: boolean;
  }> {
    const result = this.verifications.verifyGenerated(input);
    const status = result.record.descriptor.status;
    if (status !== "READY" && status !== "BLOCKED") {
      throw new Error("LOCAL_PIPELINE_VERIFICATION_STATUS_INVALID");
    }
    return {
      stagingDocumentId: result.record.descriptor.id,
      status,
      outcome: result.evidence.outcome,
      replayed: result.replayed,
    };
  }

  async finalizeVerified(input: {
    workspaceId: string;
    stagingDocumentId: string;
    idempotencyKey: string;
  }) {
    const result = this.finalizer.finalize(input);
    return {
      conversionRunId: result.transition.run.id,
      decision: result.decision,
      replayed: result.transition.replayed,
    };
  }
}

export class LocalRawArtifactMemoryReader {
  private readonly content = new Map<string, Uint8Array>();

  register(rawArtifactId: string, bytes: Uint8Array): void {
    this.content.set(rawArtifactId, Uint8Array.from(bytes));
  }

  async read(grant: RawArtifactReadGrant): Promise<Uint8Array> {
    const bytes = this.content.get(grant.rawArtifactId);
    if (!bytes) throw new Error("LOCAL_RAW_ARTIFACT_NOT_FOUND");
    if (bytes.byteLength !== grant.expectedBytes)
      throw new Error("LOCAL_RAW_ARTIFACT_SIZE_MISMATCH");
    if (createHash("sha256").update(bytes).digest("hex") !== grant.expectedSha256) {
      throw new Error("LOCAL_RAW_ARTIFACT_DIGEST_MISMATCH");
    }
    return Uint8Array.from(bytes);
  }
}

export class LocalSingleOutputUploader {
  private readonly uploads = new Map<string, Uint8Array>();

  async upload(
    grant: StagingOutputUploadGrant,
    content: Uint8Array,
  ): Promise<LocalFixtureUploadEvidence> {
    if (this.uploads.has(grant.id)) throw new Error("LOCAL_OUTPUT_GRANT_ALREADY_USED");
    if (content.byteLength > grant.maximumBytes) throw new Error("LOCAL_OUTPUT_TOO_LARGE");
    const stored = Uint8Array.from(content);
    this.uploads.set(grant.id, stored);
    return {
      uploadGrantId: grant.id,
      targetPath: grant.normalizedTargetPath,
      sha256: createHash("sha256").update(stored).digest("hex"),
      sizeBytes: stored.byteLength,
      mediaType: "text/markdown",
    };
  }

  get(uploadGrantId: string): Uint8Array | null {
    const bytes = this.uploads.get(uploadGrantId);
    return bytes ? Uint8Array.from(bytes) : null;
  }
}
