import { request as httpsRequest } from "node:https";
import {
  SCHEMA_V1_VERSION,
  type ConnectorManifest,
  type ExecutionExecutor,
} from "@markorbit/contracts";
import { defaultApiResolver, type ApiResolvedAddress, type ApiResolver } from "./api-acquirer";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { isPublicNetworkAddress } from "./public-network-policy";
import {
  WIPO_MGS_SOURCE_ID,
  WipoMgsValidationError,
  canonicalWipoMgsJson,
  parseWipoMgsSnapshot,
} from "./wipo-source-adapter";
import { buildWipoMgsDataEngineAdmissionRequest } from "./wipo-mgs-data-engine-handoff";

export const WIPO_MGS_CONNECTOR_ID = "wipo-mgs-worker";
export const WIPO_MGS_CONNECTOR_VERSION = "0.1.0";
export const WIPO_MGS_EXECUTOR: ExecutionExecutor = {
  executorId: WIPO_MGS_CONNECTOR_ID,
  version: WIPO_MGS_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

/**
 * Registration template only. It remains disabled until automated access authorization is recorded;
 * activating a connector is an operator action outside this PoC.
 */
export const WIPO_MGS_CONNECTOR_MANIFEST: ConnectorManifest = {
  schemaVersion: SCHEMA_V1_VERSION,
  objectType: "CONNECTOR_MANIFEST",
  connectorId: WIPO_MGS_CONNECTOR_ID,
  displayName: "WIPO Madrid Goods & Services Manager PoC",
  version: WIPO_MGS_CONNECTOR_VERSION,
  sourceTypes: ["API"],
  runtime: "NODE",
  capabilities: ["COLLECT"],
  supportedJobTypes: ["API_COLLECTION"],
  configurationSchema: {
    type: "object",
    additionalProperties: false,
    required: ["requestLanguage", "niceClass"],
    properties: {
      requestLanguage: { type: "string" },
      localeCode: { type: "string" },
      niceClass: { type: "integer", minimum: 1, maximum: 45 },
      sourceVersion: { type: ["string", "null"] },
      timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
      maxResponseBytes: { type: "integer", minimum: 1, maximum: 104857600 },
    },
  },
  secretSchema: { type: "object", properties: {} },
  outputArtifactKinds: ["JSON"],
  healthCheck: { mode: "NONE", timeoutSeconds: 30 },
  status: "DISABLED",
  extensions: {
    "x-markorbit-activation-requirement":
      "Documented WIPO MGS automated-access authorization and approved canary plan",
  },
};

export const WIPO_MGS_ENDPOINT = "https://webaccess.wipo.int/mgs/process.jsp";
export const WIPO_MGS_AUTOMATED_ACCESS_APPROVAL_ENV =
  "MARKORBIT_WIPO_MGS_AUTOMATED_ACCESS_APPROVED";

export const WIPO_MGS_HISTORICAL_POC_COUNTS: Readonly<Record<string, number>> = Object.freeze({
  "zh:1": 2_244,
  "en:1": 3_605,
  "en:2": 766,
  "ar:1": 722,
});

const WIPO_MGS_HOST = "webaccess.wipo.int";
const WIPO_MGS_PATH = "/mgs/process.jsp";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;
const LANGUAGE_CODE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

export type WipoMgsTransportRequest = {
  resolvedAddress: string;
  family: 4 | 6;
  body: Uint8Array;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type WipoMgsTransportResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
};

export type WipoMgsTransport = (
  request: WipoMgsTransportRequest,
) => Promise<WipoMgsTransportResponse>;

export type WipoMgsArtifactAcquirerOptions = {
  environment?: NodeJS.ProcessEnv;
  resolver?: ApiResolver;
  transport?: WipoMgsTransport;
  clock?: () => string;
};

export type WipoMgsSourceConfig = {
  requestLanguage: string;
  localeCode: string;
  niceClass: number;
  sourceVersion: string | null;
  timeoutMs: number;
  maxResponseBytes: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new CollectionAcquisitionError(
      "MGS_CONFIG_INVALID",
      `WIPO MGS connectorConfig.${field} must be an integer between ${minimum} and ${maximum}`,
      false,
    );
  }
  return value as number;
}

function sourceConfig(context: ArtifactBackedExecutionContext): WipoMgsSourceConfig {
  const config = record(context.job.sourceSnapshot.connectorConfig);
  if (!config) {
    throw new CollectionAcquisitionError(
      "MGS_CONFIG_INVALID",
      "WIPO MGS source requires connectorConfig",
      false,
    );
  }
  const allowed = new Set([
    "requestLanguage",
    "localeCode",
    "niceClass",
    "sourceVersion",
    "timeoutMs",
    "maxResponseBytes",
  ]);
  const unknown = Object.keys(config).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new CollectionAcquisitionError(
      "MGS_CONFIG_INVALID",
      `WIPO MGS connectorConfig contains unsupported fields: ${unknown.sort().join(", ")}`,
      false,
    );
  }
  if (typeof config.requestLanguage !== "string" || !LANGUAGE_CODE.test(config.requestLanguage)) {
    throw new CollectionAcquisitionError(
      "MGS_CONFIG_INVALID",
      "WIPO MGS requestLanguage must be a language code discovered from the public MGS page",
      false,
    );
  }
  const localeCode =
    typeof config.localeCode === "string" ? config.localeCode : config.requestLanguage;
  if (!LANGUAGE_CODE.test(localeCode)) {
    throw new CollectionAcquisitionError(
      "MGS_CONFIG_INVALID",
      "WIPO MGS localeCode must be a bounded language code",
      false,
    );
  }
  if (
    config.sourceVersion !== undefined &&
    config.sourceVersion !== null &&
    (typeof config.sourceVersion !== "string" ||
      !config.sourceVersion.trim() ||
      config.sourceVersion.length > 128)
  ) {
    throw new CollectionAcquisitionError(
      "MGS_CONFIG_INVALID",
      "WIPO MGS sourceVersion must be omitted unless a bounded displayed version was observed",
      false,
    );
  }
  if (config.niceClass === undefined) {
    throw new CollectionAcquisitionError(
      "MGS_CONFIG_INVALID",
      "WIPO MGS connectorConfig.niceClass is required",
      false,
    );
  }
  return {
    requestLanguage: config.requestLanguage,
    localeCode,
    niceClass: boundedInteger(config.niceClass, 1, 1, 45, "niceClass"),
    sourceVersion: typeof config.sourceVersion === "string" ? config.sourceVersion.trim() : null,
    timeoutMs: boundedInteger(
      config.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      1_000,
      MAX_TIMEOUT_MS,
      "timeoutMs",
    ),
    maxResponseBytes: boundedInteger(
      config.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
      1,
      MAX_RESPONSE_BYTES,
      "maxResponseBytes",
    ),
  };
}

function assertSupportedJob(context: ArtifactBackedExecutionContext): void {
  if (context.job.sourceSnapshot.sourceType !== "API") {
    throw new CollectionAcquisitionError(
      "SOURCE_TYPE_NOT_SUPPORTED",
      `WIPO MGS acquirer requires API sources, received ${context.job.sourceSnapshot.sourceType}`,
      false,
    );
  }
  if (context.job.jobType !== "API_COLLECTION") {
    throw new CollectionAcquisitionError(
      "JOB_TYPE_NOT_SUPPORTED",
      `WIPO MGS acquirer requires API_COLLECTION, received ${context.job.jobType}`,
      false,
    );
  }
  if (
    context.job.connector.connectorId !== WIPO_MGS_CONNECTOR_ID ||
    context.job.connector.version !== WIPO_MGS_CONNECTOR_VERSION
  ) {
    throw new CollectionAcquisitionError(
      "CONNECTOR_NOT_SUPPORTED",
      `WIPO MGS acquirer requires ${WIPO_MGS_CONNECTOR_ID}@${WIPO_MGS_CONNECTOR_VERSION}`,
      false,
    );
  }
}

function approvalGranted(environment: NodeJS.ProcessEnv): boolean {
  return environment[WIPO_MGS_AUTOMATED_ACCESS_APPROVAL_ENV]?.trim().toLowerCase() === "true";
}

function responseContentType(headers: WipoMgsTransportResponse["headers"]): string | null {
  const raw = headers["content-type"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
}

function statusFailure(status: number): CollectionAcquisitionError {
  if (status === 403 || status === 429) {
    return new CollectionAcquisitionError(
      "MGS_ACCESS_RESTRICTED",
      `WIPO MGS returned HTTP ${status}; automated collection must pause for operator review`,
      false,
    );
  }
  if (status >= 300 && status < 400) {
    return new CollectionAcquisitionError(
      "MGS_REDIRECT_REJECTED",
      "WIPO MGS connector does not follow redirects",
      false,
    );
  }
  return new CollectionAcquisitionError(
    "MGS_HTTP_STATUS_REJECTED",
    `WIPO MGS returned HTTP ${status}`,
    status === 408 || status === 425 || status >= 500,
  );
}

function normalizeTransportError(error: unknown): never {
  if (error instanceof CollectionAcquisitionError) throw error;
  const code = record(error)?.code;
  const retryableCodes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
  ]);
  throw new CollectionAcquisitionError(
    "MGS_TRANSPORT_FAILED",
    "WIPO MGS HTTPS transport failed before a governed response was obtained",
    typeof code === "string" ? retryableCodes.has(code) : true,
  );
}

export const defaultWipoMgsTransport: WipoMgsTransport = async (input) =>
  new Promise<WipoMgsTransportResponse>((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: input.resolvedAddress,
        family: input.family,
        port: 443,
        method: "POST",
        path: WIPO_MGS_PATH,
        servername: WIPO_MGS_HOST,
        headers: {
          host: WIPO_MGS_HOST,
          accept: "application/json, text/plain;q=0.9, text/html;q=0.1",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "content-length": String(input.body.byteLength),
          "user-agent": "MarkOrbit-Knowledge-WIPO-MGS-PoC/0.1",
        },
        timeout: input.timeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.byteLength;
          if (bytes > input.maxResponseBytes) {
            response.destroy(
              new CollectionAcquisitionError(
                "MGS_RESPONSE_TOO_LARGE",
                `WIPO MGS response exceeded the ${input.maxResponseBytes}-byte bound`,
                false,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
        response.on("error", reject);
      },
    );
    request.once("timeout", () => {
      request.destroy(
        new CollectionAcquisitionError("MGS_TIMEOUT", "WIPO MGS request timed out", true),
      );
    });
    request.once("error", reject);
    request.end(input.body);
  });

function requestBody(config: WipoMgsSourceConfig): Uint8Array {
  return new TextEncoder().encode(
    new URLSearchParams({
      action: "load",
      lang: config.requestLanguage,
      class: String(config.niceClass),
    }).toString(),
  );
}

function sourceUri(config: WipoMgsSourceConfig): string {
  const fragment = new URLSearchParams({
    action: "load",
    lang: config.requestLanguage,
    class: String(config.niceClass),
  }).toString();
  return `${WIPO_MGS_ENDPOINT}#${fragment}`;
}

function canonicalBase(config: WipoMgsSourceConfig): string {
  return `wipo-mgs://${encodeURIComponent(config.requestLanguage)}/class/${String(config.niceClass).padStart(2, "0")}`;
}

export class WipoMgsArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = WIPO_MGS_EXECUTOR;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly resolver: ApiResolver;
  private readonly transport: WipoMgsTransport;
  private readonly clock: () => string;

  constructor(options: WipoMgsArtifactAcquirerOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.resolver = options.resolver ?? defaultApiResolver;
    this.transport = options.transport ?? defaultWipoMgsTransport;
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    assertSupportedJob(context);
    if (!approvalGranted(this.environment)) {
      throw new CollectionAcquisitionError(
        "MGS_AUTOMATED_ACCESS_NOT_APPROVED",
        `WIPO MGS execution is disabled until ${WIPO_MGS_AUTOMATED_ACCESS_APPROVAL_ENV}=true is set after documented authorization`,
        false,
      );
    }
    const config = sourceConfig(context);
    let resolved: ApiResolvedAddress[];
    try {
      resolved = await this.resolver(WIPO_MGS_HOST);
    } catch (error) {
      return normalizeTransportError(error);
    }
    if (
      resolved.length === 0 ||
      resolved.some((item) => !isPublicNetworkAddress(item.address, item.family))
    ) {
      throw new CollectionAcquisitionError(
        "MGS_NETWORK_TARGET_REJECTED",
        "WIPO MGS host resolution did not produce an exclusively public address set",
        false,
      );
    }

    let response: WipoMgsTransportResponse;
    try {
      response = await this.transport({
        resolvedAddress: resolved[0]!.address,
        family: resolved[0]!.family,
        body: requestBody(config),
        timeoutMs: config.timeoutMs,
        maxResponseBytes: config.maxResponseBytes,
      });
    } catch (error) {
      return normalizeTransportError(error);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw statusFailure(response.statusCode);
    }
    if (response.body.byteLength === 0) {
      throw new CollectionAcquisitionError(
        "MGS_EMPTY_RESPONSE",
        "WIPO MGS returned an empty response body",
        false,
      );
    }
    if (response.body.byteLength > config.maxResponseBytes) {
      throw new CollectionAcquisitionError(
        "MGS_RESPONSE_TOO_LARGE",
        `WIPO MGS response exceeded the ${config.maxResponseBytes}-byte bound`,
        false,
      );
    }

    let snapshot;
    try {
      snapshot = parseWipoMgsSnapshot(response.body, {
        requestLanguage: config.requestLanguage,
        localeCode: config.localeCode,
        niceClass: config.niceClass,
        sourceVersion: config.sourceVersion,
        historicalExpectedCount:
          WIPO_MGS_HISTORICAL_POC_COUNTS[`${config.requestLanguage}:${config.niceClass}`],
      });
    } catch (error) {
      if (error instanceof WipoMgsValidationError) {
        throw new CollectionAcquisitionError(error.code, error.message, false);
      }
      throw error;
    }

    const rawCanonicalUri = `${canonicalBase(config)}/raw`;
    const normalizedCanonicalUri = `${canonicalBase(config)}/normalized`;
    const responseMimeType = responseContentType(response.headers);
    const normalizedBytes = new TextEncoder().encode(canonicalWipoMgsJson(snapshot));
    const observedAt = this.clock();
    if (!observedAt || Number.isNaN(Date.parse(observedAt))) {
      throw new CollectionAcquisitionError(
        "MGS_CLOCK_INVALID",
        "WIPO MGS collector clock must return an ISO-8601 instant",
        false,
      );
    }
    const admissionRequest = buildWipoMgsDataEngineAdmissionRequest({
      snapshot,
      observedAt,
      sourceUri: sourceUri(config),
      evidenceCanonicalUri: rawCanonicalUri,
      projectionCanonicalUri: normalizedCanonicalUri,
    });
    const reportBytes = new TextEncoder().encode(
      canonicalWipoMgsJson({
        schemaVersion: "WIPO_MGS_COLLECTION_REPORT_V1",
        source: WIPO_MGS_SOURCE_ID,
        jobId: context.job.id,
        runId: context.job.runId,
        sourceId: context.job.sourceId,
        requestLanguage: config.requestLanguage,
        localeCode: config.localeCode,
        niceClass: config.niceClass,
        sourceVersion: config.sourceVersion,
        observedAt,
        recordCount: snapshot.recordCount,
        responseSha256: snapshot.responseSha256,
        responseContentType: responseMimeType,
        anomalies: snapshot.anomalies,
        dataEngineHandoff: "PREPARED_NOT_DISPATCHED",
      }),
    );
    const suffix = `${config.requestLanguage}-${String(config.niceClass).padStart(2, "0")}`;
    return [
      {
        artifactKind: "JSON",
        mimeType: responseMimeType ?? "application/json;charset=UTF-8",
        originalName: `wipo-mgs-${suffix}-raw.json`,
        sourceUri: sourceUri(config),
        canonicalUri: rawCanonicalUri,
        content: response.body,
      },
      {
        artifactKind: "JSON",
        mimeType: "application/json;charset=UTF-8",
        originalName: `wipo-mgs-${suffix}-normalized.json`,
        sourceUri: sourceUri(config),
        canonicalUri: normalizedCanonicalUri,
        parentCanonicalUris: [rawCanonicalUri],
        content: normalizedBytes,
      },
      admissionRequest,
      {
        artifactKind: "JSON",
        mimeType: "application/json;charset=UTF-8",
        originalName: `wipo-mgs-${suffix}-report.json`,
        sourceUri: sourceUri(config),
        canonicalUri: `${canonicalBase(config)}/report`,
        parentCanonicalUris: [
          rawCanonicalUri,
          normalizedCanonicalUri,
          admissionRequest.canonicalUri!,
        ],
        content: reportBytes,
      },
    ];
  }
}
