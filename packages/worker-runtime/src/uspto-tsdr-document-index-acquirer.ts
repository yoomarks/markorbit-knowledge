import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import {
  USPTO_TSDR_API_KEY_HEADER,
  USPTO_TSDR_API_ORIGIN,
  admitUsptoTsdrAcquisition,
  type UsptoTsdrDocumentIndexRequest,
} from "./uspto-tsdr-acquisition-policy";

export const USPTO_TSDR_INDEX_CONNECTOR_ID = "uspto-tsdr-document-index";
export const USPTO_TSDR_INDEX_CONNECTOR_VERSION = "1.0.0";
export const USPTO_TSDR_INDEX_EXECUTOR: ExecutionExecutor = {
  executorId: USPTO_TSDR_INDEX_CONNECTOR_ID,
  version: USPTO_TSDR_INDEX_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

export interface UsptoTsdrSecretResolver {
  resolve(secretRef: string): Promise<string>;
}

export type UsptoTsdrIndexTransportRequest = {
  url: string;
  headers: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type UsptoTsdrIndexTransportResponse = {
  status: number;
  body: Uint8Array;
  contentType: string | null;
};

export type UsptoTsdrIndexTransport = (
  request: UsptoTsdrIndexTransportRequest,
) => Promise<UsptoTsdrIndexTransportResponse>;

export type UsptoTsdrDocumentIndexAcquirerOptions = {
  request: UsptoTsdrDocumentIndexRequest;
  secretResolver: UsptoTsdrSecretResolver;
  transport?: UsptoTsdrIndexTransport;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new CollectionAcquisitionError(
      "TSDR_RUNTIME_CONFIG_INVALID",
      `${label} must be an integer from ${minimum} to ${maximum}`,
      false,
    );
  }
  return resolved;
}

async function defaultTransport(
  request: UsptoTsdrIndexTransportRequest,
): Promise<UsptoTsdrIndexTransportResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: "GET",
      headers: request.headers,
      signal: controller.signal,
      redirect: "error",
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        total += result.value.byteLength;
        if (total > request.maxResponseBytes) {
          await reader.cancel();
          throw new CollectionAcquisitionError(
            "TSDR_RESPONSE_TOO_LARGE",
            "TSDR document index exceeded the configured byte limit",
            false,
          );
        }
        chunks.push(result.value);
      }
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      status: response.status,
      body,
      contentType: response.headers.get("content-type"),
    };
  } catch (error) {
    if (error instanceof CollectionAcquisitionError) throw error;
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new CollectionAcquisitionError(
      timedOut ? "TSDR_TIMEOUT" : "TSDR_NETWORK_ERROR",
      timedOut ? "TSDR document index request timed out" : "TSDR document index request failed",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function apiKey(value: string): string {
  const normalized = value.trim();
  if (!normalized || /\s/.test(normalized) || normalized.length > 512) {
    throw new CollectionAcquisitionError(
      "TSDR_SECRET_INVALID",
      "Resolved TSDR API key is empty or malformed",
      false,
    );
  }
  return normalized;
}

function documentIndexUrl(serialNumber: string): string {
  const url = new URL("/ts/cd/casedocs/bundle.xml", USPTO_TSDR_API_ORIGIN);
  url.searchParams.set("sn", serialNumber);
  return url.toString();
}

function requireSuccessfulXml(response: UsptoTsdrIndexTransportResponse): void {
  if (response.status === 429) {
    throw new CollectionAcquisitionError(
      "TSDR_RATE_LIMITED",
      "USPTO TSDR rate limit was reached",
      true,
    );
  }
  if (response.status >= 500) {
    throw new CollectionAcquisitionError(
      "TSDR_TEMPORARY_FAILURE",
      `USPTO TSDR returned HTTP ${response.status}`,
      true,
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new CollectionAcquisitionError(
      "TSDR_REQUEST_REJECTED",
      `USPTO TSDR returned HTTP ${response.status}`,
      false,
    );
  }
  if (response.body.byteLength === 0) {
    throw new CollectionAcquisitionError(
      "TSDR_EMPTY_RESPONSE",
      "USPTO TSDR returned an empty document index",
      false,
    );
  }
  const mediaType = response.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mediaType && !["application/xml", "text/xml"].includes(mediaType) && !mediaType.endsWith("+xml")) {
    throw new CollectionAcquisitionError(
      "TSDR_RESPONSE_TYPE_INVALID",
      `USPTO TSDR document index returned unexpected content type ${mediaType}`,
      false,
    );
  }
  const prefix = new TextDecoder().decode(response.body.slice(0, Math.min(response.body.length, 512))).trimStart();
  if (!prefix.startsWith("<")) {
    throw new CollectionAcquisitionError(
      "TSDR_RESPONSE_INVALID",
      "USPTO TSDR document index response is not XML-like content",
      false,
    );
  }
}

export class UsptoTsdrDocumentIndexAcquirer implements CollectionArtifactAcquirer {
  readonly executor = USPTO_TSDR_INDEX_EXECUTOR;
  private readonly admission;
  private readonly transport: UsptoTsdrIndexTransport;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(private readonly options: UsptoTsdrDocumentIndexAcquirerOptions) {
    this.admission = admitUsptoTsdrAcquisition(options.request);
    if (this.admission.intent !== "CASE_DOCUMENT_INDEX") {
      throw new CollectionAcquisitionError(
        "TSDR_INDEX_INTENT_REQUIRED",
        "TSDR document-index acquirer only accepts CASE_DOCUMENT_INDEX",
        false,
      );
    }
    this.transport = options.transport ?? defaultTransport;
    this.timeoutMs = boundedInteger(
      options.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      1_000,
      MAX_TIMEOUT_MS,
      "timeoutMs",
    );
    this.maxResponseBytes = boundedInteger(
      options.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
      1_024,
      MAX_RESPONSE_BYTES,
      "maxResponseBytes",
    );
  }

  async acquire(_context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const secret = apiKey(await this.options.secretResolver.resolve(this.admission.secretRef));
    const sourceUri = documentIndexUrl(this.admission.serialNumber);
    const response = await this.transport({
      url: sourceUri,
      headers: {
        accept: "application/xml, text/xml;q=0.9",
        [USPTO_TSDR_API_KEY_HEADER]: secret,
      },
      timeoutMs: this.timeoutMs,
      maxResponseBytes: this.maxResponseBytes,
    });
    requireSuccessfulXml(response);
    return [
      {
        artifactKind: "XML",
        mimeType: "application/xml",
        originalName: `uspto-tsdr-${this.admission.serialNumber}-document-index.xml`,
        sourceUri,
        canonicalUri: sourceUri,
        content: response.body,
      },
    ];
  }
}

export function usptoTsdrDocumentIndexRuntimeDescriptor() {
  return Object.freeze({
    connectorId: USPTO_TSDR_INDEX_CONNECTOR_ID,
    connectorVersion: USPTO_TSDR_INDEX_CONNECTOR_VERSION,
    intent: "CASE_DOCUMENT_INDEX" as const,
    officialOrigin: USPTO_TSDR_API_ORIGIN,
    pathTemplate: "/ts/cd/casedocs/bundle.xml?sn={serialNumber}",
    artifactKind: "XML" as const,
    immutableRawArtifactRequired: true as const,
    selectedDocumentBinaryImplemented: false as const,
  });
}
