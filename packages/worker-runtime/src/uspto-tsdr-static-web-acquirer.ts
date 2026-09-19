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
import { isPublicNetworkAddress, normalizedUrlHostname } from "./public-network-policy";
import { parseUsptoTsdrWebTarget } from "./uspto-tsdr-web-acquirer";

type ResolvedAddress = { address: string; family: 4 | 6 };
type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;
type StaticTransport = (
  url: URL,
  resolved: ResolvedAddress,
  maxBytes: number,
) => Promise<{
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
}>;

const EXECUTOR: ExecutionExecutor = {
  executorId: "uspto-tsdr-web-static-http",
  version: "1.0.0",
  mode: "PRODUCTION",
};

const MAX_STATUS_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const USPTO_TSDR_STATIC_ROBOTS_POLICY =
  "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1" as const;

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
          accept: "*/*",
          "user-agent": "MarkOrbit-Knowledge-TSDR-Static/1.0",
        },
        timeout: 30_000,
      },
      (response) => {
        response.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > maxBytes) {
            request.destroy(
              new CollectionAcquisitionError(
                "TSDR_WEB_STATIC_RESPONSE_TOO_LARGE",
                "TSDR static response exceeded the governed byte limit",
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
          "TSDR_WEB_STATIC_TIMEOUT",
          "TSDR static request timed out",
          true,
        ),
      ),
    );
    request.once("error", rejectPromise);
    request.end();
  });
}

function robotsAllows(text: string, pathname: string): boolean {
  const lines = text.split(/\r?\n/u);
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
    if (!applies || (key !== "allow" && key !== "disallow")) continue;
    if (!value) continue;
    rules.push({ allow: key === "allow", path: value });
  }
  const matches = rules
    .filter((rule) => pathname.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length);
  return matches[0]?.allow ?? true;
}

export class UsptoTsdrStaticWebArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = EXECUTOR;
  private readonly resolver: Resolver;
  private readonly transport: StaticTransport;

  constructor(options: { resolver?: Resolver; transport?: StaticTransport } = {}) {
    this.resolver = options.resolver ?? defaultResolver;
    this.transport = options.transport ?? fetchPinned;
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const source = context.job.sourceSnapshot;
    const policy = context.job.planSnapshot.policy;
    const planExtensions = context.job.planSnapshot.extensions ?? {};
    if (
      source.sourceType !== "WEB" ||
      source.connector.connectorId !== "crawl4ai-web" ||
      context.job.jobType !== "WEB_CRAWL"
    ) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_STATIC_BOUNDARY_INVALID",
        "TSDR static acquisition requires the governed WEB_CRAWL source boundary",
        false,
      );
    }
    if (policy.maxDepth !== 0 || policy.maxItems !== 1 || policy.respectRobots !== true) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_STATIC_BOUNDARY_INVALID",
        "TSDR static acquisition requires maxDepth=0, maxItems=1 and respectRobots=true",
        false,
      );
    }
    if (planExtensions["x-markorbit-tsdr-web-robots-policy"] !== USPTO_TSDR_STATIC_ROBOTS_POLICY) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_STATIC_ROBOTS_POLICY_INVALID",
        "TSDR static acquisition requires the frozen RFC9309 robots status policy",
        false,
      );
    }
    const raw = source.canonicalUri ?? source.entrypoints[0]?.uri;
    if (!raw) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_STATIC_TARGET_REQUIRED",
        "TSDR static acquisition requires one canonical target",
        false,
      );
    }
    const target = parseUsptoTsdrWebTarget(raw);
    const url = new URL(target.canonicalUri);
    const hostname = normalizedUrlHostname(url);
    const resolved = await this.resolver(hostname);
    if (
      resolved.length === 0 ||
      resolved.some((item) => !isPublicNetworkAddress(item.address, item.family))
    ) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_STATIC_NETWORK_TARGET_REJECTED",
        "TSDR static target did not resolve exclusively to public addresses",
        false,
      );
    }

    const robotsUrl = new URL("/robots.txt", url.origin);
    const robots = await this.transport(robotsUrl, resolved[0]!, 512 * 1024);
    if (robots.statusCode >= 200 && robots.statusCode < 300) {
      if (!robotsAllows(Buffer.from(robots.body).toString("utf8"), url.pathname)) {
        throw new CollectionAcquisitionError(
          "TSDR_WEB_STATIC_ROBOTS_DISALLOWED",
          "TSDR robots.txt disallows the requested path",
          false,
        );
      }
    } else if (robots.statusCode >= 400 && robots.statusCode < 500) {
      // RFC 9309 §2.3.1.3: 4xx means robots.txt is unavailable;
      // the crawler may access resources on the server.
    } else {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_STATIC_ROBOTS_UNREACHABLE",
        `TSDR robots.txt returned HTTP ${robots.statusCode}`,
        robots.statusCode >= 500,
      );
    }

    const maxBytes = target.surface === "MARK_IMAGE" ? MAX_IMAGE_BYTES : MAX_STATUS_BYTES;
    const response = await this.transport(url, resolved[0]!, maxBytes);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_STATIC_HTTP_STATUS_REJECTED",
        `TSDR static target returned HTTP ${response.statusCode}`,
        response.statusCode === 429 || response.statusCode >= 500,
      );
    }
    const location = response.headers.location;
    if (location) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_STATIC_REDIRECT_REJECTED",
        "TSDR static acquisition does not follow redirects",
        false,
      );
    }
    const contentTypeHeader = response.headers["content-type"];
    const contentType = (
      Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : (contentTypeHeader ?? "")
    )
      .split(";", 1)[0]!
      .trim()
      .toLowerCase();

    if (target.surface !== "MARK_IMAGE") {
      if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
        throw new CollectionAcquisitionError(
          "TSDR_WEB_STATIC_CONTENT_TYPE_REJECTED",
          "TSDR static HTML surface response must be HTML",
          false,
        );
      }
      const sample = Buffer.from(response.body)
        .subarray(0, 256 * 1024)
        .toString("utf8")
        .toLowerCase();
      if (
        [
          "verify you are human",
          "captcha",
          "access denied",
          "security check",
          "unusual traffic",
        ].some((marker) => sample.includes(marker))
      ) {
        throw new CollectionAcquisitionError(
          "TSDR_WEB_CHALLENGE_DETECTED",
          "TSDR returned a challenge/access-control page",
          false,
        );
      }
      return [
        {
          artifactKind: "HTML",
          mimeType: contentType,
          originalName:
            target.surface === "STATUS"
              ? `tsdr-${target.serialNumber}-status.html`
              : `tsdr-${target.serialNumber}-document-index.html`,
          sourceUri: target.canonicalUri,
          canonicalUri: target.canonicalUri,
          content: response.body,
        },
      ];
    }

    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(contentType)) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_STATIC_CONTENT_TYPE_REJECTED",
        "TSDR mark image response must be a supported image type",
        false,
      );
    }
    return [
      {
        artifactKind: "IMAGE",
        mimeType: contentType,
        originalName: `tsdr-${target.serialNumber}-mark-image`,
        sourceUri: target.canonicalUri,
        canonicalUri: target.canonicalUri,
        content: response.body,
      },
    ];
  }
}
