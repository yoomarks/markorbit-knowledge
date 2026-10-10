import { createHash } from "node:crypto";
import { assertTmclassSourceEvidenceV1, type TmclassSourceEvidenceV1 } from "@markorbit/contracts";
import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { FactAdmissionHttpError, type FactAdmissionClient } from "./fact-admission-http-client";

export const TMCLASS_FACT_ADMISSION_CONNECTOR_ID = "tmclass-fact-admission-publisher";
export const TMCLASS_FACT_ADMISSION_CONNECTOR_VERSION = "1.0.0";
export const TMCLASS_FACT_ADMISSION_SOURCE =
  "markorbit://knowledge/tmclass/fact-admission-requests";
export const TMCLASS_FACT_ADMISSION_PATH = "/api/admin/v2/fact-admissions/tmclass/evidence";

export const TMCLASS_FACT_ADMISSION_EXECUTOR: ExecutionExecutor = {
  executorId: TMCLASS_FACT_ADMISSION_CONNECTOR_ID,
  version: TMCLASS_FACT_ADMISSION_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

export type TmclassDurableArtifactReference = {
  artifactId: string;
  canonicalUri: string;
  sha256: string;
  sizeBytes: number;
};

export interface TmclassDurableArtifactReader {
  read(
    artifactId: string,
    context: ArtifactBackedExecutionContext,
  ): Promise<AcquiredCollectionArtifact>;
}

const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function invalid(message: string): CollectionAcquisitionError {
  return new CollectionAcquisitionError("TMCLASS_PUBLISH_JOB_CONFIG_INVALID", message, false);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function reference(context: ArtifactBackedExecutionContext): TmclassDurableArtifactReference {
  const source = context.job.sourceSnapshot;
  const connector = context.job.connector;
  if (
    source.sourceType !== "DATABASE" ||
    source.canonicalUri !== TMCLASS_FACT_ADMISSION_SOURCE ||
    connector.connectorId !== TMCLASS_FACT_ADMISSION_CONNECTOR_ID ||
    connector.version !== TMCLASS_FACT_ADMISSION_CONNECTOR_VERSION ||
    source.connector.connectorId !== TMCLASS_FACT_ADMISSION_CONNECTOR_ID ||
    source.connector.version !== TMCLASS_FACT_ADMISSION_CONNECTOR_VERSION
  ) {
    throw new CollectionAcquisitionError(
      "TMCLASS_PUBLISH_SOURCE_BOUNDARY_INVALID",
      "TMclass publisher requires the governed durable Knowledge evidence source",
      false,
    );
  }
  if (!context.job.planSnapshot.output.artifactKinds.includes("JSON")) {
    throw invalid("Publisher CollectionPlan must authorize JSON receipt artifacts");
  }
  const config = record(source.connectorConfig, "connectorConfig");
  if (
    config.intent !== "PUBLISH_DURABLE_TMCLASS_EVIDENCE" ||
    Object.keys(config).some((key) => key !== "intent" && key !== "evidenceArtifactRef")
  ) {
    throw invalid("connectorConfig must select one durable TMclass evidence artifact");
  }
  const raw = record(config.evidenceArtifactRef, "evidenceArtifactRef");
  if (
    Object.keys(raw).some(
      (key) => !["artifactId", "canonicalUri", "sha256", "sizeBytes"].includes(key),
    )
  ) {
    throw invalid("evidenceArtifactRef contains unsupported fields");
  }
  if (typeof raw.artifactId !== "string" || !ARTIFACT_ID.test(raw.artifactId)) {
    throw invalid("evidenceArtifactRef.artifactId is invalid");
  }
  if (
    typeof raw.canonicalUri !== "string" ||
    !raw.canonicalUri.startsWith("markorbit://knowledge/tmclass/") ||
    !raw.canonicalUri.endsWith("/source-evidence")
  ) {
    throw invalid("evidenceArtifactRef.canonicalUri must identify TMclass source evidence");
  }
  if (typeof raw.sha256 !== "string" || !SHA256.test(raw.sha256)) {
    throw invalid("evidenceArtifactRef.sha256 is invalid");
  }
  if (!Number.isSafeInteger(raw.sizeBytes) || (raw.sizeBytes as number) < 1) {
    throw invalid("evidenceArtifactRef.sizeBytes must be a positive safe integer");
  }
  return {
    artifactId: raw.artifactId,
    canonicalUri: raw.canonicalUri,
    sha256: raw.sha256,
    sizeBytes: raw.sizeBytes as number,
  };
}

function parseEvidence(
  expected: TmclassDurableArtifactReference,
  artifact: AcquiredCollectionArtifact,
): TmclassSourceEvidenceV1 {
  const digest = createHash("sha256").update(artifact.content).digest("hex");
  if (
    artifact.artifactKind !== "JSON" ||
    artifact.canonicalUri !== expected.canonicalUri ||
    artifact.content.byteLength !== expected.sizeBytes ||
    digest !== expected.sha256
  ) {
    throw new CollectionAcquisitionError(
      "TMCLASS_DURABLE_EVIDENCE_MISMATCH",
      "Loaded TMclass evidence does not match its immutable Job reference",
      false,
    );
  }
  let value: TmclassSourceEvidenceV1;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifact.content));
    assertTmclassSourceEvidenceV1(value);
  } catch (error) {
    throw invalid(error instanceof Error ? error.message : "TMclass evidence JSON is invalid");
  }
  return value;
}

function receiptArtifact(
  request: TmclassDurableArtifactReference,
  evidence: TmclassSourceEvidenceV1,
  receipt: Record<string, unknown>,
): AcquiredCollectionArtifact {
  if (
    receipt.outcome !== "TMCLASS_SOURCE_EVIDENCE_ADMITTED" ||
    receipt.contract_version !== evidence.contractVersion ||
    receipt.source_id !== evidence.sourceId ||
    receipt.raw_artifact_id !== evidence.evidence.rawArtifactId ||
    receipt.page_kind !== evidence.page.pageKind ||
    typeof receipt.replayed !== "boolean" ||
    typeof receipt.facts !== "object" ||
    receipt.facts === null
  ) {
    throw new CollectionAcquisitionError(
      "TMCLASS_ADMISSION_RECEIPT_INVALID",
      "Data Engine receipt does not match the exact TMclass source evidence",
      false,
    );
  }
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: "tmclass-fact-admission-receipt.json",
    sourceUri: `markorbit://raw-artifact/${request.artifactId}`,
    canonicalUri: `${request.canonicalUri}/receipt`,
    parentArtifactIds: [request.artifactId],
    content: new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: "TMCLASS_FACT_ADMISSION_RECEIPT_V1",
        evidenceArtifactId: request.artifactId,
        evidenceArtifactSha256: request.sha256,
        receipt,
      }),
    ),
  };
}

export class TmclassFactAdmissionJobAcquirer implements CollectionArtifactAcquirer {
  readonly executor = TMCLASS_FACT_ADMISSION_EXECUTOR;

  constructor(
    private readonly reader: TmclassDurableArtifactReader,
    private readonly client: FactAdmissionClient,
  ) {}

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const expected = reference(context);
    const evidence = parseEvidence(expected, await this.reader.read(expected.artifactId, context));
    try {
      const receipt = await this.client.post(TMCLASS_FACT_ADMISSION_PATH, evidence);
      return [receiptArtifact(expected, evidence, receipt)];
    } catch (error) {
      if (error instanceof FactAdmissionHttpError) {
        throw new CollectionAcquisitionError(error.code, error.message, error.retryable);
      }
      throw error;
    }
  }
}
