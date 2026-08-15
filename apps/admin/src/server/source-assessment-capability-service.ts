import {
  SOURCE_ASSESSMENT_CAPABILITY_ID,
  SOURCE_ASSESSMENT_CAPABILITY_VERSION,
  isSourceAssessmentResponseV1,
  type SourceAssessmentFactsV1,
  type SourceAssessmentRequestV1,
  type SourceAssessmentResponseV1,
  type SourceDefinition,
} from "@markorbit/contracts";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import type { RawArtifactView } from "@markorbit/persistence/raw-artifacts";
import { capabilityConnectionStatus, invokeCapability } from "./capability-client";
import {
  getRawArtifactRepository,
  getSourceGraphRepository,
  getSourceRepository,
} from "./source-registry";

const DEFAULT_OBJECTIVE =
  "Assess the acquisition value of this source for a reusable knowledge system. Judge usefulness, authority signals, breadth, durability and distinct contribution from the supplied facts only. Do not make legal conclusions, verify professional quality, or authorize collection.";
const DEFAULT_CURRENT_WINDOW_DAYS = 90;
const MAX_CURRENT_WINDOW_DAYS = 3650;

export type EvidenceMaturitySnapshot = {
  stage: "UNOBSERVED" | "CAPTURED" | "TRACEABLE" | "CURRENT_TRACEABLE";
  rawArtifactCount: number;
  distinctArtifactHashCount: number;
  provenanceNodeCount: number;
  latestCapturedAt?: string;
  ageDays?: number;
  currentWindowDays: number;
};

export type SourceAssessmentCapabilityStatus = {
  capability: typeof SOURCE_ASSESSMENT_CAPABILITY_ID;
  configured: boolean;
  endpoint?: string;
};

export type SourceAssessmentRun = {
  request: SourceAssessmentRequestV1;
  response: SourceAssessmentResponseV1;
  evidenceMaturity: EvidenceMaturitySnapshot;
};

function publicHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.username || url.password) return undefined;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "::1" ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname)
    ) {
      return undefined;
    }
    const match172 = /^172\.(\d{1,3})\./.exec(hostname);
    if (match172) {
      const second = Number(match172[1]);
      if (second >= 16 && second <= 31) return undefined;
    }
    url.hash = "";
    url.hostname = hostname;
    return url.toString();
  } catch {
    return undefined;
  }
}

function collectArtifacts(sourceId: string): RawArtifactView[] {
  const repository = getRawArtifactRepository();
  const items: RawArtifactView[] = [];
  let offset = 0;
  for (;;) {
    const page = repository.list({ sourceId, limit: 100, offset });
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) return items;
  }
}

function currentWindowDays(): number {
  const configured = process.env.MARKORBIT_EVIDENCE_CURRENT_DAYS?.trim();
  if (!configured) return DEFAULT_CURRENT_WINDOW_DAYS;
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CURRENT_WINDOW_DAYS) {
    throw new RegistryValidationError(
      `MARKORBIT_EVIDENCE_CURRENT_DAYS must be an integer from 1 to ${MAX_CURRENT_WINDOW_DAYS}`,
    );
  }
  return parsed;
}

function acquisitionFacts(source: SourceDefinition): {
  facts: SourceAssessmentFactsV1;
  evidenceMaturity: EvidenceMaturitySnapshot;
} {
  const graph = getSourceGraphRepository().snapshotBySourceId(source.id);
  const nodes = graph?.nodes ?? [];
  const contentNodeCount = nodes.filter(
    (node) => node.kind === "PAGE" || node.kind === "DOCUMENT",
  ).length;
  const provenanceNodeCount = nodes.filter((node) =>
    node.provenance.some((item) => item.kind === "RAW_ARTIFACT"),
  ).length;
  const artifacts = collectArtifacts(source.id);
  const hashes = new Set(artifacts.map((view) => view.artifact.binaryHash.value));
  const latestCapturedAt = artifacts.reduce<string | undefined>((latest, view) => {
    if (!latest || Date.parse(view.artifact.capturedAt) > Date.parse(latest)) {
      return view.artifact.capturedAt;
    }
    return latest;
  }, undefined);
  const currentDays = currentWindowDays();
  const ageDays = latestCapturedAt
    ? Math.max(0, (Date.now() - Date.parse(latestCapturedAt)) / 86_400_000)
    : undefined;

  let stage: EvidenceMaturitySnapshot["stage"] = "UNOBSERVED";
  if (artifacts.length > 0) stage = "CAPTURED";
  if (artifacts.length > 0 && provenanceNodeCount > 0) stage = "TRACEABLE";
  if (stage === "TRACEABLE" && ageDays !== undefined && ageDays <= currentDays) {
    stage = "CURRENT_TRACEABLE";
  }

  const publicEntrypoints = source.entrypoints
    .map((entrypoint) => publicHttpUrl(entrypoint.uri))
    .filter((value): value is string => Boolean(value));
  const canonicalUrl = source.canonicalUri ? publicHttpUrl(source.canonicalUri) : undefined;
  const acquisition = {
    graphNodeCount: nodes.length,
    contentNodeCount,
    provenanceNodeCount,
    rawArtifactCount: artifacts.length,
    distinctArtifactHashCount: hashes.size,
    ...(latestCapturedAt ? { latestCapturedAt } : {}),
  };

  return {
    facts: {
      sourceId: source.id,
      name: source.name,
      sourceType: source.sourceType,
      category: source.category,
      authorityLevel: source.authorityLevel,
      status: source.status,
      ...(canonicalUrl ? { canonicalUrl } : {}),
      entrypoints: publicEntrypoints,
      jurisdictions: source.jurisdictions,
      languages: source.languages,
      tags: source.tags,
      acquisition,
    },
    evidenceMaturity: {
      stage,
      rawArtifactCount: artifacts.length,
      distinctArtifactHashCount: hashes.size,
      provenanceNodeCount,
      ...(latestCapturedAt ? { latestCapturedAt } : {}),
      ...(ageDays !== undefined ? { ageDays: Math.round(ageDays * 10) / 10 } : {}),
      currentWindowDays: currentDays,
    },
  };
}

function validateResponse(value: unknown): SourceAssessmentResponseV1 {
  if (!isSourceAssessmentResponseV1(value)) {
    throw new RegistryError(
      "SOURCE_ASSESSMENT_CAPABILITY_INVALID_RESPONSE",
      "Source assessment capability returned an invalid v1 response",
    );
  }
  return {
    ...value,
    generatedAt: new Date(value.generatedAt).toISOString(),
  };
}

export class SourceAssessmentCapabilityService {
  status(): SourceAssessmentCapabilityStatus {
    const connection = capabilityConnectionStatus(SOURCE_ASSESSMENT_CAPABILITY_ID);
    return {
      capability: SOURCE_ASSESSMENT_CAPABILITY_ID,
      configured: connection.configured,
      ...(connection.endpoint ? { endpoint: connection.endpoint } : {}),
    };
  }

  snapshot(sourceId: string): EvidenceMaturitySnapshot {
    const source = getSourceRepository().getById(sourceId);
    if (!source) throw new RegistryError("SOURCE_NOT_FOUND", `Source ${sourceId} was not found`);
    return acquisitionFacts(source).evidenceMaturity;
  }

  async assess(input: {
    sourceId: string;
    locale?: string;
    objective?: string;
  }): Promise<SourceAssessmentRun> {
    const source = getSourceRepository().getById(input.sourceId);
    if (!source) {
      throw new RegistryError("SOURCE_NOT_FOUND", `Source ${input.sourceId} was not found`);
    }
    const { facts, evidenceMaturity } = acquisitionFacts(source);
    const request: SourceAssessmentRequestV1 = {
      version: SOURCE_ASSESSMENT_CAPABILITY_VERSION,
      capability: SOURCE_ASSESSMENT_CAPABILITY_ID,
      locale: input.locale?.trim() || "zh-CN",
      objective: input.objective?.trim() || DEFAULT_OBJECTIVE,
      source: facts,
    };
    const response = await invokeCapability({
      capabilityId: SOURCE_ASSESSMENT_CAPABILITY_ID,
      request,
      errorCodePrefix: "SOURCE_ASSESSMENT_CAPABILITY",
      validate: validateResponse,
    });
    return { request, response, evidenceMaturity };
  }
}

let singleton: SourceAssessmentCapabilityService | null = null;

export function getSourceAssessmentCapabilityService(): SourceAssessmentCapabilityService {
  singleton ??= new SourceAssessmentCapabilityService();
  return singleton;
}
