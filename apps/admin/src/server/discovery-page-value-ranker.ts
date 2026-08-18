import {
  PAGE_VALUE_CAPABILITY_ID,
  PAGE_VALUE_CAPABILITY_VERSION,
  isPageValueScreeningResponseV1,
  type PageValueCandidateInput,
  type PageValueScreeningRequestV1,
  type PageValueScreeningResponseV1,
  type SourceCandidate,
} from "@markorbit/contracts";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import { SqlitePageValueCapabilityRepository } from "@markorbit/persistence/page-value-capability";
import { invokeCapability } from "./capability-client";
import { getRegistryDatabase } from "./source-registry";

const DEFAULT_OBJECTIVE =
  "Identify and rank the pages that are most useful as durable evidence or reference material for the current knowledge acquisition task. Explain the page title, concise summary, page type, and concrete value points. Do not make legal conclusions or claim authority that is not present in the supplied evidence.";
// Keep semantic screening bounded independently from the review-queue limit.
const MAX_SCREEN_CANDIDATES = 500;
const MAX_RANKED_RESULTS = 100;
const DEFAULT_DISCOVERY_PAGE_VALUE_TIMEOUT_MS = 8_000;

export function discoveryPageValueTimeoutMs(): number {
  const configured = process.env.MARKORBIT_DISCOVERY_PAGE_VALUE_TIMEOUT_MS?.trim();
  if (!configured) return DEFAULT_DISCOVERY_PAGE_VALUE_TIMEOUT_MS;
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 30_000) {
    throw new RegistryValidationError(
      "MARKORBIT_DISCOVERY_PAGE_VALUE_TIMEOUT_MS must be an integer from 1000 to 30000",
    );
  }
  return value;
}

export type DiscoveryPageValueRanking = {
  request: PageValueScreeningRequestV1;
  response: PageValueScreeningResponseV1;
};

export interface DiscoveryPageValueRanker {
  rank(input: {
    candidates: SourceCandidate[];
    maxResults: number;
    locale?: string;
    objective?: string;
    timeoutMs?: number;
  }): Promise<DiscoveryPageValueRanking>;
  record(response: PageValueScreeningResponseV1): void;
}

function metadataString(candidate: SourceCandidate, key: string): string | undefined {
  const value = candidate.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function metadataNumber(candidate: SourceCandidate, key: string): number | undefined {
  const value = candidate.metadata?.[key];
  return typeof value === "number" ? value : undefined;
}

function metadataStrings(candidate: SourceCandidate, key: string): string[] | undefined {
  const value = candidate.metadata?.[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}

function candidateInput(candidate: SourceCandidate): PageValueCandidateInput {
  const topic = metadataString(candidate, "topic");
  const kind = metadataString(candidate, "kind");
  const structuralScore = metadataNumber(candidate, "relevanceScore");
  const reasonCodes = metadataStrings(candidate, "reasonCodes");
  return {
    candidateId: candidate.candidateId,
    url: candidate.locator,
    ...(candidate.title ? { title: candidate.title } : {}),
    structuralSignals: {
      ...(candidate.discoveryMethod ? { discoveryMethod: candidate.discoveryMethod } : {}),
      ...(candidate.depth !== undefined ? { depth: candidate.depth } : {}),
      ...(topic ? { topic } : {}),
      ...(kind ? { kind } : {}),
      ...(structuralScore !== undefined ? { structuralScore } : {}),
      ...(reasonCodes ? { reasonCodes } : {}),
    },
  };
}

function normalizedCandidates(candidates: SourceCandidate[]): SourceCandidate[] {
  const unique = new Map<string, SourceCandidate>();
  for (const candidate of candidates) {
    if (!candidate.candidateId.trim()) continue;
    unique.set(candidate.candidateId, candidate);
  }
  const values = [...unique.values()];
  if (values.length === 0 || values.length > MAX_SCREEN_CANDIDATES) {
    throw new RegistryValidationError(
      `Discovery page value screening requires 1 to ${MAX_SCREEN_CANDIDATES} candidates`,
    );
  }
  return values;
}

function normalizedMaxResults(value: number, candidateCount: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RegistryValidationError("Discovery page value maxResults must be a positive integer");
  }
  return Math.min(value, candidateCount, MAX_RANKED_RESULTS);
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

export class SharedCapabilityDiscoveryPageValueRanker implements DiscoveryPageValueRanker {
  constructor(
    private readonly results = new SqlitePageValueCapabilityRepository(getRegistryDatabase()),
  ) {}

  async rank(input: {
    candidates: SourceCandidate[];
    maxResults: number;
    locale?: string;
    objective?: string;
    timeoutMs?: number;
  }): Promise<DiscoveryPageValueRanking> {
    const candidates = normalizedCandidates(input.candidates);
    const maxResults = normalizedMaxResults(input.maxResults, candidates.length);
    const request: PageValueScreeningRequestV1 = {
      version: PAGE_VALUE_CAPABILITY_VERSION,
      capability: PAGE_VALUE_CAPABILITY_ID,
      locale: input.locale?.trim() || "zh-CN",
      objective: input.objective?.trim() || DEFAULT_OBJECTIVE,
      maxResults,
      candidates: candidates.map(candidateInput),
    };
    const response = await invokeCapability({
      capabilityId: PAGE_VALUE_CAPABILITY_ID,
      request,
      errorCodePrefix: "PAGE_VALUE_CAPABILITY",
      timeoutMs: input.timeoutMs,
      validate: (value) =>
        validateResponse(
          value,
          new Set(candidates.map((candidate) => candidate.candidateId)),
          maxResults,
        ),
    });
    return { request, response };
  }

  record(response: PageValueScreeningResponseV1): void {
    if (response.items.length > 0) this.results.record(response);
  }
}
