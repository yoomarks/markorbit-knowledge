import { createHash } from "node:crypto";
import { isWipoMgsSnapshot, type ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { FactAdmissionHttpError, type FactAdmissionClient } from "./fact-admission-http-client";
import {
  WIPO_MGS_ADMISSION_CONTRACT,
  WIPO_MGS_ADMISSION_PATH,
  WIPO_MGS_ADMISSION_REQUEST_SCHEMA,
  WIPO_MGS_MAPPING_VERSION,
} from "./wipo-mgs-data-engine-handoff";
import { canonicalWipoMgsJson } from "./wipo-source-adapter";

export const WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_ID = "wipo-mgs-fact-admission-publisher";
export const WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_VERSION = "1.0.0";
export const WIPO_MGS_FACT_ADMISSION_JOB_SOURCE =
  "markorbit://knowledge/wipo-mgs/fact-admission-requests";
export const WIPO_MGS_ADMISSION_RECEIPT_SCHEMA = "WIPO_MGS_FACT_ADMISSION_RECEIPT_V1";

export const WIPO_MGS_FACT_ADMISSION_JOB_EXECUTOR: ExecutionExecutor = {
  executorId: WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_ID,
  version: WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

export type WipoMgsDurableArtifactReference = {
  artifactId: string;
  canonicalUri: string;
  sha256: string;
  sizeBytes: number;
};

export interface WipoMgsDurableArtifactReader {
  read(
    artifactId: string,
    context: ArtifactBackedExecutionContext,
  ): Promise<AcquiredCollectionArtifact>;
}

export type WipoMgsFactAdmissionJobOptions = {
  reader: WipoMgsDurableArtifactReader;
  client: FactAdmissionClient;
  clock?: () => string;
};

const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function invalid(message: string): CollectionAcquisitionError {
  return new CollectionAcquisitionError("WIPO_MGS_PUBLISH_JOB_CONFIG_INVALID", message, false);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(`${label} must be an object`);
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
    throw invalid(`${label} contains unsupported keys: ${unexpected.join(", ")}`);
  }
}

function requiredText(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw invalid(`${label} must be a bounded non-empty string`);
  }
  return value.trim();
}

function durableReference(
  context: ArtifactBackedExecutionContext,
): WipoMgsDurableArtifactReference {
  const source = context.job.sourceSnapshot;
  const connector = context.job.connector;
  if (
    source.sourceType !== "DATABASE" ||
    source.canonicalUri !== WIPO_MGS_FACT_ADMISSION_JOB_SOURCE ||
    connector.connectorId !== WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_ID ||
    connector.version !== WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_VERSION ||
    source.connector.connectorId !== WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_ID ||
    source.connector.version !== WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_VERSION
  ) {
    throw new CollectionAcquisitionError(
      "WIPO_MGS_PUBLISH_SOURCE_BOUNDARY_INVALID",
      "WIPO MGS publisher requires the governed durable Knowledge request source",
      false,
    );
  }
  if (!context.job.planSnapshot.output.artifactKinds.includes("JSON")) {
    throw invalid("Publisher CollectionPlan must authorize JSON receipt artifacts");
  }
  const config = record(source.connectorConfig, "connectorConfig");
  exactKeys(config, ["intent", "requestArtifactRef"], "connectorConfig");
  if (config.intent !== "PUBLISH_DURABLE_REQUEST") {
    throw invalid("connectorConfig.intent must be PUBLISH_DURABLE_REQUEST");
  }
  const value = record(config.requestArtifactRef, "requestArtifactRef");
  exactKeys(value, ["artifactId", "canonicalUri", "sha256", "sizeBytes"], "requestArtifactRef");
  const artifactId = requiredText(value.artifactId, "requestArtifactRef.artifactId", 64);
  const canonicalUri = requiredText(value.canonicalUri, "requestArtifactRef.canonicalUri");
  const sha256 = requiredText(value.sha256, "requestArtifactRef.sha256", 64).toLowerCase();
  if (!ARTIFACT_ID.test(artifactId) || !SHA256.test(sha256)) {
    throw invalid("requestArtifactRef identity or SHA-256 is invalid");
  }
  if (!Number.isSafeInteger(value.sizeBytes) || (value.sizeBytes as number) < 1) {
    throw invalid("requestArtifactRef.sizeBytes must be a positive safe integer");
  }
  if (
    !canonicalUri.startsWith("wipo-mgs://") ||
    !canonicalUri.endsWith("/fact-admission-request")
  ) {
    throw invalid("requestArtifactRef.canonicalUri must identify a WIPO MGS admission request");
  }
  return { artifactId, canonicalUri, sha256, sizeBytes: value.sizeBytes as number };
}

function verifyLoaded(
  reference: WipoMgsDurableArtifactReference,
  artifact: AcquiredCollectionArtifact,
): AcquiredCollectionArtifact {
  const digest = createHash("sha256").update(artifact.content).digest("hex");
  if (
    artifact.artifactKind !== "JSON" ||
    artifact.canonicalUri !== reference.canonicalUri ||
    artifact.content.byteLength !== reference.sizeBytes ||
    digest !== reference.sha256
  ) {
    throw new CollectionAcquisitionError(
      "WIPO_MGS_DURABLE_REQUEST_MISMATCH",
      "Loaded WIPO MGS request does not match the immutable Job reference",
      false,
    );
  }
  return artifact;
}

function parsePreparedRequest(artifact: AcquiredCollectionArtifact): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifact.content));
  } catch {
    throw invalid("Durable WIPO MGS admission request must be valid UTF-8 JSON");
  }
  const root = record(value, "request");
  exactKeys(
    root,
    ["schemaVersion", "method", "path", "status", "evidenceCanonicalUri", "payload"],
    "request",
  );
  if (
    root.schemaVersion !== WIPO_MGS_ADMISSION_REQUEST_SCHEMA ||
    root.method !== "POST" ||
    root.path !== WIPO_MGS_ADMISSION_PATH ||
    root.status !== "PREPARED_NOT_DISPATCHED"
  ) {
    throw invalid("Durable request method/path/status boundary is invalid");
  }
  const payload = record(root.payload, "request.payload");
  exactKeys(
    payload,
    [
      "contract_version",
      "mapping_version",
      "source_owner",
      "source_id",
      "source_uri",
      "evidence_canonical_uri",
      "evidence_sha256",
      "observed_at",
      "snapshot",
    ],
    "request.payload",
  );
  const snapshot = payload.snapshot;
  const evidenceCanonicalUri = requiredText(
    root.evidenceCanonicalUri,
    "request.evidenceCanonicalUri",
  );
  if (
    payload.contract_version !== WIPO_MGS_ADMISSION_CONTRACT ||
    payload.mapping_version !== WIPO_MGS_MAPPING_VERSION ||
    payload.source_owner !== "MARKORBIT_KNOWLEDGE" ||
    payload.source_id !== "WIPO_MGS" ||
    payload.evidence_canonical_uri !== evidenceCanonicalUri ||
    !isWipoMgsSnapshot(snapshot) ||
    payload.evidence_sha256 !== snapshot.responseSha256 ||
    Number.isNaN(Date.parse(requiredText(payload.observed_at, "request.payload.observed_at", 48)))
  ) {
    throw invalid("Durable request payload provenance/contract boundary is invalid");
  }
  const expectedEvidence = `wipo-mgs://${snapshot.requestLanguage}/class/${String(snapshot.niceClass).padStart(2, "0")}/raw`;
  if (evidenceCanonicalUri !== expectedEvidence) {
    throw invalid("Durable request evidence does not match the snapshot scope");
  }
  return payload;
}

function receiptArtifact(input: {
  request: WipoMgsDurableArtifactReference;
  payload: Record<string, unknown>;
  admittedAt: string;
  receipt: Record<string, unknown>;
}): AcquiredCollectionArtifact {
  const snapshot = input.payload.snapshot as {
    requestLanguage: string;
    localeCode: string;
    niceClass: number;
    responseSha256: string;
    records: unknown[];
  };
  if (
    input.receipt.outcome !== "WIPO_MGS_SNAPSHOT_ADMITTED" ||
    input.receipt.contract_version !== WIPO_MGS_ADMISSION_CONTRACT ||
    input.receipt.source_id !== "WIPO_MGS" ||
    input.receipt.request_language !== snapshot.requestLanguage ||
    input.receipt.language !== snapshot.localeCode ||
    input.receipt.nice_class !== snapshot.niceClass ||
    input.receipt.source_response_sha256 !== snapshot.responseSha256 ||
    input.receipt.evidence_sha256 !== input.payload.evidence_sha256 ||
    input.receipt.storage_placement !== "hot_global" ||
    input.receipt.record_count !== snapshot.records.length ||
    !Number.isSafeInteger(input.receipt.inserted_count) ||
    (input.receipt.inserted_count as number) < 0 ||
    (input.receipt.inserted_count as number) > snapshot.records.length ||
    typeof input.receipt.replayed !== "boolean" ||
    (input.receipt.replayed === true && input.receipt.inserted_count !== 0)
  ) {
    throw new CollectionAcquisitionError(
      "WIPO_MGS_ADMISSION_RECEIPT_INVALID",
      "Data Engine receipt does not match the exact admitted MGS snapshot",
      false,
    );
  }
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: "wipo-mgs-fact-admission-receipt.json",
    sourceUri: `markorbit://raw-artifact/${input.request.artifactId}`,
    canonicalUri: `${input.request.canonicalUri}/receipt`,
    parentArtifactIds: [input.request.artifactId],
    content: new TextEncoder().encode(
      canonicalWipoMgsJson({
        schemaVersion: WIPO_MGS_ADMISSION_RECEIPT_SCHEMA,
        requestArtifactId: input.request.artifactId,
        requestCanonicalUri: input.request.canonicalUri,
        requestSha256: input.request.sha256,
        admittedAt: input.admittedAt,
        receipt: input.receipt,
      }),
    ),
  };
}

export class WipoMgsFactAdmissionJobAcquirer implements CollectionArtifactAcquirer {
  readonly executor = WIPO_MGS_FACT_ADMISSION_JOB_EXECUTOR;
  private readonly clock: () => string;

  constructor(private readonly options: WipoMgsFactAdmissionJobOptions) {
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const reference = durableReference(context);
    const request = verifyLoaded(
      reference,
      await this.options.reader.read(reference.artifactId, context),
    );
    const payload = parsePreparedRequest(request);
    try {
      const receipt = await this.options.client.post(WIPO_MGS_ADMISSION_PATH, payload);
      const admittedAt = this.clock();
      if (!admittedAt || Number.isNaN(Date.parse(admittedAt))) {
        throw invalid("Publisher clock must return an ISO-8601 instant");
      }
      return [receiptArtifact({ request: reference, payload, admittedAt, receipt })];
    } catch (error) {
      if (error instanceof FactAdmissionHttpError) {
        throw new CollectionAcquisitionError(error.code, error.message, error.retryable);
      }
      throw error;
    }
  }
}

export function wipoMgsFactAdmissionJobRuntimeDescriptor() {
  return Object.freeze({
    connectorId: WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_ID,
    connectorVersion: WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
    sourceType: "DATABASE" as const,
    source: WIPO_MGS_FACT_ADMISSION_JOB_SOURCE,
    inputMustBeDurableRawArtifact: true as const,
    requestIntegrityVerifiedBeforeDataEngineWrite: true as const,
    sourceNetworkAccessRequired: false as const,
    factAdmissionOnly: true as const,
    dataEngineStorageRequired: true as const,
  });
}
