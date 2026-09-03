import { NextResponse } from "next/server";
import { isConversionWorkerCapability } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson } from "@/server/api-errors";
import {
  resolveOperatorServiceMutationAccess,
  resolveOperatorServiceReadAccess,
} from "@/server/operator-service-api-access";
import { getConversionRuntimeRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integer(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new RegistryValidationError("Pagination must be integer");
  return parsed;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const assertedWorkspaceId = params.get("workspaceId")?.trim() || undefined;
    resolveOperatorServiceReadAccess(request, assertedWorkspaceId);
    const active = params.get("active");
    if (active !== null && active !== "true" && active !== "false") {
      throw new RegistryValidationError("active must be true or false");
    }
    return NextResponse.json(
      getConversionRuntimeRepository().listCapabilities({
        workerId: params.get("workerId") ?? undefined,
        workspaceId: assertedWorkspaceId,
        active: active === null ? undefined : active === "true",
        limit: integer(params.get("limit"), 25),
        offset: integer(params.get("offset"), 0),
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (!isConversionWorkerCapability(body)) {
      throw new RegistryValidationError("Invalid Conversion Worker capability");
    }
    resolveOperatorServiceMutationAccess(request, body.workspaceId);
    return NextResponse.json(
      { record: getConversionRuntimeRepository().registerCapability(body) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
