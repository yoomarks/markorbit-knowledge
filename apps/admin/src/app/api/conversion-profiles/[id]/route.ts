import { NextResponse } from "next/server";
import {
  ConversionProfileNotFoundError,
  type UpdateConversionProfileInput,
} from "@markorbit/persistence/converters";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConverterRegistryRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const profile = getConverterRegistryRepository().getProfile(id);
    if (!profile) throw new ConversionProfileNotFoundError(id);
    return NextResponse.json({ profile });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = requireRecord(await readJson(request));
    return NextResponse.json({
      profile: getConverterRegistryRepository().updateProfile(
        id,
        body as UpdateConversionProfileInput,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
