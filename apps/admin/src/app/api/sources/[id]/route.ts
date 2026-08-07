import { NextResponse } from "next/server";
import {
  RegistryNotFoundError,
  RegistryValidationError,
  type UpdateSourceInput,
} from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getSourceRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const source = getSourceRepository().getById(id);
    if (!source) throw new RegistryNotFoundError(id);
    return NextResponse.json({ source });
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
    if (Object.prototype.hasOwnProperty.call(body, "defaultCollectionPlanId")) {
      throw new RegistryValidationError(
        "Use the validated default-plan endpoint to change defaultCollectionPlanId",
      );
    }
    const input = { ...body };
    delete input.expectedUpdatedAt;
    const source = getSourceRepository().update(id, input as UpdateSourceInput, expectedUpdatedAt);
    return NextResponse.json({ source });
  } catch (error) {
    return apiError(error);
  }
}
