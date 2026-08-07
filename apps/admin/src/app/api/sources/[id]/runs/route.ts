import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { getExecutionLedgerRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit ? Number(rawLimit) : 20;
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RegistryValidationError("limit must be a positive integer");
    }
    return NextResponse.json({ runs: getExecutionLedgerRepository().listForSource(id, limit) });
  } catch (error) {
    return apiError(error);
  }
}
