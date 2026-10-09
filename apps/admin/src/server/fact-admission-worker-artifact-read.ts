import {
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID,
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE,
  WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_ID,
  WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  WIPO_MGS_FACT_ADMISSION_JOB_SOURCE,
} from "@markorbit/worker-runtime";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import type { WorkerExecutionRepository } from "@markorbit/persistence/worker-execution";
import type { RawArtifactRepository, RawArtifactView } from "@markorbit/persistence/raw-artifacts";

export type FactAdmissionWorkerArtifactReadDependencies = {
  executions: Pick<WorkerExecutionRepository, "authorizeArtifactRead">;
  artifacts: Pick<RawArtifactRepository, "getArtifact" | "contentPath">;
};
export type FactAdmissionWorkerArtifactReadInput = {
  workerId: string;
  credential: string;
  leaseId: string;
  leaseToken: string;
  artifactId: string;
};
type RecordValue = Record<string, unknown>;

function record(value: unknown, label: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RegistryValidationError(label + " must be an object");
  }
  return value as RecordValue;
}
function rawArtifactId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^art_[0-9A-HJKMNP-TV-Z]{26}$/u.test(value)) {
    throw new RegistryValidationError(label + " must be a RawArtifact id");
  }
  return value;
}
function allowedArtifactRef(
  job: ReturnType<WorkerExecutionRepository["authorizeArtifactRead"]>["job"],
): { artifactId: string; canonicalUri: string; sha256: string; sizeBytes: number } {
  const connector = job.connector;
  const sourceConnector = job.sourceSnapshot.connector;
  const governedPublisher = [
    {
      connectorId: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID,
      version: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
      source: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE,
    },
    {
      connectorId: WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_ID,
      version: WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
      source: WIPO_MGS_FACT_ADMISSION_JOB_SOURCE,
    },
  ].some(
    (candidate) =>
      job.sourceSnapshot.canonicalUri === candidate.source &&
      connector.connectorId === candidate.connectorId &&
      connector.version === candidate.version &&
      sourceConnector.connectorId === candidate.connectorId &&
      sourceConnector.version === candidate.version,
  );
  if (job.sourceSnapshot.sourceType !== "DATABASE" || !governedPublisher) {
    throw new RegistryConflictError(
      "FACT_ADMISSION_WORKER_ARTIFACT_READ_JOB_INVALID",
      "RawArtifact read is only available to governed fact-admission publisher Jobs",
    );
  }
  const config = record(job.sourceSnapshot.connectorConfig, "connectorConfig");
  if (
    config.intent !== "PUBLISH_DURABLE_REQUEST" ||
    Object.keys(config).some((key) => !["intent", "requestArtifactRef"].includes(key))
  ) {
    throw new RegistryConflictError(
      "FACT_ADMISSION_WORKER_ARTIFACT_READ_JOB_INVALID",
      "Publisher Job does not carry the exact durable-request intent",
    );
  }
  const ref = record(config.requestArtifactRef, "requestArtifactRef");
  if (
    Object.keys(ref).some(
      (key) => !["artifactId", "canonicalUri", "sha256", "sizeBytes"].includes(key),
    ) ||
    typeof ref.canonicalUri !== "string" ||
    !ref.canonicalUri.endsWith("/fact-admission-request") ||
    typeof ref.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(ref.sha256) ||
    !Number.isSafeInteger(ref.sizeBytes) ||
    (ref.sizeBytes as number) <= 0
  ) {
    throw new RegistryValidationError("Immutable fact-admission RawArtifact reference is invalid");
  }
  return {
    artifactId: rawArtifactId(ref.artifactId, "requestArtifactRef.artifactId"),
    canonicalUri: ref.canonicalUri,
    sha256: ref.sha256,
    sizeBytes: ref.sizeBytes as number,
  };
}
function assertArtifactIntegrity(view: RawArtifactView): void {
  const artifact = view.artifact;
  if (
    artifact.artifactKind !== "JSON" ||
    artifact.binaryHash.algorithm !== "SHA-256" ||
    artifact.binaryHash.value !== view.contentObject.sha256 ||
    artifact.sizeBytes !== view.contentObject.sizeBytes ||
    !artifact.canonicalUri?.endsWith("/fact-admission-request")
  ) {
    throw new RegistryConflictError(
      "FACT_ADMISSION_WORKER_ARTIFACT_INTEGRITY_INVALID",
      "RawArtifact registry metadata does not describe a valid fact-admission request",
    );
  }
}
export function authorizeFactAdmissionWorkerArtifactRead(
  input: FactAdmissionWorkerArtifactReadInput,
  dependencies: FactAdmissionWorkerArtifactReadDependencies,
) {
  const authorization = dependencies.executions.authorizeArtifactRead(
    input.workerId,
    input.credential,
    input.leaseId,
    input.leaseToken,
  );
  const allowed = allowedArtifactRef(authorization.job);
  if (allowed.artifactId !== input.artifactId) {
    throw new RegistryConflictError(
      "FACT_ADMISSION_WORKER_ARTIFACT_READ_NOT_AUTHORIZED",
      "Requested RawArtifact is not the immutable publisher Job request artifact",
    );
  }
  const view = dependencies.artifacts.getArtifact(input.artifactId);
  if (!view || view.artifact.workspaceId !== authorization.workspaceId) {
    throw new RegistryConflictError(
      "FACT_ADMISSION_WORKER_ARTIFACT_READ_NOT_AUTHORIZED",
      "Requested RawArtifact is outside the active publisher Job workspace",
    );
  }
  assertArtifactIntegrity(view);
  if (
    view.artifact.canonicalUri !== allowed.canonicalUri ||
    view.artifact.binaryHash.value !== allowed.sha256 ||
    view.artifact.sizeBytes !== allowed.sizeBytes
  ) {
    throw new RegistryConflictError(
      "FACT_ADMISSION_WORKER_ARTIFACT_INTEGRITY_INVALID",
      "RawArtifact metadata differs from immutable publisher Job reference",
    );
  }
  const content = dependencies.artifacts.contentPath(input.artifactId);
  if (
    content.sizeBytes !== view.artifact.sizeBytes ||
    !content.mimeType.toLowerCase().includes("json")
  ) {
    throw new RegistryConflictError(
      "FACT_ADMISSION_WORKER_ARTIFACT_INTEGRITY_INVALID",
      "RawArtifact storage metadata does not match the publisher request",
    );
  }
  return { authorization, view, content };
}
