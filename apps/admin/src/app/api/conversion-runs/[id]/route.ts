import { NextResponse } from "next/server";
import { ConversionRunNotFoundError } from "@markorbit/persistence/conversion-runs";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { requireWorkspaceQuery } from "@/server/conversion-run-api-validation";
import { getConversionRunLedgerRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const assertedWorkspaceId = requireWorkspaceQuery(new URL(request.url));
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const record = getConversionRunLedgerRepository().getById(id, workspaceId);
    if (!record) throw new ConversionRunNotFoundError(id);
    return NextResponse.json(record);
  } catch (error) {
    return apiError(error);
  }
}
