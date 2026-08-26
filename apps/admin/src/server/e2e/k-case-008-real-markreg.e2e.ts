import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isCaseCandidateV1, type CaseCandidateV1 } from "@markorbit/contracts";
import { CaseLiveAcceptanceService } from "../case-live-acceptance-service";
import { createRequestBoundMarkRegCaseSourceResolver } from "../markreg-case-source-resolver";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the K-CASE-008 real MarkReg E2E test`);
  return value;
}

type PromotionResult = {
  producerPromotionRef: string;
  candidate: CaseCandidateV1;
  intake: {
    candidateId: string;
    sourceIdentitySha256: string;
    collectionState: string;
  };
  delivery: { state: "ACCEPTED"; replayed: boolean };
};

function promotionResult(): PromotionResult {
  const path = requiredEnvironment("MARKORBIT_KCASE_PROMOTION_RESULT_PATH");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<PromotionResult>;
  if (
    typeof parsed.producerPromotionRef !== "string" ||
    !isCaseCandidateV1(parsed.candidate) ||
    !parsed.intake ||
    parsed.intake.candidateId !== parsed.candidate.candidateId ||
    !parsed.delivery ||
    parsed.delivery.state !== "ACCEPTED" ||
    parsed.delivery.replayed !== false
  ) {
    throw new Error(
      "MarkReg promotion result does not contain the expected accepted Case Candidate",
    );
  }
  return parsed as PromotionResult;
}

function producerRequest(candidate: CaseCandidateV1): Request {
  return new Request("http://knowledge.internal/k-case-008-live", {
    headers: {
      "x-markorbit-internal-authorization": requiredEnvironment("MO_INTERNAL_SERVICE_SECRET"),
      "x-markorbit-principal": requiredEnvironment("MARKORBIT_KCASE_PRINCIPAL"),
      "x-markorbit-workspace-id": candidate.accessScope.sourceWorkspaceId,
    },
  });
}

describe.sequential("K-CASE-008 real MarkReg cross-repository LIVE acceptance", () => {
  it("finalizes one real producer promotion through default HTTP without granting publication authority", async () => {
    const promotion = promotionResult();
    const candidate = promotion.candidate;
    expect(promotion.producerPromotionRef).toMatch(/^markreg:case-promotion:v1:[0-9a-f]{64}$/u);
    expect(candidate.sourceSystem).toBe("MARKREG");
    expect(candidate.sourceMatterId).toBe(requiredEnvironment("MARKORBIT_KCASE_FORMAL_MATTER_ID"));
    expect(candidate.accessScope.sourceWorkspaceId).toBe(
      requiredEnvironment("MARKORBIT_KCASE_WORKSPACE_ID"),
    );

    const service = new CaseLiveAcceptanceService({
      resolver: createRequestBoundMarkRegCaseSourceResolver(producerRequest(candidate)),
      runMode: "LIVE",
      producerPromotionRef: promotion.producerPromotionRef,
    });
    const prepareInput = {
      runId: "case-live-run_cross-repo-kcase008",
      candidate,
      privacyReviewId: "case-privacy-review_cross-repo-kcase008",
      privacyReviewerRef: "user:privacy-reviewer:cross-repo-kcase008",
    };

    const prepared = await service.prepareRun(prepareInput);
    expect(prepared.state).toBe("PRIVACY_REVIEW_REQUIRED");
    expect(prepared.runMode).toBe("LIVE");
    expect(prepared.transportMode).toBe("DEFAULT_HTTP");
    expect(prepared.producerPromotionRef).toBe(promotion.producerPromotionRef);
    expect(prepared.evidence?.collectionId).toMatch(/^case-evidence_[0-9a-f]{32}$/u);
    expect(prepared.evidence?.documentSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(prepared.assembledDossier?.dossierId).toMatch(/^case-dossier_/u);
    expect(prepared.assembledDossier?.documentSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(prepared.eligibleForKCase008Review).toBe(false);
    expect(prepared.publicationAuthorized).toBe(false);

    const finalized = service.finalizeRun(prepareInput.runId, {
      derivativeId: "case-redacted_cross-repo-kcase008",
      findings: [],
    });
    expect(finalized.state).toBe("FINALIZED");
    expect(finalized.privacyReview?.state).toBe("FINALIZED");
    expect(finalized.finalized?.derivativeId).toBe("case-redacted_cross-repo-kcase008");
    expect(finalized.finalized?.derivativeSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(finalized.finalized?.dossierSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(finalized.eligibleForKCase008Review).toBe(true);
    expect(finalized.publicationAuthorized).toBe(false);

    const replay = await service.prepareRun(prepareInput);
    expect(replay).toEqual(finalized);
    expect(service.getEvents(prepareInput.runId).map((event) => event.receipt.state)).toEqual([
      "STARTED",
      "PRIVACY_REVIEW_REQUIRED",
      "FINALIZED",
    ]);
  });
});
