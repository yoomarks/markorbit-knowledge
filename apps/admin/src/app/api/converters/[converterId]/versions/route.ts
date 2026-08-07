import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { getConverterRegistryRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ converterId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { converterId } = await context.params;
    return NextResponse.json({ items: getConverterRegistryRepository().listVersions(converterId) });
  } catch (error) {
    return apiError(error);
  }
}
