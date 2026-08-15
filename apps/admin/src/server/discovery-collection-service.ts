import type { ExecutionActor } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryNotFoundError,
  type SourceRepository,
} from "@markorbit/persistence";
import type { CollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import type { ExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import {
  SourceCandidateNotFoundError,
  type SourceDiscoveryRepository,
} from "@markorbit/persistence/source-discovery";
import {
  getCollectionPlanRepository,
  getExecutionLedgerRepository,
  getSourceDiscoveryRepository,
  getSourceRepository,
} from "./source-registry";

export type AuthorizeDiscoveryCollectionInput = {
  requestedBy?: string;
};

type DiscoveryCollectionDependencies = {
  discovery: SourceDiscoveryRepository;
  sources: SourceRepository;
  plans: CollectionPlanRepository;
  runs: ExecutionLedgerRepository;
};

export class DiscoveryCollectionService {
  constructor(private readonly dependencies: DiscoveryCollectionDependencies) {}

  authorizeAndDispatch(candidateId: string, input: AuthorizeDiscoveryCollectionInput = {}) {
    const candidate = this.dependencies.discovery.getCandidate(candidateId);
    if (!candidate) throw new SourceCandidateNotFoundError(candidateId);
    if (candidate.candidate.status !== "ACCEPTED" || candidate.review?.decision !== "ACCEPTED") {
      throw new RegistryConflictError(
        "DISCOVERY_CANDIDATE_NOT_ACCEPTED",
        "Collection execution can only be authorized for an accepted discovery candidate",
        { candidateId },
      );
    }

    const sourceId = candidate.review.acceptedSourceId;
    const planId = candidate.review.collectionPlanId;
    if (!sourceId || !planId) {
      throw new RegistryConflictError(
        "DISCOVERY_ACCEPTANCE_LINKS_MISSING",
        "Accepted discovery candidate is missing its Source or Collection Plan linkage",
        { candidateId },
      );
    }

    const source = this.dependencies.sources.getById(sourceId);
    if (!source) throw new RegistryNotFoundError(sourceId);
    if (source.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "DISCOVERY_SOURCE_NOT_ACTIVE",
        "Accepted discovery Source must be ACTIVE before collection can be authorized",
        { candidateId, sourceId },
      );
    }

    let planRecord = this.dependencies.plans.getById(planId);
    if (!planRecord) {
      throw new RegistryConflictError(
        "DISCOVERY_COLLECTION_PLAN_MISSING",
        "Accepted discovery Collection Plan no longer exists",
        { candidateId, planId },
      );
    }
    if (planRecord.plan.sourceId !== sourceId) {
      throw new RegistryConflictError(
        "DISCOVERY_COLLECTION_LINK_MISMATCH",
        "Accepted discovery Source and Collection Plan no longer point to the same collection boundary",
        { candidateId, sourceId, planId },
      );
    }
    if (source.defaultCollectionPlanId !== planId) {
      throw new RegistryConflictError(
        "DISCOVERY_DEFAULT_PLAN_MISMATCH",
        "Accepted discovery Collection Plan is no longer the Source default plan",
        { candidateId, sourceId, planId },
      );
    }
    if (planRecord.plan.status === "ARCHIVED") {
      throw new RegistryConflictError(
        "DISCOVERY_COLLECTION_PLAN_ARCHIVED",
        "Archived Collection Plans cannot be authorized for execution",
        { candidateId, planId },
      );
    }

    // Candidate acceptance is intentionally not execution authority. This is the
    // explicit protected transition from reviewed acquisition intent to ACTIVE plan.
    if (planRecord.plan.status === "PAUSED") {
      planRecord = this.dependencies.plans.updateStatus(
        planId,
        "ACTIVE",
        planRecord.plan.updatedAt,
      );
    }

    // Multiple accepted pages can resolve to the same Source/default plan. Treat the
    // first collection as a Source/plan boundary, not a candidate boundary, so batch
    // approval cannot fan out duplicate crawls of the same website. Existing history
    // also means this Source has already crossed its initial collection boundary.
    const existing = this.dependencies.runs.list({
      sourceId,
      planId,
      limit: 1,
      offset: 0,
    }).items[0];
    if (existing) {
      return {
        candidate,
        source,
        plan: planRecord.plan,
        run: existing.run,
        jobs: existing.jobs,
        replayed: true,
      };
    }

    const actor: ExecutionActor = {
      actorType: "LOCAL_ADMIN",
      actorId: input.requestedBy?.trim() || "admin-console",
    };
    const dispatch = this.dependencies.runs.dispatchManual({
      planId,
      requestedBy: actor,
      idempotencyKey: `discovery-initial-${planId}`.slice(0, 128),
    });

    return {
      candidate,
      source,
      plan: planRecord.plan,
      run: dispatch.record.run,
      jobs: dispatch.record.jobs,
      replayed: dispatch.replayed,
    };
  }
}

let singleton: DiscoveryCollectionService | undefined;

export function getDiscoveryCollectionService(): DiscoveryCollectionService {
  if (!singleton) {
    singleton = new DiscoveryCollectionService({
      discovery: getSourceDiscoveryRepository(),
      sources: getSourceRepository(),
      plans: getCollectionPlanRepository(),
      runs: getExecutionLedgerRepository(),
    });
  }
  return singleton;
}
