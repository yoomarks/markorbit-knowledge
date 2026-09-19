import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import {
  acquireCnipaGazetteCheckpointRange,
  CNIPA_GAZETTE_DEFAULT_PAGES_PER_CHECKPOINT,
} from "./cnipa-gazette-checkpoint-acquirer";
import {
  buildCnipaGazetteDataEngineChunkPackage,
  buildCnipaGazetteDatasetIdentity,
  type CnipaGazetteDatasetIdentitySnapshot,
  validateCnipaGazetteDatasetIdentitySnapshot,
} from "./cnipa-gazette-data-engine-handoff";
import { buildCnipaGazetteChunkAdmissionRequestArtifact } from "./cnipa-gazette-fact-admission-artifacts";
import {
  CNIPA_GAZETTE_PUBLIC_ORIGIN,
  CnipaGazetteSourceError,
  type CnipaGazetteJsonTransport,
} from "./cnipa-gazette-page-acquirer";
import { CnipaAcquisitionError } from "./cnipa-trademark-judgment";

export const CNIPA_GAZETTE_JOB_CONNECTOR_ID = "cnipa-trademark-gazette";
export const CNIPA_GAZETTE_JOB_CONNECTOR_VERSION = "1.0.0";
export const CNIPA_GAZETTE_JOB_EXECUTOR: ExecutionExecutor = {
  executorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
  version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

const REQUEST_TEMPLATE_KEYS = new Set([
  "anncIssue",
  "anncType",
  "regNo",
  "tmName",
  "intlCls",
  "registerCnName",
  "coowner",
  "agentName",
  "tmType",
  "tmDescType",
  "startDate",
  "endDate",
  "pageIndex",
  "pageSize",
]);

const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;

type DatasetIdentityReference = {
  artifactId: string;
  canonicalUri: string;
  snapshot: CnipaGazetteDatasetIdentitySnapshot;
};
type GazetteCheckpointJob = {
  announcementIssue: number;
  range: { startPage: number; endPage: number };
  requestTemplate: Readonly<Record<string, string | number>>;
  pagesPerCheckpoint: number;
  datasetIdentityRef?: DatasetIdentityReference;
};

export type CnipaGazetteJobArtifactAcquirerOptions = {
  transport: CnipaGazetteJsonTransport;
  sleep?: (ms: number) => Promise<void>;
};

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      `${label} must be an object`,
      false,
    );
  }
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      `${label} must be a positive safe integer`,
      false,
    );
  }
  return value as number;
}

function text(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string") {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      `${label} must be a string`,
      false,
    );
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      `${label} must be non-empty and at most ${maximum} characters`,
      false,
    );
  }
  return normalized;
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
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      `${label} contains unsupported keys: ${unexpected.join(", ")}`,
      false,
    );
  }
}
function requireSourceBoundary(context: ArtifactBackedExecutionContext): void {
  const source = context.job.sourceSnapshot;
  if (
    source.sourceType !== "API" ||
    source.connector.connectorId !== CNIPA_GAZETTE_JOB_CONNECTOR_ID ||
    source.connector.version !== CNIPA_GAZETTE_JOB_CONNECTOR_VERSION ||
    context.job.connector.connectorId !== CNIPA_GAZETTE_JOB_CONNECTOR_ID ||
    context.job.connector.version !== CNIPA_GAZETTE_JOB_CONNECTOR_VERSION ||
    source.canonicalUri !== CNIPA_GAZETTE_PUBLIC_ORIGIN
  ) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_SOURCE_BOUNDARY_INVALID",
      "Gazette jobs require the governed CNIPA public Gazette source identity",
      false,
    );
  }
  if (!context.job.planSnapshot.output.artifactKinds.includes("JSON")) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_OUTPUT_KIND_INVALID",
      "Gazette checkpoint jobs must authorize JSON artifacts",
      false,
    );
  }
}

function requestTemplate(value: unknown, announcementIssue: number) {
  const raw = objectValue(value, "connectorConfig.requestTemplate");
  const unexpected = Object.keys(raw).filter((key) => !REQUEST_TEMPLATE_KEYS.has(key));
  if (unexpected.length > 0) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      `requestTemplate contains unsupported keys: ${unexpected.join(", ")}`,
      false,
    );
  }
  const result: Record<string, string | number> = {};
  for (const [key, child] of Object.entries(raw)) {
    if (typeof child !== "string" && typeof child !== "number") {
      throw new CollectionAcquisitionError(
        "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
        `requestTemplate.${key} must be string/number`,
        false,
      );
    }
    result[key] = child;
  }
  if (String(result.anncIssue ?? "").trim() !== String(announcementIssue)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      "requestTemplate.anncIssue must match connectorConfig.announcementIssue",
      false,
    );
  }
  if (result.anncType !== "") {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      "requestTemplate.anncType must be the official ALL value (empty string)",
      false,
    );
  }
  return result;
}

function datasetIdentityReference(
  value: unknown,
  announcementIssue: number,
): DatasetIdentityReference {
  const raw = objectValue(value, "connectorConfig.datasetIdentityRef");
  exactKeys(raw, ["artifactId", "canonicalUri", "snapshot"], "datasetIdentityRef");
  const artifactId = text(raw.artifactId, "datasetIdentityRef.artifactId", 64);
  if (!ARTIFACT_ID.test(artifactId)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      "datasetIdentityRef.artifactId must be a RawArtifact id",
      false,
    );
  }
  let snapshot: CnipaGazetteDatasetIdentitySnapshot;
  try {
    snapshot = validateCnipaGazetteDatasetIdentitySnapshot(raw.snapshot);
  } catch (error) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      error instanceof Error ? error.message : "dataset identity snapshot is invalid",
      false,
    );
  }
  const canonicalUri = text(raw.canonicalUri, "datasetIdentityRef.canonicalUri");
  const expectedCanonical = `cnipa://trademark-gazette/issue/${announcementIssue}/dataset/${snapshot.sourceDatasetSha256}`;
  if (
    snapshot.identity.announcementIssue !== announcementIssue ||
    canonicalUri !== expectedCanonical
  ) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      "datasetIdentityRef does not belong to the requested Gazette issue/dataset",
      false,
    );
  }
  return { artifactId, canonicalUri, snapshot };
}

function checkpointJobFromContext(context: ArtifactBackedExecutionContext): GazetteCheckpointJob {
  requireSourceBoundary(context);
  const config = objectValue(context.job.sourceSnapshot.connectorConfig, "connectorConfig");
  exactKeys(
    config,
    [
      "intent",
      "announcementIssue",
      "range",
      "requestTemplate",
      "pagesPerCheckpoint",
      "datasetIdentityRef",
    ],
    "Gazette connectorConfig",
  );
  if (config.intent !== "CHECKPOINT") {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      "Gazette connectorConfig.intent must be CHECKPOINT",
      false,
    );
  }
  const announcementIssue = positiveInteger(config.announcementIssue, "announcementIssue");
  const range = objectValue(config.range, "connectorConfig.range");
  exactKeys(range, ["startPage", "endPage"], "Gazette range");
  const startPage = positiveInteger(range.startPage, "range.startPage");
  const endPage = positiveInteger(range.endPage, "range.endPage");
  if (endPage < startPage || endPage - startPage + 1 > 100) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      "Gazette range must be ordered and cannot exceed 100 pages",
      false,
    );
  }
  const pagesPerCheckpoint =
    config.pagesPerCheckpoint === undefined
      ? CNIPA_GAZETTE_DEFAULT_PAGES_PER_CHECKPOINT
      : positiveInteger(config.pagesPerCheckpoint, "pagesPerCheckpoint");
  if (pagesPerCheckpoint > 100) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      "pagesPerCheckpoint cannot exceed 100",
      false,
    );
  }
  const datasetIdentityRef =
    config.datasetIdentityRef === undefined
      ? undefined
      : datasetIdentityReference(config.datasetIdentityRef, announcementIssue);
  if ((startPage === 1) === Boolean(datasetIdentityRef)) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_JOB_CONFIG_INVALID",
      startPage === 1
        ? "first checkpoint must not carry datasetIdentityRef"
        : "non-first checkpoint requires datasetIdentityRef",
      false,
    );
  }
  return {
    announcementIssue,
    range: { startPage, endPage },
    requestTemplate: requestTemplate(config.requestTemplate, announcementIssue),
    pagesPerCheckpoint,
    ...(datasetIdentityRef ? { datasetIdentityRef } : {}),
  };
}

function checkpointCollectedAt(artifacts: readonly AcquiredCollectionArtifact[]): string {
  const observed = artifacts
    .filter((artifact) => artifact.canonicalUri?.endsWith("/projection"))
    .map((artifact) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(artifact.content)) as unknown;
      } catch {
        throw new CollectionAcquisitionError(
          "CNIPA_GAZETTE_EVIDENCE_INVALID",
          "Gazette projection artifact must contain valid JSON",
          false,
        );
      }
      const value = objectValue(parsed, "Gazette projection").observedAt;
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        throw new CollectionAcquisitionError(
          "CNIPA_GAZETTE_EVIDENCE_INVALID",
          "Gazette projection observedAt must be an ISO-8601 instant",
          false,
        );
      }
      return value;
    });
  if (observed.length === 0) {
    throw new CollectionAcquisitionError(
      "CNIPA_GAZETTE_EVIDENCE_INVALID",
      "Gazette checkpoint produced no projection evidence",
      false,
    );
  }
  return observed.sort((left, right) => Date.parse(left) - Date.parse(right)).at(-1)!;
}
export class CnipaGazetteJobArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = CNIPA_GAZETTE_JOB_EXECUTOR;

  constructor(private readonly options: CnipaGazetteJobArtifactAcquirerOptions) {}

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const job = checkpointJobFromContext(context);
    const identityRef = job.datasetIdentityRef;
    try {
      const checkpoint = await acquireCnipaGazetteCheckpointRange({
        announcementIssue: job.announcementIssue,
        range: job.range,
        requestTemplate: job.requestTemplate,
        transport: this.options.transport,
        pagesPerCheckpoint: job.pagesPerCheckpoint,
        ...(identityRef
          ? {
              expectedSourceTotal: identityRef.snapshot.identity.sourceRecordCount,
              expectedSourcePages: identityRef.snapshot.identity.sourcePageCount,
              expectedAnnouncementDate: identityRef.snapshot.identity.announcementDate,
            }
          : {}),
        retry: {
          maxAttempts: context.job.planSnapshot.policy.retry.maxAttempts,
          retryDelayMs: context.job.planSnapshot.policy.retry.backoffSeconds * 1_000,
          ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
        },
      });
      const datasetIdentity = identityRef?.snapshot ?? buildCnipaGazetteDatasetIdentity(checkpoint);
      const collectedAt = checkpointCollectedAt(checkpoint.pageArtifacts);
      const chunkPackage = buildCnipaGazetteDataEngineChunkPackage({
        checkpoint: checkpoint.checkpoint,
        datasetIdentity,
        collectedAt,
      });
      const checkpointCanonicalUri = checkpoint.checkpointArtifact.canonicalUri;
      if (!checkpointCanonicalUri) {
        throw new CollectionAcquisitionError(
          "CNIPA_GAZETTE_EVIDENCE_INVALID",
          "Gazette checkpoint artifact is missing canonical URI",
          false,
        );
      }
      const identityCanonicalUri =
        identityRef?.canonicalUri ??
        (datasetIdentity as ReturnType<typeof buildCnipaGazetteDatasetIdentity>).artifact
          .canonicalUri;
      if (!identityCanonicalUri) {
        throw new CollectionAcquisitionError(
          "CNIPA_GAZETTE_EVIDENCE_INVALID",
          "Gazette dataset identity artifact is missing canonical URI",
          false,
        );
      }
      let requestArtifact = buildCnipaGazetteChunkAdmissionRequestArtifact({
        package: chunkPackage,
        datasetIdentityCanonicalUri: identityCanonicalUri,
        checkpointCanonicalUri,
        createdAt: collectedAt,
      });
      if (identityRef) {
        requestArtifact = {
          ...requestArtifact,
          parentCanonicalUris: [checkpointCanonicalUri],
          parentArtifactIds: [identityRef.artifactId],
        };
      }
      const firstIdentity =
        identityRef === undefined
          ? (datasetIdentity as ReturnType<typeof buildCnipaGazetteDatasetIdentity>)
          : null;
      return [
        ...checkpoint.pageArtifacts,
        checkpoint.checkpointArtifact,
        ...(firstIdentity ? [firstIdentity.artifact] : []),
        requestArtifact,
      ];
    } catch (error) {
      if (error instanceof CollectionAcquisitionError) throw error;
      if (error instanceof CnipaGazetteSourceError || error instanceof CnipaAcquisitionError) {
        throw new CollectionAcquisitionError(error.code, error.message, error.retryable);
      }
      throw error;
    } finally {
      await this.options.transport.close?.();
    }
  }
}

export function cnipaGazetteJobRuntimeDescriptor() {
  return Object.freeze({
    connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
    connectorVersion: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
    sourceType: "API" as const,
    officialOrigin: CNIPA_GAZETTE_PUBLIC_ORIGIN,
    announcementTypeSelection: "ALL" as const,
    pageSize: 100 as const,
    requestDerivedFromImmutableJobSnapshot: true as const,
    rawSessionMaterialForbiddenInJobSnapshot: true as const,
    authorizedTransportInjectedAtRuntime: true as const,
    artifactBackedIngestionRequired: true as const,
    historicalReplayActivated: false as const,
  });
}
