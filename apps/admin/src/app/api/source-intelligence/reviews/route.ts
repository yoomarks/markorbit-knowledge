import { NextResponse } from "next/server";
import type { SourceIntelligenceObservationReviewStatus } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  resolveSourceIntelligenceBrowserMutationAccess,
  resolveSourceIntelligenceBrowserReadAccess,
} from "@/server/source-intelligence-browser-access";
import { getSourceIntelligenceReviewService } from "@/server/source-intelligence-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_STATUSES = new Set<SourceIntelligenceObservationReviewStatus>([
  "PENDING",
  "ACKNOWLEDGED",
  "IGNORED",
]);

function requireV2(value: unknown): void {
  if (value !== "2.0") {
    throw new RegistryValidationError("protocolVersion=2.0 is required for the D2.9 review queue");
  }
}

function sourceIdsValue(value: string | null): string[] {
  if (!value?.trim()) throw new RegistryValidationError("sourceIds is required");
  return value
    .split(",")
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    requireV2(url.searchParams.get("protocolVersion"));
    const sourceIds = sourceIdsValue(url.searchParams.get("sourceIds"));
    await resolveSourceIntelligenceBrowserReadAccess(request, sourceIds);
    const queue = getSourceIntelligenceReviewService().queue(sourceIds);
    return NextResponse.json({ queue });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    requireV2(body.protocolVersion);
    const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
    const observationKey =
      typeof body.observationKey === "string" ? body.observationKey.trim() : "";
    const status = body.status as SourceIntelligenceObservationReviewStatus;
    if (!sourceId) throw new RegistryValidationError("sourceId is required");
    if (!observationKey) throw new RegistryValidationError("observationKey is required");
    if (!REVIEW_STATUSES.has(status)) {
      throw new RegistryValidationError("status must be PENDING, ACKNOWLEDGED, or IGNORED");
    }
    if (body.note !== undefined && typeof body.note !== "string") {
      throw new RegistryValidationError("note must be a string");
    }

    const { principal } = await resolveSourceIntelligenceBrowserMutationAccess(request, [sourceId]);
    const result = getSourceIntelligenceReviewService().review({
      sourceId,
      observationKey,
      status,
      ...(typeof body.note === "string" ? { note: body.note } : {}),
      reviewer: principal.userId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
