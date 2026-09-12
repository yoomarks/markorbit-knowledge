import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { getCaseEvidenceInventoryView } from "@/server/case-evidence-inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveAdminBrowserApiReadAccess(request);
    return NextResponse.json(getCaseEvidenceInventoryView(access.workspaceId));
  } catch (error) {
    return apiError(error);
  }
}
