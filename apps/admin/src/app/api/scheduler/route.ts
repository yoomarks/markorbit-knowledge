import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteCollectionSchedulerRepository } from "@markorbit/persistence/collection-scheduler";
import { apiError } from "@/server/api-errors";
import { resolveOperatorServiceReadAccess } from "@/server/operator-service-api-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integerValue(value: string | null, field: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RegistryValidationError(`${field} must be a positive integer`);
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim() || undefined;
    resolveOperatorServiceReadAccess(request, workspaceId);
    const scheduler = new SqliteCollectionSchedulerRepository(getRegistryDatabase());
    const planId = url.searchParams.get("planId")?.trim();
    if (planId) {
      return NextResponse.json({ state: scheduler.getState(planId) });
    }
    const limit = integerValue(url.searchParams.get("limit"), "limit");
    return NextResponse.json({
      items: scheduler.listStates(workspaceId, limit),
    });
  } catch (error) {
    return apiError(error);
  }
}
