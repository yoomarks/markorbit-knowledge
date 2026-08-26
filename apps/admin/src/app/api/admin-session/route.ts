import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { resolveAdminBrowserSession } from "@/server/admin-browser-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await resolveAdminBrowserSession(request));
  } catch (error) {
    return apiError(error);
  }
}
