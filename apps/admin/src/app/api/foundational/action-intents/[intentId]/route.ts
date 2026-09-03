import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteFoundationalActionIntentRepository } from "@markorbit/persistence/foundational-action-intents";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  approveFoundationalActionIntent,
  cancelFoundationalActionIntent,
} from "@/server/foundational-action-intents";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ intentId: string }> }) {
  try {
    const { intentId } = await context.params;
    const database = getRegistryDatabase();
    const stored = new SqliteFoundationalActionIntentRepository(database).getById(intentId);
    const { principal } = await resolveAdminBrowserApiMutationAccess(
      request,
      stored?.workspaceId,
    );
    if (stored) assertAdminBrowserResourceWorkspace(principal, stored.workspaceId);

    const payload = (await request.json()) as Record<string, unknown>;
    const operation = typeof payload.operation === "string" ? payload.operation.trim() : "";
    if (operation === "APPROVE") {
      return NextResponse.json(approveFoundationalActionIntent(database, intentId, principal.userId));
    }
    if (operation === "CANCEL") {
      return NextResponse.json(cancelFoundationalActionIntent(database, intentId, principal.userId));
    }
    throw new RegistryValidationError("operation must be APPROVE or CANCEL");
  } catch (error) {
    return apiError(error);
  }
}
