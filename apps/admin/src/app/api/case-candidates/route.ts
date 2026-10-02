import { NextResponse } from "next/server";
import { isCaseCandidateV1 } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "../../../server/api-errors";
import { getCaseCandidateIntakeRepository } from "../../../server/case-candidate-intake";
import { authorizeCaseProducerMutation } from "../../../server/case-producer-auth";
import {
  resolveOperatorServiceMutationAccess,
  resolveOperatorServiceReadAccess,
} from "../../../server/operator-service-api-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = resolveOperatorServiceReadAccess(request);
    const { searchParams } = new URL(request.url);
    const candidateId = searchParams.get("candidateId");
    const repository = getCaseCandidateIntakeRepository();

    if (candidateId) {
      const result = repository.getResultForWorkspace(candidateId, access.coreWorkspaceId);
      return NextResponse.json({
        candidate: result?.candidate ?? null,
        intake: result?.intake ?? null,
      });
    }

    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null ? 25 : Number(rawLimit);
    return NextResponse.json({
      items: repository.listPendingForWorkspace(access.coreWorkspaceId, limit),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const candidate = await request.json();
    if (!isCaseCandidateV1(candidate)) {
      throw new RegistryValidationError("Case Candidate is invalid");
    }
    const access = resolveOperatorServiceMutationAccess(
      request,
      candidate.accessScope.sourceWorkspaceId,
    );
    authorizeCaseProducerMutation(access.principal);
    return NextResponse.json(getCaseCandidateIntakeRepository().acceptCandidate(candidate), {
      status: 202,
    });
  } catch (error) {
    return apiError(error);
  }
}
