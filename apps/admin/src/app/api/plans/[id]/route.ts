import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  CollectionPlanNotFoundError,
  type UpdateCollectionPlanInput,
} from "@markorbit/persistence/collection-plans";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getCollectionPlanRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const plan = getCollectionPlanRepository().getById(id);
    if (!plan) throw new CollectionPlanNotFoundError(id);
    return NextResponse.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = requireRecord(await readJson(request));
    const expectedUpdatedAt = body.expectedUpdatedAt;
    if (typeof expectedUpdatedAt !== "string") {
      throw new RegistryValidationError("expectedUpdatedAt is required");
    }
    const input = { ...body };
    delete input.expectedUpdatedAt;
    delete input.status;
    delete input.sourceId;
    delete input.workspaceId;
    const plan = getCollectionPlanRepository().update(
      id,
      input as UpdateCollectionPlanInput,
      expectedUpdatedAt,
    );
    return NextResponse.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}
