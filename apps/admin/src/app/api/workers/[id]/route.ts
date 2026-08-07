import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { WorkerNotFoundError, type UpdateWorkerInput } from "@markorbit/persistence/workers";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getWorkerRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const view = getWorkerRegistryRepository().getById(id);
    if (!view) throw new WorkerNotFoundError(id);
    return NextResponse.json({ view });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = requireRecord(await readJson(request));
    if (typeof body.expectedUpdatedAt !== "string") {
      throw new RegistryValidationError("expectedUpdatedAt is required");
    }
    const input = { ...body };
    delete input.expectedUpdatedAt;
    const view = getWorkerRegistryRepository().update(
      id,
      input as UpdateWorkerInput,
      body.expectedUpdatedAt,
    );
    return NextResponse.json({ view });
  } catch (error) {
    return apiError(error);
  }
}
