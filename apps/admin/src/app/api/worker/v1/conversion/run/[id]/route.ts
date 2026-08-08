import { NextResponse } from "next/server";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { apiError, bearerCredential } from "@/server/api-errors";
import {
  getConversionRunLedgerRepository,
  getWorkerRegistryRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const credential = bearerCredential(request);
    const workerId = new URL(request.url).searchParams.get("workerId")?.trim();
    if (!workerId) throw new RegistryValidationError("workerId query parameter is required");
    const worker = getWorkerRegistryRepository().verifyCredential(workerId, credential);
    const { id } = await context.params;
    const record = getConversionRunLedgerRepository().getById(id, worker.workspaceId);
    if (!record)
      throw new RegistryError("CONVERSION_RUN_NOT_FOUND", `ConversionRun ${id} was not found`);
    if (record.run.workspaceId !== worker.workspaceId) {
      throw new RegistryConflictError(
        "CONVERSION_RUN_WORKSPACE_MISMATCH",
        "ConversionRun belongs to another Workspace",
      );
    }
    return NextResponse.json({
      workspaceId: record.run.workspaceId,
      conversionRunId: record.run.id,
      sourceId: record.run.sourceId,
      rawArtifactId: record.run.rawArtifactId,
    });
  } catch (error) {
    return apiError(error);
  }
}
