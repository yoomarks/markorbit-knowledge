import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import {
  USPTO_TSDR_API_ORIGIN,
  admitUsptoTsdrAcquisition,
  type UsptoTsdrAcquisitionRequest,
  type UsptoTsdrDocumentIndexRequest,
  type UsptoTsdrSelectedDocumentRequest,
} from "./uspto-tsdr-acquisition-policy";
import {
  UsptoTsdrDocumentIndexAcquirer,
  type UsptoTsdrIndexTransport,
  type UsptoTsdrSecretResolver,
} from "./uspto-tsdr-document-index-acquirer";
import {
  UsptoTsdrSelectedDocumentAcquirer,
  type UsptoTsdrBinaryTransport,
} from "./uspto-tsdr-selected-document-acquirer";

export const USPTO_TSDR_JOB_CONNECTOR_ID = "uspto-tsdr";
export const USPTO_TSDR_JOB_CONNECTOR_VERSION = "1.0.0";
export const USPTO_TSDR_JOB_EXECUTOR: ExecutionExecutor = {
  executorId: USPTO_TSDR_JOB_CONNECTOR_ID,
  version: USPTO_TSDR_JOB_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

export type UsptoTsdrJobArtifactAcquirerOptions = {
  secretResolver: UsptoTsdrSecretResolver;
  indexTransport?: UsptoTsdrIndexTransport;
  binaryTransport?: UsptoTsdrBinaryTransport;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
      "TSDR_JOB_CONFIG_INVALID",
      `${label} contains unsupported keys: ${unexpected.join(", ")}`,
      false,
    );
  }
}

function requireSourceBoundary(context: ArtifactBackedExecutionContext): void {
  const source = context.job.sourceSnapshot;
  if (
    source.sourceType !== "API" ||
    source.connector.connectorId !== USPTO_TSDR_JOB_CONNECTOR_ID ||
    source.connector.version !== USPTO_TSDR_JOB_CONNECTOR_VERSION ||
    source.canonicalUri !== USPTO_TSDR_API_ORIGIN
  ) {
    throw new CollectionAcquisitionError(
      "TSDR_SOURCE_BOUNDARY_INVALID",
      "TSDR jobs require the governed USPTO TSDR API source identity",
      false,
    );
  }
}

function requestFromJob(context: ArtifactBackedExecutionContext): UsptoTsdrAcquisitionRequest {
  requireSourceBoundary(context);
  const source = context.job.sourceSnapshot;
  const config = record(source.connectorConfig);
  if (!config) {
    throw new CollectionAcquisitionError(
      "TSDR_JOB_CONFIG_INVALID",
      "TSDR source requires connectorConfig",
      false,
    );
  }
  if (!source.secretRef) {
    throw new CollectionAcquisitionError(
      "TSDR_SECRET_REFERENCE_REQUIRED",
      "TSDR source requires a governed secretRef",
      false,
    );
  }

  const shared = {
    serialNumber: config.serialNumber,
    secretRef: source.secretRef,
    requestsPerMinute: context.job.planSnapshot.policy.rateLimitPerMinute,
    coverageClaim: "TARGET_SERIAL_ONLY" as const,
    legalEffectClaim: false as const,
  };

  if (config.intent === "CASE_DOCUMENT_INDEX") {
    exactKeys(config, ["intent", "serialNumber"], "TSDR index connectorConfig");
    const request = {
      intent: "CASE_DOCUMENT_INDEX" as const,
      ...shared,
    };
    const admission = admitUsptoTsdrAcquisition(request);
    if (!context.job.planSnapshot.output.artifactKinds.includes("XML")) {
      throw new CollectionAcquisitionError(
        "TSDR_OUTPUT_KIND_INVALID",
        "TSDR document-index jobs must admit XML output",
        false,
      );
    }
    return {
      intent: "CASE_DOCUMENT_INDEX",
      serialNumber: admission.serialNumber,
      secretRef: admission.secretRef,
      requestsPerMinute: admission.requestBudgetPerMinute,
      coverageClaim: "TARGET_SERIAL_ONLY",
      legalEffectClaim: false,
    } satisfies UsptoTsdrDocumentIndexRequest;
  }

  if (config.intent === "SELECTED_DOCUMENT_BINARY") {
    exactKeys(
      config,
      ["intent", "serialNumber", "format", "purpose", "businessChain", "document"],
      "TSDR selected-document connectorConfig",
    );
    const request = {
      intent: "SELECTED_DOCUMENT_BINARY" as const,
      ...shared,
      format: config.format,
      purpose: config.purpose,
      businessChain: config.businessChain,
      document: config.document,
    };
    const admission = admitUsptoTsdrAcquisition(request);
    if (
      !admission.format ||
      !admission.purpose ||
      !admission.businessChain ||
      !admission.document
    ) {
      throw new CollectionAcquisitionError(
        "TSDR_JOB_CONFIG_INVALID",
        "TSDR selected-document admission is incomplete",
        false,
      );
    }
    const artifactKind = admission.format === "PDF" ? "PDF" : "OTHER";
    if (!context.job.planSnapshot.output.artifactKinds.includes(artifactKind)) {
      throw new CollectionAcquisitionError(
        "TSDR_OUTPUT_KIND_INVALID",
        `TSDR selected-document ${admission.format} jobs must admit ${artifactKind} output`,
        false,
      );
    }
    return {
      intent: "SELECTED_DOCUMENT_BINARY",
      serialNumber: admission.serialNumber,
      secretRef: admission.secretRef,
      requestsPerMinute: admission.requestBudgetPerMinute,
      coverageClaim: "TARGET_SERIAL_ONLY",
      legalEffectClaim: false,
      format: admission.format,
      purpose: admission.purpose,
      businessChain: admission.businessChain,
      document: admission.document,
    } satisfies UsptoTsdrSelectedDocumentRequest;
  }

  throw new CollectionAcquisitionError(
    "TSDR_JOB_CONFIG_INVALID",
    "TSDR connectorConfig.intent must be CASE_DOCUMENT_INDEX or SELECTED_DOCUMENT_BINARY",
    false,
  );
}

export class UsptoTsdrJobArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = USPTO_TSDR_JOB_EXECUTOR;

  constructor(private readonly options: UsptoTsdrJobArtifactAcquirerOptions) {}

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const request = requestFromJob(context);
    if (request.intent === "CASE_DOCUMENT_INDEX") {
      return new UsptoTsdrDocumentIndexAcquirer({
        request,
        secretResolver: this.options.secretResolver,
        ...(this.options.indexTransport ? { transport: this.options.indexTransport } : {}),
      }).acquire(context);
    }
    return new UsptoTsdrSelectedDocumentAcquirer({
      request,
      secretResolver: this.options.secretResolver,
      ...(this.options.binaryTransport ? { transport: this.options.binaryTransport } : {}),
    }).acquire(context);
  }
}

export function usptoTsdrJobRuntimeDescriptor() {
  return Object.freeze({
    connectorId: USPTO_TSDR_JOB_CONNECTOR_ID,
    connectorVersion: USPTO_TSDR_JOB_CONNECTOR_VERSION,
    sourceType: "API" as const,
    officialOrigin: USPTO_TSDR_API_ORIGIN,
    requestDerivedFromImmutableJobSnapshot: true as const,
    rawSecretForbidden: true as const,
    artifactBackedIngestionRequired: true as const,
  });
}
