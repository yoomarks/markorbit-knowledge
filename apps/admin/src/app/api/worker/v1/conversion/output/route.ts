import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential } from "@/server/api-errors";
import { ProductionConversionWorkerService } from "@/server/production-conversion-worker-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5_000_000;

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new RegistryValidationError(`${name} header is required`);
  return value;
}

export async function POST(request: Request) {
  try {
    const credential = bearerCredential(request);
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "text/markdown") {
      throw new RegistryValidationError("Conversion output content-type must be text/markdown");
    }
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BYTES) {
      throw new RegistryValidationError("Conversion output exceeds the maximum size");
    }
    const content = new Uint8Array(await request.arrayBuffer());
    if (content.byteLength === 0 || content.byteLength > MAX_BYTES) {
      throw new RegistryValidationError("Conversion output must contain 1-5000000 bytes");
    }
    const result = new ProductionConversionWorkerService().commitStaging(
      {
        workspaceId: requiredHeader(request, "x-markorbit-workspace-id"),
        workerId: requiredHeader(request, "x-markorbit-worker-id"),
        conversionRunId: requiredHeader(request, "x-markorbit-conversion-run-id"),
        conversionAttemptId: requiredHeader(request, "x-markorbit-conversion-attempt-id"),
        uploadGrantId: requiredHeader(request, "x-markorbit-upload-grant-id"),
        idempotencyKey: requiredHeader(request, "idempotency-key"),
        content,
      },
      credential,
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
