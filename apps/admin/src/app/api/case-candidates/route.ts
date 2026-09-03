import { NextResponse } from "next/server";
import type { CaseCandidateV1 } from "@markorbit/contracts";
import { apiError } from "@/server/api-errors";
import { getCaseCandidateIntakeRepository } from "@/server/case-candidate-intake";
import {
  resolveOperatorServiceMutationAccess,
  resolveOperatorServiceReadAccess,
} from "@/server/operator-service-api-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    resolveOperatorServiceReadAccess(request);
    const { searchParams } = new URL(request.url);
    const candidateId = searchParams.get("candidateId");
    const repository = getCaseCandidateIntakeRepository();

    if (candidateId) {
      const candidate = repository.getCandidate(candidateId);
      const intake = repository.getIntake(candidateId);
      return NextResponse.json({ candidate, intake });
    }

    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null ? 25 : Number(rawLimit);
    return NextResponse.json({ items: repository.listPending(limit) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const candidate = (await request.json()) as CaseCandidateV1;
    resolveOperatorServiceMutationAccess(request, candidate.accessScope?.sourceWorkspaceId);
    return NextResponse.json(getCaseCandidateIntakeRepository().acceptCandidate(candidate), {
      status: 202,
    });
  } catch (error) {
    return apiError(error);
  }
}
