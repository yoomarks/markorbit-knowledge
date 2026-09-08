import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { getKnowledgePlatformAdministrationOwnerView } from "@/server/control-plane-platform-administration-owner";
import { authenticateControlPlanePlatformOwnerReadRequest } from "@/server/control-plane-platform-owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    authenticateControlPlanePlatformOwnerReadRequest(request);
    return NextResponse.json(getKnowledgePlatformAdministrationOwnerView());
  } catch (error) {
    return apiError(error);
  }
}
