import { randomUUID } from "node:crypto";
import type { CollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import type {
  CandidateReviewDecision,
  SourceCandidateRecord,
  SourceDiscoveryRepository,
} from "@markorbit/persistence/source-discovery";
import type { SourceRepository } from "@markorbit/persistence";
import type {
  CollectionPlan,
  SourceDefinition,
  SourceDiscoveryConstraints,
} from "@markorbit/contracts";
import {
  HttpWebsiteDiscoveryProvider,
  type SourceDiscoveryProvider,
} from "@markorbit/worker-runtime";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  getCollectionPlanRepository,
  getSourceDiscoveryRepository,
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
  sources: SourceRepository;
  plans: CollectionPlanRepository;
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

function sourceSlug(locator: string, candidateId: string): string {
  const url = new URL(locator);
  const host = url.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const suffix = candidateId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-8)
    .toLowerCase();
  return `${host || "discovered-source"}-${suffix}`;
}

function sourceName(locator: string): string {
  const url = new URL(locator);
  const path = url.pathname === "/" ? "" : ` ${url.pathname}`;
  return `${url.hostname}${path}`.slice(0, 120);
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
      const candidates = await this.dependencies.provider.discover(batch);
      const completed = this.dependencies.discovery.completeBatch(batch.batchId, candidates);
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

    if (input.decision === "REJECTED") {
      return {
        candidate: this.dependencies.discovery.reviewCandidate(candidateId, {
          decision: "REJECTED",
          note: input.note,
          reviewer: input.reviewer,
        }),
      };
    }

    if (current.candidate.status === "ACCEPTED") {
      return { candidate: current };
    }

    return this.dependencies.transaction(() => {
      const source = this.dependencies.sources.create({
        name: sourceName(current.candidate.locator),
        slug: sourceSlug(current.candidate.locator, current.candidate.candidateId),
        sourceType: "WEB",
        category: "OTHER",
        authorityLevel: "UNKNOWN",
        status: "ACTIVE",
        jurisdictions: ["GLOBAL"],
        languages: ["und"],
        connector: {
          connectorId: "crawl4ai-web",
          version: "1.0.0",
        },
        canonicalUri: current.candidate.locator,
        entrypoints: [{ uri: current.candidate.locator, label: "Accepted discovery candidate" }],
        tags: ["discovery-accepted"],
        extensions: {
          "x-markorbit-discovery-candidate-id": current.candidate.candidateId,
          "x-markorbit-discovery-batch-id": current.batchId,
        },
      });

      const planRecord = this.dependencies.plans.create({
        sourceId: source.id,
        name: `Collect ${source.name}`,
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
          artifactKinds: ["HTML", "MARKDOWN", "JSON"],
        },
        extensions: {
          "x-markorbit-created-from-discovery": true,
          "x-markorbit-discovery-candidate-id": current.candidate.candidateId,
        },
      });

      const sourceWithPlan = this.dependencies.plans.setSourceDefaultPlan(
        source.id,
        planRecord.plan.id,
        source.updatedAt,
      );
      const candidate = this.dependencies.discovery.reviewCandidate(candidateId, {
        decision: "ACCEPTED",
        note: input.note,
        reviewer: input.reviewer,
        acceptedSourceId: source.id,
        collectionPlanId: planRecord.plan.id,
      });

      return { candidate, source: sourceWithPlan, plan: planRecord.plan };
    });
  }
}

let singleton: DiscoveryWorkflowService | undefined;

export function getDiscoveryWorkflowService(): DiscoveryWorkflowService {
  if (!singleton) {
    singleton = new DiscoveryWorkflowService({
      discovery: getSourceDiscoveryRepository(),
      sources: getSourceRepository(),
      plans: getCollectionPlanRepository(),
      provider: new HttpWebsiteDiscoveryProvider(),
      transaction: withRegistryTransaction,
    });
  }
  return singleton;
}
