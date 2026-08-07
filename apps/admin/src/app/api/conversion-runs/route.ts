import { NextResponse } from "next/server";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { parseDispatchRequest, parseListFilters } from "@/server/conversion-run-api-validation";
import { getConversionRunLedgerRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const filters = parseListFilters(new URL(request.url));
    return NextResponse.json(getConversionRunLedgerRepository().list(filters));
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = parseDispatchRequest(requireRecord(await readJson(request)));
    const result = getConversionRunLedgerRepository().dispatchManual(input);
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
