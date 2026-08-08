import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential } from "@/server/api-errors";
import { ProductionConversionWorkerService } from "@/server/production-conversion-worker-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ grantId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const credential = bearerCredential(request);
    const workerId = new URL(request.url).searchParams.get("workerId")?.trim();
    if (!workerId) throw new RegistryValidationError("workerId query parameter is required");
    const { grantId } = await context.params;
    const result = new ProductionConversionWorkerService().readInput(grantId, workerId, credential);
    return new Response(result.bytes, {
      status: 200,
      headers: {
        "content-type": result.mimeType,
        "content-length": String(result.bytes.byteLength),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
