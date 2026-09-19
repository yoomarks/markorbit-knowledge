import { createHash } from "node:crypto";
import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { CnipaGazetteFactAdmissionRequestPublisher } from "./cnipa-gazette-fact-admission-request-publisher";
import { FactAdmissionHttpError, type FactAdmissionClient } from "./fact-admission-http-client";

export const CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID =
  "cnipa-gazette-fact-admission-publisher";
export const CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION = "1.0.0";
export const CNIPA_GAZETTE_FACT_ADMISSION_JOB_SOURCE =
  "markorbit://knowledge/cnipa-gazette/fact-admission-requests";

export const CNIPA_GAZETTE_FACT_ADMISSION_JOB_EXECUTOR: ExecutionExecutor = {
  executorId: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
  version: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};
export type CnipaGazetteDurableArtifactReference = {
  artifactId: string;
  canonicalUri: string;
  sha256: string;
  sizeBytes: number;
};

export type CnipaGazetteDurableRequestArtifactReference = CnipaGazetteDurableArtifactReference;

export interface CnipaGazetteDurableArtifactReader {
  read(
    artifactId: string,
    context: ArtifactBackedExecutionContext,
  ): Promise<AcquiredCollectionArtifact>;
}

export type CnipaGazetteFactAdmissionJobAcquirerOptions = {
  reader: CnipaGazetteDurableArtifactReader;
  client: FactAdmissionClient;
  clock?: () => string;
};

const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_PUBLISH_JOB_CONFIG_INVALID",
      `${label} must be an object`,
      false,
    );
  }
  return value as Record<string, unknown>;
}
function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const accepted = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !accepted.has(key));
  if (unexpected.length > 0) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_PUBLISH_JOB_CONFIG_INVALID",
      `${label} contains unsupported keys: ${unexpected.join(", ")}`,
      false,
    );
  }
}

function requiredString(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string") {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_PUBLISH_JOB_CONFIG_INVALID",
      `${label} must be a string`,
      false,
    );
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_PUBLISH_JOB_CONFIG_INVALID",
      `${label} must be non-empty and at most ${maximum} characters`,
      false,
    );
  }
  return normalized;
}
function requireSourceBoundary(context: ArtifactBackedExecutionContext): void {
  const source = context.job.sourceSnapshot;
  if (
    source.sourceType !== "DATABASE" ||
    source.connector.connectorId !== CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID ||
    source.connector.version !== CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION ||
    context.job.connector.connectorId !== CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID ||
    context.job.connector.version !== CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION ||
    source.canonicalUri !== CNIPA_GAZETTE_FACT_ADMISSION_JOB_SOURCE
  ) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_PUBLISH_SOURCE_BOUNDARY_INVALID",
      "Gazette publisher jobs require the governed durable Knowledge artifact source",
      false,
    );
  }
  if (!context.job.planSnapshot.output.artifactKinds.includes("JSON")) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_OUTPUT_KIND_INVALID",
      "Gazette publisher jobs must authorize JSON receipt artifacts",
      false,
    );
  }
}

function requestReference(
  context: ArtifactBackedExecutionContext,
): CnipaGazetteDurableRequestArtifactReference {
  requireSourceBoundary(context);
  const config = objectValue(context.job.sourceSnapshot.connectorConfig, "connectorConfig");
  exactKeys(config, ["intent", "requestArtifactRef"], "Gazette publisher connectorConfig");
  if (config.intent !== "PUBLISH_DURABLE_REQUEST") {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_PUBLISH_JOB_CONFIG_INVALID",
      "Gazette publisher connectorConfig.intent must be PUBLISH_DURABLE_REQUEST",
      false,
    );
  }
  const raw = objectValue(config.requestArtifactRef, "requestArtifactRef");
  exactKeys(raw, ["artifactId", "canonicalUri", "sha256", "sizeBytes"], "requestArtifactRef");
  const artifactId = requiredString(raw.artifactId, "requestArtifactRef.artifactId", 64);
  if (!ARTIFACT_ID.test(artifactId)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_PUBLISH_JOB_CONFIG_INVALID",
      "requestArtifactRef.artifactId must be a RawArtifact id",
      false,
    );
  }
  const canonicalUri = requiredString(raw.canonicalUri, "requestArtifactRef.canonicalUri");
  const sha256 = requiredString(raw.sha256, "requestArtifactRef.sha256", 64).toLowerCase();
  if (!SHA256.test(sha256)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_PUBLISH_JOB_CONFIG_INVALID",
      "requestArtifactRef.sha256 must be 64 lowercase hexadecimal characters",
      false,
    );
  }
  if (!Number.isSafeInteger(raw.sizeBytes) || (raw.sizeBytes as number) < 1) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_PUBLISH_JOB_CONFIG_INVALID",
      "requestArtifactRef.sizeBytes must be a positive safe integer",
      false,
    );
  }
  return {
    artifactId,
    canonicalUri,
    sha256,
    sizeBytes: raw.sizeBytes as number,
  };
}

export function cnipaGazetteArtifactMatchesReference(
  reference: CnipaGazetteDurableArtifactReference,
  artifact: AcquiredCollectionArtifact,
): boolean {
  const digest = createHash("sha256").update(artifact.content).digest("hex");
  return (
    artifact.artifactKind === "JSON" &&
    artifact.canonicalUri === reference.canonicalUri &&
    artifact.content.byteLength === reference.sizeBytes &&
    digest === reference.sha256
  );
}

function verifyLoadedArtifact(
  reference: CnipaGazetteDurableRequestArtifactReference,
  artifact: AcquiredCollectionArtifact,
): AcquiredCollectionArtifact {
  if (!cnipaGazetteArtifactMatchesReference(reference, artifact)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_DURABLE_REQUEST_MISMATCH",
      "Loaded Gazette request artifact does not match the immutable Job reference",
      false,
    );
  }
  return artifact;
}
function observedAt(clock: () => string): string {
  const value = clock();
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_PUBLISH_CLOCK_INVALID",
      "Gazette publisher clock must return an ISO-8601 instant",
      false,
    );
  }
  return value;
}

export class CnipaGazetteFactAdmissionJobAcquirer implements CollectionArtifactAcquirer {
  readonly executor = CNIPA_GAZETTE_FACT_ADMISSION_JOB_EXECUTOR;
  private readonly clock: () => string;

  constructor(private readonly options: CnipaGazetteFactAdmissionJobAcquirerOptions) {
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const reference = requestReference(context);
    const loaded = verifyLoadedArtifact(
      reference,
      await this.options.reader.read(reference.artifactId, context),
    );
    try {
      const published = await new CnipaGazetteFactAdmissionRequestPublisher(
        this.options.client,
      ).publish({
        requestArtifact: loaded,
        observedAt: observedAt(this.clock),
      });
      const receiptArtifact: AcquiredCollectionArtifact = {
        ...published.receiptArtifact,
        parentCanonicalUris: undefined,
        parentArtifactIds: [reference.artifactId],
      };
      return [receiptArtifact];
    } catch (error) {
      if (error instanceof FactAdmissionHttpError) {
        throw new CollectionAcquisitionError(error.code, error.message, error.retryable);
      }
      throw error;
    }
  }
}

export function cnipaGazetteFactAdmissionJobRuntimeDescriptor() {
  return Object.freeze({
    connectorId: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
    connectorVersion: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
    sourceType: "DATABASE" as const,
    source: CNIPA_GAZETTE_FACT_ADMISSION_JOB_SOURCE,
    inputMustBeDurableRawArtifact: true as const,
    requestIntegrityVerifiedBeforeDataEngineWrite: true as const,
    cnipaNetworkAccessRequired: false as const,
    factAdmissionOnly: true as const,
    artifactBackedReceiptRequired: true as const,
    historicalReplayActivated: false as const,
  });
}
