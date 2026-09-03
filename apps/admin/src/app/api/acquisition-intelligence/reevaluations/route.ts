import { NextResponse } from "next/server";
import { SqliteAcquisitionStrategyGovernanceRepository } from "@markorbit/persistence/acquisition-strategy-governance";
import { apiError } from "@/server/api-errors";
import { resolveOperatorServiceReadAccess } from "@/server/operator-service-api-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    resolveOperatorServiceReadAccess(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const repository = new SqliteAcquisitionStrategyGovernanceRepository(getRegistryDatabase());
    return NextResponse.json({ items: repository.listPendingReevaluations(limit) });
  } catch (error) {
    return apiError(error);
  }
}
