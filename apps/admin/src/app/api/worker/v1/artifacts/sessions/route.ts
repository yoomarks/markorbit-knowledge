import { NextResponse } from "next/server";
import { assertArtifactUploadDescriptor } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  apiError,
  bearerCredential,
  leaseToken,
  readJson,
  requireRecord,
} from "@/server/api-errors";
import { getRawArtifactRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    if (typeof body.workerId !== "string" || typeof body.leaseId !== "string") {
      throw new RegistryValidationError("workerId and leaseId are required");
    }
    if (typeof body.idempotencyKey !== "string") {
      throw new RegistryValidationError("idempotencyKey is required");
    }
    assertArtifactUploadDescriptor(body.descriptor);
    const result = getRawArtifactRepository().createSession({
      workerId: body.workerId.trim(),
      credential: bearerCredential(request),
      leaseId: body.leaseId.trim(),
      leaseToken: leaseToken(request),
      descriptor: body.descriptor,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
