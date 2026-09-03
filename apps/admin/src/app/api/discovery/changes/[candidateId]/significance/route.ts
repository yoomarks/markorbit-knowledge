import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getChangeSignificanceCapabilityService } from "@/server/change-significance-capability-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ candidateId: string }> };

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new RegistryValidationError(`${field} must be a string`);
  return value.trim() || undefined;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await context.params;
    await resolveAdminBrowserApiReadAccess(request, DEFAULT_WORKSPACE.id);
    return NextResponse.json(getChangeSignificanceCapabilityService().status());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { candidateId } = await context.params;
    await resolveAdminBrowserApiMutationAccess(request, DEFAULT_WORKSPACE.id);
    const body = requireRecord(await readJson(request));
    const result = await getChangeSignificanceCapabilityService().assess({
      candidateId,
      locale: optionalString(body.locale, "locale"),
      objective: optionalString(body.objective, "objective"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
