import { NextResponse } from "next/server";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getConverterRegistryRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ converterId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    await resolveAdminBrowserApiReadAccess(request);
    const { converterId } = await context.params;
    return NextResponse.json({ items: getConverterRegistryRepository().listVersions(converterId) });
  } catch (error) {
    return apiError(error);
  }
}
