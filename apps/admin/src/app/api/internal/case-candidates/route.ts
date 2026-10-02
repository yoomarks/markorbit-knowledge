import { NextResponse } from "next/server";
import { isCaseCandidateV1 } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson } from "@/server/api-errors";
import { getCaseCandidateIntakeRepository } from "@/server/case-candidate-intake";
import {
  authorizeCaseProducerMutation,
  authorizeCaseProducerRequest,
} from "@/server/case-producer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const value = await readJson(request);
    if (!isCaseCandidateV1(value)) {
      throw new RegistryValidationError("Case Candidate is invalid");
    }

    const principal = authorizeCaseProducerRequest(request, value);
    authorizeCaseProducerMutation(principal);
    return NextResponse.json(getCaseCandidateIntakeRepository().acceptCandidate(value), {
      status: 202,
    });
  } catch (error) {
    return apiError(error);
  }
}
