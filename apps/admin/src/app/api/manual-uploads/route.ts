import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiMutationAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { ingestManualUpload, manualUploadMaxBytes } from "@/server/manual-upload-ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_MIME_TYPES = [
  "text/markdown",
  "text/html",
  "application/xhtml+xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
  "application/json",
  "text/json",
  "application/xml",
  "text/xml",
  "message/rfc822",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
] as const;

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new RegistryValidationError(`${name} header is required`);
  return value;
}

function optionalHeader(request: Request, name: string): string | undefined {
  return request.headers.get(name)?.trim() || undefined;
}

function decodedHeader(request: Request, name: string, required = false): string | undefined {
  const encoded = required ? requiredHeader(request, name) : optionalHeader(request, name);
  if (!encoded) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    throw new RegistryValidationError(`${name} must be URI encoded UTF-8`);
  }
}

function decodedFilename(request: Request): string {
  return decodedHeader(request, "x-markorbit-filename", true)!;
}

function expectedSize(request: Request): number {
  const value = requiredHeader(request, "x-markorbit-content-size");
  if (!/^\d+$/.test(value)) {
    throw new RegistryValidationError("x-markorbit-content-size must be an integer byte count");
  }
  return Number(value);
}

function csvHeader(request: Request, name: string): string[] | undefined {
  const value = decodedHeader(request, name);
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function* requestChunks(request: Request, maxBytes: number): AsyncIterable<Uint8Array> {
  if (!request.body) throw new RegistryValidationError("Manual Upload request body is required");
  const reader = request.body.getReader();
  let observedBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      if (result.value.byteLength === 0) continue;
      observedBytes += result.value.byteLength;
      if (observedBytes > maxBytes) {
        await reader.cancel("Manual Upload exceeds configured byte limit");
        throw new RegistryValidationError(`Manual Upload exceeds the ${maxBytes} byte limit`);
      }
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

export function GET() {
  try {
    return NextResponse.json({
      maxBytes: manualUploadMaxBytes(),
      supportedMimeTypes: SUPPORTED_MIME_TYPES,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const assertedWorkspaceId = requiredHeader(request, "x-markorbit-workspace-id");
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      assertedWorkspaceId,
    );
    const maxBytes = manualUploadMaxBytes();
    const result = await ingestManualUpload({
      workspaceId,
      originalName: decodedFilename(request),
      mimeType: requiredHeader(request, "content-type"),
      expectedSizeBytes: expectedSize(request),
      expectedSha256: requiredHeader(request, "x-markorbit-content-sha256"),
      idempotencyKey: requiredHeader(request, "idempotency-key"),
      sourceId: optionalHeader(request, "x-markorbit-source-id"),
      sourceName: decodedHeader(request, "x-markorbit-source-name"),
      jurisdictions: csvHeader(request, "x-markorbit-jurisdictions"),
      languages: csvHeader(request, "x-markorbit-languages"),
      relatedSourceId: optionalHeader(request, "x-markorbit-related-source-id"),
      chunks: requestChunks(request, maxBytes),
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
