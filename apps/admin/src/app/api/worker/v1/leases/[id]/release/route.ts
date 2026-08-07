import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  apiError,
  bearerCredential,
  leaseToken,
  readJson,
  requireRecord,
} from "@/server/api-errors";
import { getWorkerRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const credential = bearerCredential(request);
    const token = leaseToken(request);
    const body = requireRecord(await readJson(request));
    if (typeof body.workerId !== "string") {
      throw new RegistryValidationError("workerId is required");
    }
    const reason = typeof body.reason === "string" ? body.reason : undefined;
    const { id } = await context.params;
    const lease = getWorkerRegistryRepository().releaseLease(
      body.workerId.trim(),
      credential,
      id,
      token,
      reason,
    );
    return NextResponse.json({ lease });
  } catch (error) {
    return apiError(error);
  }
}
