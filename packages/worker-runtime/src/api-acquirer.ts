import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import type { ArtifactKind, ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";

export const API_CONNECTOR_ID = "api-worker";
export const API_CONNECTOR_VERSION = "1.0.0";
export const API_EXECUTOR: ExecutionExecutor = {
  executorId: "api-worker",
  version: API_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

const BINDING_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]{0,127}$/;
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;
const MAX_QUERY_ENTRIES = 50;
const MAX_QUERY_KEY_LENGTH = 100;
const MAX_QUERY_VALUE_LENGTH = 2_048;
const MAX_QUERY_SERIALIZED_LENGTH = 8_192;
const MAX_RESOURCE_PATH_LENGTH = 2_048;

const SENSITIVE_QUERY_KEY =
  /(?:^|[-_.])(token|secret|password|passwd|credential|authorization|auth|api[-_.]?key|access[-_.]?key)(?:$|[-_.])/i;
const FORBIDDEN_AUTH_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "proxy-authorization",
  "proxy-authenticate",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const NON_PUBLIC_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  NON_PUBLIC_ADDRESSES.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  NON_PUBLIC_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

export type ApiAuthBinding =
  | { kind: "NONE" }
  | { kind: "BEARER"; secretEnv: string }
  | { kind: "HEADER"; headerName: string; secretEnv: string };

export type ApiEndpointBinding = {
  baseUrl: string;
  auth: ApiAuthBinding;
};

export type ApiEndpointBindingMap = Readonly<Record<string, ApiEndpointBinding>>;

export type ApiResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type ApiTransportRequest = {
  hostname: string;
  resolvedAddress: string;
  family: 4 | 6;
  port: number;
  servername?: string;
  path: string;
  hostHeader: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type ApiTransportResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
};

export type ApiResolver = (hostname: string) => Promise<ApiResolvedAddress[]>;
export type ApiTransport = (request: ApiTransportRequest) => Promise<ApiTransportResponse>;

export type ApiArtifactAcquirerOptions = {
  environment?: NodeJS.ProcessEnv;
  resolver?: ApiResolver;
  transport?: ApiTransport;
};

type ApiSourceConfig = {
  endpointBinding: string;
  resourcePath: string;
  query: Record<string, string>;
  timeoutMs: number;
  maxResponseBytes: number;
  acceptedMimeTypes: string[] | null;
};

type MimeDescriptor = {
  artifactKind: ArtifactKind;
  extension: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new CollectionAcquisitionError(
      "API_CONFIG_INVALID",
      `API connectorConfig.${field} must be an integer between ${minimum} and ${maximum}`,
      false,
    );
  }
  return value as number;
}

function normalizeResourcePath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    throw new CollectionAcquisitionError(
      "API_RESOURCE_PATH_INVALID",
      "API resourcePath must be an absolute path beginning with one slash",
      false,
    );
  }
  if (
    value.length > MAX_RESOURCE_PATH_LENGTH ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\u0000")
  ) {
    throw new CollectionAcquisitionError(
      "API_RESOURCE_PATH_INVALID",
      "API resourcePath contains unsupported characters or exceeds the configured bound",
      false,
    );
  }
  for (const segment of value.split("/").slice(1)) {
    if (!segment) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new CollectionAcquisitionError(
        "API_RESOURCE_PATH_INVALID",
        "API resourcePath contains invalid percent encoding",
        false,
      );
    }
    if (
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(decoded)
    ) {
      throw new CollectionAcquisitionError(
        "API_RESOURCE_PATH_INVALID",
        "API resourcePath contains an unsafe encoded path segment",
        false,
      );
    }
  }
  return value;
}

function normalizeMime(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

function mimeDescriptor(mimeType: string): MimeDescriptor | null {
  const mime = normalizeMime(mimeType);
  if (mime === "application/json" || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mime)) {
    return { artifactKind: "JSON", extension: "json" };
  }
  if (
    mime === "application/xml" ||
    mime === "text/xml" ||
    /^application\/[a-z0-9!#$&^_.+-]+\+xml$/.test(mime)
  ) {
    return { artifactKind: "XML", extension: "xml" };
  }
  if (mime === "text/csv" || mime === "application/csv") {
    return { artifactKind: "CSV", extension: "csv" };
  }
  if (mime === "text/plain") return { artifactKind: "TEXT", extension: "txt" };
  if (mime === "text/markdown") return { artifactKind: "MARKDOWN", extension: "md" };
  return null;
}

function acceptedMimeTypes(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new CollectionAcquisitionError(
      "API_CONFIG_INVALID",
      "API acceptedMimeTypes must be a non-empty array with at most 20 entries",
      false,
    );
  }
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      throw new CollectionAcquisitionError(
        "API_CONFIG_INVALID",
        "API acceptedMimeTypes entries must be strings",
        false,
      );
    }
    const mime = normalizeMime(item);
    if (!mimeDescriptor(mime)) {
      throw new CollectionAcquisitionError(
        "API_CONFIG_INVALID",
        `API accepted MIME type ${mime} is outside the v1 structured-text allowlist`,
        false,
      );
    }
    normalized.push(mime);
  }
  return [...new Set(normalized)].sort();
}

function normalizeQuery(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  const container = record(value);
  if (!container) {
    throw new CollectionAcquisitionError(
      "API_QUERY_INVALID",
      "API query must be an object of non-secret string values",
      false,
    );
  }
  const entries = Object.entries(container);
  if (entries.length > MAX_QUERY_ENTRIES) {
    throw new CollectionAcquisitionError(
      "API_QUERY_INVALID",
      `API query may contain at most ${MAX_QUERY_ENTRIES} entries`,
      false,
    );
  }
  const normalized: Record<string, string> = {};
  for (const [key, rawValue] of entries) {
    if (
      !key ||
      key.length > MAX_QUERY_KEY_LENGTH ||
      SENSITIVE_QUERY_KEY.test(key) ||
      /[\u0000-\u001f\u007f]/.test(key)
    ) {
      throw new CollectionAcquisitionError(
        "API_QUERY_INVALID",
        "API query contains an invalid or credential-like key; credentials must use Worker bindings",
        false,
      );
    }
    if (
      typeof rawValue !== "string" ||
      rawValue.length > MAX_QUERY_VALUE_LENGTH ||
      /[\u0000\r\n]/.test(rawValue)
    ) {
      throw new CollectionAcquisitionError(
        "API_QUERY_INVALID",
        `API query value for ${key} must be a bounded string without control characters`,
        false,
      );
    }
    normalized[key] = rawValue;
  }
  const serialized = new URLSearchParams(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)),
  ).toString();
  if (serialized.length > MAX_QUERY_SERIALIZED_LENGTH) {
    throw new CollectionAcquisitionError(
      "API_QUERY_INVALID",
      `API query exceeds the ${MAX_QUERY_SERIALIZED_LENGTH}-character serialized bound`,
      false,
    );
  }
  return normalized;
}

function sourceConfig(context: ArtifactBackedExecutionContext): ApiSourceConfig {
  const config = record(context.job.sourceSnapshot.connectorConfig);
  if (!config) {
    throw new CollectionAcquisitionError(
      "API_CONFIG_INVALID",
      "API source requires connectorConfig",
      false,
    );
  }
  if (typeof config.endpointBinding !== "string" || !BINDING_ID_PATTERN.test(config.endpointBinding)) {
    throw new CollectionAcquisitionError(
      "API_BINDING_INVALID",
      "API endpointBinding must be a lowercase slug",
      false,
    );
  }
  return {
    endpointBinding: config.endpointBinding,
    resourcePath: normalizeResourcePath(config.resourcePath),
    query: normalizeQuery(config.query),
    timeoutMs: safeInteger(config.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, MAX_TIMEOUT_MS, "timeoutMs"),
    maxResponseBytes: safeInteger(
      config.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
      1,
      MAX_RESPONSE_BYTES,
      "maxResponseBytes",
    ),
    acceptedMimeTypes: acceptedMimeTypes(config.acceptedMimeTypes),
  };
}

function normalizeSecretEnv(value: unknown): string {
  if (typeof value !== "string" || !ENV_NAME_PATTERN.test(value)) {
    throw new Error("API binding secretEnv must be an uppercase environment variable name");
  }
  return value;
}

function normalizeAuth(value: unknown): ApiAuthBinding {
  if (value === undefined) return { kind: "NONE" };
  const auth = record(value);
  if (!auth || typeof auth.kind !== "string") throw new Error("API binding auth is invalid");
  if (auth.kind === "NONE") {
    if (Object.keys(auth).some((key) => key !== "kind")) throw new Error("NONE auth has extra fields");
    return { kind: "NONE" };
  }
  if (auth.kind === "BEARER") {
    if (Object.keys(auth).some((key) => !["kind", "secretEnv"].includes(key))) {
      throw new Error("BEARER auth has extra fields");
    }
    return { kind: "BEARER", secretEnv: normalizeSecretEnv(auth.secretEnv) };
  }
  if (auth.kind === "HEADER") {
    if (Object.keys(auth).some((key) => !["kind", "headerName", "secretEnv"].includes(key))) {
      throw new Error("HEADER auth has extra fields");
    }
    if (typeof auth.headerName !== "string" || !HEADER_NAME_PATTERN.test(auth.headerName)) {
      throw new Error("HEADER auth requires a valid headerName");
    }
    const headerName = auth.headerName.toLowerCase();
    if (FORBIDDEN_AUTH_HEADERS.has(headerName) || headerName === "authorization") {
      throw new Error("API binding headerName is not permitted; use BEARER for Authorization");
    }
    return { kind: "HEADER", headerName, secretEnv: normalizeSecretEnv(auth.secretEnv) };
  }
  throw new Error("API binding auth kind must be NONE, BEARER, or HEADER");
}

function normalizeBinding(bindingId: string, value: unknown): ApiEndpointBinding {
  if (!BINDING_ID_PATTERN.test(bindingId)) throw new Error(`Invalid API endpoint binding id: ${bindingId}`);
  const container = record(value);
  if (!container || Object.keys(container).some((key) => !["baseUrl", "auth"].includes(key))) {
    throw new Error(`API endpoint binding ${bindingId} must contain only baseUrl and auth`);
  }
  if (typeof container.baseUrl !== "string") throw new Error(`API endpoint binding ${bindingId} needs baseUrl`);
  const url = new URL(container.baseUrl);
  if (url.protocol !== "https:") throw new Error(`API endpoint binding ${bindingId} must use HTTPS`);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`API endpoint binding ${bindingId} baseUrl cannot contain userinfo, query, or fragment`);
  }
  if (url.pathname !== "/") {
    throw new Error(`API endpoint binding ${bindingId} baseUrl must be an origin without a path prefix`);
  }
  if (url.hostname.toLowerCase() === "localhost" || url.hostname.toLowerCase().endsWith(".localhost")) {
    throw new Error(`API endpoint binding ${bindingId} cannot target localhost`);
  }
  return { baseUrl: url.origin, auth: normalizeAuth(container.auth) };
}

export function parseApiEndpointBindings(raw: string | undefined): Record<string, ApiEndpointBinding> {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MARKORBIT_API_ENDPOINT_BINDINGS must be a JSON object");
  }
  const container = record(parsed);
  if (!container) throw new Error("MARKORBIT_API_ENDPOINT_BINDINGS must be a JSON object");
  const bindings: Record<string, ApiEndpointBinding> = {};
  for (const [bindingId, value] of Object.entries(container)) {
    bindings[bindingId] = normalizeBinding(bindingId, value);
  }
  return bindings;
}

function publicAddress(address: string, family: 4 | 6): boolean {
  if (isIP(address) !== family) return false;
  if (family === 4) return !NON_PUBLIC_ADDRESSES.check(address, "ipv4");
  if (address.toLowerCase().startsWith("::ffff:")) return false;
  const firstHextet = Number.parseInt(address.split(":", 1)[0] || "0", 16);
  if (!Number.isFinite(firstHextet) || firstHextet < 0x2000 || firstHextet > 0x3fff) return false;
  return !NON_PUBLIC_ADDRESSES.check(address, "ipv6");
}

export const defaultApiResolver: ApiResolver = async (hostname) => {
  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    return [{ address: hostname, family: literalFamily }];
  }
  const resolved = await lookup(hostname, { all: true, verbatim: true });
  return resolved.map((item) => ({
    address: item.address,
    family: item.family === 6 ? 6 : 4,
  }));
};

export const defaultApiTransport: ApiTransport = async (input) =>
  new Promise<ApiTransportResponse>((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: input.resolvedAddress,
        family: input.family,
        port: input.port,
        method: "GET",
        path: input.path,
        servername: input.servername,
        headers: {
          host: input.hostHeader,
          ...input.headers,
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
                "API_RESPONSE_TOO_LARGE",
                `API response exceeded the ${input.maxResponseBytes}-byte bound`,
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
      request.destroy(new CollectionAcquisitionError("API_TIMEOUT", "API request timed out", true));
    });
    request.once("error", reject);
    request.end();
  });

function requestHeaders(
  bindingId: string,
  binding: ApiEndpointBinding,
  environment: NodeJS.ProcessEnv,
  accepted: string[] | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: accepted?.join(", ") ??
      "application/json, application/xml, text/xml, text/csv, application/csv, text/plain, text/markdown",
    "user-agent": "MarkOrbit-Knowledge-API-Worker/1.0",
  };
  if (binding.auth.kind === "NONE") return headers;
  const credential = environment[binding.auth.secretEnv];
  if (!credential) {
    throw new CollectionAcquisitionError(
      "API_CREDENTIAL_UNAVAILABLE",
      `API endpoint binding ${bindingId} credential is unavailable in the Worker environment`,
      false,
    );
  }
  if (/\r|\n/.test(credential)) {
    throw new CollectionAcquisitionError(
      "API_CREDENTIAL_INVALID",
      `API endpoint binding ${bindingId} credential contains invalid control characters`,
      false,
    );
  }
  if (binding.auth.kind === "BEARER") headers.authorization = `Bearer ${credential}`;
  else headers[binding.auth.headerName] = credential;
  return headers;
}

function canonicalRequestPath(config: ApiSourceConfig): string {
  const query = new URLSearchParams(
    Object.entries(config.query).sort(([left], [right]) => left.localeCompare(right)),
  ).toString();
  return query ? `${config.resourcePath}?${query}` : config.resourcePath;
}

function safeSourceUri(config: ApiSourceConfig): string {
  const descriptor = JSON.stringify({
    binding: config.endpointBinding,
    path: config.resourcePath,
    query: Object.entries(config.query).sort(([left], [right]) => left.localeCompare(right)),
  });
  const digest = createHash("sha256").update(descriptor).digest("hex");
  return `api://${config.endpointBinding}/${digest}`;
}

function statusFailure(status: number): CollectionAcquisitionError {
  if (status >= 300 && status < 400) {
    return new CollectionAcquisitionError(
      "API_REDIRECT_REJECTED",
      "API connector does not follow redirects; bind the final HTTPS origin explicitly",
      false,
    );
  }
  const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  return new CollectionAcquisitionError(
    "API_HTTP_STATUS_REJECTED",
    `API endpoint returned HTTP ${status}`,
    retryable,
  );
}

function assertSupportedJob(context: ArtifactBackedExecutionContext): void {
  if (context.job.sourceSnapshot.sourceType !== "API") {
    throw new CollectionAcquisitionError(
      "SOURCE_TYPE_NOT_SUPPORTED",
      `API acquirer requires API sources, received ${context.job.sourceSnapshot.sourceType}`,
      false,
    );
  }
  if (context.job.jobType !== "API_COLLECTION") {
    throw new CollectionAcquisitionError(
      "JOB_TYPE_NOT_SUPPORTED",
      `API acquirer requires API_COLLECTION, received ${context.job.jobType}`,
      false,
    );
  }
  if (
    context.job.connector.connectorId !== API_CONNECTOR_ID ||
    context.job.connector.version !== API_CONNECTOR_VERSION
  ) {
    throw new CollectionAcquisitionError(
      "CONNECTOR_NOT_SUPPORTED",
      `API acquirer requires ${API_CONNECTOR_ID}@${API_CONNECTOR_VERSION}`,
      false,
    );
  }
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
    "API_TRANSPORT_FAILED",
    "API HTTPS transport failed before a governed response was obtained",
    typeof code === "string" ? retryableCodes.has(code) : true,
  );
}

export class ApiArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = API_EXECUTOR;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly resolver: ApiResolver;
  private readonly transport: ApiTransport;

  constructor(options: ApiArtifactAcquirerOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.resolver = options.resolver ?? defaultApiResolver;
    this.transport = options.transport ?? defaultApiTransport;
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    assertSupportedJob(context);
    const config = sourceConfig(context);
    let bindings: Record<string, ApiEndpointBinding>;
    try {
      bindings = parseApiEndpointBindings(this.environment.MARKORBIT_API_ENDPOINT_BINDINGS);
    } catch {
      throw new CollectionAcquisitionError(
        "API_BINDINGS_INVALID",
        "Worker API endpoint bindings are invalid",
        false,
      );
    }
    const binding = bindings[config.endpointBinding];
    if (!binding) {
      throw new CollectionAcquisitionError(
        "API_BINDING_UNAVAILABLE",
        `API endpoint binding ${config.endpointBinding} is not available on this Worker`,
        false,
      );
    }

    const endpoint = new URL(binding.baseUrl);
    let resolved: ApiResolvedAddress[];
    try {
      resolved = await this.resolver(endpoint.hostname);
    } catch (error) {
      return normalizeTransportError(error);
    }
    if (resolved.length === 0 || resolved.some((item) => !publicAddress(item.address, item.family))) {
      throw new CollectionAcquisitionError(
        "API_NETWORK_TARGET_REJECTED",
        "API endpoint resolution did not produce an exclusively public address set",
        false,
      );
    }

    const selected = resolved[0]!;
    const path = canonicalRequestPath(config);
    let response: ApiTransportResponse;
    try {
      response = await this.transport({
        hostname: endpoint.hostname,
        resolvedAddress: selected.address,
        family: selected.family,
        port: endpoint.port ? Number(endpoint.port) : 443,
        ...(isIP(endpoint.hostname) ? {} : { servername: endpoint.hostname }),
        path,
        hostHeader: endpoint.host,
        headers: requestHeaders(
          config.endpointBinding,
          binding,
          this.environment,
          config.acceptedMimeTypes,
        ),
        timeoutMs: config.timeoutMs,
        maxResponseBytes: config.maxResponseBytes,
      });
    } catch (error) {
      return normalizeTransportError(error);
    }

    if (response.statusCode < 200 || response.statusCode >= 300) throw statusFailure(response.statusCode);
    if (response.body.byteLength > config.maxResponseBytes) {
      throw new CollectionAcquisitionError(
        "API_RESPONSE_TOO_LARGE",
        `API response exceeded the ${config.maxResponseBytes}-byte bound`,
        false,
      );
    }
    if (response.body.byteLength === 0) {
      throw new CollectionAcquisitionError(
        "API_EMPTY_RESPONSE",
        "API endpoint returned an empty response body",
        false,
      );
    }

    const rawContentType = response.headers["content-type"];
    const contentType = Array.isArray(rawContentType) ? rawContentType[0] : rawContentType;
    if (!contentType) {
      throw new CollectionAcquisitionError(
        "API_CONTENT_TYPE_REQUIRED",
        "API response must declare a supported Content-Type",
        false,
      );
    }
    const mimeType = normalizeMime(contentType);
    const descriptor = mimeDescriptor(mimeType);
    if (!descriptor) {
      throw new CollectionAcquisitionError(
        "API_CONTENT_TYPE_REJECTED",
        `API response MIME type ${mimeType} is outside the v1 structured-text allowlist`,
        false,
      );
    }
    if (config.acceptedMimeTypes && !config.acceptedMimeTypes.includes(mimeType)) {
      throw new CollectionAcquisitionError(
        "API_CONTENT_TYPE_REJECTED",
        `API response MIME type ${mimeType} is not authorized by this Source`,
        false,
      );
    }

    const sourceUri = safeSourceUri(config);
    const identityDigest = sourceUri.slice(sourceUri.lastIndexOf("/") + 1, sourceUri.length);
    return [
      {
        artifactKind: descriptor.artifactKind,
        mimeType,
        originalName: `api-response-${identityDigest.slice(0, 16)}.${descriptor.extension}`,
        sourceUri,
        content: response.body,
      },
    ];
  }
}

export function createApiArtifactAcquirer(options: ApiArtifactAcquirerOptions = {}): ApiArtifactAcquirer {
  return new ApiArtifactAcquirer(options);
}
