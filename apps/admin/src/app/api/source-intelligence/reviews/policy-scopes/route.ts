import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  resolveSourceIntelligenceBrowserMutationAccess,
  resolveSourceIntelligenceBrowserReadAccess,
} from "@/server/source-intelligence-browser-access";
import { getSourceIntelligenceReviewService } from "@/server/source-intelligence-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireV2(value: unknown): void {
  if (value !== "2.0") {
    throw new RegistryValidationError(
      "protocolVersion=2.0 is required for D2.14 policy scopes and cohorts",
    );
  }
}

function sourceIdsValue(value: string | null): string[] {
  if (!value?.trim()) throw new RegistryValidationError("sourceIds is required");
  return value
    .split(",")
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new RegistryValidationError(`${field} must be a string`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new RegistryValidationError(`${field} must be a string or null`);
  }
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new RegistryValidationError(`${field} must be an integer`);
  }
  return value;
}

function nullableTarget(value: unknown, field: string): number | null {
  if (value === null) return null;
  return requiredInteger(value, field);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    requireV2(url.searchParams.get("protocolVersion"));
    const sourceIds = sourceIdsValue(url.searchParams.get("sourceIds"));
    await resolveSourceIntelligenceBrowserReadAccess(request, sourceIds);
    const policyScopes = getSourceIntelligenceReviewService().policyScopes(sourceIds);
    return NextResponse.json({ policyScopes });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    requireV2(body.protocolVersion);
    if (typeof body.enabled !== "boolean") {
      throw new RegistryValidationError("enabled must be a boolean");
    }
    const { principal } = await resolveSourceIntelligenceBrowserMutationAccess(request);
    const cohort = getSourceIntelligenceReviewService().updatePolicyCohort({
      ...(typeof body.cohortId === "string" ? { cohortId: body.cohortId } : {}),
      name: requiredString(body.name, "name"),
      ...(body.description !== undefined
        ? { description: optionalString(body.description, "description") }
        : {}),
      priority: requiredInteger(body.priority, "priority"),
      enabled: body.enabled,
      claimTargetHours: nullableTarget(body.claimTargetHours, "claimTargetHours"),
      reviewTargetHours: nullableTarget(body.reviewTargetHours, "reviewTargetHours"),
      actor: principal.userId,
      expectedUpdatedAt: nullableString(body.expectedUpdatedAt, "expectedUpdatedAt"),
    });
    return NextResponse.json({ cohort });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    requireV2(body.protocolVersion);
    if (body.action !== "ADDED" && body.action !== "REMOVED") {
      throw new RegistryValidationError("action must be ADDED or REMOVED");
    }
    if (typeof body.expectedPresent !== "boolean") {
      throw new RegistryValidationError("expectedPresent must be a boolean");
    }
    const sourceId = requiredString(body.sourceId, "sourceId");
    const { principal } = await resolveSourceIntelligenceBrowserMutationAccess(request, [sourceId]);
    const membership = getSourceIntelligenceReviewService().changePolicyCohortMembership({
      cohortId: requiredString(body.cohortId, "cohortId"),
      sourceId,
      action: body.action,
      actor: principal.userId,
      expectedPresent: body.expectedPresent,
    });
    return NextResponse.json({ membership });
  } catch (error) {
    return apiError(error);
  }
}
