import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import {
  listFoundationalVerifiedCanonicalReindex,
  reindexFoundationalVerifiedCanonical,
} from "@/server/foundational-verified-canonical-reindex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function queryScope(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim() ?? "";
  const jurisdiction = url.searchParams.get("jurisdiction")?.trim() ?? "";
  const targetId = url.searchParams.get("targetId")?.trim() ?? "";
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  if (!jurisdiction) throw new RegistryValidationError("jurisdiction is required");
  if (!targetId) throw new RegistryValidationError("targetId is required");
  return { workspaceId, jurisdiction, targetId };
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(listFoundationalVerifiedCanonicalReindex(queryScope(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const scope = queryScope(request);
    const body = (await request.json()) as { stagingDocumentId?: unknown; execute?: unknown };
    if (typeof body.stagingDocumentId !== "string" || !body.stagingDocumentId.trim()) {
      throw new RegistryValidationError("stagingDocumentId is required");
    }
    if (body.execute !== true) {
      throw new RegistryValidationError("execute=true is required for verified canonical reindex");
    }
    return NextResponse.json(
      reindexFoundationalVerifiedCanonical({
        ...scope,
        stagingDocumentId: body.stagingDocumentId,
        execute: true,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
