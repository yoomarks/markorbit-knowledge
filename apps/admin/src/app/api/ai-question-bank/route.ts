import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { getAiQuestionBankView } from "@/server/ai-question-bank";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await resolveAdminBrowserApiReadAccess(request);
    return NextResponse.json(getAiQuestionBankView());
  } catch (error) {
    return apiError(error);
  }
}
