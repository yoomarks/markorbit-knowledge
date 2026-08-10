import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  isConversionFailedReport,
  isConversionOutputReadyReport,
  isConversionProgressReport,
  isConversionStartedReport,
  isRawArtifactReadGrant,
  type ConversionClaimRequest,
  type ConversionClaimResult,
  type ConversionFailedReport,
  type ConversionOutputReadyReport,
  type ConversionProgressReport,
  type ConversionStartedReport,
  type RawArtifactReadGrant,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import {
  canonicalMarkdownFrontmatter,
  createCoreIntakeRequestPreview,
  type CoreIntakeRequestPreview,
} from "@markorbit/worker-runtime";
import { canonicalDocumentMetadata } from "./canonical-document-metadata";
import {
  reconcileAutomaticConversions,
  type AutomaticConversionReconciliationResult,
} from "./raw-artifact-auto-conversion";
import {
  getConversionRunLedgerRepository,
  getConversionRuntimeRepository,
  getConversionRuntimeTransitionRepository,
  getRawArtifactRepository,
  getReadyPackageRepository,
  getRegistryDatabase,
  getRetrievalIndexRepository,
  getSourceRepository,
  getStagingContentRepository,
  getStagingVerificationRepository,
  getVerifiedStagingFinalizer,
  getWorkerRegistryRepository,
} from "./source-registry";

const SHA256 = /^[a-f0-9]{64}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export type ProductionStagingCommitInput = {
  workspaceId: string;
  workerId: string;
  conversionRunId: string;
  conversionAttemptId: string;
  uploadGrantId: string;
  idempotencyKey: string;
  content: Uint8Array;
};

export type ProductionStagingCommitResult = {
  stagingDocumentId: string;
  stagingStatus: "READY" | "BLOCKED";
  verificationOutcome: "PASS" | "PASS_WITH_WARNINGS" | "FAIL";
  finalizationDecision: "COMPLETED" | "FAILED";
  readyPackageId?: string;
  coreIntakeRequestPreview?: CoreIntakeRequestPreview;
};

export type AutomaticConversionRecoveryStatus =
  | AutomaticConversionReconciliationResult
  | {
      status: "DEFERRED";
      workspaceId: string;
      reason: "RECOVERY_SCAN_FAILED";
    };

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function parseReadGrant(value: string): RawArtifactReadGrant {
  const parsed = JSON.parse(value) as unknown;
  if (!isRawArtifactReadGrant(parsed)) {
    throw new RegistryValidationError("Persisted RawArtifactReadGrant is invalid");
  }
  return parsed;
}

function assertCanonicalMarkdown(content: Uint8Array, expectedFrontmatter: string): void {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new RegistryConflictError(
      "CANONICAL_MARKDOWN_UTF8_INVALID",
      "Canonical Markdown must be valid UTF-8",
    );
  }
  if (!text.startsWith(expectedFrontmatter)) {
    throw new RegistryConflictError(
      "CANONICAL_MARKDOWN_METADATA_MISMATCH",
      "Canonical Markdown frontmatter does not match control-plane provenance",
    );
  }
}

export class ProductionConversionWorkerService {
  claim(
    request: ConversionClaimRequest,
    credential: string,
  ): {
    result: ConversionClaimResult;
    replayed: boolean;
    reconciliation: AutomaticConversionRecoveryStatus;
  } {
    const worker = getWorkerRegistryRepository().verifyCredential(request.workerId, credential);
    if (worker.workspaceId !== request.workspaceId) {
      throw new RegistryConflictError(
        "CONVERSION_WORKER_WORKSPACE_MISMATCH",
        "Worker credential belongs to another Workspace",
      );
    }
    const reconciliation = this.reconcile(request.workspaceId);
    const result = getConversionRuntimeTransitionRepository().claim(request);
    return { result: result.result, replayed: result.replayed, reconciliation };
  }

  start(
    report: ConversionStartedReport,
    credential: string,
  ): ReturnType<ReturnType<typeof getConversionRuntimeTransitionRepository>["start"]> {
    if (!isConversionStartedReport(report)) {
      throw new RegistryValidationError("ConversionStartedReport is invalid");
    }
    this.authorizeWorker(report.workspaceId, report.workerId, credential);
    return getConversionRuntimeTransitionRepository().start(report);
  }

  progress(
    report: ConversionProgressReport,
    credential: string,
  ): ReturnType<ReturnType<typeof getConversionRuntimeTransitionRepository>["progress"]> {
    if (!isConversionProgressReport(report)) {
      throw new RegistryValidationError("ConversionProgressReport is invalid");
    }
    this.authorizeWorker(report.workspaceId, report.workerId, credential);
    return getConversionRuntimeTransitionRepository().progress(report);
  }

  outputReady(
    report: ConversionOutputReadyReport,
    credential: string,
  ): ReturnType<ReturnType<typeof getConversionRuntimeTransitionRepository>["outputReady"]> {
    if (!isConversionOutputReadyReport(report)) {
      throw new RegistryValidationError("ConversionOutputReadyReport is invalid");
    }
    this.authorizeWorker(report.workspaceId, report.workerId, credential);
    return getConversionRuntimeTransitionRepository().outputReady(report);
  }

  fail(
    report: ConversionFailedReport,
    credential: string,
  ): ReturnType<ReturnType<typeof getConversionRuntimeTransitionRepository>["fail"]> {
    if (!isConversionFailedReport(report)) {
      throw new RegistryValidationError("ConversionFailedReport is invalid");
    }
    this.authorizeWorker(report.workspaceId, report.workerId, credential);
    return getConversionRuntimeTransitionRepository().fail(report);
  }

  rawArtifactRead(
    workspaceId: string,
    workerId: string,
    grantId: string,
    credential: string,
  ): { grant: RawArtifactReadGrant; content: Uint8Array } {
    this.authorizeWorker(workspaceId, workerId, credential);
    const row = getRegistryDatabase()
      .prepare(
        `SELECT grant_json FROM raw_artifact_read_grants
         WHERE id = ? AND workspace_id = ? AND worker_id = ?`,
      )
      .get(grantId, workspaceId, workerId) as { grant_json: string } | undefined;
    if (!row) {
      throw new RegistryError("RAW_ARTIFACT_READ_GRANT_NOT_FOUND", `Read grant ${grantId} was not found`);
    }
    const grant = parseReadGrant(row.grant_json);
    if (Date.parse(grant.expiresAt) <= Date.now()) {
      throw new RegistryConflictError(
        "RAW_ARTIFACT_READ_GRANT_EXPIRED",
        `Read grant ${grantId} has expired`,
      );
    }
    const artifact = getRawArtifactRepository().getById(grant.rawArtifactId, workspaceId);
    if (!artifact) {
      throw new RegistryError(
        "RAW_ARTIFACT_NOT_FOUND",
        `RawArtifact ${grant.rawArtifactId} was not found`,
      );
    }
    if (artifact.artifact.storage.uri !== grant.storageUri) {
      throw new RegistryConflictError(
        "RAW_ARTIFACT_READ_GRANT_STORAGE_MISMATCH",
        "Read grant storage URI no longer matches the RawArtifact",
      );
    }
    if (grant.storageUri.startsWith("file://")) {
      return { grant, content: readFileSync(new URL(grant.storageUri)) };
    }
    throw new RegistryConflictError(
      "RAW_ARTIFACT_READ_UNSUPPORTED_URI",
      `Unsupported RawArtifact storage URI: ${grant.storageUri}`,
    );
  }

  commitStaging(input: ProductionStagingCommitInput): ProductionStagingCommitResult {
    if (!KEY.test(input.idempotencyKey)) {
      throw new RegistryValidationError("Invalid staging commit idempotency key");
    }
    const runtime = getConversionRuntimeRepository().getByRun(input.conversionRunId, input.workspaceId);
    if (!runtime) {
      throw new RegistryError(
        "CONVERSION_RUNTIME_NOT_FOUND",
        `Conversion runtime for ${input.conversionRunId} was not found`,
      );
    }
    if (runtime.attempt.id !== input.conversionAttemptId || runtime.attempt.workerId !== input.workerId) {
      throw new RegistryConflictError(
        "CONVERSION_RUNTIME_ATTEMPT_MISMATCH",
        "Staging commit attempt does not match the current ConversionAttempt",
      );
    }
    if (runtime.attempt.status !== "OUTPUT_READY") {
      throw new RegistryConflictError(
        "CONVERSION_OUTPUT_NOT_READY",
        "Staging commit requires an OUTPUT_READY ConversionAttempt",
      );
    }
    const grant = runtime.uploadGrant;
    if (!grant || grant.id !== input.uploadGrantId || Date.parse(grant.expiresAt) <= Date.now()) {
      throw new RegistryConflictError(
        "STAGING_UPLOAD_GRANT_INVALID",
        "Staging upload grant is missing, mismatched, or expired",
      );
    }
    const completed = getConversionRunLedgerRepository().getById(input.conversionRunId, input.workspaceId);
    if (!completed) {
      throw new RegistryError(
        "CONVERSION_RUN_NOT_FOUND",
        `ConversionRun ${input.conversionRunId} was not found`,
      );
    }
    const artifact = getRawArtifactRepository().getById(completed.run.rawArtifactId, input.workspaceId);
    if (!artifact) {
      throw new RegistryError(
        "RAW_ARTIFACT_NOT_FOUND",
        `RawArtifact ${completed.run.rawArtifactId} was not found`,
      );
    }
    const source = getSourceRepository().getById(completed.run.sourceId, input.workspaceId);
    if (!source) {
      throw new RegistryError("SOURCE_NOT_FOUND", `Source ${completed.run.sourceId} was not found`);
    }
    const metadata = canonicalDocumentMetadata({
      workspaceId: input.workspaceId,
      sourceId: source.source.id,
      rawArtifactId: artifact.artifact.id,
      rawArtifactSha256: artifact.artifact.binaryHash.value,
      capturedAt: artifact.artifact.capturedAt,
      sourceUri: artifact.artifact.provenance.sourceUri,
      documentType: "OFFICIAL_GUIDANCE",
      jurisdiction: source.source.jurisdiction,
      sourceAuthority: source.source.authority,
      sourceType: source.source.sourceType,
      fetchedAt: artifact.artifact.capturedAt,
      checkedAt: artifact.artifact.capturedAt,
      validFrom: artifact.artifact.capturedAt,
    });
    const expectedFrontmatter = canonicalMarkdownFrontmatter(metadata);
    assertCanonicalMarkdown(input.content, expectedFrontmatter);
    const contentHash = sha256(input.content);
    if (contentHash !== grant.expectedContentSha256) {
      throw new RegistryConflictError(
        "STAGING_UPLOAD_CONTENT_HASH_MISMATCH",
        "Staging content hash does not match the granted digest",
      );
    }
    const staging = getStagingContentRepository().commit({
      workspaceId: input.workspaceId,
      sourceId: source.source.id,
      rawArtifactId: artifact.artifact.id,
      conversionRunId: completed.run.id,
      title: `${source.source.jurisdiction} ${source.source.authority} official guidance`,
      targetPath: `${source.source.jurisdiction}/${source.source.authority}/${artifact.artifact.id}.md`,
      content: input.content,
      contentSha256: contentHash,
      idempotencyKey: `${input.idempotencyKey}:staging`,
    });
    const verification = getStagingVerificationRepository().verify({
      workspaceId: input.workspaceId,
      stagingDocumentId: staging.record.descriptor.id,
      idempotencyKey: `${input.idempotencyKey}:verification`,
    });
    const status = verification.record.status === "VERIFIED" ? "READY" : "BLOCKED";
    const finalization = getVerifiedStagingFinalizer().finalize({
      workspaceId: input.workspaceId,
      stagingDocumentId: staging.record.descriptor.id,
      idempotencyKey: `${input.idempotencyKey}:finalization`,
    });

    if (finalization.decision === "FAILED") {
      return {
        stagingDocumentId: staging.record.descriptor.id,
        stagingStatus: status,
        verificationOutcome: verification.evidence.outcome,
        finalizationDecision: "FAILED",
      };
    }

    const completedRun = getConversionRunLedgerRepository().getById(
      input.conversionRunId,
      input.workspaceId,
    );
    if (!completedRun || completedRun.run.status !== "COMPLETED") {
      throw new RegistryConflictError(
        "READY_PACKAGE_RUN_NOT_COMPLETED",
        "ReadyPackage requires a completed ConversionRun",
      );
    }
    const descriptor = verification.record.descriptor;
    const outcome = verification.evidence.outcome;
    if (outcome !== "PASS" && outcome !== "PASS_WITH_WARNINGS") {
      throw new RegistryConflictError(
        "READY_PACKAGE_VERIFICATION_NOT_PASSING",
        "ReadyPackage requires passing Staging verification",
      );
    }
    const packageResult = getReadyPackageRepository().createVerified({
      workspaceId: input.workspaceId,
      sourceId: completedRun.run.sourceId,
      rawArtifactId: completedRun.run.rawArtifactId,
      rawArtifactSha256: artifact.artifact.binaryHash.value,
      capturedAt: artifact.artifact.capturedAt,
      conversionRunId: completedRun.run.id,
      converter: completedRun.run.converter,
      stagingDocumentId: descriptor.id,
      stagingSha256: descriptor.contentHash.value,
      verificationId: verification.evidence.id,
      verificationOutcome: outcome,
      idempotencyKey: `${input.idempotencyKey}:ready-package`,
    });
    getRetrievalIndexRepository().indexVerified({
      metadata,
      stagingDocumentId: descriptor.id,
      readyPackageId: packageResult.readyPackage.id,
      title: descriptor.title,
      targetPath: descriptor.targetPath,
      contentSha256: descriptor.contentHash.value,
      canonicalMarkdown: input.content,
    });
    const coreIntakeRequestPreview = createCoreIntakeRequestPreview(packageResult.readyPackage);
    return {
      stagingDocumentId: descriptor.id,
      stagingStatus: "READY",
      verificationOutcome: outcome,
      finalizationDecision: "COMPLETED",
      readyPackageId: packageResult.readyPackage.id,
      coreIntakeRequestPreview,
    };
  }

  private authorizeWorker(workspaceId: string, workerId: string, credential: string): void {
    const worker = getWorkerRegistryRepository().verifyCredential(workerId, credential);
    if (worker.workspaceId !== workspaceId) {
      throw new RegistryConflictError(
        "CONVERSION_WORKER_WORKSPACE_MISMATCH",
        "Worker credential belongs to another Workspace",
      );
    }
  }

  private reconcile(workspaceId: string): AutomaticConversionRecoveryStatus {
    try {
      return reconcileAutomaticConversions(workspaceId);
    } catch {
      return { status: "DEFERRED", workspaceId, reason: "RECOVERY_SCAN_FAILED" };
    }
  }
}
