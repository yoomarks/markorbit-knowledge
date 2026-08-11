import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { ingestManualUpload } from "@/server/manual-upload-ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new RegistryValidationError(`${name} header is required`);
  return value;
}

function decodedFilename(request: Request): string {
  const encoded = requiredHeader(request, "x-markorbit-filename");
  try {
    return decodeURIComponent(encoded);
  } catch {
    throw new RegistryValidationError("x-markorbit-filename must be URI encoded UTF-8");
  }
}

function expectedSize(request: Request): number {
  const value = requiredHeader(request, "x-markorbit-content-size");
  if (!/^\d+$/.test(value)) {
    throw new RegistryValidationError("x-markorbit-content-size must be an integer byte count");
  }
  return Number(value);
}

async function* requestChunks(request: Request): AsyncIterable<Uint8Array> {
  if (!request.body) throw new RegistryValidationError("Manual Upload request body is required");
  const reader = request.body.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      if (result.value.byteLength > 0) yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  try {
    const result = await ingestManualUpload({
      workspaceId: requiredHeader(request, "x-markorbit-workspace-id"),
      originalName: decodedFilename(request),
      mimeType: requiredHeader(request, "content-type"),
      expectedSizeBytes: expectedSize(request),
      expectedSha256: requiredHeader(request, "x-markorbit-content-sha256"),
      idempotencyKey: requiredHeader(request, "idempotency-key"),
      chunks: requestChunks(request),
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
