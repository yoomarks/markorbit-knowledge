import { NextResponse } from "next/server";
import type { SourceCandidateStatus } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getDiscoveryWorkflowService } from "@/server/discovery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANDIDATE_STATUSES = new Set<SourceCandidateStatus>([
  "DISCOVERED",
  "REVIEWED",
  "ACCEPTED",
  "REJECTED",
]);

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new RegistryValidationError(`${field} must be an integer`);
  }
  return value;
}

function optionalQueryInteger(value: string | null, field: string): number | undefined {
  if (value === null || value === "") return undefined;
  if (!/^-?\d+$/.test(value)) {
    throw new RegistryValidationError(`${field} must be an integer`);
  }
  return Number(value);
}

function queryCandidateStatuses(params: URLSearchParams): SourceCandidateStatus[] | undefined {
  const values = params
    .getAll("candidateStatus")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (values.length === 0) return undefined;
  const unique = [...new Set(values)];
  for (const value of unique) {
    if (!CANDIDATE_STATUSES.has(value as SourceCandidateStatus)) {
      throw new RegistryValidationError(`candidateStatus contains unsupported value ${value}`);
    }
  }
  return unique as SourceCandidateStatus[];
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

export async function GET(request: Request) {
  try {
    await resolveAdminBrowserApiReadAccess(request, DEFAULT_WORKSPACE.id);
    const params = new URL(request.url).searchParams;
    return NextResponse.json(
      getDiscoveryWorkflowService().overview({
        candidateStatuses: queryCandidateStatuses(params),
        candidateLimit: optionalQueryInteger(params.get("candidateLimit"), "candidateLimit"),
        candidateOffset: optionalQueryInteger(params.get("candidateOffset"), "candidateOffset"),
        candidateQuery: params.get("candidateQuery")?.trim() || undefined,
        candidateBatchId: params.get("candidateBatchId")?.trim() || undefined,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await resolveAdminBrowserApiMutationAccess(request, DEFAULT_WORKSPACE.id);
    const body = requireRecord(await readJson(request));
    if (typeof body.locator !== "string") {
      throw new RegistryValidationError("locator is required");
    }

    const result = await getDiscoveryWorkflowService().start({
      locator: body.locator,
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
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
