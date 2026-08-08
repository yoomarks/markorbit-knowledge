import type {
  SourceIntelligenceObservationReviewQueueV2,
  SourceIntelligenceObservationReviewStatus,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import type { SourceIntelligenceObservationReviewRepository } from "@markorbit/persistence/source-intelligence-reviews";
import {
  buildSourceIntelligenceCrossSourceObservationSummaryV2,
  buildSourceIntelligenceObservationReviewQueueV2,
  sourceIntelligenceObservationReviewKey,
} from "@markorbit/worker-runtime";
import { SourceIntelligenceService } from "./source-intelligence-service";
import {
  getRawArtifactRepository,
  getSourceGraphRepository,
  getSourceIntelligenceRepository,
  getSourceIntelligenceReviewRepository,
  getSourceRepository,
} from "./source-registry";

const MAX_SOURCE_IDS = 100;
const REVIEW_HISTORY_LIMIT = 2;

export type ReviewObservationInput = {
  sourceId: string;
  observationKey: string;
  status: SourceIntelligenceObservationReviewStatus;
  reviewer?: string;
  note?: string;
};

type ReviewServiceDependencies = {
  intelligence: SourceIntelligenceService;
  reviews: SourceIntelligenceObservationReviewRepository;
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

export class SourceIntelligenceReviewService {
  constructor(private readonly dependencies: ReviewServiceDependencies) {}

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
}

let singleton: SourceIntelligenceReviewService | undefined;

export function getSourceIntelligenceReviewService(): SourceIntelligenceReviewService {
  if (!singleton) {
    singleton = new SourceIntelligenceReviewService({
      intelligence: new SourceIntelligenceService({
        sources: getSourceRepository(),
        graph: getSourceGraphRepository(),
        artifacts: getRawArtifactRepository(),
        intelligence: getSourceIntelligenceRepository(),
      }),
      reviews: getSourceIntelligenceReviewRepository(),
    });
  }
  return singleton;
}
