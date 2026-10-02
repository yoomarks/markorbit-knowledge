import { NextResponse } from "next/server";
import { apiError, readJson } from "@/server/api-errors";
import { authenticateWorkspacePrivateCaseEvidenceReadRequest } from "@/server/workspace-private-case-evidence-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const result = await authenticateWorkspacePrivateCaseEvidenceReadRequest(
      request,
      await readJson(request),
    );
    return NextResponse.json(result, {
      status: 200,
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("cache-control", "private, no-store");
    return response;
  }
}
