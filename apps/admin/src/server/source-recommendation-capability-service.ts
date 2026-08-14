import { createHash } from "node:crypto";
import {
  SOURCE_RECOMMENDATION_CAPABILITY_ID,
  SOURCE_RECOMMENDATION_CAPABILITY_VERSION,
  isSourceRecommendationResponseV1,
  type SourceCandidate,
  type SourceDefinition,
  type SourceRecommendationRequestV1,
  type SourceRecommendationResponseV1,
} from "@markorbit/contracts";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import type { SourceCandidateRecord } from "@markorbit/persistence/source-discovery";
import { capabilityConnectionStatus, invokeCapability } from "./capability-client";
import { getSourceDiscoveryRepository, getSourceRepository } from "./source-registry";

const DEFAULT_OBJECTIVE =
  "Recommend independent public sources that would materially improve acquisition coverage around the supplied source. Prefer authoritative, durable and directly accessible sources. Do not make legal conclusions. Recommendations are untrusted acquisition candidates and will require human approval before any collection begins.";
const MAX_RESULTS = 30;
const MAX_KNOWN_URLS = 500;

export type SourceRecommendationCapabilityStatus = {
  capability: typeof SOURCE_RECOMMENDATION_CAPABILITY_ID;
  configured: boolean;
  endpoint?: string;
  maxResults: number;
};

export type SourceRecommendationRun = {
  request: SourceRecommendationRequestV1;
  response: SourceRecommendationResponseV1;
  batchId?: string;
  candidates: SourceCandidateRecord[];
  skipped: Array<{ url: string; reason: string }>;
};

function isPrivateIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function normalizePublicUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new RegistryValidationError(`${field} must be a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RegistryValidationError(`${field} must use http or https`);
  }
  if (url.username || url.password) {
    throw new RegistryValidationError(`${field} cannot contain URL credentials`);
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "::1" ||
    isPrivateIpv4(hostname)
  ) {
    throw new RegistryValidationError(`${field} cannot target a local or private host`);
  }

  url.hash = "";
  url.hostname = hostname;
  const parameters = [...url.searchParams.entries()]
    .filter(([key]) => {
      const normalized = key.toLowerCase();
      return !(normalized.startsWith("utm_") || normalized === "gclid" || normalized === "fbclid");
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder === 0 ? leftValue.localeCompare(rightValue) : keyOrder;
    });
  url.search = "";
  for (const [key, parameterValue] of parameters) url.searchParams.append(key, parameterValue);
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

function sourceUrl(source: SourceDefinition): string {
  const candidates = [source.canonicalUri, ...source.entrypoints.map((entrypoint) => entrypoint.uri)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return normalizePublicUrl(candidate, "source URL");
    } catch {
      // Continue until a public HTTP(S) entrypoint is found.
    }
  }
  throw new RegistryValidationError(
    `Source ${source.id} has no public HTTP(S) URL available for source recommendation`,
  );
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function normalizedMaxResults(value: number | undefined): number {
  const max = value ?? 12;
  if (!Number.isInteger(max) || max < 1 || max > MAX_RESULTS) {
    throw new RegistryValidationError(`maxResults must be an integer from 1 to ${MAX_RESULTS}`);
  }
  return max;
}

function origin(value: string): string {
  return new URL(value).origin.toLowerCase();
}

function validateResponse(value: unknown, maxResults: number): SourceRecommendationResponseV1 {
  if (!isSourceRecommendationResponseV1(value)) {
    throw new RegistryError(
      "SOURCE_RECOMMENDATION_CAPABILITY_INVALID_RESPONSE",
      "Source recommendation capability returned an invalid v1 response",
    );
  }
  if (value.items.length > maxResults) {
    throw new RegistryError(
      "SOURCE_RECOMMENDATION_CAPABILITY_TOO_MANY_RESULTS",
      "Source recommendation capability returned more items than requested",
    );
  }
  const seen = new Set<string>();
  for (const item of value.items) {
    const normalized = normalizePublicUrl(item.url, "recommendation URL");
    if (seen.has(normalized)) {
      throw new RegistryError(
        "SOURCE_RECOMMENDATION_CAPABILITY_DUPLICATE_URL",
        `Source recommendation capability returned duplicate URL ${normalized}`,
      );
    }
    seen.add(normalized);
  }
  return value;
}

function allKnownUrls(): string[] {
  const sources = getSourceRepository().list({ limit: 100 }).items;
  const discovery = getSourceDiscoveryRepository().listCandidates({ limit: 500 }).items;
  const values = [
    ...sources.flatMap((source) => [
      ...(source.canonicalUri ? [source.canonicalUri] : []),
      ...source.entrypoints.map((entrypoint) => entrypoint.uri),
    ]),
    ...discovery.map((record) => record.candidate.locator),
  ];
  const normalized = new Set<string>();
  for (const value of values) {
    try {
      normalized.add(normalizePublicUrl(value, "known URL"));
    } catch {
      // Non-web source entrypoints are not useful to this capability.
    }
    if (normalized.size >= MAX_KNOWN_URLS) break;
  }
  return [...normalized];
}

function metadataFor(
  item: SourceRecommendationResponseV1["items"][number],
  response: SourceRecommendationResponseV1,
  sourceId: string,
): Record<string, unknown> {
  return {
    kind: "RELATED_SOURCE",
    sourceRecommendation: true,
    recommendedFromSourceId: sourceId,
    recommendationSummary: item.summary,
    recommendationReason: item.reason,
    recommendationRelationshipHint: item.relationshipHint,
    recommendationScore: item.score,
    recommendationPriority: item.priority,
    capabilityProviderId: response.provider.providerId,
    ...(response.provider.model ? { capabilityModel: response.provider.model } : {}),
    ...(response.provider.executionId
      ? { capabilityExecutionId: response.provider.executionId }
      : {}),
    ...(item.evidenceUrls?.length ? { evidenceUrls: item.evidenceUrls } : {}),
    fetchEligibleBeforeReview: false,
  };
}

export class SourceRecommendationCapabilityService {
  private readonly sources = getSourceRepository();
  private readonly discovery = getSourceDiscoveryRepository();

  status(): SourceRecommendationCapabilityStatus {
    const connection = capabilityConnectionStatus(SOURCE_RECOMMENDATION_CAPABILITY_ID);
    return {
      capability: SOURCE_RECOMMENDATION_CAPABILITY_ID,
      configured: connection.configured,
      ...(connection.endpoint ? { endpoint: connection.endpoint } : {}),
      maxResults: MAX_RESULTS,
    };
  }

  async recommend(input: {
    sourceId: string;
    locale?: string;
    objective?: string;
    maxResults?: number;
  }): Promise<SourceRecommendationRun> {
    const source = this.sources.getById(input.sourceId);
    if (!source) {
      throw new RegistryError("SOURCE_NOT_FOUND", `Source ${input.sourceId} was not found`);
    }
    const canonicalUrl = sourceUrl(source);
    const maxResults = normalizedMaxResults(input.maxResults);
    const knownUrls = allKnownUrls();
    const request: SourceRecommendationRequestV1 = {
      version: SOURCE_RECOMMENDATION_CAPABILITY_VERSION,
      capability: SOURCE_RECOMMENDATION_CAPABILITY_ID,
      locale: input.locale?.trim() || "zh-CN",
      objective: input.objective?.trim() || DEFAULT_OBJECTIVE,
      maxResults,
      source: {
        sourceId: source.id,
        name: source.name,
        canonicalUrl,
        entrypoints: source.entrypoints.map((entrypoint) => entrypoint.uri),
        jurisdictions: source.jurisdictions,
        languages: source.languages,
        category: source.category,
        authorityLevel: source.authorityLevel,
      },
      knownUrls,
    };

    const response = await invokeCapability({
      capabilityId: SOURCE_RECOMMENDATION_CAPABILITY_ID,
      request,
      errorCodePrefix: "SOURCE_RECOMMENDATION_CAPABILITY",
      validate: (value) => validateResponse(value, maxResults),
    });

    const sourceOrigin = origin(canonicalUrl);
    const known = new Set(knownUrls);
    const skipped: Array<{ url: string; reason: string }> = [];
    const candidates: SourceCandidate[] = [];
    for (const item of response.items) {
      let locator: string;
      try {
        locator = normalizePublicUrl(item.url, "recommendation URL");
      } catch (error) {
        skipped.push({
          url: item.url,
          reason: error instanceof Error ? error.message : "Invalid recommendation URL",
        });
        continue;
      }
      if (item.priority === "SKIP") {
        skipped.push({ url: locator, reason: "Capability marked recommendation as SKIP" });
        continue;
      }
      if (origin(locator) === sourceOrigin) {
        skipped.push({ url: locator, reason: "Recommendation resolves to the current source origin" });
        continue;
      }
      if (known.has(locator)) {
        skipped.push({ url: locator, reason: "URL already exists in Sources or the review queue" });
        continue;
      }
      known.add(locator);
      candidates.push({
        candidateId: stableId("cand", locator),
        locator,
        title: item.title.trim(),
        discoveredAt: response.generatedAt,
        status: "DISCOVERED",
        discoveredFrom: canonicalUrl,
        discoveryMethod: "RELATED_SOURCE",
        depth: 0,
        metadata: metadataFor(item, response, source.id),
      });
    }

    if (candidates.length === 0) {
      return { request, response, candidates: [], skipped };
    }

    const seed = this.discovery.createSeed({
      locator: canonicalUrl,
      metadata: {
        source: "source-recommendation-capability",
        sourceId: source.id,
        fetchEligibleBeforeReview: false,
      },
    });
    const responseKey = JSON.stringify({
      sourceId: source.id,
      generatedAt: response.generatedAt,
      provider: response.provider,
      urls: candidates.map((candidate) => candidate.locator).sort(),
    });
    const batchId = stableId("related", responseKey);
    if (!this.discovery.getBatch(batchId)) {
      this.discovery.createBatch({
        batchId,
        seeds: [
          {
            seedId: seed.seedId,
            locator: canonicalUrl,
            metadata: {
              sourceId: source.id,
              capability: SOURCE_RECOMMENDATION_CAPABILITY_ID,
              fetchEligibleBeforeReview: false,
            },
          },
        ],
        createdAt: response.generatedAt,
        constraints: {
          maxDepth: 0,
          maxCandidates: candidates.length,
          maxFetches: 0,
          sameHostOnly: false,
          respectRobots: true,
          discoverSitemaps: false,
          discoverExternalLinks: false,
          maxExternalCandidates: candidates.length,
        },
      });
      this.discovery.completeBatch(batchId, candidates);
    }

    const records = candidates
      .map((candidate) => this.discovery.getCandidate(candidate.candidateId))
      .filter((record): record is SourceCandidateRecord => Boolean(record));
    return { request, response, batchId, candidates: records, skipped };
  }
}

let singleton: SourceRecommendationCapabilityService | null = null;

export function getSourceRecommendationCapabilityService(): SourceRecommendationCapabilityService {
  singleton ??= new SourceRecommendationCapabilityService();
  return singleton;
}
