import type { DatabaseSync } from "node:sqlite";
import {
  CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION,
  CASE_DOSSIER_PRIVACY_REVIEW_OBJECT_TYPE,
  type CaseDossierAudienceExpansionApprovalV1,
  type CaseDossierPrivacyFindingV1,
  type CaseDossierPrivacyReviewV1,
  type CaseDossierRedactedDerivativeV1,
  type CaseDossierV1,
  type CaseCandidateAccessClassification,
} from "@markorbit/contracts";
import { SqliteCaseDossierRepository } from "@markorbit/persistence/case-dossiers";
import {
  SqliteCaseDossierPrivacyRepository,
  type CaseDossierPrivacyReviewEvent,
} from "@markorbit/persistence/case-dossier-privacy";
import { redactCaseDossierV1 } from "@markorbit/worker-runtime/case-dossier-redactor";
import { getRegistryDatabase } from "./source-registry";

export class CaseDossierPrivacyServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CaseDossierPrivacyServiceError";
  }
}

export type OpenCaseDossierPrivacyReviewInput = {
  dossierId: string;
  dossierVersion: number;
  reviewId: string;
  audienceAccessClassification: CaseCandidateAccessClassification;
  reviewerRef: string;
  openedAt?: string;
  audienceExpansionApproval?: CaseDossierAudienceExpansionApprovalV1;
};

export type FinalizedCaseDossierPrivacyResult = {
  review: CaseDossierPrivacyReviewV1;
  derivative: CaseDossierRedactedDerivativeV1;
  finalizedDossier: CaseDossierV1;
};

function normalizedFindings(
  findings: readonly CaseDossierPrivacyFindingV1[],
): CaseDossierPrivacyFindingV1[] {
  return [...findings].sort((left, right) => left.findingId.localeCompare(right.findingId));
}

export class CaseDossierPrivacyService {
  private readonly dossiers: SqliteCaseDossierRepository;
  private readonly privacy: SqliteCaseDossierPrivacyRepository;

  constructor(
    database: DatabaseSync = getRegistryDatabase(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.dossiers = new SqliteCaseDossierRepository(database);
    this.privacy = new SqliteCaseDossierPrivacyRepository(database);
  }

  openReview(input: OpenCaseDossierPrivacyReviewInput): CaseDossierPrivacyReviewV1 {
    const dossier = this.dossiers.getDossier(input.dossierId, input.dossierVersion);
    if (!dossier) {
      throw new CaseDossierPrivacyServiceError(
        "CASE_DOSSIER_NOT_FOUND",
        `Case Dossier ${input.dossierId} version ${input.dossierVersion} does not exist`,
      );
    }
    if (dossier.state !== "ASSEMBLED" && dossier.state !== "REVIEW_REQUIRED") {
      throw new CaseDossierPrivacyServiceError(
        "CASE_DOSSIER_PRIVACY_REVIEW_SOURCE_STATE_INVALID",
        `Case Dossier ${input.dossierId} version ${input.dossierVersion} is not reviewable`,
      );
    }
    const existing = this.privacy.getReview(input.reviewId)?.review;
    const openedAt = input.openedAt ?? existing?.openedAt ?? this.now().toISOString();
    const review: CaseDossierPrivacyReviewV1 = {
      protocolVersion: CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION,
      objectType: CASE_DOSSIER_PRIVACY_REVIEW_OBJECT_TYPE,
      reviewId: input.reviewId,
      dossierId: dossier.dossierId,
      dossierVersion: dossier.version,
      state: "REVIEW_REQUIRED",
      sourceAccessClassification: dossier.accessClassification,
      audienceAccessClassification: input.audienceAccessClassification,
      reviewerRef: input.reviewerRef,
      openedAt,
      findings: [],
      ...(input.audienceExpansionApproval
        ? { audienceExpansionApproval: input.audienceExpansionApproval }
        : {}),
      publicationAuthorized: false,
    };
    return this.privacy.openReview(review).review;
  }

  markNeedsRedaction(
    reviewId: string,
    findings: CaseDossierPrivacyFindingV1[],
    decidedAt?: string,
  ): CaseDossierPrivacyReviewV1 {
    const current = this.requireReview(reviewId);
    const resolvedDecidedAt =
      decidedAt ??
      (current.review.state === "NEEDS_REDACTION" ? current.review.decidedAt : undefined) ??
      this.now().toISOString();
    const decision: CaseDossierPrivacyReviewV1 = {
      ...current.review,
      state: "NEEDS_REDACTION",
      decidedAt: resolvedDecidedAt,
      findings: normalizedFindings(findings),
      derivativeId: undefined,
    };
    return this.privacy.recordDecision(decision).review;
  }

  rejectReview(
    reviewId: string,
    findings: CaseDossierPrivacyFindingV1[] = [],
    decidedAt?: string,
  ): CaseDossierPrivacyReviewV1 {
    const current = this.requireReview(reviewId);
    const resolvedDecidedAt =
      decidedAt ??
      (current.review.state === "REJECTED" ? current.review.decidedAt : undefined) ??
      this.now().toISOString();
    const decision: CaseDossierPrivacyReviewV1 = {
      ...current.review,
      state: "REJECTED",
      decidedAt: resolvedDecidedAt,
      findings: normalizedFindings(findings),
      derivativeId: undefined,
    };
    return this.privacy.recordDecision(decision).review;
  }

  finalizeReview(
    reviewId: string,
    input: {
      derivativeId: string;
      findings: CaseDossierPrivacyFindingV1[];
      decidedAt?: string;
    },
  ): FinalizedCaseDossierPrivacyResult {
    const current = this.requireReview(reviewId);
    const decidedAt =
      input.decidedAt ??
      (current.review.state === "FINALIZED" ? current.review.decidedAt : undefined) ??
      this.now().toISOString();
    const finalizedReview: CaseDossierPrivacyReviewV1 = {
      ...current.review,
      state: "FINALIZED",
      decidedAt,
      findings: normalizedFindings(input.findings),
      derivativeId: input.derivativeId,
    };
    const savedReview = this.privacy.recordDecision(finalizedReview).review;
    const sourceDossier = this.dossiers.getDossier(
      savedReview.dossierId,
      savedReview.dossierVersion,
    );
    if (!sourceDossier) {
      throw new CaseDossierPrivacyServiceError(
        "CASE_DOSSIER_PRIVACY_SOURCE_MISSING",
        "The source Case Dossier disappeared after privacy review",
      );
    }

    const derivative = this.privacy.saveDerivative(
      redactCaseDossierV1(sourceDossier, savedReview),
    ).derivative;
    const finalizedDossier = this.finalizeInternalDossier(sourceDossier, savedReview.decidedAt!);
    return { review: savedReview, derivative, finalizedDossier };
  }

  getReview(reviewId: string): CaseDossierPrivacyReviewV1 | null {
    return this.privacy.getReview(reviewId)?.review ?? null;
  }

  getReviewEvents(reviewId: string): CaseDossierPrivacyReviewEvent[] {
    return this.privacy.listReviewEvents(reviewId);
  }

  getDerivative(derivativeId: string): CaseDossierRedactedDerivativeV1 | null {
    return this.privacy.getDerivative(derivativeId);
  }

  private requireReview(reviewId: string): {
    review: CaseDossierPrivacyReviewV1;
    revision: number;
  } {
    const current = this.privacy.getReview(reviewId);
    if (!current) {
      throw new CaseDossierPrivacyServiceError(
        "CASE_DOSSIER_PRIVACY_REVIEW_NOT_FOUND",
        `Case Dossier privacy review ${reviewId} does not exist`,
      );
    }
    return current;
  }

  private finalizeInternalDossier(source: CaseDossierV1, finalizedAt: string): CaseDossierV1 {
    const expectedVersion = source.version + 1;
    const latest = this.dossiers.getDossier(source.dossierId);
    if (latest && latest.version > source.version) {
      if (
        latest.version === expectedVersion &&
        latest.state === "FINALIZED" &&
        latest.supersedesDossierVersion === source.version &&
        latest.candidateId === source.candidateId &&
        latest.evidenceCollectionId === source.evidenceCollectionId &&
        latest.completeness.privacyReview === "PRESENT"
      ) {
        return latest;
      }
      throw new CaseDossierPrivacyServiceError(
        "CASE_DOSSIER_PRIVACY_SOURCE_SUPERSEDED",
        "A different later Case Dossier version already supersedes the reviewed source version",
      );
    }

    const finalized: CaseDossierV1 = {
      ...source,
      version: expectedVersion,
      state: "FINALIZED",
      completeness: { ...source.completeness, privacyReview: "PRESENT" },
      updatedAt: finalizedAt,
      supersedesDossierVersion: source.version,
    };
    return this.dossiers.saveDossier(finalized).dossier;
  }
}

export function createCaseDossierPrivacyService(): CaseDossierPrivacyService {
  return new CaseDossierPrivacyService();
}
