import { createHash } from "node:crypto";
import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { FactAdmissionHttpError, type FactAdmissionClient } from "./fact-admission-http-client";

export const GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID =
  "global-trademark-fact-admission-publisher";
export const GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION = "1.0.0";
export const GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE =
  "markorbit://knowledge/global-trademark/fact-admission-requests";
export const GLOBAL_TRADEMARK_FACT_ADMISSION_PATH =
  "/api/admin/v2/fact-admissions/global/observations";
export const GLOBAL_TRADEMARK_ADMISSION_CONTRACT = "GLOBAL_TRADEMARK_STRUCTURED_ADMISSION_V1";
export const GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT = "GLOBAL_TRADEMARK_STRUCTURED_ADMISSION_V2";
export const GLOBAL_TRADEMARK_RECEIPT_SCHEMA = "GLOBAL_TRADEMARK_FACT_ADMISSION_RECEIPT_V1";
export const GLOBAL_TRADEMARK_ADMISSION_REQUEST_SCHEMA =
  "GLOBAL_TRADEMARK_FACT_ADMISSION_REQUEST_V1";
export const GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA =
  "GLOBAL_TRADEMARK_FACT_ADMISSION_REQUEST_V2";

export const GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_EXECUTOR: ExecutionExecutor = {
  executorId: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID,
  version: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

export type GlobalTrademarkDurableArtifactReference = {
  artifactId: string;
  canonicalUri: string;
  sha256: string;
  sizeBytes: number;
};
export interface GlobalTrademarkDurableArtifactReader {
  read(
    artifactId: string,
    context: ArtifactBackedExecutionContext,
  ): Promise<AcquiredCollectionArtifact>;
}
export type GlobalTrademarkFactAdmissionJobOptions = {
  reader: GlobalTrademarkDurableArtifactReader;
  client: FactAdmissionClient;
  clock?: () => string;
  /** Extra operator-controlled gate; default false even when V2 code is installed. */
  fullBaselineEnabled?: boolean;
};

const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function invalid(message: string): CollectionAcquisitionError {
  return new CollectionAcquisitionError(
    "GLOBAL_TRADEMARK_PUBLISH_JOB_CONFIG_INVALID",
    message,
    false,
  );
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(label + " must be an object");
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
  if (unexpected.length) {
    throw invalid(label + " contains unsupported keys: " + unexpected.join(", "));
  }
}
function requiredText(value: unknown, label: string, max = 4096): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw invalid(label + " must be a bounded non-empty string");
  }
  return value.trim();
}
function requestReference(
  context: ArtifactBackedExecutionContext,
): GlobalTrademarkDurableArtifactReference {
  const source = context.job.sourceSnapshot;
  const connector = context.job.connector;
  if (
    source.sourceType !== "DATABASE" ||
    source.canonicalUri !== GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE ||
    connector.connectorId !== GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID ||
    connector.version !== GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION ||
    source.connector.connectorId !== GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID ||
    source.connector.version !== GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION
  ) {
    throw new CollectionAcquisitionError(
      "GLOBAL_TRADEMARK_PUBLISH_SOURCE_BOUNDARY_INVALID",
      "Global trademark publisher requires the governed durable Knowledge request source",
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
  const ref = record(config.requestArtifactRef, "requestArtifactRef");
  exactKeys(ref, ["artifactId", "canonicalUri", "sha256", "sizeBytes"], "requestArtifactRef");
  const artifactId = requiredText(ref.artifactId, "requestArtifactRef.artifactId", 64);
  const canonicalUri = requiredText(ref.canonicalUri, "requestArtifactRef.canonicalUri");
  const sha256 = requiredText(ref.sha256, "requestArtifactRef.sha256", 64).toLowerCase();
  if (!ARTIFACT_ID.test(artifactId)) throw invalid("requestArtifactRef.artifactId is invalid");
  if (!SHA256.test(sha256)) throw invalid("requestArtifactRef.sha256 is invalid");
  if (!Number.isSafeInteger(ref.sizeBytes) || (ref.sizeBytes as number) < 1) {
    throw invalid("requestArtifactRef.sizeBytes must be a positive safe integer");
  }
  if (!canonicalUri.endsWith("/fact-admission-request")) {
    throw invalid("requestArtifactRef.canonicalUri must identify a fact-admission request");
  }
  return { artifactId, canonicalUri, sha256, sizeBytes: ref.sizeBytes as number };
}
function verifyLoaded(
  reference: GlobalTrademarkDurableArtifactReference,
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
      "GLOBAL_TRADEMARK_DURABLE_REQUEST_MISMATCH",
      "Loaded global trademark request does not match immutable Job reference",
      false,
    );
  }
  return artifact;
}
function parsePreparedRequest(
  artifact: AcquiredCollectionArtifact,
  options: { fullBaselineEnabled: boolean; manualJob: boolean },
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifact.content));
  } catch {
    throw invalid("Durable fact-admission request must be valid UTF-8 JSON");
  }
  const root = record(value, "request");
  exactKeys(
    root,
    [
      "schemaVersion",
      "method",
      "path",
      "status",
      "fullCollectionAuthorized",
      "evidenceCanonicalUri",
      "payload",
    ],
    "request",
  );
  const payload = record(root.payload, "request.payload");
  const isFull = payload.contract_version === GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT;
  if (
    root.schemaVersion !==
      (isFull
        ? GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA
        : GLOBAL_TRADEMARK_ADMISSION_REQUEST_SCHEMA) ||
    root.method !== "POST" ||
    root.path !== GLOBAL_TRADEMARK_FACT_ADMISSION_PATH ||
    root.status !== "PREPARED_NOT_DISPATCHED" ||
    root.fullCollectionAuthorized !== isFull
  ) {
    throw invalid("Durable request method/path/status/authorization boundary is invalid");
  }
  if (isFull && (!options.fullBaselineEnabled || !options.manualJob)) {
    throw invalid(
      "Full baseline publisher requires operator activation and a manual immutable Job",
    );
  }
  if (isFull) {
    const sourceTotal = payload.source_total;
    const page = payload.page_index;
    const kind = payload.observation_kind;
    if (
      (kind === "FULL_INDEX_PAGE" &&
        (!Number.isSafeInteger(sourceTotal) ||
          (sourceTotal as number) <= 100 ||
          (sourceTotal as number) > 100_000 ||
          !Number.isSafeInteger(page) ||
          (page as number) < 1 ||
          (page as number) > Math.ceil((sourceTotal as number) / 50))) ||
      (kind === "FULL_DETAIL" && (page !== 0 || sourceTotal !== undefined)) ||
      (kind !== "FULL_INDEX_PAGE" && kind !== "FULL_DETAIL")
    ) {
      throw invalid("Full baseline request exceeds reviewed index/detail bounds");
    }
  }
  const evidenceCanonicalUri = requiredText(
    root.evidenceCanonicalUri,
    "request.evidenceCanonicalUri",
  );
  if (
    payload.contract_version !==
      (isFull ? GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT : GLOBAL_TRADEMARK_ADMISSION_CONTRACT) ||
    payload.source_owner !== "MARKORBIT_KNOWLEDGE" ||
    payload.evidence_canonical_uri !== evidenceCanonicalUri
  ) {
    throw invalid("Durable request payload provenance/contract boundary is invalid");
  }
  return payload;
}
function receiptArtifact(input: {
  request: GlobalTrademarkDurableArtifactReference;
  payload: Record<string, unknown>;
  admittedAt: string;
  receipt: Record<string, unknown>;
}): AcquiredCollectionArtifact {
  if (input.receipt.outcome !== "BOUNDED_OBSERVATIONS_ADMITTED") {
    throw new CollectionAcquisitionError(
      "GLOBAL_TRADEMARK_ADMISSION_RECEIPT_INVALID",
      "Data Engine returned unexpected admission outcome",
      false,
    );
  }
  const expectedEcho: ReadonlyArray<readonly [string, unknown]> = [
    ["contract_version", input.payload.contract_version],
    ["jurisdiction", input.payload.jurisdiction],
    ["source_id", input.payload.source_id],
    ["observation_kind", input.payload.observation_kind],
    ["page_index", input.payload.page_index],
    ["source_response_sha256", input.payload.source_response_sha256],
    ["evidence_sha256", input.payload.evidence_sha256],
    ...(input.payload.contract_version === GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT &&
    input.payload.observation_kind === "FULL_INDEX_PAGE"
      ? ([["source_total", input.payload.source_total]] as const)
      : []),
  ];
  const records = input.payload.records;
  if (
    input.receipt.storage_placement !== "hot_global" ||
    input.receipt.current_state_verified !== false ||
    expectedEcho.some(([key, expected]) => input.receipt[key] !== expected) ||
    !Array.isArray(records) ||
    input.receipt.record_count !== records.length ||
    !Number.isSafeInteger(input.receipt.inserted_count) ||
    (input.receipt.inserted_count as number) < 0 ||
    (input.receipt.inserted_count as number) > records.length ||
    typeof input.receipt.replayed !== "boolean" ||
    (input.receipt.replayed === true && input.receipt.inserted_count !== 0)
  ) {
    throw new CollectionAcquisitionError(
      "GLOBAL_TRADEMARK_ADMISSION_RECEIPT_INVALID",
      "Data Engine receipt does not match the exact admitted evidence and hot_global placement",
      false,
    );
  }
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: "global-trademark-fact-admission-receipt.json",
    sourceUri: "markorbit://raw-artifact/" + input.request.artifactId,
    canonicalUri: input.request.canonicalUri + "/receipt",
    parentArtifactIds: [input.request.artifactId],
    content: new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: GLOBAL_TRADEMARK_RECEIPT_SCHEMA,
        requestArtifactId: input.request.artifactId,
        requestCanonicalUri: input.request.canonicalUri,
        requestSha256: input.request.sha256,
        admittedAt: input.admittedAt,
        receipt: input.receipt,
      }),
    ),
  };
}
function observedAt(clock: () => string): string {
  const value = clock();
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw invalid("Publisher clock must return an ISO-8601 instant");
  }
  return value;
}

export class GlobalTrademarkFactAdmissionJobAcquirer implements CollectionArtifactAcquirer {
  readonly executor = GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_EXECUTOR;
  private readonly clock: () => string;

  constructor(private readonly options: GlobalTrademarkFactAdmissionJobOptions) {
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const reference = requestReference(context);
    const loaded = verifyLoaded(
      reference,
      await this.options.reader.read(reference.artifactId, context),
    );
    const payload = parsePreparedRequest(loaded, {
      fullBaselineEnabled: this.options.fullBaselineEnabled === true,
      manualJob: context.job.planSnapshot.schedule?.mode === "MANUAL",
    });
    try {
      const receipt = await this.options.client.post(GLOBAL_TRADEMARK_FACT_ADMISSION_PATH, payload);
      return [
        receiptArtifact({
          request: reference,
          payload,
          admittedAt: observedAt(this.clock),
          receipt,
        }),
      ];
    } catch (error) {
      if (error instanceof FactAdmissionHttpError) {
        throw new CollectionAcquisitionError(error.code, error.message, error.retryable);
      }
      throw error;
    }
  }
}
export function globalTrademarkFactAdmissionJobRuntimeDescriptor() {
  return Object.freeze({
    connectorId: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID,
    connectorVersion: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
    sourceType: "DATABASE" as const,
    source: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE,
    inputMustBeDurableRawArtifact: true as const,
    requestIntegrityVerifiedBeforeDataEngineWrite: true as const,
    sourceNetworkAccessRequired: false as const,
    factAdmissionOnly: true as const,
    hotGlobalReceiptRequired: true as const,
    currentStateAuthority: false as const,
  });
}
