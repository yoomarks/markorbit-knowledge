import { NextResponse } from "next/server";
import type {
  SourceIntelligencePolicyAuditAction,
  SourceIntelligencePolicyAuditScope,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { resolveSourceIntelligenceBrowserReadAccess } from "@/server/source-intelligence-browser-access";
import { getSourceIntelligenceReviewService } from "@/server/source-intelligence-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireV2(value: unknown): void {
  if (value !== "2.0") {
    throw new RegistryValidationError(
      "protocolVersion=2.0 is required for D2.16 policy audit query",
    );
  }
}

function csvValues(value: string | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
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
    const sourceIds = csvValues(url.searchParams.get("sourceIds"));
    await resolveSourceIntelligenceBrowserReadAccess(request, sourceIds);
    const policyAuditQuery = getSourceIntelligenceReviewService().policyAuditQuery({
      scopes: csvValues(url.searchParams.get("scopes")) as SourceIntelligencePolicyAuditScope[],
      actions: csvValues(url.searchParams.get("actions")) as SourceIntelligencePolicyAuditAction[],
      actorLabels: csvValues(url.searchParams.get("actorLabels")),
      sourceIds,
      cohortIds: csvValues(url.searchParams.get("cohortIds")),
      occurredFromInclusive: url.searchParams.get("occurredFromInclusive"),
      occurredToExclusive: url.searchParams.get("occurredToExclusive"),
      pageSize: optionalInteger(url.searchParams.get("pageSize"), "pageSize"),
      cursor: url.searchParams.get("cursor"),
    });
    return NextResponse.json({ policyAuditQuery });
  } catch (error) {
    return apiError(error);
  }
}
