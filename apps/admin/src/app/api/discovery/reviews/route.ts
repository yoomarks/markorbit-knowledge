import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiMutationAccess } from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getDiscoveryCollectionService } from "@/server/discovery-collection-service";
import { reviewDiscoveryCandidatesBatch } from "@/server/discovery-review-batch-service";
import { getDiscoveryWorkflowService } from "@/server/discovery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function candidateIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new RegistryValidationError("candidateIds must contain 1 to 100 candidate IDs");
  }
  const ids = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new RegistryValidationError("candidateIds must contain non-empty strings");
    }
    return item.trim();
  });
  return [...new Set(ids)];
}

export async function POST(request: Request) {
  try {
    const { principal } = await resolveAdminBrowserApiMutationAccess(request, DEFAULT_WORKSPACE.id);
    const body = requireRecord(await readJson(request));
    const ids = candidateIds(body.candidateIds);
    if (body.decision !== "ACCEPTED" && body.decision !== "REJECTED") {
      throw new RegistryValidationError("decision must be ACCEPTED or REJECTED");
    }
    if (body.note !== undefined && typeof body.note !== "string") {
      throw new RegistryValidationError("note must be a string");
    }
    if (body.startCollection !== undefined && typeof body.startCollection !== "boolean") {
      throw new RegistryValidationError("startCollection must be a boolean");
    }

    const result = reviewDiscoveryCandidatesBatch(
      {
        candidateIds: ids,
        decision: body.decision,
        reviewer: principal.userId,
        note: typeof body.note === "string" ? body.note : undefined,
        startCollection: body.decision === "ACCEPTED" && body.startCollection !== false,
      },
      {
        workflow: getDiscoveryWorkflowService(),
        collection: getDiscoveryCollectionService(),
      },
    );

    return NextResponse.json(result, { status: result.summary.failed > 0 ? 207 : 200 });
  } catch (error) {
    return apiError(error);
  }
}
