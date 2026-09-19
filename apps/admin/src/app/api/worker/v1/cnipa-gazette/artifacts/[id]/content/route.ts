import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential, leaseToken, workerIdHeader } from "@/server/api-errors";
import { authorizeCnipaGazetteWorkerArtifactRead } from "@/server/cnipa-gazette-worker-artifact-read";
import { getRawArtifactRepository, getWorkerExecutionRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function headerValue(value: string): string {
  return encodeURIComponent(value);
}
export async function GET(request: Request, context: RouteContext) {
  try {
    const leaseId = request.headers.get("x-lease-id")?.trim();
    if (!leaseId) throw new RegistryValidationError("x-lease-id is required");
    const { id } = await context.params;
    const result = authorizeCnipaGazetteWorkerArtifactRead(
      {
        workerId: workerIdHeader(request),
        credential: bearerCredential(request),
        leaseId,
        leaseToken: leaseToken(request),
        artifactId: id,
      },
      {
        executions: getWorkerExecutionRepository(),
        artifacts: getRawArtifactRepository(),
      },
    );
    const artifact = result.view.artifact;
    const stream = Readable.toWeb(
      createReadStream(result.content.path),
    ) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(result.content.sizeBytes),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-markorbit-artifact-kind": artifact.artifactKind,
        "x-markorbit-original-mime": result.content.mimeType,
        "x-markorbit-original-name": headerValue(result.content.originalName),
        "x-markorbit-canonical-uri": headerValue(artifact.canonicalUri ?? ""),
        "x-markorbit-content-sha256": result.view.contentObject.sha256,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
