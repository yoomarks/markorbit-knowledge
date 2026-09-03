import type {
  SourceIntelligencePolicyAuditAction,
  SourceIntelligencePolicyAuditScope,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  serializeSourceIntelligencePolicyAuditExportCsvV2,
  serializeSourceIntelligencePolicyAuditExportJsonV2,
} from "@markorbit/worker-runtime";
import { apiError } from "@/server/api-errors";
import { resolveSourceIntelligenceBrowserReadAccess } from "@/server/source-intelligence-browser-access";
import { getSourceIntelligenceReviewService } from "@/server/source-intelligence-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireV2(value: unknown): void {
  if (value !== "2.0") {
    throw new RegistryValidationError(
      "protocolVersion=2.0 is required for D2.16 policy audit export",
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    requireV2(url.searchParams.get("protocolVersion"));
    const format = (url.searchParams.get("format") ?? "json").toLowerCase();
    if (format !== "json" && format !== "csv") {
      throw new RegistryValidationError("format must be json or csv");
    }
    const sourceIds = csvValues(url.searchParams.get("sourceIds"));
    await resolveSourceIntelligenceBrowserReadAccess(request, sourceIds);
    const auditExport = getSourceIntelligenceReviewService().policyAuditExport({
      scopes: csvValues(url.searchParams.get("scopes")) as SourceIntelligencePolicyAuditScope[],
      actions: csvValues(url.searchParams.get("actions")) as SourceIntelligencePolicyAuditAction[],
      actorLabels: csvValues(url.searchParams.get("actorLabels")),
      sourceIds,
      cohortIds: csvValues(url.searchParams.get("cohortIds")),
      occurredFromInclusive: url.searchParams.get("occurredFromInclusive"),
      occurredToExclusive: url.searchParams.get("occurredToExclusive"),
    });
    const isCsv = format === "csv";
    const body = isCsv
      ? serializeSourceIntelligencePolicyAuditExportCsvV2(auditExport)
      : serializeSourceIntelligencePolicyAuditExportJsonV2(auditExport);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": isCsv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="source-intelligence-policy-audit.${format}"`,
        "Cache-Control": "no-store",
        "X-MarkOrbit-Audit-Event-Count": String(auditExport.eventCount),
        "X-MarkOrbit-Audit-Truncated": auditExport.truncated ? "true" : "false",
        "X-MarkOrbit-Audit-Max-Events": String(auditExport.maxEvents),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
