import { NextResponse } from "next/server";
import { RegistryNotFoundError, RegistryValidationError } from "@markorbit/persistence";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getSourceRecommendationCapabilityService } from "@/server/source-recommendation-capability-service";
import { getSourceRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new RegistryValidationError(`${field} must be a string`);
  return value.trim() || undefined;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new RegistryValidationError(`${field} must be an integer`);
  }
  return value;
}

function requireSource(id: string) {
  const source = getSourceRepository().getById(id);
  if (!source) throw new RegistryNotFoundError(id);
  return source;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const source = requireSource(id);
    const { principal } = await resolveAdminBrowserApiReadAccess(request, source.workspaceId);
    assertAdminBrowserResourceWorkspace(principal, source.workspaceId);
    return NextResponse.json(getSourceRecommendationCapabilityService().status());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const source = requireSource(id);
    const { principal } = await resolveAdminBrowserApiMutationAccess(request, source.workspaceId);
    assertAdminBrowserResourceWorkspace(principal, source.workspaceId);

    const body = requireRecord(await readJson(request));
    const result = await getSourceRecommendationCapabilityService().recommend({
      sourceId: id,
      locale: optionalString(body.locale, "locale"),
      objective: optionalString(body.objective, "objective"),
      maxResults: optionalInteger(body.maxResults, "maxResults"),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
