import { NextResponse } from "next/server";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getProducerCoreReliabilityScorecard } from "@/server/producer-core-reliability-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;

function windowDays(value: string | null): number {
  if (!value) return DEFAULT_WINDOW_DAYS;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_WINDOW_DAYS) {
    throw new TypeError(`windowDays must be an integer between 1 and ${MAX_WINDOW_DAYS}`);
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId = url.searchParams.get("workspaceId")?.trim() || undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const days = windowDays(url.searchParams.get("windowDays"));
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const bindingId = url.searchParams.get("bindingId")?.trim() || undefined;

    return NextResponse.json(
      getProducerCoreReliabilityScorecard({
        workspaceId,
        window: { from: from.toISOString(), to: to.toISOString() },
        ...(bindingId ? { bindingId } : {}),
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
