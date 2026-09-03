import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteRetrievalRemediationExecutionRepository } from "@markorbit/persistence/retrieval-remediation-execution";
import type { RetrievalQualityRemediationActionCode } from "@markorbit/persistence/retrieval-quality-remediation";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  resolveOperatorServiceMutationAccess,
  resolveOperatorServiceReadAccess,
} from "@/server/operator-service-api-access";
import { getRegistryDatabase } from "@/server/source-registry";

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

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = search.get("workspaceId")?.trim();
    const principal = resolveOperatorServiceReadAccess(request, assertedWorkspaceId);
    const limitRaw = search.get("limit")?.trim();
    let limit = 50;
    if (limitRaw) {
      limit = Number(limitRaw);
      if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new RegistryValidationError("limit query parameter must be a positive integer");
      }
    }
    const repository = new SqliteRetrievalRemediationExecutionRepository(getRegistryDatabase());
    return NextResponse.json(repository.list(principal.workspaceId, limit));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const assertedWorkspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId.trim() || undefined : undefined;
    const principal = resolveOperatorServiceMutationAccess(request, assertedWorkspaceId);
    const repository = new SqliteRetrievalRemediationExecutionRepository(getRegistryDatabase());
    return NextResponse.json(
      repository.execute({
        workspaceId: principal.workspaceId,
        stagingDocumentId: typeof body.stagingDocumentId === "string" ? body.stagingDocumentId : "",
        actionCode: actionCode(body.actionCode),
        actorId: principal.userId,
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
        approved: body.approved === true,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
