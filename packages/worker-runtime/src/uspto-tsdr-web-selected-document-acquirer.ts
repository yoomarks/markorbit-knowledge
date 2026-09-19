import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import {
  USPTO_TSDR_DOCUMENT_CLASSIFIER_IDENTITY,
  USPTO_TSDR_DOCUMENT_CLASSIFIER_VERSION,
  classifyUsptoTsdrDocument,
} from "./uspto-tsdr-document-classifier";
import { isPublicNetworkAddress, normalizedUrlHostname } from "./public-network-policy";
import { parseUsptoTsdrWebTarget } from "./uspto-tsdr-web-acquirer";
import { USPTO_TSDR_STATIC_ROBOTS_POLICY } from "./uspto-tsdr-static-web-acquirer";

type ResolvedAddress = { address: string; family: 4 | 6 };
type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;
type PinnedTransport = (
  url: URL,
  resolved: ResolvedAddress,
  maxBytes: number,
) => Promise<{
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
}>;

export type UsptoTsdrWebSelectedDocumentSelection = {
  sourceIndexArtifactId: string;
  sourceIndexArtifactSha256: string;
  sourceDocumentId: string;
  sourceDocumentType: string;
  sourceDescription: string;
  sourceDisplayDate: string;
  sourcePageCount: number;
  family: "OFFICE_ACTION";
  classifierIdentity: typeof USPTO_TSDR_DOCUMENT_CLASSIFIER_IDENTITY;
  classifierVersion: typeof USPTO_TSDR_DOCUMENT_CLASSIFIER_VERSION;
  downloadUrl: string;
};

const EXECUTOR: ExecutionExecutor = {
  executorId: "uspto-tsdr-web-selected-document",
  version: "1.0.0",
  mode: "PRODUCTION",
};

const MAX_PDF_BYTES = 64 * 1024 * 1024;
const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const SERIAL = /^[0-9]{8}$/u;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const set = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !set.has(key));
  const missing = allowed.filter((key) => !(key in value));
  if (unknown.length || missing.length) {
    throw new Error(
      `${label} fields are invalid; missing=[${missing.join(",")}], unknown=[${unknown.join(",")}]`,
    );
  }
}

function text(value: unknown, label: string, max = 2048): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const normalized = value.trim();
  if (normalized.length > max) throw new Error(`${label} is too long`);
  return normalized;
}

export function normalizeUsptoTsdrWebSelectedDocumentSelection(
  serialNumber: string,
  value: unknown,
): UsptoTsdrWebSelectedDocumentSelection {
  if (!SERIAL.test(serialNumber)) throw new Error("serialNumber must contain exactly 8 digits");
  const input = record(value, "document");
  exactKeys(
    input,
    [
      "sourceIndexArtifactId",
      "sourceIndexArtifactSha256",
      "sourceDocumentId",
      "sourceDocumentType",
      "sourceDescription",
      "sourceDisplayDate",
      "sourcePageCount",
      "family",
      "classifierIdentity",
      "classifierVersion",
      "downloadUrl",
    ],
    "document",
  );

  const sourceIndexArtifactId = text(
    input.sourceIndexArtifactId,
    "document.sourceIndexArtifactId",
    30,
  );
  if (!ARTIFACT_ID.test(sourceIndexArtifactId)) {
    throw new Error("document.sourceIndexArtifactId must be a RawArtifact id");
  }
  const sourceIndexArtifactSha256 = text(
    input.sourceIndexArtifactSha256,
    "document.sourceIndexArtifactSha256",
    64,
  ).toLowerCase();
  if (!SHA256.test(sourceIndexArtifactSha256)) {
    throw new Error("document.sourceIndexArtifactSha256 must be a lowercase SHA-256 digest");
  }
  const sourceDocumentId = text(input.sourceDocumentId, "document.sourceDocumentId", 128);
  if (!DOC_ID.test(sourceDocumentId)) throw new Error("document.sourceDocumentId is invalid");
  const sourceDocumentType = text(input.sourceDocumentType, "document.sourceDocumentType", 512);
  const sourceDescription = text(input.sourceDescription, "document.sourceDescription", 2048);
  const sourceDisplayDate = text(input.sourceDisplayDate, "document.sourceDisplayDate", 64);
  if (
    !Number.isInteger(input.sourcePageCount) ||
    (input.sourcePageCount as number) < 1 ||
    (input.sourcePageCount as number) > 1000
  ) {
    throw new Error("document.sourcePageCount must be an integer from 1 to 1000");
  }
  if (input.family !== "OFFICE_ACTION")
    throw new Error("selected Web document must be OFFICE_ACTION");
  if (input.classifierIdentity !== USPTO_TSDR_DOCUMENT_CLASSIFIER_IDENTITY) {
    throw new Error("selected Web document classifier identity mismatch");
  }
  if (input.classifierVersion !== USPTO_TSDR_DOCUMENT_CLASSIFIER_VERSION) {
    throw new Error("selected Web document classifier version mismatch");
  }

  const classification = classifyUsptoTsdrDocument({
    sourceDocumentType,
    sourceDescription,
  });
  if (classification.status !== "CLASSIFIED" || classification.family !== "OFFICE_ACTION") {
    throw new Error("selected Web document must reproduce as OFFICE_ACTION");
  }

  const downloadUrl = validateUsptoTsdrWebSelectedDocumentUrl(
    serialNumber,
    text(input.downloadUrl, "document.downloadUrl"),
  );

  return {
    sourceIndexArtifactId,
    sourceIndexArtifactSha256,
    sourceDocumentId,
    sourceDocumentType,
    sourceDescription,
    sourceDisplayDate,
    sourcePageCount: input.sourcePageCount as number,
    family: "OFFICE_ACTION",
    classifierIdentity: USPTO_TSDR_DOCUMENT_CLASSIFIER_IDENTITY,
    classifierVersion: USPTO_TSDR_DOCUMENT_CLASSIFIER_VERSION,
    downloadUrl,
  };
}

export function validateUsptoTsdrWebSelectedDocumentUrl(serialNumber: string, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("selected Web document URL must be absolute");
  }
  if (
    url.protocol !== "https:" ||
    normalizedUrlHostname(url) !== "tsdrsec.uspto.gov" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== "/ts/cd/tmcasedoc/downloadproxy"
  ) {
    throw new Error("selected Web document URL is outside the official TSDR document boundary");
  }
  const keys = [...url.searchParams.keys()];
  const nested = url.searchParams.getAll("url");
  if (keys.length !== 1 || keys[0] !== "url" || nested.length !== 1) {
    throw new Error("selected Web document URL must contain exactly one url query parameter");
  }
  const escapedSerial = serialNumber.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  const nestedPattern = new RegExp(
    `^/api/casedoc/cms/case/${escapedSerial}/office-action/[A-Za-z0-9._-]+\\.pdf$`,
    "u",
  );
  if (!nestedPattern.test(nested[0]!)) {
    throw new Error(
      "selected Web document URL does not target the frozen serial Office Action PDF",
    );
  }
  return url.toString();
}

async function defaultResolver(hostname: string): Promise<ResolvedAddress[]> {
  const rows = await lookup(hostname, { all: true, verbatim: true });
  return rows
    .filter(
      (row): row is { address: string; family: 4 | 6 } => row.family === 4 || row.family === 6,
    )
    .map((row) => ({ address: row.address, family: row.family }));
}

async function fetchPinned(
  url: URL,
  resolved: ResolvedAddress,
  maxBytes: number,
): Promise<{
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
}> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: resolved.address,
        family: resolved.family,
        port: 443,
        servername: isIP(url.hostname) ? undefined : normalizedUrlHostname(url),
        method: "GET",
        path: url.pathname + url.search,
        headers: {
          host: url.host,
          accept: "application/pdf, application/octet-stream;q=0.8",
          "user-agent": "MarkOrbit-Knowledge-TSDR-Selected/1.0",
        },
        timeout: 30_000,
      },
      (response) => {
        response.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > maxBytes) {
            request.destroy(
              new CollectionAcquisitionError(
                "TSDR_WEB_SELECTED_RESPONSE_TOO_LARGE",
                "TSDR selected document exceeded the governed byte limit",
                false,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.once("end", () => {
          resolvePromise({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    request.once("timeout", () =>
      request.destroy(
        new CollectionAcquisitionError(
          "TSDR_WEB_SELECTED_TIMEOUT",
          "TSDR selected document request timed out",
          true,
        ),
      ),
    );
    request.once("error", rejectPromise);
    request.end();
  });
}

function robotsAllows(textValue: string, pathname: string): boolean {
  const lines = textValue.split(/\r?\n/u);
  let applies = false;
  const rules: Array<{ allow: boolean; path: string }> = [];
  for (const raw of lines) {
    const line = raw.split("#", 1)[0]!.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      applies = value === "*";
      continue;
    }
    if (!applies || (key !== "allow" && key !== "disallow") || !value) continue;
    rules.push({ allow: key === "allow", path: value });
  }
  const matches = rules
    .filter((rule) => pathname.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length);
  return matches[0]?.allow ?? true;
}

function contentType(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers["content-type"];
  return (Array.isArray(raw) ? raw[0] : (raw ?? "")).split(";", 1)[0]!.trim().toLowerCase();
}

function isPdf(body: Uint8Array): boolean {
  return body.byteLength >= 5 && Buffer.from(body).subarray(0, 5).toString("ascii") === "%PDF-";
}

export class UsptoTsdrWebSelectedDocumentAcquirer implements CollectionArtifactAcquirer {
  readonly executor = EXECUTOR;
  private readonly resolver: Resolver;
  private readonly transport: PinnedTransport;
  private readonly selection: UsptoTsdrWebSelectedDocumentSelection;

  constructor(
    private readonly options: {
      serialNumber: string;
      document: UsptoTsdrWebSelectedDocumentSelection;
      resolver?: Resolver;
      transport?: PinnedTransport;
    },
  ) {
    this.selection = normalizeUsptoTsdrWebSelectedDocumentSelection(
      options.serialNumber,
      options.document,
    );
    this.resolver = options.resolver ?? defaultResolver;
    this.transport = options.transport ?? fetchPinned;
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const source = context.job.sourceSnapshot;
    const plan = context.job.planSnapshot;
    const policy = plan.policy;
    const extensions = plan.extensions ?? {};
    if (
      source.sourceType !== "WEB" ||
      source.connector.connectorId !== "crawl4ai-web" ||
      context.job.jobType !== "WEB_CRAWL"
    ) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_SELECTED_BOUNDARY_INVALID",
        "Selected document requires the governed TSDR WEB_CRAWL boundary",
        false,
      );
    }
    const rawSource = source.canonicalUri ?? source.entrypoints[0]?.uri;
    if (!rawSource) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_SELECTED_BOUNDARY_INVALID",
        "Selected document requires the immutable document-index Source",
        false,
      );
    }
    const indexTarget = parseUsptoTsdrWebTarget(rawSource);
    if (
      indexTarget.surface !== "DOCUMENT_INDEX" ||
      indexTarget.serialNumber !== this.options.serialNumber
    ) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_SELECTED_BOUNDARY_INVALID",
        "Selected document Source must be the matching TSDR document index",
        false,
      );
    }
    if (
      policy.maxDepth !== 0 ||
      policy.maxItems !== 1 ||
      policy.respectRobots !== true ||
      policy.renderJavascript !== false ||
      policy.rateLimitPerMinute < 1 ||
      policy.rateLimitPerMinute > 4 ||
      plan.output.artifactKinds.length !== 1 ||
      plan.output.artifactKinds[0] !== "PDF" ||
      extensions["x-markorbit-tsdr-web-acceptance-stage"] !== "SELECTED_DOCUMENT" ||
      extensions["x-markorbit-tsdr-web-robots-policy"] !== USPTO_TSDR_STATIC_ROBOTS_POLICY ||
      extensions["x-markorbit-tsdr-web-selected-parent-artifact-id"] !==
        this.selection.sourceIndexArtifactId ||
      extensions["x-markorbit-tsdr-web-selected-parent-sha256"] !==
        this.selection.sourceIndexArtifactSha256 ||
      extensions["x-markorbit-tsdr-web-selected-document-id"] !== this.selection.sourceDocumentId
    ) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_SELECTED_BOUNDARY_INVALID",
        "Selected document CollectionPlan does not match the frozen selection",
        false,
      );
    }

    const url = new URL(this.selection.downloadUrl);
    const hostname = normalizedUrlHostname(url);
    const resolved = await this.resolver(hostname);
    if (
      resolved.length === 0 ||
      resolved.some((item) => !isPublicNetworkAddress(item.address, item.family))
    ) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_SELECTED_NETWORK_TARGET_REJECTED",
        "Selected document target did not resolve exclusively to public addresses",
        false,
      );
    }

    const robotsUrl = new URL("/robots.txt", url.origin);
    const robots = await this.transport(robotsUrl, resolved[0]!, 512 * 1024);
    if (robots.statusCode >= 200 && robots.statusCode < 300) {
      if (!robotsAllows(Buffer.from(robots.body).toString("utf8"), url.pathname)) {
        throw new CollectionAcquisitionError(
          "TSDR_WEB_SELECTED_ROBOTS_DISALLOWED",
          "TSDR robots.txt disallows the selected document path",
          false,
        );
      }
    } else if (robots.statusCode >= 400 && robots.statusCode < 500) {
      // RFC 9309 §2.3.1.3: 4xx means robots.txt is unavailable and access is allowed.
    } else {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_SELECTED_ROBOTS_UNREACHABLE",
        `TSDR robots.txt returned HTTP ${robots.statusCode}`,
        robots.statusCode >= 500,
      );
    }

    const response = await this.transport(url, resolved[0]!, MAX_PDF_BYTES);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_SELECTED_HTTP_STATUS_REJECTED",
        `TSDR selected document returned HTTP ${response.statusCode}`,
        response.statusCode === 429 || response.statusCode >= 500,
      );
    }
    if (response.headers.location) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_SELECTED_REDIRECT_REJECTED",
        "Selected document acquisition does not follow redirects",
        false,
      );
    }
    const type = contentType(response.headers);
    if (type !== "application/pdf" && type !== "application/octet-stream") {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_SELECTED_CONTENT_TYPE_REJECTED",
        `Selected document returned unexpected content type ${type}`,
        false,
      );
    }
    if (!isPdf(response.body)) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_SELECTED_PDF_SIGNATURE_INVALID",
        "Selected document does not begin with a PDF signature",
        false,
      );
    }

    return [
      {
        artifactKind: "PDF",
        mimeType: "application/pdf",
        originalName: `tsdr-${this.options.serialNumber}-${this.selection.sourceDocumentId}.pdf`,
        sourceUri: this.selection.downloadUrl,
        canonicalUri: this.selection.downloadUrl,
        parentArtifactIds: [this.selection.sourceIndexArtifactId],
        content: response.body,
      },
    ];
  }
}

export function usptoTsdrWebSelectedDocumentRuntimeDescriptor() {
  return Object.freeze({
    executorId: EXECUTOR.executorId,
    executorVersion: EXECUTOR.version,
    officialOrigin: "https://tsdrsec.uspto.gov",
    sourceIndexLineageRequired: true as const,
    transientViewerAuthorizationRequired: false as const,
    artifactAdmission: "IMMUTABLE_RAW_BINARY_REQUIRED" as const,
    robotsPolicy: USPTO_TSDR_STATIC_ROBOTS_POLICY,
    maxResponseBytes: MAX_PDF_BYTES,
  });
}
