import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  listFoundationalVerifiedCanonicalReindex,
  reindexFoundationalVerifiedCanonical,
} from "@/server/foundational-verified-canonical-reindex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function queryScope(request: Request) {
  const url = new URL(request.url);
  const assertedWorkspaceId = url.searchParams.get("workspaceId")?.trim() || undefined;
  const jurisdiction = url.searchParams.get("jurisdiction")?.trim() ?? "";
  const targetId = url.searchParams.get("targetId")?.trim() ?? "";
  if (!jurisdiction) throw new RegistryValidationError("jurisdiction is required");
  if (!targetId) throw new RegistryValidationError("targetId is required");
  return { assertedWorkspaceId, jurisdiction, targetId };
}

export async function GET(request: Request) {
  try {
    const scope = queryScope(request);
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(
      request,
      scope.assertedWorkspaceId,
    );
    return NextResponse.json(
      listFoundationalVerifiedCanonicalReindex({
        workspaceId,
        jurisdiction: scope.jurisdiction,
        targetId: scope.targetId,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const scope = queryScope(request);
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      scope.assertedWorkspaceId,
    );
    const body = (await request.json()) as { stagingDocumentId?: unknown; execute?: unknown };
    if (typeof body.stagingDocumentId !== "string" || !body.stagingDocumentId.trim()) {
      throw new RegistryValidationError("stagingDocumentId is required");
    }
    if (body.execute !== true) {
      throw new RegistryValidationError("execute=true is required for verified canonical reindex");
    }
    return NextResponse.json(
      reindexFoundationalVerifiedCanonical({
        workspaceId,
        jurisdiction: scope.jurisdiction,
        targetId: scope.targetId,
        stagingDocumentId: body.stagingDocumentId,
        execute: true,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
