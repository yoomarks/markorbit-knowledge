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
  type UsptoTsdrSelectedDocumentRequest,
} from "./uspto-tsdr-acquisition-policy";
import type { UsptoTsdrSecretResolver } from "./uspto-tsdr-document-index-acquirer";

export const USPTO_TSDR_SELECTED_DOCUMENT_CONNECTOR_ID = "uspto-tsdr-selected-document";
export const USPTO_TSDR_SELECTED_DOCUMENT_CONNECTOR_VERSION = "1.0.0";
export const USPTO_TSDR_SELECTED_DOCUMENT_EXECUTOR: ExecutionExecutor = {
  executorId: USPTO_TSDR_SELECTED_DOCUMENT_CONNECTOR_ID,
  version: USPTO_TSDR_SELECTED_DOCUMENT_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_TIMEOUT_MS = 180_000;
const MAX_RESPONSE_BYTES = 256 * 1024 * 1024;

export type UsptoTsdrBinaryTransportRequest = {
  url: string;
  headers: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type UsptoTsdrBinaryTransportResponse = {
  status: number;
  body: Uint8Array;
  contentType: string | null;
};

export type UsptoTsdrBinaryTransport = (
  request: UsptoTsdrBinaryTransportRequest,
) => Promise<UsptoTsdrBinaryTransportResponse>;

export type UsptoTsdrSelectedDocumentAcquirerOptions = {
  request: UsptoTsdrSelectedDocumentRequest;
  secretResolver: UsptoTsdrSecretResolver;
  transport?: UsptoTsdrBinaryTransport;
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
  request: UsptoTsdrBinaryTransportRequest,
): Promise<UsptoTsdrBinaryTransportResponse> {
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
            "TSDR selected document exceeded the configured byte limit",
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
      timedOut
        ? "TSDR selected-document request timed out"
        : "TSDR selected-document request failed",
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

function sourceDocumentId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) {
    throw new CollectionAcquisitionError(
      "TSDR_DOCUMENT_ID_INVALID",
      "TSDR sourceDocumentId contains unsupported characters",
      false,
    );
  }
  return normalized;
}

function selectedDocumentUrl(
  serialNumber: string,
  documentId: string,
  format: "PDF" | "ZIP",
): string {
  const extension = format.toLowerCase();
  return new URL(
    `/ts/cd/casedoc/sn${serialNumber}/${documentId}/download.${extension}`,
    USPTO_TSDR_API_ORIGIN,
  ).toString();
}

function mediaType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isPdf(body: Uint8Array): boolean {
  return body.byteLength >= 5 && new TextDecoder().decode(body.slice(0, 5)) === "%PDF-";
}

function isZip(body: Uint8Array): boolean {
  if (body.byteLength < 4) return false;
  return (
    body[0] === 0x50 &&
    body[1] === 0x4b &&
    ((body[2] === 0x03 && body[3] === 0x04) ||
      (body[2] === 0x05 && body[3] === 0x06) ||
      (body[2] === 0x07 && body[3] === 0x08))
  );
}

function requireSuccessfulBinary(
  response: UsptoTsdrBinaryTransportResponse,
  format: "PDF" | "ZIP",
): void {
  if (response.status === 429) {
    throw new CollectionAcquisitionError(
      "TSDR_RATE_LIMITED",
      "USPTO TSDR binary rate limit was reached",
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
  if (response.status === 401 || response.status === 403) {
    throw new CollectionAcquisitionError(
      "TSDR_AUTH_REJECTED",
      "USPTO TSDR rejected the API key for selected-document acquisition",
      false,
    );
  }
  if (response.status === 204 || response.status === 404) {
    throw new CollectionAcquisitionError(
      "TSDR_DOCUMENT_NOT_AVAILABLE",
      "USPTO TSDR did not return the selected document",
      false,
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
      "USPTO TSDR returned an empty selected document",
      false,
    );
  }

  const type = mediaType(response.contentType);
  if (format === "PDF") {
    if (type && type !== "application/pdf" && type !== "application/octet-stream") {
      throw new CollectionAcquisitionError(
        "TSDR_RESPONSE_TYPE_INVALID",
        `USPTO TSDR selected PDF returned unexpected content type ${type}`,
        false,
      );
    }
    if (!isPdf(response.body)) {
      throw new CollectionAcquisitionError(
        "TSDR_BINARY_SIGNATURE_INVALID",
        "USPTO TSDR selected PDF does not begin with a PDF signature",
        false,
      );
    }
    return;
  }

  if (
    type &&
    !["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(type)
  ) {
    throw new CollectionAcquisitionError(
      "TSDR_RESPONSE_TYPE_INVALID",
      `USPTO TSDR selected ZIP returned unexpected content type ${type}`,
      false,
    );
  }
  if (!isZip(response.body)) {
    throw new CollectionAcquisitionError(
      "TSDR_BINARY_SIGNATURE_INVALID",
      "USPTO TSDR selected ZIP does not begin with a ZIP signature",
      false,
    );
  }
}

export class UsptoTsdrSelectedDocumentAcquirer implements CollectionArtifactAcquirer {
  readonly executor = USPTO_TSDR_SELECTED_DOCUMENT_EXECUTOR;
  private readonly admission;
  private readonly transport: UsptoTsdrBinaryTransport;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(private readonly options: UsptoTsdrSelectedDocumentAcquirerOptions) {
    this.admission = admitUsptoTsdrAcquisition(options.request);
    if (
      this.admission.intent !== "SELECTED_DOCUMENT_BINARY" ||
      !this.admission.document ||
      !this.admission.format
    ) {
      throw new CollectionAcquisitionError(
        "TSDR_SELECTED_DOCUMENT_INTENT_REQUIRED",
        "TSDR selected-document acquirer requires SELECTED_DOCUMENT_BINARY",
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
    void _context;
    const secret = apiKey(await this.options.secretResolver.resolve(this.admission.secretRef));
    const documentId = sourceDocumentId(this.admission.document!.sourceDocumentId);
    const format = this.admission.format!;
    const sourceUri = selectedDocumentUrl(this.admission.serialNumber, documentId, format);
    const response = await this.transport({
      url: sourceUri,
      headers: {
        accept:
          format === "PDF"
            ? "application/pdf, application/octet-stream;q=0.8"
            : "application/zip, application/octet-stream;q=0.8",
        [USPTO_TSDR_API_KEY_HEADER]: secret,
      },
      timeoutMs: this.timeoutMs,
      maxResponseBytes: this.maxResponseBytes,
    });
    requireSuccessfulBinary(response, format);

    const extension = format.toLowerCase();
    return [
      {
        artifactKind: format === "PDF" ? "PDF" : "OTHER",
        mimeType: format === "PDF" ? "application/pdf" : "application/zip",
        originalName: `uspto-tsdr-${this.admission.serialNumber}-${documentId}.${extension}`,
        sourceUri,
        canonicalUri: sourceUri,
        parentArtifactIds: [this.admission.document!.sourceIndexArtifactId],
        content: response.body,
      },
    ];
  }
}

export function usptoTsdrSelectedDocumentRuntimeDescriptor() {
  return Object.freeze({
    connectorId: USPTO_TSDR_SELECTED_DOCUMENT_CONNECTOR_ID,
    connectorVersion: USPTO_TSDR_SELECTED_DOCUMENT_CONNECTOR_VERSION,
    intent: "SELECTED_DOCUMENT_BINARY" as const,
    officialOrigin: USPTO_TSDR_API_ORIGIN,
    pathTemplate: "/ts/cd/casedoc/sn{serialNumber}/{sourceDocumentId}/download.{pdf|zip}",
    artifactAdmission: "IMMUTABLE_RAW_BINARY_REQUIRED" as const,
    sourceIndexLineageRequired: true as const,
    transientViewerAuthorizationRequired: false as const,
    apiKeyHeader: USPTO_TSDR_API_KEY_HEADER,
  });
}
