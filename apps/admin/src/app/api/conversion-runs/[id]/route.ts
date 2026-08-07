import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { requireWorkspaceQuery } from "@/server/conversion-run-api-validation";
import { getConversionRunLedgerRepository } from "@/server/source-registry";
import { ConversionRunNotFoundError } from "@markorbit/persistence/conversion-runs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const workspaceId = requireWorkspaceQuery(new URL(request.url));
    const record = getConversionRunLedgerRepository().getById(id, workspaceId);
    if (!record) throw new ConversionRunNotFoundError(id);
    return NextResponse.json(record);
  } catch (error) {
    return apiError(error);
  }
}
