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
  CollectionPlan,
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
};

export type ExpandSourceDiscoveryInput = Omit<StartDiscoveryInput, "locator" | "lineage">;

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

function belongsToOrigin(locator: string, origin: string): boolean {
  return websiteOrigin(locator) === origin;
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
      const candidates = discovered.map(enrichDiscoveryCandidate);
      const completed = this.dependencies.discovery.completeBatch(batch.batchId, candidates);
      const seedOrigin = websiteOrigin(seed.locator);

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
    const isExternalCandidate = candidateOrigin !== seedOrigin;
    const seedProfile = this.dependencies.graph.getProfileByCanonicalOrigin(
      DEFAULT_WORKSPACE.id,
      seedOrigin,
    );
    const targetProfile = this.dependencies.graph.getProfileByCanonicalOrigin(
      DEFAULT_WORKSPACE.id,
      candidateOrigin,
    );

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

      let source: SourceDefinition;
      let plan: CollectionPlan;
      let profile = targetProfile;

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
          category: "OTHER",
          authorityLevel: "UNKNOWN",
          status: "ACTIVE",
          jurisdictions: ["GLOBAL"],
          languages: ["und"],
          connector: {
            connectorId: connector.connectorId,
            version: connector.version,
          },
          canonicalUri: candidateOrigin,
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
          .filter((item) => belongsToOrigin(item.locator, candidateOrigin));
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
