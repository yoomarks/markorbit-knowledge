import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import {
  approveFoundationalActionIntent,
  cancelFoundationalActionIntent,
} from "@/server/foundational-action-intents";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ intentId: string }> }) {
  try {
    const { intentId } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const operation = typeof payload.operation === "string" ? payload.operation.trim() : "";
    const actorId = typeof payload.actorId === "string" ? payload.actorId.trim() : "";
    if (!actorId) throw new RegistryValidationError("actorId is required");
    if (operation === "APPROVE") {
      return NextResponse.json(
        approveFoundationalActionIntent(getRegistryDatabase(), intentId, actorId),
      );
    }
    if (operation === "CANCEL") {
      return NextResponse.json(
        cancelFoundationalActionIntent(getRegistryDatabase(), intentId, actorId),
      );
    }
    throw new RegistryValidationError("operation must be APPROVE or CANCEL");
  } catch (error) {
    return apiError(error);
  }
}
