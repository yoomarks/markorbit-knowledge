import { NextResponse } from "next/server";
import type { SourceIntelligenceObservationOwnershipAction } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  resolveSourceIntelligenceBrowserMutationAccess,
  resolveSourceIntelligenceBrowserReadAccess,
} from "@/server/source-intelligence-browser-access";
import { getSourceIntelligenceReviewService } from "@/server/source-intelligence-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNERSHIP_ACTIONS = new Set<SourceIntelligenceObservationOwnershipAction>([
  "CLAIMED",
  "TRANSFERRED",
  "RELEASED",
]);

function requireV2(value: unknown): void {
  if (value !== "2.0") {
    throw new RegistryValidationError(
      "protocolVersion=2.0 is required for the D2.11 ownership queue",
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    requireV2(url.searchParams.get("protocolVersion"));
    const sourceIds = sourceIdsValue(url.searchParams.get("sourceIds"));
    await resolveSourceIntelligenceBrowserReadAccess(request, sourceIds);
    const eventLimit = optionalInteger(
      url.searchParams.get("ownershipEventLimit"),
      "ownershipEventLimit",
    );
    const ownershipQueue = getSourceIntelligenceReviewService().ownershipQueue(
      sourceIds,
      eventLimit,
    );
    return NextResponse.json({ ownershipQueue });
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
    const action = body.action as SourceIntelligenceObservationOwnershipAction;
    if (!sourceId) throw new RegistryValidationError("sourceId is required");
    if (!observationKey) throw new RegistryValidationError("observationKey is required");
    if (!OWNERSHIP_ACTIONS.has(action)) {
      throw new RegistryValidationError("action must be CLAIMED, TRANSFERRED, or RELEASED");
    }
    if (body.owner !== undefined && typeof body.owner !== "string") {
      throw new RegistryValidationError("owner must be a string");
    }
    if (
      !("expectedOwner" in body) ||
      (body.expectedOwner !== null && typeof body.expectedOwner !== "string")
    ) {
      throw new RegistryValidationError("expectedOwner must be supplied as a string or null");
    }

    const { principal } = await resolveSourceIntelligenceBrowserMutationAccess(request, [sourceId]);
    const result = getSourceIntelligenceReviewService().changeOwnership({
      sourceId,
      observationKey,
      action,
      actor: principal.userId,
      ...(typeof body.owner === "string" ? { owner: body.owner } : {}),
      expectedOwner: body.expectedOwner as string | null,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
