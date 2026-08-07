import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  apiError,
  bearerCredential,
  leaseToken,
  readJson,
  requireRecord,
  workerIdHeader,
} from "@/server/api-errors";
import { getRawArtifactRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const leaseId = request.headers.get("x-lease-id")?.trim();
    if (!leaseId) throw new RegistryValidationError("x-lease-id is required");
    const body = requireRecord(await readJson(request));
    const { id } = await context.params;
    const record = getRawArtifactRepository().abort(
      workerIdHeader(request),
      bearerCredential(request),
      leaseId,
      leaseToken(request),
      id,
      typeof body.reason === "string" ? body.reason : undefined,
    );
    return NextResponse.json({ record });
  } catch (error) {
    return apiError(error);
  }
}
