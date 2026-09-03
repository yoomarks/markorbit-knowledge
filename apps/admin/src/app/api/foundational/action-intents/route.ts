import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { FOUNDATIONAL_ACTION_INTENT_PROTOCOL_VERSION } from "@markorbit/worker-runtime/foundational-action-intent";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  createFoundationalActionIntent,
  listFoundationalActionIntents,
} from "@/server/foundational-action-intents";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value.trim();
}

function optionalLimit(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 100) {
    throw new RegistryValidationError("limit must be an integer between 1 and 100");
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = search.get("workspaceId")?.trim() || undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const items = listFoundationalActionIntents(getRegistryDatabase(), {
      workspaceId,
      jurisdiction: search.get("jurisdiction")?.trim() || undefined,
      targetId: search.get("targetId")?.trim() || undefined,
      status: search.get("status")?.trim() || undefined,
      limit: optionalLimit(search.get("limit")),
    });
    return NextResponse.json({
      protocolVersion: FOUNDATIONAL_ACTION_INTENT_PROTOCOL_VERSION,
      objectType: "FOUNDATIONAL_ACTION_INTENT_LIST",
      workspaceId,
      executionPolicy: "INTENT_ONLY_NO_EXECUTION",
      collectionAuthorization: "NONE",
      items,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const assertedWorkspaceId = requiredString(payload.workspaceId, "workspaceId");
    const { principal, workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      assertedWorkspaceId,
    );
    const topK = payload.topK === undefined ? undefined : Number(payload.topK);
    if (topK !== undefined && (!Number.isSafeInteger(topK) || topK <= 0 || topK > 20)) {
      throw new RegistryValidationError("topK must be an integer between 1 and 20");
    }
    const intent = createFoundationalActionIntent(getRegistryDatabase(), {
      workspaceId,
      jurisdiction: requiredString(payload.jurisdiction, "jurisdiction"),
      targetId: requiredString(payload.targetId, "targetId"),
      actionCode: requiredString(payload.actionCode, "actionCode"),
      requestedByActorId: principal.userId,
      idempotencyKey: requiredString(payload.idempotencyKey, "idempotencyKey"),
      topK,
    });
    return NextResponse.json(intent, { status: intent.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
