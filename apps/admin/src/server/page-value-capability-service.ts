import {
  PAGE_VALUE_CAPABILITY_ID,
  PAGE_VALUE_CAPABILITY_VERSION,
  isPageValueScreeningResponseV1,
  type PageValueCandidateInput,
  type PageValueScreeningRequestV1,
  type PageValueScreeningResponseV1,
} from "@markorbit/contracts";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import { SqlitePageValueCapabilityRepository } from "@markorbit/persistence/page-value-capability";
import type { SourceCandidateRecord } from "@markorbit/persistence/source-discovery";
import { getRegistryDatabase, getSourceDiscoveryRepository } from "./source-registry";

const DEFAULT_OBJECTIVE =
  "Identify and rank the pages that are most useful as durable evidence or reference material for the current knowledge acquisition task. Explain the page title, concise summary, page type, and concrete value points. Do not make legal conclusions or claim authority that is not present in the supplied evidence.";
const MAX_CANDIDATES = 500;
const MAX_RESULTS = 100;
const DEFAULT_TIMEOUT_MS = 45_000;

export type PageValueCapabilityStatus = {
  capability: typeof PAGE_VALUE_CAPABILITY_ID;
  configured: boolean;
  endpoint?: string;
  maxCandidates: number;
  maxResults: number;
};

function metadataString(candidate: SourceCandidateRecord, key: string): string | undefined {
  const value = candidate.candidate.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function metadataNumber(candidate: SourceCandidateRecord, key: string): number | undefined {
  const value = candidate.candidate.metadata?.[key];
  return typeof value === "number" ? value : undefined;
}

function metadataStrings(candidate: SourceCandidateRecord, key: string): string[] | undefined {
  const value = candidate.candidate.metadata?.[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}

function candidateInput(record: SourceCandidateRecord): PageValueCandidateInput {
  const structuralSignals = {
    ...(record.candidate.discoveryMethod
      ? { discoveryMethod: record.candidate.discoveryMethod }
      : {}),
    ...(record.candidate.depth !== undefined ? { depth: record.candidate.depth } : {}),
    ...(metadataString(record, "topic") ? { topic: metadataString(record, "topic") } : {}),
    ...(metadataString(record, "kind") ? { kind: metadataString(record, "kind") } : {}),
    ...(metadataNumber(record, "relevanceScore") !== undefined
      ? { structuralScore: metadataNumber(record, "relevanceScore") }
      : {}),
    ...(metadataStrings(record, "reasonCodes")
      ? { reasonCodes: metadataStrings(record, "reasonCodes") }
      : {}),
  };
  return {
    candidateId: record.candidate.candidateId,
    url: record.candidate.locator,
    ...(record.candidate.title ? { title: record.candidate.title } : {}),
    structuralSignals,
  };
}

function endpoint(): string | null {
  const base = process.env.MARKORBIT_CAPABILITY_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/v1/capabilities/${PAGE_VALUE_CAPABILITY_ID}`;
}

function timeoutMs(): number {
  const configured = process.env.MARKORBIT_CAPABILITY_TIMEOUT_MS?.trim();
  if (!configured) return DEFAULT_TIMEOUT_MS;
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 180_000) {
    throw new RegistryValidationError(
      "MARKORBIT_CAPABILITY_TIMEOUT_MS must be an integer from 1000 to 180000",
    );
  }
  return value;
}

function bearerHeaders(): Record<string, string> {
  const token = process.env.MARKORBIT_CAPABILITY_API_KEY?.trim();
  return token ? { authorization: `Bearer ${token}` } : {};
}

function normalizedCandidateIds(candidateIds: string[]): string[] {
  const ids = [...new Set(candidateIds.map((value) => value.trim()).filter(Boolean))];
  if (ids.length === 0 || ids.length > MAX_CANDIDATES) {
    throw new RegistryValidationError(`candidateIds must contain 1 to ${MAX_CANDIDATES} IDs`);
  }
  return ids;
}

function normalizedMaxResults(value: number | undefined, candidateCount: number): number {
  const max = value ?? Math.min(MAX_RESULTS, candidateCount);
  if (!Number.isInteger(max) || max < 1 || max > MAX_RESULTS) {
    throw new RegistryValidationError(`maxResults must be an integer from 1 to ${MAX_RESULTS}`);
  }
  return Math.min(max, candidateCount);
}

function validateResponse(
  value: unknown,
  candidateIds: Set<string>,
  maxResults: number,
): PageValueScreeningResponseV1 {
  if (!isPageValueScreeningResponseV1(value)) {
    throw new RegistryError(
      "PAGE_VALUE_CAPABILITY_INVALID_RESPONSE",
      "Page value capability returned an invalid v1 response",
    );
  }
  if (value.items.length > maxResults) {
    throw new RegistryError(
      "PAGE_VALUE_CAPABILITY_TOO_MANY_RESULTS",
      "Page value capability returned more items than requested",
    );
  }
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!candidateIds.has(item.candidateId)) {
      throw new RegistryError(
        "PAGE_VALUE_CAPABILITY_UNKNOWN_CANDIDATE",
        `Page value capability returned unknown candidate ${item.candidateId}`,
      );
    }
    if (seen.has(item.candidateId)) {
      throw new RegistryError(
        "PAGE_VALUE_CAPABILITY_DUPLICATE_CANDIDATE",
        `Page value capability returned candidate ${item.candidateId} more than once`,
      );
    }
    seen.add(item.candidateId);
  }
  return {
    ...value,
    items: [...value.items].sort((left, right) => right.score - left.score),
  };
}

export class PageValueCapabilityService {
  private readonly discovery = getSourceDiscoveryRepository();
  private readonly results = new SqlitePageValueCapabilityRepository(getRegistryDatabase());

  status(): PageValueCapabilityStatus {
    const configuredEndpoint = endpoint();
    return {
      capability: PAGE_VALUE_CAPABILITY_ID,
      configured: Boolean(configuredEndpoint),
      ...(configuredEndpoint ? { endpoint: configuredEndpoint } : {}),
      maxCandidates: MAX_CANDIDATES,
      maxResults: MAX_RESULTS,
    };
  }

  latest(candidateIds: string[]) {
    return this.results.latestForCandidates(candidateIds);
  }

  async screen(input: {
    candidateIds: string[];
    locale?: string;
    objective?: string;
    maxResults?: number;
  }) {
    const capabilityEndpoint = endpoint();
    if (!capabilityEndpoint) {
      throw new RegistryError(
        "PAGE_VALUE_CAPABILITY_NOT_CONFIGURED",
        "Shared page-value capability is not configured. Set MARKORBIT_CAPABILITY_BASE_URL to the reusable capability service.",
      );
    }

    const ids = normalizedCandidateIds(input.candidateIds);
    const candidates = ids.map((candidateId) => {
      const record = this.discovery.getCandidate(candidateId);
      if (!record) {
        throw new RegistryError(
          "SOURCE_CANDIDATE_NOT_FOUND",
          `Source candidate ${candidateId} was not found`,
        );
      }
      return record;
    });
    const maxResults = normalizedMaxResults(input.maxResults, candidates.length);
    const request: PageValueScreeningRequestV1 = {
      version: PAGE_VALUE_CAPABILITY_VERSION,
      capability: PAGE_VALUE_CAPABILITY_ID,
      locale: input.locale?.trim() || "zh-CN",
      objective: input.objective?.trim() || DEFAULT_OBJECTIVE,
      maxResults,
      candidates: candidates.map(candidateInput),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    let response: Response;
    try {
      response = await fetch(capabilityEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...bearerHeaders(),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (error) {
      throw new RegistryError(
        "PAGE_VALUE_CAPABILITY_UNAVAILABLE",
        error instanceof Error ? error.message : "Shared page-value capability is unavailable",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = (await response.text()).slice(0, 1000);
      throw new RegistryError(
        "PAGE_VALUE_CAPABILITY_HTTP_ERROR",
        `Shared page-value capability returned HTTP ${response.status}${text ? `: ${text}` : ""}`,
      );
    }

    const value = (await response.json()) as unknown;
    const validated = validateResponse(value, new Set(ids), maxResults);
    const records = this.results.record(validated);
    return { request, response: validated, records };
  }
}

let singleton: PageValueCapabilityService | null = null;

export function getPageValueCapabilityService(): PageValueCapabilityService {
  singleton ??= new PageValueCapabilityService();
  return singleton;
}
