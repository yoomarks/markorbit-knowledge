import { NextResponse } from "next/server";
import type { ExpertSourceRetrievalRequestV1 } from "@markorbit/contracts";
import { apiError } from "@/server/api-errors";
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
    const { searchParams } = new URL(request.url);
    const input: ExpertSourceRetrievalRequestV1 = {
      ...(text(searchParams, "jurisdiction") !== undefined
        ? { jurisdiction: text(searchParams, "jurisdiction") }
        : {}),
      ...(text(searchParams, "topic") !== undefined ? { topic: text(searchParams, "topic") } : {}),
      ...(text(searchParams, "expertRef") !== undefined
        ? { expertRef: text(searchParams, "expertRef") }
        : {}),
      ...(text(searchParams, "organizationRef") !== undefined
        ? { organizationRef: text(searchParams, "organizationRef") }
        : {}),
      ...(text(searchParams, "receivedFrom") !== undefined
        ? { receivedFrom: text(searchParams, "receivedFrom") }
        : {}),
      ...(text(searchParams, "receivedTo") !== undefined
        ? { receivedTo: text(searchParams, "receivedTo") }
        : {}),
      ...(text(searchParams, "relatedSourceRef") !== undefined
        ? { relatedSourceRef: text(searchParams, "relatedSourceRef") }
        : {}),
      ...(text(searchParams, "relatedCaseRef") !== undefined
        ? { relatedCaseRef: text(searchParams, "relatedCaseRef") }
        : {}),
      ...(integer(searchParams, "limit") !== undefined ? { limit: integer(searchParams, "limit") } : {}),
      ...(integer(searchParams, "offset") !== undefined
        ? { offset: integer(searchParams, "offset") }
        : {}),
    };
    return NextResponse.json(getExpertSourceRetrievalRepository().search(input));
  } catch (error) {
    return apiError(error);
  }
}
