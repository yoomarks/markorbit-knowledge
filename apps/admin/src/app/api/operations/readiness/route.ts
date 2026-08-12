import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteOperationsReadinessRepository } from "@markorbit/persistence/operations-readiness";
import { apiError } from "@/server/api-errors";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    const repository = new SqliteOperationsReadinessRepository(getRegistryDatabase());
    return NextResponse.json(repository.inspect(workspaceId));
  } catch (error) {
    return apiError(error);
  }
}
