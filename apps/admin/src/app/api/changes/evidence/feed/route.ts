import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import {
  buildDocumentChangeEvidenceFeed,
  parseDocumentChangeEvidenceFeedRequest,
} from "@/server/document-change-evidence-feed-service";
import { resolveOperatorServiceReadAccess } from "@/server/operator-service-api-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = parseDocumentChangeEvidenceFeedRequest(request.url);
    const principal = resolveOperatorServiceReadAccess(request, query.workspaceId);
    return NextResponse.json(
      buildDocumentChangeEvidenceFeed(getRegistryDatabase(), {
        ...query,
        workspaceId: principal.workspaceId,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
