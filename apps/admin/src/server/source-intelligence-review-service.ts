import type {
  SourceIntelligenceAssignmentHealthAndCapacityV2,
  SourceIntelligenceManualEscalationAction,
  SourceIntelligenceManualSlaAndEscalationV2,
  SourceIntelligenceManualSlaPolicyV2,
  SourceIntelligenceObservationOwnershipAction,
  SourceIntelligenceObservationOwnershipQueueV2,
  SourceIntelligenceObservationReviewQueueV2,
  SourceIntelligenceObservationReviewStatus,
  SourceIntelligencePolicyAuditHistoryV2,
  SourceIntelligencePolicyCohortV2,
  SourceIntelligencePolicyScopeAndCohortsV2,
  SourceIntelligenceReviewQueueOperationalHealthV2,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import {
  SqliteSourceIntelligenceManualSlaRepository,
  type SourceIntelligenceManualSlaRepository,
} from "@markorbit/persistence/source-intelligence-manual-sla";
import {
  SqliteSourceIntelligencePolicyScopeRepository,
  type SourceIntelligencePolicyScopeRepository,
} from "@markorbit/persistence/source-intelligence-policy-scope";
import {
  SqliteSourceIntelligenceObservationOwnershipRepository,
  type SourceIntelligenceObservationOwnershipRepository,
} from "@markorbit/persistence/source-intelligence-review-ownership";
import type { SourceIntelligenceObservationReviewRepository } from "@markorbit/persistence/source-intelligence-reviews";
import {
  buildSourceIntelligenceAssignmentHealthAndCapacityV2,
  buildSourceIntelligenceCrossSourceObservationSummaryV2,
  buildSourceIntelligenceManualSlaAndEscalationV2,
  buildSourceIntelligenceObservationOwnershipQueueV2,
  buildSourceIntelligenceObservationReviewQueueV2,
  buildSourceIntelligencePolicyAuditHistoryV2,
  buildSourceIntelligencePolicyScopeAndCohortsV2,
  buildSourceIntelligenceReviewQueueOperationalHealthV2,
  sourceIntelligenceObservationReviewKey,
} from "@markorbit/worker-runtime";
import { SourceIntelligenceService } from "./source-intelligence-service";
import {
  getRawArtifactRepository,
  getRegistryDatabase,
  getSourceGraphRepository,
  getSourceIntelligenceRepository,
  getSourceIntelligenceReviewRepository,
  getSourceRepository,
} from "./source-registry";

const MAX_SOURCE_IDS = 100;
const REVIEW_HISTORY_LIMIT = 2;
const DEFAULT_HEALTH_HISTORY_LIMIT = 50;
const MAX_HEALTH_HISTORY_LIMIT = 100;
const DEFAULT_REVIEW_EVENT_LIMIT = 200;
const MAX_REVIEW_EVENT_LIMIT = 500;
const DEFAULT_OWNERSHIP_EVENT_LIMIT = 100;
const MAX_OWNERSHIP_EVENT_LIMIT = 500;
const DEFAULT_ASSIGNMENT_HEALTH_EVENT_LIMIT = 500;
const DEFAULT_ESCALATION_EVENT_LIMIT = 200;
const MAX_ESCALATION_EVENT_LIMIT = 500;
const DEFAULT_POLICY_AUDIT_EVENT_LIMIT = 200;
const MAX_POLICY_AUDIT_EVENT_LIMIT = 500;

export type ReviewObservationInput = {
  sourceId: string;
  observationKey: string;
  status: SourceIntelligenceObservationReviewStatus;
  reviewer?: string;
  note?: string;
};

export type ReviewOwnershipInput = {
  sourceId: string;
  observationKey: string;
  action: SourceIntelligenceObservationOwnershipAction;
  actor: string;
  owner?: string;
  expectedOwner: string | null;
};

export type ReviewHealthOptions = {
  historyLimit?: number;
  reviewEventLimit?: number;
};

export type AssignmentHealthOptions = {
  ownershipEventLimit?: number;
};

export type ManualSlaPolicyInput = {
  actor: string;
  claimTargetHours: number | null;
  reviewTargetHours: number | null;
  expectedUpdatedAt: string | null;
};

export type ManualEscalationInput = {
  sourceId: string;
  observationKey: string;
  action: SourceIntelligenceManualEscalationAction;
  actor: string;
  note?: string;
  expectedEscalated: boolean;
};

export type PolicyCohortInput = {
  cohortId?: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  claimTargetHours: number | null;
  reviewTargetHours: number | null;
  actor: string;
  expectedUpdatedAt: string | null;
};

export type PolicyCohortMembershipInput = {
  cohortId: string;
  sourceId: string;
  action: "ADDED" | "REMOVED";
  actor: string;
  expectedPresent: boolean;
};

type ReviewServiceDependencies = {
  intelligence: SourceIntelligenceService;
  reviews: SourceIntelligenceObservationReviewRepository;
  ownership: SourceIntelligenceObservationOwnershipRepository;
  manualSla: SourceIntelligenceManualSlaRepository;
  policyScope: SourceIntelligencePolicyScopeRepository;
  now?: () => string;
};

function normalizeSourceIds(sourceIds: string[]): string[] {
  const normalized = [...new Set(sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))];
  if (normalized.length === 0) {
    throw new RegistryValidationError("At least one source id is required");
  }
  if (normalized.length > MAX_SOURCE_IDS) {
    throw new RegistryValidationError(
      `At most ${MAX_SOURCE_IDS} source ids may be reviewed at once`,
    );
  }
  return normalized;
}

function normalizeOptionalSourceIds(sourceIds: string[]): string[] {
  const normalized = [...new Set(sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))];
  if (normalized.length > MAX_SOURCE_IDS) {
    throw new RegistryValidationError(
      `At most ${MAX_SOURCE_IDS} source ids may be reviewed at once`,
    );
  }
  return normalized;
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

export class SourceIntelligenceReviewService {
  private readonly now: () => string;

  constructor(private readonly dependencies: ReviewServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  queue(sourceIds: string[]): SourceIntelligenceObservationReviewQueueV2 {
    const ids = normalizeSourceIds(sourceIds);
    const histories = ids.map((sourceId) =>
      this.dependencies.intelligence.historyV2(sourceId, REVIEW_HISTORY_LIMIT),
    );
    const summary = buildSourceIntelligenceCrossSourceObservationSummaryV2(histories);
    const observationKeys = summary.flags.map(sourceIntelligenceObservationReviewKey);
    const reviews = this.dependencies.reviews.listByObservationKeys(observationKeys);
    return buildSourceIntelligenceObservationReviewQueueV2(summary, reviews);
  }

  ownershipQueue(
    sourceIds: string[],
    ownershipEventLimit = DEFAULT_OWNERSHIP_EVENT_LIMIT,
  ): SourceIntelligenceObservationOwnershipQueueV2 {
    const ids = normalizeSourceIds(sourceIds);
    const eventLimit = boundedInteger(
      ownershipEventLimit,
      DEFAULT_OWNERSHIP_EVENT_LIMIT,
      1,
      MAX_OWNERSHIP_EVENT_LIMIT,
      "ownershipEventLimit",
    );
    const queue = this.queue(ids);
    const observationKeys = queue.items.map((item) => item.observationKey);
    const ownership = this.dependencies.ownership.listByObservationKeys(observationKeys);
    const ownershipEvents = this.dependencies.ownership.listEvents({
      sourceIds: ids,
      limit: eventLimit,
    });
    return buildSourceIntelligenceObservationOwnershipQueueV2({
      queue,
      ownership,
      ownershipEvents,
    });
  }

  assignmentHealth(
    sourceIds: string[],
    options: AssignmentHealthOptions = {},
  ): SourceIntelligenceAssignmentHealthAndCapacityV2 {
    const ids = normalizeSourceIds(sourceIds);
    const ownershipEventLimit = boundedInteger(
      options.ownershipEventLimit,
      DEFAULT_ASSIGNMENT_HEALTH_EVENT_LIMIT,
      1,
      MAX_OWNERSHIP_EVENT_LIMIT,
      "ownershipEventLimit",
    );
    const ownershipQueue = this.ownershipQueue(ids, DEFAULT_OWNERSHIP_EVENT_LIMIT);
    const ownershipEvents = this.dependencies.ownership.listEvents({
      sourceIds: ids,
      limit: ownershipEventLimit,
    });
    return buildSourceIntelligenceAssignmentHealthAndCapacityV2({
      ownershipQueue,
      ownershipEvents,
      generatedAt: this.now(),
    });
  }

  policyScopes(sourceIds: string[]): SourceIntelligencePolicyScopeAndCohortsV2 {
    const ids = normalizeSourceIds(sourceIds);
    return buildSourceIntelligencePolicyScopeAndCohortsV2({
      sourceIds: ids,
      globalPolicy: this.dependencies.manualSla.getPolicy(),
      cohorts: this.dependencies.policyScope.listCohorts(),
      memberships: this.dependencies.policyScope.listMemberships({ sourceIds: ids }),
      generatedAt: this.now(),
    });
  }

  policyAudit(
    sourceIds: string[] = [],
    eventLimit = DEFAULT_POLICY_AUDIT_EVENT_LIMIT,
  ): SourceIntelligencePolicyAuditHistoryV2 {
    const ids = normalizeOptionalSourceIds(sourceIds);
    const limit = boundedInteger(
      eventLimit,
      DEFAULT_POLICY_AUDIT_EVENT_LIMIT,
      1,
      MAX_POLICY_AUDIT_EVENT_LIMIT,
      "eventLimit",
    );
    return buildSourceIntelligencePolicyAuditHistoryV2({
      globalPolicyEvents: this.dependencies.manualSla.listPolicyAuditEvents({ limit }),
      cohortEvents: this.dependencies.policyScope.listCohortAuditEvents({ limit }),
      membershipEvents: this.dependencies.policyScope.listMembershipAuditEvents({
        ...(ids.length ? { sourceIds: ids } : {}),
        limit,
      }),
      generatedAt: this.now(),
      limit,
    });
  }

  updatePolicyCohort(input: PolicyCohortInput): SourceIntelligencePolicyCohortV2 {
    const actor = input.actor.trim();
    if (!actor) throw new RegistryValidationError("actor is required");
    return this.dependencies.policyScope.saveCohort({
      ...(input.cohortId ? { cohortId: input.cohortId } : {}),
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      priority: input.priority,
      enabled: input.enabled,
      claimTargetHours: input.claimTargetHours,
      reviewTargetHours: input.reviewTargetHours,
      actor,
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
  }

  changePolicyCohortMembership(input: PolicyCohortMembershipInput) {
    const actor = input.actor.trim();
    if (!actor) throw new RegistryValidationError("actor is required");
    return this.dependencies.policyScope.saveMembership({
      cohortId: input.cohortId,
      sourceId: input.sourceId,
      action: input.action,
      actor,
      expectedPresent: input.expectedPresent,
    });
  }

  manualSla(
    sourceIds: string[],
    escalationEventLimit = DEFAULT_ESCALATION_EVENT_LIMIT,
  ): SourceIntelligenceManualSlaAndEscalationV2 {
    const ids = normalizeSourceIds(sourceIds);
    const eventLimit = boundedInteger(
      escalationEventLimit,
      DEFAULT_ESCALATION_EVENT_LIMIT,
      1,
      MAX_ESCALATION_EVENT_LIMIT,
      "escalationEventLimit",
    );
    const ownershipQueue = this.ownershipQueue(ids, 1);
    const observationKeys = ownershipQueue.items.map((item) => item.observationKey);
    const escalations =
      this.dependencies.manualSla.listEscalationsByObservationKeys(observationKeys);
    const escalationEvents = this.dependencies.manualSla.listEscalationEvents({
      sourceIds: ids,
      limit: eventLimit,
    });
    const scopes = this.policyScopes(ids);
    return buildSourceIntelligenceManualSlaAndEscalationV2({
      ownershipQueue,
      policy: this.dependencies.manualSla.getPolicy(),
      effectivePolicies: scopes.effectivePolicies,
      escalations,
      escalationEvents,
      generatedAt: this.now(),
    });
  }

  updateManualSlaPolicy(input: ManualSlaPolicyInput): SourceIntelligenceManualSlaPolicyV2 {
    const actor = input.actor.trim();
    if (!actor) throw new RegistryValidationError("actor is required");
    return this.dependencies.manualSla.savePolicy({
      actor,
      claimTargetHours: input.claimTargetHours,
      reviewTargetHours: input.reviewTargetHours,
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
  }

  changeManualEscalation(input: ManualEscalationInput) {
    const sourceId = input.sourceId.trim();
    const observationKey = input.observationKey.trim();
    const actor = input.actor.trim();
    if (!sourceId) throw new RegistryValidationError("sourceId is required");
    if (!observationKey) throw new RegistryValidationError("observationKey is required");
    if (!actor) throw new RegistryValidationError("actor is required");

    const currentQueue = this.queue([sourceId]);
    const currentItem = currentQueue.items.find((item) => item.observationKey === observationKey);
    if (!currentItem) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_ESCALATION_STALE",
        "This observation occurrence is no longer current; reload before changing escalation state",
        { sourceId, observationKey },
      );
    }

    const escalation = this.dependencies.manualSla.saveEscalation({
      observationKey,
      sourceId,
      flagKind: currentItem.flag.kind,
      action: input.action,
      actor,
      ...(input.note !== undefined ? { note: input.note } : {}),
      expectedEscalated: input.expectedEscalated,
    });

    const refreshed = this.manualSla([sourceId]);
    const item = refreshed.items.find((candidate) => candidate.observationKey === observationKey);
    if (!item) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_ESCALATION_CHANGED_DURING_WRITE",
        "The observation occurrence changed while manual escalation was being saved",
        { sourceId, observationKey },
      );
    }
    return { escalation, item };
  }

  health(
    sourceIds: string[],
    options: ReviewHealthOptions = {},
  ): SourceIntelligenceReviewQueueOperationalHealthV2 {
    const ids = normalizeSourceIds(sourceIds);
    const historyLimit = boundedInteger(
      options.historyLimit,
      DEFAULT_HEALTH_HISTORY_LIMIT,
      2,
      MAX_HEALTH_HISTORY_LIMIT,
      "historyLimit",
    );
    const reviewEventLimit = boundedInteger(
      options.reviewEventLimit,
      DEFAULT_REVIEW_EVENT_LIMIT,
      1,
      MAX_REVIEW_EVENT_LIMIT,
      "reviewEventLimit",
    );
    const queue = this.queue(ids);
    const histories = ids.map((sourceId) =>
      this.dependencies.intelligence.historyV2(sourceId, historyLimit),
    );
    const reviewEvents = this.dependencies.reviews.listEvents({
      sourceIds: ids,
      limit: reviewEventLimit,
    });
    return buildSourceIntelligenceReviewQueueOperationalHealthV2({
      queue,
      histories,
      reviewEvents,
      generatedAt: this.now(),
    });
  }

  review(input: ReviewObservationInput) {
    const sourceId = input.sourceId.trim();
    const observationKey = input.observationKey.trim();
    if (!sourceId) throw new RegistryValidationError("sourceId is required");
    if (!observationKey) throw new RegistryValidationError("observationKey is required");

    const currentQueue = this.queue([sourceId]);
    const currentItem = currentQueue.items.find((item) => item.observationKey === observationKey);
    if (!currentItem) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_REVIEW_STALE",
        "This observation occurrence is no longer current; reload the review queue before deciding",
        { sourceId, observationKey },
      );
    }

    const review = this.dependencies.reviews.save({
      observationKey,
      sourceId,
      flagKind: currentItem.flag.kind,
      currentAssessmentId: currentItem.flag.current.assessmentId,
      ...(currentItem.flag.previous?.assessmentId
        ? { previousAssessmentId: currentItem.flag.previous.assessmentId }
        : {}),
      status: input.status,
      reviewer: input.reviewer?.trim() || "admin-console",
      ...(input.note !== undefined ? { note: input.note } : {}),
    });

    const refreshed = this.queue([sourceId]);
    const item = refreshed.items.find((candidate) => candidate.observationKey === observationKey);
    if (!item) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_REVIEW_CHANGED_DURING_WRITE",
        "The observation occurrence changed while the operator decision was being saved",
        { sourceId, observationKey },
      );
    }
    return { review, item };
  }

  changeOwnership(input: ReviewOwnershipInput) {
    const sourceId = input.sourceId.trim();
    const observationKey = input.observationKey.trim();
    const actor = input.actor.trim();
    if (!sourceId) throw new RegistryValidationError("sourceId is required");
    if (!observationKey) throw new RegistryValidationError("observationKey is required");
    if (!actor) throw new RegistryValidationError("actor is required");

    const currentQueue = this.queue([sourceId]);
    const currentItem = currentQueue.items.find((item) => item.observationKey === observationKey);
    if (!currentItem) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_OWNERSHIP_STALE",
        "This observation occurrence is no longer current; reload before changing ownership",
        { sourceId, observationKey },
      );
    }

    const ownership = this.dependencies.ownership.save({
      observationKey,
      sourceId,
      flagKind: currentItem.flag.kind,
      action: input.action,
      actor,
      ...(input.owner !== undefined ? { owner: input.owner } : {}),
      expectedOwner: input.expectedOwner,
    });

    const refreshed = this.ownershipQueue([sourceId]);
    const item = refreshed.items.find((candidate) => candidate.observationKey === observationKey);
    if (!item) {
      throw new RegistryConflictError(
        "SOURCE_INTELLIGENCE_OWNERSHIP_CHANGED_DURING_WRITE",
        "The observation occurrence changed while ownership was being saved",
        { sourceId, observationKey },
      );
    }
    return { ownership, item };
  }
}

let singleton: SourceIntelligenceReviewService | undefined;

export function getSourceIntelligenceReviewService(): SourceIntelligenceReviewService {
  if (!singleton) {
    const database = getRegistryDatabase();
    singleton = new SourceIntelligenceReviewService({
      intelligence: new SourceIntelligenceService({
        sources: getSourceRepository(),
        graph: getSourceGraphRepository(),
        artifacts: getRawArtifactRepository(),
        intelligence: getSourceIntelligenceRepository(),
      }),
      reviews: getSourceIntelligenceReviewRepository(),
      ownership: new SqliteSourceIntelligenceObservationOwnershipRepository(database),
      manualSla: new SqliteSourceIntelligenceManualSlaRepository(database),
      policyScope: new SqliteSourceIntelligencePolicyScopeRepository(database),
    });
  }
  return singleton;
}
