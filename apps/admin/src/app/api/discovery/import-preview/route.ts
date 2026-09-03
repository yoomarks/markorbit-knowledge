import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { parseDiscoveryImport } from "@/server/discovery-import-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await resolveAdminBrowserApiReadAccess(request, DEFAULT_WORKSPACE.id);
    const form = await request.formData();
    const value = form.get("file");
    if (!(value instanceof File)) {
      throw new RegistryValidationError("file is required");
    }
    const preview = parseDiscoveryImport({
      fileName: value.name,
      content: new Uint8Array(await value.arrayBuffer()),
    });
    return NextResponse.json(preview, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}
