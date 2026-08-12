import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getDiscoveryWorkflowService } from "@/server/discovery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET() {
  try {
    return NextResponse.json(getDiscoveryWorkflowService().overview());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
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
