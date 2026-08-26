import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  CASE_LIVE_ACCEPTANCE_OBJECT_TYPE,
  CASE_LIVE_ACCEPTANCE_PROTOCOL_VERSION,
  isCaseCandidateV1,
  type CaseCandidateV1,
  type CaseDossierPrivacyFindingV1,
  type CaseLiveAcceptanceCandidateIdentityV1,
  type CaseLiveAcceptanceReceiptV1,
  type CaseLiveAcceptanceRunMode,
  type CaseLiveAcceptanceTransportMode,
} from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "@markorbit/persistence/case-candidate-intake";
import {
  SqliteCaseLiveAcceptanceRepository,
  type CaseLiveAcceptanceReceiptEventV1,
} from "@markorbit/persistence/case-live-acceptance";
import {
  CaseEvidenceCollectionError,
  type AuthorizedMarkRegCaseSourceResolver,
  type MarkRegCaseSourceTransport,
} from "@markorbit/worker-runtime/markreg-case-evidence-collector";
import { CaseDossierAssemblyService } from "./case-dossier-assembly-service";
import { CaseDossierPrivacyService } from "./case-dossier-privacy-service";
import { CaseEvidenceCollectionService } from "./case-evidence-collection-service";
import { getRegistryDatabase } from "./source-registry";

export class CaseLiveAcceptanceServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CaseLiveAcceptanceServiceError";
  }
}

export type CaseLiveAcceptanceServiceOptions = {
  resolver: AuthorizedMarkRegCaseSourceResolver;
  runMode: CaseLiveAcceptanceRunMode;
  producerPromotionRef?: string;
  database?: DatabaseSync;
  transport?: MarkRegCaseSourceTransport;
  timeoutMs?: number;
  maxResponseBytes?: number;
  now?: () => Date;
};

export type PrepareCaseLiveAcceptanceRunInput = {
  runId: string;
  candidate: CaseCandidateV1;
  privacyReviewId: string;
  privacyReviewerRef: string;
  startedAt?: string;
};

export type FinalizeCaseLiveAcceptanceRunInput = {
  derivativeId: string;
  findings: CaseDossierPrivacyFindingV1[];
  decidedAt?: string;
};

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function documentSha256(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function candidateIdentity(candidate: CaseCandidateV1): CaseLiveAcceptanceCandidateIdentityV1 {
  return {
    candidateId: candidate.candidateId,
    sourceSystem: candidate.sourceSystem,
    sourceMatterId: candidate.sourceMatterId,
    sourceMatterVersion: candidate.sourceMatterVersion,
    sourceSnapshotSha256: candidate.sourceSnapshotSha256,
    sourceWorkspaceId: candidate.accessScope.sourceWorkspaceId,
    sourceAccessClassification: candidate.accessScope.classification,
  };
}

function errorCode(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code.trim().length > 0
  ) {
    return (error as { code: string }).code;
  }
  return fallback;
}

export class CaseLiveAcceptanceService {
  private readonly runMode: CaseLiveAcceptanceRunMode;
  private readonly transportMode: CaseLiveAcceptanceTransportMode;
  private readonly producerPromotionRef?: string;
  private readonly now: () => Date;
  private readonly candidates: SqliteCaseCandidateIntakeRepository;
  private readonly receipts: SqliteCaseLiveAcceptanceRepository;
  private readonly evidence: CaseEvidenceCollectionService;
  private readonly dossiers: CaseDossierAssemblyService;
  private readonly privacy: CaseDossierPrivacyService;

  constructor(options: CaseLiveAcceptanceServiceOptions) {
    if (options.runMode === "LIVE" && options.transport) {
      throw new CaseLiveAcceptanceServiceError(
        "CASE_LIVE_ACCEPTANCE_TEST_TRANSPORT_FORBIDDEN",
        "LIVE Case acceptance cannot use an injected test transport",
      );
    }
    if (options.producerPromotionRef !== undefined && !nonEmpty(options.producerPromotionRef)) {
      throw new CaseLiveAcceptanceServiceError(
        "CASE_LIVE_ACCEPTANCE_PRODUCER_REF_INVALID",
        "producerPromotionRef must be non-empty when supplied",
      );
    }
    const database = options.database ?? getRegistryDatabase();
    this.runMode = options.runMode;
    this.transportMode = options.transport ? "INJECTED_TEST" : "DEFAULT_HTTP";
    this.producerPromotionRef = options.producerPromotionRef;
    this.now = options.now ?? (() => new Date());
    this.candidates = new SqliteCaseCandidateIntakeRepository(database);
    this.receipts = new SqliteCaseLiveAcceptanceRepository(database);
    this.evidence = new CaseEvidenceCollectionService({
      resolver: options.resolver,
      database,
      ...(options.transport ? { transport: options.transport } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.maxResponseBytes !== undefined
        ? { maxResponseBytes: options.maxResponseBytes }
        : {}),
      now: this.now,
    });
    this.dossiers = new CaseDossierAssemblyService(database);
    this.privacy = new CaseDossierPrivacyService(database, this.now);
  }

  async prepareRun(input: PrepareCaseLiveAcceptanceRunInput): Promise<CaseLiveAcceptanceReceiptV1> {
    this.validatePrepareInput(input);
    const existing = this.receipts.getReceipt(input.runId)?.receipt;
    const startedAt = input.startedAt ?? existing?.startedAt ?? this.now().toISOString();
    if (Number.isNaN(Date.parse(startedAt))) {
      throw new CaseLiveAcceptanceServiceError(
        "CASE_LIVE_ACCEPTANCE_STARTED_AT_INVALID",
        "startedAt must be a valid timestamp",
      );
    }

    const storedCandidate = this.candidates.getCandidate(input.candidate.candidateId);
    let accepted: CaseCandidateV1;
    if (storedCandidate) {
      if (canonical(storedCandidate) !== canonical(input.candidate)) {
        throw new CaseLiveAcceptanceServiceError(
          "CASE_LIVE_ACCEPTANCE_CANDIDATE_CONFLICT",
          "The persisted Case Candidate differs from the producer-backed acceptance input",
        );
      }
      accepted = storedCandidate;
    } else {
      try {
        accepted = this.candidates.acceptCandidate(input.candidate, startedAt).candidate;
      } catch (error) {
        throw new CaseLiveAcceptanceServiceError(
          errorCode(error, "CASE_LIVE_ACCEPTANCE_INTAKE_FAILED"),
          "Case Candidate intake failed before an acceptance run could start",
        );
      }
    }

    const base: CaseLiveAcceptanceReceiptV1 = {
      protocolVersion: CASE_LIVE_ACCEPTANCE_PROTOCOL_VERSION,
      objectType: CASE_LIVE_ACCEPTANCE_OBJECT_TYPE,
      runId: input.runId,
      runMode: this.runMode,
      transportMode: this.transportMode,
      state: "STARTED",
      candidate: candidateIdentity(accepted),
      privacyPlan: {
        reviewId: input.privacyReviewId,
        reviewerRef: input.privacyReviewerRef,
      },
      ...(this.producerPromotionRef ? { producerPromotionRef: this.producerPromotionRef } : {}),
      eligibleForKCase008Review: false,
      publicationAuthorized: false,
      startedAt,
      updatedAt: startedAt,
    };

    if (existing) {
      this.assertSameRunInput(existing, base);
      if (
        existing.state === "PRIVACY_REVIEW_REQUIRED" ||
        existing.state === "FINALIZED" ||
        existing.state === "FAILED"
      ) {
        return existing;
      }
    } else {
      this.receipts.saveReceipt(base);
    }

    let collection;
    try {
      collection = await this.evidence.collectCandidate(accepted.candidateId);
    } catch (error) {
      const retryable = error instanceof CaseEvidenceCollectionError && error.retryable;
      const state = retryable ? "WAITING_SOURCE" : "FAILED";
      return this.receipts.saveReceipt({
        ...base,
        state,
        failure: {
          stage: "COLLECTION",
          code: errorCode(error, "CASE_LIVE_ACCEPTANCE_COLLECTION_FAILED"),
          retryable,
        },
        updatedAt: this.now().toISOString(),
      }).receipt;
    }

    let dossier;
    try {
      dossier = this.dossiers.assembleCandidate(accepted.candidateId);
    } catch (error) {
      return this.receipts.saveReceipt({
        ...base,
        state: "FAILED",
        evidence: {
          collectionId: collection.collectionId,
          documentSha256: documentSha256(collection),
        },
        failure: {
          stage: "ASSEMBLY",
          code: errorCode(error, "CASE_LIVE_ACCEPTANCE_ASSEMBLY_FAILED"),
          retryable: false,
        },
        updatedAt: this.now().toISOString(),
      }).receipt;
    }

    try {
      const review = this.privacy.openReview({
        dossierId: dossier.dossierId,
        dossierVersion: dossier.version,
        reviewId: input.privacyReviewId,
        audienceAccessClassification: accepted.accessScope.classification,
        reviewerRef: input.privacyReviewerRef,
      });
      return this.receipts.saveReceipt({
        ...base,
        state: "PRIVACY_REVIEW_REQUIRED",
        evidence: {
          collectionId: collection.collectionId,
          documentSha256: documentSha256(collection),
        },
        assembledDossier: {
          dossierId: dossier.dossierId,
          version: dossier.version,
          documentSha256: documentSha256(dossier),
        },
        privacyReview: { reviewId: review.reviewId, state: review.state },
        updatedAt: review.openedAt,
      }).receipt;
    } catch (error) {
      return this.receipts.saveReceipt({
        ...base,
        state: "FAILED",
        evidence: {
          collectionId: collection.collectionId,
          documentSha256: documentSha256(collection),
        },
        assembledDossier: {
          dossierId: dossier.dossierId,
          version: dossier.version,
          documentSha256: documentSha256(dossier),
        },
        failure: {
          stage: "PRIVACY",
          code: errorCode(error, "CASE_LIVE_ACCEPTANCE_PRIVACY_OPEN_FAILED"),
          retryable: false,
        },
        updatedAt: this.now().toISOString(),
      }).receipt;
    }
  }

  markNeedsRedaction(
    runId: string,
    findings: CaseDossierPrivacyFindingV1[],
    decidedAt?: string,
  ): CaseLiveAcceptanceReceiptV1 {
    const current = this.requirePrivacyRun(runId);
    const review = this.privacy.markNeedsRedaction(
      current.privacyPlan.reviewId,
      findings,
      decidedAt,
    );
    return this.receipts.saveReceipt({
      ...current,
      state: "PRIVACY_REVIEW_REQUIRED",
      privacyReview: { reviewId: review.reviewId, state: review.state },
      updatedAt: review.decidedAt ?? this.now().toISOString(),
    }).receipt;
  }

  rejectRun(
    runId: string,
    findings: CaseDossierPrivacyFindingV1[] = [],
    decidedAt?: string,
  ): CaseLiveAcceptanceReceiptV1 {
    const current = this.requirePrivacyRun(runId);
    const review = this.privacy.rejectReview(current.privacyPlan.reviewId, findings, decidedAt);
    return this.receipts.saveReceipt({
      ...current,
      state: "FAILED",
      privacyReview: { reviewId: review.reviewId, state: "REJECTED" },
      failure: {
        stage: "PRIVACY",
        code: "CASE_LIVE_ACCEPTANCE_PRIVACY_REJECTED",
        retryable: false,
      },
      updatedAt: review.decidedAt ?? this.now().toISOString(),
    }).receipt;
  }

  finalizeRun(
    runId: string,
    input: FinalizeCaseLiveAcceptanceRunInput,
  ): CaseLiveAcceptanceReceiptV1 {
    const current = this.requirePrivacyRun(runId, true);
    if (current.state === "FINALIZED" && current.finalized?.derivativeId !== input.derivativeId) {
      throw new CaseLiveAcceptanceServiceError(
        "CASE_LIVE_ACCEPTANCE_DERIVATIVE_CONFLICT",
        "Finalized acceptance run cannot be replayed with a different derivativeId",
      );
    }
    const result = this.privacy.finalizeReview(current.privacyPlan.reviewId, input);
    const finalized: CaseLiveAcceptanceReceiptV1 = {
      ...current,
      state: "FINALIZED",
      privacyReview: { reviewId: result.review.reviewId, state: "FINALIZED" },
      finalized: {
        derivativeId: result.derivative.derivativeId,
        derivativeSha256: documentSha256(result.derivative),
        dossierId: result.finalizedDossier.dossierId,
        dossierVersion: result.finalizedDossier.version,
        dossierSha256: documentSha256(result.finalizedDossier),
      },
      eligibleForKCase008Review:
        current.runMode === "LIVE" &&
        current.transportMode === "DEFAULT_HTTP" &&
        nonEmpty(current.producerPromotionRef),
      publicationAuthorized: false,
      updatedAt: result.review.decidedAt ?? this.now().toISOString(),
    };
    return this.receipts.saveReceipt(finalized).receipt;
  }

  getReceipt(runId: string): CaseLiveAcceptanceReceiptV1 | null {
    return this.receipts.getReceipt(runId)?.receipt ?? null;
  }

  getEvents(runId: string): CaseLiveAcceptanceReceiptEventV1[] {
    return this.receipts.listEvents(runId);
  }

  private validatePrepareInput(input: PrepareCaseLiveAcceptanceRunInput): void {
    if (
      !nonEmpty(input.runId) ||
      !isCaseCandidateV1(input.candidate) ||
      !nonEmpty(input.privacyReviewId) ||
      !nonEmpty(input.privacyReviewerRef)
    ) {
      throw new CaseLiveAcceptanceServiceError(
        "CASE_LIVE_ACCEPTANCE_INPUT_INVALID",
        "A valid runId, Case Candidate and privacy review identity are required",
      );
    }
  }

  private assertSameRunInput(
    current: CaseLiveAcceptanceReceiptV1,
    incoming: CaseLiveAcceptanceReceiptV1,
  ): void {
    if (
      current.runMode !== incoming.runMode ||
      current.transportMode !== incoming.transportMode ||
      current.producerPromotionRef !== incoming.producerPromotionRef ||
      canonical(current.candidate) !== canonical(incoming.candidate) ||
      canonical(current.privacyPlan) !== canonical(incoming.privacyPlan)
    ) {
      throw new CaseLiveAcceptanceServiceError(
        "CASE_LIVE_ACCEPTANCE_REPLAY_CONFLICT",
        "Case live acceptance run was replayed with different source or privacy lineage",
      );
    }
  }

  private requirePrivacyRun(runId: string, allowFinalized = false): CaseLiveAcceptanceReceiptV1 {
    const current = this.getReceipt(runId);
    if (!current) {
      throw new CaseLiveAcceptanceServiceError(
        "CASE_LIVE_ACCEPTANCE_NOT_FOUND",
        `Case live acceptance run ${runId} does not exist`,
      );
    }
    if (
      current.state !== "PRIVACY_REVIEW_REQUIRED" &&
      !(allowFinalized && current.state === "FINALIZED")
    ) {
      throw new CaseLiveAcceptanceServiceError(
        "CASE_LIVE_ACCEPTANCE_PRIVACY_STATE_INVALID",
        `Case live acceptance run ${runId} is not awaiting privacy review`,
      );
    }
    if (!current.privacyReview || !current.evidence || !current.assembledDossier) {
      throw new CaseLiveAcceptanceServiceError(
        "CASE_LIVE_ACCEPTANCE_RECEIPT_INCOMPLETE",
        `Case live acceptance run ${runId} has incomplete privacy-stage evidence`,
      );
    }
    return current;
  }
}
