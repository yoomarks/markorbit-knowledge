import { NextResponse } from "next/server";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { parseDispatchRequest, parseListFilters } from "@/server/conversion-run-api-validation";
import { getConversionRunLedgerRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const filters = parseListFilters(new URL(request.url));
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, filters.workspaceId);
    return NextResponse.json(getConversionRunLedgerRepository().list({ ...filters, workspaceId }));
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = parseDispatchRequest(requireRecord(await readJson(request)));
    const { principal, workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      input.workspaceId,
    );
    const result = getConversionRunLedgerRepository().dispatchManual({
      ...input,
      workspaceId,
      actor: { type: "ADMIN", id: principal.userId },
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
