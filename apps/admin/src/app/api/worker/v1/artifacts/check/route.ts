import { NextResponse } from "next/server";
import { ARTIFACT_KINDS, type ArtifactKind } from "@markorbit/contracts";
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
    if (
      typeof body.artifactKind !== "string" ||
      !ARTIFACT_KINDS.includes(body.artifactKind as ArtifactKind)
    ) {
      throw new RegistryValidationError("artifactKind is invalid");
    }
    if (typeof body.canonicalUri !== "string" || typeof body.sha256 !== "string") {
      throw new RegistryValidationError("canonicalUri and sha256 are required");
    }

    const result = getRawArtifactRepository().checkCurrentContent({
      workerId: body.workerId.trim(),
      credential: bearerCredential(request),
      leaseId: body.leaseId.trim(),
      leaseToken: leaseToken(request),
      artifactKind: body.artifactKind as ArtifactKind,
      canonicalUri: body.canonicalUri,
      sha256: body.sha256,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
