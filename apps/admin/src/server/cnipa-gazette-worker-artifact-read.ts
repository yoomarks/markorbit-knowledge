import {
  CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION,
  CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION,
  CNIPA_GAZETTE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
} from "@markorbit/worker-runtime";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import type { WorkerExecutionRepository } from "@markorbit/persistence/worker-execution";
import type { RawArtifactRepository, RawArtifactView } from "@markorbit/persistence/raw-artifacts";

export type CnipaGazetteWorkerArtifactReadDependencies = {
  executions: Pick<WorkerExecutionRepository, "authorizeArtifactRead">;
  artifacts: Pick<RawArtifactRepository, "getArtifact" | "contentPath">;
};

export type CnipaGazetteWorkerArtifactReadInput = {
  workerId: string;
  credential: string;
  leaseId: string;
  leaseToken: string;
  artifactId: string;
};

type RecordValue = Record<string, unknown>;
function record(value: unknown, label: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RegistryValidationError(`${label} must be an object`);
  }
  return value as RecordValue;
}

function artifactId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^art_[0-9A-HJKMNP-TV-Z]{26}$/u.test(value)) {
    throw new RegistryValidationError(`${label} must be a RawArtifact id`);
  }
  return value;
}

function publisherAllowedArtifactIds(config: RecordValue): Set<string> {
  if (config.intent !== "PUBLISH_DURABLE_REQUEST") {
    throw new RegistryConflictError(
      "GAZETTE_WORKER_ARTIFACT_READ_JOB_INVALID",
      "Gazette publisher Job does not carry the expected durable-request intent",
    );
  }
  const reference = record(config.requestArtifactRef, "requestArtifactRef");
  return new Set([artifactId(reference.artifactId, "requestArtifactRef.artifactId")]);
}
function finalizeAllowedArtifactIds(config: RecordValue): Set<string> {
  if (config.intent !== "BUILD_FINALIZE_REQUEST") {
    throw new RegistryConflictError(
      "GAZETTE_WORKER_ARTIFACT_READ_JOB_INVALID",
      "Gazette finalize Job does not carry the expected readiness intent",
    );
  }
  const identity = record(config.datasetIdentityRef, "datasetIdentityRef");
  if (!Array.isArray(config.chunkReceiptRefs) || config.chunkReceiptRefs.length < 1) {
    throw new RegistryValidationError("chunkReceiptRefs must be a non-empty array");
  }
  return new Set([
    artifactId(identity.artifactId, "datasetIdentityRef.artifactId"),
    ...config.chunkReceiptRefs.map((value, index) =>
      artifactId(
        record(value, `chunkReceiptRefs[${index}]`).artifactId,
        `chunkReceiptRefs[${index}].artifactId`,
      ),
    ),
  ]);
}

function browserResumeAllowedArtifactIds(
  job: ReturnType<WorkerExecutionRepository["authorizeArtifactRead"]>["job"],
): Set<string> {
  const extension = record(
    job.planSnapshot.extensions?.[CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION],
    "browserStream plan extension",
  );
  const resume = record(extension.resumeFrom, "browserStream.resumeFrom");
  if (
    !Array.isArray(resume.logicalProjectionArtifactIds) ||
    resume.logicalProjectionArtifactIds.length < 1
  ) {
    throw new RegistryValidationError(
      "browserStream.resumeFrom.logicalProjectionArtifactIds must be a non-empty array",
    );
  }
  return new Set([
    artifactId(resume.stateArtifactId, "browserStream.resumeFrom.stateArtifactId"),
    ...resume.logicalProjectionArtifactIds.map((value, index) =>
      artifactId(value, `browserStream.resumeFrom.logicalProjectionArtifactIds[${index}]`),
    ),
    artifactId(
      resume.firstSourceRawArtifactId,
      "browserStream.resumeFrom.firstSourceRawArtifactId",
    ),
    artifactId(
      resume.firstSourceProjectionArtifactId,
      "browserStream.resumeFrom.firstSourceProjectionArtifactId",
    ),
    artifactId(
      resume.previousSourceProjectionArtifactId,
      "browserStream.resumeFrom.previousSourceProjectionArtifactId",
    ),
  ]);
}

function allowedArtifactIds(
  job: ReturnType<WorkerExecutionRepository["authorizeArtifactRead"]>["job"],
): Set<string> {
  const connector = job.connector;
  const sourceConnector = job.sourceSnapshot.connector;
  const config = record(job.sourceSnapshot.connectorConfig, "connectorConfig");
  if (
    connector.connectorId === CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID &&
    connector.version === CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION &&
    sourceConnector.connectorId === CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID &&
    sourceConnector.version === CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION
  ) {
    return publisherAllowedArtifactIds(config);
  }
  if (
    connector.connectorId === CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID &&
    connector.version === CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION &&
    sourceConnector.connectorId === CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID &&
    sourceConnector.version === CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION
  ) {
    return finalizeAllowedArtifactIds(config);
  }
  if (
    connector.connectorId === CNIPA_GAZETTE_JOB_CONNECTOR_ID &&
    connector.version === CNIPA_GAZETTE_JOB_CONNECTOR_VERSION &&
    sourceConnector.connectorId === CNIPA_GAZETTE_JOB_CONNECTOR_ID &&
    sourceConnector.version === CNIPA_GAZETTE_JOB_CONNECTOR_VERSION
  ) {
    return browserResumeAllowedArtifactIds(job);
  }
  throw new RegistryConflictError(
    "GAZETTE_WORKER_ARTIFACT_READ_JOB_INVALID",
    "RawArtifact read is only available to governed Gazette publisher/finalize Jobs",
  );
}

function assertArtifactIntegrity(view: RawArtifactView): void {
  const artifact = view.artifact;
  if (
    artifact.binaryHash.algorithm !== "SHA-256" ||
    artifact.binaryHash.value !== view.contentObject.sha256 ||
    artifact.sizeBytes !== view.contentObject.sizeBytes
  ) {
    throw new RegistryConflictError(
      "GAZETTE_WORKER_ARTIFACT_INTEGRITY_INVALID",
      "RawArtifact registry metadata is internally inconsistent",
    );
  }
}
export function authorizeCnipaGazetteWorkerArtifactRead(
  input: CnipaGazetteWorkerArtifactReadInput,
  dependencies: CnipaGazetteWorkerArtifactReadDependencies,
) {
  const authorization = dependencies.executions.authorizeArtifactRead(
    input.workerId,
    input.credential,
    input.leaseId,
    input.leaseToken,
  );
  const allowed = allowedArtifactIds(authorization.job);
  if (!allowed.has(input.artifactId)) {
    throw new RegistryConflictError(
      "GAZETTE_WORKER_ARTIFACT_READ_NOT_AUTHORIZED",
      "Requested RawArtifact is not explicitly referenced by the immutable Gazette Job snapshot",
    );
  }
  const view = dependencies.artifacts.getArtifact(input.artifactId);
  if (!view || view.artifact.workspaceId !== authorization.workspaceId) {
    throw new RegistryConflictError(
      "GAZETTE_WORKER_ARTIFACT_READ_NOT_AUTHORIZED",
      "Requested RawArtifact is outside the active Gazette Job workspace",
    );
  }
  assertArtifactIntegrity(view);
  const content = dependencies.artifacts.contentPath(input.artifactId);
  if (content.sizeBytes !== view.artifact.sizeBytes) {
    throw new RegistryConflictError(
      "GAZETTE_WORKER_ARTIFACT_INTEGRITY_INVALID",
      "RawArtifact storage size does not match registry metadata",
    );
  }
  return { authorization, view, content };
}
