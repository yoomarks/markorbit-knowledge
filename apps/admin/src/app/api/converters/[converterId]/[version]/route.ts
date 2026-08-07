import { NextResponse } from "next/server";
import { ConverterNotFoundError } from "@markorbit/persistence/converters";
import { apiError } from "@/server/api-errors";
import { getConverterRegistryRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ converterId: string; version: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { converterId, version } = await context.params;
    const record = getConverterRegistryRepository().getManifest(converterId, version);
    if (!record) throw new ConverterNotFoundError(converterId, version);
    return NextResponse.json({ record });
  } catch (error) {
    return apiError(error);
  }
}
