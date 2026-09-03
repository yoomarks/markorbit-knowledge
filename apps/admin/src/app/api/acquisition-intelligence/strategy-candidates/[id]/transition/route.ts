import { NextResponse } from "next/server";
import { ACQUISITION_PROMOTION_STAGES, type AcquisitionPromotionStage } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteAcquisitionStrategyGovernanceRepository } from "@markorbit/persistence/acquisition-strategy-governance";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { resolveOperatorServiceMutationAccess } from "@/server/operator-service-api-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = resolveOperatorServiceMutationAccess(request);
    const { id } = await context.params;
    const body = requireRecord(await readJson(request));
    if (
      typeof body.toStage !== "string" ||
      !ACQUISITION_PROMOTION_STAGES.includes(body.toStage as AcquisitionPromotionStage)
    ) {
      throw new RegistryValidationError("toStage must be a valid acquisition promotion stage");
    }
    if (typeof body.rationale !== "string" || !body.rationale.trim()) {
      throw new RegistryValidationError("rationale is required");
    }
    const evidenceRefs = body.evidenceRefs ?? [];
    if (!Array.isArray(evidenceRefs) || !evidenceRefs.every((item) => typeof item === "string")) {
      throw new RegistryValidationError("evidenceRefs must be an array of strings");
    }

    const repository = new SqliteAcquisitionStrategyGovernanceRepository(getRegistryDatabase());
    return NextResponse.json(
      repository.transitionCandidate({
        candidateId: id,
        toStage: body.toStage as AcquisitionPromotionStage,
        actor: {
          actorType: "HUMAN",
          actorId: principal.userId,
        },
        evidenceRefs,
        rationale: body.rationale,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
