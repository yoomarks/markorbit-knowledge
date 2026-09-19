import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import {
  buildCnipaGazetteDataEngineFinalizePackage,
  parseCnipaGazetteDatasetIdentityArtifact,
} from "./cnipa-gazette-data-engine-handoff";
import {
  buildCnipaGazetteFinalizeAdmissionRequestArtifact,
  parseCnipaGazetteFactAdmissionReceiptArtifact,
} from "./cnipa-gazette-fact-admission-artifacts";
import {
  type CnipaGazetteDurableArtifactReader,
  type CnipaGazetteDurableArtifactReference,
  cnipaGazetteArtifactMatchesReference,
} from "./cnipa-gazette-fact-admission-job-acquirer";

export const CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID = "cnipa-gazette-finalize-request-builder";
export const CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION = "1.0.0";
export const CNIPA_GAZETTE_FINALIZE_JOB_SOURCE =
  "markorbit://knowledge/cnipa-gazette/finalize-readiness";
export const CNIPA_GAZETTE_FINALIZE_JOB_EXECUTOR: ExecutionExecutor = {
  executorId: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID,
  version: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

export type CnipaGazetteFinalizeJobAcquirerOptions = {
  reader: CnipaGazetteDurableArtifactReader;
};

type FinalizeInputs = {
  datasetIdentityRef: CnipaGazetteDurableArtifactReference;
  chunkReceiptRefs: CnipaGazetteDurableArtifactReference[];
};

const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const DURABLE_RECEIPT_READ_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  let firstError: unknown;

  const worker = async () => {
    while (firstError === undefined) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await operation(items[index] as T, index);
      } catch (error) {
        if (firstError === undefined) firstError = error;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  if (firstError !== undefined) throw firstError;
  return results;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_FINALIZE_JOB_CONFIG_INVALID",
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
      "CNIPA_GAZETTE_FINALIZE_JOB_CONFIG_INVALID",
      `${label} contains unsupported keys: ${unexpected.join(", ")}`,
      false,
    );
  }
}

function durableReference(value: unknown, label: string): CnipaGazetteDurableArtifactReference {
  const raw = objectValue(value, label);
  exactKeys(raw, ["artifactId", "canonicalUri", "sha256", "sizeBytes"], label);
  if (typeof raw.artifactId !== "string" || !ARTIFACT_ID.test(raw.artifactId)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_FINALIZE_JOB_CONFIG_INVALID",
      `${label}.artifactId must be a RawArtifact id`,
      false,
    );
  }
  if (typeof raw.canonicalUri !== "string" || !raw.canonicalUri.trim()) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_FINALIZE_JOB_CONFIG_INVALID",
      `${label}.canonicalUri is required`,
      false,
    );
  }
  if (typeof raw.sha256 !== "string" || !SHA256.test(raw.sha256)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_FINALIZE_JOB_CONFIG_INVALID",
      `${label}.sha256 must be 64 lowercase hexadecimal characters`,
      false,
    );
  }
  if (!Number.isSafeInteger(raw.sizeBytes) || (raw.sizeBytes as number) < 1) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_FINALIZE_JOB_CONFIG_INVALID",
      `${label}.sizeBytes must be a positive safe integer`,
      false,
    );
  }
  return {
    artifactId: raw.artifactId,
    canonicalUri: raw.canonicalUri.trim(),
    sha256: raw.sha256,
    sizeBytes: raw.sizeBytes as number,
  };
}

function requireSourceBoundary(context: ArtifactBackedExecutionContext): void {
  const source = context.job.sourceSnapshot;
  if (
    source.sourceType !== "DATABASE" ||
    source.connector.connectorId !== CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID ||
    source.connector.version !== CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION ||
    context.job.connector.connectorId !== CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID ||
    context.job.connector.version !== CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION ||
    source.canonicalUri !== CNIPA_GAZETTE_FINALIZE_JOB_SOURCE
  ) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_FINALIZE_SOURCE_BOUNDARY_INVALID",
      "Gazette finalize jobs require the governed durable Knowledge artifact source",
      false,
    );
  }
  if (!context.job.planSnapshot.output.artifactKinds.includes("JSON")) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_OUTPUT_KIND_INVALID",
      "Gazette finalize jobs must authorize JSON request artifacts",
      false,
    );
  }
}

function inputsFromContext(context: ArtifactBackedExecutionContext): FinalizeInputs {
  requireSourceBoundary(context);
  const config = objectValue(context.job.sourceSnapshot.connectorConfig, "connectorConfig");
  exactKeys(
    config,
    ["intent", "datasetIdentityRef", "chunkReceiptRefs"],
    "Gazette finalize connectorConfig",
  );
  if (config.intent !== "BUILD_FINALIZE_REQUEST") {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_FINALIZE_JOB_CONFIG_INVALID",
      "Gazette finalize connectorConfig.intent must be BUILD_FINALIZE_REQUEST",
      false,
    );
  }
  if (!Array.isArray(config.chunkReceiptRefs) || config.chunkReceiptRefs.length < 1) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_FINALIZE_JOB_CONFIG_INVALID",
      "chunkReceiptRefs must contain at least one durable CHUNK receipt",
      false,
    );
  }
  if (config.chunkReceiptRefs.length > 10_000) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_FINALIZE_JOB_CONFIG_INVALID",
      "chunkReceiptRefs exceeds the bounded finalize input limit",
      false,
    );
  }
  const datasetIdentityRef = durableReference(config.datasetIdentityRef, "datasetIdentityRef");
  const chunkReceiptRefs = config.chunkReceiptRefs.map((value, index) =>
    durableReference(value, `chunkReceiptRefs[${index}]`),
  );
  const ids = [datasetIdentityRef, ...chunkReceiptRefs].map((value) => value.artifactId);
  if (new Set(ids).size !== ids.length) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_FINALIZE_JOB_CONFIG_INVALID",
      "finalize artifact references must use unique RawArtifact ids",
      false,
    );
  }
  return { datasetIdentityRef, chunkReceiptRefs };
}

async function readVerified(
  reader: CnipaGazetteDurableArtifactReader,
  reference: CnipaGazetteDurableArtifactReference,
  context: ArtifactBackedExecutionContext,
): Promise<AcquiredCollectionArtifact> {
  const artifact = await reader.read(reference.artifactId, context);
  if (!cnipaGazetteArtifactMatchesReference(reference, artifact)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_FINALIZE_DURABLE_ARTIFACT_MISMATCH",
      `Loaded Gazette artifact ${reference.artifactId} does not match its immutable Job reference`,
      false,
    );
  }
  return artifact;
}

function latestReceiptObservedAt(receipts: readonly AcquiredCollectionArtifact[]): string {
  const observed = receipts.map((artifact) => {
    const parsed = parseCnipaGazetteFactAdmissionReceiptArtifact(artifact);
    if (parsed.operation !== "CHUNK") {
      throw new CollectionAcquisitionError(
        "CNIPA_GAZETTE_FINALIZE_READINESS_INVALID",
        "Finalize readiness accepts only committed CHUNK receipt artifacts",
        false,
      );
    }
    return parsed.observedAt;
  });
  return observed.sort((left, right) => Date.parse(left) - Date.parse(right)).at(-1)!;
}

export class CnipaGazetteFinalizeJobAcquirer implements CollectionArtifactAcquirer {
  readonly executor = CNIPA_GAZETTE_FINALIZE_JOB_EXECUTOR;

  constructor(private readonly options: CnipaGazetteFinalizeJobAcquirerOptions) {}

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const inputs = inputsFromContext(context);
    const datasetArtifact = await readVerified(
      this.options.reader,
      inputs.datasetIdentityRef,
      context,
    );
    const receiptArtifacts = await mapWithConcurrency(
      inputs.chunkReceiptRefs,
      DURABLE_RECEIPT_READ_CONCURRENCY,
      (reference) => readVerified(this.options.reader, reference, context),
    );

    let datasetIdentity;
    try {
      datasetIdentity = parseCnipaGazetteDatasetIdentityArtifact(datasetArtifact);
    } catch (error) {
      throw new CollectionAcquisitionError(
        "CNIPA_GAZETTE_FINALIZE_READINESS_INVALID",
        error instanceof Error ? error.message : "Gazette dataset identity is invalid",
        false,
      );
    }
    const collectedAt = latestReceiptObservedAt(receiptArtifacts);
    const finalizePackage = buildCnipaGazetteDataEngineFinalizePackage({
      datasetIdentity,
      collectedAt,
    });
    let requestArtifact;
    try {
      requestArtifact = buildCnipaGazetteFinalizeAdmissionRequestArtifact({
        package: finalizePackage,
        datasetIdentityCanonicalUri: inputs.datasetIdentityRef.canonicalUri,
        chunkReceiptArtifacts: receiptArtifacts,
        createdAt: collectedAt,
      });
    } catch (error) {
      if (error instanceof CollectionAcquisitionError) throw error;
      throw new CollectionAcquisitionError(
        "CNIPA_GAZETTE_FINALIZE_READINESS_INVALID",
        error instanceof Error ? error.message : "Gazette finalize coverage is invalid",
        false,
      );
    }

    return [
      {
        ...requestArtifact,
        parentCanonicalUris: undefined,
        parentArtifactIds: [
          inputs.datasetIdentityRef.artifactId,
          ...inputs.chunkReceiptRefs.map((reference) => reference.artifactId),
        ].sort(),
      },
    ];
  }
}

export function cnipaGazetteFinalizeJobRuntimeDescriptor() {
  return Object.freeze({
    connectorId: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID,
    connectorVersion: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION,
    sourceType: "DATABASE" as const,
    source: CNIPA_GAZETTE_FINALIZE_JOB_SOURCE,
    inputMustBeDurableRawArtifacts: true as const,
    durableReceiptReadConcurrency: DURABLE_RECEIPT_READ_CONCURRENCY,
    contiguousChunkCoverageRequired: true as const,
    dataEngineWritePerformed: false as const,
    cnipaNetworkAccessRequired: false as const,
    artifactBackedFinalizeRequestRequired: true as const,
    historicalReplayActivated: false as const,
  });
}
