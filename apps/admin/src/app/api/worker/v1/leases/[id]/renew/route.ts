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
    const { id } = await context.params;
    const lease = getWorkerRegistryRepository().renewLease(
      body.workerId.trim(),
      credential,
      id,
      token,
    );
    return NextResponse.json({ lease });
  } catch (error) {
    return apiError(error);
  }
}
