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
} from "@markorbit/contracts";
import {
  enrichDiscoveryCandidate,
  HttpWebsiteDiscoveryProvider,
  type SourceDiscoveryProvider,
} from "@markorbit/worker-runtime";
import {
  DEFAULT_WORKSPACE,
  RegistryConflictError,
  RegistryValidationError,
} from "@markorbit/persistence";
import {
  ensureWebsiteSourceProfile,
  reviewCandidateGraphNode,
  websiteOrigin,
  writeDiscoveryBatchToSourceGraph,
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
  >
> = {
  maxDepth: 1,
  maxCandidates: 100,
  maxFetches: 50,
  sameHostOnly: true,
  respectRobots: true,
  discoverSitemaps: true,
};

export type StartDiscoveryInput = {
  locator: string;
  maxDepth?: number;
  maxCandidates?: number;
  maxFetches?: number;
  deniedUrlPatterns?: string[];
};

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

function websiteSourceSlug(locator: string, seedId: string): string {
  const url = new URL(locator);
  const host = url.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const suffix = seedId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-8)
    .toLowerCase();
  return `${host || "discovered-website"}-${suffix}`;
}

function websiteSourceName(locator: string): string {
  return new URL(locator).hostname.slice(0, 120);
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
    const seed = this.dependencies.discovery.createSeed({
      locator,
      metadata: { source: "admin-console" },
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
        deniedUrlPatterns: normalizedDeniedPatterns(input.deniedUrlPatterns),
      },
    };

    this.dependencies.discovery.createBatch(batch);
    try {
      const discovered = await this.dependencies.provider.discover(batch);
      const candidates = discovered.map(enrichDiscoveryCandidate);
      const completed = this.dependencies.discovery.completeBatch(batch.batchId, candidates);

      const profile = this.dependencies.graph.getProfileByCanonicalOrigin(
        DEFAULT_WORKSPACE.id,
        websiteOrigin(seed.locator),
      );
      if (profile) {
        const source = this.dependencies.sources.getById(profile.sourceId);
        if (source) {
          this.dependencies.transaction(() => {
            writeDiscoveryBatchToSourceGraph(
              this.dependencies.graph,
              source,
              profile,
              completed.batch,
              candidates,
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
    const origin = websiteOrigin(seed.locator);
    const existingProfile = this.dependencies.graph.getProfileByCanonicalOrigin(
      DEFAULT_WORKSPACE.id,
      origin,
    );

    if (input.decision === "REJECTED") {
      return this.dependencies.transaction(() => {
        const candidate = this.dependencies.discovery.reviewCandidate(candidateId, {
          decision: "REJECTED",
          note: input.note,
          reviewer: input.reviewer,
        });
        if (existingProfile) {
          reviewCandidateGraphNode(
            this.dependencies.graph,
            existingProfile,
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
      let source: SourceDefinition;
      let plan: CollectionPlan;
      let profile = existingProfile;

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
          name: websiteSourceName(seed.locator),
          slug: websiteSourceSlug(seed.locator, seed.seedId),
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
          canonicalUri: origin,
          entrypoints: [{ uri: seed.locator, label: "Discovery seed" }],
          tags: ["discovery-accepted", "website-source"],
          extensions: {
            "x-markorbit-discovery-seed-id": seed.seedId,
            "x-markorbit-discovery-batch-id": current.batchId,
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
            "x-markorbit-production-connector": `${CRAWL4AI_PRODUCTION_CONNECTOR.connectorId}@${CRAWL4AI_PRODUCTION_CONNECTOR.version}`,
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
          seed.locator,
          batchRecord.batch.createdAt,
          batchRecord.batch.batchId,
        );
      }

      const candidate = this.dependencies.discovery.reviewCandidate(candidateId, {
        decision: "ACCEPTED",
        note: input.note,
        reviewer: input.reviewer,
        acceptedSourceId: source.id,
        collectionPlanId: plan.id,
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
          .items.map((item) => item.candidate);
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
      provider: new HttpWebsiteDiscoveryProvider(),
      transaction: withRegistryTransaction,
    });
  }
  return singleton;
}
