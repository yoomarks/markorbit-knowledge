import type { ArtifactKind, ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { Crawl4AiSubprocessAcquirer } from "./crawl4ai-subprocess-acquirer";

const TSDR_WEB_ORIGIN = "https://tsdr.uspto.gov";
const SERIAL = /^\d{8}$/u;
const MAX_RATE_LIMIT_PER_MINUTE = 12;
const MAX_ITEMS = 10;
const TEXTUAL_KINDS = new Set<ArtifactKind>(["HTML", "MARKDOWN", "TEXT", "JSON"]);
const CHALLENGE_MARKERS = [
  "verify you are human",
  "captcha",
  "access denied",
  "security check",
  "unusual traffic",
] as const;

export type UsptoTsdrWebSurface = "STATUS" | "MARK_IMAGE" | "DOCUMENT_INDEX";

export type UsptoTsdrWebTarget = {
  surface: UsptoTsdrWebSurface;
  serialNumber: string;
  canonicalUri: string;
};

export type UsptoTsdrWebArtifactAcquirerOptions = {
  delegate?: CollectionArtifactAcquirer;
};

function invalid(message: string): never {
  throw new CollectionAcquisitionError("TSDR_WEB_BOUNDARY_INVALID", message, false);
}

export function parseUsptoTsdrWebTarget(raw: string): UsptoTsdrWebTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalid("TSDR Web target must be an absolute URL");
  }
  if (url.origin !== TSDR_WEB_ORIGIN || url.username || url.password || url.hash) {
    return invalid(
      "TSDR Web target must use the canonical public TSDR origin without credentials/hash",
    );
  }

  const status = /^\/statusview\/sn(\d{8})$/u.exec(url.pathname);
  if (status) {
    if (url.search) invalid("TSDR status target cannot include query parameters");
    return {
      surface: "STATUS",
      serialNumber: status[1]!,
      canonicalUri: url.toString(),
    };
  }

  const image = /^\/img\/(\d{8})\/large$/u.exec(url.pathname);
  if (image) {
    if (url.search) invalid("TSDR mark image target cannot include query parameters");
    return {
      surface: "MARK_IMAGE",
      serialNumber: image[1]!,
      canonicalUri: url.toString(),
    };
  }

  if (url.pathname === "/documentviewer") {
    const caseId = url.searchParams.get("caseId");
    if (url.searchParams.size !== 1 || !caseId || !/^sn\d{8}$/u.test(caseId)) {
      invalid("TSDR document viewer target must contain only caseId=sn{8-digit serial}");
    }
    const serialNumber = caseId.slice(2);
    return {
      surface: "DOCUMENT_INDEX",
      serialNumber,
      canonicalUri: url.toString(),
    };
  }

  return invalid("URL is outside the governed TSDR status/image/document surfaces");
}

function governedUrls(context: ArtifactBackedExecutionContext): UsptoTsdrWebTarget[] {
  const source = context.job.sourceSnapshot;
  if (source.sourceType !== "WEB") invalid("TSDR Web acquisition requires a WEB Source snapshot");
  if (source.connector.connectorId !== "crawl4ai-web") {
    invalid("TSDR Web acquisition requires the governed crawl4ai-web connector");
  }
  const raw = [
    ...source.entrypoints.map((entrypoint) => entrypoint.uri),
    ...(source.canonicalUri ? [source.canonicalUri] : []),
  ];
  const unique = [...new Set(raw.filter(Boolean))];
  if (unique.length === 0) invalid("TSDR Web acquisition requires a case-scoped entrypoint");
  const targets = unique.map(parseUsptoTsdrWebTarget);
  const serials = new Set(targets.map((target) => target.serialNumber));
  if (serials.size !== 1) invalid("A TSDR Web Job cannot mix serial numbers");
  return targets;
}

function assertPolicy(context: ArtifactBackedExecutionContext): void {
  const policy = context.job.planSnapshot.policy;
  if (policy.maxDepth !== 0) invalid("TSDR Web acquisition requires maxDepth=0");
  if (policy.maxItems < 1 || policy.maxItems > MAX_ITEMS) {
    invalid(`TSDR Web acquisition maxItems must be between 1 and ${MAX_ITEMS}`);
  }
  if (policy.rateLimitPerMinute < 1 || policy.rateLimitPerMinute > MAX_RATE_LIMIT_PER_MINUTE) {
    invalid(
      `TSDR Web acquisition rateLimitPerMinute must be between 1 and ${MAX_RATE_LIMIT_PER_MINUTE}`,
    );
  }
  if (!policy.respectRobots) invalid("TSDR Web acquisition requires respectRobots=true");
}

function assertNoChallenge(artifacts: AcquiredCollectionArtifact[]): void {
  const decoder = new TextDecoder();
  for (const artifact of artifacts) {
    if (!TEXTUAL_KINDS.has(artifact.artifactKind)) continue;
    const sample = decoder.decode(artifact.content.subarray(0, 256 * 1024)).toLowerCase();
    if (CHALLENGE_MARKERS.some((marker) => sample.includes(marker))) {
      throw new CollectionAcquisitionError(
        "TSDR_WEB_CHALLENGE_DETECTED",
        "TSDR returned a challenge/access-control page; automated acquisition stopped",
        false,
      );
    }
  }
}

export function usptoTsdrWebRuntimeDescriptor() {
  return {
    providerId: "uspto-tsdr-web",
    officialOrigin: TSDR_WEB_ORIGIN,
    surfaces: ["STATUS", "MARK_IMAGE", "DOCUMENT_INDEX"] as const,
    maxRateLimitPerMinute: MAX_RATE_LIMIT_PER_MINUTE,
    maxItems: MAX_ITEMS,
    recursiveCrawlForbidden: true,
    challengeBypassForbidden: true,
    artifactBackedIngestionRequired: true,
  };
}

export class UsptoTsdrWebArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor: ExecutionExecutor = {
    executorId: "uspto-tsdr-web-crawl4ai",
    version: "1.0.0",
    mode: "PRODUCTION",
  };

  private readonly delegate: CollectionArtifactAcquirer;

  constructor(options: UsptoTsdrWebArtifactAcquirerOptions = {}) {
    this.delegate =
      options.delegate ??
      new Crawl4AiSubprocessAcquirer({
        maxDepth: 0,
        maxItems: MAX_ITEMS,
        maxConcurrency: 1,
      });
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const targets = governedUrls(context);
    assertPolicy(context);
    const serialNumber = targets[0]!.serialNumber;
    if (!SERIAL.test(serialNumber)) invalid("TSDR Web serial number is invalid");

    const artifacts = await this.delegate.acquire(context);
    for (const artifact of artifacts) {
      const parsed = parseUsptoTsdrWebTarget(artifact.canonicalUri ?? artifact.sourceUri);
      if (parsed.serialNumber !== serialNumber) {
        invalid("TSDR Web artifact escaped the immutable serial-number boundary");
      }
    }
    assertNoChallenge(artifacts);
    return artifacts;
  }
}
