import { NextResponse } from "next/server";
import { CaseEvidenceCollectionError } from "@markorbit/worker-runtime/markreg-case-evidence-collector";
import { apiError } from "@/server/api-errors";
import {
  CaseEvidenceCollectionServiceError,
  createCaseEvidenceCollectionService,
} from "@/server/case-evidence-collection-service";
import { getCaseCandidateIntakeRepository } from "@/server/case-candidate-intake";
import {
  authenticateCaseProducerRequest,
  authorizeCaseProducerWorkspace,
} from "@/server/case-producer-auth";
import { createRequestBoundMarkRegCaseSourceResolver } from "@/server/markreg-case-source-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ candidateId: string }> };

function evidenceError(error: unknown): NextResponse | null {
  if (error instanceof CaseEvidenceCollectionServiceError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.code === "CASE_CANDIDATE_NOT_FOUND" ? 404 : 500 },
    );
  }
  if (!(error instanceof CaseEvidenceCollectionError)) return null;

  const status = error.retryable
    ? 503
    : error.code === "MARKREG_SOURCE_NOT_AUTHORIZED"
      ? 403
      : error.code === "MARKREG_SOURCE_NOT_FOUND"
        ? 404
        : error.code === "MARKREG_SOURCE_IDENTITY_MISMATCH"
          ? 409
          : error.code === "MARKREG_SOURCE_ACCESS_INVALID" ||
              error.code === "MARKREG_TIMEOUT_INVALID" ||
              error.code === "MARKREG_RESPONSE_LIMIT_INVALID"
            ? 503
            : 502;
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      },
    },
    { status },
  );
}

export async function POST(request: Request, context: RouteContext) {
  try {
    // Authenticate before looking up a Candidate so untrusted callers cannot
    // use 404 behavior to enumerate durable Case Candidate identifiers.
    const principal = authenticateCaseProducerRequest(request);
    const { candidateId } = await context.params;
    const candidate = getCaseCandidateIntakeRepository().getCandidate(candidateId);
    if (!candidate) {
      throw new CaseEvidenceCollectionServiceError(
        "CASE_CANDIDATE_NOT_FOUND",
        `Case Candidate ${candidateId} does not exist`,
      );
    }
    authorizeCaseProducerWorkspace(principal, candidate);

    const service = createCaseEvidenceCollectionService({
      resolver: createRequestBoundMarkRegCaseSourceResolver(request),
    });
    const collection = await service.collectCandidate(candidateId);
    return NextResponse.json({ candidateId, collection }, { status: 200 });
  } catch (error) {
    return evidenceError(error) ?? apiError(error);
  }
}
