import { NextResponse } from "next/server";
import type { ExpertSourceRetrievalRequestV1 } from "@markorbit/contracts";
import { apiError } from "@/server/api-errors";
import {
  authenticateExpertReadRequest,
  listExpertTaskIdsForWorkspace,
} from "@/server/expert-api-access";
import { getExpertSourceRetrievalRepository } from "@/server/expert-source-retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(searchParams: URLSearchParams, name: string): string | undefined {
  const value = searchParams.get(name);
  return value === null ? undefined : value;
}

function integer(searchParams: URLSearchParams, name: string): number | undefined {
  const value = searchParams.get(name);
  if (value === null) return undefined;
  return Number(value);
}

export async function GET(request: Request) {
  try {
    const principal = authenticateExpertReadRequest(request);
    const { searchParams } = new URL(request.url);
    const jurisdiction = text(searchParams, "jurisdiction");
    const topic = text(searchParams, "topic");
    const expertRef = text(searchParams, "expertRef");
    const organizationRef = text(searchParams, "organizationRef");
    const receivedFrom = text(searchParams, "receivedFrom");
    const receivedTo = text(searchParams, "receivedTo");
    const relatedSourceRef = text(searchParams, "relatedSourceRef");
    const relatedCaseRef = text(searchParams, "relatedCaseRef");
    const limit = integer(searchParams, "limit");
    const offset = integer(searchParams, "offset");

    const input: ExpertSourceRetrievalRequestV1 = {
      ...(jurisdiction !== undefined ? { jurisdiction } : {}),
      ...(topic !== undefined ? { topic } : {}),
      ...(expertRef !== undefined ? { expertRef } : {}),
      ...(organizationRef !== undefined ? { organizationRef } : {}),
      ...(receivedFrom !== undefined ? { receivedFrom } : {}),
      ...(receivedTo !== undefined ? { receivedTo } : {}),
      ...(relatedSourceRef !== undefined ? { relatedSourceRef } : {}),
      ...(relatedCaseRef !== undefined ? { relatedCaseRef } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    };
    const taskIds = listExpertTaskIdsForWorkspace(principal.workspaceId);
    return NextResponse.json(getExpertSourceRetrievalRepository().search(input, { taskIds }));
  } catch (error) {
    return apiError(error);
  }
}
