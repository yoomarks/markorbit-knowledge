import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getCoverageAnalysisCapabilityService } from "@/server/coverage-analysis-capability-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new RegistryValidationError(`${field} must be a string`);
  return value.trim() || undefined;
}

function requiredString(value: unknown, field: string): string {
  const normalized = optionalString(value, field);
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

export async function GET(request: Request) {
  try {
    await resolveAdminBrowserApiReadAccess(request);
    return NextResponse.json(getCoverageAnalysisCapabilityService().status());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const assertedWorkspaceId = optionalString(body.workspaceId, "workspaceId");
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      assertedWorkspaceId,
    );
    const result = await getCoverageAnalysisCapabilityService().analyze({
      workspaceId,
      jurisdiction: requiredString(body.jurisdiction, "jurisdiction"),
      locale: optionalString(body.locale, "locale"),
      objective: optionalString(body.objective, "objective"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
