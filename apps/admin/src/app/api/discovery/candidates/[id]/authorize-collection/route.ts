import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getDiscoveryCollectionService } from "@/server/discovery-collection-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = requireRecord(await readJson(request));
    if (body.requestedBy !== undefined && typeof body.requestedBy !== "string") {
      throw new RegistryValidationError("requestedBy must be a string");
    }
    if (body.idempotencyKey !== undefined && typeof body.idempotencyKey !== "string") {
      throw new RegistryValidationError("idempotencyKey must be a string");
    }

    const result = getDiscoveryCollectionService().authorizeAndDispatch(id, {
      requestedBy: typeof body.requestedBy === "string" ? body.requestedBy : "admin-console",
      idempotencyKey:
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
