import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential, leaseToken, workerIdHeader } from "@/server/api-errors";
import { dispatchAutomaticConversionForArtifact } from "@/server/raw-artifact-auto-conversion";
import { extractRawArtifactIntoSourceGraph } from "@/server/raw-artifact-source-graph";
import { getRawArtifactRepository, getSourceGraphRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type DeferredExtraction = {
  status: "DEFERRED";
  reason: "EXTRACTION_FAILED";
};

type DeferredConversionHandoff = {
  status: "DEFERRED";
  reason: "HANDOFF_FAILED";
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const leaseId = request.headers.get("x-lease-id")?.trim();
    if (!leaseId) throw new RegistryValidationError("x-lease-id is required");
    const { id } = await context.params;
    const artifacts = getRawArtifactRepository();
    const result = await artifacts.finalize(
      workerIdHeader(request),
      bearerCredential(request),
      leaseId,
      leaseToken(request),
      id,
    );

    let sourceGraphExtraction:
      Awaited<ReturnType<typeof extractRawArtifactIntoSourceGraph>> | DeferredExtraction;
    try {
      sourceGraphExtraction = await extractRawArtifactIntoSourceGraph(
        result.artifact.artifact.id,
        artifacts,
        getSourceGraphRepository(),
      );
    } catch {
      // Artifact finalization is an immutable evidence boundary. A derived extraction failure must
      // never turn a successful upload into a Worker-visible ingestion failure or retry loop.
      sourceGraphExtraction = { status: "DEFERRED", reason: "EXTRACTION_FAILED" };
    }

    let conversionHandoff:
      ReturnType<typeof dispatchAutomaticConversionForArtifact> | DeferredConversionHandoff;
    try {
      conversionHandoff = dispatchAutomaticConversionForArtifact(
        result.artifact.artifact.id,
        result.artifact.artifact.workspaceId,
      );
    } catch {
      // Auto-conversion is derived processing after immutable RawArtifact finalization. Any profile,
      // authorization or queueing failure remains observable but cannot invalidate acquisition.
      conversionHandoff = { status: "DEFERRED", reason: "HANDOFF_FAILED" };
    }

    return NextResponse.json({ ...result, sourceGraphExtraction, conversionHandoff });
  } catch (error) {
    return apiError(error);
  }
}
