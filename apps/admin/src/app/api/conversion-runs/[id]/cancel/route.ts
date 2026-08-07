import { NextResponse } from "next/server";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { parseCancelRequest } from "@/server/conversion-run-api-validation";
import { getConversionRunLedgerRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = parseCancelRequest(requireRecord(await readJson(request)));
    const record = getConversionRunLedgerRepository().cancel(id, input);
    return NextResponse.json(record);
  } catch (error) {
    return apiError(error);
  }
}
