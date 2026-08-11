import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { ingestManualUpload } from "@/server/manual-upload-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredHeader(request: Request, name: string, max = 200): string {
  const value = request.headers.get(name)?.trim();
  if (!value || value.length > max) {
    throw new RegistryValidationError(`${name} header is required`);
  }
  return value;
}

export async function POST(request: Request) {
  try {
    const workspaceId = requiredHeader(request, "x-markorbit-workspace-id", 80);
    const actorId = requiredHeader(request, "x-markorbit-admin-actor-id", 200);
    const idempotencyKey = requiredHeader(request, "idempotency-key", 128);
    const form = await request.formData();
    const value = form.get("file");
    if (!(value instanceof File)) {
      throw new RegistryValidationError("multipart field 'file' is required");
    }
    const result = await ingestManualUpload({
      workspaceId,
      actor: { actorType: "LOCAL_ADMIN", actorId },
      idempotencyKey,
      file: value,
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
