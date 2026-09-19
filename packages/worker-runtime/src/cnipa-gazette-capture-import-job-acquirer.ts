import { createHash } from "node:crypto";
import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import {
  acquireCnipaGazetteArtifactsForCheckpointJob,
  type CnipaGazetteCheckpointJob,
} from "./cnipa-gazette-job-acquirer";
import {
  CnipaGazetteV094CaptureTransport,
  parseCnipaGazetteV094SmallCompleteCaptureBytes,
} from "./cnipa-gazette-v094-capture";

export const CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID = "cnipa-gazette-capture-import";
export const CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION = "1.0.0";
export const CNIPA_GAZETTE_CAPTURE_IMPORT_SOURCE =
  "markorbit://knowledge/cnipa-gazette/capture-import";
export const CNIPA_GAZETTE_CAPTURE_IMPORT_EXECUTOR: ExecutionExecutor = {
  executorId: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID,
  version: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};
const SHA256 = /^[a-f0-9]{64}$/u;
const REQUEST_KEYS = new Set([
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

type ImportConfig = {
  captureSha256: string;
  captureSizeBytes: number;
  captureOriginalName: string;
  job: CnipaGazetteCheckpointJob;
};

function invalid(message: string): never {
  throw new CollectionAcquisitionError("CNIPA_GAZETTE_CAPTURE_IMPORT_INVALID", message, false);
}
function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string) {
  const accepted = new Set(keys);
  const extra = Object.keys(value).filter((key) => !accepted.has(key));
  if (extra.length > 0) invalid(`${label} contains unsupported keys: ${extra.join(", ")}`);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    invalid(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function text(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string") invalid(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    invalid(`${label} must be non-empty and at most ${maximum} characters`);
  }
  return normalized;
}
function requestTemplate(value: unknown, announcementIssue: number) {
  const raw = objectValue(value, "connectorConfig.requestTemplate");
  const extra = Object.keys(raw).filter((key) => !REQUEST_KEYS.has(key));
  if (extra.length > 0) invalid(`requestTemplate contains unsupported keys: ${extra.join(", ")}`);
  const result: Record<string, string | number> = {};
  for (const [key, child] of Object.entries(raw)) {
    if (typeof child !== "string" && typeof child !== "number") {
      invalid(`requestTemplate.${key} must be string/number`);
    }
    result[key] = child;
  }
  if (
    String(result.anncIssue ?? "").trim() !== String(announcementIssue) ||
    result.anncType !== "" ||
    result.pageIndex !== 1 ||
    result.pageSize !== 100
  ) {
    invalid("requestTemplate must be issue + ALL + pageIndex 1 + pageSize 100");
  }
  return result;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((child) => JSON.parse(stable(child))));
  if (value && typeof value === "object") {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, JSON.parse(stable(child))]),
      ),
    );
  }
  return JSON.stringify(value);
}
function requireBoundary(context: ArtifactBackedExecutionContext) {
  const source = context.job.sourceSnapshot;
  if (
    source.sourceType !== "DATABASE" ||
    source.connector.connectorId !== CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID ||
    source.connector.version !== CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION ||
    context.job.connector.connectorId !== CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID ||
    context.job.connector.version !== CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION ||
    source.canonicalUri !== CNIPA_GAZETTE_CAPTURE_IMPORT_SOURCE
  ) {
    invalid("capture-import Job escaped the governed source boundary");
  }
  if (!context.job.planSnapshot.output.artifactKinds.includes("JSON")) {
    invalid("capture-import Job must authorize JSON artifacts");
  }
}

function configFromContext(context: ArtifactBackedExecutionContext): ImportConfig {
  requireBoundary(context);
  const config = objectValue(context.job.sourceSnapshot.connectorConfig, "connectorConfig");
  exactKeys(
    config,
    [
      "intent",
      "captureSha256",
      "captureSizeBytes",
      "captureOriginalName",
      "announcementIssue",
      "range",
      "requestTemplate",
      "pagesPerCheckpoint",
    ],
    "connectorConfig",
  );
  if (config.intent !== "IMPORT_V094_SMALL_COMPLETE") {
    invalid("connectorConfig.intent must be IMPORT_V094_SMALL_COMPLETE");
  }
  const captureSha256 = text(config.captureSha256, "captureSha256", 64).toLowerCase();
  if (!SHA256.test(captureSha256)) invalid("captureSha256 must be lowercase SHA-256");
  const captureSizeBytes = positiveInteger(config.captureSizeBytes, "captureSizeBytes");
  const captureOriginalName = text(config.captureOriginalName, "captureOriginalName", 255);
  const announcementIssue = positiveInteger(config.announcementIssue, "announcementIssue");
  const range = objectValue(config.range, "range");
  exactKeys(range, ["startPage", "endPage"], "range");
  const startPage = positiveInteger(range.startPage, "range.startPage");
  const endPage = positiveInteger(range.endPage, "range.endPage");
  if (startPage !== 1 || endPage < startPage || endPage - startPage + 1 > 200) {
    invalid("capture-import range must start at page 1 and contain at most 200 pages");
  }
  const pagesPerCheckpoint = positiveInteger(config.pagesPerCheckpoint, "pagesPerCheckpoint");
  if (pagesPerCheckpoint !== endPage) {
    invalid("capture-import pagesPerCheckpoint must equal the normalized logical page count");
  }
  return {
    captureSha256,
    captureSizeBytes,
    captureOriginalName,
    job: {
      announcementIssue,
      range: { startPage, endPage },
      requestTemplate: requestTemplate(config.requestTemplate, announcementIssue),
      pagesPerCheckpoint,
    },
  };
}
function rootArtifact(input: {
  bytes: Uint8Array;
  sha256: string;
  originalName: string;
  issue: number;
  sourceUrl: string;
}): AcquiredCollectionArtifact {
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: input.originalName,
    sourceUri: input.sourceUrl,
    canonicalUri:
      `cnipa://trademark-gazette/issue/${input.issue}/capture/` +
      `mo-cnipa-network-capture-v0.9.4/${input.sha256}`,
    content: input.bytes,
  };
}

export class CnipaGazetteCaptureImportJobArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = CNIPA_GAZETTE_CAPTURE_IMPORT_EXECUTOR;

  constructor(
    private readonly options: {
      captureBytes: Uint8Array;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {}

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const config = configFromContext(context);
    const observedSha256 = createHash("sha256").update(this.options.captureBytes).digest("hex");
    if (
      observedSha256 !== config.captureSha256 ||
      this.options.captureBytes.byteLength !== config.captureSizeBytes
    ) {
      invalid("runtime capture bytes do not match the immutable Job SHA/size");
    }
    let capture;
    try {
      capture = parseCnipaGazetteV094SmallCompleteCaptureBytes(this.options.captureBytes);
    } catch (error) {
      invalid(error instanceof Error ? error.message : "v0.9.4 capture is invalid");
    }
    const normalizedPages = Math.max(1, Math.ceil(capture.sourceTotal / 100));
    const normalizedQuery = {
      ...capture.query,
      pageIndex: 1,
      pageSize: 100,
    };
    if (
      capture.announcementIssue !== String(config.job.announcementIssue) ||
      normalizedPages !== config.job.range.endPage ||
      stable(normalizedQuery) !== stable(config.job.requestTemplate)
    ) {
      invalid("v0.9.4 capture does not match the immutable Job issue/normalized-pages/query scope");
    }
    const root = rootArtifact({
      bytes: this.options.captureBytes,
      sha256: observedSha256,
      originalName: config.captureOriginalName,
      issue: config.job.announcementIssue,
      sourceUrl: capture.sourceUrl,
    });
    const artifacts = await acquireCnipaGazetteArtifactsForCheckpointJob({
      context,
      job: config.job,
      transport: new CnipaGazetteV094CaptureTransport(capture),
      ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
    });
    const rootUri = root.canonicalUri!;
    return [
      root,
      ...artifacts.map((artifact) =>
        artifact.canonicalUri?.endsWith("/raw")
          ? {
              ...artifact,
              parentCanonicalUris: [...new Set([...(artifact.parentCanonicalUris ?? []), rootUri])],
            }
          : artifact,
      ),
    ];
  }
}

export function cnipaGazetteCaptureImportRuntimeDescriptor() {
  return Object.freeze({
    connectorId: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID,
    connectorVersion: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION,
    sourceType: "DATABASE" as const,
    source: CNIPA_GAZETTE_CAPTURE_IMPORT_SOURCE,
    acceptedTool: "MO CNIPA Network Capture" as const,
    acceptedToolVersion: "0.9.4" as const,
    networkAccessRequired: false as const,
    captureBytesBoundByImmutableSha256: true as const,
    artifactBackedIngestionRequired: true as const,
    historicalReplayActivated: false as const,
  });
}
