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
      "protocolVersion=2.0 is required for D2.13 manual SLA and escalation",
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

function optionalInteger(value: string | null, field: string): number | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new RegistryValidationError(`${field} must be an integer`);
  return parsed;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value;
}

function nullableTarget(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new RegistryValidationError(`${field} must be an integer or null`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string")
    throw new RegistryValidationError(`${field} must be a string or null`);
  return value;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    requireV2(url.searchParams.get("protocolVersion"));
    const sourceIds = sourceIdsValue(url.searchParams.get("sourceIds"));
    await resolveSourceIntelligenceBrowserReadAccess(request, sourceIds);
    const manualSla = getSourceIntelligenceReviewService().manualSla(
      sourceIds,
      optionalInteger(url.searchParams.get("escalationEventLimit"), "escalationEventLimit"),
    );
    return NextResponse.json({ manualSla });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    requireV2(body.protocolVersion);
    const { principal } = await resolveSourceIntelligenceBrowserMutationAccess(request);
    const policy = getSourceIntelligenceReviewService().updateManualSlaPolicy({
      actor: principal.userId,
      claimTargetHours: nullableTarget(body.claimTargetHours, "claimTargetHours"),
      reviewTargetHours: nullableTarget(body.reviewTargetHours, "reviewTargetHours"),
      expectedUpdatedAt: nullableString(body.expectedUpdatedAt, "expectedUpdatedAt"),
    });
    return NextResponse.json({ policy });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    requireV2(body.protocolVersion);
    if (body.action !== "ESCALATED" && body.action !== "CLEARED") {
      throw new RegistryValidationError("action must be ESCALATED or CLEARED");
    }
    if (typeof body.expectedEscalated !== "boolean") {
      throw new RegistryValidationError("expectedEscalated must be a boolean");
    }
    const sourceId = requiredString(body.sourceId, "sourceId");
    const { principal } = await resolveSourceIntelligenceBrowserMutationAccess(request, [sourceId]);
    const result = getSourceIntelligenceReviewService().changeManualEscalation({
      sourceId,
      observationKey: requiredString(body.observationKey, "observationKey"),
      action: body.action,
      actor: principal.userId,
      ...(typeof body.note === "string" ? { note: body.note } : {}),
      expectedEscalated: body.expectedEscalated,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
