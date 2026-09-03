import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteFoundationalActionIntentRepository } from "@markorbit/persistence/foundational-action-intents";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  executeApprovedFoundationalCollectionIntent,
  getFoundationalActionExecutionByIntent,
} from "@/server/foundational-action-executions";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value.trim();
}

export async function GET(request: Request, context: { params: Promise<{ intentId: string }> }) {
  try {
    const { intentId } = await context.params;
    const database = getRegistryDatabase();
    const intent = new SqliteFoundationalActionIntentRepository(database).getById(intentId);
    const { principal } = await resolveAdminBrowserApiReadAccess(request, intent?.workspaceId);
    if (intent) assertAdminBrowserResourceWorkspace(principal, intent.workspaceId);
    const execution = getFoundationalActionExecutionByIntent(database, intentId);
    if (!execution) {
      return NextResponse.json({ execution: null });
    }
    return NextResponse.json({ execution });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ intentId: string }> }) {
  try {
    const { intentId } = await context.params;
    const database = getRegistryDatabase();
    const intent = new SqliteFoundationalActionIntentRepository(database).getById(intentId);
    const { principal } = await resolveAdminBrowserApiMutationAccess(request, intent?.workspaceId);
    if (intent) assertAdminBrowserResourceWorkspace(principal, intent.workspaceId);
    const payload = (await request.json()) as Record<string, unknown>;
    const execution = executeApprovedFoundationalCollectionIntent(database, {
      intentId,
      executedByActorId: principal.userId,
      idempotencyKey: requiredString(payload.idempotencyKey, "idempotencyKey"),
      execute: payload.execute === true,
    });
    return NextResponse.json(execution, { status: execution.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
