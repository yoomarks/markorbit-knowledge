import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  apiError,
  bearerCredential,
  leaseToken,
  readJson,
  requireRecord,
} from "@/server/api-errors";
import {
  clearHttpValidatorCheckpoint,
  readHttpValidatorCheckpoint,
  writeHttpValidatorCheckpoint,
} from "@/server/http-validator-checkpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    if (
      typeof body.workerId !== "string" ||
      typeof body.leaseId !== "string" ||
      typeof body.canonicalUri !== "string"
    ) {
      throw new RegistryValidationError("workerId, leaseId and canonicalUri are required");
    }
    const auth = {
      workerId: body.workerId.trim(),
      credential: bearerCredential(request),
      leaseId: body.leaseId.trim(),
      leaseToken: leaseToken(request),
      canonicalUri: body.canonicalUri,
    };

    if (body.operation === "READ") {
      return NextResponse.json({ checkpoint: readHttpValidatorCheckpoint(auth) });
    }
    if (body.operation === "CLEAR") {
      return NextResponse.json({ cleared: clearHttpValidatorCheckpoint(auth) });
    }
    if (body.operation === "WRITE") {
      if (body.etag !== undefined && body.etag !== null && typeof body.etag !== "string") {
        throw new RegistryValidationError("etag must be a string or null");
      }
      if (
        body.lastModified !== undefined &&
        body.lastModified !== null &&
        typeof body.lastModified !== "string"
      ) {
        throw new RegistryValidationError("lastModified must be a string or null");
      }
      if (body.observedAt !== undefined && typeof body.observedAt !== "string") {
        throw new RegistryValidationError("observedAt must be a string");
      }
      const checkpoint = writeHttpValidatorCheckpoint({
        ...auth,
        etag: body.etag as string | null | undefined,
        lastModified: body.lastModified as string | null | undefined,
        observedAt: body.observedAt as string | undefined,
      });
      return NextResponse.json({ checkpoint });
    }
    throw new RegistryValidationError("operation must be READ, WRITE or CLEAR");
  } catch (error) {
    return apiError(error);
  }
}
