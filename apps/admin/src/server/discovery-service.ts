import { randomUUID } from "node:crypto";
import type { CollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import type { ConnectorRepository } from "@markorbit/persistence/connectors";
import type {
  CandidateReviewDecision,
  SourceCandidateRecord,
  SourceDiscoveryRepository,
} from "@markorbit/persistence/source-discovery";
import type { SourceGraphRepository } from "@markorbit/persistence/source-graph";
import type { SourceRepository } from "@markorbit/persistence";
import type {
  AuthorityLevel,
  CollectionPlan,
  SourceCategory,
  SourceDefinition,
  SourceDiscoveryConstraints,
  SourceDiscoveryLineage,
} from "@markorbit/contracts";
import {
  enrichDiscoveryCandidate,
  ExpandingWebsiteDiscoveryProvider,
  type SourceDiscoveryProvider,
} from "@markorbit/worker-runtime";
import {
  DEFAULT_WORKSPACE,
  RegistryConflictError,
  RegistryNotFoundError,
  RegistryValidationError,
} from "@markorbit/persistence";
import {
  ensureWebsiteSourceProfile,
  reopenCandidateGraphNode,
  reviewCandidateGraphNode,
  websiteIdentity,
  websiteOrigin,
  writeDiscoveryBatchToSourceGraph,
  writeExternalDiscoveryLinkToSourceGraph,
} from "./discovery-source-graph";
import {
  CRAWL4AI_PRODUCTION_CONNECTOR,
  ensureCrawl4AiProductionConnector,
} from "./crawl4ai-production-connector";
import {
  getCollectionPlanRepository,
  getConnectorRepository,
  getSourceDiscoveryRepository,
  getSourceGraphRepository,
  getSourceRepository,
  withRegistryTransaction,
} from "./source-registry";

const DEFAULT_CONSTRAINTS: Required<
  Pick<
    SourceDiscoveryConstraints,
    | "maxDepth"
    | "maxCandidates"
    | "maxFetches"
    | "sameHostOnly"
    | "respectRobots"
    | "discoverSitemaps"
    | "discoverExternalLinks"
    | "maxExternalCandidates"
    | "maxExpansionGeneration"
  >
> = {
  maxDepth: 1,
  maxCandidates: 100,
  maxFetches: 50,
  sameHostOnly: true,
  respectRobots: true,
  discoverSitemaps: true,
  discoverExternalLinks: true,
  maxExternalCandidates: 25,
  maxExpansionGeneration: 2,
};

export type DiscoveryIntakeDefaults = {
  category?: SourceCategory;
  authorityLevel?: AuthorityLevel;
  jurisdictions?: string[];
  languages?: string[];
  note?: string;
  tags?: string[];
};

export type StartDiscoveryInput = {
  locator: string;
  maxDepth?: number;
  maxCandidates?: number;
  maxFetches?: number;
  discoverExternalLinks?: boolean;
  maxExternalCandidates?: number;
  maxExpansionGeneration?: number;
  deniedUrlPatterns?: string[];
  lineage?: SourceDiscoveryLineage;
  intake?: DiscoveryIntakeDefaults;
};

export type StartBatchDiscoveryInput = Omit<StartDiscoveryInput, "locator" | "lineage"> & {
  locators: string[];
};

export type ExpandSourceDiscoveryInput = Omit<
  StartDiscoveryInput,
  "locator" | "lineage" | "intake"
>;

export type ReviewDiscoveryCandidateInput = {
  decision: CandidateReviewDecision;
  note?: string;
  reviewer?: string;
};

export type ReviewDiscoveryCandidateResult = {
  candidate: SourceCandidateRecord;
  source?: SourceDefinition;
  plan?: CollectionPlan;
};

export type ReopenDiscoveryCandidateInput = {
  note?: string;
  reviewer?: string;
};

type DiscoveryServiceDependencies = {
  discovery: SourceDiscoveryRepository;
  graph: SourceGraphRepository;
  sources: SourceRepository;
  plans: CollectionPlanRepository;
  connectors: ConnectorRepository;
  provider: SourceDiscoveryProvider;
  transaction: <T>(operation: () => T) => T;
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

function normalizeSeedLocator(locator: string): string {
  let url: URL;
  try {
    url = new URL(locator.trim());
  } catch {
    throw new RegistryValidationError("Discovery seed must be a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RegistryValidationError("Discovery seed must use http or https");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "::1" ||
    isPrivateIpv4(hostname)
  ) {
    throw new RegistryValidationError("Discovery seed cannot target a local or private host");
  }
  url.hash = "";
  return url.toString();
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RegistryValidationError(
      `${field} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function normalizedDeniedPatterns(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function normalizedStringList(
  values: string[] | undefined,
  options: { uppercase?: boolean; limit: number },
): string[] {
  const normalized = (values ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (options.uppercase ? value.toUpperCase() : value));
  return [...new Set(normalized)].slice(0, options.limit);
}

function normalizedIntakeDefaults(
  input: DiscoveryIntakeDefaults | undefined,
): DiscoveryIntakeDefaults | undefined {
  if (!input) return undefined;
  const jurisdictions = normalizedStringList(input.jurisdictions, { uppercase: true, limit: 20 });
  const languages = normalizedStringList(input.languages, { limit: 20 });
  const tags = normalizedStringList(input.tags, { limit: 30 });
  const note = input.note?.trim().slice(0, 1_000);
  const normalized: DiscoveryIntakeDefaults = {
    ...(input.category ? { category: input.category } : {}),
    ...(input.authorityLevel ? { authorityLevel: input.authorityLevel } : {}),
    ...(jurisdictions.length > 0 ? { jurisdictions } : {}),
    ...(languages.length > 0 ? { languages } : {}),
    ...(note ? { note } : {}),
    ...(tags.length > 0 ? { tags } : {}),
  };
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function candidateIntakeDefaults(
  candidate: SourceCandidateRecord["candidate"],
): DiscoveryIntakeDefaults | undefined {
  const value = candidate.metadata?.operatorIntakeDefaults;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return normalizedIntakeDefaults({
    ...(typeof record.category === "string" ? { category: record.category as SourceCategory } : {}),
    ...(typeof record.authorityLevel === "string"
      ? { authorityLevel: record.authorityLevel as AuthorityLevel }
      : {}),
    ...(Array.isArray(record.jurisdictions) &&
    record.jurisdictions.every((item) => typeof item === "string")
      ? { jurisdictions: record.jurisdictions as string[] }
      : {}),
    ...(Array.isArray(record.languages) &&
    record.languages.every((item) => typeof item === "string")
      ? { languages: record.languages as string[] }
      : {}),
    ...(typeof record.note === "string" ? { note: record.note } : {}),
    ...(Array.isArray(record.tags) && record.tags.every((item) => typeof item === "string")
      ? { tags: record.tags as string[] }
      : {}),
  });
}

function sourceWebsiteIdentities(source: SourceDefinition): string[] {
  const values = [
    source.canonicalUri,
    ...source.entrypoints.map((entrypoint) => entrypoint.uri),
  ].filter((value): value is string => Boolean(value));
  const identities: string[] = [];
  for (const value of values) {
    try {
      identities.push(websiteIdentity(value));
    } catch {
      // Non-HTTP entrypoints cannot represent a website identity.
    }
  }
  return [...new Set(identities)];
}

function findWebsiteSourceByIdentity(
  sources: SourceRepository,
  identity: string,
): SourceDefinition | null {
  let offset = 0;
  while (true) {
    const page = sources.list({ sourceType: "WEB", limit: 100, offset });
    const source =
      page.items.find(
        (item) => item.status !== "ARCHIVED" && sourceWebsiteIdentities(item).includes(identity),
      ) ?? null;
    if (source) return source;
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) return null;
  }
}

function websiteSourceSlug(locator: string, identity: string): string {
  const url = new URL(locator);
  const host = url.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const suffix = identity
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-8)
    .toLowerCase();
  return `${host || "discovered-website"}-${suffix}`;
}

function websiteSourceName(locator: string): string {
  return new URL(locator).hostname.slice(0, 120);
}

function extensionString(source: SourceDefinition, key: `x-${string}`): string | undefined {
  const value = source.extensions?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function sourceDiscoveryGeneration(source: SourceDefinition): number {
  const value = source.extensions?.["x-markorbit-discovery-generation"];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function sourceExpansionLocator(source: SourceDefinition): string {
  const entrypoint = source.entrypoints[0]?.uri;
  const locator = entrypoint ?? source.canonicalUri;
  if (!locator) {
    throw new RegistryConflictError(
      "DISCOVERY_SOURCE_LOCATOR_MISSING",
      `Source ${source.id} has no discovery entrypoint or canonical URI`,
    );
  }
  return locator;
}

function lineageForRoot(input: StartDiscoveryInput): SourceDiscoveryLineage {
  return input.lineage ?? { generation: 0 };
}

export class DiscoveryWorkflowService {
  constructor(private readonly dependencies: DiscoveryServiceDependencies) {}

  overview() {
    return {
      seeds: this.dependencies.discovery.listSeeds(),
      batches: this.dependencies.discovery.listBatches(20),
      candidates: this.dependencies.discovery.listCandidates({ limit: 100 }),
    };
  }

  async start(input: StartDiscoveryInput) {
    const locator = normalizeSeedLocator(input.locator);
    const intake = normalizedIntakeDefaults(input.intake);
    const maxExpansionGeneration = boundedInteger(
      input.maxExpansionGeneration,
      DEFAULT_CONSTRAINTS.maxExpansionGeneration,
      0,
      5,
      "maxExpansionGeneration",
    );
    const lineage = lineageForRoot(input);
    if (!Number.isInteger(lineage.generation) || lineage.generation < 0) {
      throw new RegistryValidationError(
        "Discovery lineage generation must be a non-negative integer",
      );
    }
    if (lineage.generation > maxExpansionGeneration) {
      throw new RegistryConflictError(
        "DISCOVERY_EXPANSION_LIMIT_REACHED",
        `Discovery generation ${lineage.generation} exceeds maximum ${maxExpansionGeneration}`,
        { generation: lineage.generation, maxExpansionGeneration },
      );
    }

    const seed = this.dependencies.discovery.createSeed({
      locator,
      metadata: {
        source: "admin-console",
        discoveryGeneration: lineage.generation,
        ...(lineage.parentSourceId ? { parentSourceId: lineage.parentSourceId } : {}),
        ...(lineage.rootSourceId ? { rootSourceId: lineage.rootSourceId } : {}),
        ...(intake ? { operatorIntakeDefaults: intake } : {}),
      },
    });
    const batch = {
      batchId: `disc_${randomUUID().replaceAll("-", "")}`,
      seeds: [{ seedId: seed.seedId, locator: seed.locator }],
      createdAt: new Date().toISOString(),
      constraints: {
        maxDepth: boundedInteger(input.maxDepth, DEFAULT_CONSTRAINTS.maxDepth, 0, 2, "maxDepth"),
        maxCandidates: boundedInteger(
          input.maxCandidates,
          DEFAULT_CONSTRAINTS.maxCandidates,
          1,
          500,
          "maxCandidates",
        ),
        maxFetches: boundedInteger(
          input.maxFetches,
          DEFAULT_CONSTRAINTS.maxFetches,
          1,
          200,
          "maxFetches",
        ),
        sameHostOnly: DEFAULT_CONSTRAINTS.sameHostOnly,
        respectRobots: DEFAULT_CONSTRAINTS.respectRobots,
        discoverSitemaps: DEFAULT_CONSTRAINTS.discoverSitemaps,
        discoverExternalLinks:
          input.discoverExternalLinks ?? DEFAULT_CONSTRAINTS.discoverExternalLinks,
        maxExternalCandidates: boundedInteger(
          input.maxExternalCandidates,
          DEFAULT_CONSTRAINTS.maxExternalCandidates,
          1,
          100,
          "maxExternalCandidates",
        ),
        maxExpansionGeneration,
        deniedUrlPatterns: normalizedDeniedPatterns(input.deniedUrlPatterns),
      },
      lineage,
    };

    this.dependencies.discovery.createBatch(batch);
    try {
      const discovered = await this.dependencies.provider.discover(batch);
      const seedOrigin = websiteOrigin(seed.locator);
      const seedIdentity = websiteIdentity(seed.locator);
      const candidates = discovered.map(enrichDiscoveryCandidate).map((candidate) =>
        intake && websiteIdentity(candidate.locator) === seedIdentity
          ? {
              ...candidate,
              metadata: {
                ...candidate.metadata,
                operatorIntakeDefaults: intake,
              },
            }
          : candidate,
      );
      const completed = this.dependencies.discovery.completeBatch(batch.batchId, candidates);

      const profile = this.dependencies.graph.getProfileByCanonicalOrigin(
        DEFAULT_WORKSPACE.id,
        seedOrigin,
      );
      if (profile) {
        const source = this.dependencies.sources.getById(profile.sourceId);
        if (source) {
          const graphCandidates = candidates.filter((candidate) =>
            belongsToOrigin(candidate.locator, seedOrigin),
          );
          this.dependencies.transaction(() => {
            writeDiscoveryBatchToSourceGraph(
              this.dependencies.graph,
              source,
              profile,
              completed.batch,
              graphCandidates,
            );
          });
        }
      }
      return { seed, batch: completed, candidates };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Discovery failed";
      this.dependencies.discovery.failBatch(batch.batchId, message);
      throw error;
    }
  }

  async startBatch(input: StartBatchDiscoveryInput) {
    if (
      !Array.isArray(input.locators) ||
      input.locators.length === 0 ||
      input.locators.length > 100
    ) {
      throw new RegistryValidationError("Batch discovery requires 1 to 100 locators");
    }

    const existingIdentities = new Map<string, string>();
    let sourceOffset = 0;
    while (true) {
      const page = this.dependencies.sources.list({
        sourceType: "WEB",
        limit: 100,
        offset: sourceOffset,
      });
      for (const source of page.items) {
        if (source.status === "ARCHIVED") continue;
        for (const identity of sourceWebsiteIdentities(source))
          existingIdentities.set(identity, source.id);
      }
      sourceOffset += page.items.length;
      if (page.items.length === 0 || sourceOffset >= page.total) break;
    }

    const seenIdentities = new Set<string>();
    const items: Array<{
      input: string;
      locator?: string;
      origin?: string;
      status: "STARTED" | "SKIPPED_DUPLICATE_INPUT" | "SKIPPED_EXISTING_SOURCE" | "FAILED";
      sourceId?: string;
      batchId?: string;
      candidateCount?: number;
      message?: string;
    }> = [];
    let started = 0;
    let skippedDuplicateInput = 0;
    let skippedExistingSource = 0;
    let failed = 0;
    let candidateCount = 0;
    const { locators, ...defaults } = input;

    for (const rawLocator of locators) {
      let locator: string;
      let origin: string;
      let identity: string;
      try {
        locator = normalizeSeedLocator(rawLocator);
        origin = websiteOrigin(locator);
        identity = websiteIdentity(locator);
      } catch (error) {
        failed += 1;
        items.push({
          input: rawLocator,
          status: "FAILED",
          message: error instanceof Error ? error.message : "Invalid discovery seed",
        });
        continue;
      }

      if (seenIdentities.has(identity)) {
        skippedDuplicateInput += 1;
        items.push({ input: rawLocator, locator, origin, status: "SKIPPED_DUPLICATE_INPUT" });
        continue;
      }
      seenIdentities.add(identity);

      const profile = this.dependencies.graph.getProfileByCanonicalOrigin(
        DEFAULT_WORKSPACE.id,
        origin,
      );
      const existingSourceId = profile?.sourceId ?? existingIdentities.get(identity);
      if (existingSourceId) {
        skippedExistingSource += 1;
        items.push({
          input: rawLocator,
          locator,
          origin,
          status: "SKIPPED_EXISTING_SOURCE",
          sourceId: existingSourceId,
        });
        continue;
      }

      try {
        const result = await this.start({ ...defaults, locator });
        started += 1;
        candidateCount += result.candidates.length;
        items.push({
          input: rawLocator,
          locator,
          origin,
          status: "STARTED",
          batchId: result.batch.batch.batchId,
          candidateCount: result.candidates.length,
        });
      } catch (error) {
        failed += 1;
        items.push({
          input: rawLocator,
          locator,
          origin,
          status: "FAILED",
          message: error instanceof Error ? error.message : "Discovery failed",
        });
      }
    }

    return {
      summary: {
        submitted: locators.length,
        uniqueOrigins: seenIdentities.size,
        started,
        skippedDuplicateInput,
        skippedExistingSource,
        failed,
        candidateCount,
      },
      items,
    };
  }

  async expandSource(sourceId: string, input: ExpandSourceDiscoveryInput = {}) {
    const source = this.dependencies.sources.getById(sourceId);
    if (!source) throw new RegistryNotFoundError(sourceId);
    if (source.sourceType !== "WEB") {
      throw new RegistryConflictError(
        "DISCOVERY_SOURCE_NOT_WEB",
        `Source ${sourceId} is not a WEB source and cannot use website expansion`,
      );
    }
    if (source.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "DISCOVERY_SOURCE_NOT_ACTIVE",
        `Source ${sourceId} must be ACTIVE before discovery expansion`,
      );
    }
    const profile = this.dependencies.graph.getProfileBySourceId(sourceId);
    if (!profile) {
      throw new RegistryConflictError(
        "DISCOVERY_SOURCE_PROFILE_MISSING",
        `Source ${sourceId} has no WebsiteSourceProfile`,
      );
    }

    const generation = sourceDiscoveryGeneration(source);
    const maxExpansionGeneration = boundedInteger(
      input.maxExpansionGeneration,
      DEFAULT_CONSTRAINTS.maxExpansionGeneration,
      0,
      5,
      "maxExpansionGeneration",
    );
    if (generation >= maxExpansionGeneration) {
      throw new RegistryConflictError(
        "DISCOVERY_EXPANSION_LIMIT_REACHED",
        `Source ${sourceId} is generation ${generation}; maximum expansion generation is ${maxExpansionGeneration}`,
        { sourceId, generation, maxExpansionGeneration },
      );
    }

    const parentBatchId = extensionString(source, "x-markorbit-discovery-batch-id");
    const rootSourceId =
      extensionString(source, "x-markorbit-discovery-root-source-id") ?? source.id;
    const result = await this.start({
      ...input,
      locator: sourceExpansionLocator(source),
      maxExpansionGeneration,
      lineage: {
        generation,
        parentSourceId: source.id,
        rootSourceId,
        ...(parentBatchId ? { parentBatchId } : {}),
      },
    });
    return { source, generation, maxExpansionGeneration, ...result };
  }

  reopen(
    candidateId: string,
    input: ReopenDiscoveryCandidateInput = {},
  ): ReviewDiscoveryCandidateResult {
    const current = this.dependencies.discovery.getCandidate(candidateId);
    if (!current) {
      return {
        candidate: this.dependencies.discovery.reopenCandidate(candidateId, input),
      };
    }
    if (current.candidate.status === "ACCEPTED") {
      throw new RegistryConflictError(
        "SOURCE_CANDIDATE_REOPEN_ACCEPTED",
        `Accepted candidate ${candidateId} already owns a Source lifecycle and cannot be restored to pending review`,
      );
    }

    const candidateOrigin = websiteOrigin(current.candidate.locator);
    const profile = this.dependencies.graph.getProfileByCanonicalOrigin(
      DEFAULT_WORKSPACE.id,
      candidateOrigin,
    );

    return this.dependencies.transaction(() => {
      const candidate = this.dependencies.discovery.reopenCandidate(candidateId, input);
      if (profile) {
        reopenCandidateGraphNode(this.dependencies.graph, profile, candidate.candidate);
      }
      return { candidate };
    });
  }

  review(
    candidateId: string,
    input: ReviewDiscoveryCandidateInput,
  ): ReviewDiscoveryCandidateResult {
    const current = this.dependencies.discovery.getCandidate(candidateId);
    if (!current) {
      return {
        candidate: this.dependencies.discovery.reviewCandidate(candidateId, {
          decision: input.decision,
          note: input.note,
          reviewer: input.reviewer,
        }),
      };
    }

    const batchRecord = this.dependencies.discovery.getBatch(current.batchId);
    if (!batchRecord || batchRecord.batch.seeds.length === 0) {
      throw new RegistryConflictError(
        "DISCOVERY_BATCH_CONTEXT_MISSING",
        `Discovery candidate ${candidateId} has no usable seed context`,
      );
    }
    const seed = batchRecord.batch.seeds[0];
    if (!seed) {
      throw new RegistryConflictError(
        "DISCOVERY_SEED_CONTEXT_MISSING",
        `Discovery candidate ${candidateId} has no usable seed`,
      );
    }

    const seedOrigin = websiteOrigin(seed.locator);
    const candidateOrigin = websiteOrigin(current.candidate.locator);
    const seedIdentity = websiteIdentity(seed.locator);
    const candidateIdentity = websiteIdentity(current.candidate.locator);
    const isExternalCandidate = candidateIdentity !== seedIdentity;
    const seedProfile = this.dependencies.graph.getProfileByCanonicalOrigin(
      DEFAULT_WORKSPACE.id,
      seedOrigin,
    );
    const targetOrigin = isExternalCandidate ? candidateOrigin : seedOrigin;
    const exactTargetProfile = this.dependencies.graph.getProfileByCanonicalOrigin(
      DEFAULT_WORKSPACE.id,
      targetOrigin,
    );
    const identitySource = findWebsiteSourceByIdentity(
      this.dependencies.sources,
      candidateIdentity,
    );
    const identityProfile = identitySource
      ? this.dependencies.graph.getProfileBySourceId(identitySource.id)
      : null;
    const targetProfile =
      exactTargetProfile ?? identityProfile ?? (!isExternalCandidate ? seedProfile : null);

    if (input.decision === "REJECTED") {
      return this.dependencies.transaction(() => {
        const candidate = this.dependencies.discovery.reviewCandidate(candidateId, {
          decision: "REJECTED",
          note: input.note,
          reviewer: input.reviewer,
        });
        if (targetProfile) {
          reviewCandidateGraphNode(
            this.dependencies.graph,
            targetProfile,
            candidate.candidate,
            "REJECTED",
          );
        }
        return { candidate };
      });
    }

    if (current.candidate.status === "ACCEPTED") {
      const source = current.review?.acceptedSourceId
        ? this.dependencies.sources.getById(current.review.acceptedSourceId)
        : null;
      const plan = current.review?.collectionPlanId
        ? this.dependencies.plans.getById(current.review.collectionPlanId)?.plan
        : undefined;
      return { candidate: current, ...(source ? { source } : {}), ...(plan ? { plan } : {}) };
    }

    return this.dependencies.transaction(() => {
      const targetLocator = isExternalCandidate ? current.candidate.locator : seed.locator;
      const targetObservedAt = isExternalCandidate
        ? current.candidate.discoveredAt
        : batchRecord.batch.createdAt;
      const seedSource = seedProfile
        ? this.dependencies.sources.getById(seedProfile.sourceId)
        : null;
      if (seedProfile && !seedSource) {
        throw new RegistryConflictError(
          "DISCOVERY_GRAPH_SOURCE_MISSING",
          `WebsiteSourceProfile ${seedProfile.id} points to missing source ${seedProfile.sourceId}`,
        );
      }
      const seedGeneration =
        batchRecord.batch.lineage?.generation ??
        (seedSource ? sourceDiscoveryGeneration(seedSource) : 0);
      const targetGeneration = isExternalCandidate ? seedGeneration + 1 : seedGeneration;
      const rootSourceId =
        batchRecord.batch.lineage?.rootSourceId ??
        (seedSource
          ? (extensionString(seedSource, "x-markorbit-discovery-root-source-id") ?? seedSource.id)
          : undefined);

      const intake = isExternalCandidate ? undefined : candidateIntakeDefaults(current.candidate);
      let source: SourceDefinition;
      let plan: CollectionPlan;
      let profile = targetProfile;
      if (!profile && identitySource) {
        profile = ensureWebsiteSourceProfile(
          this.dependencies.graph,
          identitySource,
          sourceExpansionLocator(identitySource),
          targetObservedAt,
          batchRecord.batch.batchId,
        );
      }

      if (profile) {
        const existingSource = this.dependencies.sources.getById(profile.sourceId);
        if (!existingSource) {
          throw new RegistryConflictError(
            "DISCOVERY_GRAPH_SOURCE_MISSING",
            `WebsiteSourceProfile ${profile.id} points to missing source ${profile.sourceId}`,
          );
        }
        const planRecord = existingSource.defaultCollectionPlanId
          ? this.dependencies.plans.getById(existingSource.defaultCollectionPlanId)
          : null;
        if (!planRecord) {
          throw new RegistryConflictError(
            "DISCOVERY_GRAPH_PLAN_MISSING",
            `Website source ${existingSource.id} has no default collection plan`,
          );
        }
        source = existingSource;
        plan = planRecord.plan;
      } else {
        const connector = ensureCrawl4AiProductionConnector(this.dependencies.connectors).manifest;
        const created = this.dependencies.sources.create({
          name: websiteSourceName(targetLocator),
          slug: websiteSourceSlug(
            targetLocator,
            isExternalCandidate ? current.candidate.candidateId : seed.seedId,
          ),
          sourceType: "WEB",
          category: intake?.category ?? "OTHER",
          authorityLevel: intake?.authorityLevel ?? "UNKNOWN",
          status: "ACTIVE",
          jurisdictions: intake?.jurisdictions?.length ? intake.jurisdictions : ["GLOBAL"],
          languages: intake?.languages?.length ? intake.languages : ["und"],
          connector: {
            connectorId: connector.connectorId,
            version: connector.version,
          },
          canonicalUri: targetOrigin,
          entrypoints: [
            {
              uri: targetLocator,
              label: isExternalCandidate ? "Discovered external source" : "Discovery seed",
            },
          ],
          tags: [
            "discovery-accepted",
            "website-source",
            ...(isExternalCandidate ? ["external-source"] : []),
            ...(intake?.tags ?? []),
          ],
          extensions: {
            "x-markorbit-discovery-seed-id": seed.seedId,
            "x-markorbit-discovery-batch-id": current.batchId,
            "x-markorbit-discovery-generation": targetGeneration,
            ...(rootSourceId ? { "x-markorbit-discovery-root-source-id": rootSourceId } : {}),
            ...(isExternalCandidate && seedSource
              ? { "x-markorbit-discovery-parent-source-id": seedSource.id }
              : {}),
            ...(isExternalCandidate
              ? {
                  "x-markorbit-discovery-origin": "EXTERNAL_LINK",
                  "x-markorbit-discovered-from-url":
                    current.candidate.discoveredFrom ?? seed.locator,
                }
              : {}),
            ...(intake?.note ? { "x-markorbit-intake-note": intake.note } : {}),
          },
        });

        const createdPlan = this.dependencies.plans.create({
          sourceId: created.id,
          name: `Collect ${created.name}`,
          status: "PAUSED",
          schedule: { mode: "MANUAL" },
          priority: "NORMAL",
          policy: {
            includePatterns: [],
            excludePatterns: [],
            maxDepth: 1,
            maxItems: 100,
            renderJavascript: false,
            fetchAttachments: false,
            respectRobots: true,
            rateLimitPerMinute: 30,
            timeoutSeconds: 30,
            retry: {
              maxAttempts: 3,
              backoffSeconds: 5,
            },
          },
          output: {
            artifactKinds: ["HTML", "MARKDOWN"],
          },
          extensions: {
            "x-markorbit-created-from-discovery": true,
            "x-markorbit-discovery-seed-id": seed.seedId,
            "x-markorbit-discovery-generation": targetGeneration,
            "x-markorbit-production-connector": `${CRAWL4AI_PRODUCTION_CONNECTOR.connectorId}@${CRAWL4AI_PRODUCTION_CONNECTOR.version}`,
            ...(isExternalCandidate ? { "x-markorbit-external-source": true } : {}),
          },
        });

        source = this.dependencies.plans.setSourceDefaultPlan(
          created.id,
          createdPlan.plan.id,
          created.updatedAt,
        );
        plan = createdPlan.plan;
        profile = ensureWebsiteSourceProfile(
          this.dependencies.graph,
          source,
          targetLocator,
          targetObservedAt,
          batchRecord.batch.batchId,
        );
      }

      const candidate = this.dependencies.discovery.reviewCandidate(candidateId, {
        decision: "ACCEPTED",
        note: input.note,
        reviewer: input.reviewer,
        acceptedSourceId: source.id,
        collectionPlanId: plan.id,
        ...(isExternalCandidate && seedSource ? { discoveredFromSourceId: seedSource.id } : {}),
      });

      let graphNode = reviewCandidateGraphNode(
        this.dependencies.graph,
        profile,
        candidate.candidate,
        "ACCEPTED",
      );
      if (!graphNode) {
        const batchCandidates = this.dependencies.discovery
          .listCandidates({ batchId: current.batchId, limit: 500 })
          .items.map((item) => item.candidate)
          .filter((item) => websiteIdentity(item.locator) === candidateIdentity);
        writeDiscoveryBatchToSourceGraph(
          this.dependencies.graph,
          source,
          profile,
          batchRecord.batch,
          batchCandidates,
        );
        graphNode = reviewCandidateGraphNode(
          this.dependencies.graph,
          profile,
          candidate.candidate,
          "ACCEPTED",
        );
      }
      if (!graphNode) {
        throw new RegistryConflictError(
          "DISCOVERY_GRAPH_NODE_MISSING",
          `Accepted candidate ${candidateId} could not be represented in Source Graph`,
        );
      }

      if (isExternalCandidate && seedProfile && seedSource) {
        writeExternalDiscoveryLinkToSourceGraph(
          this.dependencies.graph,
          seedSource,
          seedProfile,
          batchRecord.batch,
          candidate.candidate,
        );
      }

      return { candidate, source, plan };
    });
  }
}

let singleton: DiscoveryWorkflowService | undefined;

export function getDiscoveryWorkflowService(): DiscoveryWorkflowService {
  if (!singleton) {
    singleton = new DiscoveryWorkflowService({
      discovery: getSourceDiscoveryRepository(),
      graph: getSourceGraphRepository(),
      sources: getSourceRepository(),
      plans: getCollectionPlanRepository(),
      connectors: getConnectorRepository(),
      provider: new ExpandingWebsiteDiscoveryProvider(),
      transaction: withRegistryTransaction,
    });
  }
  return singleton;
}
