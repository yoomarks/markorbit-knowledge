import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
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
    const policyScopes = getSourceIntelligenceReviewService().policyScopes(
      sourceIdsValue(url.searchParams.get("sourceIds")),
    );
    return NextResponse.json({ policyScopes });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    requireV2(body.protocolVersion);
    if (typeof body.enabled !== "boolean") {
      throw new RegistryValidationError("enabled must be a boolean");
    }
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
      actor: requiredString(body.actor, "actor"),
      expectedUpdatedAt: nullableString(body.expectedUpdatedAt, "expectedUpdatedAt"),
    });
    return NextResponse.json({ cohort });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    requireV2(body.protocolVersion);
    if (body.action !== "ADDED" && body.action !== "REMOVED") {
      throw new RegistryValidationError("action must be ADDED or REMOVED");
    }
    if (typeof body.expectedPresent !== "boolean") {
      throw new RegistryValidationError("expectedPresent must be a boolean");
    }
    const membership = getSourceIntelligenceReviewService().changePolicyCohortMembership({
      cohortId: requiredString(body.cohortId, "cohortId"),
      sourceId: requiredString(body.sourceId, "sourceId"),
      action: body.action,
      actor: requiredString(body.actor, "actor"),
      expectedPresent: body.expectedPresent,
    });
    return NextResponse.json({ membership });
  } catch (error) {
    return apiError(error);
  }
}
