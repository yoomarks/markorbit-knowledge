import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import {
  buildDocumentChangeEvidenceFeed,
  parseDocumentChangeEvidenceFeedRequest,
} from "@/server/document-change-evidence-feed-service";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(
      buildDocumentChangeEvidenceFeed(
        getRegistryDatabase(),
        parseDocumentChangeEvidenceFeedRequest(request.url),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
