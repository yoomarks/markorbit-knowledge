import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { getConfiguredVaultInspectionService } from "@/server/vault-inspection-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json(getConfiguredVaultInspectionService().overview(id));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json(
      { run: getConfiguredVaultInspectionService().inspect(id) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
