import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import type { RetrievalQualityRemediationActionCode } from "@markorbit/persistence/retrieval-quality-remediation";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  executeFoundationalRetrievalQualityRemediation,
  listFoundationalRetrievalQualityRemediation,
} from "@/server/foundational-retrieval-quality-remediation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTION_CODES = new Set<RetrievalQualityRemediationActionCode>([
  "RESTORE_PROVENANCE_EVIDENCE",
  "RECONCILE_CURRENT_VERSION",
  "REBUILD_RETRIEVAL_INDEX",
  "REVIEW_DUPLICATE_CHUNKING",
]);

function actionCode(value: unknown): RetrievalQualityRemediationActionCode {
  if (
    typeof value !== "string" ||
    !ACTION_CODES.has(value as RetrievalQualityRemediationActionCode)
  ) {
    throw new RegistryValidationError("actionCode is invalid");
  }
  return value as RetrievalQualityRemediationActionCode;
}

function queryScope(request: Request) {
  const search = new URL(request.url).searchParams;
  const workspaceId = search.get("workspaceId")?.trim() ?? "";
  const jurisdiction = search.get("jurisdiction")?.trim() ?? "";
  const targetId = search.get("targetId")?.trim() ?? "";
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  if (!jurisdiction) throw new RegistryValidationError("jurisdiction is required");
  if (!targetId) throw new RegistryValidationError("targetId is required");
  return { workspaceId, jurisdiction, targetId };
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(listFoundationalRetrievalQualityRemediation(queryScope(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const scope = queryScope(request);
    const body = requireRecord(await readJson(request));
    if (body.approved !== true) {
      throw new RegistryValidationError("approved=true is required for M17 remediation execution");
    }
    return NextResponse.json(
      executeFoundationalRetrievalQualityRemediation({
        ...scope,
        stagingDocumentId:
          typeof body.stagingDocumentId === "string" ? body.stagingDocumentId : "",
        actionCode: actionCode(body.actionCode),
        actorId: typeof body.actorId === "string" ? body.actorId : "",
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
        approved: true,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
