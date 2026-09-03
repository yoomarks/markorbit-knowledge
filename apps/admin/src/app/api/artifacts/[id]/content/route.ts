import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { RawArtifactNotFoundError } from "@markorbit/persistence/raw-artifacts";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getRawArtifactRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function dispositionFilename(value: string): string {
  return value.replace(/["\\\r\n]/g, "_");
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const repository = getRawArtifactRepository();
    const artifact = repository.getArtifact(id);
    if (!artifact) throw new RawArtifactNotFoundError(id);
    const { principal } = await resolveAdminBrowserApiReadAccess(
      request,
      artifact.artifact.workspaceId,
    );
    assertAdminBrowserResourceWorkspace(principal, artifact.artifact.workspaceId);

    const content = repository.contentPath(id);
    const stream = Readable.toWeb(createReadStream(content.path)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(content.sizeBytes),
        "content-disposition": `attachment; filename="${dispositionFilename(content.originalName)}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'",
        "cache-control": "private, no-store",
        "x-markorbit-original-mime": content.mimeType,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
