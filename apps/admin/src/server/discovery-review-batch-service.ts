import { RegistryError } from "@markorbit/persistence";
import type { DiscoveryCollectionService } from "./discovery-collection-service";
import type { DiscoveryWorkflowService } from "./discovery-service";

export type DiscoveryBatchReviewDecision = "ACCEPTED" | "REJECTED";

export type DiscoveryBatchReviewInput = {
  candidateIds: string[];
  decision: DiscoveryBatchReviewDecision;
  reviewer: string;
  note?: string;
  startCollection: boolean;
};

export type DiscoveryBatchReviewItem =
  | {
      candidateId: string;
      status: "ACCEPTED" | "REJECTED";
      sourceId?: string;
      planId?: string;
      runId?: string;
      replayed?: boolean;
      collectionDeferred?: boolean;
    }
  | {
      candidateId: string;
      status: "FAILED";
      error: { code: string; message: string };
    };

export type DiscoveryBatchReviewResult = {
  items: DiscoveryBatchReviewItem[];
  summary: {
    requested: number;
    succeeded: number;
    failed: number;
    collectionStarted: number;
    collectionDeferred: number;
  };
};

type Dependencies = {
  workflow: Pick<DiscoveryWorkflowService, "review">;
  collection: Pick<DiscoveryCollectionService, "authorizeAndDispatch">;
};

function failure(error: unknown) {
  return {
    code: error instanceof RegistryError ? error.code : "SOURCE_REVIEW_FAILED",
    message: error instanceof Error ? error.message : "Source review failed",
  };
}

function candidateMetadata(candidate: unknown): Record<string, unknown> | undefined {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  const candidateRecord = candidate as { candidate?: { metadata?: Record<string, unknown> } };
  return candidateRecord.candidate?.metadata;
}

function isRadarOnboardingCandidate(candidate: unknown): boolean {
  const radarIntake = candidateMetadata(candidate)?.radarIntake;
  if (!radarIntake || typeof radarIntake !== "object" || Array.isArray(radarIntake)) return false;
  return (radarIntake as Record<string, unknown>).origin === "RADAR_CODEX_ONBOARDING";
}

function isProductionValidationCandidate(candidate: unknown): boolean {
  const productionValidation = candidateMetadata(candidate)?.productionValidation;
  if (
    !productionValidation ||
    typeof productionValidation !== "object" ||
    Array.isArray(productionValidation)
  ) {
    return false;
  }
  const boundary = productionValidation as Record<string, unknown>;
  return (
    boundary.collectionAuthorizationRequired === true &&
    boundary.noAutomaticProductionScheduling === true
  );
}

function requiresExplicitCollectionAuthorization(candidate: unknown): boolean {
  return isRadarOnboardingCandidate(candidate) || isProductionValidationCandidate(candidate);
}

export function reviewDiscoveryCandidatesBatch(
  input: DiscoveryBatchReviewInput,
  dependencies: Dependencies,
): DiscoveryBatchReviewResult {
  const items = new Map<string, DiscoveryBatchReviewItem>();
  const collectionGroups = new Map<
    string,
    { representativeCandidateId: string; candidateIds: string[] }
  >();
  let collectionDeferred = 0;

  // Phase 1: complete the entire review batch first. This lets every accepted page
  // converge into its Source/default plan before any immutable execution snapshot is taken.
  for (const candidateId of input.candidateIds) {
    try {
      const reviewed = dependencies.workflow.review(candidateId, {
        decision: input.decision,
        reviewer: input.reviewer,
        note: input.note,
      });
      if (input.decision === "REJECTED") {
        items.set(candidateId, { candidateId, status: "REJECTED" });
        continue;
      }
      if (!reviewed.source || !reviewed.plan) {
        throw new RegistryError(
          "SOURCE_REVIEW_ACCEPTANCE_INCOMPLETE",
          "Accepted candidate did not resolve to its Source and default Collection Plan",
        );
      }

      const collectionAuthorizationDeferred = requiresExplicitCollectionAuthorization(
        reviewed.candidate,
      );
      items.set(candidateId, {
        candidateId,
        status: "ACCEPTED",
        sourceId: reviewed.source.id,
        planId: reviewed.plan.id,
        ...(collectionAuthorizationDeferred && input.startCollection
          ? { collectionDeferred: true }
          : {}),
      });
      if (input.startCollection && collectionAuthorizationDeferred) {
        collectionDeferred += 1;
        continue;
      }
      if (input.startCollection) {
        const groupKey = `${reviewed.source.id}\u0000${reviewed.plan.id}`;
        const group = collectionGroups.get(groupKey);
        if (group) {
          group.candidateIds.push(candidateId);
        } else {
          collectionGroups.set(groupKey, {
            representativeCandidateId: candidateId,
            candidateIds: [candidateId],
          });
        }
      }
    } catch (error) {
      items.set(candidateId, { candidateId, status: "FAILED", error: failure(error) });
    }
  }

  // Phase 2: authorize once per unique Source/default-plan boundary, after every
  // successful acceptance above has updated the Source acquisition configuration.
  // Governance-bound candidates are deliberately excluded: approving a Source proposal
  // is not collection authorization. They require an explicit later supply action.
  const newlyStartedRuns = new Set<string>();
  for (const group of collectionGroups.values()) {
    try {
      const dispatched = dependencies.collection.authorizeAndDispatch(
        group.representativeCandidateId,
        { requestedBy: input.reviewer },
      );
      if (!dispatched.replayed) newlyStartedRuns.add(dispatched.run.id);
      for (const candidateId of group.candidateIds) {
        const current = items.get(candidateId);
        if (!current || current.status !== "ACCEPTED") continue;
        items.set(candidateId, {
          ...current,
          runId: dispatched.run.id,
          replayed: dispatched.replayed,
        });
      }
    } catch (error) {
      for (const candidateId of group.candidateIds) {
        items.set(candidateId, { candidateId, status: "FAILED", error: failure(error) });
      }
    }
  }

  const ordered = input.candidateIds.map((candidateId) => items.get(candidateId)!);
  const failed = ordered.filter((item) => item.status === "FAILED").length;
  return {
    items: ordered,
    summary: {
      requested: input.candidateIds.length,
      succeeded: input.candidateIds.length - failed,
      failed,
      collectionStarted: newlyStartedRuns.size,
      collectionDeferred,
    },
  };
}
