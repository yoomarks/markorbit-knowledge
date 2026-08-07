import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential, leaseToken, workerIdHeader } from "@/server/api-errors";
import { getRawArtifactRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function* chunks(body: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    if (!request.body) throw new RegistryValidationError("Streaming request body is required");
    const leaseId = request.headers.get("x-lease-id")?.trim();
    if (!leaseId) throw new RegistryValidationError("x-lease-id is required");
    const { id } = await context.params;
    const result = await getRawArtifactRepository().uploadContent(
      workerIdHeader(request),
      bearerCredential(request),
      leaseId,
      leaseToken(request),
      id,
      chunks(request.body),
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
