import { NextResponse } from "next/server";
import { RegistryNotFoundError, RegistryValidationError } from "@markorbit/persistence";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getDiscoveryWorkflowService } from "@/server/discovery-service";
import { getSourceDiscoveryRepository, getSourceRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new RegistryValidationError(`${field} must be an integer`);
  }
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "boolean") {
    throw new RegistryValidationError(`${field} must be a boolean`);
  }
  return value;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new RegistryValidationError(`${field} must be an array of strings`);
  }
  return value;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const source = getSourceRepository().getById(id);
    if (!source) throw new RegistryNotFoundError(id);
    const { principal } = await resolveAdminBrowserApiMutationAccess(request, source.workspaceId);
    assertAdminBrowserResourceWorkspace(principal, source.workspaceId);

    const body = requireRecord(await readJson(request));
    const result = await getDiscoveryWorkflowService().expandSource(id, {
      maxDepth: optionalInteger(body.maxDepth, "maxDepth"),
      maxCandidates: optionalInteger(body.maxCandidates, "maxCandidates"),
      maxFetches: optionalInteger(body.maxFetches, "maxFetches"),
      discoverExternalLinks: optionalBoolean(body.discoverExternalLinks, "discoverExternalLinks"),
      maxExternalCandidates: optionalInteger(body.maxExternalCandidates, "maxExternalCandidates"),
      maxExpansionGeneration: optionalInteger(
        body.maxExpansionGeneration,
        "maxExpansionGeneration",
      ),
      deniedUrlPatterns: optionalStringArray(body.deniedUrlPatterns, "deniedUrlPatterns"),
    });
    const observationSummary = getSourceDiscoveryRepository().candidateObservationSummary(
      result.batch.batch.batchId,
    );
    return NextResponse.json({ ...result, observationSummary }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
