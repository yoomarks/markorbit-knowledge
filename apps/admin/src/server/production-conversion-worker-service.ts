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

export type ProductionStagingCommitDependencies = {
  workers: ReturnType<typeof getWorkerRegistryRepository>;
  conversionRuns: ReturnType<typeof getConversionRunLedgerRepository>;
  artifacts: ReturnType<typeof getRawArtifactRepository>;
  sources: ReturnType<typeof getSourceRepository>;
  staging: ReturnType<typeof getStagingContentRepository>;
  stagingVerification: ReturnType<typeof getStagingVerificationRepository>;
  stagingFinalizer: ReturnType<typeof getVerifiedStagingFinalizer>;
  readyPackages: ReturnType<typeof getReadyPackageRepository>;
  retrieval: ReturnType<typeof getRetrievalIndexRepository>;
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

  const closingMarker = "\n---\n";
  const expectedClosing = expectedFrontmatter.lastIndexOf(closingMarker);
  if (expectedClosing < 0) {
    throw new RegistryConflictError(
      "CANONICAL_MARKDOWN_METADATA_MISMATCH",
      "Expected canonical Markdown frontmatter is invalid",
    );
  }
  const requiredCanonicalPrefix = expectedFrontmatter.slice(0, expectedClosing);
  if (!text.startsWith(requiredCanonicalPrefix)) {
    throw new RegistryConflictError(
      "CANONICAL_MARKDOWN_METADATA_MISMATCH",
      "Canonical Markdown frontmatter does not match control-plane provenance",
    );
  }

  const remainder = text.slice(requiredCanonicalPrefix.length);
  const actualClosing = remainder.indexOf(closingMarker);
  if (actualClosing < 0) {
    throw new RegistryConflictError(
      "CANONICAL_MARKDOWN_METADATA_MISMATCH",
      "Canonical Markdown frontmatter is not terminated",
    );
  }
  const appendedYaml = remainder.slice(0, actualClosing);
  if (appendedYaml && !appendedYaml.startsWith("\n")) {
    throw new RegistryConflictError(
      "CANONICAL_MARKDOWN_METADATA_MISMATCH",
      "Canonical Markdown appended frontmatter is malformed",
    );
  }
  if (/^markorbit\s*:/mu.test(appendedYaml)) {
    throw new RegistryConflictError(
      "CANONICAL_MARKDOWN_METADATA_MISMATCH",
      "Canonical Markdown may not redefine reserved MarkOrbit provenance",
    );
  }
}

function productionStagingCommitDependencies(): ProductionStagingCommitDependencies {
  return {
    workers: getWorkerRegistryRepository(),
    conversionRuns: getConversionRunLedgerRepository(),
    artifacts: getRawArtifactRepository(),
    sources: getSourceRepository(),
    staging: getStagingContentRepository(),
    stagingVerification: getStagingVerificationRepository(),
    stagingFinalizer: getVerifiedStagingFinalizer(),
    readyPackages: getReadyPackageRepository(),
    retrieval: getRetrievalIndexRepository(),
  };
}

export function commitProductionStagingWithDependencies(
  dependencies: ProductionStagingCommitDependencies,
  input: ProductionStagingCommitInput,
  credential: string,
): ProductionStagingCommitResult {
  if (!KEY.test(input.idempotencyKey)) {
    throw new RegistryValidationError("Invalid production Staging commit idempotency key");
  }
  const worker = dependencies.workers.verifyCredential(input.workerId, credential);
  if (worker.workspaceId !== input.workspaceId) {
    throw new RegistryConflictError(
      "STAGING_WORKER_WORKSPACE_MISMATCH",
      "Worker credential belongs to another Workspace",
    );
  }

  const run = dependencies.conversionRuns.getById(input.conversionRunId, input.workspaceId);
  if (!run) {
    throw new RegistryError(
      "CONVERSION_RUN_NOT_FOUND",
      `ConversionRun ${input.conversionRunId} was not found`,
    );
  }
  const artifact = dependencies.artifacts.getArtifact(run.run.rawArtifactId);
  if (!artifact) {
    throw new RegistryError(
      "RAW_ARTIFACT_NOT_FOUND",
      `RawArtifact ${run.run.rawArtifactId} was not found`,
    );
  }
  const source = dependencies.sources.getById(run.run.sourceId);
  if (!source) {
    throw new RegistryError("SOURCE_NOT_FOUND", `Source ${run.run.sourceId} was not found`);
  }
  const metadata = canonicalDocumentMetadata(run.run, artifact.artifact, source);
  assertCanonicalMarkdown(input.content, canonicalMarkdownFrontmatter(metadata));

  const staging = dependencies.staging.ingestGenerated({
    workspaceId: input.workspaceId,
    workerId: input.workerId,
    conversionRunId: input.conversionRunId,
    conversionAttemptId: input.conversionAttemptId,
    uploadGrantId: input.uploadGrantId,
    idempotencyKey: `${input.idempotencyKey}:ingest`,
    title: source.name,
    content: input.content,
  });
  const verification = dependencies.stagingVerification.verifyGenerated({
    workspaceId: input.workspaceId,
    stagingDocumentId: staging.record.descriptor.id,
    idempotencyKey: `${input.idempotencyKey}:verify`,
  });
  const status = verification.record.descriptor.status;
  if (status !== "READY" && status !== "BLOCKED") {
    throw new RegistryConflictError(
      "STAGING_VERIFICATION_STATUS_INVALID",
      "Staging verification did not produce a terminal decision",
    );
  }
  const finalization = dependencies.stagingFinalizer.finalize({
    workspaceId: input.workspaceId,
    stagingDocumentId: staging.record.descriptor.id,
    idempotencyKey: `${input.idempotencyKey}:finalize`,
  });

  if (finalization.decision === "FAILED") {
    return {
      stagingDocumentId: staging.record.descriptor.id,
      stagingStatus: status,
      verificationOutcome: verification.evidence.outcome,
      finalizationDecision: "FAILED",
    };
  }

  const completedRun = dependencies.conversionRuns.getById(
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
  const packageResult = dependencies.readyPackages.createVerified({
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
  dependencies.retrieval.indexVerified({
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

    let reconciliation: AutomaticConversionRecoveryStatus;
    try {
      reconciliation = reconcileAutomaticConversions(request.workspaceId, { limit: 25 });
    } catch {
      // Recovery must never prevent a Worker from claiming ConversionRuns that are already queued.
      reconciliation = {
        status: "DEFERRED",
        workspaceId: request.workspaceId,
        reason: "RECOVERY_SCAN_FAILED",
      };
    }

    return {
      ...getConversionRuntimeRepository().claim(request),
      reconciliation,
    };
  }

  readInput(
    grantId: string,
    workerId: string,
    credential: string,
  ): { bytes: Uint8Array; mimeType: string; originalName: string } {
    const worker = getWorkerRegistryRepository().verifyCredential(workerId, credential);
    const database = getRegistryDatabase();
    database.exec("BEGIN IMMEDIATE;");
    try {
      const row = database
        .prepare("SELECT document_json FROM conversion_read_grants WHERE id = ?")
        .get(grantId) as { document_json: string } | undefined;
      if (!row)
        throw new RegistryError(
          "RAW_ARTIFACT_READ_GRANT_NOT_FOUND",
          `Read grant ${grantId} was not found`,
        );
      const grant = parseReadGrant(row.document_json);
      if (grant.workerId !== workerId || grant.workspaceId !== worker.workspaceId) {
        throw new RegistryConflictError(
          "RAW_ARTIFACT_READ_GRANT_SCOPE_MISMATCH",
          "Read grant does not belong to the authenticated Worker",
        );
      }
      if (Date.parse(grant.expiresAt) < Date.now()) {
        throw new RegistryConflictError(
          "RAW_ARTIFACT_READ_GRANT_EXPIRED",
          "Read grant has expired",
        );
      }
      if (grant.readsUsed >= grant.maximumReads) {
        throw new RegistryConflictError(
          "RAW_ARTIFACT_READ_GRANT_EXHAUSTED",
          "Read grant has already been consumed",
        );
      }

      const artifact = getRawArtifactRepository().getArtifact(grant.rawArtifactId);
      if (!artifact || artifact.artifact.workspaceId !== grant.workspaceId) {
        throw new RegistryError(
          "RAW_ARTIFACT_NOT_FOUND",
          `RawArtifact ${grant.rawArtifactId} was not found`,
        );
      }
      if (
        artifact.artifact.binaryHash.value !== grant.expectedSha256 ||
        artifact.artifact.sizeBytes !== grant.expectedBytes ||
        artifact.artifact.mimeType !== grant.expectedMime
      ) {
        throw new RegistryConflictError(
          "RAW_ARTIFACT_READ_GRANT_EVIDENCE_MISMATCH",
          "RawArtifact no longer matches the immutable read grant",
        );
      }
      const path = getRawArtifactRepository().contentPath(grant.rawArtifactId);
      const bytes = new Uint8Array(readFileSync(path.path));
      if (
        bytes.byteLength !== grant.expectedBytes ||
        !SHA256.test(grant.expectedSha256) ||
        sha256(bytes) !== grant.expectedSha256
      ) {
        throw new RegistryConflictError(
          "RAW_ARTIFACT_READ_INTEGRITY_MISMATCH",
          "Stored RawArtifact bytes do not match the read grant",
        );
      }
      const consumed: RawArtifactReadGrant = { ...grant, readsUsed: grant.readsUsed + 1 };
      database
        .prepare("UPDATE conversion_read_grants SET document_json = ? WHERE id = ?")
        .run(JSON.stringify(consumed), grant.id);
      database.exec("COMMIT;");
      return { bytes, mimeType: path.mimeType, originalName: path.originalName };
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
  }

  submitReport(
    report:
      | ConversionStartedReport
      | ConversionProgressReport
      | ConversionOutputReadyReport
      | ConversionFailedReport,
    credential: string,
  ) {
    const transitions = getConversionRuntimeTransitionRepository();
    if (isConversionStartedReport(report)) return transitions.submitStarted(report, credential);
    if (isConversionProgressReport(report)) return transitions.submitProgress(report, credential);
    if (isConversionOutputReadyReport(report))
      return transitions.submitOutputReady(report, credential);
    if (isConversionFailedReport(report)) return transitions.submitFailed(report, credential);
    throw new RegistryValidationError("Unsupported Conversion Runtime report");
  }

  commitStaging(
    input: ProductionStagingCommitInput,
    credential: string,
  ): ProductionStagingCommitResult {
    return commitProductionStagingWithDependencies(
      productionStagingCommitDependencies(),
      input,
      credential,
    );
  }
}
